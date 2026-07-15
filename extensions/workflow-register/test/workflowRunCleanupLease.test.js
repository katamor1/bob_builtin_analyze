const assert = require("node:assert/strict")
const { constants } = require("node:fs")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { createPhysicalPathMatcher } = require("./helpers/physicalPathMatcher")

const matchesPhysicalPath = createPhysicalPathMatcher(fs)

function leaseModules() {
  return require("../out/core/runtime/runCleanupLease")
}

function lockModules() {
  return require("../out/core/runtime/runLock")
}

function runStateModules() {
  return require("../out/core/runtime/runStatePath")
}

function rootBindingModules() {
  return require("../out/core/runtime/workflowRunWorkspaceRootBinding")
}

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function settle(operation) {
  return operation.then(
    (value) => ({ status: "fulfilled", value }),
    (reason) => ({ status: "rejected", reason })
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function withTimeout(promise, label, timeoutMs = 30_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function eventually(predicate, message, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs
  let lastError
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return
    } catch (error) {
      lastError = error
    }
    await delay(10)
  }
  throw new Error(`${message}${lastError ? ` (${lastError.message})` : ""}`)
}

async function workspace(t, runIds = ["run-a"]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-lease-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  for (const runId of runIds) {
    await fs.mkdir(path.join(root, ".bob", "workflows", "runs", runId), { recursive: true })
    await fs.writeFile(path.join(root, ".bob", "workflows", "runs", runId, "run.json"), "{}")
  }
  return await fs.realpath(root)
}

test("cleanup leases live outside workflow run enumeration", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const { listContainedRunIds } = runStateModules()
  let releaseOwner
  const hold = new Promise((resolve) => { releaseOwner = resolve })
  let entered
  const enteredPromise = new Promise((resolve) => { entered = resolve })
  const owner = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entered()
    await hold
  }, { token: () => "location-token", hostname: "test-host" })

  await enteredPromise
  try {
    assert.deepEqual(await listContainedRunIds(root), ["run-a"])
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), true)
    const persisted = JSON.parse(await fs.readFile(
      path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json"),
      "utf8"
    ))
    assert.equal(persisted.runId, "run-a")
  } finally {
    releaseOwner()
    await owner
  }
})

test("cleanup lease is exclusive and removed after the owner operation", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  let releaseOwner
  const ownerEntered = new Promise((resolve) => { releaseOwner = resolve })
  let entered
  const enteredPromise = new Promise((resolve) => { entered = resolve })
  const owner = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entered()
    await ownerEntered
    return "done"
  }, { token: () => "owner-token", hostname: "test-host" })

  await enteredPromise
  assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), true)
  await assert.rejects(
    withWorkflowRunCleanupLeases(root, ["run-a"], async () => undefined, { token: () => "other-token", hostname: "test-host" }),
    /reserved by a cleanup operation|cleanup lease/i
  )
  releaseOwner()
  assert.equal(await owner, "done")
  assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), false)
})

test("cleanup requested through a retargeted alias observes the outer physical-root execution lock", async (t) => {
  const physicalA = await workspace(t)
  const physicalB = await workspace(t)
  const aliasContainer = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-alias-"))
  t.after(() => fs.rm(aliasContainer, { recursive: true, force: true }))
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  try {
    await fs.symlink(physicalA, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { withWorkflowRunLock } = lockModules()
  let cleanupCallbackRan = false
  await withWorkflowRunLock(workspaceAlias, "run-a", async () => {
    await fs.rm(workspaceAlias, { force: true })
    await fs.symlink(physicalB, workspaceAlias, aliasType)
    await assert.rejects(
      withWorkflowRunCleanupLeases(workspaceAlias, ["run-a"], async () => {
        cleanupCallbackRan = true
      }, { token: () => "must-not-acquire", hostname: "test-host" }),
      /active execution lock/i
    )
  }, { timeoutMs: 1_000, heartbeatMs: 0 })

  assert.equal(cleanupCallbackRan, false)
  await assert.rejects(
    fs.access(path.join(physicalB, ".bob", "workflows", "run-cleanup-leases")),
    { code: "ENOENT" }
  )
})

test("detached cleanup descendants cannot retain a released root binding", async (t) => {
  const physicalA = await workspace(t)
  const physicalB = await workspace(t)
  const aliasContainer = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-detached-alias-"))
  t.after(() => fs.rm(aliasContainer, { recursive: true, force: true }))
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  try {
    await fs.symlink(physicalA, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { writeContainedRunFile } = runStateModules()
  const { resolveWorkflowRunWorkspaceRoot } = rootBindingModules()
  const startDetached = deferred()
  let detachedResolvedRoot
  let detachedOperation

  await withWorkflowRunCleanupLeases(workspaceAlias, ["run-a"], async () => {
    detachedOperation = (async () => {
      await startDetached.promise
      detachedResolvedRoot = await resolveWorkflowRunWorkspaceRoot(workspaceAlias)
      await writeContainedRunFile(workspaceAlias, "run-a", "{\"root\":\"B\"}\n")
    })()
    void detachedOperation.catch(() => undefined)
  }, { token: () => "detached-cleanup", hostname: "test-host" })

  await fs.rm(workspaceAlias, { force: true })
  await fs.symlink(physicalB, workspaceAlias, aliasType)
  startDetached.resolve()
  await detachedOperation

  assert.equal(
    process.platform === "win32" ? detachedResolvedRoot.toLowerCase() : detachedResolvedRoot,
    process.platform === "win32" ? physicalB.toLowerCase() : physicalB
  )
  assert.equal(await fs.readFile(path.join(physicalA, ".bob", "workflows", "runs", "run-a", "run.json"), "utf8"), "{}")
  assert.equal(
    await fs.readFile(path.join(physicalB, ".bob", "workflows", "runs", "run-a", "run.json"), "utf8"),
    "{\"root\":\"B\"}\n"
  )
})

test("cleanup lease safely reclaims a stale dead-owner lease", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const directory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  await fs.mkdir(directory)
  await fs.writeFile(path.join(directory, "run-a.json"), JSON.stringify({
    schemaVersion: "workflow-register/run-cleanup-lease/v1",
    runId: "run-a",
    token: "stale",
    pid: 999999,
    hostname: "test-host",
    createdAt: "2026-07-13T00:00:00.000Z",
    heartbeatAt: "2026-07-13T00:00:00.000Z"
  }))

  const result = await withWorkflowRunCleanupLeases(root, ["run-a"], async () => "recovered", {
    token: () => "fresh",
    hostname: "test-host",
    processAlive: () => false,
    now: () => new Date("2026-07-13T05:00:00.000Z"),
    staleMs: 1_000
  })
  assert.equal(result, "recovered")
})

test("an orphan cleanup guard fails closed and is never reclaimed automatically", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const guardDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.guard")
  await fs.mkdir(guardDirectory, { recursive: true })
  await fs.writeFile(path.join(guardDirectory, "owner.json"), `${JSON.stringify({
    schemaVersion: "workflow-register/run-cleanup-lease/v1",
    runId: "run-a",
    token: "orphan-owner",
    pid: 999999,
    hostname: "test-host",
    createdAt: "2026-07-13T00:00:00.000Z",
    heartbeatAt: "2026-07-13T00:00:00.000Z"
  }, null, 2)}\n`)

  let entered = false
  await assert.rejects(
    withWorkflowRunCleanupLeases(root, ["run-a"], async () => { entered = true }, {
      token: () => "contender",
      hostname: "test-host",
      processAlive: () => false,
      now: () => new Date("2026-07-13T05:00:00.000Z"),
      staleMs: 1
    }),
    /reserved by a cleanup operation|cleanup guard|cleanup lease/i
  )
  assert.equal(entered, false)
  assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), true)
  assert.equal(JSON.parse(await fs.readFile(path.join(guardDirectory, "owner.json"), "utf8")).token, "orphan-owner")
})

test("cleanup release removes owned JSON before its guard and never mutates the run afterward", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  const guardDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.guard")
  const originalRmdir = fs.rmdir
  const guardRemoval = deferred()
  let guardRemoved = false
  fs.rmdir = async (target, ...args) => {
    if (await matchesPhysicalPath(target, guardDirectory)) {
      await assert.rejects(fs.access(leaseFile), { code: "ENOENT" })
      guardRemoval.resolve()
      const result = await originalRmdir(target, ...args)
      guardRemoved = true
      return result
    }
    return originalRmdir(target, ...args)
  }

  try {
    await withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      assert.equal((await fs.stat(guardDirectory)).isDirectory(), true)
      assert.equal(JSON.parse(await fs.readFile(leaseFile, "utf8")).token, "release-owner")
    }, { token: () => "release-owner", hostname: "test-host" })
    await withTimeout(guardRemoval.promise, "cleanup guard removal hook")
    assert.equal(guardRemoved, true)
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), false)
  } finally {
    fs.rmdir = originalRmdir
  }
})

test("new cleanup guard is removed when its first identity check fails transiently", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const guardDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.guard")
  const primaryError = Object.assign(new Error("GUARD_FIRST_IDENTITY_SENTINEL"), { code: "EIO" })
  const originalLstat = fs.lstat
  let injected = false
  fs.lstat = async (target, ...args) => {
    const normalize = (value) => process.platform === "win32"
      ? path.resolve(String(value)).toLowerCase()
      : path.resolve(String(value))
    if (!injected && normalize(target) === normalize(guardDirectory)) {
      injected = true
      throw primaryError
    }
    return originalLstat(target, ...args)
  }

  let observedError
  try {
    await withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      assert.fail("cleanup callback must not run after guard identity failure")
    }, { token: () => "first-identity-owner", hostname: "test-host" })
  } catch (error) {
    observedError = error
  } finally {
    fs.lstat = originalLstat
  }

  assert.equal(injected, true)
  assert.strictEqual(observedError, primaryError)
  await assert.rejects(fs.access(guardDirectory), { code: "ENOENT" })
  assert.equal(await withWorkflowRunCleanupLeases(root, ["run-a"], async () => "retried", {
    token: () => "first-identity-retry",
    hostname: "test-host"
  }), "retried")
})

for (const publication of ["guard owner", "lease metadata"]) {
  test(`${publication} publication failure removes only its newly-owned cleanup artifacts`, async (t) => {
    const root = await workspace(t)
    const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
    const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
    const leaseFile = path.join(leaseDirectory, "run-a.json")
    const guardDirectory = path.join(leaseDirectory, "run-a.guard")
    const ownerFile = path.join(guardDirectory, "owner.json")
    const target = publication === "guard owner" ? ownerFile : leaseFile
    const primaryError = Object.assign(new Error(`${publication.toUpperCase().replaceAll(" ", "_")}_SYNC_SENTINEL`), { code: "EIO" })
    const closeError = Object.assign(new Error(`${publication.toUpperCase().replaceAll(" ", "_")}_CLOSE_SENTINEL`), { code: "EIO" })
    const originalOpen = fs.open
    let wrapped = false
    let injected = false
    fs.open = async (file, ...args) => {
      const handle = await originalOpen(file, ...args)
      if (!wrapped && await matchesPhysicalPath(file, target)) {
        wrapped = true
        const originalSync = handle.sync.bind(handle)
        const originalClose = handle.close.bind(handle)
        handle.sync = async (...syncArgs) => {
          const result = await originalSync(...syncArgs)
          injected = true
          throw primaryError
        }
        handle.close = async () => {
          await originalClose()
          throw closeError
        }
      }
      return handle
    }

    let observedError
    try {
      await withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
        assert.fail("cleanup callback must not run after publication failure")
      }, { token: () => "publication-owner", hostname: "test-host" })
    } catch (error) {
      observedError = error
    } finally {
      fs.open = originalOpen
    }

    assert.equal(injected, true)
    assert.strictEqual(observedError, primaryError)
    assert.match(observedError.message, /close also failed/i)
    assert.deepEqual(observedError.suppressedErrors, [closeError])
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), false)
    await assert.rejects(fs.access(leaseFile), { code: "ENOENT" })
    await assert.rejects(fs.access(guardDirectory), { code: "ENOENT" })

    assert.equal(await withWorkflowRunCleanupLeases(root, ["run-a"], async () => "retried", {
      token: () => "retry-owner",
      hostname: "test-host"
    }), "retried")
  })
}

test("failed lease publication preserves an identity-changed replacement and its authoritative guard", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const leaseFile = path.join(leaseDirectory, "run-a.json")
  const guardDirectory = path.join(leaseDirectory, "run-a.guard")
  const displacedFile = path.join(leaseDirectory, "run-a.displaced.json")
  const replacementBytes = `${JSON.stringify({
    schemaVersion: "workflow-register/run-cleanup-lease/v1",
    runId: "run-a",
    token: "replacement-owner",
    pid: process.pid,
    hostname: "replacement-host",
    createdAt: "2026-07-13T00:00:00.000Z",
    heartbeatAt: "2026-07-13T00:00:00.000Z"
  })}\n`
  const primaryError = Object.assign(new Error("LEASE_PUBLICATION_PRIMARY_SENTINEL"), { code: "EIO" })
  const originalOpen = fs.open
  const originalRm = fs.rm
  let wrapped = false
  let replacementRmAttempts = 0
  fs.open = async (file, ...args) => {
    const handle = await originalOpen(file, ...args)
    if (!wrapped && await matchesPhysicalPath(file, leaseFile)) {
      wrapped = true
      const originalSync = handle.sync.bind(handle)
      handle.sync = async (...syncArgs) => {
        await originalSync(...syncArgs)
        await fs.rename(leaseFile, displacedFile)
        await fs.writeFile(leaseFile, replacementBytes)
        throw primaryError
      }
    }
    return handle
  }
  fs.rm = async (target, ...args) => {
    if (await matchesPhysicalPath(target, leaseFile)) replacementRmAttempts += 1
    return originalRm(target, ...args)
  }

  let observedError
  try {
    await withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      assert.fail("cleanup callback must not run after publication replacement")
    }, { token: () => "original-publication-owner", hostname: "test-host" })
  } catch (error) {
    observedError = error
  } finally {
    fs.rm = originalRm
    fs.open = originalOpen
  }

  assert.strictEqual(observedError, primaryError)
  assert.match(observedError.message, /publication cleanup also failed.*identity changed/i)
  assert.match(observedError.message, /acquisition rollback also failed.*changed ownership/i)
  assert.equal(observedError.suppressedErrors.length, 2)
  assert.equal(replacementRmAttempts, 0)
  assert.equal(await fs.readFile(leaseFile, "utf8"), replacementBytes)
  assert.equal((await fs.stat(displacedFile)).isFile(), true)
  assert.equal((await fs.stat(guardDirectory)).isDirectory(), true)
  assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), true)
})

test("cleanup lease reader keeps its primary error when handle close also fails", async (t) => {
  const root = await workspace(t)
  const { workflowRunCleanupLeasePresent } = leaseModules()
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const leaseFile = path.join(leaseDirectory, "run-a.json")
  await fs.mkdir(leaseDirectory)
  await fs.writeFile(leaseFile, `${JSON.stringify({
    schemaVersion: "workflow-register/run-cleanup-lease/v1",
    runId: "run-a",
    token: "reader-owner",
    pid: process.pid,
    hostname: "test-host",
    createdAt: "2026-07-13T00:00:00.000Z",
    heartbeatAt: "2026-07-13T00:00:00.000Z"
  })}\n`)
  const primaryError = Object.assign(new Error("LEASE_READ_PRIMARY_SENTINEL"), { code: "EIO" })
  const closeError = Object.assign(new Error("LEASE_CLOSE_SENTINEL"), { code: "EIO" })
  const originalOpen = fs.open
  let wrapped = false
  fs.open = async (file, ...args) => {
    const handle = await originalOpen(file, ...args)
    if (!wrapped && await matchesPhysicalPath(file, leaseFile)) {
      wrapped = true
      const originalClose = handle.close.bind(handle)
      handle.readFile = async () => { throw primaryError }
      handle.close = async () => {
        await originalClose()
        throw closeError
      }
    }
    return handle
  }

  let observedError
  try {
    await workflowRunCleanupLeasePresent(root, "run-a")
  } catch (error) {
    observedError = error
  } finally {
    fs.open = originalOpen
  }

  assert.strictEqual(observedError, primaryError)
  assert.match(observedError.message, /close also failed/i)
  assert.deepEqual(observedError.suppressedErrors, [closeError])
  assert.equal(await fs.readFile(leaseFile, "utf8").then((value) => value.includes("reader-owner")), true)
})

test("cleanup lease heartbeat keeps its primary error when handle close also fails", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  const primaryError = Object.assign(new Error("LEASE_HEARTBEAT_PRIMARY_SENTINEL"), { code: "EIO" })
  const closeError = Object.assign(new Error("LEASE_HEARTBEAT_CLOSE_SENTINEL"), { code: "EIO" })
  const originalOpen = fs.open
  const heartbeatInjected = deferred()
  let wrapped = false
  fs.open = async (file, flags, ...args) => {
    const handle = await originalOpen(file, flags, ...args)
    if (!wrapped && typeof flags === "number" && (flags & constants.O_RDWR) === constants.O_RDWR
      && await matchesPhysicalPath(file, leaseFile)) {
      wrapped = true
      const originalClose = handle.close.bind(handle)
      handle.utimes = async () => {
        heartbeatInjected.resolve()
        throw primaryError
      }
      handle.close = async () => {
        await originalClose()
        throw closeError
      }
    }
    return handle
  }

  let observedError
  try {
    await withTimeout(withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      await heartbeatInjected.promise
    }, {
      token: () => "heartbeat-priority-owner",
      hostname: "test-host",
      staleMs: 30
    }), "cleanup lease heartbeat priority")
  } catch (error) {
    observedError = error
  } finally {
    fs.open = originalOpen
  }

  assert.strictEqual(observedError, primaryError)
  assert.match(observedError.message, /close also failed/i)
  assert.deepEqual(observedError.suppressedErrors, [closeError])
})

test("cleanup operation error keeps priority when lease parent cleanup also fails", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { WorkflowRunCleanupIncompleteError } = require("../out/core/runtime/runCleanupTransaction")
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const leaseFile = path.join(leaseDirectory, "run-a.json")
  const guardDirectory = path.join(leaseDirectory, "run-a.guard")
  const originalRmdir = fs.rmdir
  const parentCleanupError = Object.assign(new Error("PARENT_CLEANUP_SENTINEL"), { code: "EIO" })
  const primaryError = new WorkflowRunCleanupIncompleteError({
    phase: "rollback",
    committedRunIds: ["committed-run"],
    residualRunIds: ["residual-run"],
    retainedQuarantinePath: "retained-quarantine",
    cause: new Error("PRIMARY_CAUSE_SENTINEL"),
    message: "PRIMARY_OPERATION_SENTINEL"
  })
  let parentCleanupAttempts = 0
  fs.rmdir = async (target, ...args) => {
    if (await matchesPhysicalPath(target, leaseDirectory)) {
      parentCleanupAttempts += 1
      throw parentCleanupError
    }
    return originalRmdir(target, ...args)
  }

  let observedError
  try {
    await withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      throw primaryError
    }, { token: () => "primary-owner", hostname: "test-host" })
  } catch (error) {
    observedError = error
  } finally {
    fs.rmdir = originalRmdir
  }

  assert.strictEqual(observedError, primaryError)
  assert.equal(observedError instanceof WorkflowRunCleanupIncompleteError, true)
  assert.equal(observedError.phase, "rollback")
  assert.deepEqual(observedError.committedRunIds, ["committed-run"])
  assert.deepEqual(observedError.residualRunIds, ["residual-run"])
  assert.equal(observedError.retainedQuarantinePath, "retained-quarantine")
  assert.match(observedError.message, /PRIMARY_OPERATION_SENTINEL/)
  assert.match(observedError.message, /lease parent cleanup also failed.*PARENT_CLEANUP_SENTINEL/i)
  assert.deepEqual(observedError.suppressedErrors, [parentCleanupError])
  assert.equal(Object.getOwnPropertyDescriptor(observedError, "suppressedErrors")?.enumerable, false)
  assert.equal(Object.isFrozen(observedError.suppressedErrors), true)
  assert.equal(parentCleanupAttempts, 1)
  await assert.rejects(fs.access(leaseFile), { code: "ENOENT" })
  await assert.rejects(fs.access(guardDirectory), { code: "ENOENT" })
  assert.equal((await fs.stat(leaseDirectory)).isDirectory(), true)
})

test("lease parent cleanup failure is surfaced after a successful operation", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const originalRmdir = fs.rmdir
  const parentCleanupError = Object.assign(new Error("PARENT_CLEANUP_SENTINEL"), { code: "EIO" })
  let parentCleanupAttempts = 0
  fs.rmdir = async (target, ...args) => {
    if (await matchesPhysicalPath(target, leaseDirectory)) {
      parentCleanupAttempts += 1
      throw parentCleanupError
    }
    return originalRmdir(target, ...args)
  }

  let observedError
  try {
    await withWorkflowRunCleanupLeases(root, ["run-a"], async () => "completed", {
      token: () => "success-owner",
      hostname: "test-host"
    })
  } catch (error) {
    observedError = error
  } finally {
    fs.rmdir = originalRmdir
  }

  assert.strictEqual(observedError, parentCleanupError)
  assert.equal(parentCleanupAttempts, 1)
  assert.equal((await fs.stat(leaseDirectory)).isDirectory(), true)
})

test("lease release error keeps priority when parent cleanup also fails after every release settles", async (t) => {
  const root = await workspace(t, ["run-a", "run-b"])
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const failedGuardDirectory = path.join(leaseDirectory, "run-b.guard")
  const originalRmdir = fs.rmdir
  const releaseError = Object.assign(new Error("LEASE_RELEASE_SENTINEL"), { code: "EIO" })
  const parentCleanupError = Object.assign(new Error("PARENT_CLEANUP_SENTINEL"), { code: "EIO" })
  let releaseFailureInjected = 0
  let parentCleanupAttempts = 0
  fs.rmdir = async (target, ...args) => {
    if (await matchesPhysicalPath(target, failedGuardDirectory)) {
      releaseFailureInjected += 1
      await originalRmdir(target, ...args)
      throw releaseError
    }
    if (await matchesPhysicalPath(target, leaseDirectory)) {
      parentCleanupAttempts += 1
      throw parentCleanupError
    }
    return originalRmdir(target, ...args)
  }

  let observedError
  try {
    await withWorkflowRunCleanupLeases(root, ["run-b", "run-a"], async () => "completed", {
      token: () => "release-owner",
      hostname: "test-host"
    })
  } catch (error) {
    observedError = error
  } finally {
    fs.rmdir = originalRmdir
  }

  assert.match(observedError?.message ?? "", /lease release failed.*run-b.*LEASE_RELEASE_SENTINEL/i)
  assert.match(observedError?.message ?? "", /lease parent cleanup also failed.*PARENT_CLEANUP_SENTINEL/i)
  assert.deepEqual(observedError?.suppressedErrors, [releaseError, parentCleanupError])
  assert.equal(Object.getOwnPropertyDescriptor(observedError, "suppressedErrors")?.enumerable, false)
  assert.equal(Object.isFrozen(observedError?.suppressedErrors), true)
  assert.equal(releaseFailureInjected, 1)
  assert.equal(parentCleanupAttempts, 1)
  for (const runId of ["run-a", "run-b"]) {
    await assert.rejects(fs.access(path.join(leaseDirectory, `${runId}.json`)), { code: "ENOENT" })
    await assert.rejects(fs.access(path.join(leaseDirectory, `${runId}.guard`)), { code: "ENOENT" })
  }
  assert.equal((await fs.stat(leaseDirectory)).isDirectory(), true)
})

test("typed cleanup operation error survives release and parent cleanup failures", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { WorkflowRunCleanupIncompleteError } = require("../out/core/runtime/runCleanupTransaction")
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const leaseFile = path.join(leaseDirectory, "run-a.json")
  const guardDirectory = path.join(leaseDirectory, "run-a.guard")
  const originalRmdir = fs.rmdir
  const releaseError = Object.assign(new Error("LEASE_RELEASE_SENTINEL"), { code: "EIO" })
  const parentCleanupError = Object.assign(new Error("PARENT_CLEANUP_SENTINEL"), { code: "EIO" })
  const primaryError = new WorkflowRunCleanupIncompleteError({
    phase: "purge",
    committedRunIds: ["run-a"],
    residualRunIds: ["run-a"],
    retainedQuarantinePath: "retained-quarantine",
    cause: new Error("PRIMARY_CAUSE_SENTINEL"),
    message: "PRIMARY_OPERATION_SENTINEL"
  })
  let releaseFailureInjected = 0
  let parentCleanupAttempts = 0
  fs.rmdir = async (target, ...args) => {
    if (await matchesPhysicalPath(target, guardDirectory)) {
      releaseFailureInjected += 1
      await originalRmdir(target, ...args)
      throw releaseError
    }
    if (await matchesPhysicalPath(target, leaseDirectory)) {
      parentCleanupAttempts += 1
      throw parentCleanupError
    }
    return originalRmdir(target, ...args)
  }

  let observedError
  try {
    await withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      throw primaryError
    }, { token: () => "typed-owner", hostname: "test-host" })
  } catch (error) {
    observedError = error
  } finally {
    fs.rmdir = originalRmdir
  }

  assert.strictEqual(observedError, primaryError)
  assert.equal(observedError instanceof WorkflowRunCleanupIncompleteError, true)
  assert.equal(observedError.phase, "purge")
  assert.deepEqual(observedError.committedRunIds, ["run-a"])
  assert.deepEqual(observedError.residualRunIds, ["run-a"])
  assert.equal(observedError.retainedQuarantinePath, "retained-quarantine")
  assert.match(observedError.message, /PRIMARY_OPERATION_SENTINEL/)
  assert.match(observedError.message, /lease release also failed.*run-a.*LEASE_RELEASE_SENTINEL/i)
  assert.match(observedError.message, /lease parent cleanup also failed.*PARENT_CLEANUP_SENTINEL/i)
  assert.deepEqual(observedError.suppressedErrors, [releaseError, parentCleanupError])
  assert.equal(Object.getOwnPropertyDescriptor(observedError, "suppressedErrors")?.enumerable, false)
  assert.equal(Object.isFrozen(observedError.suppressedErrors), true)
  assert.equal(releaseFailureInjected, 1)
  assert.equal(parentCleanupAttempts, 1)
  await assert.rejects(fs.access(leaseFile), { code: "ENOENT" })
  await assert.rejects(fs.access(guardDirectory), { code: "ENOENT" })
  assert.equal((await fs.stat(leaseDirectory)).isDirectory(), true)
})

test("stale reclaim preserves a lease whose heartbeat advances during verification", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  await fs.mkdir(path.dirname(leaseFile))
  await fs.writeFile(leaseFile, JSON.stringify({
    schemaVersion: "workflow-register/run-cleanup-lease/v1",
    runId: "run-a",
    token: "original-owner",
    pid: 999999,
    hostname: "owner-host",
    createdAt: "2026-07-13T00:00:00.000Z",
    heartbeatAt: "2026-07-13T00:00:00.000Z"
  }))
  const staleAt = new Date("2026-07-13T00:00:00.000Z")
  const refreshedAt = new Date("2026-07-13T05:00:00.000Z")
  await fs.utimes(leaseFile, staleAt, staleAt)

  const originalOpen = fs.open
  const verificationRead = deferred()
  const continueRead = deferred()
  let readCount = 0
  fs.open = async (...args) => {
    const readOnly = args[1] === "r"
      || (typeof args[1] === "number" && (args[1] & (constants.O_WRONLY | constants.O_RDWR)) === 0)
    if (await matchesPhysicalPath(args[0], leaseFile) && readOnly) {
      readCount += 1
      if (readCount === 2) {
        const handle = await originalOpen(...args)
        verificationRead.resolve()
        await continueRead.promise
        return handle
      }
    }
    return originalOpen(...args)
  }

  const contender = withWorkflowRunCleanupLeases(root, ["run-a"], async () => "must-not-run", {
    token: () => "contender",
    hostname: "contender-host",
    now: () => refreshedAt,
    staleMs: 1_000
  })
  try {
    await withTimeout(verificationRead.promise, "stale reclaim verification read")
    await fs.utimes(leaseFile, refreshedAt, refreshedAt)
    continueRead.resolve()
    await assert.rejects(contender, /reserved by a cleanup operation|cleanup lease/i)
    const persisted = JSON.parse(await fs.readFile(leaseFile, "utf8"))
    assert.equal(persisted.token, "original-owner")
  } finally {
    continueRead.resolve()
    fs.open = originalOpen
    await contender.catch(() => undefined)
  }
  assert.ok(readCount >= 2, "the stale verification read hook must fire")
})

test("a guarded stale reclaim cannot delete a replacement owner after verification", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  await fs.mkdir(path.dirname(leaseFile))
  await fs.writeFile(leaseFile, `${JSON.stringify({
    schemaVersion: "workflow-register/run-cleanup-lease/v1",
    runId: "run-a",
    token: "legacy-stale-owner",
    pid: 999999,
    hostname: "test-host",
    createdAt: "2026-07-13T00:00:00.000Z",
    heartbeatAt: "2026-07-13T00:00:00.000Z"
  }, null, 2)}\n`)

  const originalRm = fs.rm
  const removalVerified = deferred()
  const continueRemoval = deferred()
  const replacementEntered = deferred()
  const contenderEntered = deferred()
  const releaseReplacement = deferred()
  let intercepted = false
  const entries = []
  fs.rm = async (target, ...args) => {
    if (!intercepted && await matchesPhysicalPath(target, leaseFile)) {
      intercepted = true
      removalVerified.resolve()
      await continueRemoval.promise
    }
    return originalRm(target, ...args)
  }

  const contender = settle(withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entries.push("contender")
    contenderEntered.resolve()
  }, {
    token: () => "contender",
    hostname: "test-host",
    processAlive: () => false,
    now: () => new Date("2026-07-13T05:00:00.000Z"),
    staleMs: 1_000
  }))
  let replacement
  try {
    await withTimeout(removalVerified.promise, "stale reclaim post-verification removal hook")
    await originalRm(leaseFile)
    replacement = settle(withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      entries.push("replacement")
      replacementEntered.resolve()
      await releaseReplacement.promise
    }, { token: () => "replacement", hostname: "test-host" }))

    const replacementLaunch = await Promise.race([
      replacementEntered.promise.then(() => "entered"),
      replacement.then((outcome) => outcome.status)
    ])
    continueRemoval.resolve()
    if (replacementLaunch === "entered") {
      const unsafe = await Promise.race([
        contenderEntered.promise.then(() => "second-entry"),
        contender.then(() => "contender-settled")
      ])
      assert.notEqual(unsafe, "second-entry", `critical sections entered: ${entries.join(", ")}`)
    } else {
      assert.equal(replacementLaunch, "rejected")
      await contender
    }
    assert.ok(entries.length <= 1, `critical sections entered: ${entries.join(", ")}`)
  } finally {
    continueRemoval.resolve()
    releaseReplacement.resolve()
    fs.rm = originalRm
    await Promise.all([contender, replacement ?? Promise.resolve()])
  }
  assert.equal(intercepted, true, "the guarded stale removal hook must fire")
})

test("cleanup lease heartbeat prevents foreign-host reclaim and stops after success", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  const entered = deferred()
  const releaseOwner = deferred()
  let nowMs = Date.parse("2026-07-13T00:00:00.000Z")
  let nowCalls = 0
  const owner = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entered.resolve()
    await releaseOwner.promise
    return "done"
  }, {
    token: () => "heartbeat-owner",
    hostname: "owner-host",
    now: () => {
      nowCalls += 1
      return new Date(nowMs)
    },
    staleMs: 60
  })

  await entered.promise
  const initialMtimeMs = (await fs.stat(leaseFile)).mtimeMs
  nowMs += 60_000
  let ownerCompleted = false
  try {
    await eventually(async () => {
      JSON.parse(await fs.readFile(leaseFile, "utf8"))
      return (await fs.stat(leaseFile)).mtimeMs !== initialMtimeMs
    }, "Cleanup lease heartbeat did not advance while the operation was held.")
    await assert.rejects(
      withWorkflowRunCleanupLeases(root, ["run-a"], async () => "must-not-run", {
        token: () => "contender",
        hostname: "contender-host",
        now: () => new Date(nowMs + 10),
        staleMs: 60
      }),
      /reserved by a cleanup operation|cleanup lease/i
    )
    releaseOwner.resolve()
    assert.equal(await owner, "done")
    ownerCompleted = true
    const callsAfterRelease = nowCalls
    await delay(75)
    assert.equal(nowCalls, callsAfterRelease)
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), false)
  } finally {
    releaseOwner.resolve()
    if (!ownerCompleted) await owner.catch(() => undefined)
  }
})

test("cleanup lease heartbeat timer stops when the operation throws", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  const entered = deferred()
  const failOperation = deferred()
  let nowMs = Date.parse("2026-07-13T00:00:00.000Z")
  let nowCalls = 0
  const owner = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entered.resolve()
    await failOperation.promise
    throw new Error("cleanup operation failed")
  }, {
    token: () => "heartbeat-error-owner",
    hostname: "owner-host",
    now: () => {
      nowCalls += 1
      return new Date(nowMs)
    },
    staleMs: 60
  })

  await entered.promise
  const initialMtimeMs = (await fs.stat(leaseFile)).mtimeMs
  nowMs += 60_000
  let ownerSettled = false
  try {
    await eventually(async () => {
      JSON.parse(await fs.readFile(leaseFile, "utf8"))
      return (await fs.stat(leaseFile)).mtimeMs !== initialMtimeMs
    }, "Cleanup lease heartbeat did not advance before the operation error.")
    failOperation.resolve()
    await assert.rejects(owner, /cleanup operation failed/)
    ownerSettled = true
    const callsAfterRelease = nowCalls
    await delay(75)
    assert.equal(nowCalls, callsAfterRelease)
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), false)
  } finally {
    failOperation.resolve()
    if (!ownerSettled) await owner.catch(() => undefined)
  }
})

for (const hardLinkTarget of ["lease", "owner"]) {
  test(`cleanup rejects a hard-linked ${hardLinkTarget} file without touching external mtime`, async (t) => {
    const root = await workspace(t)
    const { withWorkflowRunCleanupLeases } = leaseModules()
    const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
    const target = hardLinkTarget === "lease"
      ? path.join(leaseDirectory, "run-a.json")
      : path.join(leaseDirectory, "run-a.guard", "owner.json")
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-hardlink-"))
    t.after(() => fs.rm(outside, { recursive: true, force: true }))
    const external = path.join(outside, `${hardLinkTarget}.json`)
    const oldTime = new Date("2020-01-02T03:04:05.000Z")

    const owner = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      const bytes = await fs.readFile(target)
      await fs.rm(target)
      await fs.writeFile(external, bytes)
      await fs.utimes(external, oldTime, oldTime)
      try {
        await fs.link(external, target)
      } catch (error) {
        if (["EPERM", "EACCES", "ENOTSUP", "EXDEV"].includes(error.code)) return t.skip(error.code)
        throw error
      }
      await delay(450)
    }, {
      token: () => `hardlink-${hardLinkTarget}`,
      hostname: "test-host",
      staleMs: 600
    })

    await assert.rejects(owner, /hard.?link|link count|single link/i)
    assert.equal((await fs.stat(external)).mtimeMs, oldTime.getTime())
  })
}

test("cleanup heartbeat never overwrites a replacement owner", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const leaseFile = path.join(root, ".bob", "workflows", "run-cleanup-leases", "run-a.json")
  const entered = deferred()
  const releaseOwner = deferred()
  const mutationReady = deferred()
  const continueMutation = deferred()
  const mutationReturned = deferred()
  const originalOpen = fs.open
  const originalRename = fs.rename
  let heartbeatPhase = false
  let mutationIntercepted = false

  fs.open = async (...args) => {
    const handle = await originalOpen(...args)
    if (heartbeatPhase && await matchesPhysicalPath(args[0], leaseFile)) {
      const originalUtimes = handle.utimes.bind(handle)
      handle.utimes = async (...utimesArgs) => {
        if (!mutationIntercepted) {
          mutationIntercepted = true
          mutationReady.resolve()
          await continueMutation.promise
        }
        try {
          return await originalUtimes(...utimesArgs)
        } finally {
          mutationReturned.resolve()
        }
      }
    }
    return handle
  }
  fs.rename = async (source, target) => {
    if (
      heartbeatPhase
      && !mutationIntercepted
      && await matchesPhysicalPath(target, leaseFile)
    ) {
      mutationIntercepted = true
      mutationReady.resolve()
      await continueMutation.promise
      try {
        return await originalRename(source, target)
      } finally {
        mutationReturned.resolve()
      }
    }
    return originalRename(source, target)
  }

  const owner = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entered.resolve()
    await releaseOwner.promise
  }, {
    token: () => "original-owner",
    hostname: "owner-host",
    staleMs: 60
  })

  try {
    await entered.promise
    heartbeatPhase = true
    await withTimeout(mutationReady.promise, "heartbeat mutation hook")
    await fs.rm(leaseFile)
    await fs.writeFile(leaseFile, `${JSON.stringify({
      schemaVersion: "workflow-register/run-cleanup-lease/v1",
      runId: "run-a",
      token: "replacement-owner",
      pid: process.pid,
      hostname: "replacement-host",
      createdAt: new Date().toISOString(),
      heartbeatAt: new Date().toISOString()
    }, null, 2)}\n`)
    continueMutation.resolve()
    await withTimeout(mutationReturned.promise, "heartbeat mutation return")
    heartbeatPhase = false
    releaseOwner.resolve()
    await assert.rejects(owner, /ownership changed|lease release/i)
    const persisted = JSON.parse(await fs.readFile(leaseFile, "utf8"))
    assert.equal(persisted.token, "replacement-owner")
  } finally {
    heartbeatPhase = false
    continueMutation.resolve()
    releaseOwner.resolve()
    fs.open = originalOpen
    fs.rename = originalRename
    await owner.catch(() => undefined)
  }
  assert.equal(mutationIntercepted, true, "the heartbeat mutation hook must fire")
})

test("cleanup-first interleaving excludes the workflow execution critical section", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { withWorkflowRunLock } = lockModules()
  const entries = []
  let releaseOwner
  const hold = new Promise((resolve) => { releaseOwner = resolve })
  let entered
  const enteredPromise = new Promise((resolve) => { entered = resolve })
  const cleanup = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entries.push("cleanup")
    entered()
    await hold
  }, { token: () => "cleanup-token", hostname: "test-host" })

  await enteredPromise
  try {
    await assert.rejects(
      withWorkflowRunLock(root, "run-a", async () => {
        entries.push("run")
        return "must-not-run"
      }, {
        timeoutMs: 30,
        pollMs: 2,
        heartbeatMs: 0
      }),
      /cleanup|reserved|busy/i
    )
    assert.deepEqual(entries, ["cleanup"])
  } finally {
    releaseOwner()
    await cleanup
  }
})

test("run-lock-first interleaving rejects cleanup and releases every acquired lease", async (t) => {
  const root = await workspace(t, ["run-a", "run-b"])
  const { withWorkflowRunCleanupLeases, workflowRunCleanupLeasePresent } = leaseModules()
  const { withWorkflowRunLock } = lockModules()
  const lockEntered = deferred()
  const releaseLock = deferred()
  const entries = []
  const owner = withWorkflowRunLock(root, "run-b", async () => {
    entries.push("run")
    lockEntered.resolve()
    await releaseLock.promise
  }, { timeoutMs: 500, heartbeatMs: 0 })

  await lockEntered.promise
  try {
    await assert.rejects(
      withWorkflowRunCleanupLeases(root, ["run-b", "run-a"], async () => {
        entries.push("cleanup")
      }, { token: () => "cleanup-token", hostname: "test-host" }),
      /execution lock|run lock|locked|busy/i
    )
    assert.deepEqual(entries, ["run"])
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-a"), false)
    assert.equal(await workflowRunCleanupLeasePresent(root, "run-b"), false)
  } finally {
    releaseLock.resolve()
    await owner
  }
})

test("crossed cleanup and run-lock handshake enters at most one critical section", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { withWorkflowRunLock } = lockModules()
  const leaseDirectory = path.join(root, ".bob", "workflows", "run-cleanup-leases")
  const leaseFile = path.join(leaseDirectory, "run-a.json")
  const guardDirectory = path.join(leaseDirectory, "run-a.guard")
  const runLockFile = path.join(root, ".bob", "workflows", "runs", "run-a", "run.lock.json")
  await fs.mkdir(leaseDirectory)

  const runPrecheckObserved = deferred()
  const allowRunCreate = deferred()
  const cleanupLockCheckObserved = deferred()
  const allowCleanupEntry = deferred()
  const runPostcheckObserved = deferred()
  const allowRunRetreat = deferred()
  const cleanupEntered = deferred()
  const releaseCleanup = deferred()
  const originalLstat = fs.lstat
  let phase = "run-precheck"
  let runPrecheckHookFired = false
  let cleanupLockHookFired = false
  let runPostcheckHookFired = false
  fs.lstat = async (target, ...args) => {
    if (phase === "run-precheck" && await matchesPhysicalPath(target, leaseFile)) {
      try {
        return await originalLstat(target, ...args)
      } catch (error) {
        runPrecheckHookFired = true
        runPrecheckObserved.resolve()
        await allowRunCreate.promise
        throw error
      }
    }
    if (phase === "cleanup-lock-check" && await matchesPhysicalPath(target, runLockFile)) {
      try {
        return await originalLstat(target, ...args)
      } catch (error) {
        cleanupLockHookFired = true
        cleanupLockCheckObserved.resolve()
        await allowCleanupEntry.promise
        throw error
      }
    }
    if (
      phase === "run-postcheck"
      && (await matchesPhysicalPath(target, guardDirectory) || await matchesPhysicalPath(target, leaseFile))
    ) {
      const stat = await originalLstat(target, ...args)
      runPostcheckHookFired = true
      runPostcheckObserved.resolve()
      await allowRunRetreat.promise
      return stat
    }
    return originalLstat(target, ...args)
  }

  const entries = []
  const run = settle(withWorkflowRunLock(root, "run-a", async () => {
    entries.push("run")
  }, { timeoutMs: 100, pollMs: 2, heartbeatMs: 0 }))
  let cleanup
  try {
    await withTimeout(runPrecheckObserved.promise, "run-lock cleanup precheck hook")
    phase = "cleanup-lock-check"
    cleanup = settle(withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
      entries.push("cleanup")
      cleanupEntered.resolve()
      await releaseCleanup.promise
    }, { token: () => "cleanup-token", hostname: "test-host" }))
    await withTimeout(cleanupLockCheckObserved.promise, "cleanup run-lock check hook")

    phase = "run-postcheck"
    allowRunCreate.resolve()
    await withTimeout(runPostcheckObserved.promise, "run-lock cleanup postcheck hook")
    allowCleanupEntry.resolve()
    await withTimeout(cleanupEntered.promise, "cleanup critical-section entry")
    phase = "released"
    allowRunRetreat.resolve()

    const runOutcome = await run
    assert.equal(runOutcome.status, "rejected")
    assert.ok(entries.length <= 1, `critical sections entered: ${entries.join(", ")}`)
    assert.deepEqual(entries, ["cleanup"])
  } finally {
    phase = "released"
    allowRunCreate.resolve()
    allowCleanupEntry.resolve()
    allowRunRetreat.resolve()
    releaseCleanup.resolve()
    fs.lstat = originalLstat
    await Promise.all([run, cleanup ?? Promise.resolve()])
  }
  assert.equal(runPrecheckHookFired, true, "the run precheck hook must fire")
  assert.equal(cleanupLockHookFired, true, "the cleanup lock hook must fire")
  assert.equal(runPostcheckHookFired, true, "the run postcheck hook must fire")
})
