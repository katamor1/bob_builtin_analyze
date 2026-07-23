"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const { finalizeDiffProcessingBudget } = require("../out/core/gitDiffCollector")
const {
  PROCESSING_BUDGET_ABSOLUTE_MAXIMA,
  ProcessingBudgetLedger
} = require("../out/sharedProcessingBudgetRuntime")

function changedFiles(count) {
  return Array.from({ length: count }, (_, index) => ({
    path: `src/file-${index}.c`,
    status: "modified",
    additions: 1,
    deletions: 0
  }))
}

function diff(files, unifiedDiff = "") {
  return {
    vcs: "git",
    vcsRoot: "/workspace",
    base: "base",
    head: "head",
    files,
    unifiedDiff,
    warnings: []
  }
}

function expectExceeded(category, limit, observed) {
  return (error) => error?.code === "processing_budget_exceeded"
    && error.details?.constrainedCategory === category
    && error.details?.limit === limit
    && error.details?.observed === observed
}

test("enforces default changed-file exact and plus-one boundaries", () => {
  const exact = finalizeDiffProcessingBudget(diff(changedFiles(5_000)), new ProcessingBudgetLedger())
  assert.equal(exact.files.length, 5_000)

  assert.throws(
    () => finalizeDiffProcessingBudget(diff(changedFiles(5_001)), new ProcessingBudgetLedger()),
    expectExceeded("changed_files", 5_000, 5_001)
  )
})

test("enforces absolute changed-file exact and plus-one boundaries", () => {
  const absoluteLedger = () => new ProcessingBudgetLedger({ limits: PROCESSING_BUDGET_ABSOLUTE_MAXIMA })
  const exact = finalizeDiffProcessingBudget(diff(changedFiles(20_000)), absoluteLedger())
  assert.equal(exact.files.length, 20_000)

  assert.throws(
    () => finalizeDiffProcessingBudget(diff(changedFiles(20_001)), absoluteLedger()),
    expectExceeded("changed_files", 20_000, 20_001)
  )
})

test("accepts raw diff exactly at the default and absolute byte boundaries", () => {
  const defaultBytes = 1024 * 1024
  const defaultResult = finalizeDiffProcessingBudget(
    diff([], "x".repeat(defaultBytes)),
    new ProcessingBudgetLedger()
  )
  assert.equal(Buffer.byteLength(defaultResult.unifiedDiff, "utf8"), defaultBytes)
  assert.deepEqual(defaultResult.warnings, [])

  const absoluteBytes = 10 * 1024 * 1024
  const absoluteResult = finalizeDiffProcessingBudget(
    diff([], "x".repeat(absoluteBytes)),
    new ProcessingBudgetLedger({ limits: PROCESSING_BUDGET_ABSOLUTE_MAXIMA })
  )
  assert.equal(Buffer.byteLength(absoluteResult.unifiedDiff, "utf8"), absoluteBytes)
  assert.deepEqual(absoluteResult.warnings, [])
})

test("truncates over-budget raw diff on UTF-8 and complete-line boundaries", () => {
  const ledger = new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: 0,
      raw_diff_bytes: 80,
      total_operation_input_bytes: 80
    }
  })
  const source = [
    "diff --git a/日本語.txt b/日本語.txt",
    "+first complete line",
    "+second complete line",
    "+partial 🚀 line that must not survive"
  ].join("\n")

  const result = finalizeDiffProcessingBudget(diff([], source), ledger, true)
  assert.ok(Buffer.byteLength(result.unifiedDiff, "utf8") <= 80)
  assert.equal(Buffer.from(result.unifiedDiff, "utf8").toString("utf8"), result.unifiedDiff)
  assert.match(result.unifiedDiff, /\[truncated: maxRawDiffBytes\]\n$/)
  const retained = result.unifiedDiff.replace(/\n\n\[truncated: maxRawDiffBytes\]\n$/, "")
  assert.ok(retained === "" || retained.endsWith("\n"))
  assert.doesNotMatch(retained, /partial/)
  assert.ok(result.warnings.some((warning) => warning.includes("maxRawDiffBytes")))
})

test("rolls back changed-file reservation when aggregate input budget rejects raw diff", () => {
  const ledger = new ProcessingBudgetLedger({
    limits: {
      single_document_bytes: 0,
      total_document_bytes: 0,
      document_excerpt_bytes: 0,
      bob_input_bytes: 10,
      raw_diff_bytes: 10,
      total_operation_input_bytes: 10,
      changed_files: 10
    }
  })
  ledger.reserve("bob_input_bytes", 5).commit()
  const before = ledger.snapshot()

  assert.throws(
    () => finalizeDiffProcessingBudget(diff(changedFiles(1), "123456"), ledger),
    expectExceeded("total_operation_input_bytes", 10, 11)
  )
  assert.deepEqual(ledger.snapshot(), before)
})
