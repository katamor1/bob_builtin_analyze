const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function transactionModules() {
  return require("../out/core/runtime/runCleanupTransaction")
}

function eventModules() {
  return require("../out/core/runtime/runEventLog")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-tx-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const runsRoot = path.join(root, ".bob", "workflows", "runs")
  await fs.mkdir(runsRoot, { recursive: true })
  return { root, runsRoot }
}

async function createRun(runsRoot, runId, extra = {}) {
  const directory = path.join(runsRoot, runId)
  await fs.mkdir(directory)
  const bytes = Buffer.from(JSON.stringify({
    schemaVersion: "workflow-register/run-state/v1",
    runId,
    workflowId: "cleanup.test",
    workflowName: "Cleanup Test",
    status: "completed",
    inputs: {},
    state: {},
    steps: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }, null, 2) + "\n")
  await fs.writeFile(path.join(directory, "run.json"), bytes)
  for (const [name, content] of Object.entries(extra)) await fs.writeFile(path.join(directory, name), content)
  return { directory, revision: eventModules().hashWorkflowRunBytes(bytes) }
}

test("cleanup transaction quarantines every candidate before deleting the transaction directory", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "run-a")
  const b = await createRun(runsRoot, "run-b")
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  const result = await applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [
      { runId: "run-b", revision: b.revision },
      { runId: "run-a", revision: a.revision }
    ],
    transactionId: "tx-success"
  })

  assert.deepEqual(result.removedRunIds, ["run-a", "run-b"])
  await assert.rejects(fs.stat(a.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(b.directory), { code: "ENOENT" })
  await assert.rejects(fs.stat(result.quarantinePath), { code: "ENOENT" })
})

test("cleanup transaction rolls prior moves back when a later rename fails", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const a = await createRun(runsRoot, "run-a")
  const b = await createRun(runsRoot, "run-b")
  let sourceMoveCount = 0
  const fsOps = {
    mkdir: fs.mkdir,
    lstat: fs.lstat,
    realpath: fs.realpath,
    rm: fs.rm,
    readdir: fs.readdir,
    rename: async (source, target) => {
      const sourceMove = path.dirname(source) === runsRoot && /^run-/.test(path.basename(source))
      if (sourceMove && ++sourceMoveCount === 2) throw new Error("injected second rename failure")
      return fs.rename(source, target)
    }
  }
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [
      { runId: "run-a", revision: a.revision },
      { runId: "run-b", revision: b.revision }
    ],
    transactionId: "tx-rollback",
    fsOps
  }), /injected second rename failure/)

  assert.equal((await fs.stat(a.directory)).isDirectory(), true)
  assert.equal((await fs.stat(b.directory)).isDirectory(), true)
})

test("cleanup transaction refuses locks, journals, stale revisions, unsafe IDs and linked directories", async (t) => {
  const { root, runsRoot } = await workspace(t)
  const locked = await createRun(runsRoot, "locked", { "run.lock.json": "{}" })
  const journaled = await createRun(runsRoot, "journaled", { "run-state.journal.json": "{}" })
  const changed = await createRun(runsRoot, "changed")
  const { applyWorkflowRunCleanupTransaction } = transactionModules()

  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "locked", revision: locked.revision }], transactionId: "tx-lock" }), /execution lock/i)
  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "journaled", revision: journaled.revision }], transactionId: "tx-journal" }), /pending journal/i)
  await fs.appendFile(path.join(changed.directory, "run.json"), " ")
  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "changed", revision: changed.revision }], transactionId: "tx-revision" }), /changed after cleanup preview/i)
  await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "../escape", revision: "sha256:x" }], transactionId: "tx-unsafe" }), /unsupported|unsafe/i)

  if (process.platform !== "win32") {
    const external = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-external-"))
    t.after(() => fs.rm(external, { recursive: true, force: true }))
    await fs.symlink(external, path.join(runsRoot, "linked"), "dir")
    await assert.rejects(applyWorkflowRunCleanupTransaction({ workspaceRoot: root, candidates: [{ runId: "linked", revision: "sha256:x" }], transactionId: "tx-linked" }), /direct directory|symlink|junction/i)
  }
})
