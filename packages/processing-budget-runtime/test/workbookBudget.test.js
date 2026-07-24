"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")
const { loadRuntime, snapshot } = require("./helpers")

test("commits workbook-local and operation-wide sheet and row budgets atomically", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger({
    limits: {
      sheets_per_workbook: 2,
      total_sheets: 3,
      rows_per_sheet: 2,
      total_rows: 4
    }
  })

  assert.deepEqual(runtime.commitWorkbookBudget({
    ledger,
    workbookTarget: "book-a",
    sheets: [
      { target: "book-a:sheet-0", rows: 2 },
      { target: "book-a:sheet-1", rows: 2 }
    ]
  }), { sheetCount: 2, rowCount: 4 })

  const report = ledger.snapshot()
  assert.equal(report.categories.find((item) => item.category === "total_sheets").committed, 2)
  assert.equal(report.categories.find((item) => item.category === "total_rows").committed, 4)
})

test("releases the whole workbook reservation when a later sheet exceeds total rows", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger({
    limits: {
      sheets_per_workbook: 2,
      total_sheets: 2,
      rows_per_sheet: 2,
      total_rows: 3
    }
  })
  const before = snapshot(runtime, ledger)

  assert.throws(
    () => runtime.commitWorkbookBudget({
      ledger,
      workbookTarget: "book-b",
      sheets: [
        { target: "book-b:sheet-0", rows: 2 },
        { target: "book-b:sheet-1", rows: 2 }
      ]
    }),
    (error) => error.code === "processing_budget_exceeded"
      && error.details.targetCategory === "rows_per_sheet"
      && error.details.constrainedCategory === "total_rows"
      && error.details.limit === 3
      && error.details.observed === 4
  )
  assert.deepEqual(snapshot(runtime, ledger), before)
})

test("cancellation during enumeration releases every pending reservation", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  const before = snapshot(runtime, ledger)
  const controller = new AbortController()
  const sheets = [
    { target: "book-c:sheet-0", rows: 1 },
    {
      get target() {
        controller.abort(new Error("operator cancelled"))
        return "book-c:sheet-1"
      },
      rows: 1
    }
  ]

  assert.throws(
    () => runtime.commitWorkbookBudget({ ledger, workbookTarget: "book-c", sheets, signal: controller.signal }),
    /operator cancelled/
  )
  assert.deepEqual(snapshot(runtime, ledger), before)
})

test("structured cancellation signals preserve deadline and user causes", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  const userReason = new Error("operator cancelled")

  assert.throws(
    () => runtime.commitWorkbookBudget({
      ledger,
      workbookTarget: "deadline-book",
      sheets: [],
      signal: {
        aborted: true,
        reason: { code: "processing_cancelled", kind: "deadline", original_reason: undefined }
      }
    }),
    (error) => error?.code === "processing_cancelled" && error.kind === "deadline"
  )
  assert.throws(
    () => runtime.commitWorkbookBudget({
      ledger,
      workbookTarget: "user-book",
      sheets: [],
      signal: {
        aborted: true,
        reason: { code: "processing_cancelled", kind: "user", original_reason: userReason }
      }
    }),
    (error) => error?.code === "processing_cancelled"
      && error.kind === "user"
      && error.original_reason === userReason
  )
})

test("the configured absolute profile accepts its exact workbook and row boundaries", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger(runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE)
  const sheets = Array.from({ length: 50 }, (_, index) => ({
    target: `maximum:sheet-${index}`,
    rows: 5_000
  }))

  assert.deepEqual(runtime.commitWorkbookBudget({
    ledger,
    workbookTarget: "maximum-workbook",
    sheets
  }), { sheetCount: 50, rowCount: 250_000 })
})
