import { createHash } from "node:crypto"
import * as path from "node:path"
import type { SharedProcessingBudgetReportIssue } from "../sharedProcessingBudgetReport"
import {
  createProcessingBudgetReport,
  serializeProcessingBudgetReport,
  validateProcessingBudgetReport,
  type SharedProcessingBudgetReport,
  type SharedProcessingBudgetReportFailure
} from "../sharedProcessingBudgetReport"
import {
  type SharedProcessingBudgetLedger,
  type SharedProcessingBudgetCategory
} from "../sharedProcessingBudgetRuntime"
import { replaceTextFileAtomically } from "./atomicReplaceFile"

const PROCESSING_REPORT_FILE_SUFFIX = ".processing-budget-report.json"
const MAX_REPORT_TEXT_UTF8_BYTES = 256
const BENIGN_REPOSITORY_CACHE_INVALIDATION = /^repository index cache invalidated: producer identity or options changed$/u

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
  readonly report: SharedProcessingBudgetReport
  readonly reportPath: string
}

export interface ProcessingCoverageWarningsInput {
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
  return `${path.resolve(outDir)}${PROCESSING_REPORT_FILE_SUFFIX}`
}

export function processingOperationIdentitySha(value: unknown): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex")}`
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
    issues: input.issues ?? [],
    failure: input.failure
  })
  const reportPath = processingBudgetReportPath(input.outDir)
  await replaceTextFileAtomically(reportPath, serializeProcessingBudgetReport(report))
  return Object.freeze({ report, reportPath })
}

export function coverageIssuesFromWarnings(
  input: ProcessingCoverageWarningsInput
): readonly SharedProcessingBudgetReportIssue[] {
  const issues: SharedProcessingBudgetReportIssue[] = []
  for (const warning of input.diffWarnings ?? []) {
    const limits = matchByteLimit(warning)
    if (/raw diff truncated|raw diff was truncated|unified diff exceeded/iu.test(warning)) {
      issues.push(truncationIssue(
        "raw_diff_truncated",
        "raw_diff_bytes",
        "raw_diff_bytes",
        committed(input.ledger, "raw_diff_bytes"),
        limits?.observed,
        limits?.unprocessed
      ))
    } else {
      issues.push(unprocessedIssue("diff_evidence_incomplete", "raw_diff_bytes", targetFromWarning(warning, "git-diff")))
    }
  }
  for (const warning of input.documentWarnings ?? []) {
    const limits = matchByteLimit(warning)
    if (/excerpt|aggregate maxBobInputBytes|document_excerpt_bytes/iu.test(warning) && /truncat|exhaust|skip/iu.test(warning)) {
      issues.push(truncationIssue(
        "document_excerpt_truncated",
        "document_excerpt_bytes",
        "document_excerpt_bytes",
        committed(input.ledger, "document_excerpt_bytes"),
        limits?.observed,
        limits?.unprocessed
      ))
    } else {
      issues.push(unprocessedIssue("document_evidence_incomplete", undefined, targetFromWarning(warning, "document-evidence")))
    }
  }
  for (const warning of input.codeWarnings ?? []) {
    const limits = matchByteLimit(warning)
    if (/code evidence|source analysis|source context|code slice/iu.test(warning) && /truncat|exhaust/iu.test(warning)) {
      issues.push(truncationIssue(
        "code_evidence_truncated",
        "bob_input_bytes",
        "code-evidence",
        committed(input.ledger, "bob_input_bytes"),
        limits?.observed,
        limits?.unprocessed
      ))
    } else {
      issues.push(unprocessedIssue("code_evidence_incomplete", undefined, targetFromWarning(warning, "code-evidence")))
    }
  }
  appendWarningFamily(
    issues,
    input.repositoryWarnings,
    "repository_evidence_incomplete",
    "repository-index",
    (warning) => BENIGN_REPOSITORY_CACHE_INVALIDATION.test(warning)
  )
  appendWarningFamily(issues, input.contextWarnings, "context_evidence_incomplete", "context-budget")
  appendWarningFamily(issues, input.traceabilityWarnings, "traceability_evidence_incomplete", "traceability")
  appendWarningFamily(issues, input.ledgerWarnings, "artifact_ledger_incomplete", "artifact-ledger")
  for (const warning of input.packageWarnings ?? []) {
    const limits = matchByteLimit(warning)
    if (/bob-input|bob_input_bytes|review package/iu.test(warning) && /truncat|exhaust/iu.test(warning)) {
      issues.push(truncationIssue(
        "bob_input_truncated",
        "bob_input_bytes",
        "bob-input.md",
        committed(input.ledger, "bob_input_bytes"),
        limits?.observed,
        limits?.unprocessed
      ))
    } else {
      issues.push(unprocessedIssue("review_package_incomplete", undefined, targetFromWarning(warning, "review-package")))
    }
  }
  return Object.freeze(issues)
}

export function failureFromProcessingError(error: unknown): SharedProcessingBudgetReportFailure {
  const record = typeof error === "object" && error !== null ? error as Record<string, unknown> : undefined
  const details = record && typeof record.details === "object" && record.details !== null
    ? record.details as Record<string, unknown>
    : undefined
  const category = safeCategory(details?.constrainedCategory ?? record?.category)
  const target = safeText(details?.target ?? record?.target)
  const limit = safeInteger(details?.limit ?? record?.limit)
  const observed = safeInteger(details?.observed ?? record?.observed)
  return Object.freeze({
    code: safeFailureCode(record?.code),
    ...(category === undefined ? {} : { category }),
    ...(target === undefined ? {} : { target }),
    ...(limit === undefined ? {} : { limit }),
    ...(observed === undefined ? {} : { observed })
  })
}

export function outcomeFromProcessingError(error: unknown): "failed" | "cancelled" {
  if (typeof error === "object" && error !== null && "code" in error
    && (error as { readonly code?: unknown }).code === "processing_cancelled") {
    return "cancelled"
  }
  return "failed"
}

export function assertCompleteProcessingCoverage(
  persisted: PersistedProcessingBudgetReport,
  expectedInputSha256: string
): SharedProcessingBudgetReport {
  const normalized = validateProcessingBudgetReport(persisted.report, { expected_input_sha256: expectedInputSha256 })
  if (normalized.outcome !== "success" || normalized.coverage_status !== "complete" || normalized.issues.length !== 0) {
    throw Object.assign(new Error("Processing coverage is incomplete; Bob handoff is blocked."), {
      code: "processing_coverage_incomplete",
      report: normalized
    })
  }
  return normalized
}

function appendWarningFamily(
  issues: SharedProcessingBudgetReportIssue[],
  warnings: readonly string[] | undefined,
  code: string,
  fallbackTarget: string,
  ignore: (warning: string) => boolean = () => false
): void {
  for (const warning of warnings ?? []) {
    if (ignore(warning)) continue
    issues.push(unprocessedIssue(code, undefined, targetFromWarning(warning, fallbackTarget)))
  }
}

function truncationIssue(
  code: string,
  category: SharedProcessingBudgetCategory,
  target: string,
  processed: number,
  observed: number | undefined,
  unprocessed: number | undefined
): SharedProcessingBudgetReportIssue {
  const safeObserved = observed !== undefined && observed >= processed ? observed : undefined
  const safeUnprocessed = safeObserved === undefined
    ? undefined
    : unprocessed !== undefined && processed + unprocessed === safeObserved
      ? unprocessed
      : safeObserved - processed
  return Object.freeze({
    kind: "truncation" as const,
    code,
    category,
    target,
    processed,
    ...(safeObserved === undefined ? {} : { observed: safeObserved }),
    ...(safeUnprocessed === undefined ? {} : { unprocessed: safeUnprocessed })
  })
}

function unprocessedIssue(
  code: string,
  category: SharedProcessingBudgetCategory | undefined,
  target: string
): SharedProcessingBudgetReportIssue {
  return Object.freeze({
    kind: "unprocessed" as const,
    code,
    ...(category === undefined ? {} : { category }),
    target
  })
}

function matchByteLimit(value: string): { observed?: number; limit?: number; unprocessed?: number } | undefined {
  const match = /\((\d+)\s*>\s*(\d+)\)/u.exec(value)
  if (!match) return undefined
  const observed = Number(match[1])
  const limit = Number(match[2])
  if (!Number.isSafeInteger(observed) || !Number.isSafeInteger(limit) || observed < 0 || limit < 0) return undefined
  return { observed, limit, unprocessed: Math.max(0, observed - limit) }
}

function targetFromWarning(warning: string, fallback: string): string {
  const candidate = /^failed to (?:extract|read|load)\s+([^:]+):/iu.exec(warning)?.[1]
    ?? /(?:file|document|source|artifact)\s+([^\s,;]+)/iu.exec(warning)?.[1]
    ?? fallback
  return truncateUtf8Prefix(candidate.normalize("NFC"), MAX_REPORT_TEXT_UTF8_BYTES)
}

function committed(ledger: SharedProcessingBudgetLedger, category: SharedProcessingBudgetCategory): number {
  return ledger.snapshot().categories.find((entry) => entry.category === category)?.committed ?? 0
}

function safeFailureCode(value: unknown): string {
  return typeof value === "string"
    && Buffer.byteLength(value, "utf8") <= MAX_REPORT_TEXT_UTF8_BYTES
    && /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(value)
    ? value
    : "processing_failed"
}

function safeCategory(value: unknown): SharedProcessingBudgetCategory | undefined {
  return typeof value === "string" && [
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
  ].includes(value)
    ? value as SharedProcessingBudgetCategory
    : undefined
}

function safeText(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) return undefined
  return truncateUtf8Prefix(value.normalize("NFC"), MAX_REPORT_TEXT_UTF8_BYTES) || undefined
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
