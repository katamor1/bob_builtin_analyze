const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { createPhysicalPathMatcher } = require("./helpers/physicalPathMatcher")

const matchesPhysicalPath = createPhysicalPathMatcher(fsp)

const {
  appendRunDurabilityFile,
  createRunDurabilityFile,
  readRunDurabilityFile,
  removeRunDurabilityFile,
  replaceRunDurabilityFile,
  syncRunMaterializedFile,
  touchRunDurabilityFileMtime
} = require("../out/core/runtime/runDurabilityPath.js")

function root(t) {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-durability-path-"))
  t.after(() => fs.rmSync(value, { recursive: true, force: true }))
  return value
}

async function countDurabilityMetadataCalls(operation) {
  const originals = new Map()
  let calls = 0
  for (const method of ["stat", "lstat", "realpath", "open"]) {
    const original = fsp[method]
    originals.set(method, original)
    fsp[method] = async (...args) => {
      calls += 1
      const result = await original(...args)
      if (method === "open") {
        const originalHandleStat = result.stat.bind(result)
        result.stat = async (...statArgs) => {
          calls += 1
          return originalHandleStat(...statArgs)
        }
      }
      return result
    }
  }
  try {
    await operation()
    return calls
  } finally {
    for (const [method, original] of originals) fsp[method] = original
  }
}

test("durability path creates, replaces, appends and conditionally removes direct files", async (t) => {
  const workspace = root(t)
  assert.equal(await createRunDurabilityFile(workspace, "run-1", "run.lock.json", "owner\n"), true)
  assert.equal(await createRunDurabilityFile(workspace, "run-1", "run.lock.json", "other\n"), false)
  assert.equal((await readRunDurabilityFile(workspace, "run-1", "run.lock.json")).bytes.toString("utf8"), "owner\n")

  await replaceRunDurabilityFile(workspace, "run-1", "run-state.journal.json", "one\n")
  const firstJournal = await readRunDurabilityFile(workspace, "run-1", "run-state.journal.json")
  await replaceRunDurabilityFile(workspace, "run-1", "run-state.journal.json", "two\n", firstJournal.bytes)
  assert.equal((await readRunDurabilityFile(workspace, "run-1", "run-state.journal.json")).bytes.toString("utf8"), "two\n")
  await assert.rejects(
    replaceRunDurabilityFile(workspace, "run-1", "run-state.journal.json", "stale\n", firstJournal.bytes),
    /changed before replacement/
  )
  assert.equal((await readRunDurabilityFile(workspace, "run-1", "run-state.journal.json")).bytes.toString("utf8"), "two\n")

  await appendRunDurabilityFile(workspace, "run-1", "events.ndjson", "a\n")
  await appendRunDurabilityFile(workspace, "run-1", "events.ndjson", "b\n")
  assert.equal((await readRunDurabilityFile(workspace, "run-1", "events.ndjson")).bytes.toString("utf8"), "a\nb\n")

  assert.equal(await removeRunDurabilityFile(workspace, "run-1", "run.lock.json", Buffer.from("different\n")), false)
  assert.equal(await removeRunDurabilityFile(workspace, "run-1", "run.lock.json", Buffer.from("owner\n")), true)
  assert.equal(await readRunDurabilityFile(workspace, "run-1", "run.lock.json"), undefined)
})

test("exclusive durability creation removes its owned file after a primary sync failure", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const primaryError = Object.assign(new Error("CREATE_SYNC_PRIMARY_SENTINEL"), { code: "EIO" })
  const originalOpen = fsp.open
  const openedHandles = new Set()
  const settledHandles = new Set()
  let syncFailureInjected = 0
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      openedHandles.add(handle)
      const originalClose = handle.close.bind(handle)
      handle.close = async (...closeArgs) => {
        try {
          return await originalClose(...closeArgs)
        } finally {
          settledHandles.add(handle)
        }
      }
      if (await matchesPhysicalPath(target, lockFile)) {
        const originalSync = handle.sync.bind(handle)
        handle.sync = async (...syncArgs) => {
          const result = await originalSync(...syncArgs)
          if (syncFailureInjected === 0) {
            syncFailureInjected += 1
            throw primaryError
          }
          return result
        }
      }
      return handle
    }

    let observedError
    await assert.rejects(
      createRunDurabilityFile(workspace, "run-1", "run.lock.json", "owner\n"),
      (error) => {
        observedError = error
        return true
      }
    )
    assert.strictEqual(observedError, primaryError)
    assert.equal(observedError.message, "CREATE_SYNC_PRIMARY_SENTINEL")
  } finally {
    fsp.open = originalOpen
  }

  assert.equal(syncFailureInjected, 1, "the real file handle sync hook must fail once")
  assert.equal(openedHandles.size > 0, true)
  assert.deepEqual(settledHandles, openedHandles, "every opened file and directory handle must settle before rejection")
  await assert.rejects(fsp.access(lockFile), { code: "ENOENT" })
  assert.equal(
    await createRunDurabilityFile(workspace, "run-1", "run.lock.json", "retry-owner\n"),
    true,
    "the same process must be able to retry after the failed exclusive create"
  )
})

test("exclusive durability creation recovers owned identity after its first handle stat fails", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const primaryError = Object.assign(new Error("CREATE_FIRST_STAT_PRIMARY_SENTINEL"), { code: "EIO" })
  const originalOpen = fsp.open
  let createdHandleStatCalls = 0
  let createdHandleSettled = false
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      if (!await matchesPhysicalPath(target, lockFile)) return handle
      const originalStat = handle.stat.bind(handle)
      handle.stat = async (...statArgs) => {
        const result = await originalStat(...statArgs)
        createdHandleStatCalls += 1
        if (createdHandleStatCalls === 1) throw primaryError
        return result
      }
      const originalClose = handle.close.bind(handle)
      handle.close = async (...closeArgs) => {
        try {
          return await originalClose(...closeArgs)
        } finally {
          createdHandleSettled = true
        }
      }
      return handle
    }

    let observedError
    await assert.rejects(
      createRunDurabilityFile(workspace, "run-1", "run.lock.json", "owner\n"),
      (error) => {
        observedError = error
        return true
      }
    )
    assert.strictEqual(observedError, primaryError)
    assert.equal(observedError.message, "CREATE_FIRST_STAT_PRIMARY_SENTINEL")
  } finally {
    fsp.open = originalOpen
  }

  assert.equal(createdHandleStatCalls >= 2, true, "cleanup must retry the handle identity probe")
  assert.equal(createdHandleSettled, true)
  await assert.rejects(fsp.access(lockFile), { code: "ENOENT" })
  assert.equal(await createRunDurabilityFile(workspace, "run-1", "run.lock.json", "retry-owner\n"), true)
})

test("exclusive durability creation preserves the primary error over close and cleanup failures", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const primaryError = Object.assign(new Error("CREATE_PRIMARY_SENTINEL"), { code: "EIO" })
  const closeError = Object.assign(new Error("CREATE_CLOSE_SENTINEL"), { code: "EIO" })
  const cleanupError = Object.assign(new Error("CREATE_CLEANUP_SENTINEL"), { code: "EACCES" })
  const originalOpen = fsp.open
  const originalRm = fsp.rm
  let syncFailureInjected = 0
  let closeFailureInjected = 0
  let cleanupAttempts = 0
  let createdHandleSettled = false
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      if (!await matchesPhysicalPath(target, lockFile)) return handle
      const originalSync = handle.sync.bind(handle)
      handle.sync = async (...syncArgs) => {
        const result = await originalSync(...syncArgs)
        if (syncFailureInjected === 0) {
          syncFailureInjected += 1
          throw primaryError
        }
        return result
      }
      const originalClose = handle.close.bind(handle)
      handle.close = async (...closeArgs) => {
        const result = await originalClose(...closeArgs)
        createdHandleSettled = true
        if (closeFailureInjected === 0) {
          closeFailureInjected += 1
          throw closeError
        }
        return result
      }
      return handle
    }
    fsp.rm = async (target, ...args) => {
      if (await matchesPhysicalPath(target, lockFile)) {
        cleanupAttempts += 1
        throw cleanupError
      }
      return originalRm(target, ...args)
    }

    let observedError
    await assert.rejects(
      createRunDurabilityFile(workspace, "run-1", "run.lock.json", "owner\n"),
      (error) => {
        observedError = error
        return true
      }
    )
    assert.strictEqual(observedError, primaryError)
    assert.match(observedError.message, /CREATE_PRIMARY_SENTINEL/)
    assert.match(observedError.message, /exclusive creation cleanup also failed.*CREATE_CLEANUP_SENTINEL/i)
    assert.match(observedError.message, /exclusive creation handle close also failed.*CREATE_CLOSE_SENTINEL/i)
    assert.deepEqual(observedError.suppressedErrors, [cleanupError, closeError])
    assert.equal(Object.getOwnPropertyDescriptor(observedError, "suppressedErrors")?.enumerable, false)
    assert.equal(Object.isFrozen(observedError.suppressedErrors), true)
  } finally {
    fsp.open = originalOpen
    fsp.rm = originalRm
  }

  assert.equal(syncFailureInjected, 1)
  assert.equal(closeFailureInjected, 1)
  assert.equal(createdHandleSettled, true, "the underlying exclusive-create handle must be closed before cleanup")
  assert.equal(cleanupAttempts, 1)
  assert.equal(await fsp.readFile(lockFile, "utf8"), "owner\n")
})

test("exclusive durability failure cleanup never removes an identity-changed replacement", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const displacedFile = path.join(runDirectory, "run.lock.displaced.json")
  const primaryError = Object.assign(new Error("CREATE_RACE_PRIMARY_SENTINEL"), { code: "EIO" })
  const originalOpen = fsp.open
  const originalLstat = fsp.lstat
  const originalRm = fsp.rm
  let syncFailureInjected = 0
  let replacementInstalled = 0
  let removalAttempts = 0
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      if (!await matchesPhysicalPath(target, lockFile)) return handle
      const originalSync = handle.sync.bind(handle)
      handle.sync = async (...syncArgs) => {
        const result = await originalSync(...syncArgs)
        if (syncFailureInjected === 0) {
          syncFailureInjected += 1
          throw primaryError
        }
        return result
      }
      return handle
    }
    fsp.lstat = async (target, ...args) => {
      if (replacementInstalled === 0 && await matchesPhysicalPath(target, lockFile)) {
        replacementInstalled += 1
        await fsp.rename(lockFile, displacedFile)
        await fsp.writeFile(lockFile, "replacement-owner\n")
      }
      return originalLstat(target, ...args)
    }
    fsp.rm = async (target, ...args) => {
      if (await matchesPhysicalPath(target, lockFile)) removalAttempts += 1
      return originalRm(target, ...args)
    }

    let observedError
    await assert.rejects(
      createRunDurabilityFile(workspace, "run-1", "run.lock.json", "original-owner\n"),
      (error) => {
        observedError = error
        return true
      }
    )
    assert.strictEqual(observedError, primaryError)
  } finally {
    fsp.open = originalOpen
    fsp.lstat = originalLstat
    fsp.rm = originalRm
  }

  assert.equal(syncFailureInjected, 1)
  assert.equal(replacementInstalled, 1, "the cleanup identity-check hook must install a replacement")
  assert.equal(removalAttempts, 0, "an identity-changed target must never be passed to removal")
  assert.equal(await fsp.readFile(lockFile, "utf8"), "replacement-owner\n")
  assert.equal(await fsp.readFile(displacedFile, "utf8"), "original-owner\n")
})

test("durability touch preserves its exact primary error when handle close also fails", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const expectedBytes = Buffer.from("owner\n")
  await createRunDurabilityFile(workspace, "run-1", "run.lock.json", expectedBytes.toString("utf8"))
  const primaryError = Object.assign(new Error("TOUCH_PRIMARY_SENTINEL"), { code: "EIO" })
  const closeError = Object.assign(new Error("TOUCH_CLOSE_SENTINEL"), { code: "EIO" })
  const originalOpen = fsp.open
  let touchHandles = 0
  let settledTouchHandles = 0
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      const flags = Number(args[0])
      if (!await matchesPhysicalPath(target, lockFile) || (flags & 3) !== fs.constants.O_RDWR) return handle
      touchHandles += 1
      handle.utimes = async () => {
        throw primaryError
      }
      const originalClose = handle.close.bind(handle)
      handle.close = async (...closeArgs) => {
        const result = await originalClose(...closeArgs)
        settledTouchHandles += 1
        throw closeError
      }
      return handle
    }

    let observedError
    await assert.rejects(
      touchRunDurabilityFileMtime(workspace, "run-1", "run.lock.json", expectedBytes),
      (error) => {
        observedError = error
        return true
      }
    )
    assert.strictEqual(observedError, primaryError)
    assert.equal(observedError.message, "TOUCH_PRIMARY_SENTINEL")
    assert.deepEqual(observedError.suppressedErrors, [closeError])
    assert.equal(Object.getOwnPropertyDescriptor(observedError, "suppressedErrors")?.enumerable, false)
    assert.equal(Object.isFrozen(observedError.suppressedErrors), true)
  } finally {
    fsp.open = originalOpen
  }

  assert.equal(touchHandles, 1)
  assert.equal(settledTouchHandles, 1, "the underlying touch handle must settle before rejection")
})

test("durability touch surfaces a close-only failure after the handle settles", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const expectedBytes = Buffer.from("owner\n")
  await createRunDurabilityFile(workspace, "run-1", "run.lock.json", expectedBytes.toString("utf8"))
  const closeError = Object.assign(new Error("TOUCH_CLOSE_ONLY_SENTINEL"), { code: "EIO" })
  const originalOpen = fsp.open
  let touchHandles = 0
  let settledTouchHandles = 0
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      const flags = Number(args[0])
      if (!await matchesPhysicalPath(target, lockFile) || (flags & 3) !== fs.constants.O_RDWR) return handle
      touchHandles += 1
      const originalClose = handle.close.bind(handle)
      handle.close = async (...closeArgs) => {
        const result = await originalClose(...closeArgs)
        settledTouchHandles += 1
        throw closeError
      }
      return handle
    }

    let observedError
    await assert.rejects(
      touchRunDurabilityFileMtime(workspace, "run-1", "run.lock.json", expectedBytes),
      (error) => {
        observedError = error
        return true
      }
    )
    assert.strictEqual(observedError, closeError)
    assert.equal(observedError.message, "TOUCH_CLOSE_ONLY_SENTINEL")
  } finally {
    fsp.open = originalOpen
  }

  assert.equal(touchHandles, 1)
  assert.equal(settledTouchHandles, 1, "the underlying touch handle must settle before its close failure surfaces")
})

test("durability path rejects a symlink file target", async (t) => {
  const workspace = root(t)
  const outside = root(t)
  const runDir = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  await fsp.mkdir(runDir, { recursive: true })
  const outsideFile = path.join(outside, "outside.json")
  await fsp.writeFile(outsideFile, "outside\n")
  try {
    await fsp.symlink(outsideFile, path.join(runDir, "events.ndjson"), "file")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }
  await assert.rejects(appendRunDurabilityFile(workspace, "run-1", "events.ndjson", "event\n"), /symlink|direct regular file|ELOOP/i)
  assert.equal(await fsp.readFile(outsideFile, "utf8"), "outside\n")
})

test("durability path rejects a run-directory alias outside the workspace", async (t) => {
  const workspace = root(t)
  const outside = root(t)
  const runs = path.join(workspace, ".bob", "workflows", "runs")
  await fsp.mkdir(runs, { recursive: true })
  try {
    await fsp.symlink(outside, path.join(runs, "run-1"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }
  await assert.rejects(replaceRunDurabilityFile(workspace, "run-1", "run-state.journal.json", "journal\n"), /workspace|outside|symlink|junction|alias|direct/i)
})

test("durability operations stay within the verified-chain metadata call budget", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "owner\n")
  const expected = Buffer.from("owner\n")

  const readCalls = await countDurabilityMetadataCalls(async () => {
    const snapshot = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")
    assert.equal(snapshot.bytes.toString("utf8"), "owner\n")
  })
  const replaceCalls = await countDurabilityMetadataCalls(async () => {
    await replaceRunDurabilityFile(workspace, "run-1", "run.lock.json", "next-owner\n", expected)
  })

  t.diagnostic(`durability metadata calls: read=${readCalls}, replace=${replaceCalls}`)
  assert.deepEqual(
    { readWithinBudget: readCalls <= 180, replaceWithinBudget: replaceCalls <= 650 },
    { readWithinBudget: true, replaceWithinBudget: true },
    `durability metadata calls: read=${readCalls}, replace=${replaceCalls}`
  )
})

test("durability path rejects an aliased parent directory in the verified chain", async (t) => {
  const workspace = root(t)
  const outside = root(t)
  const outsideRun = path.join(outside, "workflows", "runs", "run-1")
  const outsideLock = path.join(outsideRun, "run.lock.json")
  await fsp.mkdir(outsideRun, { recursive: true })
  await fsp.writeFile(outsideLock, "outside\n")
  try {
    await fsp.symlink(outside, path.join(workspace, ".bob"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  await assert.rejects(
    readRunDurabilityFile(workspace, "run-1", "run.lock.json"),
    /symlink|junction|direct|identity|chain/i
  )
  assert.equal(await fsp.readFile(outsideLock, "utf8"), "outside\n")
})

test("durability path rejects a parent-chain swap during identity verification", async (t) => {
  const workspace = root(t)
  const outside = root(t)
  const bobDirectory = path.join(workspace, ".bob")
  const displacedBob = path.join(workspace, ".bob-displaced")
  const runDirectory = path.join(bobDirectory, "workflows", "runs", "run-1")
  const outsideRun = path.join(outside, "workflows", "runs", "run-1")
  const outsideLock = path.join(outsideRun, "run.lock.json")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(path.join(runDirectory, "run.lock.json"), "inside\n")
  await fsp.mkdir(outsideRun, { recursive: true })
  await fsp.writeFile(outsideLock, "outside\n")
  const probe = path.join(workspace, ".alias-probe")
  try {
    await fsp.symlink(outside, probe, aliasType)
    await fsp.rm(probe)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const originalLstat = fsp.lstat
  let swapped = false
  try {
    fsp.lstat = async (target, ...args) => {
      const stat = await originalLstat(target, ...args)
      if (!swapped && await matchesPhysicalPath(target, bobDirectory)) {
        swapped = true
        await fsp.rename(bobDirectory, displacedBob)
        await fsp.symlink(outside, bobDirectory, aliasType)
      }
      return stat
    }

    await assert.rejects(
      readRunDurabilityFile(workspace, "run-1", "run.lock.json"),
      /changed|identity|chain|junction|direct/i
    )
  } finally {
    fsp.lstat = originalLstat
  }
  assert.equal(swapped, true, "the parent-chain swap hook must fire")
  assert.equal(await fsp.readFile(outsideLock, "utf8"), "outside\n")
})

test("durability path accepts Windows namespaced realpath spelling for the same physical tree", {
  skip: process.platform !== "win32"
}, async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "owner\n")
  const originalRealpath = fsp.realpath
  const workspacePhysical = await originalRealpath(workspace)
  let namespacedDescendants = 0
  try {
    fsp.realpath = async (target, ...args) => {
      const physical = await originalRealpath(target, ...args)
      const relative = path.relative(workspacePhysical, physical)
      if (relative === ".bob" || relative.startsWith(`.bob${path.sep}`)) {
        namespacedDescendants += 1
        return path.toNamespacedPath(physical)
      }
      return physical
    }

    const snapshot = await readRunDurabilityFile(workspace, "run-1", "run.lock.json")

    assert.equal(snapshot.bytes.toString("utf8"), "owner\n")
  } finally {
    fsp.realpath = originalRealpath
  }
  assert.ok(namespacedDescendants > 0, "the test must exercise namespaced descendant realpaths")
})

test("durability path rejects a durability file whose realpath resolves to a different inode", async (t) => {
  const workspace = root(t)
  const outside = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const outsideFile = path.join(outside, "outside.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "inside\n")
  await fsp.writeFile(outsideFile, "outside\n")
  const originalRealpath = fsp.realpath
  let redirected = false
  try {
    fsp.realpath = async (target, ...args) => {
      const physical = await originalRealpath(target, ...args)
      if (path.basename(String(target)) === "run.lock.json") {
        redirected = true
        return originalRealpath(outsideFile)
      }
      return physical
    }

    await assert.rejects(
      readRunDurabilityFile(workspace, "run-1", "run.lock.json"),
      /outside|identity|direct|changed|alias/i
    )
  } finally {
    fsp.realpath = originalRealpath
  }
  assert.equal(redirected, true, "the test must redirect the durability file realpath")
  assert.equal(await fsp.readFile(outsideFile, "utf8"), "outside\n")
})

test("durability append rejects an external hard-linked target before changing shared bytes", async (t) => {
  const workspace = root(t)
  const outside = root(t)
  const runDir = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  await fsp.mkdir(runDir, { recursive: true })
  const outsideFile = path.join(outside, "outside.ndjson")
  const eventsFile = path.join(runDir, "events.ndjson")
  await fsp.writeFile(outsideFile, "outside\n")
  try {
    await fsp.link(outsideFile, eventsFile)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EXDEV"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  await assert.rejects(
    appendRunDurabilityFile(workspace, "run-1", "events.ndjson", "must-not-append\n"),
    /hard.?link|link count|single link/i
  )
  assert.equal(await fsp.readFile(outsideFile, "utf8"), "outside\n")
})

test("materialized file sync rejects a path replacement between verification and open", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const runFile = path.join(runDirectory, "run.json")
  const displacedFile = path.join(runDirectory, "run.displaced.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(runFile, "original\n")
  const originalOpen = fsp.open
  let replaced = false
  try {
    fsp.open = async (target, ...args) => {
      if (!replaced && path.basename(String(target)) === "run.json") {
        replaced = true
        await fsp.rename(runFile, displacedFile)
        await fsp.writeFile(runFile, "replacement\n")
      }
      return originalOpen(target, ...args)
    }

    await assert.rejects(
      syncRunMaterializedFile(workspace, "run-1"),
      /changed|identity|sync/i
    )
  } finally {
    fsp.open = originalOpen
  }
  assert.equal(replaced, true, "the test must replace the path before sync opens it")
  assert.equal(await fsp.readFile(runFile, "utf8"), "replacement\n")
  assert.equal(await fsp.readFile(displacedFile, "utf8"), "original\n")
})

test("durability read rejects a path replacement after the handle read completes", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  const displacedFile = path.join(runDirectory, "run.displaced.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "original\n")
  const originalOpen = fsp.open
  let replaced = false
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      if (!await matchesPhysicalPath(target, lockFile)) return handle
      const originalReadFile = handle.readFile.bind(handle)
      handle.readFile = async (...readArgs) => {
        const bytes = await originalReadFile(...readArgs)
        if (!replaced) {
          replaced = true
          await fsp.rename(lockFile, displacedFile)
          await fsp.writeFile(lockFile, "replacement\n")
        }
        return bytes
      }
      return handle
    }

    await assert.rejects(
      readRunDurabilityFile(workspace, "run-1", "run.lock.json"),
      /changed|identity|read/i
    )
  } finally {
    fsp.open = originalOpen
  }
  assert.equal(replaced, true, "the post-read replacement hook must fire")
  assert.equal(await fsp.readFile(lockFile, "utf8"), "replacement\n")
  assert.equal(await fsp.readFile(displacedFile, "utf8"), "original\n")
})

test("durability append rejects a path replacement after the handle sync completes", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const eventsFile = path.join(runDirectory, "events.ndjson")
  const displacedFile = path.join(runDirectory, "events.displaced.ndjson")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(eventsFile, "before\n")
  const originalOpen = fsp.open
  let replaced = false
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      if (!await matchesPhysicalPath(target, eventsFile)) return handle
      const originalSync = handle.sync.bind(handle)
      handle.sync = async (...syncArgs) => {
        const result = await originalSync(...syncArgs)
        if (!replaced) {
          replaced = true
          await fsp.rename(eventsFile, displacedFile)
          await fsp.writeFile(eventsFile, "replacement\n")
        }
        return result
      }
      return handle
    }

    await assert.rejects(
      appendRunDurabilityFile(workspace, "run-1", "events.ndjson", "after\n"),
      /changed|identity|append/i
    )
  } finally {
    fsp.open = originalOpen
  }
  assert.equal(replaced, true, "the post-sync replacement hook must fire")
  assert.equal(await fsp.readFile(eventsFile, "utf8"), "replacement\n")
  assert.equal(await fsp.readFile(displacedFile, "utf8"), "before\nafter\n")
})

test("durability remove uses the target from its single bound run directory", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "owner\n")
  const originalRm = fsp.rm
  let removedPath
  try {
    fsp.rm = async (target, ...args) => {
      if (await matchesPhysicalPath(target, lockFile)) removedPath = String(target)
      return originalRm(target, ...args)
    }

    assert.equal(await removeRunDurabilityFile(
      workspace,
      "run-1",
      "run.lock.json",
      Buffer.from("owner\n")
    ), true)
  } finally {
    fsp.rm = originalRm
  }

  const boundRoot = await fsp.realpath(workspace)
  assert.equal(removedPath, path.join(boundRoot, ".bob", "workflows", "runs", "run-1", "run.lock.json"))
})

test("durability read rejects an in-place content mutation after bytes are read", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "original\n")
  const originalIdentity = await fsp.stat(lockFile, { bigint: true })
  const originalOpen = fsp.open
  let mutated = false
  try {
    fsp.open = async (target, ...args) => {
      const handle = await originalOpen(target, ...args)
      if (!await matchesPhysicalPath(target, lockFile)) return handle
      const originalReadFile = handle.readFile.bind(handle)
      handle.readFile = async (...readArgs) => {
        const bytes = await originalReadFile(...readArgs)
        if (!mutated) {
          mutated = true
          const writer = await originalOpen(lockFile, "r+")
          try {
            await writer.truncate(0)
            await writer.writeFile("mutated!\n")
            await writer.sync()
          } finally {
            await writer.close()
          }
        }
        return bytes
      }
      return handle
    }

    await assert.rejects(
      readRunDurabilityFile(workspace, "run-1", "run.lock.json"),
      /changed|identity|read/i
    )
  } finally {
    fsp.open = originalOpen
  }
  const mutatedIdentity = await fsp.stat(lockFile, { bigint: true })
  assert.equal(mutated, true, "the in-place mutation hook must fire")
  assert.equal(mutatedIdentity.dev, originalIdentity.dev)
  assert.equal(mutatedIdentity.ino, originalIdentity.ino)
  assert.equal(mutatedIdentity.size, originalIdentity.size, "the mutation must preserve file size")
})

test("durability replacement rechecks expected bytes before every rename retry", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const lockFile = path.join(runDirectory, "run.lock.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(lockFile, "owner\n")
  const originalIdentity = await fsp.stat(lockFile, { bigint: true })
  const originalRename = fsp.rename
  let renameAttempts = 0
  try {
    fsp.rename = async (source, target, ...args) => {
      if (await matchesPhysicalPath(target, lockFile) && path.basename(String(source)).startsWith(".run.lock.json.")) {
        renameAttempts += 1
        if (renameAttempts === 1) {
          const writer = await fsp.open(lockFile, "r+")
          try {
            await writer.truncate(0)
            await writer.writeFile("same-inode-heartbeat\n")
            await writer.sync()
          } finally {
            await writer.close()
          }
          const error = new Error("injected busy rename")
          error.code = "EBUSY"
          throw error
        }
      }
      return originalRename(source, target, ...args)
    }

    await assert.rejects(
      replaceRunDurabilityFile(
        workspace,
        "run-1",
        "run.lock.json",
        "replacement\n",
        Buffer.from("owner\n")
      ),
      /changed|expected|replacement/i
    )
  } finally {
    fsp.rename = originalRename
  }
  const mutatedIdentity = await fsp.stat(lockFile, { bigint: true })
  assert.equal(renameAttempts, 1, "the stale retry must be rejected before a second rename")
  assert.equal(mutatedIdentity.dev, originalIdentity.dev)
  assert.equal(mutatedIdentity.ino, originalIdentity.ino)
  assert.equal(await fsp.readFile(lockFile, "utf8"), "same-inode-heartbeat\n")
})

for (const operation of ["replace", "remove"]) {
  test(`durability ${operation} rejects a workspace-root alias retargeted after its bound read`, async (t) => {
    const physicalA = root(t)
    const physicalB = root(t)
    const aliasContainer = root(t)
    const workspaceAlias = path.join(aliasContainer, "workspace-alias")
    const aliasType = process.platform === "win32" ? "junction" : "dir"
    const runA = path.join(physicalA, ".bob", "workflows", "runs", "run-1")
    const runB = path.join(physicalB, ".bob", "workflows", "runs", "run-1")
    const lockA = path.join(runA, "run.lock.json")
    const lockB = path.join(runB, "run.lock.json")
    await fsp.mkdir(runA, { recursive: true })
    await fsp.mkdir(runB, { recursive: true })
    await fsp.writeFile(lockA, "same-owner\n")
    await fsp.writeFile(lockB, "same-owner\n")
    try {
      await fsp.symlink(physicalA, workspaceAlias, aliasType)
    } catch (error) {
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
      throw error
    }

    const originalOpen = fsp.open
    let retargeted = false
    try {
      fsp.open = async (target, ...args) => {
        const handle = await originalOpen(target, ...args)
        if (retargeted || !await matchesPhysicalPath(target, lockA)) return handle
        const originalClose = handle.close.bind(handle)
        handle.close = async () => {
          const result = await originalClose()
          if (!retargeted) {
            retargeted = true
            await fsp.rm(workspaceAlias, { force: true })
            await fsp.symlink(physicalB, workspaceAlias, aliasType)
          }
          return result
        }
        return handle
      }

      if (operation === "replace") {
        await assert.rejects(
          replaceRunDurabilityFile(
            workspaceAlias,
            "run-1",
            "run.lock.json",
            "replacement\n",
            Buffer.from("same-owner\n")
          ),
          /workspace root|identity|changed/i
        )
      } else {
        await assert.rejects(
          removeRunDurabilityFile(
            workspaceAlias,
            "run-1",
            "run.lock.json",
            Buffer.from("same-owner\n")
          ),
          /workspace root|identity|changed/i
        )
      }
    } finally {
      fsp.open = originalOpen
    }

    assert.equal(retargeted, true, "the workspace-root retarget hook must fire")
    assert.equal(await fsp.readFile(lockA, "utf8"), "same-owner\n")
    assert.equal(await fsp.readFile(lockB, "utf8"), "same-owner\n")
  })
}

test("directory durability sync rejects a run-directory swap before open", async (t) => {
  const workspace = root(t)
  const runDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1")
  const displacedDirectory = path.join(workspace, ".bob", "workflows", "runs", "run-1-displaced")
  const runFile = path.join(runDirectory, "run.json")
  await fsp.mkdir(runDirectory, { recursive: true })
  await fsp.writeFile(runFile, "original\n")
  const originalOpen = fsp.open
  let swapped = false
  try {
    fsp.open = async (target, ...args) => {
      if (!swapped && await matchesPhysicalPath(target, runDirectory)) {
        swapped = true
        await fsp.rename(runDirectory, displacedDirectory)
        await fsp.mkdir(runDirectory)
      }
      return originalOpen(target, ...args)
    }

    await assert.rejects(
      syncRunMaterializedFile(workspace, "run-1"),
      /changed|identity|sync|directory/i
    )
  } finally {
    fsp.open = originalOpen
  }
  assert.equal(swapped, true, "the directory-open swap hook must fire")
  assert.equal(await fsp.readFile(path.join(displacedDirectory, "run.json"), "utf8"), "original\n")
  await assert.rejects(fsp.access(path.join(runDirectory, "run.json")), { code: "ENOENT" })
})
