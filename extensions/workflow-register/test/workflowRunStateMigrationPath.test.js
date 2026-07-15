const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const { spawn } = require("node:child_process")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  ensureContainedRunStateMigrationBackup,
  readContainedRunStateMigrationBackup
} = require("../out/core/runtime/runStateMigrationBackup.js")

function tempRoot() {
  return fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-run-migration-path-")))
}

function runsDirectory(root) {
  return path.join(root, ".bob", "workflows", "runs")
}

function runDirectory(root, runId) {
  return path.join(runsDirectory(root), runId)
}

function samePath(left, right) {
  const resolvedLeft = path.resolve(String(left))
  const resolvedRight = path.resolve(String(right))
  return process.platform === "win32"
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight
}

async function prepareRunDirectory(root, runId) {
  await fsp.mkdir(runDirectory(root, runId), { recursive: true })
}

function strictRecoveryTempPath(root, runId, suffix, pid = 4242) {
  return path.join(
    runsDirectory(root),
    `.${runId}.${pid}.00000000-0000-4000-8000-${String(suffix).padStart(12, "0")}.tmp`
  )
}

test("migration backup preserves exact historical run bytes and is idempotent", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-history-000000000001"
  const historical = "{\n  \"runId\": \"history\"\n}\n"
  await prepareRunDirectory(root, runId)

  await ensureContainedRunStateMigrationBackup(root, runId, historical)
  await ensureContainedRunStateMigrationBackup(root, runId, historical)
  const snapshot = await readContainedRunStateMigrationBackup(root, runId)

  assert.equal(snapshot.bytes.toString("utf8"), historical)
  assert.equal(snapshot.filePath, path.join(runDirectory(root, runId), "run-state-v0.backup.json"))
  assert.equal((await fsp.lstat(snapshot.filePath)).nlink, 1)
})

test("concurrent migration backup calls serialize a live create-once publication across lexical aliases", async (t) => {
  const root = tempRoot()
  const aliasContainer = tempRoot()
  t.after(() => {
    fs.rmSync(aliasContainer, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  })
  const runId = "20260712T000000Z-live-publication-000000000014"
  const historical = "live-publication-history\n"
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  try {
    await fsp.symlink(root, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }
  await prepareRunDirectory(root, runId)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  const originalRm = fsp.rm
  const originalLstat = fsp.lstat
  const originalRealpath = fsp.realpath
  let releaseFirstRemoval
  const firstRemovalReleased = new Promise((resolve) => { releaseFirstRemoval = resolve })
  let firstRemovalEntered
  const firstRemovalStarted = new Promise((resolve) => { firstRemovalEntered = resolve })
  let secondRootCaptured
  const secondRootCapture = new Promise((resolve) => { secondRootCaptured = resolve })
  let ownedTempRemovalCalls = 0
  let secondRootStatCalls = 0
  let aliasRealpathCalls = 0
  let secondStarted = false
  let secondSettled = false
  let first
  let second

  fsp.rm = async (target, ...args) => {
    const name = path.basename(String(target))
    if (name.startsWith(`.${runId}.`) && name.endsWith(".tmp")) {
      ownedTempRemovalCalls += 1
      if (ownedTempRemovalCalls === 1) {
        firstRemovalEntered()
        await firstRemovalReleased
      }
    }
    return originalRm(target, ...args)
  }
  fsp.lstat = async (target, ...args) => {
    const result = await originalLstat(target, ...args)
    if (secondStarted && samePath(target, root)) {
      secondRootStatCalls += 1
      if (secondRootStatCalls === 2) secondRootCaptured()
    }
    return result
  }
  fsp.realpath = async (target, ...args) => {
    if (secondStarted && samePath(target, workspaceAlias)) aliasRealpathCalls += 1
    return originalRealpath(target, ...args)
  }

  try {
    first = ensureContainedRunStateMigrationBackup(root, runId, historical)
    await firstRemovalStarted
    secondStarted = true
    second = ensureContainedRunStateMigrationBackup(workspaceAlias, runId, historical)
    void second.finally(() => { secondSettled = true }).catch(() => undefined)
    await secondRootCapture
    await new Promise((resolve) => setImmediate(resolve))
    assert.equal(secondRootStatCalls, 2, "the waiter must capture its initial physical root before the owner is released")
    assert.equal(aliasRealpathCalls, 1, "the waiter must not revalidate its requested alias before the active owner completes")
    assert.equal(secondSettled, false, "the waiter must remain queued behind the active publication")

    releaseFirstRemoval()
    assert.deepEqual(await Promise.allSettled([first, second]), [
      { status: "fulfilled", value: undefined },
      { status: "fulfilled", value: undefined }
    ])
    assert.equal(aliasRealpathCalls, 2, "the waiter must revalidate its requested alias after leaving the queue")
  } finally {
    releaseFirstRemoval()
    fsp.rm = originalRm
    fsp.lstat = originalLstat
    fsp.realpath = originalRealpath
    await Promise.allSettled([first, second].filter(Boolean))
  }

  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
  assert.equal((await fsp.lstat(backupPath)).nlink, 1)
  assert.deepEqual(
    (await fsp.readdir(runsDirectory(root))).filter((name) => name.startsWith(`.${runId}.`) && name.endsWith(".tmp")),
    []
  )
})

test("queued migration backup rejects an alias retarget before touching the new workspace", async (t) => {
  const physicalA = tempRoot()
  const physicalB = tempRoot()
  const aliasContainer = tempRoot()
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  t.after(() => {
    fs.rmSync(aliasContainer, { recursive: true, force: true })
    fs.rmSync(physicalA, { recursive: true, force: true })
    fs.rmSync(physicalB, { recursive: true, force: true })
  })
  try {
    await fsp.symlink(physicalA, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const runId = "20260712T000000Z-queued-alias-retarget-000000000016"
  const historical = "queued-alias-retarget-history\n"
  await prepareRunDirectory(physicalA, runId)
  const backupPathA = path.join(runDirectory(physicalA, runId), "run-state-v0.backup.json")
  const originalRm = fsp.rm
  const originalLstat = fsp.lstat
  let releaseFirstRemoval
  const firstRemovalReleased = new Promise((resolve) => { releaseFirstRemoval = resolve })
  let firstRemovalEntered
  const firstRemovalStarted = new Promise((resolve) => { firstRemovalEntered = resolve })
  let secondRootCaptured
  const secondRootCapture = new Promise((resolve) => { secondRootCaptured = resolve })
  let secondStarted = false
  let secondRootStatCalls = 0
  let first
  let second

  fsp.rm = async (target, ...args) => {
    const name = path.basename(String(target))
    if (name.startsWith(`.${runId}.`) && name.endsWith(".tmp")) {
      firstRemovalEntered()
      await firstRemovalReleased
    }
    return originalRm(target, ...args)
  }
  fsp.lstat = async (target, ...args) => {
    const result = await originalLstat(target, ...args)
    if (secondStarted && samePath(target, physicalA)) {
      secondRootStatCalls += 1
      if (secondRootStatCalls === 2) secondRootCaptured()
    }
    return result
  }

  try {
    first = ensureContainedRunStateMigrationBackup(physicalA, runId, historical)
    await firstRemovalStarted
    secondStarted = true
    second = ensureContainedRunStateMigrationBackup(workspaceAlias, runId, historical)
    void second.catch(() => undefined)
    await secondRootCapture
    await new Promise((resolve) => setImmediate(resolve))

    await fsp.rm(workspaceAlias, { force: true })
    await fsp.symlink(physicalB, workspaceAlias, aliasType)
    releaseFirstRemoval()

    await first
    await assert.rejects(second, /workspace root binding changed while migration backup waited/i)
  } finally {
    releaseFirstRemoval()
    fsp.rm = originalRm
    fsp.lstat = originalLstat
    await Promise.allSettled([first, second].filter(Boolean))
  }

  assert.equal(await fsp.readFile(backupPathA, "utf8"), historical)
  assert.equal((await fsp.lstat(backupPathA)).nlink, 1)
  await assert.rejects(fsp.access(path.join(physicalB, ".bob")), { code: "ENOENT" })
})

test("queued migration backup rejects a replaced physical root before publication", async (t) => {
  const physicalRoot = tempRoot()
  const movedRoot = `${physicalRoot}-original`
  const aliasContainer = tempRoot()
  const workspaceAlias = path.join(aliasContainer, "workspace-alias")
  const aliasType = process.platform === "win32" ? "junction" : "dir"
  t.after(() => {
    fs.rmSync(aliasContainer, { recursive: true, force: true })
    fs.rmSync(physicalRoot, { recursive: true, force: true })
    fs.rmSync(movedRoot, { recursive: true, force: true })
  })
  try {
    await fsp.symlink(physicalRoot, workspaceAlias, aliasType)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  const runId = "20260712T000000Z-queued-root-replace-000000000017"
  const historical = "queued-root-replace-history\n"
  await prepareRunDirectory(physicalRoot, runId)
  const originalRm = fsp.rm
  const originalLstat = fsp.lstat
  const originalRealpath = fsp.realpath
  let releaseFirstRemoval
  const firstRemovalReleased = new Promise((resolve) => { releaseFirstRemoval = resolve })
  let firstRemovalEntered
  const firstRemovalStarted = new Promise((resolve) => { firstRemovalEntered = resolve })
  let secondRootCaptured
  const secondRootCapture = new Promise((resolve) => { secondRootCaptured = resolve })
  let revalidationEntered
  const revalidationStart = new Promise((resolve) => { revalidationEntered = resolve })
  let allowRevalidation
  const revalidationAllowed = new Promise((resolve) => { allowRevalidation = resolve })
  let secondStarted = false
  let secondRootStatCalls = 0
  let aliasRealpathCalls = 0
  let first
  let second

  fsp.rm = async (target, ...args) => {
    const name = path.basename(String(target))
    if (name.startsWith(`.${runId}.`) && name.endsWith(".tmp")) {
      firstRemovalEntered()
      await firstRemovalReleased
    }
    return originalRm(target, ...args)
  }
  fsp.lstat = async (target, ...args) => {
    const result = await originalLstat(target, ...args)
    if (secondStarted && samePath(target, physicalRoot)) {
      secondRootStatCalls += 1
      if (secondRootStatCalls === 2) secondRootCaptured()
    }
    return result
  }
  fsp.realpath = async (target, ...args) => {
    const resolved = await originalRealpath(target, ...args)
    if (secondStarted && samePath(target, workspaceAlias)) {
      aliasRealpathCalls += 1
      if (aliasRealpathCalls === 2) {
        revalidationEntered()
        await revalidationAllowed
      }
    }
    return resolved
  }

  try {
    first = ensureContainedRunStateMigrationBackup(physicalRoot, runId, historical)
    await firstRemovalStarted
    secondStarted = true
    second = ensureContainedRunStateMigrationBackup(workspaceAlias, runId, historical)
    void second.catch(() => undefined)
    await secondRootCapture
    await new Promise((resolve) => setImmediate(resolve))

    releaseFirstRemoval()
    await first
    await revalidationStart
    await fsp.rename(physicalRoot, movedRoot)
    await fsp.mkdir(physicalRoot)
    allowRevalidation()

    await assert.rejects(second, /workspace root identity changed while migration backup waited/i)
  } finally {
    releaseFirstRemoval()
    allowRevalidation()
    fsp.rm = originalRm
    fsp.lstat = originalLstat
    fsp.realpath = originalRealpath
    await Promise.allSettled([first, second].filter(Boolean))
  }

  const movedBackupPath = path.join(runDirectory(movedRoot, runId), "run-state-v0.backup.json")
  assert.equal(await fsp.readFile(movedBackupPath, "utf8"), historical)
  assert.equal((await fsp.lstat(movedBackupPath)).nlink, 1)
  await assert.rejects(fsp.access(path.join(physicalRoot, ".bob")), { code: "ENOENT" })
})

test("migration backup refuses to overwrite conflicting historical bytes", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-conflict-000000000002"
  await prepareRunDirectory(root, runId)

  await ensureContainedRunStateMigrationBackup(root, runId, "original\n")
  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, "different\n"),
    /migration backup conflicts with the current unversioned run/
  )
  assert.equal(
    fs.readFileSync(path.join(runDirectory(root, runId), "run-state-v0.backup.json"), "utf8"),
    "original\n"
  )
})

test("migration backup rejects a symlink target instead of following it", async (t) => {
  const root = tempRoot()
  const outside = tempRoot()
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
  const runId = "20260712T000000Z-symlink-000000000003"
  await prepareRunDirectory(root, runId)
  const outsideFile = path.join(outside, "outside.json")
  fs.writeFileSync(outsideFile, "outside\n", "utf8")
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")

  try {
    fs.symlinkSync(outsideFile, backupPath, "file")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`symlink creation is unavailable: ${error.code}`)
      return
    }
    throw error
  }

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, "historical\n"),
    /must be a direct regular file and not a symlink/
  )
  assert.equal(fs.readFileSync(outsideFile, "utf8"), "outside\n")
})

test("migration backup rejects a pre-existing hard-linked target", async (t) => {
  const root = tempRoot()
  const outside = tempRoot()
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
  const runId = "20260712T000000Z-hardlink-000000000005"
  await prepareRunDirectory(root, runId)
  const outsideFile = path.join(outside, "outside.json")
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  fs.writeFileSync(outsideFile, "historical\n", "utf8")
  try {
    await fsp.link(outsideFile, backupPath)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EXDEV"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, "historical\n"),
    /hard.?link|link count|single link/i
  )
  assert.equal(fs.readFileSync(outsideFile, "utf8"), "historical\n")
})

test("migration backup removes its owned temp file when temp identity verification fails", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-temp-cleanup-000000000004"
  await prepareRunDirectory(root, runId)
  const rootRunsDirectory = runsDirectory(root)
  const originalLstat = fsp.lstat
  let injected = false

  fsp.lstat = async (filePath, ...args) => {
    const resolved = path.resolve(String(filePath))
    const isOwnedTemp = path.dirname(resolved) === path.resolve(rootRunsDirectory)
      && path.basename(resolved).startsWith(`.${runId}.`)
      && path.basename(resolved).endsWith(".tmp")
    if (!injected && isOwnedTemp) {
      injected = true
      const error = new Error("simulated migration temp identity failure")
      error.code = "EIO"
      throw error
    }
    return originalLstat(filePath, ...args)
  }

  try {
    await assert.rejects(
      ensureContainedRunStateMigrationBackup(root, runId, "historical\n"),
      /simulated migration temp identity failure/
    )
  } finally {
    fsp.lstat = originalLstat
  }

  assert.equal(injected, true)
  assert.deepEqual(
    fs.readdirSync(rootRunsDirectory).filter((name) => name.endsWith(".tmp")),
    []
  )
  assert.equal(
    fs.existsSync(path.join(runDirectory(root, runId), "run-state-v0.backup.json")),
    false
  )
})

test("migration backup rolls back a publication whose temp inode was replaced before link", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-link-swap-000000000006"
  const historical = "historical\n"
  await prepareRunDirectory(root, runId)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  const originalLink = fsp.link
  let injected = false

  fsp.link = async (existingPath, newPath) => {
    const isPublication = path.resolve(String(newPath)) === path.resolve(backupPath)
    if (!injected && isPublication) {
      injected = true
      await fsp.rm(existingPath)
      await fsp.writeFile(existingPath, "attacker\n", "utf8")
    }
    return originalLink(existingPath, newPath)
  }

  try {
    await assert.rejects(
      ensureContainedRunStateMigrationBackup(root, runId, historical),
      /changed during create-once publication|identity/i
    )
  } finally {
    fsp.link = originalLink
  }

  assert.equal(injected, true)
  await assert.rejects(fsp.access(backupPath), { code: "ENOENT" })
  await ensureContainedRunStateMigrationBackup(root, runId, historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
  assert.equal((await fsp.lstat(backupPath)).nlink, 1)
})

test("migration backup rolls back workspace links after a third external link appears", async (t) => {
  const root = tempRoot()
  const outside = tempRoot()
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
  const runId = "20260712T000000Z-third-link-000000000007"
  const historical = "historical-third-link\n"
  await prepareRunDirectory(root, runId)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  const externalPath = path.join(outside, "external-link.json")
  const originalLink = fsp.link
  let injected = false

  fsp.link = async (existingPath, newPath) => {
    const result = await originalLink(existingPath, newPath)
    if (!injected && path.resolve(String(newPath)) === path.resolve(backupPath)) {
      injected = true
      await originalLink(existingPath, externalPath)
    }
    return result
  }

  try {
    await assert.rejects(
      ensureContainedRunStateMigrationBackup(root, runId, historical),
      /exactly two links during create-once publication/i
    )
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EXDEV"].includes(error.code)) return t.skip(error.code)
    throw error
  } finally {
    fsp.link = originalLink
  }

  assert.equal(injected, true)
  await assert.rejects(fsp.access(backupPath), { code: "ENOENT" })
  assert.equal(await fsp.readFile(externalPath, "utf8"), historical)
  assert.equal((await fsp.lstat(externalPath)).nlink, 1)
})

test("migration backup preserves an exact post-link crash pair for manual recovery", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-crash-recovery-000000000008"
  const historical = "historical-crash-recovery\n"
  await prepareRunDirectory(root, runId)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  const fixture = path.join(__dirname, "fixtures", "run-migration-backup-crash.js")
  const child = spawn(process.execPath, [fixture, root, runId, Buffer.from(historical).toString("base64")], {
    stdio: ["ignore", "pipe", "pipe"]
  })
  t.after(() => child.kill())

  let stderr = ""
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk) => { stderr += chunk })
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`migration crash fixture did not publish in time: ${stderr}`)), 30_000)
    let stdout = ""
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk) => {
      stdout += chunk
      if (stdout.includes("LINKED\n")) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error(`migration crash fixture exited before injection: ${code}; ${stderr}`))
    })
  })

  const candidatePattern = new RegExp(
    `^\\.${runId}\\.\\d+\\.[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.tmp$`,
    "i"
  )
  const candidates = (await fsp.readdir(runsDirectory(root))).filter((name) => candidatePattern.test(name))
  assert.equal(candidates.length, 1)
  const tempPath = path.join(runsDirectory(root), candidates[0])
  const [tempStat, backupStat] = await Promise.all([
    fsp.lstat(tempPath, { bigint: true }),
    fsp.lstat(backupPath, { bigint: true })
  ])
  assert.equal(tempStat.isFile(), true)
  assert.equal(backupStat.isFile(), true)
  assert.equal(tempStat.dev, backupStat.dev)
  assert.equal(tempStat.ino, backupStat.ino)
  assert.equal(tempStat.nlink, 2n)
  assert.equal(backupStat.nlink, 2n)
  assert.equal(await fsp.readFile(tempPath, "utf8"), historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, historical),
    /cannot be proven stopped|automatic recovery is disabled/i
  )
  const [liveTempStat, liveBackupStat] = await Promise.all([
    fsp.lstat(tempPath, { bigint: true }),
    fsp.lstat(backupPath, { bigint: true })
  ])
  assert.equal(liveTempStat.dev, tempStat.dev)
  assert.equal(liveTempStat.ino, tempStat.ino)
  assert.equal(liveBackupStat.dev, backupStat.dev)
  assert.equal(liveBackupStat.ino, backupStat.ino)
  assert.equal(liveTempStat.nlink, 2n)
  assert.equal(liveBackupStat.nlink, 2n)
  assert.equal(await fsp.readFile(tempPath, "utf8"), historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)

  const childExit = new Promise((resolve) => child.once("exit", resolve))
  child.kill()
  await childExit

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, historical),
    /cannot be proven stopped|automatic recovery is disabled/i
  )
  const [stoppedTempStat, stoppedBackupStat] = await Promise.all([
    fsp.lstat(tempPath, { bigint: true }),
    fsp.lstat(backupPath, { bigint: true })
  ])
  assert.equal(stoppedTempStat.dev, tempStat.dev)
  assert.equal(stoppedTempStat.ino, tempStat.ino)
  assert.equal(stoppedBackupStat.dev, backupStat.dev)
  assert.equal(stoppedBackupStat.ino, backupStat.ino)
  assert.equal(stoppedTempStat.nlink, 2n)
  assert.equal(stoppedBackupStat.nlink, 2n)
  assert.equal(await fsp.readFile(tempPath, "utf8"), historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
})

test("migration recovery preserves a matching crash pair with a locally absent pid", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-unknown-owner-000000000015"
  const historical = "unknown-owner-history\n"
  const unknownPid = 2_000_000_000
  await prepareRunDirectory(root, runId)
  const tempPath = strictRecoveryTempPath(root, runId, 6, unknownPid)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  await fsp.writeFile(tempPath, historical)
  await fsp.link(tempPath, backupPath)
  const before = await fsp.lstat(tempPath, { bigint: true })
  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, historical),
    /cannot be proven stopped|automatic recovery is disabled/i
  )

  const [tempStat, backupStat] = await Promise.all([
    fsp.lstat(tempPath, { bigint: true }),
    fsp.lstat(backupPath, { bigint: true })
  ])
  assert.equal(tempStat.dev, before.dev)
  assert.equal(tempStat.ino, before.ino)
  assert.equal(backupStat.dev, before.dev)
  assert.equal(backupStat.ino, before.ino)
  assert.equal(tempStat.nlink, 2n)
  assert.equal(backupStat.nlink, 2n)
  assert.equal(await fsp.readFile(tempPath, "utf8"), historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
})

test("migration recovery preserves an ambiguous set of exact owned temp candidates", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-ambiguous-recovery-000000000009"
  const historical = "ambiguous-recovery\n"
  await prepareRunDirectory(root, runId)
  const firstTemp = strictRecoveryTempPath(root, runId, 1)
  const secondTemp = strictRecoveryTempPath(root, runId, 2)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  await fsp.writeFile(firstTemp, historical)
  await fsp.link(firstTemp, backupPath)
  await fsp.writeFile(secondTemp, historical)

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, historical),
    /exactly one owned temporary file|ambiguous/i
  )

  assert.equal(await fsp.readFile(firstTemp, "utf8"), historical)
  assert.equal(await fsp.readFile(secondTemp, "utf8"), historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
  assert.equal((await fsp.lstat(firstTemp)).nlink, 2)
  assert.equal((await fsp.lstat(backupPath)).nlink, 2)
})

test("migration recovery preserves a crash pair whose bytes do not match", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-mismatch-recovery-000000000010"
  const expected = "expected-history\n"
  const mismatched = "mismatched-history\n"
  await prepareRunDirectory(root, runId)
  const tempPath = strictRecoveryTempPath(root, runId, 3)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  await fsp.writeFile(tempPath, mismatched)
  await fsp.link(tempPath, backupPath)

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, expected),
    /does not match the expected historical bytes/i
  )

  assert.equal(await fsp.readFile(tempPath, "utf8"), mismatched)
  assert.equal(await fsp.readFile(backupPath, "utf8"), mismatched)
  assert.equal((await fsp.lstat(tempPath)).nlink, 2)
  assert.equal((await fsp.lstat(backupPath)).nlink, 2)
})

test("migration recovery preserves a symlink candidate", async (t) => {
  const root = tempRoot()
  const outside = tempRoot()
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
  const runId = "20260712T000000Z-symlink-recovery-000000000011"
  const historical = "symlink-recovery\n"
  await prepareRunDirectory(root, runId)
  const outsideFile = path.join(outside, "outside.json")
  const tempPath = strictRecoveryTempPath(root, runId, 4)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  await fsp.writeFile(outsideFile, historical)
  try {
    await fsp.link(outsideFile, backupPath)
    await fsp.symlink(outsideFile, tempPath, "file")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EXDEV"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, historical),
    /direct regular file|symlink/i
  )

  assert.equal((await fsp.lstat(tempPath)).isSymbolicLink(), true)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
  assert.equal(await fsp.readFile(outsideFile, "utf8"), historical)
  assert.equal((await fsp.lstat(backupPath)).nlink, 2)
})

test("migration recovery preserves a crash pair with an extra external link", async (t) => {
  const root = tempRoot()
  const outside = tempRoot()
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(outside, { recursive: true, force: true })
  })
  const runId = "20260712T000000Z-extra-link-recovery-000000000012"
  const historical = "extra-link-recovery\n"
  await prepareRunDirectory(root, runId)
  const tempPath = strictRecoveryTempPath(root, runId, 5)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  const externalPath = path.join(outside, "external.json")
  await fsp.writeFile(tempPath, historical)
  try {
    await fsp.link(tempPath, backupPath)
    await fsp.link(tempPath, externalPath)
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "EXDEV"].includes(error.code)) return t.skip(error.code)
    throw error
  }

  await assert.rejects(
    ensureContainedRunStateMigrationBackup(root, runId, historical),
    /extra links|recover safely/i
  )

  assert.equal(await fsp.readFile(tempPath, "utf8"), historical)
  assert.equal(await fsp.readFile(backupPath, "utf8"), historical)
  assert.equal(await fsp.readFile(externalPath, "utf8"), historical)
  assert.equal((await fsp.lstat(tempPath)).nlink, 3)
  assert.equal((await fsp.lstat(backupPath)).nlink, 3)
  assert.equal((await fsp.lstat(externalPath)).nlink, 3)
})

test("migration rollback never deletes a replacement backup inode", async (t) => {
  const root = tempRoot()
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runId = "20260712T000000Z-replacement-backup-000000000013"
  const historical = "publication-history\n"
  const replacement = "replacement-backup\n"
  await prepareRunDirectory(root, runId)
  const backupPath = path.join(runDirectory(root, runId), "run-state-v0.backup.json")
  const originalRm = fsp.rm
  let injected = false

  fsp.rm = async (target, ...args) => {
    const name = path.basename(String(target))
    if (!injected && name.startsWith(`.${runId}.`) && name.endsWith(".tmp")) {
      injected = true
      await originalRm(backupPath)
      await fsp.writeFile(backupPath, replacement)
      const error = new Error("simulated post-link EIO")
      error.code = "EIO"
      throw error
    }
    return originalRm(target, ...args)
  }

  try {
    await assert.rejects(
      ensureContainedRunStateMigrationBackup(root, runId, historical),
      /simulated post-link EIO/
    )
  } finally {
    fsp.rm = originalRm
  }

  assert.equal(injected, true)
  assert.equal(await fsp.readFile(backupPath, "utf8"), replacement)
  assert.equal((await fsp.lstat(backupPath)).nlink, 1)
  assert.deepEqual(
    (await fsp.readdir(runsDirectory(root))).filter((name) => name.startsWith(`.${runId}.`) && name.endsWith(".tmp")),
    []
  )
})
