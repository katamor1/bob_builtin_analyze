import { createPipelineProcessingOperation } from "./processingBudgetPipeline"
import { assertDocumentNotCancelled, createAbsoluteDeadline, constrainAbsoluteDeadline, type ProcessingOperation, type SharedAbsoluteDeadline, type DocumentOperation, type SharedProcessingBudgetLimits } from "../sharedProcessingBudgetRuntime"
import { analyzeCodeChanges } from "../analyzers/codeChangeAnalyzer"
import { countDocumentSelections, extractDocuments } from "../analyzers/documentExtractor"
import { buildTraceability } from "../analyzers/traceabilityBuilder"
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
import { collectGitDiff, normalizeCommandTimeout } from "./gitDiffCollector"
import { relativePosix, resolveWorkspacePathForKind, resolveWorkspacePathStrict } from "./fileSystem"
import { normalizeReviewProcessingLimits, type ReviewProcessingLimits } from "./limits"
import {
  buildReviewPackage,
  computeManagedReviewPackageContentHash,
  computeReviewPackageInputHash
} from "./reviewPackageBuilder"
import { validateReviewInput } from "./reviewInputValidator"
import type { PreprocessResult } from "./preprocessTypes"
import type { ReviewInput } from "./reviewTypes"

export interface PreprocessReviewInput {
  workspaceRoot: string
  inputPath: string
  outDir: string
  diffFixturePath?: string
  bzrPath?: string
  textEncoding?: string
  limits?: Partial<ReviewProcessingLimits>
  workflowRunId?: string
  commandTimeoutMs?: number
  deadline?: SharedAbsoluteDeadline
  abortSignal?: AbortSignal
  processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>
}

export async function preprocessReview(input: PreprocessReviewInput): Promise<PreprocessResult> {
  assertDocumentNotCancelled(input.abortSignal)
  const textEncoding = input.textEncoding ?? "auto"
  const limits = normalizeReviewProcessingLimits(input.limits)
  const duration = normalizeCommandTimeout(input.commandTimeoutMs)
  const deadline = input.deadline === undefined ? createAbsoluteDeadline(duration) : constrainAbsoluteDeadline(input.deadline, duration)
  const processingOperation = createPipelineProcessingOperation(limits, input.processingBudgetLimits, input.abortSignal, deadline)
  const signal = processingOperation.signal
  try {
  processingOperation.throwIfCancelled()
  const inputPath = resolveWorkspacePathStrict(input.workspaceRoot, input.inputPath, "reviewInputPath")
  const outDir = resolveWorkspacePathForKind(input.workspaceRoot, input.outDir, "review-package-output")
  const diffFixturePath = input.diffFixturePath
    ? resolveWorkspacePathStrict(input.workspaceRoot, input.diffFixturePath, "diffFixturePath")
    : undefined
  let operation: DocumentOperation | undefined
  const reviewInput = await validateReviewInput(inputPath, input.workspaceRoot, textEncoding, limits.maxDocumentBytes, {
    signal,
    deadline: processingOperation.deadline,
    processingOperation,
    beforeArtifactPaths: reviewInput => {
      operation = processingOperation.documents(countDocumentSelections(reviewInput))
    }
  })
  assertDocumentNotCancelled(signal)
  if (!operation) throw new Error("review document admission hook did not run")
  const diff = await collectGitDiff(reviewInput, {
    workspaceRoot: input.workspaceRoot,
    diffFixturePath,
    bzrPath: input.bzrPath,
    textEncoding,
    limits,
    processingOperation,
    processingBudgetLimits: input.processingBudgetLimits,
    deadline: processingOperation.deadline,
    signal
  })
  assertDocumentNotCancelled(signal)
  const repositoryIndexBuild = reviewInput.analysis_options?.repository_symbol_index_mode === "build"
    ? await produceConfiguredRepositoryIndex({
        workspaceRoot: input.workspaceRoot,
        repositoryRoot: diff.vcsRoot,
        vcs: diff.vcs ?? "git",
        reviewInput,
        sourceRevision: diff.head,
        textEncoding,
        processingOperation,
        deadline: processingOperation.deadline,
        abortSignal: signal
      })
    : undefined
  assertDocumentNotCancelled(signal)
  const documents = await extractDocuments(reviewInput, { workspaceRoot: input.workspaceRoot, textEncoding, limits, operation, processingOperation, signal, deadline: processingOperation.deadline, processingBudgetLimits: input.processingBudgetLimits })
  assertDocumentNotCancelled(signal)
  const codeAnalysis = await analyzeCodeChanges(diff, reviewInput, { workspaceRoot: input.workspaceRoot, textEncoding, limits })
  processingOperation.throwIfCancelled()
  const contextBudget = await buildReviewContextBudget({
    workspaceRoot: input.workspaceRoot,
    reviewInput,
    diff,
    documents,
    codeAnalysis,
    limits,
    textEncoding,
    onUpstreamLoadFailure: async (kind) => {
      processingOperation.throwIfCancelled()
      await updateArtifactLedger({
        workspaceRoot: input.workspaceRoot,
        sourceRevision: diff.head,
        observations: [],
        completeKinds: [kind],
        maxBytes: limits.maxDocumentBytes
      })
      processingOperation.throwIfCancelled()
    }
  })
  processingOperation.throwIfCancelled()
  const upstreamObservations = buildUpstreamArtifactObservations(
    contextBudget.artifact,
    repositoryIndexBuild,
    diff.head
  )
  const upstreamLedger = await updateArtifactLedger({
    workspaceRoot: input.workspaceRoot,
    sourceRevision: diff.head,
    observations: upstreamObservations,
    completeKinds: ["project-rule-pack", "repository-symbol-index"],
    maxBytes: limits.maxDocumentBytes
  })
  processingOperation.throwIfCancelled()
  const traceability = await buildTraceability({ reviewInput, documents, codeAnalysis, diff })

  processingOperation.throwIfCancelled()
  const packageWarnings = await buildReviewPackage({
    workspaceRoot: input.workspaceRoot,
    outDir,
    reviewInput,
    diff,
    documents,
    codeAnalysis,
    traceability,
    contextBudgetArtifact: contextBudget.artifact,
    limits,
    workflowRunId: input.workflowRunId,
    processingOperation,
    signal,
    deadline: processingOperation.deadline
  })

  processingOperation.throwIfCancelled()
  const contentHash = await computeManagedReviewPackageContentHash(outDir)
  processingOperation.throwIfCancelled()
  const packageObservation: ArtifactObservation = {
    id: `review-package:${reviewInput.review.id}`,
    kind: "review-package",
    producer: "bob-code-consistency-review@0.1.0",
    path: relativePosix(input.workspaceRoot, outDir),
    content_hash: contentHash,
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

  processingOperation.throwIfCancelled()
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
  processingOperation.throwIfCancelled()
  return {
    status: "ok",
    reviewId: reviewInput.review.id,
    packageDir: outDir,
    changedFiles: diff.files.length,
    documentEvidence: documents.evidence.length,
    codeEvidence: codeAnalysis.evidence.length,
    ...(repositoryIndexBuild ? { repositoryIndexBuild } : {}),
    artifactLedger: ledgerSummary(finalLedger),
    warnings,
    summary: `Generated review package for ${reviewInput.review.id}: ${diff.files.length} file(s), ${documents.evidence.length} document evidence item(s), ${codeAnalysis.evidence.length} code evidence item(s).${repositoryIndexBuild ? ` Repository index: ${repositoryIndexBuild.rebuiltFiles} rebuilt, ${repositoryIndexBuild.reusedFiles} reused, ${repositoryIndexBuild.removedFiles} removed.` : ""} Artifact ledger: ${finalLedger.fresh} fresh, ${finalLedger.stale} stale, ${finalLedger.missing} missing. Generated artifacts may contain sensitive design, customer, source, or raw diff context; ensure .bob-review/ and .bob-trace/ai-traceability-draft/ are ignored unless intentionally versioned.`
  }
  } finally { processingOperation.dispose() }
}

async function produceConfiguredRepositoryIndex(input: {
  workspaceRoot: string
  repositoryRoot?: string
  vcs: "git" | "bazaar"
  reviewInput: ReviewInput
  sourceRevision: string
  textEncoding: string
  processingOperation: ProcessingOperation
  deadline: SharedAbsoluteDeadline
  abortSignal?: AbortSignal
}): Promise<ProduceRepositorySymbolIndexResult> {
  input.processingOperation.throwIfCancelled()
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
    processingOperation: input.processingOperation,
    deadline: input.deadline,
    signal: input.abortSignal
  })
  input.processingOperation.throwIfCancelled()
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
