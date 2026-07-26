"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  runBazaarReviewProcessingOperation
} = require("../out/bazaar/bazaarProcessingCoverage")
const {
  validateProcessingBudgetReport
} = require("../out/sharedProcessingBudgetReport")

test("overlong Bazaar failure codes fall back without losing the original error", async (t) => {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-long-failure-code-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  const failure = Object.assign(new Error("failed"), { code: "a".repeat(257) })

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory,
      repositoryScope: "/repo",
      operation: {
        mode: "revisionRange",
        baseRevision: "1",
        targetRevision: "2",
        withProjectRules: false
      },
      maxDiffBytes: 1024,
      maxAddedFileContentBytes: 256,
      produce: async () => { throw failure }
    }),
    (error) => error === failure
  )

  const reportNames = (await fs.readdir(reportDirectory))
    .filter((name) => name.endsWith(".processing-budget-report.json"))
  assert.equal(reportNames.length, 1)
  const report = validateProcessingBudgetReport(JSON.parse(
    await fs.readFile(path.join(reportDirectory, reportNames[0]), "utf8")
  ))
  assert.equal(report.failure.code, "processing_failed")
})
