const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const { spawn } = require("node:child_process")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION,
  parseWorkflowRunLock,
  serializeWorkflowRunLock,
  withWorkflowRunLock
} = require("../out/core/runtime/runLock.js")
const runDurabilityPath = require("../out/core/runtime/runDurabilityPath.js")
const { withWorkflowRunCleanupLeases } = require("../out/core/runtime/runCleanupLease.js")
const { resolveWorkflowRunWorkspaceRoot } = require("../out/core/runtime/workflowRunWorkspaceRootBinding.js")
const {
  readRunDurabilityFile,
  appendRunDurabilityFile,
  replaceRunDurabilityFile
} = runDurabilityPath
const { writeContainedRunFile } = require("../out/core/runtime/runStatePath.js")

function root(t) {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-lock-"))
  t.after(() => fs.rmSync(value, { recursive: true, force: true }))
  return value
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function withTimeout(promise, label, timeoutMs = 5_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms.`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

function owner(overrides = {}) {
  return {
    schemaVersion: "workflow-register/run-lock/v1",
    runId: "run-1",
    token: "owner-token",
    pid: 999999,
    hostname: os.hostname(),
    createdAt: "2026-07-12T00:00:00.000Z",
    heartbeatAt: "2026-07-12T00:00:00.000Z",
    ...overrides
  }
}

test("lock parser validates the persisted owner contract", async (t) => {
  const value = owner()
  assert.deepEqual(parseWorkflowRunLock(value, "run-1"), value)
  assert.equal(JSON.parse(serializeWorkflowRunLock(value)).schemaVersion, CURRENT_WORKFLOW_RUN_LOCK_SCHEMA_VERSION)
  const cases = [
    ["schema", { ...value, schemaVersion: "workflow-register/run-lock/v2" }, /schemaVersion/],
    ["run id", { ...value, runId: "other" }, /run id/],
    ["token", { ...value, token: "" }, /token/],
    ["pid", { ...value, pid: 0 }, /pid/],
    ["heartbeat", { ...value, heartbeatAt: 1 }, /heartbeatAt/]
  ]
  for (const [name, candidate, pattern] of cases) {
    await t.test(name, () => assert.throws(() => parseWorkflowRunLock(candidate, "run-1"), pattern))
  }
})

test("same-run callers serialize while different runs and roots remain independent", async (t) => {
  const workspaceA = root(t)
  const workspaceB = root(t)
  const firstStarted = deferred()
  const releaseFirst = deferred()
  const otherRunStarted = deferred()
  const otherRootStarted = deferred()
  const order = []

  const first = withWorkflowRunLock(workspaceA, "run-1", async () => {
    order.push("first:start")
    firstStarted.resolve()
    await withTimeout(releaseFirst.promise, "first run lock release")
    order.push("first:end")
  }, { timeoutMs: 10_000, heartbeatMs: 0 })
  await withTimeout(firstStarted.promise, "first run lock start")
  const second = withWorkflowRunLock(workspaceA, "run-1", async () => order.push("second"), { timeoutMs: 10_000, heartbeatMs: 0, pollMs: 5 })
  const otherRun = withWorkflowRunLock(workspaceA, "run-2", async () => otherRunStarted.resolve(), { heartbeatMs: 0 })
  const otherRoot = withWorkflowRunLock(workspaceB, "run-1", async () => otherRootStarted.resolve(), { heartbeatMs: 0 })
  await Promise.all([otherRunStarted.promise, otherRootStarted.promise])
  assert.deepEqual(order, ["first:start"])
  releaseFirst.resolve()
  await Promise.all([first, second, otherRun, otherRoot])
  assert.deepEqual(order, ["first:start", "first:end", "second"])
})

test("lock acquisition retries when the owner file disappears before inspection", async (t) => {
  const workspace = root(t)
  const firstStarted = deferred()
  const releaseFirst = deferred()
  const first = withWorkflowRunLock(workspace, "run-1", async () => {
    firstStarted.resolve()
    await withTimeout(releaseFirst.promise, "injected lock owner release")
  }, { timeoutMs: 5_000, heartbeatMs: 0 })
  await withTimeout(firstStarted.promise, "injected lock owner start")

  const originalRead = runDurabilityPath.readRunDurabilityFile
  const readInjected = deferred()
  let injected = false
  runDurabilityPath.readRunDurabilityFile = async (...args) => {
    if (!injected && args[2] === "run.lock.json") {
      injected = true
      readInjected.resolve()
      const error = new Error("simulated lock disappearance during acquisition")
      error.code = "ENOENT"
      throw error
    }
    return originalRead(...args)
  }

  try {
    const second = withWorkflowRunLock(workspace, "run-1", async () => "second", {
      timeoutMs: 5_000,
      heartbeatMs: 0,
      pollMs: 5
    })
    await withTimeout(readInjected.promise, "injected lock read")
    releaseFirst.resolve()
    assert.equal(await second, "second")
    assert.equal(injected, true)
  } finally {
    runDurabilityPath.readRunDurabilityFile = originalRead
    releaseFirst.resolve()
    await first
  }
})

test("lock acquisition retries when a removed Windows inode becomes inaccessible by physical path", async (t) => {
  const workspace = root(t)
  const currentOwner = owner({ pid: process.pid, token: "physical-delete-owner" })
  await replaceRunDurabilityFile(workspace, "run-1", "run.lock.json", serializeWorkflowRunLock(currentOwner))
  const lockPath = (await readRunDurabilityFile(workspace, "run-1", "run.lock.json")).filePath
  const deletedPath = path.join(path.parse(workspace).root, "$Extend", "$Deleted", "injected-lock-inode")
  const originalRealpath = fsp.realpath
  const originalLstat = fsp.lstat
  let injected = false
  const normalized = (value) => process.platform === "win32"
    ? path.resolve(String(value)).toLowerCase()
    : path.resolve(String(value))

  fsp.realpath = async (target, ...args) => {
    const physical = await originalRealpath(target, ...args)
    if (!injected && normalized(target) === normalized(lockPath)) {
      injected = true
      await fsp.rm(lockPath)
      return deletedPath
    }
    return physical
  }
  fsp.lstat = async (target, ...args) => {
    if (normalized(target) === normalized(deletedPath)) {
      const error = new Error(`EPERM: operation not permitted, lstat '${deletedPath}'`)
      error.code = "EPERM"
      error.path = deletedPath
      error.syscall = "lstat"
      throw error
    }
    return originalLstat(target, ...args)
  }

  try {
    assert.equal(await withWorkflowRunLock(workspace, "run-1", async () => "acquired", {
      timeoutMs: 1_000,
      pollMs: 5,
      heartbeatMs: 0
    }), "acquired")
  } finally {
    fsp.realpath = originalRealpath
    fsp.lstat = originalLstat
  }
  assert.equal(injected, true)
})

test("lock acquisition retries when the owner unlinks an already-open inspection handle", async (t) => {
  const workspace = root(t)
  const currentOwner = owner({ pid: process.pid, token: "open-delete-owner" })
  await replaceRunDurabilityFile(workspace, "run-1", "run.lock.json", serializeWorkflowRunLock(currentOwner))
  const lockPath = (await readRunDurabilityFile(workspace, "run-1", "run.lock.json")).filePath
  const originalOpen = fsp.open
  let injected = false
  const normalized = (value) => process.platform === "win32"
    ? path.resolve(String(value)).toLowerCase()
    : path.resolve(String(value))

  fsp.open = async (target, flags, ...args) => {
    const handle = await originalOpen(target, flags, ...args)
    const numericFlags = typeof flags === "number" ? flags : -1
    const readOnly = numericFlags >= 0
      && (numericFlags & (fs.constants.O_WRONLY | fs.constants.O_RDWR | fs.constants.O_CREAT)) === 0
    if (!injected && readOnly && normalized(target) === normalized(lockPath)) {
      injected = true
      await fsp.rm(lockPath)
    }
    return handle
  }

  try {
    assert.equal(await withWorkflowRunLock(workspace, "run-1", async () => "acquired", {
      timeoutMs: 1_000,
      pollMs: 5,
      heartbeatMs: 0
    }), "acquired")
  } finally {
    fsp.open = originalOpen
  }
  assert.equal(injected, true)
})

test("same async chain re-enters one lock without deadlock", async (t) => {
  const workspace = root(t)
  const result = await withWorkflowRunLock(workspace, "run-1", () => (
    withWorkflowRunLock(workspace, "run-1", async () => "nested", { timeoutMs: 10, heartbeatMs: 0 })
  ), { timeoutMs: 10, heartbeatMs: 0 })
  assert.equal(result, "nested")
})

test("same-chain alias retarget keeps nested lock and run writes on the acquired physical root", async (t) => {
  const physicalA = root(t)
  const physicalB = root(t)
  const aliasContainer = root(t)
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  try {
    await fsp.symlink(physicalA, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const runA = path.join(physicalA, ".bob", "workflows", "runs", "run-1")
  const runB = path.join(physicalB, ".bob", "workflows", "runs", "run-1")
  await withWorkflowRunLock(workspaceAlias, "run-1", async () => {
    await fsp.rm(workspaceAlias, { force: true })
    await fsp.symlink(physicalB, workspaceAlias, aliasType)

    await withWorkflowRunLock(workspaceAlias, "run-1", async () => {
      await writeContainedRunFile(workspaceAlias, "run-1", "{\"root\":\"A\"}\n")
      await appendRunDurabilityFile(workspaceAlias, "run-1", "events.ndjson", "{\"event\":\"A\"}\n")
    }, { timeoutMs: 25, heartbeatMs: 0 })

    assert.equal(await fsp.readFile(path.join(runA, "run.json"), "utf8"), "{\"root\":\"A\"}\n")
    assert.equal(await fsp.readFile(path.join(runA, "events.ndjson"), "utf8"), "{\"event\":\"A\"}\n")
    await assert.rejects(fsp.access(runB), { code: "ENOENT" })
  }, { timeoutMs: 5_000, heartbeatMs: 0 })

  await withWorkflowRunLock(workspaceAlias, "run-2", async () => {
    await writeContainedRunFile(workspaceAlias, "run-2", "{\"root\":\"B\"}\n")
  }, { timeoutMs: 1_000, heartbeatMs: 0 })
  assert.equal(
    await fsp.readFile(path.join(physicalB, ".bob", "workflows", "runs", "run-2", "run.json"), "utf8"),
    "{\"root\":\"B\"}\n"
  )
})

test("active reentry binds a second lexical alias to the acquired physical root", async (t) => {
  const physicalA = root(t)
  const physicalB = root(t)
  const aliasContainer = root(t)
  const firstAlias = path.join(aliasContainer, "workspace-alias-1")
  const secondAlias = path.join(aliasContainer, "workspace-alias-2")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  try {
    await fsp.symlink(physicalA, firstAlias, aliasType)
    await fsp.symlink(physicalA, secondAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const runA = path.join(physicalA, ".bob", "workflows", "runs", "run-1")
  const runB = path.join(physicalB, ".bob", "workflows", "runs", "run-1")
  await withWorkflowRunLock(firstAlias, "run-1", async () => {
    await withWorkflowRunLock(secondAlias, "run-1", async () => {
      await fsp.rm(secondAlias, { force: true })
      await fsp.symlink(physicalB, secondAlias, aliasType)
      await writeContainedRunFile(secondAlias, "run-1", "{\"root\":\"A\"}\n")
      await appendRunDurabilityFile(secondAlias, "run-1", "events.ndjson", "{\"event\":\"A\"}\n")
    }, { timeoutMs: 25, heartbeatMs: 0 })

    assert.equal(await fsp.readFile(path.join(runA, "run.json"), "utf8"), "{\"root\":\"A\"}\n")
    assert.equal(await fsp.readFile(path.join(runA, "events.ndjson"), "utf8"), "{\"event\":\"A\"}\n")
    await assert.rejects(fsp.access(runB), { code: "ENOENT" })
  }, { timeoutMs: 5_000, heartbeatMs: 0 })

  await withWorkflowRunLock(secondAlias, "run-2", async () => {
    await writeContainedRunFile(secondAlias, "run-2", "{\"root\":\"B\"}\n")
  }, { timeoutMs: 1_000, heartbeatMs: 0 })
  assert.equal(
    await fsp.readFile(path.join(physicalB, ".bob", "workflows", "runs", "run-2", "run.json"), "utf8"),
    "{\"root\":\"B\"}\n"
  )
})

test("detached descendants cannot reuse a released lock or its stale root binding", async (t) => {
  const physicalA = root(t)
  const physicalB = root(t)
  const aliasContainer = root(t)
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  try {
    await fsp.symlink(physicalA, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const startDetached = deferred()
  let detachedAttempt
  let detachedResolvedRoot
  let detachedCallbackRan = false
  await withWorkflowRunLock(workspaceAlias, "run-1", async () => {
    detachedAttempt = (async () => {
      await startDetached.promise
      detachedResolvedRoot = await resolveWorkflowRunWorkspaceRoot(workspaceAlias)
      return withWorkflowRunLock(workspaceAlias, "run-1", async () => {
        detachedCallbackRan = true
        await writeContainedRunFile(workspaceAlias, "run-1", "{\"detached\":true}\n")
      }, { timeoutMs: 0, heartbeatMs: 0 })
    })()
    void detachedAttempt.catch(() => undefined)
  }, { timeoutMs: 1_000, heartbeatMs: 0 })

  await fsp.rm(workspaceAlias, { force: true })
  await fsp.symlink(physicalB, workspaceAlias, aliasType)

  const holderEntered = deferred()
  const releaseHolder = deferred()
  const holder = withWorkflowRunLock(workspaceAlias, "run-1", async () => {
    holderEntered.resolve()
    await releaseHolder.promise
  }, { timeoutMs: 1_000, heartbeatMs: 0 })
  await holderEntered.promise

  try {
    startDetached.resolve()
    await assert.rejects(detachedAttempt, /busy|locked by/i)
    assert.equal(detachedCallbackRan, false)
    assert.equal(
      process.platform === "win32" ? detachedResolvedRoot.toLowerCase() : detachedResolvedRoot,
      process.platform === "win32" ? physicalB.toLowerCase() : physicalB
    )
    await assert.rejects(
      fsp.access(path.join(physicalA, ".bob", "workflows", "runs", "run-1", "run.json")),
      { code: "ENOENT" }
    )
  } finally {
    releaseHolder.resolve()
    await holder
  }
})

test("a waiting lock for an existing run does not recreate its directory after cleanup removes it", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(path.join(runDirectory, "run.json"), "{}\n")
  const cleanupEntered = deferred()
  const releaseCleanup = deferred()
  const contentionObserved = deferred()
  const retryLock = deferred()

  const cleanup = withTimeout(withWorkflowRunCleanupLeases(workspace, ["run-1"], async () => {
    cleanupEntered.resolve()
    await withTimeout(releaseCleanup.promise, "cleanup release")
    await fsp.rm(runDirectory, { recursive: true })
  }), "cleanup lease operation")
  await withTimeout(cleanupEntered.promise, "cleanup lease acquisition")

  let firstSleep = true
  let operationRan = false
  const contender = withTimeout(withWorkflowRunLock(workspace, "run-1", async () => {
    operationRan = true
  }, {
    timeoutMs: 1_000,
    pollMs: 5,
    heartbeatMs: 0,
    sleep: async () => {
      if (!firstSleep) return new Promise((resolve) => setImmediate(resolve))
      firstSleep = false
      contentionObserved.resolve()
      await withTimeout(retryLock.promise, "lock retry release")
    }
  }), "vanished-run lock rejection")
  await withTimeout(contentionObserved.promise, "cleanup contention observation")
  releaseCleanup.resolve()
  await cleanup
  retryLock.resolve()

  await assert.rejects(contender, /disappeared while its execution lock was being acquired/i)
  assert.equal(operationRan, false)
  await assert.rejects(fsp.access(runDirectory), { code: "ENOENT" })
})

test("a lock for a genuinely new run id still creates its run directory", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "new-run")
  await withTimeout(withWorkflowRunLock(workspace, "new-run", async () => {
    assert.equal((await fsp.stat(runDirectory)).isDirectory(), true)
    assert.ok(await readRunDurabilityFile(workspace, "new-run", "run.lock.json"))
  }, { timeoutMs: 1_000, heartbeatMs: 0 }), "new-run lock")
  assert.equal((await fsp.stat(runDirectory)).isDirectory(), true)
  assert.equal(await readRunDurabilityFile(workspace, "new-run", "run.lock.json"), undefined)
})

test("a child process prevents a second process from acquiring an active lease", async (t) => {
  const workspace = root(t)
  const fixture = path.join(__dirname, "fixtures", "run-lock-holder.js")
  const child = spawn(process.execPath, [fixture, workspace, "run-1"], { stdio: ["pipe", "pipe", "pipe"] })
  t.after(() => child.kill())
  await withTimeout(new Promise((resolve, reject) => {
    let output = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      output += chunk
      if (output.includes("READY\n")) resolve()
    })
    child.once("exit", (code) => reject(new Error(`lock holder exited early: ${code}`)))
  }), "child lock holder readiness")
  await assert.rejects(
    withWorkflowRunLock(workspace, "run-1", async () => undefined, { timeoutMs: 75, pollMs: 5, heartbeatMs: 0 }),
    /busy|locked by/i
  )
  child.stdin.end("\n")
  assert.equal(await withTimeout(new Promise((resolve) => child.once("exit", resolve)), "child lock holder exit"), 0)
})

test("stale ownership is reclaimed only under the documented rules", async (t) => {
  const cases = [
    {
      name: "dead same-host pid",
      lock: owner(),
      mtime: Date.parse("2026-07-12T00:01:00.000Z"),
      options: { processAlive: () => false },
      acquired: true
    },
    {
      name: "live same-host pid",
      lock: owner(),
      mtime: Date.parse("2026-07-12T00:00:00.000Z"),
      options: { processAlive: () => true },
      acquired: false
    },
    {
      name: "stale foreign host",
      lock: owner({ hostname: "other-host" }),
      mtime: Date.parse("2026-07-12T00:00:00.000Z"),
      options: { processAlive: () => false },
      acquired: true
    },
    {
      name: "fresh mtime preserves a foreign owner while its JSON heartbeat is stale",
      lock: owner({ hostname: "other-host" }),
      mtime: Date.parse("2026-07-12T00:01:00.000Z"),
      options: { processAlive: () => false },
      acquired: false
    }
  ]
  for (const item of cases) {
    await t.test(item.name, async (t) => {
      const workspace = root(t)
      await replaceRunDurabilityFile(workspace, "run-1", "run.lock.json", serializeWorkflowRunLock(item.lock))
      const lockPath = (await readRunDurabilityFile(workspace, "run-1", "run.lock.json")).filePath
      await fsp.utimes(lockPath, item.mtime / 1000, item.mtime / 1000)
      const operation = withWorkflowRunLock(workspace, "run-1", async () => "acquired", {
        timeoutMs: 40,
        pollMs: 5,
        heartbeatMs: 0,
        staleMs: 1_000,
        now: () => new Date("2026-07-12T00:01:00.000Z"),
        hostname: os.hostname(),
        ...item.options
      })
      if (item.acquired) assert.equal(await operation, "acquired")
      else await assert.rejects(operation, /busy|locked by/i)
    })
  }
})

test("malformed recent locks are preserved while malformed stale locks are reclaimable", async (t) => {
  for (const [name, ageMs, acquired] of [["recent", 0, false], ["stale", 60_000, true]]) {
    await t.test(name, async (t) => {
      const workspace = root(t)
      await replaceRunDurabilityFile(workspace, "run-1", "run.lock.json", "{invalid\n")
      const snapshot = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
      const nowMs = Date.now()
      const when = nowMs - ageMs
      await fsp.utimes(snapshot.filePath, when / 1000, when / 1000)
      const operation = withWorkflowRunLock(workspace, "run-1", async () => "acquired", {
        timeoutMs: 40,
        pollMs: 5,
        heartbeatMs: 0,
        staleMs: 1_000,
        now: () => new Date(nowMs)
      })
      if (acquired) assert.equal(await operation, "acquired")
      else await assert.rejects(operation, /busy|locked by/i)
    })
  }
})

test("release rejects a formerly successful operation after lock ownership is replaced", async (t) => {
  const workspace = root(t)
  await assert.rejects(
    withWorkflowRunLock(workspace, "run-1", async () => {
      const replacement = owner({ token: "replacement-token", pid: process.pid, heartbeatAt: new Date().toISOString() })
      await replaceRunDurabilityFile(workspace, "run-1", "run.lock.json", serializeWorkflowRunLock(replacement))
    }, { heartbeatMs: 0 }),
    /ownership changed|no longer owns|release/i
  )
  const remaining = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
  assert.equal(parseWorkflowRunLock(JSON.parse(remaining.bytes.toString("utf8")), "run-1").token, "replacement-token")
})
