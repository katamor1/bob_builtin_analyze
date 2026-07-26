declare const require: (id: string) => unknown

import type { SharedProcessingBudgetLimits } from "./sharedProcessingBudgetRuntime"

export type SharedProcessingBudgetCategory = keyof SharedProcessingBudgetLimits
export type SharedProcessingBudgetCoverageStatus = "complete" | "partial" | "failed"
export type SharedProcessingBudgetOperationOutcome = "success" | "failed" | "cancelled"

export interface SharedProcessingBudgetLedgerCategoryReport {
  readonly category: SharedProcessingBudgetCategory
  readonly scope: "operation" | "target"
  readonly unit: "bytes" | "count"
  readonly limit: number
  readonly committed: number
  readonly reserved: number
  readonly used: number
  readonly remaining?: number
  readonly target_count?: number
}

export interface SharedProcessingBudgetLedgerTargetReport {
  readonly category: "single_document_bytes" | "sheets_per_workbook" | "rows_per_sheet"
  readonly target: string
  readonly unit: "bytes" | "count"
  readonly limit: number
  readonly committed: number
  readonly reserved: number
  readonly used: number
  readonly remaining: number
}

export interface SharedProcessingBudgetLedgerReport {
  readonly schema_version: "processing-budget-ledger-report/v1"
  readonly categories: readonly SharedProcessingBudgetLedgerCategoryReport[]
  readonly targets: readonly SharedProcessingBudgetLedgerTargetReport[]
}

declare module "./sharedProcessingBudgetRuntime" {
  interface SharedProcessingBudgetLedger {
    snapshot(): SharedProcessingBudgetLedgerReport
  }
}

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
