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

function commandResult(stdout = "") {
  return { stdout, stderr: "", command: "bzr", args: ["diff"], cwd: "/repo" }
}

function prepared(readFailures) {
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
      changedFileCount: 1,
      changedFiles: ["src/new.txt"],
      changedFileEntries: [{ path: "src/new.txt", status: "added" }]
    },
    diff: commandResult("+new\n"),
    log: commandResult(),
    addedFilesSection: "## added files",
    addedFilesEvidence: {
      observedContentBytes: 0,
      processedContentBytes: 0,
      renderedContentBytes: 0,
      truncated: false,
      skippedFileCount: 0,
      readFailures
    }
  }
}

async function run(t, readFailures) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "added-file-failure-targets-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  return runBazaarReviewProcessingOperation({
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
    produce: async ({ recordPreparedTarget }) => {
      const target = prepared(readFailures)
      recordPreparedTarget(target)
      return { prepared: target, packet: "# packet\n" }
    }
  })
}

test("added-file read failures retain bounded per-file targets", async (t) => {
  await assert.rejects(
    () => run(t, [
      { path: "src/alpha.txt", message: "denied" },
      { path: "src/beta.txt", message: "missing" }
    ]),
    (error) => {
      assert.ok(error instanceof BazaarProcessingCoveragePartialError)
      const failures = error.issues.filter((issue) => issue.code === "added_file_read_failed")
      assert.deepEqual(
        failures.map((issue) => issue.target).sort(),
        ["src/alpha.txt", "src/beta.txt"]
      )
      assert.ok(failures.every((issue) => issue.unprocessed === 1))
      return true
    }
  )
})

test("added-file failure targets are capped with an overflow issue", async (t) => {
  const readFailures = Array.from({ length: 66 }, (_, index) => ({
    path: `src/f${String(index).padStart(2, "0")}.txt`,
    message: "failed"
  }))
  await assert.rejects(
    () => run(t, readFailures),
    (error) => {
      assert.ok(error instanceof BazaarProcessingCoveragePartialError)
      assert.equal(
        error.issues.filter((issue) => issue.code === "added_file_read_failed").length,
        64
      )
      assert.ok(error.issues.some((issue) =>
        issue.code === "added_file_read_failures_omitted" && issue.unprocessed === 2
      ))
      return true
    }
  )
})
