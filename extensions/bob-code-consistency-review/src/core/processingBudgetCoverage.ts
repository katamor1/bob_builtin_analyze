import {
  assertProcessingBudgetReportAllowsHandoff,
  createProcessingBudgetReport,
  serializeProcessingBudgetReport,
  type SharedProcessingBudgetReport,
  type SharedProcessingBudgetReportFailure,
  type SharedProcessingBudgetReportIssue
} from "../sharedProcessingBudgetReport"
import type { SharedProcessingBudgetLedger } from "../sharedProcessingBudgetRuntime"
import { replaceTextFileAtomically } from "./atomicReplaceFile"

export const PROCESSING_BUDGET_REPORT_FILE_SUFFIX = ".processing-budget-report.json" as const
const MAX_REPORT_TEXT_UTF8_BYTES = 256
const RAW_DIFF_TRUNCATION = /(?:unified|raw) diff[\s\S]*truncat/i
const DOCUMENT_TRUNCATION = /document_excerpt_bytes|excerpt truncat|remaining excerpts skipped/i
const BOB_INPUT_TRUNCATION = /bob-input\.md[\s\S]*truncat|bob_input_bytes[\s\S]*truncat/i

export interface PersistProcessingBudgetReportInput {
  readonly outDir: string
  readonly operationId: string
  readonly inputSha256: string
  readonly outcome: "success" | "failed" | "cancelled"
  readonly ledger: SharedProcessingBudgetLedger
  readonly issues?: readonly SharedProcessingBudgetReportIssue[]
  readonly failure?: SharedProcessingBudgetReportFailure
}

export interface PersistedProcessingBudgetReport {
  readonly reportPath: string
  readonly report: SharedProcessingBudgetReport
}

export interface ProcessingCoverageWarningInput {
  readonly ledger: SharedProcessingBudgetLedger
  readonly diffWarnings?: readonly string[]
  readonly documentWarnings?: readonly string[]
  readonly codeWarnings?: readonly string[]
  readonly repositoryWarnings?: readonly string[]
  readonly contextWarnings?: readonly string[]
  readonly traceabilityWarnings?: readonly string[]
  readonly ledgerWarnings?: readonly string[]
  readonly packageWarnings?: readonly string[]
}

export function processingBudgetReportPath(outDir: string): string {
  return `${outDir}${PROCESSING_BUDGET_REPORT_FILE_SUFFIX}`
}

export async function persistProcessingBudgetReport(
  input: PersistProcessingBudgetReportInput
): Promise<PersistedProcessingBudgetReport> {
  const report = createProcessingBudgetReport({
    producer: { id: "bob-code-consistency-review", version: "0.1.0" },
    operation_id: input.operationId,
    input_sha256: input.inputSha256,
    outcome: input.outcome,
    ledger: input.ledger.snapshot(),
    issues: input.issues,
    failure: input.failure
  })
  const reportPath = processingBudgetReportPath(input.outDir)
  await replaceTextFileAtomically(reportPath, serializeProcessingBudgetReport(report))
  return Object.freeze({ reportPath, report })
}

export function assertCompleteProcessingCoverage(
  persisted: PersistedProcessingBudgetReport,
  expectedInputSha256: string
): SharedProcessingBudgetReport {
  return assertProcessingBudgetReportAllowsHandoff(persisted.report, {
    expected_input_sha256: expectedInputSha256
  })
}

export function coverageIssuesFromWarnings(
  input: ProcessingCoverageWarningInput
): readonly SharedProcessingBudgetReportIssue[] {
  const snapshot = input.ledger.snapshot()
  const issues: SharedProcessingBudgetReportIssue[] = []

  if (someWarning(input.diffWarnings, RAW_DIFF_TRUNCATION)) {
    issues.push(truncationIssue(
      "raw_diff_bytes",
      "raw_diff_truncated",
      committed(snapshot, "raw_diff_bytes"),
      input.diffWarnings
    ))
  }
  if (hasUnclassifiedWarning(input.diffWarnings, [RAW_DIFF_TRUNCATION])) {
    issues.push(unprocessedIssue("diff_evidence_incomplete", "diff"))
  }

  if (someWarning(input.documentWarnings, DOCUMENT_TRUNCATION)) {
    issues.push(truncationIssue(
      "document_excerpt_bytes",
      "document_excerpt_truncated",
      committed(snapshot, "document_excerpt_bytes"),
      input.documentWarnings
    ))
  }
  if (hasUnclassifiedWarning(input.documentWarnings, [DOCUMENT_TRUNCATION])) {
    issues.push(unprocessedIssue("document_evidence_incomplete", "documents", "document_count"))
  }

  if ((input.codeWarnings?.length ?? 0) > 0) {
    issues.push(unprocessedIssue("code_evidence_incomplete", "code-analysis"))
  }
  if ((input.repositoryWarnings?.length ?? 0) > 0) {
    issues.push(unprocessedIssue("repository_evidence_incomplete", "repository-index"))
  }
  if ((input.contextWarnings?.length ?? 0) > 0) {
    issues.push(unprocessedIssue("context_evidence_incomplete", "context-budget"))
  }
  if ((input.traceabilityWarnings?.length ?? 0) > 0) {
    issues.push(unprocessedIssue("traceability_evidence_incomplete", "traceability"))
  }
  if ((input.ledgerWarnings?.length ?? 0) > 0) {
    issues.push(unprocessedIssue("artifact_ledger_incomplete", "artifact-ledger"))
  }

  if (someWarning(input.packageWarnings, BOB_INPUT_TRUNCATION)) {
    issues.push(truncationIssue(
      "bob_input_bytes",
      "bob_input_truncated",
      committed(snapshot, "bob_input_bytes"),
      input.packageWarnings
    ))
  }
  if (hasUnclassifiedWarning(input.packageWarnings, [BOB_INPUT_TRUNCATION])) {
    issues.push(unprocessedIssue("package_evidence_incomplete", "review-package", "managed_artifact_bytes"))
  }

  return Object.freeze(issues)
}

export function failureFromProcessingError(error: unknown): SharedProcessingBudgetReportFailure {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : undefined
  const details = record && typeof record.details === "object" && record.details !== null
    ? record.details as Record<string, unknown>
    : undefined
  const code = safeFailureCode(record?.code)
  const category = safeCategory(details?.constrainedCategory ?? record?.category)
  const target = safeText(details?.target ?? record?.target)
  const limit = safeInteger(details?.limit ?? record?.limit)
  const observed = safeInteger(details?.observed ?? record?.observed)
  return Object.freeze({
    code,
    ...(category === undefined ? {} : { category }),
    ...(target === undefined ? {} : { target }),
    ...(limit === undefined ? {} : { limit }),
    ...(observed === undefined ? {} : { observed })
  })
}

export function outcomeFromProcessingError(error: unknown): "failed" | "cancelled" {
  return typeof error === "object" && error !== null
    && "code" in error && (error as { readonly code?: unknown }).code === "processing_cancelled"
    ? "cancelled"
    : "failed"
}

function truncationIssue(
  category: "raw_diff_bytes" | "document_excerpt_bytes" | "bob_input_bytes",
  code: string,
  processed: number,
  warnings: readonly string[] | undefined
): SharedProcessingBudgetReportIssue {
  const observed = observedBytes(warnings)
  return Object.freeze({
    kind: "truncation" as const,
    code,
    category,
    target: category,
    processed,
    ...(observed === undefined || observed < processed ? {} : {
      observed,
      unprocessed: observed - processed
    })
  })
}

function unprocessedIssue(
  code: string,
  target: string,
  category?: SharedProcessingBudgetReportIssue["category"]
): SharedProcessingBudgetReportIssue {
  return Object.freeze({
    kind: "unprocessed" as const,
    code,
    target,
    ...(category === undefined ? {} : { category })
  })
}

function observedBytes(warnings: readonly string[] | undefined): number | undefined {
  for (const warning of warnings ?? []) {
    const match = /\(([0-9]+)\s*>\s*[0-9]+\)/u.exec(warning)
    if (!match) continue
    const value = Number(match[1])
    if (Number.isSafeInteger(value) && value >= 0) return value
  }
  return undefined
}

function someWarning(warnings: readonly string[] | undefined, pattern: RegExp): boolean {
  return (warnings ?? []).some((warning) => pattern.test(warning))
}

function hasUnclassifiedWarning(
  warnings: readonly string[] | undefined,
  classifiedPatterns: readonly RegExp[]
): boolean {
  return (warnings ?? []).some((warning) => !classifiedPatterns.some((pattern) => pattern.test(warning)))
}

function committed(
  report: ReturnType<SharedProcessingBudgetLedger["snapshot"]>,
  category: string
): number {
  return report.categories.find((entry) => entry.category === category)?.committed ?? 0
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
  return truncateUtf8Prefix(value.normalize("NFC"), MAX_REPORT_TEXT_UTF8_BYTES) || undefined
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

function safeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : undefined
}
