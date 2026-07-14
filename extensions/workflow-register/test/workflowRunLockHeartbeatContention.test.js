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

function withTimeout(promise, label, timeoutMs = 30_000) {
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

test("heartbeat ticks coalesce into exactly one catch-up refresh", async (t) => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-lock-heartbeat-catch-up-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const lockPath = path.join(workspace, ".bob", "workflows", "runs", "run-1", "run.lock.json")
  const ownerReady = deferred()
  const releaseOperation = deferred()
  const firstRefreshStarted = deferred()
  const releaseFirstRefresh = deferred()
  const secondRefreshStarted = deferred()
  const releaseSecondRefresh = deferred()
  const originalOpen = fsp.open
  const originalSetInterval = global.setInterval
  const originalClearInterval = global.clearInterval
  const fakeTimer = { unref() {} }
  let heartbeatTick
  let operation
  let refreshCount = 0

  global.setInterval = (callback) => {
    heartbeatTick = callback
    return fakeTimer
  }
  global.clearInterval = (timer) => assert.equal(timer, fakeTimer)
  fsp.open = async (file, flags, ...args) => {
    const handle = await originalOpen(file, flags, ...args)
    if (Number(flags) & fs.constants.O_RDWR && await matchesPhysicalPath(file, lockPath)) {
      const originalUtimes = handle.utimes.bind(handle)
      handle.utimes = async (...times) => {
        refreshCount += 1
        if (refreshCount === 1) {
          firstRefreshStarted.resolve()
          await releaseFirstRefresh.promise
        } else if (refreshCount === 2) {
          secondRefreshStarted.resolve()
          await releaseSecondRefresh.promise
        }
        return originalUtimes(...times)
      }
    }
    return handle
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
    heartbeatTick()
    heartbeatTick()

    releaseFirstRefresh.resolve()
    await withTimeout(secondRefreshStarted.promise, "coalesced heartbeat catch-up")
    assert.equal(refreshCount, 2)
    releaseSecondRefresh.resolve()
    releaseOperation.resolve()
    await withTimeout(operation, "heartbeat catch-up operation")
    assert.equal(refreshCount, 2)
  } finally {
    releaseOperation.resolve()
    releaseFirstRefresh.resolve()
    releaseSecondRefresh.resolve()
    if (operation) await Promise.allSettled([operation])
    fsp.open = originalOpen
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
  }
})

test("a slow heartbeat touches mtime at mutation time without rewriting owner bytes", async (t) => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-lock-heartbeat-mtime-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const lockPath = path.join(workspace, ".bob", "workflows", "runs", "run-1", "run.lock.json")
  const ownerReady = deferred()
  const releaseOperation = deferred()
  const slowRefreshStarted = deferred()
  const releaseSlowRefresh = deferred()
  const slowRefreshCompleted = deferred()
  const originalOpen = fsp.open
  const originalSetInterval = global.setInterval
  const originalClearInterval = global.clearInterval
  const fakeTimer = { unref() {} }
  const initialNowMs = Date.parse("2026-07-12T00:00:00.000Z")
  let clockMs = initialNowMs
  let heartbeatTick
  let operation
  let interceptHeartbeat = false
  let intercepted = false

  global.setInterval = (callback) => {
    heartbeatTick = callback
    return fakeTimer
  }
  global.clearInterval = (timer) => assert.equal(timer, fakeTimer)
  fsp.open = async (file, flags, ...args) => {
    const handle = await originalOpen(file, flags, ...args)
    if (
      interceptHeartbeat
      && !intercepted
      && (Number(flags) & fs.constants.O_RDWR) === fs.constants.O_RDWR
      && await matchesPhysicalPath(file, lockPath)
    ) {
      intercepted = true
      slowRefreshStarted.resolve()
      await releaseSlowRefresh.promise
      const originalClose = handle.close.bind(handle)
      handle.close = async () => {
        const result = await originalClose()
        slowRefreshCompleted.resolve()
        return result
      }
    }
    return handle
  }

  try {
    operation = withWorkflowRunLock(workspace, "run-1", async () => {
      ownerReady.resolve()
      await releaseOperation.promise
    }, {
      timeoutMs: 2_000,
      heartbeatMs: 5,
      hostname: "slow-owner-host",
      now: () => new Date(clockMs)
    })
    await withTimeout(ownerReady.promise, "slow heartbeat owner")
    const initial = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
    interceptHeartbeat = true
    heartbeatTick()
    await withTimeout(slowRefreshStarted.promise, "slow heartbeat pre-touch verification")
    clockMs += 60_000
    releaseSlowRefresh.resolve()
    await withTimeout(slowRefreshCompleted.promise, "slow heartbeat completion")

    const refreshed = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
    assert.deepEqual(refreshed.bytes, initial.bytes)
    assert.ok(refreshed.mtimeMs >= clockMs - 2, `expected mtime ${refreshed.mtimeMs} to reflect ${clockMs}`)
    await assert.rejects(
      withWorkflowRunLock(workspace, "run-1", async () => "stolen", {
        timeoutMs: 40,
        pollMs: 5,
        heartbeatMs: 0,
        staleMs: 1_000,
        hostname: "foreign-contender-host",
        now: () => new Date(clockMs)
      }),
      /busy|locked by/i
    )
    releaseOperation.resolve()
    await withTimeout(operation, "slow heartbeat operation")
  } finally {
    releaseOperation.resolve()
    releaseSlowRefresh.resolve()
    if (operation) await Promise.allSettled([operation])
    fsp.open = originalOpen
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
  }
})

test("heartbeat ownership loss rejects an otherwise successful operation", async (t) => {
  const workspace = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-lock-heartbeat-owner-loss-")))
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }))
  const ownerReady = deferred()
  const releaseOperation = deferred()
  const originalSetInterval = global.setInterval
  const originalClearInterval = global.clearInterval
  const fakeTimer = { unref() {} }
  let heartbeatTick
  let operation

  global.setInterval = (callback) => {
    heartbeatTick = callback
    return fakeTimer
  }
  global.clearInterval = (timer) => assert.equal(timer, fakeTimer)

  try {
    operation = withWorkflowRunLock(workspace, "run-1", async () => {
      ownerReady.resolve()
      await releaseOperation.promise
      return "formerly-successful"
    }, { timeoutMs: 2_000, heartbeatMs: 5 })
    await withTimeout(ownerReady.promise, "heartbeat owner before replacement")
    const replacement = {
      schemaVersion: "workflow-register/run-lock/v1",
      runId: "run-1",
      token: "replacement-owner",
      pid: process.pid,
      hostname: os.hostname(),
      createdAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString()
    }
    const current = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
    await replaceRunDurabilityFile(
      workspace,
      "run-1",
      "run.lock.json",
      serializeWorkflowRunLock(replacement),
      current.bytes
    )
    heartbeatTick()
    releaseOperation.resolve()
    await assert.rejects(operation, /ownership changed/i)
    const remaining = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
    assert.equal(JSON.parse(remaining.bytes.toString("utf8")).token, "replacement-owner")
  } finally {
    releaseOperation.resolve()
    if (operation) await Promise.allSettled([operation])
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
  }
})

test("shutdown suppresses a queued heartbeat catch-up", async (t) => {
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
  const originalOpen = fsp.open
  const originalSetInterval = global.setInterval
  const originalClearInterval = global.clearInterval
  const fakeTimer = { unref() {} }
  let heartbeatTick
  let operation
  let refreshCount = 0

  global.setInterval = (callback) => {
    heartbeatTick = callback
    return fakeTimer
  }
  global.clearInterval = (timer) => {
    assert.equal(timer, fakeTimer)
    intervalCleared.resolve()
  }
  fsp.open = async (file, flags, ...args) => {
    const handle = await originalOpen(file, flags, ...args)
    if (Number(flags) & fs.constants.O_RDWR && await matchesPhysicalPath(file, lockPath)) {
      const originalUtimes = handle.utimes.bind(handle)
      handle.utimes = async (...times) => {
        refreshCount += 1
        if (refreshCount === 1) {
          firstRefreshStarted.resolve()
          await releaseFirstRefresh.promise
        } else {
          secondRefreshStarted.resolve()
          await releaseLaterRefreshes.promise
        }
        return originalUtimes(...times)
      }
    }
    return handle
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
    assert.equal(refreshCount, 1)
  } finally {
    releaseOperation.resolve()
    releaseFirstRefresh.resolve()
    releaseLaterRefreshes.resolve()
    if (operation) await Promise.allSettled([operation])
    fsp.open = originalOpen
    global.setInterval = originalSetInterval
    global.clearInterval = originalClearInterval
  }
})
