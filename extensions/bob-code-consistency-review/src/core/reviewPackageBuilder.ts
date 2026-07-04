import * as fs from "node:fs/promises"
import * as path from "node:path"
import { applyTemplate, loadPromptTemplates } from "../templates/templateLoader"
import { relativePosix, writeJsonFile, writeTextFile } from "./fileSystem"
import { normalizeReviewProcessingLimits, truncateUtf8Text, type ReviewProcessingLimits } from "./limits"
import type { CodeAnalysisResult, DiffSummary, DocumentExtractionResult, EvidenceRef, ReviewInput, TraceabilityResult } from "./types"

const PRIVACY_NOTICE_JA = "生成物は社内設計書・顧客仕様・ソースコード・raw diff を含む可能性があります。"

export async function buildReviewPackage(input: {
  workspaceRoot: string
  outDir: string
  reviewInput: ReviewInput
  diff: DiffSummary
  documents: DocumentExtractionResult
  codeAnalysis: CodeAnalysisResult
  traceability: TraceabilityResult
  limits?: Partial<ReviewProcessingLimits>
}): Promise<string[]> {
  const { outDir, reviewInput, diff, documents, codeAnalysis, traceability } = input
  const limits = normalizeReviewProcessingLimits(input.limits)
  const packageWarnings: string[] = []
  await fs.mkdir(outDir, { recursive: true })
  await writePrompts(outDir)
  await writeCodeSlices(outDir, codeAnalysis)
  await writeTables(outDir, documents)

  const evidence = [...documents.evidence, ...codeAnalysis.evidence]
  await writeJsonFile(path.join(outDir, "input-normalized.json"), reviewInput)
  await writeJsonFile(path.join(outDir, "changed-files.json"), { vcs: diff.vcs ?? "git", vcsRoot: diff.vcsRoot, files: diff.files, warnings: diff.warnings })
  await writeJsonFile(path.join(outDir, "changed-symbols.json"), {
    symbols: codeAnalysis.changedSymbols,
    functions: codeAnalysis.functions,
    defines: codeAnalysis.defines,
    globals: codeAnalysis.globals,
    call_graph: codeAnalysis.callGraph,
    rt_forbidden_candidates: codeAnalysis.rtForbiddenCandidates,
    warnings: codeAnalysis.warnings
  })
  await writeJsonFile(path.join(outDir, "document-index.json"), { documents: documents.documents, warnings: documents.warnings })
  await writeJsonFile(path.join(outDir, "evidence-index.json"), { evidence: evidence.map(stripEvidenceText) })
  await writeJsonFile(path.join(outDir, "traceability-map.json"), { rows: traceability.rows, warnings: traceability.warnings })

  const changeSummary = buildChangeSummary(reviewInput, diff, codeAnalysis, documents)
  const diffContext = buildDiffContext(diff, codeAnalysis, limits, packageWarnings)
  let deterministicChecks = buildDeterministicChecks(documents, codeAnalysis, traceability, packageWarnings)

  await writeTextFile(path.join(outDir, "change-summary.md"), changeSummary)
  await writeTextFile(path.join(outDir, "diff-context.md"), diffContext)
  await writeTextFile(path.join(outDir, "document-excerpts.md"), documents.excerptsMarkdown)
  await writeTextFile(path.join(outDir, "traceability-map.md"), traceability.markdown)

  const templates = await loadPromptTemplates()
  const bobInputSource = applyTemplate(templates.bobInputTemplate, {
    "prompt.system": templates.system,
    "prompt.task": templates.task,
    "prompt.output_format": templates.outputFormat,
    "review.summary": buildReviewSummary(reviewInput, diff),
    change_summary: changeSummary,
    deterministic_checks: deterministicChecks,
    document_excerpts: documents.excerptsMarkdown,
    diff_context: diffContext,
    changed_symbols_summary: codeAnalysis.summaryMarkdown,
    traceability_map: traceability.markdown,
    evidence_index_summary: evidenceIndexSummary(evidence)
  })
  const bobInput = limitBobInput(bobInputSource, limits, packageWarnings)
  deterministicChecks = buildDeterministicChecks(documents, codeAnalysis, traceability, packageWarnings)

  await writeTextFile(path.join(outDir, "manifest.yaml"), buildManifest(reviewInput, diff, evidence, input.workspaceRoot, outDir, packageWarnings))
  await writeTextFile(path.join(outDir, "deterministic-checks.md"), deterministicChecks)
  await writeTextFile(path.join(outDir, "bob-input.md"), bobInput)
  return packageWarnings
}

function buildManifest(reviewInput: ReviewInput, diff: DiffSummary, evidence: EvidenceRef[], workspaceRoot: string, outDir: string, packageWarnings: string[]): string {
  return [
    "package_version: 1",
    `created_at: ${JSON.stringify(new Date().toISOString())}`,
    "created_by: bob-code-consistency-review",
    "preprocess_version: 0.1.0",
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

function limitBobInput(text: string, limits: ReviewProcessingLimits, packageWarnings: string[]): string {
  const suffix = "\n\n[truncated: maxBobInputBytes]\n"
  const limited = truncateUtf8Text(text, limits.maxBobInputBytes, suffix)
  if (!limited.truncated) return text
  packageWarnings.push(`bob-input.md exceeded maxBobInputBytes (${limited.originalBytes} > ${limits.maxBobInputBytes}); truncated.`)
  return limited.text
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

async function writePrompts(outDir: string): Promise<void> {
  const templates = await loadPromptTemplates()
  const promptDir = path.join(outDir, "prompts")
  await Promise.all([
    writeTextFile(path.join(promptDir, "system.md"), templates.system),
    writeTextFile(path.join(promptDir, "task.md"), templates.task),
    writeTextFile(path.join(promptDir, "output-format.md"), templates.outputFormat)
  ])
}

async function writeCodeSlices(outDir: string, codeAnalysis: CodeAnalysisResult): Promise<void> {
  await Promise.all(codeAnalysis.codeSlices.map((slice) => writeTextFile(path.join(outDir, "code-slices", `${slice.evidence_id}.md`), slice.markdown)))
}

async function writeTables(outDir: string, documents: DocumentExtractionResult): Promise<void> {
  const tableExcerpts = documents.evidence.filter((item) => item.text?.includes("|"))
  await Promise.all(tableExcerpts.map((item) => writeTextFile(path.join(outDir, "tables", `${item.evidence_id}.md`), `# ${item.evidence_id}\n\n${item.text ?? ""}\n`)))
}
