"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")
const { loadRuntime } = require("./helpers")

function committed(runtime, ledger, category) {
  return ledger.snapshot().categories.find((entry) => entry.category === category).committed
}

function commitDocumentBytes(ledger, totalBytes, perDocumentBytes, prefix) {
  let remaining = totalBytes
  let index = 0
  while (remaining > 0) {
    const amount = Math.min(perDocumentBytes, remaining)
    ledger.reserveForTarget("single_document_bytes", `${prefix}-${index}`, amount).commit()
    remaining -= amount
    index += 1
  }
}

test("enforces the default and absolute document-count boundaries", () => {
  const runtime = loadRuntime()
  for (const [profile, limit, prefix] of [
    [undefined, 128, "default-count"],
    [runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE, 1_024, "absolute-count"]
  ]) {
    const ledger = new runtime.ProcessingBudgetLedger(profile)
    ledger.reserve("document_count", limit - 1).commit()
    ledger.reserve("document_count", 1).commit()
    assert.equal(committed(runtime, ledger, "document_count"), limit)
    assert.throws(
      () => ledger.reserve("document_count", 1),
      (error) => error.code === "processing_budget_exceeded"
        && error.details.targetCategory === "document_count"
        && error.details.constrainedCategory === "document_count"
        && error.details.limit === limit
        && error.details.observed === limit + 1,
      prefix
    )
  }
})

test("enforces the default and absolute total-document-byte boundaries", () => {
  const runtime = loadRuntime()
  const MiB = runtime.MEBIBYTE_BYTES
  for (const [profile, totalMiB, singleMiB, prefix] of [
    [undefined, 32, 5, "default-bytes"],
    [runtime.ABSOLUTE_PROCESSING_BUDGET_PROFILE, 256, 50, "absolute-bytes"]
  ]) {
    const ledger = new runtime.ProcessingBudgetLedger(profile)
    const limit = totalMiB * MiB
    commitDocumentBytes(ledger, limit - 1, singleMiB * MiB, `${prefix}-below`)
    assert.equal(committed(runtime, ledger, "total_document_bytes"), limit - 1)
    ledger.reserveForTarget("single_document_bytes", `${prefix}-equal`, 1).commit()
    assert.equal(committed(runtime, ledger, "total_document_bytes"), limit)
    assert.throws(
      () => ledger.reserveForTarget("single_document_bytes", `${prefix}-over`, 1),
      (error) => error.code === "processing_budget_exceeded"
        && error.details.targetCategory === "single_document_bytes"
        && error.details.constrainedCategory === "total_document_bytes"
        && error.details.limit === limit
        && error.details.observed === limit + 1
    )
  }
})
