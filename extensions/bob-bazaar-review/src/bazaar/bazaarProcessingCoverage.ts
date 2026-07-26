import { createHash } from "node:crypto"
import * as path from "node:path"
import {
  assertProcessingBudgetReportAllowsHandoff,
  createProcessingBudgetReport,
  serializeProcessingBudgetReport,
  type SharedProcessingBudgetReport,
  type SharedProcessingBudgetReportFailure,
  type SharedProcessingBudgetReportIssue
} from "../sharedProcessingBudgetReport"
import {
  DEFAULT_PROCESSING_BUDGET_PROFILE,
  PROCESSING_BUDGET_ABSOLUTE_MAXIMA,
  ProcessingBudgetLedger,
  type SharedProcessingBudgetLedger,
  type SharedProcessingBudgetReservation
} from "../sharedProcessingBudgetRuntime"
import { replaceTextFileAtomically } from "./atomicReplaceFile"
import type { PreparedTarget } from "./reviewTarget"
import { truncateUtf8 } from "./reviewLimits"

export const BAZAAR_REVIEW_LOG_MAX_BYTES = 128 * 1024
export const BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES = DEFAULT_PROCESSING_BUDGET_PROFILE.limits.bob_input_bytes
export const BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES = PROCESSING_BUDGET_ABSOLUTE_MAXIMA.bob_input_bytes
const BAZAAR_REVIEW_TOTAL_OPERATION_MAX_BYTES = 64 * 1024 * 1024
const REPORT_FILE_SUFFIX = ".processing-budget-report.json"

export interface BazaarReviewProcessingIdentity {
  readonly mode: "singleRevision" | "revisionRange" | "workingTreeSinceRevision"
  readonly revision?: string
  readonly baseRevision?: string
  readonly targetRevision?: string
  readonly withProjectRules: boolean
}

export interface BazaarReviewProcessingProduct {
  readonly prepared: PreparedTarget
  readonly packet: string
}

export interface BazaarReviewProcessingObserver {
  recordPreparedTarget(prepared: PreparedTarget): void
}

export interface RunBazaarReviewProcessingOperationInput {
  readonly reportDirectory: string
  readonly repositoryScope?: string
  readonly operation: BazaarReviewProcessingIdentity
  readonly maxDiffBytes: number
  readonly maxAddedFileContentBytes: number
  readonly maxBobInputBytes?: number
  readonly signal?: AbortSignal
  readonly produce: (observer: BazaarReviewProcessingObserver) => Promise<BazaarReviewProcessingProduct>
}

export interface BazaarReviewProcessingResult extends BazaarReviewProcessingProduct {
  readonly reportPath: string
  readonly report: SharedProcessingBudgetReport
}

export class BazaarProcessingCoveragePartialError extends Error {
  readonly code = "processing_coverage_partial" as const
  readonly issues: readonly SharedProcessingBudgetReportIssue[]

  constructor(
    issues: readonly SharedProcessingBudgetReportIssue[],
    readonly reportPath: string
  ) {
    super("Bazaar review processing coverage is partial; Bob handoff is blocked.")
    this.name = "BazaarProcessingCoveragePartialError"
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })))
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export async function runBazaarReviewProcessingOperation(
  input: RunBazaarReviewProcessingOperationInput
): Promise<BazaarReviewProcessingResult> {
  const requestedRepositoryScope = input.repositoryScope === undefined
    ? undefined
    : normalizeRepositoryScope(input.repositoryScope)
  const provisionalRepositoryScope = requestedRepositoryScope ?? "unresolved"
  const maxBobInputBytes = normalizeBobInputBytes(input.maxBobInputBytes)
  let initialInputSha256 = operationInputSha(provisionalRepositoryScope, input.operation, {
    maxDiffBytes: input.maxDiffBytes,
    maxAddedFileContentBytes: input.maxAddedFileContentBytes,
    maxBobInputBytes
  })
  let operationId = `bazaar-review:${initialInputSha256.slice(7, 39)}`
  let reportPath = processingReportPath(input.reportDirectory, initialInputSha256)
  const ledger = reviewLedger(input.maxDiffBytes, input.maxAddedFileContentBytes, maxBobInputBytes)
  const reservations: SharedProcessingBudgetReservation[] = []
  let product: BazaarReviewProcessingProduct | undefined
  let preparedTarget: PreparedTarget | undefined
  let preparedBudget: PreparedTargetBudget | undefined
  let preparedInputSha256: string | undefined
  let preparedObserved = false
  let stage = "before_target_preparation"

  const observer: BazaarReviewProcessingObserver = Object.freeze({
    recordPreparedTarget(prepared: PreparedTarget): void {
      if (preparedObserved) throw new Error("Bazaar prepared target was reported more than once")
      preparedObserved = true
      if (requestedRepositoryScope === undefined) {
        const preparedRepositoryScope = normalizeRepositoryScope(prepared.root)
        initialInputSha256 = operationInputSha(preparedRepositoryScope, input.operation, {
          maxDiffBytes: input.maxDiffBytes,
          maxAddedFileContentBytes: input.maxAddedFileContentBytes,
          maxBobInputBytes
        })
        operationId = `bazaar-review:${initialInputSha256.slice(7, 39)}`
        reportPath = processingReportPath(input.reportDirectory, initialInputSha256)
      }
      preparedTarget = prepared
      preparedInputSha256 = preparedTargetInputSha(initialInputSha256, prepared)
      preparedBudget = commitPreparedTargetBudget(ledger, reservations, prepared, input)
      stage = "packet_construction"
    }
  })

  try {
    throwIfCancelled(input.signal)
    stage = "target_preparation"
    product = await input.produce(observer)
    throwIfCancelled(input.signal)
    if (!preparedObserved) {
      observer.recordPreparedTarget(product.prepared)
    } else if (preparedTargetInputSha(initialInputSha256, product.prepared) !== preparedInputSha256) {
      throw Object.assign(new Error("Bazaar prepared target changed after it was reported"), {
        code: "processing_input_changed"
      })
    }
    stage = "packet_budgeting"

    if (!preparedBudget) {
      throw new Error("Bazaar prepared target budget checkpoint is missing")
    }
    const bobInputReservation = ledger.reserve("bob_input_bytes", Buffer.byteLength(product.packet, "utf8"))
    reservations.push(bobInputReservation)
    bobInputReservation.commit()

    const issues = processingIssues(product.prepared, input, preparedBudget)
    const inputSha256 = productInputSha(initialInputSha256, product)
    const report = createProcessingBudgetReport({
      producer: { id: "bob-bazaar-review", version: "0.3.0" },
      operation_id: operationId,
      input_sha256: inputSha256,
      outcome: "success",
      ledger: ledger.snapshot(),
      issues
    })
    await persistReport(reportPath, report)
    if (issues.length > 0) throw new BazaarProcessingCoveragePartialError(issues, reportPath)
    assertProcessingBudgetReportAllowsHandoff(report, { expected_input_sha256: inputSha256 })
    return Object.freeze({ ...product, reportPath, report })
  } catch (error) {
    if (error instanceof BazaarProcessingCoveragePartialError) throw error
    for (let index = reservations.length - 1; index >= 0; index -= 1) {
      try { reservations[index].release() } catch {}
    }
    const inputSha256 = product === undefined
      ? preparedInputSha256 ?? initialInputSha256
      : productInputSha(initialInputSha256, product)
    try {
      const report = createProcessingBudgetReport({
        producer: { id: "bob-bazaar-review", version: "0.3.0" },
        operation_id: operationId,
        input_sha256: inputSha256,
        outcome: isCancellation(error, input.signal) ? "cancelled" : "failed",
        ledger: ledger.snapshot(),
        issues: Object.freeze([
          ...(preparedTarget && preparedBudget ? processingIssues(preparedTarget, input, preparedBudget) : []),
          Object.freeze({ kind: "unprocessed" as const, code: "operation_incomplete", target: stage })
        ]),
        failure: failureFromError(error, input.signal)
      })
      await persistReport(reportPath, report)
    } catch (reportError) {
      throw new AggregateError(
        [error, reportError],
        "Bazaar review processing failed and its processing-budget report could not be persisted."
      )
    }
    throw error
  }
}

function processingReportPath(reportDirectory: string, inputSha256: string): string {
  return path.join(reportDirectory, `bazaar-review-${inputSha256.slice(7, 39)}${REPORT_FILE_SUFFIX}`)
}

function reviewLedger(
  maxDiffBytes: number,
  maxAddedFileContentBytes: number,
  maxBobInputBytes: number
): SharedProcessingBudgetLedger {
  return new ProcessingBudgetLedger({
    limits: {
      raw_diff_bytes: maxDiffBytes,
      document_excerpt_bytes: maxAddedFileContentBytes,
      bob_input_bytes: maxBobInputBytes,
      total_operation_input_bytes: BAZAAR_REVIEW_TOTAL_OPERATION_MAX_BYTES
    }
  })
}

interface PreparedTargetBudget {
  readonly originalDiffBytes: number
  readonly boundedDiffBytes: number
  readonly observedAddedFileBytes: number
  readonly processedAddedFileBytes: number
  readonly renderedAddedFileBytes: number
  readonly skippedAddedFileCount: number
  readonly failedAddedFileCount: number
}

function commitPreparedTargetBudget(
  ledger: SharedProcessingBudgetLedger,
  reservations: SharedProcessingBudgetReservation[],
  prepared: PreparedTarget,
  input: RunBazaarReviewProcessingOperationInput
): PreparedTargetBudget {
  const originalDiffBytes = Buffer.byteLength(prepared.diff.stdout, "utf8")
  const boundedDiffBytes = Buffer.byteLength(
    truncateUtf8(prepared.diff.stdout, input.maxDiffBytes, "diff"),
    "utf8"
  )
  const evidence = prepared.addedFilesEvidence
  const observedAddedFileBytes = evidence?.observedContentBytes
    ?? Buffer.byteLength(prepared.addedFilesSection ?? "", "utf8")
  const processedAddedFileBytes = evidence?.processedContentBytes
    ?? Math.min(input.maxAddedFileContentBytes, observedAddedFileBytes)
  const renderedAddedFileBytes = Buffer.byteLength(prepared.addedFilesSection ?? "", "utf8")
  const skippedAddedFileCount = evidence?.skippedFileCount ?? 0
  const failedAddedFileCount = evidence?.readFailures.length ?? 0
  commitPreparedReservation(ledger, reservations, "changed_files", prepared.info.changedFileCount)
  commitPreparedReservation(ledger, reservations, "raw_diff_bytes", boundedDiffBytes)
  commitPreparedReservation(ledger, reservations, "document_excerpt_bytes", renderedAddedFileBytes)
  return Object.freeze({
    originalDiffBytes,
    boundedDiffBytes,
    observedAddedFileBytes,
    processedAddedFileBytes,
    renderedAddedFileBytes,
    skippedAddedFileCount,
    failedAddedFileCount
  })
}

function commitPreparedReservation(
  ledger: SharedProcessingBudgetLedger,
  reservations: SharedProcessingBudgetReservation[],
  category: "changed_files" | "raw_diff_bytes" | "document_excerpt_bytes",
  amount: number
): void {
  const reservation = ledger.reserve(category, amount)
  reservations.push(reservation)
  reservation.commit()
}

function processingIssues(
  prepared: PreparedTarget,
  input: RunBazaarReviewProcessingOperationInput,
  budget: PreparedTargetBudget
): readonly SharedProcessingBudgetReportIssue[] {
  const issues: SharedProcessingBudgetReportIssue[] = []
  if (budget.originalDiffBytes > input.maxDiffBytes) {
    issues.push(Object.freeze({
      kind: "truncation" as const,
      code: "raw_diff_truncated",
      category: "raw_diff_bytes" as const,
      target: "bazaar-diff",
      processed: budget.boundedDiffBytes,
      observed: budget.originalDiffBytes,
      unprocessed: Math.max(0, budget.originalDiffBytes - budget.boundedDiffBytes)
    }))
  }

  const log = prepared.log?.stdout
  if (log !== undefined) {
    const observed = Buffer.byteLength(log, "utf8")
    if (observed > BAZAAR_REVIEW_LOG_MAX_BYTES) {
      const processed = Buffer.byteLength(truncateUtf8(log, BAZAAR_REVIEW_LOG_MAX_BYTES, "log"), "utf8")
      issues.push(Object.freeze({
        kind: "truncation" as const,
        code: "bazaar_log_truncated",
        category: "bob_input_bytes" as const,
        target: "bazaar-log",
        processed,
        observed,
        unprocessed: Math.max(0, observed - processed)
      }))
    }
  }

  if (prepared.addedFilesEvidence?.truncated === true
    || budget.observedAddedFileBytes > budget.processedAddedFileBytes
    || prepared.addedFilesSection?.includes("[TRUNCATED:")) {
    issues.push(Object.freeze({
      kind: "truncation" as const,
      code: "added_file_content_truncated",
      category: "document_excerpt_bytes" as const,
      target: "bazaar-added-files",
      processed: budget.processedAddedFileBytes,
      ...(budget.observedAddedFileBytes > budget.processedAddedFileBytes ? {
        observed: budget.observedAddedFileBytes,
        unprocessed: budget.observedAddedFileBytes - budget.processedAddedFileBytes
      } : {})
    }))
  }
  if (budget.skippedAddedFileCount > 0) {
    issues.push(Object.freeze({
      kind: "unprocessed" as const,
      code: "added_file_content_unprocessed",
      target: "bazaar-added-files",
      unprocessed: budget.skippedAddedFileCount
    }))
  }
  if (budget.failedAddedFileCount > 0) {
    issues.push(Object.freeze({
      kind: "unprocessed" as const,
      code: "added_file_read_failed",
      target: "bazaar-added-files",
      unprocessed: budget.failedAddedFileCount
    }))
  }
  return Object.freeze(issues)
}

function operationInputSha(
  repositoryScope: string,
  operation: BazaarReviewProcessingIdentity,
  limits: Readonly<{
    maxDiffBytes: number
    maxAddedFileContentBytes: number
    maxBobInputBytes: number
  }>
): string {
  return sha256({
    schema_version: "bazaar-review-processing-input/v1",
    repository_scope: repositoryScope,
    operation,
    limits
  })
}

function preparedTargetInputSha(initialInputSha256: string, prepared: PreparedTarget): string {
  return sha256({
    schema_version: "bazaar-review-processing-prepared/v2",
    initial_input_sha256: initialInputSha256,
    repository_root: normalizeRepositoryScope(prepared.root),
    target: {
      mode: prepared.info.mode,
      target_label: prepared.info.targetLabel,
      revision: prepared.info.revision ?? "",
      base_revision: prepared.info.baseRevision ?? "",
      target_revision: prepared.info.targetRevision ?? "",
      revno: prepared.info.revno ?? "",
      author: prepared.info.author,
      committer: prepared.info.committer,
      timestamp: prepared.info.timestamp,
      message: prepared.info.message,
      changed_file_count: prepared.info.changedFileCount,
      changed_files: [...prepared.info.changedFiles],
      changed_file_entries: prepared.info.changedFileEntries.map((entry) => ({
        path: entry.path,
        status: entry.status,
        binary: entry.binary === undefined ? null : entry.binary
      }))
    },
    diff_command: commandInput(prepared.diff),
    log_command: prepared.log === undefined ? null : commandInput(prepared.log),
    added_files_sha256: sha256Text(prepared.addedFilesSection ?? ""),
    added_files_evidence: prepared.addedFilesEvidence === undefined ? null : {
      observed_content_bytes: prepared.addedFilesEvidence.observedContentBytes,
      processed_content_bytes: prepared.addedFilesEvidence.processedContentBytes,
      rendered_content_bytes: prepared.addedFilesEvidence.renderedContentBytes,
      truncated: prepared.addedFilesEvidence.truncated,
      skipped_file_count: prepared.addedFilesEvidence.skippedFileCount,
      read_failures: prepared.addedFilesEvidence.readFailures.map((failure) => ({
        path: failure.path,
        message: failure.message
      }))
    }
  })
}

function commandInput(result: PreparedTarget["diff"]): Readonly<{
  command: string
  args: readonly string[]
  cwd: string
  stdout_sha256: string
  stderr_sha256: string
}> {
  return Object.freeze({
    command: result.command,
    args: Object.freeze([...result.args]),
    cwd: result.cwd,
    stdout_sha256: sha256Text(result.stdout),
    stderr_sha256: sha256Text(result.stderr)
  })
}

function productInputSha(initialInputSha256: string, product: BazaarReviewProcessingProduct): string {
  return sha256({
    schema_version: "bazaar-review-processing-product/v3",
    prepared_input_sha256: preparedTargetInputSha(initialInputSha256, product.prepared),
    packet_sha256: sha256Text(product.packet)
  })
}

function normalizeRepositoryScope(value: string): string {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new Error("Bazaar processing repository scope is invalid")
  }
  const normalized = path.resolve(value).normalize("NFC")
  if (Buffer.byteLength(normalized, "utf8") > 4_096) {
    throw new Error("Bazaar processing repository scope is too long")
  }
  return normalized
}

function normalizeBobInputBytes(value: number | undefined): number {
  if (value === undefined) return BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Bazaar Bob input byte limit must be a positive safe integer")
  }
  return Math.min(value, BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES)
}

function failureFromError(error: unknown, signal: AbortSignal | undefined): SharedProcessingBudgetReportFailure {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : undefined
  const details = record && typeof record.details === "object" && record.details !== null
    ? record.details as Record<string, unknown>
    : undefined
  const cancelled = isCancellation(error, signal)
  const category = safeCategory(details?.constrainedCategory ?? record?.category)
  const target = safeText(details?.target ?? record?.target)
  const limit = safeInteger(details?.limit ?? record?.limit)
  const observed = safeInteger(details?.observed ?? record?.observed)
  return Object.freeze({
    code: cancelled ? "processing_cancelled" : safeFailureCode(record?.code),
    ...(category === undefined ? {} : { category }),
    ...(target === undefined ? {} : { target }),
    ...(limit === undefined ? {} : { limit }),
    ...(observed === undefined ? {} : { observed })
  })
}

function isCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true || (
    typeof error === "object" && error !== null && "code" in error
      && (error as { readonly code?: unknown }).code === "processing_cancelled"
  )
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  if (signal.reason instanceof Error) throw signal.reason
  throw Object.assign(new Error("Bazaar review processing was cancelled."), {
    code: "processing_cancelled",
    kind: "user"
  })
}

function safeFailureCode(value: unknown): string {
  return typeof value === "string" && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(value)
    ? value
    : "processing_failed"
}

function safeCategory(value: unknown): SharedProcessingBudgetReportFailure["category"] {
  const categories = new Set([
    "single_document_bytes",
    "total_document_bytes",
    "document_count",
    "sheets_per_workbook",
    "total_sheets",
    "rows_per_sheet",
    "total_rows",
    "changed_files",
    "raw_diff_bytes",
    "document_excerpt_bytes",
    "bob_input_bytes",
    "managed_artifact_bytes",
    "total_operation_input_bytes"
  ])
  return typeof value === "string" && categories.has(value)
    ? value as SharedProcessingBudgetReportFailure["category"]
    : undefined
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return undefined
  return truncateUtf8Prefix(value.normalize("NFC"), 256) || undefined
}

function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined
}

function truncateUtf8Prefix(value: string, maximumBytes: number): string {
  const output: string[] = []
  let bytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8")
    if (bytes + characterBytes > maximumBytes) break
    output.push(character)
    bytes += characterBytes
  }
  return output.join("")
}

function sha256(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`
}

function sha256Text(value: string): string {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`
}

async function persistReport(reportPath: string, report: SharedProcessingBudgetReport): Promise<void> {
  await replaceTextFileAtomically(reportPath, serializeProcessingBudgetReport(report))
}
