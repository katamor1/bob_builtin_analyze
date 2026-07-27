"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

test("complete coverage is not published after final-stage cancellation", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "core", "pipeline.ts"),
    "utf8"
  )

  const finalLedger = source.indexOf("const finalLedger = await updateArtifactLedger(")
  const finalIdentity = source.indexOf("refreshInputSha({ finalArtifactLedger: finalLedger })", finalLedger)
  const finalCancellation = source.indexOf("cancellation.throwIfCancelled()", finalIdentity)
  const completeReport = source.indexOf("const processingBudgetReport = await persistProcessingBudgetReport(", finalIdentity)
  const binding = source.indexOf("await persistCompleteProcessingBudgetBinding(", completeReport)

  assert.ok(finalLedger >= 0)
  assert.ok(finalIdentity > finalLedger)
  assert.ok(finalCancellation > finalIdentity)
  assert.ok(completeReport > finalCancellation)
  assert.ok(binding > completeReport)
})
