import { createHash } from "node:crypto"
import { analyzeCodeChanges } from "../analyzers/codeChangeAnalyzer"
import { extractDocuments } from "../analyzers/documentExtractor"
import { buildTraceability } from "../analyzers/traceabilityBuilder"
import type { ContextBudgetArtifact } from "../evidenceScope/contextBudgetArtifact"
import { buildReviewContextBudget } from "../evidenceScope/reviewContextBudget"
import {
  updateArtifactLedger,
  type ArtifactLedgerUpdateResult,
  type ArtifactObservation
} from "../evidenceScope/artifactLedger"
import {
  isRepositoryIndexProducerLanguage,
  produceRepositorySymbolIndex,
  type ProduceRepositorySymbolIndexResult
} from "../evidenceScope/repositorySymbolIndexProducer"
import type { SharedProcessingBudgetReportIssue } from "../sharedProcessingBudgetReport"
import {
  createAbsoluteDeadline,
  createCancellationScope,
  type SharedAbsoluteDeadline,
  type SharedProcessingBudgetLimits
} from "../sharedProcessingBudgetRuntime"
import { collectGitDiff } from "./gitDiffCollector"
import type { DiffSummary } from "./diffTypes"
import { relativePosix, resolveWorkspacePathForKind, resolveWorkspacePathStrict } from "./fileSystem"
import { normalizeReviewProcessingLimits, type ReviewProcessingLimits } from "./limits"
import { createPipelineProcessingBudgetLedger } from "./processingBudgetPipeline"
import {
  assertCompleteProcessingCoverage,
  coverageIssuesFromWarnings,
  failureFromProcessingError,
  outcomeFromProcessingError,
  persistProcessingBudgetReport
} from "./processingBudgetCoverage"
import { ProcessingCoveragePartialError } from "./processingCoverageError"
import {
  computeProcessingOperationInputSha,
  type MaterializedProcessingInputs
} from "./processingOperationInput"
import {
  persistCompleteProcessingBudgetBinding,
  removeProcessingBudgetReportBinding,
  removeStaleProcessingBudgetReport
} from "./processingBudgetReportGuard"
import { computeReviewPackageInputHash } from "./reviewPackageBuilder"
import {
  buildCompleteReviewPackage,
  cleanManagedReviewPackageOutputs
} from "./reviewPackageCoverageGuard"
import { validateReviewInput } from "./reviewInputValidator"
import type { PreprocessResult } from "./preprocessTypes"
import type { ReviewInput } from "./reviewTypes"
import { readVerifiedReviewPackage } from "./verifiedReviewPackage"

const DEFAULT_PREPROCESS_TIMEOUT_MS = 120_000
const MIN_PREPROCESS_TIMEOUT_MS = 1_000
const MAX_PREPROCESS_TIMEOUT_MS = 600_000
const PROCESSING_REPORT_OPERATION_PREFIX = "code-consistency-preprocess"

export interface PreprocessReviewInput {
  workspaceRoot: string
  inputPath: string
  outDir: string
  diffFixturePath?: string
  bzrPath?: string
  textEncoding?: string
  limits?: Partial<ReviewProcessingLimits>
  processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>
  workflowRunId?: string
  commandTimeoutMs?: number
  deadline?: SharedAbsoluteDeadline
  abortSignal?: AbortSignal
}

export async function preprocessReview(input: PreprocessReviewInput): Promise<PreprocessResult> {
  const textEncoding = input.textEncoding ?? "auto"
  const limits = normalizeReviewProcessingLimits(input.limits)
  const processingBudgetLedger = createPipelineProcessingBudgetLedger(limits, input.processingBudgetLimits)
  const deadline = input.deadline ?? createAbsoluteDeadline(normalizePreprocessTimeout(input.commandTimeoutMs))
  const cancellation = createCancellationScope({
    deadline,
    signal: input.abortSignal
  })
  let outDir: string | undefined
  let reviewInputForReport: ReviewInput | undefined
  let diffForReport: DiffSummary | undefined
  let contextBudgetArtifactForReport: ContextBudgetArtifact | undefined
  let inputSha256: string | undefined
  let packageBuilt = false

  try {
    cancellation.throwIfCancelled()
    const inputPath = resolveWorkspacePathStrict(input.workspaceRoot, input.inputPath, "reviewInputPath")
    outDir = resolveWorkspacePathForKind(input.workspaceRoot, input.outDir, "review-package-output")
    await removeStaleProcessingBudgetReport(outDir)
    cancellation.throwIfCancelled()
    await cleanManagedReviewPackageOutputs(outDir)
    cancellation.throwIfCancelled()
    const diffFixturePath = input.diffFixturePath
      ? resolveWorkspacePathStrict(input.workspaceRoot, input.diffFixturePath, "diffFixturePath")
      : undefined
    const reviewInput = await validateReviewInput(inputPath, input.workspaceRoot, textEncoding, limits.maxDocumentBytes)
    reviewInputForReport = reviewInput
    let materializedInputs: MaterializedProcessingInputs = Object.freeze({})
    const refreshInputSha = (completed: MaterializedProcessingInputs): string => {
      materializedInputs = Object.freeze({ ...materializedInputs, ...completed })
      inputSha256 = computeProcessingOperationInputSha({
        reviewInput,
        configuration: input,
        limits,
        materialized: materializedInputs
      })
      return inputSha256
    }
    refreshInputSha({})
    cancellation.throwIfCancelled()

    const diff = await collectGitDiff(reviewInput, {
      workspaceRoot: input.workspaceRoot,
      diffFixturePath,
      bzrPath: input.bzrPath,
      textEncoding,
      limits,
      budgetLedger: processingBudgetLedger,
      deadline,
      signal: cancellation.signal as AbortSignal
    })
    diffForReport = diff
    refreshInputSha({ diff })

    const repositoryIndexBuild = reviewInput.analysis_options?.repository_symbol_index_mode === "build"
      ? await produceConfiguredRepositoryIndex({
          workspaceRoot: input.workspaceRoot,
          repositoryRoot: diff.vcsRoot,
          vcs: diff.vcs ?? "git",
          reviewInput,
          sourceRevision: diff.head,
          textEncoding,
          deadline,
          abortSignal: cancellation.signal as AbortSignal
        })
      : undefined
    if (repositoryIndexBuild) refreshInputSha({ repositoryIndexBuild })

    const documents = await extractDocuments(reviewInput, {
      workspaceRoot: input.workspaceRoot,
      textEncoding,
      limits,
      budgetLedger: processingBudgetLedger,
      signal: cancellation.signal
    })
    refreshInputSha({ documents })
    cancellation.throwIfCancelled()

    const codeAnalysis = await analyzeCodeChanges(diff, reviewInput, {
      workspaceRoot: input.workspaceRoot,
      textEncoding,
      limits
    })
    refreshInputSha({ codeAnalysis })

    const contextBudget = await buildReviewContextBudget({
      workspaceRoot: input.workspaceRoot,
      reviewInput,
      diff,
      documents,
      codeAnalysis,
      limits,
      textEncoding,
      onUpstreamLoadFailure: async (kind) => {
        cancellation.throwIfCancelled()
        await updateArtifactLedger({
          workspaceRoot: input.workspaceRoot,
          sourceRevision: diff.head,
          observations: [],
          completeKinds: [kind],
          maxBytes: limits.maxDocumentBytes
        })
      }
    })
    refreshInputSha({
      contextBudgetArtifact: contextBudget.artifact,
      contextWarnings: contextBudget.warnings
    })
    contextBudgetArtifactForReport = contextBudget.artifact
    const upstreamObservations = buildUpstreamArtifactObservations(
      contextBudget.artifact,
      repositoryIndexBuild,
      diff.head
    )
    cancellation.throwIfCancelled()
    const upstreamLedger = await updateArtifactLedger({
      workspaceRoot: input.workspaceRoot,
      sourceRevision: diff.head,
      observations: upstreamObservations,
      completeKinds: ["project-rule-pack", "repository-symbol-index"],
      maxBytes: limits.maxDocumentBytes
    })
    refreshInputSha({ upstreamArtifactLedger: upstreamLedger })
    const traceability = await buildTraceability({ reviewInput, documents, codeAnalysis, diff })
    refreshInputSha({ traceability })
    cancellation.throwIfCancelled()

    const prePackageIssues = coverageIssuesFromWarnings({
      ledger: processingBudgetLedger,
      diffWarnings: diff.warnings,
      documentWarnings: documents.warnings,
      codeWarnings: codeAnalysis.warnings,
      repositoryWarnings: repositoryIndexBuild?.warnings,
      contextWarnings: contextBudget.warnings,
      traceabilityWarnings: traceability.warnings,
      ledgerWarnings: upstreamLedger.warnings
    })
    if (prePackageIssues.length > 0) {
      const persisted = await persistProcessingBudgetReport({
        outDir,
        operationId: processingOperationId(reviewInput.review.id),
        inputSha256,
        outcome: "success",
        ledger: processingBudgetLedger,
        issues: prePackageIssues
      })
      throw new ProcessingCoveragePartialError(prePackageIssues, persisted.reportPath)
    }

    let packageWarnings: string[]
    try {
      packageWarnings = await buildCompleteReviewPackage({
        workspaceRoot: input.workspaceRoot,
        outDir,
        reviewInput,
        diff,
        documents,
        codeAnalysis,
        traceability,
        contextBudgetArtifact: contextBudget.artifact,
        limits,
        budgetLedger: processingBudgetLedger,
        workflowRunId: input.workflowRunId
      })
      packageBuilt = true
    } catch (error) {
      if (!(error instanceof ProcessingCoveragePartialError)) throw error
      const persisted = await persistProcessingBudgetReport({
        outDir,
        operationId: processingOperationId(reviewInput.review.id),
        inputSha256,
        outcome: "success",
        ledger: processingBudgetLedger,
        issues: error.issues
      })
      throw new ProcessingCoveragePartialError(error.issues, persisted.reportPath)
    }
    cancellation.throwIfCancelled()

    const packageSnapshot = await readVerifiedReviewPackage(outDir)
    const packageContentHash = packageSnapshot.contentHash
    const packageObservation: ArtifactObservation = {
      id: `review-package:${reviewInput.review.id}`,
      kind: "review-package",
      producer: "bob-code-consistency-review@0.1.0",
      path: relativePosix(input.workspaceRoot, outDir),
      content_hash: packageContentHash,
      input_hash: computeReviewPackageInputHash(reviewInput, diff, contextBudget.artifact),
      source_revision: sourceRevision(diff.base, diff.head),
      depends_on: upstreamObservations.map((item) => item.id).sort()
    }
    const finalLedger = await updateArtifactLedger({
      workspaceRoot: input.workspaceRoot,
      sourceRevision: diff.head,
      observations: [...upstreamObservations, packageObservation],
      completeKinds: ["project-rule-pack", "repository-symbol-index", "review-package"],
      maxBytes: limits.maxDocumentBytes
    })

    refreshInputSha({ finalArtifactLedger: finalLedger })
    cancellation.throwIfCancelled()

    const postPackageIssues = coverageIssuesFromWarnings({
      ledger: processingBudgetLedger,
      packageWarnings,
      ledgerWarnings: [...upstreamLedger.warnings, ...finalLedger.warnings]
    })
    if (postPackageIssues.length > 0) {
      await cleanManagedReviewPackageOutputs(outDir)
      packageBuilt = false
      const persisted = await persistProcessingBudgetReport({
        outDir,
        operationId: processingOperationId(reviewInput.review.id),
        inputSha256,
        outcome: "success",
        ledger: processingBudgetLedger,
        issues: postPackageIssues
      })
      throw new ProcessingCoveragePartialError(postPackageIssues, persisted.reportPath)
    }

    const processingBudgetReport = await persistProcessingBudgetReport({
      outDir,
      operationId: processingOperationId(reviewInput.review.id),
      inputSha256,
      outcome: "success",
      ledger: processingBudgetLedger
    })
    assertCompleteProcessingCoverage(processingBudgetReport, inputSha256)
    await persistCompleteProcessingBudgetBinding({
      outDir,
      reportInputSha256: inputSha256,
      packageContentSha256: packageContentHash
    })

    const warnings = [...new Set([
      ...diff.warnings,
      ...documents.warnings,
      ...codeAnalysis.warnings,
      ...(repositoryIndexBuild?.warnings ?? []),
      ...contextBudget.warnings,
      ...traceability.warnings,
      ...packageWarnings,
      ...upstreamLedger.warnings,
      ...finalLedger.warnings
    ])].sort()
    return {
      status: "ok",
      reviewId: reviewInput.review.id,
      packageDir: outDir,
      changedFiles: diff.files.length,
      documentEvidence: documents.evidence.length,
      codeEvidence: codeAnalysis.evidence.length,
      ...(repositoryIndexBuild ? { repositoryIndexBuild } : {}),
      artifactLedger: ledgerSummary(finalLedger),
      processingBudgetReport: {
        path: processingBudgetReport.reportPath,
        inputSha256,
        coverageStatus: "complete"
      },
      warnings,
      summary: `Generated review package for ${reviewInput.review.id}: ${diff.files.length} file(s), ${documents.evidence.length} document evidence item(s), ${codeAnalysis.evidence.length} code evidence item(s).${repositoryIndexBuild ? ` Repository index: ${repositoryIndexBuild.rebuiltFiles} rebuilt, ${repositoryIndexBuild.reusedFiles} reused, ${repositoryIndexBuild.removedFiles} removed.` : ""} Artifact ledger: ${finalLedger.fresh} fresh, ${finalLedger.stale} stale, ${finalLedger.missing} missing. Processing coverage: complete. Generated artifacts may contain sensitive design, customer, source, or raw diff context; ensure .bob-review/ and .bob-trace/ai-traceability-draft/ are ignored unless intentionally versioned.`
    }
  } catch (error) {
    if (error instanceof ProcessingCoveragePartialError) throw error
    if (outDir) {
      try { await removeProcessingBudgetReportBinding(outDir) } catch {}
    }
    if (packageBuilt && outDir) {
      try { await cleanManagedReviewPackageOutputs(outDir) } catch {}
    }
    if (outDir && reviewInputForReport && inputSha256) {
      try {
        await persistProcessingBudgetReport({
          outDir,
          operationId: processingOperationId(reviewInputForReport.review.id),
          inputSha256,
          outcome: outcomeFromProcessingError(error),
          ledger: processingBudgetLedger,
          issues: [operationIncompleteIssue(diffForReport, contextBudgetArtifactForReport)],
          failure: failureFromProcessingError(error)
        })
      } catch (reportError) {
        throw new AggregateError(
          [error, reportError],
          "Processing failed and its processing-budget report could not be persisted."
        )
      }
    }
    throw error
  } finally {
    cancellation.dispose()
  }
}

async function produceConfiguredRepositoryIndex(input: {
  workspaceRoot: string
  repositoryRoot?: string
  vcs: "git" | "bazaar"
  reviewInput: ReviewInput
  sourceRevision: string
  textEncoding: string
  deadline: SharedAbsoluteDeadline
  abortSignal?: AbortSignal
}): Promise<ProduceRepositorySymbolIndexResult> {
  if (input.vcs !== "git") {
    throw new Error("analysis_options.repository_symbol_index_mode=build currently requires Git")
  }
  const indexPath = input.reviewInput.analysis_options?.repository_symbol_index_path
  if (!indexPath) {
    throw new Error("analysis_options.repository_symbol_index_path is required when repository_symbol_index_mode is build")
  }
  const requestedLanguages = input.reviewInput.analysis_options?.language
  const includeLanguages = requestedLanguages?.filter(isRepositoryIndexProducerLanguage)
  const omittedLanguages = requestedLanguages?.filter((language) => !isRepositoryIndexProducerLanguage(language)) ?? []
  const result = await produceRepositorySymbolIndex({
    workspaceRoot: input.workspaceRoot,
    repositoryRoot: input.repositoryRoot,
    sourceRevision: input.sourceRevision,
    indexPath,
    cachePath: input.reviewInput.analysis_options?.repository_symbol_index_cache_path,
    includeLanguages,
    textEncoding: input.textEncoding,
    deadline: input.deadline,
    signal: input.abortSignal
  })
  return omittedLanguages.length === 0
    ? result
    : {
        ...result,
        warnings: [...new Set([
          ...result.warnings,
          `repository index producer unsupported review languages omitted: ${[...new Set(omittedLanguages)].sort().join(", ")}`
        ])].sort()
      }
}

function buildUpstreamArtifactObservations(
  artifact: Awaited<ReturnType<typeof buildReviewContextBudget>>["artifact"],
  repositoryIndexBuild: ProduceRepositorySymbolIndexResult | undefined,
  headRevision: string
): ArtifactObservation[] {
  const observations: ArtifactObservation[] = []
  if (artifact.rule_pack) {
    observations.push({
      id: `project-rule-pack:${artifact.rule_pack.id}`,
      kind: "project-rule-pack",
      producer: "bob-code-consistency-review/project-rule-pack-loader-v1",
      path: artifact.rule_pack.source_path,
      content_hash: artifact.rule_pack.content_hash,
      input_hash: artifact.rule_pack.content_hash,
      source_revision: headRevision,
      depends_on: []
    })
  }
  if (artifact.symbol_index) {
    observations.push({
      id: `repository-symbol-index:${artifact.symbol_index.id}`,
      kind: "repository-symbol-index",
      producer: repositoryIndexBuild
        ? "bob-code-consistency-review/repository-index-producer-v1"
        : "repository-symbol-index/external",
      path: artifact.symbol_index.source_path,
      content_hash: artifact.symbol_index.content_hash,
      input_hash: artifact.symbol_index.content_hash,
      source_revision: artifact.symbol_index.source_revision,
      depends_on: []
    })
  }
  return observations.sort((left, right) => left.id.localeCompare(right.id))
}

function sourceRevision(base: string, head: string): string {
  return base && head ? `${base}..${head}` : head || base
}

function ledgerSummary(result: ArtifactLedgerUpdateResult): PreprocessResult["artifactLedger"] {
  return {
    path: result.path,
    fresh: result.fresh,
    stale: result.stale,
    missing: result.missing
  }
}

function normalizePreprocessTimeout(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_PREPROCESS_TIMEOUT_MS
  return Math.max(MIN_PREPROCESS_TIMEOUT_MS, Math.min(MAX_PREPROCESS_TIMEOUT_MS, Math.floor(value)))
}

function processingOperationId(reviewId: string): string {
  const digest = createHash("sha256").update(reviewId, "utf8").digest("hex").slice(0, 32)
  return `${PROCESSING_REPORT_OPERATION_PREFIX}:${digest}`
}

function operationIncompleteIssue(
  diff: DiffSummary | undefined,
  contextBudgetArtifact: ContextBudgetArtifact | undefined
): SharedProcessingBudgetReportIssue {
  const stage = contextBudgetArtifact
    ? "after_context_budget"
    : diff
      ? "after_diff_collection"
      : "before_diff_collection"
  return Object.freeze({
    kind: "unprocessed" as const,
    code: "operation_incomplete",
    target: stage
  })
}