const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  serializeWorkflowRunLock,
  withWorkflowRunLock
} = require("../out/core/runtime/runLock.js")
const {
  readRunDurabilityFile,
  replaceRunDurabilityFile
} = require("../out/core/runtime/runDurabilityPath.js")

test("lock acquisition classifies an atomic heartbeat replacement as contention", async (t) => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-lock-heartbeat-contention-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const createdAt = new Date().toISOString()
  const existingOwner = {
    schemaVersion: "workflow-register/run-lock/v1",
    runId: "run-1",
    token: "existing-owner",
    pid: process.pid,
    hostname: os.hostname(),
    createdAt,
    heartbeatAt: createdAt
  }
  await replaceRunDurabilityFile(
    workspace,
    "run-1",
    "run.lock.json",
    serializeWorkflowRunLock(existingOwner)
  )
  const lockPath = (await readRunDurabilityFile(workspace, "run-1", "run.lock.json")).filePath
  const originalLstat = fsp.lstat
  let replaced = false

  fsp.lstat = async (file, ...args) => {
    const stat = await originalLstat(file, ...args)
    if (!replaced && path.resolve(String(file)) === path.resolve(lockPath)) {
      replaced = true
      const replacementPath = `${lockPath}.heartbeat-replacement`
      await fsp.writeFile(
        replacementPath,
        serializeWorkflowRunLock({ ...existingOwner, heartbeatAt: new Date(Date.now() + 1).toISOString() })
      )
      await fsp.rename(replacementPath, lockPath)
    }
    return stat
  }

  try {
    await assert.rejects(
      withWorkflowRunLock(workspace, "run-1", async () => undefined, {
        timeoutMs: 25,
        pollMs: 1,
        heartbeatMs: 0,
        processAlive: () => true
      }),
      /busy|locked by/i
    )
  } finally {
    fsp.lstat = originalLstat
  }

  assert.equal(replaced, true)
})
