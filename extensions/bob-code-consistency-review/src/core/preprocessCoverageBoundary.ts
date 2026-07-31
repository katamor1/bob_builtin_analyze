import { createHash } from "node:crypto"
import * as fs from "node:fs/promises"
import { resolveWorkspacePathForKind } from "./fileSystem"
import { normalizeReviewProcessingLimits } from "./limits"
import { preprocessReview, type PreprocessReviewInput } from "./pipeline"
import { createPipelineProcessingBudgetLedger } from "./processingBudgetPipeline"
import {
  failureFromProcessingError,
  outcomeFromProcessingError,
  persistProcessingBudgetReport,
  processingBudgetReportPath
} from "./processingBudgetCoverage"
import type { PreprocessResult } from "./preprocessTypes"

const PREPROCESS_OPERATION_PREFIX = "code-consistency-preprocess"

export async function preprocessReviewWithCoverage(
  input: PreprocessReviewInput
): Promise<PreprocessResult> {
  const limits = normalizeReviewProcessingLimits(input.limits)
  const ledger = createPipelineProcessingBudgetLedger(limits, input.processingBudgetLimits)
  const outDir = resolveWorkspacePathForKind(input.workspaceRoot, input.outDir, "review-package-output")
  const inputSha256 = preValidationInputSha(input, limits)
  const operationId = `${PREPROCESS_OPERATION_PREFIX}:${inputSha256.slice(7, 39)}`

  throwIfBoundaryCancelled(input.abortSignal)

  try {
    return await preprocessReview(input)
  } catch (error) {
    const reportPath = processingBudgetReportPath(outDir)
    if (!(await regularFileExists(reportPath))) {
      try {
        await persistProcessingBudgetReport({
          outDir,
          operationId,
          inputSha256,
          outcome: outcomeFromProcessingError(error),
          ledger,
          issues: [{
            kind: "unprocessed",
            code: "operation_incomplete",
            target: "review_input_validation"
          }],
          failure: failureFromProcessingError(error)
        })
      } catch (reportError) {
        throw new AggregateError(
          [error, reportError],
          "Preprocessing failed before a processing-budget report could be persisted."
        )
      }
    }
    throw error
  }
}

function throwIfBoundaryCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw Object.assign(new Error("Preprocessing was cancelled before destructive cleanup completed."), {
    code: "processing_cancelled",
    kind: "user"
  })
}

function preValidationInputSha(
  input: PreprocessReviewInput,
  limits: ReturnType<typeof normalizeReviewProcessingLimits>
): string {
  const processingBudgetLimits = Object.fromEntries(
    Object.entries(input.processingBudgetLimits ?? {}).sort(([left], [right]) => left.localeCompare(right))
  )
  const payload = JSON.stringify({
    schema_version: "code-consistency-processing-prevalidation-input/v1",
    workspace_root: input.workspaceRoot,
    review_input_path: input.inputPath,
    review_package_path: input.outDir,
    diff_fixture_path: input.diffFixturePath ?? "",
    text_encoding: input.textEncoding ?? "auto",
    limits,
    processing_budget_limits: processingBudgetLimits,
    workflow_run_id: input.workflowRunId ?? ""
  })
  return `sha256:${createHash("sha256").update(payload, "utf8").digest("hex")}`
}

async function regularFileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath)
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("processing budget report path must be a regular file")
    }
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return false
    }
    throw error
  }
}
