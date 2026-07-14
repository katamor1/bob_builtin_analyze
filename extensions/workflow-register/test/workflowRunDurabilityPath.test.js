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
  syncRunMaterializedFile
} = require("../out/core/runtime/runDurabilityPath.js")

function root(t) {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-durability-path-"))
  t.after(() => fs.rmSync(value, { recursive: true, force: true }))
  return value
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
  let namespacedDescendants = 0
  try {
    fsp.realpath = async (target, ...args) => {
      const physical = await originalRealpath(target, ...args)
      const relative = path.relative(workspace, physical)
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
