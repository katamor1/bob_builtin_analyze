"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

function runtime() {
  return require("../out/index.js")
}

class FakeReservation {
  constructor(record) {
    this.record = record
    this.finalized = false
  }

  commit(actual = this.record.amount) {
    assert.equal(this.finalized, false, "reservation finalized twice")
    assert.equal(actual, this.record.amount)
    this.finalized = true
    this.record.status = "committed"
  }

  release() {
    assert.equal(this.finalized, false, "reservation finalized twice")
    this.finalized = true
    this.record.status = "released"
  }
}

class FakeLedger {
  constructor({ failAt, error } = {}) {
    this.failAt = failAt
    this.error = error ?? Object.assign(new Error("budget exceeded"), {
      code: "processing_budget_exceeded",
      details: Object.freeze({
        targetCategory: "rows_per_sheet",
        constrainedCategory: "total_rows",
        limit: 3,
        observed: 4
      })
    })
    this.calls = []
  }

  reserveForTarget(category, target, amount) {
    const record = { category, target, amount, status: "reserved" }
    this.calls.push(record)
    if (this.calls.length === this.failAt) throw this.error
    return new FakeReservation(record)
  }
}

function workbookSheets(prefix, count, rows) {
  return Array.from({ length: count }, (_, index) => ({
    target: `${prefix}:sheet:${index}`,
    rows
  }))
}

function expectExceeded(action, constrainedCategory, limit, observed) {
  assert.throws(action, (error) => {
    assert.equal(error?.code, "processing_budget_exceeded")
    assert.equal(error?.details?.constrainedCategory, constrainedCategory)
    assert.equal(error?.details?.limit, limit)
    assert.equal(error?.details?.observed, observed)
    return true
  })
}

test("reserves one workbook and every sheet before committing", () => {
  const { commitWorkbookBudget } = runtime()
  const ledger = new FakeLedger()
  const result = commitWorkbookBudget({
    ledger,
    workbookTarget: "book-a",
    sheets: [
      { target: "book-a:sheet:0", rows: 2 },
      { target: "book-a:sheet:1", rows: 3 }
    ]
  })

  assert.deepEqual(ledger.calls, [
    { category: "sheets_per_workbook", target: "book-a", amount: 2, status: "committed" },
    { category: "rows_per_sheet", target: "book-a:sheet:0", amount: 2, status: "committed" },
    { category: "rows_per_sheet", target: "book-a:sheet:1", amount: 3, status: "committed" }
  ])
  assert.deepEqual(result, { sheetCount: 2, rowCount: 5 })
})

test("releases earlier reservations when a later aggregate reservation fails", () => {
  const { commitWorkbookBudget } = runtime()
  const error = Object.assign(new Error("rows exceeded"), {
    code: "processing_budget_exceeded",
    details: Object.freeze({ constrainedCategory: "total_rows", limit: 3, observed: 4 })
  })
  const ledger = new FakeLedger({ failAt: 3, error })

  assert.throws(() => commitWorkbookBudget({
    ledger,
    workbookTarget: "book-b",
    sheets: [
      { target: "book-b:sheet:0", rows: 2 },
      { target: "book-b:sheet:1", rows: 2 }
    ]
  }), (caught) => caught === error)
  assert.deepEqual(ledger.calls.map((record) => record.status), ["released", "released", "reserved"])
})

test("cancellation during enumeration releases every pending reservation", () => {
  const { commitWorkbookBudget } = runtime()
  const ledger = new FakeLedger()
  const controller = new AbortController()
  const sheets = [
    { target: "book-c:sheet:0", rows: 1 },
    {
      get target() {
        controller.abort(new Error("operator cancelled"))
        return "book-c:sheet:1"
      },
      rows: 1
    }
  ]

  assert.throws(
    () => commitWorkbookBudget({ ledger, workbookTarget: "book-c", sheets, signal: controller.signal }),
    /operator cancelled/
  )
  assert.deepEqual(ledger.calls.map((record) => record.status), ["released", "released"])
})

test("rejects malformed row counts before committing any reservation", () => {
  const { commitWorkbookBudget } = runtime()
  const ledger = new FakeLedger()
  assert.throws(() => commitWorkbookBudget({
    ledger,
    workbookTarget: "book-d",
    sheets: [{ target: "book-d:sheet:0", rows: Number.MAX_SAFE_INTEGER + 1 }]
  }), /non-negative safe integer/)
  assert.deepEqual(ledger.calls.map((record) => record.status), ["released"])
})

test("default profile enforces 20 sheets, 100 total sheets, 500 rows, and 25,000 total rows", () => {
  const { ProcessingBudgetLedger, commitWorkbookBudget } = runtime()

  const localSheets = new ProcessingBudgetLedger()
  commitWorkbookBudget({ ledger: localSheets, workbookTarget: "local-sheet-exact", sheets: workbookSheets("local-sheet-exact", 20, 0) })
  expectExceeded(
    () => commitWorkbookBudget({ ledger: new ProcessingBudgetLedger(), workbookTarget: "local-sheet-over", sheets: workbookSheets("local-sheet-over", 21, 0) }),
    "sheets_per_workbook",
    20,
    21
  )

  const totalSheets = new ProcessingBudgetLedger()
  for (let book = 0; book < 5; book += 1) {
    commitWorkbookBudget({ ledger: totalSheets, workbookTarget: `sheet-book-${book}`, sheets: workbookSheets(`sheet-book-${book}`, 20, 0) })
  }
  expectExceeded(
    () => commitWorkbookBudget({ ledger: totalSheets, workbookTarget: "sheet-book-over", sheets: workbookSheets("sheet-book-over", 1, 0) }),
    "total_sheets",
    100,
    101
  )

  commitWorkbookBudget({ ledger: new ProcessingBudgetLedger(), workbookTarget: "local-row-exact", sheets: [{ target: "local-row-exact:sheet:0", rows: 500 }] })
  expectExceeded(
    () => commitWorkbookBudget({ ledger: new ProcessingBudgetLedger(), workbookTarget: "local-row-over", sheets: [{ target: "local-row-over:sheet:0", rows: 501 }] }),
    "rows_per_sheet",
    500,
    501
  )

  const totalRows = new ProcessingBudgetLedger()
  for (let book = 0; book < 5; book += 1) {
    commitWorkbookBudget({ ledger: totalRows, workbookTarget: `row-book-${book}`, sheets: workbookSheets(`row-book-${book}`, 10, 500) })
  }
  expectExceeded(
    () => commitWorkbookBudget({ ledger: totalRows, workbookTarget: "row-book-over", sheets: [{ target: "row-book-over:sheet:0", rows: 1 }] }),
    "total_rows",
    25_000,
    25_001
  )
})

test("absolute profile enforces 100 sheets, 1,000 total sheets, 5,000 rows, and 250,000 total rows", () => {
  const { ABSOLUTE_PROCESSING_BUDGET_PROFILE, ProcessingBudgetLedger, commitWorkbookBudget } = runtime()
  const absoluteLedger = () => new ProcessingBudgetLedger(ABSOLUTE_PROCESSING_BUDGET_PROFILE)

  commitWorkbookBudget({ ledger: absoluteLedger(), workbookTarget: "absolute-sheet-exact", sheets: workbookSheets("absolute-sheet-exact", 100, 0) })
  expectExceeded(
    () => commitWorkbookBudget({ ledger: absoluteLedger(), workbookTarget: "absolute-sheet-over", sheets: workbookSheets("absolute-sheet-over", 101, 0) }),
    "sheets_per_workbook",
    100,
    101
  )

  const totalSheets = absoluteLedger()
  for (let book = 0; book < 10; book += 1) {
    commitWorkbookBudget({ ledger: totalSheets, workbookTarget: `absolute-sheet-book-${book}`, sheets: workbookSheets(`absolute-sheet-book-${book}`, 100, 0) })
  }
  expectExceeded(
    () => commitWorkbookBudget({ ledger: totalSheets, workbookTarget: "absolute-sheet-book-over", sheets: workbookSheets("absolute-sheet-book-over", 1, 0) }),
    "total_sheets",
    1_000,
    1_001
  )

  commitWorkbookBudget({ ledger: absoluteLedger(), workbookTarget: "absolute-row-exact", sheets: [{ target: "absolute-row-exact:sheet:0", rows: 5_000 }] })
  expectExceeded(
    () => commitWorkbookBudget({ ledger: absoluteLedger(), workbookTarget: "absolute-row-over", sheets: [{ target: "absolute-row-over:sheet:0", rows: 5_001 }] }),
    "rows_per_sheet",
    5_000,
    5_001
  )

  const totalRows = absoluteLedger()
  for (let book = 0; book < 50; book += 1) {
    commitWorkbookBudget({ ledger: totalRows, workbookTarget: `absolute-row-book-${book}`, sheets: [{ target: `absolute-row-book-${book}:sheet:0`, rows: 5_000 }] })
  }
  expectExceeded(
    () => commitWorkbookBudget({ ledger: totalRows, workbookTarget: "absolute-row-book-over", sheets: [{ target: "absolute-row-book-over:sheet:0", rows: 1 }] }),
    "total_rows",
    250_000,
    250_001
  )
})
