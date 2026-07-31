"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  cleanPreprocessOutputsWithRollback
} = require("../out/core/preprocessCleanupTransaction")
const {
  persistProcessingBudgetReport,
  processingBudgetReportPath
} = require("../out/core/processingBudgetCoverage")
const {
  loadAndAssertCompleteProcessingBudgetReport,
  persistCompleteProcessingBudgetBinding,
  processingBudgetReportBindingPath
} = require("../out/core/processingBudgetReportGuard")
const {
  readVerifiedReviewPackage
} = require("../out/core/verifiedReviewPackage")
const {
  ProcessingBudgetLedger
} = require("../out/sharedProcessingBudgetRuntime")

const INPUT_SHA = `sha256:${"d".repeat(64)}`

async function fixture(t) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "preprocess-cleanup-rollback-"))
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))
  const packageDir = path.join(workspaceRoot, ".bob-review", "review-package")
  await fs.mkdir(packageDir, { recursive: true })
  await fs.writeFile(path.join(packageDir, "bob-input.md"), "prior complete package\n", "utf8")

  const ledger = new ProcessingBudgetLedger()
  ledger.reserve("bob_input_bytes", Buffer.byteLength("prior complete package\n", "utf8")).commit()
  await persistProcessingBudgetReport({
    outDir: packageDir,
    operationId: "code-consistency-preprocess:prior",
    inputSha256: INPUT_SHA,
    outcome: "success",
    ledger
  })
  await persistCompleteProcessingBudgetBinding({
    outDir: packageDir,
    reportInputSha256: INPUT_SHA,
    packageContentSha256: (await readVerifiedReviewPackage(packageDir)).contentHash
  })
  return packageDir
}

function stagedSignal(cancelled, abortAtRead) {
  let reads = 0
  return {
    get aborted() {
      reads += 1
      return reads >= abortAtRead
    },
    get reads() {
      return reads
    },
    reason: cancelled
  }
}

for (const [label, abortAtRead] of [
  ["report cleanup", 3],
  ["managed-package cleanup", 4]
]) {
  test(`cancellation during ${label} restores the prior complete package`, async (t) => {
    const packageDir = await fixture(t)
    const cancelled = Object.assign(new Error(`cancelled during ${label}`), {
      code: "processing_cancelled",
      kind: "user"
    })
    const signal = stagedSignal(cancelled, abortAtRead)

    await assert.rejects(
      () => cleanPreprocessOutputsWithRollback(packageDir, signal),
      (error) => error === cancelled
    )

    assert.ok(signal.reads >= abortAtRead)
    const loaded = await loadAndAssertCompleteProcessingBudgetReport(packageDir)
    assert.equal(loaded.report.input_sha256, INPUT_SHA)
    assert.equal(await fs.readFile(path.join(packageDir, "bob-input.md"), "utf8"), "prior complete package\n")
  })
}

test("successful cleanup removes the prior package, report, and binding", async (t) => {
  const packageDir = await fixture(t)
  await cleanPreprocessOutputsWithRollback(packageDir, undefined)

  await assert.rejects(() => fs.access(path.join(packageDir, "bob-input.md")))
  await assert.rejects(() => fs.access(processingBudgetReportPath(packageDir)))
  await assert.rejects(() => fs.access(processingBudgetReportBindingPath(packageDir)))
})
