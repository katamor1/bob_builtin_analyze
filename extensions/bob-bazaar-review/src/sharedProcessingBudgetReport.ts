declare const require: (id: string) => unknown

import type {
  SharedProcessingBudgetCategory,
  SharedProcessingBudgetLedgerReport
} from "./sharedProcessingBudgetRuntime"

export type {
  SharedProcessingBudgetCategory,
  SharedProcessingBudgetLedgerCategoryReport,
  SharedProcessingBudgetLedgerReport,
  SharedProcessingBudgetLedgerTargetReport
} from "./sharedProcessingBudgetRuntime"

export type SharedProcessingBudgetCoverageStatus = "complete" | "partial" | "failed"
export type SharedProcessingBudgetOperationOutcome = "success" | "failed" | "cancelled"

export interface SharedProcessingBudgetReportIssue {
  readonly kind: "truncation" | "unprocessed"
  readonly code: string
  readonly category?: SharedProcessingBudgetCategory
  readonly target?: string
  readonly processed?: number
  readonly observed?: number
  readonly unprocessed?: number
}

export interface SharedProcessingBudgetReportFailure {
  readonly code: string
  readonly category?: SharedProcessingBudgetCategory
  readonly target?: string
  readonly limit?: number
  readonly observed?: number
}

export interface SharedProcessingBudgetReport {
  readonly schema_version: "processing-budget-report/v1"
  readonly producer: Readonly<{ id: string; version: string }>
  readonly operation_id: string
  readonly input_sha256: string
  readonly outcome: SharedProcessingBudgetOperationOutcome
  readonly coverage_status: SharedProcessingBudgetCoverageStatus
  readonly ledger: SharedProcessingBudgetLedgerReport
  readonly issues: readonly SharedProcessingBudgetReportIssue[]
  readonly failure?: SharedProcessingBudgetReportFailure
}

export interface SharedCreateProcessingBudgetReportInput {
  readonly producer: Readonly<{ id: string; version: string }>
  readonly operation_id: string
  readonly input_sha256: string
  readonly outcome: SharedProcessingBudgetOperationOutcome
  readonly ledger: unknown
  readonly issues?: readonly SharedProcessingBudgetReportIssue[]
  readonly failure?: SharedProcessingBudgetReportFailure
}

interface SharedProcessingBudgetReportRuntime {
  createProcessingBudgetReport(input: SharedCreateProcessingBudgetReportInput): SharedProcessingBudgetReport
  serializeProcessingBudgetReport(value: unknown): string
  validateProcessingBudgetReport(value: unknown, options?: Readonly<{ expected_input_sha256?: string }>): SharedProcessingBudgetReport
  assertProcessingBudgetReportAllowsHandoff(value: unknown, options?: Readonly<{ expected_input_sha256?: string }>): SharedProcessingBudgetReport
}

const runtime = require("./shared-processing-budget-runtime") as SharedProcessingBudgetReportRuntime

export const createProcessingBudgetReport = runtime.createProcessingBudgetReport
export const serializeProcessingBudgetReport = runtime.serializeProcessingBudgetReport
export const validateProcessingBudgetReport = runtime.validateProcessingBudgetReport
export const assertProcessingBudgetReportAllowsHandoff = runtime.assertProcessingBudgetReportAllowsHandoff
