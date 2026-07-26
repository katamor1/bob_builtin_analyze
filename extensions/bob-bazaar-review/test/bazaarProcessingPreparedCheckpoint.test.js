"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const {
  BazaarProcessingCoveragePartialError,
  runBazaarReviewProcessingOperation
} = require("../out/bazaar/bazaarProcessingCoverage")
const {
  validateProcessingBudgetReport
} = require("../out/sharedProcessingBudgetReport")

function commandResult(stdout) {
  return { stdout, stderr: "", command: "bzr", args: ["diff"], cwd: "/repo" }
}

function prepared(root, diff, infoOverrides = {}) {
  return {
    root,
    info: {
      mode: "revisionRange",
      targetLabel: "1..2",
      baseRevision: "1",
      targetRevision: "2",
      revno: "2",
      author: "author",
      committer: "committer",
      timestamp: "2026-07-26T00:00:00Z",
      message: "change",
      changedFileCount: 1,
      changedFiles: ["src/a.cpp"],
      changedFileEntries: [{ path: "src/a.cpp", status: "modified" }],
      ...infoOverrides
    },
    diff: commandResult(diff),
    log: commandResult("revno: 2\nmessage:\n  change\n"),
    addedFilesSection: "added file body"
  }
}

async function fixture(t) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-prepared-checkpoint-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  return {
    reportDirectory,
    repositoryRoot: path.join(reportDirectory, "repository"),
    operation: {
      mode: "revisionRange",
      baseRevision: "1",
      targetRevision: "2",
      withProjectRules: true
    },
    maxDiffBytes: 1024,
    maxAddedFileContentBytes: 1024
  }
}

async function executePostPrepareFailure(input, diff, infoOverrides = {}) {
  const failure = new Error("project rules failed")
  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory: input.reportDirectory,
      operation: input.operation,
      maxDiffBytes: input.maxDiffBytes,
      maxAddedFileContentBytes: input.maxAddedFileContentBytes,
      produce: async ({ recordPreparedTarget }) => {
        recordPreparedTarget(prepared(input.repositoryRoot, diff, infoOverrides))
        throw failure
      }
    }),
    (error) => error === failure
  )

  const reportNames = (await fs.readdir(input.reportDirectory))
    .filter((name) => name.endsWith(".processing-budget-report.json"))
    .sort()
  assert.equal(reportNames.length, 1)
  const reportPath = path.join(input.reportDirectory, reportNames[0])
  const report = validateProcessingBudgetReport(JSON.parse(await fs.readFile(reportPath, "utf8")))
  return { reportPath, report }
}

function category(report, id) {
  return report.ledger.categories.find((entry) => entry.category === id)
}

test("post-prepare failure keeps deterministic identity and committed prepared budgets", async (t) => {
  const input = await fixture(t)

  const first = await executePostPrepareFailure(input, "+one\n")
  const retry = await executePostPrepareFailure(input, "+one\n")
  assert.equal(retry.reportPath, first.reportPath)
  assert.equal(retry.report.input_sha256, first.report.input_sha256)
  assert.equal(retry.report.outcome, "failed")
  assert.equal(retry.report.coverage_status, "failed")
  assert.equal(retry.report.issues.at(-1).target, "packet_construction")

  const diffBytes = Buffer.byteLength("+one\n", "utf8")
  const excerptBytes = Buffer.byteLength("added file body", "utf8")
  assert.equal(category(retry.report, "changed_files").committed, 1)
  assert.equal(category(retry.report, "raw_diff_bytes").committed, diffBytes)
  assert.equal(category(retry.report, "document_excerpt_bytes").committed, excerptBytes)
  assert.equal(category(retry.report, "total_operation_input_bytes").committed, diffBytes + excerptBytes)

  const changed = await executePostPrepareFailure(input, "+two\n")
  assert.equal(changed.reportPath, first.reportPath)
  assert.notEqual(changed.report.input_sha256, first.report.input_sha256)
})

test("post-prepare failure identity changes with packet-visible target metadata", async (t) => {
  const input = await fixture(t)
  const baseline = await executePostPrepareFailure(input, "+same\n")
  const changedMessage = await executePostPrepareFailure(input, "+same\n", {
    message: "working tree status changed"
  })
  assert.notEqual(changedMessage.report.input_sha256, baseline.report.input_sha256)

  const changedFiles = await executePostPrepareFailure(input, "+same\n", {
    changedFiles: ["src/b.cpp"],
    changedFileEntries: [{ path: "src/b.cpp", status: "renamed" }]
  })
  assert.notEqual(changedFiles.report.input_sha256, baseline.report.input_sha256)
})

test("markerless oversized added-file evidence is partial and reports observed bytes", async (t) => {
  const input = await fixture(t)
  const target = prepared(input.repositoryRoot, "+same\n")
  target.addedFilesSection = "x".repeat(65)
  let reportPath

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory: input.reportDirectory,
      repositoryScope: input.repositoryRoot,
      operation: input.operation,
      maxDiffBytes: input.maxDiffBytes,
      maxAddedFileContentBytes: 32,
      produce: async ({ recordPreparedTarget }) => {
        recordPreparedTarget(target)
        return { prepared: target, packet: "# packet\n" }
      }
    }),
    (error) => {
      assert.ok(error instanceof BazaarProcessingCoveragePartialError)
      reportPath = error.reportPath
      return true
    }
  )

  const report = validateProcessingBudgetReport(JSON.parse(await fs.readFile(reportPath, "utf8")))
  const issue = report.issues.find((entry) => entry.code === "added_file_content_truncated")
  assert.equal(issue.processed, 32)
  assert.equal(issue.observed, 65)
  assert.equal(issue.unprocessed, 33)
  assert.equal(category(report, "document_excerpt_bytes").committed, 32)
})

test("a completed product must match the prepared target checkpoint", async (t) => {
  const input = await fixture(t)
  const observed = prepared(input.repositoryRoot, "+observed\n")
  const changed = prepared(input.repositoryRoot, "+changed\n")

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory: input.reportDirectory,
      repositoryScope: input.repositoryRoot,
      operation: input.operation,
      maxDiffBytes: input.maxDiffBytes,
      maxAddedFileContentBytes: input.maxAddedFileContentBytes,
      produce: async ({ recordPreparedTarget }) => {
        recordPreparedTarget(observed)
        return { prepared: changed, packet: "# packet\n" }
      }
    }),
    (error) => error?.code === "processing_input_changed"
  )
})

test("a producer cannot replace the prepared checkpoint", async (t) => {
  const input = await fixture(t)
  const target = prepared(input.repositoryRoot, "+one\n")

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory: input.reportDirectory,
      repositoryScope: input.repositoryRoot,
      operation: input.operation,
      maxDiffBytes: input.maxDiffBytes,
      maxAddedFileContentBytes: input.maxAddedFileContentBytes,
      produce: async ({ recordPreparedTarget }) => {
        recordPreparedTarget(target)
        recordPreparedTarget(target)
        return { prepared: target, packet: "# packet\n" }
      }
    }),
    /reported more than once/u
  )
})
