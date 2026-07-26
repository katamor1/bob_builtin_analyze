import type { SharedProcessingBudgetReportIssue } from "../sharedProcessingBudgetReport"

export class ProcessingCoveragePartialError extends Error {
  readonly code = "processing_coverage_partial" as const
  readonly issues: readonly SharedProcessingBudgetReportIssue[]
  readonly reportPath?: string

  constructor(
    issues: readonly SharedProcessingBudgetReportIssue[],
    reportPath?: string,
    message = "Processing coverage is partial; formal handoff is blocked."
  ) {
    super(message)
    this.name = "ProcessingCoveragePartialError"
    this.issues = Object.freeze(issues.map((issue) => Object.freeze({ ...issue })))
    this.reportPath = reportPath
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
