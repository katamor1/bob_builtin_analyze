"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  PROCESSING_BUDGET_CATEGORY_IDS,
  ProcessingBudgetLedger,
  assertProcessingBudgetReportAllowsHandoff,
  createProcessingBudgetReport,
  serializeProcessingBudgetReport,
  validateProcessingBudgetReport
} = require("../out")

const INPUT_SHA = `sha256:${"a".repeat(64)}`
const STALE_SHA = `sha256:${"b".repeat(64)}`

function reportInput(overrides = {}) {
  const ledger = overrides.ledger ?? new ProcessingBudgetLedger()
  return {
    producer: { id: "bob-code-consistency-review", version: "0.1.0" },
    operation_id: "review:demo",
    input_sha256: INPUT_SHA,
    outcome: "success",
    ledger: ledger.snapshot(),
    ...overrides,
    ledger: (overrides.ledger ?? ledger).snapshot()
  }
}

test("complete processing report is deterministic, schema-valid, and handoff eligible", () => {
  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("raw_diff_bytes", 10).commit()

  const report = createProcessingBudgetReport(reportInput({ ledger }))
  assert.equal(report.schema_version, "processing-budget-report/v1")
  assert.equal(report.coverage_status, "complete")
  assert.equal(report.outcome, "success")
  assert.deepEqual(report.ledger.categories.map((entry) => entry.category), PROCESSING_BUDGET_CATEGORY_IDS)
  assert.deepEqual(report.issues, [])
  assert.equal(Object.isFrozen(report), true)

  const serialized = serializeProcessingBudgetReport(report)
  assert.equal(serialized.endsWith("\n"), true)
  const parsed = validateProcessingBudgetReport(JSON.parse(serialized), { expected_input_sha256: INPUT_SHA })
  assert.deepEqual(parsed, report)
  assert.equal(assertProcessingBudgetReportAllowsHandoff(parsed, { expected_input_sha256: INPUT_SHA }), parsed)
})

test("explicit truncation produces partial coverage and blocks formal handoff", () => {
  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("raw_diff_bytes", 1024).commit()
  const report = createProcessingBudgetReport(reportInput({
    ledger,
    issues: [
      {
        kind: "truncation",
        code: "raw_diff_truncated",
        category: "raw_diff_bytes",
        target: "git:HEAD~1..HEAD",
        processed: 1024,
        observed: 1025,
        unprocessed: 1
      }
    ]
  }))

  assert.equal(report.coverage_status, "partial")
  assert.throws(
    () => assertProcessingBudgetReportAllowsHandoff(report, { expected_input_sha256: INPUT_SHA }),
    (error) => error?.code === "processing_budget_handoff_blocked"
  )
})

test("overrun, cancellation, and early extraction failures remain reportable but never handoff eligible", () => {
  for (const [outcome, code] of [
    ["failed", "processing_budget_exceeded"],
    ["cancelled", "processing_cancelled"],
    ["failed", "document_extraction_failed"]
  ]) {
    const report = createProcessingBudgetReport(reportInput({
      outcome,
      failure: {
        code,
        category: outcome === "failed" && code === "processing_budget_exceeded"
          ? "total_operation_input_bytes"
          : undefined,
        limit: code === "processing_budget_exceeded" ? 64 : undefined,
        observed: code === "processing_budget_exceeded" ? 65 : undefined
      },
      issues: [{ kind: "unprocessed", code: "operation_incomplete", target: "remaining-inputs" }]
    }))
    assert.equal(report.coverage_status, "failed")
    assert.throws(
      () => assertProcessingBudgetReportAllowsHandoff(report, { expected_input_sha256: INPUT_SHA }),
      (error) => error?.code === "processing_budget_handoff_blocked"
    )
  }
})

test("validator rejects stale evidence and missing category records", () => {
  const report = createProcessingBudgetReport(reportInput())
  assert.throws(
    () => validateProcessingBudgetReport(report, { expected_input_sha256: STALE_SHA }),
    (error) => error?.code === "processing_budget_report_stale"
  )

  const missing = JSON.parse(JSON.stringify(report))
  missing.ledger.categories.pop()
  assert.throws(
    () => validateProcessingBudgetReport(missing, { expected_input_sha256: INPUT_SHA }),
    (error) => error?.code === "processing_budget_report_invalid"
  )
})

test("complete coverage cannot hand off while reservations remain open", () => {
  const ledger = new ProcessingBudgetLedger()
  const reservation = ledger.reserve("raw_diff_bytes", 1)
  const report = createProcessingBudgetReport(reportInput({ ledger }))
  assert.equal(report.coverage_status, "complete")
  assert.throws(
    () => assertProcessingBudgetReportAllowsHandoff(report, { expected_input_sha256: INPUT_SHA }),
    (error) => error?.code === "processing_budget_handoff_blocked"
  )
  reservation.release()
})

test("issues are copied into deterministic category, target, kind, and code order", () => {
  const report = createProcessingBudgetReport(reportInput({
    issues: [
      { kind: "unprocessed", code: "z_reason", target: "z" },
      { kind: "truncation", code: "raw_diff_truncated", category: "raw_diff_bytes", target: "a", processed: 1 },
      { kind: "unprocessed", code: "a_reason", category: "document_count", target: "b" }
    ]
  }))
  assert.deepEqual(report.issues.map((entry) => [entry.category ?? "", entry.target ?? "", entry.kind, entry.code]), [
    ["", "z", "unprocessed", "z_reason"],
    ["document_count", "b", "unprocessed", "a_reason"],
    ["raw_diff_bytes", "a", "truncation", "raw_diff_truncated"]
  ])
})
