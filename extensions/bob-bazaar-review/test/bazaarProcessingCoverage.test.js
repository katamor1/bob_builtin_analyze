"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES,
  BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES,
  BazaarProcessingCoveragePartialError,
  runBazaarReviewProcessingOperation
} = require("../out/bazaar/bazaarProcessingCoverage")
const {
  assertProcessingBudgetReportAllowsHandoff,
  validateProcessingBudgetReport
} = require("../out/sharedProcessingBudgetReport")

function commandResult(stdout) {
  return { stdout, stderr: "", command: "bzr", args: ["diff"], cwd: "/repo" }
}

function prepared(overrides = {}) {
  const files = overrides.files ?? [{ path: "src/a.cpp", status: "modified" }]
  return {
    root: "/repo",
    info: {
      mode: "revisionRange",
      targetLabel: "1..2",
      baseRevision: "1",
      targetRevision: "2",
      author: "author",
      committer: "committer",
      timestamp: "2026-07-26T00:00:00Z",
      message: "change",
      changedFileCount: files.length,
      changedFiles: files.map((entry) => entry.path),
      changedFileEntries: files
    },
    diff: commandResult(overrides.diff ?? "=== modified file 'src/a.cpp'\n+ok\n"),
    log: overrides.log === undefined ? commandResult("revno: 2\nmessage:\n  change\n") : commandResult(overrides.log),
    addedFilesSection: overrides.addedFilesSection
  }
}

async function makeInput(t, overrides = {}) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-processing-report-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  return {
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
    ...overrides
  }
}

test("complete Bazaar packet writes a complete report and permits handoff", async (t) => {
  const input = await makeInput(t)
  const result = await runBazaarReviewProcessingOperation({
    ...input,
    produce: async () => ({ prepared: prepared(), packet: "# packet\ncomplete\n" })
  })

  assert.equal(result.report.coverage_status, "complete")
  assert.equal(result.report.outcome, "success")
  assert.equal(assertProcessingBudgetReportAllowsHandoff(result.report), result.report)
  const parsed = validateProcessingBudgetReport(JSON.parse(await fs.readFile(result.reportPath, "utf8")))
  assert.deepEqual(parsed, result.report)
})

test("repository scope keeps identical revision reports from different workspaces distinct", async (t) => {
  const input = await makeInput(t)
  const first = await runBazaarReviewProcessingOperation({
    ...input,
    repositoryScope: path.join(input.reportDirectory, "workspace-a"),
    produce: async () => ({ prepared: prepared(), packet: "# packet\ncomplete\n" })
  })
  const second = await runBazaarReviewProcessingOperation({
    ...input,
    repositoryScope: path.join(input.reportDirectory, "workspace-b"),
    produce: async () => ({ prepared: prepared(), packet: "# packet\ncomplete\n" })
  })

  assert.notEqual(first.reportPath, second.reportPath)
  assert.equal((await fs.readdir(input.reportDirectory)).length, 2)
})

test("Bob input defaults to 2 MiB and can be raised only to the shared 8 MiB maximum", async (t) => {
  const input = await makeInput(t)
  assert.equal(BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES, 2 * 1024 * 1024)
  assert.equal(BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES, 8 * 1024 * 1024)

  let defaultReportPath
  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      produce: async () => ({ prepared: prepared(), packet: "x".repeat(BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES + 1) })
    }),
    (error) => {
      defaultReportPath = path.join(input.reportDirectory, (error?.details ? "" : ""))
      return error?.code === "processing_budget_exceeded"
    }
  )
  const defaultReportName = (await fs.readdir(input.reportDirectory))[0]
  const defaultReport = validateProcessingBudgetReport(JSON.parse(
    await fs.readFile(path.join(input.reportDirectory, defaultReportName), "utf8")
  ))
  assert.equal(defaultReport.failure.category, "bob_input_bytes")
  assert.equal(defaultReport.failure.limit, BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES)
  void defaultReportPath

  const raised = await runBazaarReviewProcessingOperation({
    ...input,
    maxBobInputBytes: BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES,
    produce: async () => ({ prepared: prepared(), packet: "x".repeat(BAZAAR_REVIEW_BOB_INPUT_DEFAULT_BYTES + 1) })
  })
  assert.equal(raised.report.coverage_status, "complete")
  assert.equal(
    raised.report.ledger.categories.find((entry) => entry.category === "bob_input_bytes").limit,
    BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES
  )

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      repositoryScope: path.join(input.reportDirectory, "absolute-cap"),
      maxBobInputBytes: BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES * 2,
      produce: async () => ({ prepared: prepared(), packet: "x".repeat(BAZAAR_REVIEW_BOB_INPUT_MAX_BYTES + 1) })
    }),
    (error) => error?.code === "processing_budget_exceeded"
  )
})

test("truncated Bazaar diff writes partial coverage and blocks packet handoff", async (t) => {
  const input = await makeInput(t, { maxDiffBytes: 64 })
  let reportPath
  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      produce: async () => ({ prepared: prepared({ diff: "x".repeat(256) }), packet: "# packet\n[TRUNCATED]\n" })
    }),
    (error) => {
      assert.ok(error instanceof BazaarProcessingCoveragePartialError)
      reportPath = error.reportPath
      assert.equal(error.issues[0].category, "raw_diff_bytes")
      return true
    }
  )
  const report = validateProcessingBudgetReport(JSON.parse(await fs.readFile(reportPath, "utf8")))
  assert.equal(report.coverage_status, "partial")
  assert.throws(
    () => assertProcessingBudgetReportAllowsHandoff(report),
    (error) => error?.code === "processing_budget_handoff_blocked"
  )
})

test("added-file truncation is target-diagnosed and blocks handoff", async (t) => {
  const input = await makeInput(t, { maxAddedFileContentBytes: 32 })
  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      produce: async () => ({
        prepared: prepared({ addedFilesSection: "body\n[TRUNCATED: 追加ファイル本文が 32 bytes の上限を超えました。]" }),
        packet: "# packet\nbody\n"
      })
    }),
    (error) => error instanceof BazaarProcessingCoveragePartialError
      && error.issues.some((issue) => issue.category === "document_excerpt_bytes" && issue.target === "bazaar-added-files")
  )
})

test("cancelled preparation writes a failed report with cancelled outcome", async (t) => {
  const input = await makeInput(t)
  const cancelled = Object.assign(new Error("operator cancelled"), { code: "processing_cancelled", kind: "user" })
  let thrown
  try {
    await runBazaarReviewProcessingOperation({ ...input, produce: async () => { throw cancelled } })
  } catch (error) {
    thrown = error
  }
  assert.equal(thrown, cancelled)
  const files = await fs.readdir(input.reportDirectory)
  assert.equal(files.length, 1)
  const report = validateProcessingBudgetReport(JSON.parse(await fs.readFile(path.join(input.reportDirectory, files[0]), "utf8")))
  assert.equal(report.outcome, "cancelled")
  assert.equal(report.coverage_status, "failed")
  assert.equal(report.failure.code, "processing_cancelled")
})

test("changed-file default cap overrun writes failure evidence and never returns a packet", async (t) => {
  const input = await makeInput(t)
  const files = Array.from({ length: 5001 }, (_, index) => ({ path: `src/f${index}.cpp`, status: "modified" }))
  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      produce: async () => ({ prepared: prepared({ files }), packet: "# packet\n" })
    }),
    (error) => error?.code === "processing_budget_exceeded"
  )
  const reportName = (await fs.readdir(input.reportDirectory))[0]
  const report = validateProcessingBudgetReport(JSON.parse(await fs.readFile(path.join(input.reportDirectory, reportName), "utf8")))
  assert.equal(report.coverage_status, "failed")
  assert.equal(report.failure.category, "changed_files")
  assert.equal(report.failure.limit, 5000)
  assert.equal(report.failure.observed, 5001)
})
