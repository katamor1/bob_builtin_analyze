import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { assertDocumentNotCancelled, assertProcessingOperation, BoundedDocumentError, remainingDeadlineMilliseconds, type SharedAbsoluteDeadline, type ProcessingOperation, type ProcessingBudgetReservation } from "../sharedProcessingBudgetRuntime"
import { createPipelineProcessingOperation } from "./processingBudgetPipeline"
import { assembleMandatoryFirstBobInput, reserveMandatoryFirstBobInput } from "./reviewPackageBudgets"
import { collectManagedReviewFiles, cleanManagedPackageOutputs, createReviewPackageWriter, type ReviewPackageWriter } from "./reviewPackageWriter"
export { computeManagedReviewPackageBytes } from "./reviewPackageWriter"
import type { ContextBudgetArtifact } from "../evidenceScope/contextBudgetArtifact"
import { loadPromptTemplates } from "../templates/templateLoader"
import { relativePosix } from "./fileSystem"
import { normalizeReviewProcessingLimits, truncateUtf8Text, type ReviewProcessingLimits } from "./limits"
import type { CodeAnalysisResult } from "./analysisTypes"
import type { DiffSummary } from "./diffTypes"
import type { DocumentExtractionResult, EvidenceRef } from "./documentTypes"
import type { ReviewInput } from "./reviewTypes"
import type { TraceabilityResult } from "./traceabilityResultTypes"

const PRIVACY_NOTICE_JA = "生成物は社内設計書・顧客仕様・ソースコード・raw diff を含む可能性があります。"


export async function buildReviewPackage(input: {
  workspaceRoot: string
  outDir: string
  reviewInput: ReviewInput
  diff: DiffSummary
  documents: DocumentExtractionResult
  codeAnalysis: CodeAnalysisResult
  traceability: TraceabilityResult
  contextBudgetArtifact?: ContextBudgetArtifact
  limits?: Partial<ReviewProcessingLimits>
  workflowRunId?: string
  processingOperation?: ProcessingOperation
  signal?: AbortSignal
  deadline?: SharedAbsoluteDeadline
}): Promise<string[]> {
  const { outDir, reviewInput, diff, documents, codeAnalysis, traceability } = input
  assertDocumentNotCancelled(input.signal)
  if (input.processingOperation) assertProcessingOperation(input.processingOperation)
  assertDocumentNotCancelled(input.processingOperation?.signal)
  const limits = normalizeReviewProcessingLimits(input.limits)
  const processingOperation = input.processingOperation ?? createPipelineProcessingOperation(limits, undefined, input.signal, input.deadline)
  try {
  assertProcessingOperation(processingOperation)
  if (input.processingOperation !== undefined && input.signal !== undefined && input.signal !== processingOperation.signal) throw new BoundedDocumentError("bounded_document_input_invalid")
  if (input.deadline !== undefined) {
    remainingDeadlineMilliseconds(input.deadline, 0)
    if (Object.getOwnPropertyDescriptor(input.deadline, "expires_at_monotonic_ms")?.value !== processingOperation.deadline.expires_at_monotonic_ms) throw new BoundedDocumentError("bounded_document_input_invalid")
  }

  assertDocumentNotCancelled(processingOperation.signal)
  const writer = createReviewPackageWriter({ outDir, operation: processingOperation, signal: processingOperation.signal, deadline: processingOperation.deadline })
  const packageWarnings: string[] = [], generationId = randomUUID()
  let bobReservation: ProcessingBudgetReservation | undefined
  try {
    await fs.mkdir(outDir, { recursive: true })
    processingOperation.throwIfCancelled()
    await cleanManagedPackageOutputs(outDir)
    processingOperation.throwIfCancelled()
    const evidence = [...documents.evidence, ...codeAnalysis.evidence]
    const changeSummary = buildChangeSummary(reviewInput, diff, codeAnalysis, documents)
    const diffContext = buildDiffContext(diff, codeAnalysis, limits, packageWarnings)
    const templates = await loadPromptTemplates()
    processingOperation.throwIfCancelled()
    const maximumBytes = Math.min(limits.maxBobInputBytes, processingOperation.profile.limits.bob_input_bytes)
    const values = {
      "prompt.system": templates.system,
      "prompt.task": templates.task,
      "prompt.output_format": templates.outputFormat,
      "review.summary": buildReviewSummary(reviewInput, diff),
      change_summary: changeSummary,
      deterministic_checks: buildDeterministicChecks(documents, codeAnalysis, traceability, packageWarnings),
      document_excerpts: documents.excerptsMarkdown,
      diff_context: diffContext,
      changed_symbols_summary: codeAnalysis.summaryMarkdown,
      traceability_map: traceability.markdown,
      evidence_index_summary: evidenceIndexSummary(evidence)
    }
    const bobOptions = { maximumBytes, template: templates.bobInputTemplate, values,
      truncatableKeys: ["document_excerpts", "diff_context", "changed_symbols_summary", "traceability_map", "evidence_index_summary"] }
    const initial = assembleMandatoryFirstBobInput(bobOptions)
    if (initial.truncated) {
      packageWarnings.push(`bob-input.md exceeded maxBobInputBytes (${initial.originalBytes} > ${maximumBytes}); truncated.`)
      values.deterministic_checks = buildDeterministicChecks(documents, codeAnalysis, traceability, packageWarnings)
    }
    const bobInput = reserveMandatoryFirstBobInput({ ...bobOptions, operation: processingOperation })
    bobReservation = bobInput.reservation

    await writer.writeText("prompts/system.md", templates.system)
    await writer.writeText("prompts/task.md", templates.task)
    await writer.writeText("prompts/output-format.md", templates.outputFormat)
    await writeCodeSlices(writer, codeAnalysis)
    await writeTables(writer, documents)
    await writer.writeJson("input-normalized.json", reviewInput)
    await writer.writeJson("changed-files.json", { vcs: diff.vcs ?? "git", vcsRoot: diff.vcsRoot, files: diff.files, warnings: diff.warnings })
    await writer.writeJson("changed-symbols.json", {
      symbols: codeAnalysis.changedSymbols, functions: codeAnalysis.functions,
      defines: codeAnalysis.defines, globals: codeAnalysis.globals,
      call_graph: codeAnalysis.callGraph, rt_forbidden_candidates: codeAnalysis.rtForbiddenCandidates,
      warnings: codeAnalysis.warnings
    })
    await writer.writeJson("document-index.json", { documents: documents.documents, warnings: documents.warnings })
    await writer.writeJson("evidence-index.json", { evidence: evidence.map(stripEvidenceText) })
    await writer.writeJson("traceability-map.json", { rows: traceability.rows, warnings: traceability.warnings })
    if (input.contextBudgetArtifact) await writer.writeJson("context-budget-report.json", input.contextBudgetArtifact)
    await writer.writeText("change-summary.md", changeSummary)
    await writer.writeText("diff-context.md", diffContext)
    await writer.writeText("document-excerpts.md", documents.excerptsMarkdown)
    await writer.writeText("traceability-map.md", traceability.markdown)
    await writer.writeText("manifest.yaml", buildManifest(reviewInput, diff, evidence, input.workspaceRoot,
      outDir, input.contextBudgetArtifact, packageWarnings, generationId, input.workflowRunId))
    await writer.writeText("deterministic-checks.md", values.deterministic_checks)
    await writer.writeText("bob-input.md", bobInput.text)
    await writer.measure()
    processingOperation.throwIfCancelled()
    const bobStat = await fs.stat(path.join(outDir, "bob-input.md"))
    processingOperation.throwIfCancelled()
    if (bobStat.size !== bobInput.retainedBytes) {
      throw new Error("Bob input output size changed")
    }
    assertDocumentNotCancelled(processingOperation.signal)
    // No asynchronous work between the final check and this reservation group.
    bobReservation.commit()
    writer.commit()
    return packageWarnings
  } catch (error) {
    writer.release()
    bobReservation?.release()
    try { await cleanManagedPackageOutputs(outDir) }
    catch { console.error("Review package cleanup failed; managed outputs may be incomplete.") }
    throw error
  }
  } finally { if (input.processingOperation === undefined) processingOperation.dispose() }
}


function buildManifest(
  reviewInput: ReviewInput,
  diff: DiffSummary,
  evidence: EvidenceRef[],
  workspaceRoot: string,
  outDir: string,
  contextBudgetArtifact: ContextBudgetArtifact | undefined,
  packageWarnings: string[],
  generationId: string,
  workflowRunId?: string
): string {
  const rulePack = contextBudgetArtifact?.rule_pack
  const symbolIndex = contextBudgetArtifact?.symbol_index
  return [
    "package_version: 1",
    `generation_id: ${generationId}`,
    `created_at: ${JSON.stringify(new Date().toISOString())}`,
    "created_by: bob-code-consistency-review",
    "preprocess_version: 0.1.0",
    "artifact_metadata:",
    "  producer_extension: bob-code-consistency-review",
    "  producer_version: 0.1.0",
    `  workflow_run_id: ${yamlScalar(workflowRunId ?? "")}`,
    `  source_vcs: ${yamlScalar(diff.vcs ?? "git")}`,
    `  source_revision: ${yamlScalar(sourceRevision(diff))}`,
    `  input_hash: ${computeReviewPackageInputHash(reviewInput, diff, contextBudgetArtifact)}`,
    "  contains_sensitive_context: true",
    "  human_review_required: true",
    "repository:",
    `  vcs: ${diff.vcs ?? "git"}`,
    diff.vcsRoot ? `  root: ${JSON.stringify(relativePosix(workspaceRoot, diff.vcsRoot))}` : undefined,
    `  base: ${diff.base}`,
    `  head: ${diff.head}`,
    "review:",
    `  id: ${reviewInput.review.id}`,
    `  title: ${JSON.stringify(reviewInput.review.title)}`,
    `  change_type: ${reviewInput.review.change_type}`,
    "prompts:",
    "  template_id: consistency-review-v1",
    "inputs:",
    `  review_package: ${relativePosix(workspaceRoot, outDir)}`,
    `  evidence_count: ${evidence.length}`,
    contextBudgetArtifact
      ? `  context_budget_report: ${relativePosix(workspaceRoot, path.join(outDir, "context-budget-report.json"))}`
      : undefined,
    rulePack ? `  project_rule_pack: ${yamlScalar(rulePack.source_path)}` : undefined,
    rulePack ? `  project_rule_pack_id: ${yamlScalar(rulePack.id)}` : undefined,
    rulePack ? `  project_rule_pack_version: ${JSON.stringify(rulePack.version)}` : undefined,
    rulePack ? `  project_rule_pack_hash: ${yamlScalar(rulePack.content_hash)}` : undefined,
    symbolIndex ? `  repository_symbol_index: ${yamlScalar(symbolIndex.source_path)}` : undefined,
    symbolIndex ? `  repository_symbol_index_id: ${yamlScalar(symbolIndex.id)}` : undefined,
    symbolIndex ? `  repository_symbol_index_revision: ${yamlScalar(symbolIndex.source_revision)}` : undefined,
    symbolIndex ? `  repository_symbol_index_hash: ${yamlScalar(symbolIndex.content_hash)}` : undefined,
    symbolIndex ? `  repository_symbol_count: ${symbolIndex.symbol_count}` : undefined,
    symbolIndex ? `  repository_edge_count: ${symbolIndex.edge_count}` : undefined,
    "privacy_notice:",
    "  generated_artifacts_may_contain_sensitive_context: true",
    `  message: ${JSON.stringify("Generated files may contain internal design docs, customer specs, source code, and raw diff. Ignore .bob-review/ and .bob-trace/ai-traceability-draft/ unless intentionally versioned.")}`,
    "  recommended_gitignore:",
    "    - .bob-review/",
    "    - .bob-trace/ai-traceability-draft/",
    "    - .bob/workflows/runs/",
    packageWarnings.length > 0 ? "truncation_warnings:" : undefined,
    ...packageWarnings.map((warning) => `  - ${JSON.stringify(warning)}`),
    ""
  ].filter((line): line is string => line !== undefined).join("\n")
}

export function computeReviewPackageInputHash(
  reviewInput: ReviewInput,
  diff: DiffSummary,
  contextBudgetArtifact: ContextBudgetArtifact | undefined
): string {
  return sha256Prefixed({
    reviewInput,
    diff: diffHashInput(diff),
    rulePackHash: contextBudgetArtifact?.rule_pack?.content_hash ?? "",
    symbolIndexHash: contextBudgetArtifact?.symbol_index?.content_hash ?? ""
  })
}

export async function computeManagedReviewPackageContentHash(outDir: string): Promise<string> {
  const files = await collectManagedReviewFiles(outDir)
  const hash = createHash("sha256")
  for (const file of files) {
    const bytes = await fs.readFile(file.absolutePath)
    hash.update(file.relativePath)
    hash.update("\0")
    hash.update(String(bytes.length))
    hash.update("\0")
    hash.update(bytes)
    hash.update("\0")
  }
  return `sha256:${hash.digest("hex")}`
}

function sourceRevision(diff: DiffSummary): string {
  if (diff.base && diff.head) return `${diff.base}..${diff.head}`
  return diff.head || diff.base || ""
}

function diffHashInput(diff: DiffSummary): Record<string, unknown> {
  return {
    vcs: diff.vcs ?? "git",
    vcsRoot: diff.vcsRoot,
    base: diff.base,
    head: diff.head,
    files: diff.files,
    warnings: diff.warnings
  }
}

function sha256Prefixed(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`
}

function yamlScalar(value: string): string {
  return /^[A-Za-z0-9_.:/@+-]+$/.test(value) ? value : JSON.stringify(value)
}

function buildReviewSummary(reviewInput: ReviewInput, diff: DiffSummary): string {
  const lines = [
    `- review_id: ${reviewInput.review.id}`,
    `- title: ${reviewInput.review.title}`,
    `- vcs: ${diff.vcs ?? "git"}`,
    `- target_range: ${diff.base}..${diff.head}`,
    `- change_type: ${reviewInput.review.change_type}`,
    `- purpose: ${reviewInput.review.purpose}`,
    `- review_focus: ${reviewInput.review_focus.join(", ")}`
  ]
  if (reviewInput.review.out_of_scope && reviewInput.review.out_of_scope.length > 0) {
    lines.push(`- out_of_scope: ${joinHumanList(reviewInput.review.out_of_scope)}`)
  }
  return lines.join("\n")
}

function joinHumanList(values: string[]): string {
  if (values.length <= 1) return values.join("")
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`
}

function buildChangeSummary(reviewInput: ReviewInput, diff: DiffSummary, codeAnalysis: CodeAnalysisResult, documents: DocumentExtractionResult): string {
  return [
    "# 変更サマリ",
    "",
    buildReviewSummary(reviewInput, diff),
    `- changed_files: ${diff.files.length}`,
    `- changed_functions: ${codeAnalysis.functions.length}`,
    `- document_evidence: ${documents.evidence.length}`,
    `- code_evidence: ${codeAnalysis.evidence.length}`,
    "",
    "## 変更ファイル",
    "",
    ...diff.files.map((file) => `- ${file.status}: ${file.path} (+${file.additions ?? 0}/-${file.deletions ?? 0})`)
  ].join("\n")
}

function buildDiffContext(diff: DiffSummary, codeAnalysis: CodeAnalysisResult, limits: ReviewProcessingLimits, packageWarnings: string[]): string {
  const suffix = "\n\n[truncated: maxRawDiffBytes]\n"
  const limitedDiff = truncateUtf8Text(diff.unifiedDiff ?? "", limits.maxRawDiffBytes, suffix)
  if (limitedDiff.truncated) {
    packageWarnings.push(`diff-context raw unified diff exceeded maxRawDiffBytes (${limitedDiff.originalBytes} > ${limits.maxRawDiffBytes}); truncated.`)
  }
  return [
    "# 差分コンテキスト",
    "",
    ...codeAnalysis.codeSlices.map((slice) => slice.markdown),
    "## Raw unified diff",
    "",
    "```diff",
    limitedDiff.text,
    "```",
    ""
  ].join("\n")
}

function buildDeterministicChecks(documents: DocumentExtractionResult, codeAnalysis: CodeAnalysisResult, traceability: TraceabilityResult, packageWarnings: string[] = []): string {
  const warnings = [...documents.warnings, ...codeAnalysis.warnings, ...traceability.warnings, ...packageWarnings]
  return [
    "# 決定論的チェック結果",
    "",
    `- document extraction warnings: ${documents.warnings.length}`,
    `- code analysis warnings: ${codeAnalysis.warnings.length}`,
    `- traceability warnings: ${traceability.warnings.length}`,
    `- package warnings: ${packageWarnings.length}`,
    `- evidence_id duplicates: ${hasDuplicateEvidenceIds([...documents.evidence, ...codeAnalysis.evidence]) ? "detected" : "none"}`,
    `- privacy: ${PRIVACY_NOTICE_JA} .gitignore に .bob-review/ と .bob-trace/ai-traceability-draft/ が含まれていることを確認してください。`,
    "",
    "## Warnings",
    "",
    ...(warnings.length > 0 ? warnings.map((warning) => `- ${warning}`) : ["- none"])
  ].join("\n")
}

function evidenceIndexSummary(evidence: EvidenceRef[]): string {
  return evidence.map((item) => `- ${item.evidence_id}: ${item.type} ${item.ref}${item.source ? ` (${item.source})` : ""}`).join("\n")
}

function stripEvidenceText(evidence: EvidenceRef): EvidenceRef {
  const { text: _text, ...rest } = evidence
  return rest
}

function hasDuplicateEvidenceIds(evidence: EvidenceRef[]): boolean {
  const ids = evidence.map((item) => item.evidence_id)
  return new Set(ids).size !== ids.length
}

async function writeCodeSlices(writer: ReviewPackageWriter, codeAnalysis: CodeAnalysisResult): Promise<void> {
  for (const slice of codeAnalysis.codeSlices) await writer.writeText(`code-slices/${slice.evidence_id}.md`, slice.markdown)
}

async function writeTables(writer: ReviewPackageWriter, documents: DocumentExtractionResult): Promise<void> {
  for (const item of documents.evidence.filter(item => item.text?.includes("|"))) {
    await writer.writeText(`tables/${item.evidence_id}.md`, `# ${item.evidence_id}\n\n${item.text ?? ""}\n`)
  }
}
