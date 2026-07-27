"use strict"

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

async function operationInput(t) {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-evidence-loss-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  return {
    reportDirectory,
    repositoryScope: path.join(reportDirectory, "repo"),
    operation: {
      mode: "workingTreeSinceRevision",
      baseRevision: "1",
      withProjectRules: false
    },
    maxDiffBytes: 1024,
    maxAddedFileContentBytes: 1024
  }
}

test("working-tree added files with skipped-content evidence block complete coverage", async (t) => {
  const input = await operationInput(t)
  const entries = [{ path: "src/new.txt", status: "added" }]
  const prepared = {
    root: input.repositoryScope,
    info: {
      mode: "workingTreeSinceRevision",
      targetLabel: "1..作業ツリー",
      baseRevision: "1",
      targetRevision: "作業ツリー",
      author: "作業ツリー",
      committer: "作業ツリー",
      timestamp: "未コミット",
      message: "change",
      changedFileCount: entries.length,
      changedFiles: entries.map((entry) => entry.path),
      changedFileEntries: entries
    },
    diff: commandResult("=== added file 'src/new.txt'\n+new\n"),
    addedFilesEvidence: {
      observedContentBytes: 0,
      processedContentBytes: 0,
      renderedContentBytes: 0,
      truncated: false,
      skippedFileCount: 1,
      readFailures: []
    }
  }

  await test.assert.rejects(
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
