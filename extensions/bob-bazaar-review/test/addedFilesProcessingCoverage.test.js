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

const ADDED_SECTION = "## Added files\n\n```text\nbounded body\n```"

function commandResult(stdout = "") {
  return { stdout, stderr: "", command: "bzr", args: ["diff"], cwd: "/repo" }
}

function prepared(evidence) {
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
    log: commandResult(""),
    addedFilesSection: ADDED_SECTION,
    addedFilesEvidence: evidence
  }
}

async function run(t, evidence) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "added-files-coverage-"))
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
      const target = prepared(evidence)
      recordPreparedTarget(target)
      return { prepared: target, packet: "# packet\n" }
    }
  })
}

test("document excerpt ledger accounts for retained source content rather than Markdown framing", async (t) => {
  const result = await run(t, {
    observedContentBytes: 12,
    processedContentBytes: 12,
    renderedContentBytes: 12,
    truncated: false,
    skippedFileCount: 0,
    readFailures: []
  })
  const category = result.report.ledger.categories.find((entry) => entry.category === "document_excerpt_bytes")
  assert.equal(category.committed, 12)
  assert.notEqual(category.committed, Buffer.byteLength(ADDED_SECTION, "utf8"))
})

test("exact original added-file bytes are preserved in truncation diagnostics", async (t) => {
  await assert.rejects(
    () => run(t, {
      observedContentBytes: 1024,
      processedContentBytes: 200,
      renderedContentBytes: 200,
      truncated: true,
      skippedFileCount: 0,
      readFailures: []
    }),
    (error) => error instanceof BazaarProcessingCoveragePartialError
      && error.issues.some((issue) => issue.code === "added_file_content_truncated"
        && issue.processed === 200
        && issue.observed === 1024
        && issue.unprocessed === 824)
  )
})

test("failed and skipped added-file reads block formal handoff", async (t) => {
  await assert.rejects(
    () => run(t, {
      observedContentBytes: 0,
      processedContentBytes: 0,
      renderedContentBytes: 0,
      truncated: false,
      skippedFileCount: 2,
      readFailures: [{ path: "src/new.txt", message: "cat failed" }]
    }),
    (error) => error instanceof BazaarProcessingCoveragePartialError
      && error.issues.some((issue) => issue.code === "added_file_read_failed" && issue.unprocessed === 1)
      && error.issues.some((issue) => issue.code === "added_file_content_unprocessed" && issue.unprocessed === 2)
  )
})
