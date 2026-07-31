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

function commandResult(stdout) {
  return { stdout, stderr: "", command: "bzr", args: ["diff"], cwd: "/repo" }
}

function prepared() {
  const files = [{ path: "src/a.cpp", status: "modified" }]
  return {
    root: "/repo",
    info: {
      mode: "revisionRange",
      targetLabel: "1..2",
      baseRevision: "1",
      targetRevision: "2",
      author: "author",
      committer: "committer",
      timestamp: "2026-07-31T00:00:00Z",
      message: "change",
      changedFileCount: files.length,
      changedFiles: files.map((entry) => entry.path),
      changedFileEntries: files
    },
    diff: commandResult("=== modified file 'src/a.cpp'\n+ok\n"),
    log: commandResult("revno: 2\nmessage:\n  change\n")
  }
}

test("cancellation observed after success-report persistence prevents handoff return", async (t) => {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-final-cancel-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))

  const cancelled = Object.assign(new Error("operator cancelled before Bazaar handoff"), {
    code: "processing_cancelled",
    kind: "user"
  })
  let abortedReads = 0
  const signal = {
    get aborted() {
      abortedReads += 1
      return abortedReads >= 3
    },
    reason: cancelled
  }

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory,
      repositoryScope: path.join(reportDirectory, "workspace"),
      operation: {
        mode: "revisionRange",
        baseRevision: "1",
        targetRevision: "2",
        withProjectRules: false
      },
      maxDiffBytes: 1024,
      maxAddedFileContentBytes: 1024,
      signal,
      produce: async () => ({ prepared: prepared(), packet: "# packet\ncomplete\n" })
    }),
    (error) => error === cancelled
  )

  assert.ok(abortedReads >= 3)
  const reportNames = await fs.readdir(reportDirectory)
  assert.equal(reportNames.length, 1)
  const report = validateProcessingBudgetReport(JSON.parse(
    await fs.readFile(path.join(reportDirectory, reportNames[0]), "utf8")
  ))
  assert.equal(report.outcome, "cancelled")
  assert.equal(report.coverage_status, "failed")
  assert.equal(report.failure.code, "processing_cancelled")
  assert.ok(report.issues.some((issue) => issue.code === "operation_incomplete" && issue.target === "handoff_validation"))
})

test("processing boundary rechecks cancellation after report persistence and before handoff", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "bazaar", "bazaarProcessingCoverage.ts"),
    "utf8"
  )
  const persisted = source.indexOf("await persistReport(reportPath, report)")
  const handoffStage = source.indexOf('stage = "handoff_validation"', persisted)
  const cancellation = source.indexOf("throwIfCancelled(input.signal)", handoffStage)
  const partial = source.indexOf("if (issues.length > 0)", cancellation)
  const handoff = source.indexOf("assertProcessingBudgetReportAllowsHandoff", partial)

  assert.ok(persisted >= 0)
  assert.ok(handoffStage > persisted)
  assert.ok(cancellation > handoffStage)
  assert.ok(partial > cancellation)
  assert.ok(handoff > partial)
})
