import type { ProcessingBudgetCategory } from "./generatedProcessingBudgetDefinition"

export type ProcessingBudgetErrorCode =
  | "processing_budget_profile_invalid"
  | "processing_budget_category_invalid"
  | "processing_budget_target_required"
  | "processing_budget_target_invalid"
  | "processing_budget_reservation_invalid"
  | "processing_budget_exceeded"
  | "processing_budget_commit_invalid"
  | "processing_budget_reservation_finalized"
  | "processing_budget_internal_invariant"

export interface ProcessingBudgetErrorDetails {
  readonly targetCategory?: string
  readonly target?: string
  readonly constrainedCategory?: ProcessingBudgetCategory
  readonly limit?: number
  readonly observed?: number
}

export class ProcessingBudgetError extends Error {
  readonly code: ProcessingBudgetErrorCode
  readonly details: Readonly<ProcessingBudgetErrorDetails>

  constructor(code: ProcessingBudgetErrorCode, message: string, details: ProcessingBudgetErrorDetails = {}) {
    super(message)
    this.name = "ProcessingBudgetError"
    this.code = code
    this.details = Object.freeze({ ...details })
    Object.setPrototypeOf(this, new.target.prototype)
  }
}
