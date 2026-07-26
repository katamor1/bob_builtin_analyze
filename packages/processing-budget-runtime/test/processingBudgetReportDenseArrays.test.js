"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  ProcessingBudgetLedger,
  createProcessingBudgetReport,
  serializeProcessingBudgetReport,
  validateProcessingBudgetReport
} = require("../out")

const INPUT_SHA = `sha256:${"a".repeat(64)}`

function input(overrides = {}) {
  const ledger = new ProcessingBudgetLedger()
  return {
    producer: { id: "bob-code-consistency-review", version: "0.1.0" },
    operation_id: "review:dense-arrays",
    input_sha256: INPUT_SHA,
    outcome: "success",
    ledger: ledger.snapshot(),
    ...overrides
  }
}

function invalid(error) {
  return error?.code === "processing_budget_report_invalid"
}

test("programmatic report creation rejects a sparse issues array", () => {
  assert.throws(
    () => createProcessingBudgetReport(input({ issues: new Array(1) })),
    invalid
  )
})

test("huge sparse issues fail without iterating every missing slot", () => {
  const issues = new Array(0xffff_ffff)
  const started = process.hrtime.bigint()
  assert.throws(() => createProcessingBudgetReport(input({ issues })), invalid)
  const elapsedMilliseconds = Number(process.hrtime.bigint() - started) / 1_000_000
  assert.ok(elapsedMilliseconds < 1_000, `sparse-array rejection took ${elapsedMilliseconds} ms`)
})

test("external validation rejects sparse ledger category and target arrays", () => {
  const complete = JSON.parse(serializeProcessingBudgetReport(createProcessingBudgetReport(input())))

  const sparseCategories = structuredClone(complete)
  delete sparseCategories.ledger.categories[0]
  assert.throws(() => validateProcessingBudgetReport(sparseCategories), invalid)

  const ledger = new ProcessingBudgetLedger()
  ledger.reserveForTarget("single_document_bytes", "doc:1", 1).commit()
  const withTarget = JSON.parse(serializeProcessingBudgetReport(createProcessingBudgetReport(input({ ledger: ledger.snapshot() }))))
  delete withTarget.ledger.targets[0]
  assert.throws(() => validateProcessingBudgetReport(withTarget), invalid)
})

test("report arrays reject named, symbol, and accessor-backed state", () => {
  const named = []
  named.extra = true
  assert.throws(() => createProcessingBudgetReport(input({ issues: named })), invalid)

  const symbolic = []
  symbolic[Symbol("extra")] = true
  assert.throws(() => createProcessingBudgetReport(input({ issues: symbolic })), invalid)

  const accessor = []
  Object.defineProperty(accessor, "0", { enumerable: true, get: () => ({ kind: "unprocessed", code: "x" }) })
  accessor.length = 1
  assert.throws(() => createProcessingBudgetReport(input({ issues: accessor })), invalid)
})
