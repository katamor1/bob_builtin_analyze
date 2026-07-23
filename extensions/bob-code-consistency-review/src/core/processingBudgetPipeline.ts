import {
  DEFAULT_PROCESSING_BUDGET_PROFILE,
  ProcessingBudgetLedger,
  type SharedProcessingBudgetLedger,
  type SharedProcessingBudgetLimits
} from "../sharedProcessingBudgetRuntime"
import type { ReviewProcessingLimits } from "./limits"

export function createPipelineProcessingBudgetLedger(
  limits: ReviewProcessingLimits,
  overrides: Readonly<Partial<SharedProcessingBudgetLimits>> | undefined
): SharedProcessingBudgetLedger {
  const requestedSingleDocumentBytes = Math.min(
    overrides?.single_document_bytes ?? limits.maxDocumentBytes,
    limits.maxDocumentBytes
  )
  const requestedTotalDocumentBytes = overrides?.total_document_bytes ?? Math.max(
    requestedSingleDocumentBytes,
    DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_document_bytes
  )
  const requestedRawDiffBytes = Math.min(
    overrides?.raw_diff_bytes ?? limits.maxRawDiffBytes,
    limits.maxRawDiffBytes
  )
  const requestedDocumentExcerptBytes = Math.min(
    overrides?.document_excerpt_bytes ?? limits.maxBobInputBytes,
    limits.maxBobInputBytes
  )
  const requestedBobInputBytes = Math.min(
    overrides?.bob_input_bytes ?? limits.maxBobInputBytes,
    limits.maxBobInputBytes
  )
  const totalOperationInputBytes = overrides?.total_operation_input_bytes ?? Math.max(
    DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_operation_input_bytes,
    requestedTotalDocumentBytes,
    requestedRawDiffBytes,
    requestedDocumentExcerptBytes,
    requestedBobInputBytes
  )
  const totalDocumentBytes = Math.min(requestedTotalDocumentBytes, totalOperationInputBytes)
  const totalSheets = overrides?.total_sheets ?? Math.max(
    overrides?.sheets_per_workbook ?? limits.maxWorkbookSheets,
    DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_sheets
  )
  const totalRows = overrides?.total_rows ?? Math.max(
    overrides?.rows_per_sheet ?? limits.maxRowsPerSheet,
    DEFAULT_PROCESSING_BUDGET_PROFILE.limits.total_rows
  )

  return new ProcessingBudgetLedger({
    limits: {
      ...overrides,
      single_document_bytes: Math.min(requestedSingleDocumentBytes, totalDocumentBytes),
      total_document_bytes: totalDocumentBytes,
      sheets_per_workbook: Math.min(
        overrides?.sheets_per_workbook ?? limits.maxWorkbookSheets,
        limits.maxWorkbookSheets,
        totalSheets
      ),
      total_sheets: totalSheets,
      rows_per_sheet: Math.min(
        overrides?.rows_per_sheet ?? limits.maxRowsPerSheet,
        limits.maxRowsPerSheet,
        totalRows
      ),
      total_rows: totalRows,
      raw_diff_bytes: Math.min(requestedRawDiffBytes, totalOperationInputBytes),
      document_excerpt_bytes: Math.min(requestedDocumentExcerptBytes, totalOperationInputBytes),
      bob_input_bytes: Math.min(requestedBobInputBytes, totalOperationInputBytes),
      total_operation_input_bytes: totalOperationInputBytes
    }
  })
}
