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

function commandResult({ stdout = "", stderr = "", command = "bzr", args = ["diff"], cwd = "/repo" } = {}) {
  return { stdout, stderr, command, args, cwd }
}

function prepared(root, overrides = {}) {
  const hasLog = Object.prototype.hasOwnProperty.call(overrides, "log")
  return {
    root,
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
      changedFiles: ["src/a.cpp"],
      changedFileEntries: [{ path: "src/a.cpp", status: "modified" }]
    },
    diff: overrides.diff ?? commandResult({ stdout: "+same\n", args: ["diff", "-r", "1..2"] }),
    log: hasLog ? overrides.log : commandResult({ stdout: "revno: 2\n", args: ["log", "-r", "2"] }),
    addedFilesSection: "added"
  }
}

async function failedReport(reportDirectory, repositoryRoot, target) {
  await assert.rejects(
    () => runBazaarReviewProcessingOperation({
      reportDirectory,
      repositoryScope: repositoryRoot,
      operation: { mode: "revisionRange", baseRevision: "1", targetRevision: "2", withProjectRules: true },
      maxDiffBytes: 1024,
      maxAddedFileContentBytes: 1024,
      produce: async ({ recordPreparedTarget }) => {
        recordPreparedTarget(target)
        throw new Error("after prepared checkpoint")
      }
    }),
    /after prepared checkpoint/u
  )
  const name = (await fs.readdir(reportDirectory)).find((entry) => entry.endsWith(".processing-budget-report.json"))
  return validateProcessingBudgetReport(JSON.parse(await fs.readFile(path.join(reportDirectory, name), "utf8")))
}

test("prepared failure identity includes command arguments and command context", async (t) => {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-command-identity-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  const root = path.join(reportDirectory, "repository")

  const baseline = await failedReport(reportDirectory, root, prepared(root))
  const argsChanged = await failedReport(reportDirectory, root, prepared(root, {
    diff: commandResult({ stdout: "+same\n", args: ["diff", "-r", "1..3"] })
  }))
  const commandChanged = await failedReport(reportDirectory, root, prepared(root, {
    diff: commandResult({ stdout: "+same\n", command: "/trusted/bzr", args: ["diff", "-r", "1..2"], cwd: "/different" })
  }))

  assert.notEqual(argsChanged.input_sha256, baseline.input_sha256)
  assert.notEqual(commandChanged.input_sha256, baseline.input_sha256)
})

test("prepared failure identity distinguishes missing and present-empty log results", async (t) => {
  const reportDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "bazaar-log-presence-"))
  t.after(() => fs.rm(reportDirectory, { recursive: true, force: true }))
  const root = path.join(reportDirectory, "repository")

  const missing = await failedReport(reportDirectory, root, prepared(root, { log: undefined }))
  const presentEmpty = await failedReport(reportDirectory, root, prepared(root, {
    log: commandResult({ stdout: "", args: ["log", "-r", "2"] })
  }))
  assert.notEqual(missing.input_sha256, presentEmpty.input_sha256)
})
