"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")
const { loadRuntime, snapshot } = require("./helpers")

const MiB = 1_048_576

function byCategory(report, category) {
  const entry = report.categories.find((candidate) => candidate.category === category)
  assert.ok(entry, `missing report category ${category}`)
  return entry
}

function expectCode(runtime, code, operation) {
  assert.throws(operation, (error) => {
    assert.equal(error instanceof runtime.ProcessingBudgetError, true)
    assert.equal(error.code, code)
    return true
  })
}

test("reserves each category at its boundary and rejects limit plus one without mutating state", () => {
  const runtime = loadRuntime()
  for (const definition of runtime.PROCESSING_BUDGET_DEFINITION) {
    const ledger = new runtime.ProcessingBudgetLedger()
    const before = snapshot(runtime, ledger)
    const reservation = ledger.reserve(definition.id, definition.defaultLimit)
    const reserved = byCategory(ledger.snapshot(), definition.id)
    assert.equal(reserved.reserved, definition.defaultLimit)
    expectCode(runtime, "processing_budget_exceeded", () => ledger.reserve(definition.id, 1))
    assert.deepEqual(snapshot(runtime, ledger), ledger.snapshot().categories)
    reservation.release()
    assert.deepEqual(snapshot(runtime, ledger), before)
  }
})

test("atomically debits category and aggregate chains", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  const document = ledger.reserve("single_document_bytes", 3 * MiB)
  let report = ledger.snapshot()
  assert.equal(byCategory(report, "single_document_bytes").reserved, 3 * MiB)
  assert.equal(byCategory(report, "total_document_bytes").reserved, 3 * MiB)
  assert.equal(byCategory(report, "total_operation_input_bytes").reserved, 3 * MiB)

  const sheet = ledger.reserve("sheets_per_workbook", 7)
  const row = ledger.reserve("rows_per_sheet", 11)
  report = ledger.snapshot()
  assert.equal(byCategory(report, "total_sheets").reserved, 7)
  assert.equal(byCategory(report, "total_rows").reserved, 11)

  document.release()
  sheet.release()
  row.release()
})

test("enforces the total operation budget across independent byte categories", () => {
  const runtime = loadRuntime()
  const profile = runtime.normalizeProcessingBudgetProfile({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      raw_diff_bytes: 6 * MiB,
      document_excerpt_bytes: 0,
      bob_input_bytes: 6 * MiB,
      total_operation_input_bytes: 10 * MiB
    }
  })
  const ledger = new runtime.ProcessingBudgetLedger(profile)
  const diff = ledger.reserve("raw_diff_bytes", 6 * MiB)
  const before = snapshot(runtime, ledger)
  expectCode(runtime, "processing_budget_exceeded", () => ledger.reserve("bob_input_bytes", 5 * MiB))
  assert.deepEqual(snapshot(runtime, ledger), before)
  diff.release()
})

test("commit debits actual usage and releases the unused reservation", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  const reservation = ledger.reserve("raw_diff_bytes", 1_000)
  reservation.commit(640)
  const report = ledger.snapshot()
  assert.deepEqual(
    byCategory(report, "raw_diff_bytes"),
    {
      category: "raw_diff_bytes",
      unit: "bytes",
      limit: MiB,
      committed: 640,
      reserved: 0,
      used: 640,
      remaining: MiB - 640
    }
  )
  assert.equal(byCategory(report, "total_operation_input_bytes").committed, 640)
  assert.equal(byCategory(report, "total_operation_input_bytes").reserved, 0)
})

test("release returns the complete reservation without committing usage", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  const before = snapshot(runtime, ledger)
  const reservation = ledger.reserve("changed_files", 50)
  reservation.release()
  assert.deepEqual(snapshot(runtime, ledger), before)
})

test("rejects double commit, double release, and commit after release", () => {
  const runtime = loadRuntime()
  for (const finalize of ["commit", "release"]) {
    const ledger = new runtime.ProcessingBudgetLedger()
    const reservation = ledger.reserve("changed_files", 1)
    reservation[finalize]()
    expectCode(runtime, "processing_budget_reservation_finalized", () => reservation.commit())
    expectCode(runtime, "processing_budget_reservation_finalized", () => reservation.release())
  }
})

test("rejects invalid commit amounts while leaving the reservation releasable", () => {
  const runtime = loadRuntime()
  const invalid = [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, 11]
  for (const value of invalid) {
    const ledger = new runtime.ProcessingBudgetLedger()
    const reservation = ledger.reserve("changed_files", 10)
    expectCode(runtime, "processing_budget_commit_invalid", () => reservation.commit(value))
    assert.equal(byCategory(ledger.snapshot(), "changed_files").reserved, 10)
    reservation.release()
  }
})

test("rejects invalid categories and reservation amounts with overflow-safe arithmetic", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  expectCode(runtime, "processing_budget_category_invalid", () => ledger.reserve("not_a_category", 1))
  for (const amount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    expectCode(runtime, "processing_budget_reservation_invalid", () => ledger.reserve("changed_files", amount))
  }
  expectCode(runtime, "processing_budget_exceeded", () => ledger.reserve("changed_files", Number.MAX_SAFE_INTEGER))
  assert.equal(byCategory(ledger.snapshot(), "changed_files").used, 0)

  ledger.reserve("changed_files", 1).commit()
  assert.throws(() => ledger.reserve("changed_files", Number.MAX_SAFE_INTEGER), (error) => {
    assert.equal(error instanceof runtime.ProcessingBudgetError, true)
    assert.equal(error.code, "processing_budget_exceeded")
    assert.equal(error.details.observed, undefined)
    return true
  })
})

test("keeps the ledger shell frozen and runtime state inaccessible to consumers", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  assert.equal(Object.isFrozen(ledger), true)
  assert.equal("state" in ledger, false)
  assert.equal("reservations" in ledger, false)
  assert.throws(() => {
    ledger.profile = runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE
  }, TypeError)
  const reservation = ledger.reserve("changed_files", 1)
  reservation.commit()
  assert.equal(byCategory(ledger.snapshot(), "changed_files").committed, 1)
})

test("emits a deeply immutable report in canonical category order", () => {
  const runtime = loadRuntime()
  const ledger = new runtime.ProcessingBudgetLedger()
  ledger.reserve("changed_files", 2).commit(1)
  const report = ledger.snapshot()
  assert.equal(report.schema_version, "processing-budget-ledger-report/v1")
  assert.deepEqual(
    report.categories.map((entry) => entry.category),
    runtime.PROCESSING_BUDGET_CATEGORY_IDS
  )
  assert.equal(Object.isFrozen(report), true)
  assert.equal(Object.isFrozen(report.categories), true)
  assert.equal(report.categories.every(Object.isFrozen), true)
  assert.throws(() => {
    report.categories[0].remaining = 0
  }, TypeError)
})

test("preserves ledger invariants across deterministic boundary and property sequences", () => {
  const runtime = loadRuntime()
  let seed = 0x5eed1234
  const next = () => {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
    return seed
  }

  for (const definition of runtime.PROCESSING_BUDGET_DEFINITION) {
    const ledger = new runtime.ProcessingBudgetLedger()
    let expectedCommitted = 0
    for (let index = 0; index < 64; index += 1) {
      const remaining = definition.defaultLimit - expectedCommitted
      const requested = remaining === 0 ? 0 : next() % (Math.min(remaining, 257) + 1)
      const reservation = ledger.reserve(definition.id, requested)
      const actual = requested === 0 ? 0 : next() % (requested + 1)
      if ((next() & 1) === 0) {
        reservation.commit(actual)
        expectedCommitted += actual
      } else {
        reservation.release()
      }
      const entry = byCategory(ledger.snapshot(), definition.id)
      assert.equal(entry.committed, expectedCommitted)
      assert.equal(entry.reserved, 0)
      assert.equal(entry.used, expectedCommitted)
      assert.equal(entry.remaining, definition.defaultLimit - expectedCommitted)
    }
  }
})
