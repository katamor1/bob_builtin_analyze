"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { createPipelineProcessingBudgetLedger } = require("../out/core/processingBudgetPipeline")
const {
  PROCESSING_BUDGET_ABSOLUTE_MAXIMA
} = require("../out/sharedProcessingBudgetRuntime")

const MiB = 1024 * 1024

function limits(overrides = {}) {
  return {
    maxDocumentBytes: 5 * MiB,
    maxWorkbookSheets: 20,
    maxRowsPerSheet: 500,
    maxExcerptBytesPerDocument: 64 * 1024,
    maxRawDiffBytes: 1 * MiB,
    maxBobInputBytes: 2 * MiB,
    ...overrides
  }
}

test("derives the default pipeline processing profile from extension limits", () => {
  const profile = createPipelineProcessingBudgetLedger(limits()).profile.limits
  assert.equal(profile.single_document_bytes, 5 * MiB)
  assert.equal(profile.total_document_bytes, 32 * MiB)
  assert.equal(profile.raw_diff_bytes, 1 * MiB)
  assert.equal(profile.document_excerpt_bytes, 2 * MiB)
  assert.equal(profile.bob_input_bytes, 2 * MiB)
  assert.equal(profile.total_operation_input_bytes, 64 * MiB)
})

test("clamps every operation-input child below an explicit lower parent", () => {
  const profile = createPipelineProcessingBudgetLedger(limits({
    maxDocumentBytes: 4096,
    maxRawDiffBytes: 4096,
    maxBobInputBytes: 4096
  }), {
    single_document_bytes: 2000,
    total_document_bytes: 3000,
    raw_diff_bytes: 3000,
    document_excerpt_bytes: 3000,
    bob_input_bytes: 3000,
    total_operation_input_bytes: 1000
  }).profile.limits

  assert.equal(profile.total_operation_input_bytes, 1000)
  assert.equal(profile.total_document_bytes, 1000)
  assert.equal(profile.single_document_bytes, 1000)
  assert.equal(profile.raw_diff_bytes, 1000)
  assert.equal(profile.document_excerpt_bytes, 1000)
  assert.equal(profile.bob_input_bytes, 1000)
})

test("clamps workbook-local caps below explicit aggregate sheet and row limits", () => {
  const profile = createPipelineProcessingBudgetLedger(limits(), {
    sheets_per_workbook: 20,
    total_sheets: 1,
    rows_per_sheet: 500,
    total_rows: 2
  }).profile.limits

  assert.equal(profile.sheets_per_workbook, 1)
  assert.equal(profile.total_sheets, 1)
  assert.equal(profile.rows_per_sheet, 2)
  assert.equal(profile.total_rows, 2)
})

test("raises implicit aggregate parents enough for configured absolute local limits", () => {
  const profile = createPipelineProcessingBudgetLedger(limits({
    maxDocumentBytes: PROCESSING_BUDGET_ABSOLUTE_MAXIMA.single_document_bytes,
    maxWorkbookSheets: PROCESSING_BUDGET_ABSOLUTE_MAXIMA.sheets_per_workbook,
    maxRowsPerSheet: PROCESSING_BUDGET_ABSOLUTE_MAXIMA.rows_per_sheet,
    maxRawDiffBytes: PROCESSING_BUDGET_ABSOLUTE_MAXIMA.raw_diff_bytes,
    maxBobInputBytes: PROCESSING_BUDGET_ABSOLUTE_MAXIMA.bob_input_bytes
  })).profile.limits

  assert.equal(profile.single_document_bytes, 50 * MiB)
  assert.equal(profile.total_document_bytes, 50 * MiB)
  assert.equal(profile.total_operation_input_bytes, 64 * MiB)
  assert.equal(profile.sheets_per_workbook, 100)
  assert.equal(profile.total_sheets, 100)
  assert.equal(profile.rows_per_sheet, 5000)
  assert.equal(profile.total_rows, 25_000)
})

test("does not hide operation categories above their absolute maxima", () => {
  assert.throws(
    () => createPipelineProcessingBudgetLedger(limits(), {
      changed_files: PROCESSING_BUDGET_ABSOLUTE_MAXIMA.changed_files + 1
    }),
    (error) => error?.code === "processing_budget_profile_invalid"
  )
})
