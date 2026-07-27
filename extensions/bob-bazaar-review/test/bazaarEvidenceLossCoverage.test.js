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

function commandResult(stdout, args = ["diff"]) {
  return { stdout, stderr: "", command: "bzr", args, cwd: "/repo" }
}

async function operationInput(t, mode) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-evidence-loss-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  return {
    reportDirectory,
    repositoryScope: path.join(reportDirectory, "repo"),
    operation: {
      mode,
      ...(mode === "revisionRange"
        ? { baseRevision: "1", targetRevision: "2" }
        : { baseRevision: "1" }),
      withProjectRules: false
    },
    maxDiffBytes: 1024,
    maxAddedFileContentBytes: 1024
  }
}

function targetInfo(mode, entries) {
  return {
    mode,
    targetLabel: mode === "revisionRange" ? "1..2" : "1..作業ツリー",
    baseRevision: "1",
    targetRevision: mode === "revisionRange" ? "2" : "作業ツリー",
    author: mode === "revisionRange" ? "range" : "作業ツリー",
    committer: mode === "revisionRange" ? "range" : "作業ツリー",
    timestamp: mode === "revisionRange" ? "unknown" : "未コミット",
    message: "change",
    changedFileCount: entries.length,
    changedFiles: entries.map((entry) => entry.path),
    changedFileEntries: entries
  }
}

test("missing revision-range log is reported as unprocessed evidence", async (t) => {
  const input = await operationInput(t, "revisionRange")
  const prepared = {
    root: input.repositoryScope,
    info: targetInfo("revisionRange", [{ path: "src/a.cpp", status: "modified" }]),
    diff: commandResult("=== modified file 'src/a.cpp'\n+ok\n")
  }

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      produce: async () => ({ prepared, packet: "# packet\n" })
    }),
    (error) => error instanceof BazaarProcessingCoveragePartialError
      && error.issues.some((issue) => issue.code === "bazaar_log_unprocessed"
        && issue.target === "bazaar-log"
        && issue.unprocessed === 1)
  )
})

test("working-tree added files without captured content block complete coverage", async (t) => {
  const input = await operationInput(t, "workingTreeSinceRevision")
  const prepared = {
    root: input.repositoryScope,
    info: targetInfo("workingTreeSinceRevision", [{ path: "src/new.txt", status: "added" }]),
    diff: commandResult("=== added file 'src/new.txt'\n+new\n")
  }

  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      ...input,
      produce: async () => ({ prepared, packet: "# packet\n" })
    }),
    (error) => error instanceof BazaarProcessingCoveragePartialError
      && error.issues.some((issue) => issue.code === "added_file_content_unprocessed"
        && issue.target === "bazaar-added-files"
        && issue.unprocessed === 1)
  )
})
