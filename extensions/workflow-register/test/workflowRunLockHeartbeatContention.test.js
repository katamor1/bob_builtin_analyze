const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { createPhysicalPathMatcher } = require("./helpers/physicalPathMatcher")

const matchesPhysicalPath = createPhysicalPathMatcher(fsp)

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function withTimeout(promise, label, timeoutMs = 120_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms.`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

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
    if (!replaced && await matchesPhysicalPath(file, lockPath)) {
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

test("heartbeat ticks coalesce while one refresh is in flight", async (t) => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-lock-heartbeat-coalesce-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const lockPath = path.join(workspace, ".bob", "workflows", "runs", "run-1", "run.lock.json")
  const ownerReady = deferred()
  const releaseOperation = deferred()
  const firstRefreshStarted = deferred()
  const releaseFirstRefresh = deferred()
  const secondRefreshStarted = deferred()
  const releaseLaterRefreshes = deferred()
  const intervalCleared = deferred()
  const refreshSources = new Set()
  const originalRename = fsp.rename
  const originalSetInterval = global.setInterval
  const originalClearInterval = global.clearInterval
  const fakeTimer = { unref() {} }
  let heartbeatTick
  let operation

  global.setInterval = (callback) => {
    heartbeatTick = callback
    return fakeTimer
  }
  global.clearInterval = (timer) => {
    assert.equal(timer, fakeTimer)
    intervalCleared.resolve()
  }
  fsp.rename = async (source, target, ...args) => {
    if (await matchesPhysicalPath(target, lockPath)) {
      const sourceKey = path.resolve(String(source))
      if (!refreshSources.has(sourceKey)) {
        refreshSources.add(sourceKey)
        if (refreshSources.size === 1) {
          firstRefreshStarted.resolve()
          await releaseFirstRefresh.promise
        } else {
          secondRefreshStarted.resolve()
          await releaseLaterRefreshes.promise
        }
      }
    }
    return originalRename(source, target, ...args)
  }

  try {
    operation = withWorkflowRunLock(workspace, "run-1", async () => {
      ownerReady.resolve()
      await releaseOperation.promise
    }, { timeoutMs: 2_000, heartbeatMs: 5 })
    await withTimeout(ownerReady.promise, "lock owner")
    assert.equal(typeof heartbeatTick, "function")
    heartbeatTick()
    await withTimeout(firstRefreshStarted.promise, "first heartbeat refresh")
    heartbeatTick()

    releaseOperation.resolve()
    await withTimeout(intervalCleared.promise, "heartbeat interval cleanup")
    releaseFirstRefresh.resolve()
    const outcome = await withTimeout(Promise.race([
      operation.then(
        () => ({ kind: "settled" }),
        (error) => ({ kind: "error", error })
      ),
      secondRefreshStarted.promise.then(() => ({ kind: "second-refresh" }))
    ]), "coalesced heartbeat release")

    if (outcome.kind === "error") throw outcome.error
    assert.equal(outcome.kind, "settled", "release must not wait for a heartbeat tick queued behind the in-flight refresh")
    assert.equal(refreshSources.size, 1)
  } finally {
    releaseOperation.resolve()
    releaseFirstRefresh.resolve()
    releaseLaterRefreshes.resolve()
    if (operation) await Promise.allSettled([operation])
    fsp.rename = originalRename
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
  }
})
