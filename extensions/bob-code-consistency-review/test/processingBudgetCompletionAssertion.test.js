"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  assertCompleteProcessingCoverage,
  persistProcessingBudgetReport
} = require("../out/core/processingBudgetCoverage")
const {
  ProcessingBudgetLedger
} = require("../out/sharedProcessingBudgetRuntime")

const INPUT_SHA = `sha256:${"d".repeat(64)}`

test("the completion assertion accepts the persisted report result returned by the writer", async (t) => {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "processing-completion-"))
  t.after(() => fs.rm(outDir, { recursive: true, force: true }))

  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("bob_input_bytes", 1).commit()
  const persisted = await persistProcessingBudgetReport({
    outDir,
    operationId: "code-consistency-preprocess:completion",
    inputSha256: INPUT_SHA,
    outcome: "success",
    ledger
  })

  assert.equal(assertCompleteProcessingCoverage(persisted, INPUT_SHA), persisted.report)
})
