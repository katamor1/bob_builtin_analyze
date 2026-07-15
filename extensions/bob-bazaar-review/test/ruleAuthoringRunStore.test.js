const assert = require("node:assert/strict")
const { spawn } = require("node:child_process")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { getRuleAuthoringPaths } = require("../out/ruleAuthoring/ruleAuthoringPaths")
const {
  createRuleAuthoringRun,
  listIncompleteRuleAuthoringRuns,
  readRuleAuthoringRun,
  withRuleAuthoringDirectoryLock,
  withRuleAuthoringRotatingDirectoryLock,
  writeRuleAuthoringRun
} = require("../out/ruleAuthoring/ruleAuthoringRunStore")

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-run-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  return root
}

test("exposes the hardened generation protocol as a reusable directory lock", async (t) => {
  const root = await workspace(t)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".contract-lock")

  const result = await withRuleAuthoringDirectoryLock(root, lockDirectory, async () => "locked")

  assert.equal(result, "locked")
  const entries = await fs.readdir(lockDirectory)
  assert.ok(entries.includes(".authoring-run.lock.000000000001"))
  assert.ok(entries.includes(".authoring-run.lock.000000000001.closed"))
  assert.equal(entries.some((name) => name.startsWith(".authoring-run.lock-owner.")), false)
})

test("rotates a reusable directory lock without exhausting or overlapping epochs", async (t) => {
  const root = await workspace(t)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".rotating-lock")
  let active = 0
  let maximumActive = 0

  const results = await Promise.all(Array.from({ length: 5 }, (_, index) => (
    withRuleAuthoringRotatingDirectoryLock(
      root,
      lockDirectory,
      async () => {
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active -= 1
        return index
      },
      { maxGenerationsPerEpoch: 2 }
    )
  )))

  assert.deepEqual(results, [0, 1, 2, 3, 4])
  assert.equal(maximumActive, 1)
  assert.deepEqual(
    (await fs.readdir(lockDirectory)).filter((name) => name.startsWith(".authoring-run.lock.")),
    [
      ".authoring-run.lock.000000000001",
      ".authoring-run.lock.000000000001.closed",
      ".authoring-run.lock.000000000002",
      ".authoring-run.lock.000000000002.closed"
    ]
  )
  for (const [epoch, generationCount] of [[1, 2], [2, 1]]) {
    const epochDirectory = path.join(
      lockDirectory,
      `.authoring-run.lock-epoch.${String(epoch).padStart(8, "0")}`
    )
    const entries = await fs.readdir(epochDirectory)
    assert.equal(entries.filter((name) => /^\.authoring-run\.lock\.\d{12}$/.test(name)).length, generationCount)
    assert.equal(entries.filter((name) => /^\.authoring-run\.lock\.\d{12}\.closed$/.test(name)).length, generationCount)
  }
})

test("keeps rotating directory lock exclusion across process and epoch boundaries", async (t) => {
  const root = await workspace(t)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".process-rotating-lock")
  const witnessPath = path.join(root, "rotating-lock-witness")
  await withRuleAuthoringRotatingDirectoryLock(
    root,
    lockDirectory,
    async () => undefined,
    { maxGenerationsPerEpoch: 2 }
  )

  const children = Array.from({ length: 5 }, () => runRotatingLockProcess(
    root,
    lockDirectory,
    witnessPath,
    2
  ))
  const results = await Promise.all(children.map(({ result }) => result))

  for (const result of results) assert.equal(result.code, 0, result.stderr)
  assert.equal(await fs.lstat(witnessPath).then(() => true, () => false), false)
  assert.deepEqual(
    (await fs.readdir(lockDirectory))
      .filter((name) => /^\.authoring-run\.lock-epoch\.\d{8}$/.test(name))
      .sort(),
    [
      ".authoring-run.lock-epoch.00000001",
      ".authoring-run.lock-epoch.00000002"
    ]
  )
})

test("recovers a killed final-generation owner into the next epoch", async (t) => {
  const root = await workspace(t)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".killed-rotating-lock")
  const readyPath = path.join(root, "final-generation-ready")
  const witnessPath = path.join(root, "recovered-rotating-lock-witness")
  await withRuleAuthoringRotatingDirectoryLock(
    root,
    lockDirectory,
    async () => undefined,
    { maxGenerationsPerEpoch: 2 }
  )
  const holder = startHoldingRotatingLockProcess(root, lockDirectory, readyPath, 2)
  t.after(() => {
    if (holder.child.exitCode === null) holder.child.kill("SIGKILL")
  })
  await waitForPath(readyPath)
  holder.child.kill("SIGKILL")
  const holderResult = await holder.result
  assert.equal(holderResult.signal, "SIGKILL", holderResult.stderr)

  const recovery = runRotatingLockProcess(root, lockDirectory, witnessPath, 2)
  const recoveryResult = await recovery.result
  assert.equal(recoveryResult.code, 0, recoveryResult.stderr)
  await fs.access(path.join(lockDirectory, ".authoring-run.lock.000000000002.closed"))
  await fs.access(path.join(lockDirectory, ".authoring-run.lock-epoch.sealed"))
  await fs.access(path.join(
    lockDirectory,
    ".authoring-run.lock-epoch.00000001",
    ".authoring-run.lock.000000000001.closed"
  ))
})

test("rejects an unsealed rotating epoch and an incompatible epoch limit", async (t) => {
  const root = await workspace(t)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".sealed-rotating-lock")
  let entered = false
  await withRuleAuthoringRotatingDirectoryLock(
    root,
    lockDirectory,
    async () => undefined,
    { maxGenerationsPerEpoch: 2 }
  )
  await fs.mkdir(path.join(lockDirectory, ".authoring-run.lock-epoch.00000001"))

  await assert.rejects(
    withRuleAuthoringRotatingDirectoryLock(
      root,
      lockDirectory,
      async () => { entered = true },
      { maxGenerationsPerEpoch: 2 }
    )
  )
  assert.equal(entered, false)
  await assert.rejects(
    withRuleAuthoringRotatingDirectoryLock(
      root,
      lockDirectory,
      async () => { entered = true },
      { maxGenerationsPerEpoch: 3 }
    ),
    /epoch config is invalid/
  )
  assert.equal(entered, false)
})

test("never retries a rotating callback when a nested lock reaches its own limit", async (t) => {
  const root = await workspace(t)
  const outerDirectory = path.join(root, ".bob", "review", "rule-authoring", ".outer-rotating-lock")
  const exhaustedDirectory = path.join(root, ".bob", "review", "rule-authoring", ".exhausted-lock")
  await seedExhaustedDirectoryLock(exhaustedDirectory)
  const repeated = new Error("rotating callback was invoked twice")
  let invocations = 0
  let observed

  try {
    await withRuleAuthoringRotatingDirectoryLock(
      root,
      outerDirectory,
      async () => {
        invocations += 1
        if (invocations > 1) throw repeated
        return withRuleAuthoringDirectoryLock(root, exhaustedDirectory, async () => undefined)
      },
      { maxGenerationsPerEpoch: 1 }
    )
  } catch (error) {
    observed = error
  }

  assert.notEqual(observed, repeated)
  assert.match(observed?.message ?? "", /generation limit was reached/)
  assert.equal(invocations, 1)
})

test("recovers a sealed epoch transition and rejects a replaced seal", async (t) => {
  const root = await workspace(t)
  const lockDirectory = path.join(root, ".bob", "review", "rule-authoring", ".seal-recovery-lock")
  const lock = (action = async () => undefined) => withRuleAuthoringRotatingDirectoryLock(
    root,
    lockDirectory,
    action,
    { maxGenerationsPerEpoch: 2 }
  )
  await lock()
  await lock()

  const closurePath = path.join(lockDirectory, ".authoring-run.lock.000000000002.closed")
  const sealPath = path.join(lockDirectory, ".authoring-run.lock-epoch.sealed")
  await fs.link(closurePath, sealPath)
  assert.equal(await lock(async () => "recovered"), "recovered")

  const emptyRoot = await workspace(t)
  const emptyDirectory = path.join(emptyRoot, ".bob", "review", "rule-authoring", ".empty-epoch-lock")
  const emptyLock = (action = async () => undefined) => withRuleAuthoringRotatingDirectoryLock(
    emptyRoot,
    emptyDirectory,
    action,
    { maxGenerationsPerEpoch: 2 }
  )
  await emptyLock()
  await emptyLock()
  await fs.link(
    path.join(emptyDirectory, ".authoring-run.lock.000000000002.closed"),
    path.join(emptyDirectory, ".authoring-run.lock-epoch.sealed")
  )
  await fs.mkdir(path.join(emptyDirectory, ".authoring-run.lock-epoch.00000001"))
  assert.equal(await emptyLock(async () => "empty epoch recovered"), "empty epoch recovered")

  const tamperedRoot = await workspace(t)
  const tamperedDirectory = path.join(
    tamperedRoot,
    ".bob",
    "review",
    "rule-authoring",
    ".tampered-seal-lock"
  )
  const tamperedLock = () => withRuleAuthoringRotatingDirectoryLock(
    tamperedRoot,
    tamperedDirectory,
    async () => undefined,
    { maxGenerationsPerEpoch: 2 }
  )
  await tamperedLock()
  await tamperedLock()
  await fs.writeFile(
    path.join(tamperedDirectory, ".authoring-run.lock-epoch.sealed"),
    "not the final closure\n",
    "utf8"
  )
  await assert.rejects(tamperedLock(), /epoch seal is invalid/)
})

test("creates a resumable run atomically and installs missing-only ignore rules", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-001",
    workflowRunId: "workflow-001",
    now: "2026-07-14T01:02:03.000Z"
  })
  const paths = getRuleAuthoringPaths(root, "run-001")

  assert.equal(run.currentPhase, "sources")
  assert.equal(run.phases.sources.status, "in_progress")
  assert.equal(run.phases.extraction.status, "not_started")
  assert.equal(await fs.readFile(path.join(paths.authoringDirectory, ".gitignore"), "utf8"), "/*\n!/.gitignore\n")
  assert.deepEqual(await readRuleAuthoringRun(paths), run)

  const temporaryFiles = (await fs.readdir(paths.runDirectory)).filter((name) => name.endsWith(".tmp"))
  assert.deepEqual(temporaryFiles, [])

  const next = structuredClone(run)
  next.updatedAt = "2026-07-14T01:02:04.000Z"
  next.warnings = ["source.atomic_observed"]
  const beforeIdentity = await fs.stat(paths.authoringRunPath)
  await writeRuleAuthoringRun(next, run.updatedAt)
  const afterIdentity = await fs.stat(paths.authoringRunPath)
  assert.notEqual(
    `${beforeIdentity.dev}:${beforeIdentity.ino}`,
    `${afterIdentity.dev}:${afterIdentity.ino}`,
    "replacement must install a completed temporary inode via rename"
  )
  assert.deepEqual(await readRuleAuthoringRun(paths), next)
})

test("keeps the old run complete until a synced temporary run is atomically renamed", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-observe-rename",
    now: "2026-07-14T01:10:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const next = structuredClone(run)
  next.warnings = ["source.atomic_observed"]
  next.updatedAt = "2026-07-14T01:11:00.000Z"
  const writer = startPausedRenameWriterProcess(next, run.updatedAt)
  t.after(() => {
    if (writer.child.exitCode === null) writer.child.kill("SIGKILL")
  })

  const rename = await writer.waitUntilPaused
  assert.equal(rename.destination, paths.authoringRunPath)
  assert.equal(path.dirname(rename.source), paths.runDirectory)
  assert.match(path.basename(rename.source), /^\.authoring-run\.\d+\.[a-f0-9]{16}\.tmp$/)

  const [persistedBeforeRename, temporaryBeforeRename] = await Promise.all([
    fs.readFile(paths.authoringRunPath, "utf8"),
    fs.readFile(rename.source, "utf8")
  ])
  assert.equal(persistedBeforeRename, `${JSON.stringify(run, null, 2)}\n`)
  assert.equal(temporaryBeforeRename, `${JSON.stringify(next, null, 2)}\n`)
  assert.deepEqual(JSON.parse(persistedBeforeRename), run)
  assert.deepEqual(JSON.parse(temporaryBeforeRename), next)

  writer.release()
  const exit = await writer.result
  assert.equal(exit.code, 0, exit.stderr)
  assert.deepEqual(await readRuleAuthoringRun(paths), next)
  await assert.rejects(fs.lstat(rename.source), { code: "ENOENT" })
})

test("preserves an existing authoring ignore file", async (t) => {
  const root = await workspace(t)
  const paths = getRuleAuthoringPaths(root, "run-existing-ignore")
  await fs.mkdir(paths.authoringDirectory, { recursive: true })
  await fs.writeFile(path.join(paths.authoringDirectory, ".gitignore"), "# user rules\n", "utf8")

  await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-existing-ignore" })

  assert.equal(await fs.readFile(path.join(paths.authoringDirectory, ".gitignore"), "utf8"), "# user rules\n")
})

test("rejects stale writes and phase regression while retaining deterministic artifacts on failure", async (t) => {
  const root = await workspace(t)
  const created = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-progress",
    now: "2026-07-14T01:00:00.000Z"
  })
  const progressed = structuredClone(created)
  progressed.currentPhase = "extraction"
  progressed.phases.sources = { status: "completed", completedAt: "2026-07-14T01:01:00.000Z" }
  progressed.phases.extraction = { status: "in_progress", startedAt: "2026-07-14T01:01:00.000Z" }
  progressed.artifacts.sourceManifest = "source-manifest.json"
  progressed.updatedAt = "2026-07-14T01:01:00.000Z"
  await writeRuleAuthoringRun(progressed, created.updatedAt)

  const failed = structuredClone(progressed)
  failed.phases.extraction = { status: "failed", startedAt: "2026-07-14T01:01:00.000Z" }
  failed.artifacts = { sourceManifest: "untrusted-replacement.json", sourceIndex: "source-index.json" }
  failed.issues = [{
    phase: "extraction",
    code: "source.snapshot_changed",
    retryable: true,
    recordedAt: "2026-07-14T01:02:00.000Z"
  }]
  failed.updatedAt = "2026-07-14T01:02:00.000Z"
  await writeRuleAuthoringRun(failed, progressed.updatedAt)
  const persisted = await readRuleAuthoringRun(getRuleAuthoringPaths(root, "run-progress"))
  assert.equal(persisted.artifacts.sourceManifest, "source-manifest.json")
  assert.equal(persisted.artifacts.sourceIndex, undefined)

  await assert.rejects(
    writeRuleAuthoringRun({ ...persisted, updatedAt: "2026-07-14T01:03:00.000Z" }, created.updatedAt),
    /changed since it was loaded/
  )
  const regressed = structuredClone(persisted)
  regressed.currentPhase = "sources"
  regressed.phases.sources = { status: "in_progress", startedAt: regressed.createdAt }
  regressed.phases.extraction = { status: "not_started" }
  regressed.updatedAt = "2026-07-14T01:03:00.000Z"
  await assert.rejects(writeRuleAuthoringRun(regressed, persisted.updatedAt), /must not move backwards/)
})

test("requires monotonically increasing updatedAt and a matching issue for failure", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-monotonic",
    now: "2026-07-14T06:00:00.000Z"
  })
  await assert.rejects(writeRuleAuthoringRun(structuredClone(run), run.updatedAt), /updatedAt must advance/)

  const failed = structuredClone(run)
  failed.phases.sources = { status: "failed", startedAt: run.createdAt }
  failed.updatedAt = "2026-07-14T06:01:00.000Z"
  await assert.rejects(writeRuleAuthoringRun(failed, run.updatedAt), /matching bounded issue/)
})

test("does not move a terminal phase status back to in progress", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-terminal-status",
    now: "2026-07-14T06:10:00.000Z"
  })
  const completed = structuredClone(run)
  completed.phases.sources = {
    status: "completed",
    startedAt: run.createdAt,
    completedAt: "2026-07-14T06:11:00.000Z"
  }
  completed.updatedAt = "2026-07-14T06:11:00.000Z"
  await writeRuleAuthoringRun(completed, run.updatedAt)

  const regressed = structuredClone(completed)
  regressed.phases.sources = { status: "in_progress", startedAt: run.createdAt }
  regressed.updatedAt = "2026-07-14T06:12:00.000Z"
  await assert.rejects(
    writeRuleAuthoringRun(regressed, completed.updatedAt),
    /phase status must not move backwards/
  )
})

test("serializes concurrent compare-and-replace writes for one run", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-concurrent",
    now: "2026-07-14T07:00:00.000Z"
  })
  const first = structuredClone(run)
  first.warnings = ["source.first_writer"]
  first.updatedAt = "2026-07-14T07:01:00.000Z"
  const second = structuredClone(run)
  second.warnings = ["source.second_writer"]
  second.updatedAt = "2026-07-14T07:01:00.000Z"

  const results = await Promise.allSettled([
    writeRuleAuthoringRun(first, run.updatedAt),
    writeRuleAuthoringRun(second, run.updatedAt)
  ])
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1)
  assert.equal(results.filter((result) => result.status === "rejected").length, 1)
  const persisted = await readRuleAuthoringRun(getRuleAuthoringPaths(root, run.runId))
  assert.ok(
    persisted.warnings.includes("source.first_writer") !== persisted.warnings.includes("source.second_writer")
  )
})

test("creates distinct runs concurrently when shared workspace ancestors are initially absent", async (t) => {
  const root = await workspace(t)
  const controls = path.join(root, "create-controls")
  await fs.mkdir(controls)
  const releasePath = path.join(controls, "release")
  const writers = Array.from({ length: 8 }, (_, index) => startConcurrentCreateProcess(
    root,
    `run-concurrent-create-${index}`,
    path.join(controls, `ready-${index}`),
    releasePath
  ))
  t.after(() => {
    for (const writer of writers) {
      if (writer.child.exitCode === null) writer.child.kill("SIGKILL")
    }
  })

  await Promise.all(writers.map((writer) => waitForCreateReady(writer.readyPath)))
  await fs.writeFile(releasePath, "release\n", "utf8")
  const exits = await Promise.all(writers.map((writer) => writer.result))

  assert.deepEqual(exits.map((exit) => exit.code), Array(8).fill(0), exits.map((exit) => exit.stderr).join("\n"))
  const runs = await listIncompleteRuleAuthoringRuns(root)
  assert.deepEqual(
    runs.map((run) => run.runId).toSorted(),
    Array.from({ length: 8 }, (_, index) => `run-concurrent-create-${index}`)
  )
})

test("serializes compare-and-replace across Node processes", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-process-concurrent",
    now: "2026-07-14T07:30:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const first = structuredClone(run)
  first.warnings = ["source.first_process"]
  first.updatedAt = "2026-07-14T07:31:00.000Z"
  const second = structuredClone(run)
  second.warnings = ["source.second_process"]
  second.updatedAt = "2026-07-14T07:31:00.000Z"

  const firstResult = runWriterProcess(first, run.updatedAt, 300)
  await waitForValidLock(paths.runDirectory)
  const secondResult = runWriterProcess(second, run.updatedAt, 0)
  const [firstExit, secondExit] = await Promise.all([firstResult, secondResult])

  assert.equal(firstExit.code, 0, firstExit.stderr)
  assert.equal(secondExit.code, 2)
  assert.match(secondExit.stderr, /changed since it was loaded/)
  const persisted = await readRuleAuthoringRun(paths)
  assert.deepEqual(persisted.warnings, ["source.first_process"])
  await assertNoOpenRunLocks(paths.runDirectory)
})

test("reclaims a complete lock owned by a killed child process", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-killed-owner",
    now: "2026-07-14T07:40:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const abandoned = structuredClone(run)
  abandoned.warnings = ["source.abandoned_writer"]
  abandoned.updatedAt = "2026-07-14T07:41:00.000Z"
  const writer = startWriterProcess(abandoned, run.updatedAt, 10_000)
  const abandonedLock = await waitForValidLock(paths.runDirectory)
  writer.child.kill("SIGKILL")
  await writer.result

  const recovered = structuredClone(run)
  recovered.warnings = ["source.recovered_writer"]
  recovered.updatedAt = "2026-07-14T07:42:00.000Z"
  await writeRuleAuthoringRun(recovered, run.updatedAt)
  assert.deepEqual((await readRuleAuthoringRun(paths)).warnings, ["source.recovered_writer"])
  await fs.access(`${abandonedLock.path}.closed`)
  await assertNoOpenRunLocks(paths.runDirectory)
})

test("removes an owner file abandoned before generation acquisition", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-owner-cleanup",
    now: "2026-07-14T07:45:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const held = structuredClone(run)
  held.warnings = ["source.lock_holder"]
  held.updatedAt = "2026-07-14T07:46:00.000Z"
  const holder = startPausedRenameWriterProcess(held, run.updatedAt)
  const waiting = structuredClone(run)
  waiting.warnings = ["source.killed_waiter"]
  waiting.updatedAt = "2026-07-14T07:46:00.000Z"
  let waiter
  t.after(() => {
    for (const writer of [holder, waiter].filter(Boolean)) {
      if (writer.child.exitCode === null) writer.child.kill("SIGKILL")
    }
  })

  await holder.waitUntilPaused
  waiter = startWriterProcess(waiting, run.updatedAt, 0)
  const abandonedOwnerPath = await waitForOwnerFile(paths.runDirectory, waiter.child.pid)
  waiter.child.kill("SIGKILL")
  await waiter.result
  await fs.access(abandonedOwnerPath)

  holder.release()
  const holderExit = await holder.result
  assert.equal(holderExit.code, 0, holderExit.stderr)
  const persisted = await readRuleAuthoringRun(paths)
  const recovered = structuredClone(persisted)
  recovered.warnings = ["source.owner_cleanup_verified"]
  recovered.updatedAt = "2026-07-14T07:47:00.000Z"
  await writeRuleAuthoringRun(recovered, persisted.updatedAt)
  await assert.rejects(fs.access(abandonedOwnerPath), { code: "ENOENT" })
})

test("serializes two writers that simultaneously recover a killed owner", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-double-recovery",
    now: "2026-07-14T07:50:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const abandoned = structuredClone(run)
  abandoned.warnings = ["source.abandoned_writer"]
  abandoned.updatedAt = "2026-07-14T07:51:00.000Z"
  const abandonedWriter = startWriterProcess(abandoned, run.updatedAt, 10_000)
  const abandonedLock = await waitForValidLock(paths.runDirectory)
  abandonedWriter.child.kill("SIGKILL")
  await abandonedWriter.result

  const controls = path.join(root, "recovery-controls")
  await fs.mkdir(controls)
  const first = structuredClone(run)
  first.warnings = ["source.first_recovery"]
  first.updatedAt = "2026-07-14T07:52:00.000Z"
  const second = structuredClone(run)
  second.warnings = ["source.second_recovery"]
  second.updatedAt = "2026-07-14T07:52:00.000Z"
  const firstControl = recoveryControlPaths(controls, "first")
  const secondControl = recoveryControlPaths(controls, "second")
  const legacyLockPath = path.join(paths.runDirectory, ".authoring-run.lock")
  const firstWriter = startRecoveryRaceWriterProcess(
    first,
    run.updatedAt,
    paths.authoringRunPath,
    legacyLockPath,
    `${abandonedLock.path}.closed`,
    firstControl,
    true
  )
  const secondWriter = startRecoveryRaceWriterProcess(
    second,
    run.updatedAt,
    paths.authoringRunPath,
    legacyLockPath,
    `${abandonedLock.path}.closed`,
    secondControl,
    false
  )
  t.after(() => {
    for (const writer of [firstWriter, secondWriter]) {
      if (writer.child.exitCode === null) writer.child.kill("SIGKILL")
    }
  })

  await Promise.all([
    waitForPath(firstControl.startReady),
    waitForPath(secondControl.startReady)
  ])
  await Promise.all([
    fs.writeFile(firstControl.startRelease, "release\n"),
    fs.writeFile(secondControl.startRelease, "release\n")
  ])

  const recoveryMode = await waitForRecoveryMode(
    firstWriter.child,
    secondWriter.child,
    [firstControl.reclaimReady, secondControl.reclaimReady],
    [firstControl.generationReady, secondControl.generationReady]
  )
  let firstExit
  let secondExit
  if (recoveryMode === "legacy") {
    await fs.writeFile(firstControl.reclaimRelease, "release\n")
    await waitForPath(firstControl.renameReady)
    await fs.writeFile(secondControl.reclaimRelease, "release\n")
    secondExit = await secondWriter.result
    await fs.writeFile(firstControl.renameRelease, "release\n")
    firstExit = await firstWriter.result
  } else {
    await Promise.all([
      fs.writeFile(firstControl.generationRelease, "release\n"),
      fs.writeFile(secondControl.generationRelease, "release\n")
    ])
    const generationExits = await Promise.all([firstWriter.result, secondWriter.result])
    firstExit = generationExits[0]
    secondExit = generationExits[1]
  }

  const exits = [firstExit, secondExit]
  assert.equal(exits.filter((exit) => exit.code === 0).length, 1)
  assert.equal(exits.filter((exit) => exit.code === 2).length, 1)
  assert.match(exits.find((exit) => exit.code === 2).stderr, /changed since it was loaded/)
  const winningWarning = firstExit.code === 0 ? "source.first_recovery" : "source.second_recovery"
  assert.deepEqual((await readRuleAuthoringRun(paths)).warnings, [winningWarning])
  await fs.access(`${abandonedLock.path}.closed`)
  await assertNoOpenRunLocks(paths.runDirectory)
})

test("retries a transiently inconsistent lock-directory snapshot", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-lock-snapshot",
    now: "2026-07-14T07:55:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const first = structuredClone(run)
  first.warnings = ["source.first_generation"]
  first.updatedAt = "2026-07-14T07:56:00.000Z"
  await writeRuleAuthoringRun(first, run.updatedAt)
  const next = structuredClone(first)
  next.warnings = ["source.snapshot_retry"]
  next.updatedAt = "2026-07-14T07:57:00.000Z"

  const exit = await runReaddirGlitchWriterProcess(
    next,
    first.updatedAt,
    paths.runDirectory,
    ".authoring-run.lock.000000000001.closed"
  )
  assert.equal(exit.code, 0, exit.stderr)
  assert.deepEqual((await readRuleAuthoringRun(paths)).warnings, ["source.snapshot_retry"])
})

test("stops after bounded retries for a persistently inconsistent lock snapshot", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-lock-persistent-gap",
    now: "2026-07-14T07:58:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const firstRecord = JSON.parse(await fs.readFile(
    path.join(paths.runDirectory, ".authoring-run.lock.000000000001"),
    "utf8"
  ))
  await fs.writeFile(
    path.join(paths.runDirectory, ".authoring-run.lock.000000000003"),
    `${JSON.stringify({ ...firstRecord, token: "b".repeat(32) })}\n`,
    "utf8"
  )

  const next = { ...run, updatedAt: "2026-07-14T07:59:00.000Z" }
  await assert.rejects(
    writeRuleAuthoringRun(next, run.updatedAt),
    /lock generations must be contiguous/
  )
})

test("strictly rejects malformed and schema-invalid persisted runs", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-malformed" })
  const paths = getRuleAuthoringPaths(root, run.runId)
  await fs.writeFile(paths.authoringRunPath, JSON.stringify({ ...run, unexpected: true }), "utf8")

  await assert.rejects(readRuleAuthoringRun(paths), /strict schema/)
  await fs.writeFile(paths.authoringRunPath, "{", "utf8")
  await assert.rejects(readRuleAuthoringRun(paths), /Failed to parse rule authoring run JSON/)
})

test("bounds persisted run, lock, and closure records before parsing", async (t) => {
  const runRoot = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: runRoot,
    runId: "run-bounded-record",
    now: "2026-07-14T08:00:00.000Z"
  })
  const runPaths = getRuleAuthoringPaths(runRoot, run.runId)
  await fs.writeFile(runPaths.authoringRunPath, "x".repeat(1024 * 1024 + 1), "utf8")
  await assert.rejects(readRuleAuthoringRun(runPaths), /run file exceeds its byte limit/)

  const lockRoot = await workspace(t)
  const lockRun = await createRuleAuthoringRun({
    workspaceRoot: lockRoot,
    runId: "run-bounded-lock",
    now: "2026-07-14T08:00:00.000Z"
  })
  const lockPaths = getRuleAuthoringPaths(lockRoot, lockRun.runId)
  await fs.writeFile(
    path.join(lockPaths.runDirectory, ".authoring-run.lock.000000000002"),
    "x".repeat(4097),
    "utf8"
  )
  const lockNext = { ...lockRun, updatedAt: "2026-07-14T08:11:00.000Z" }
  await assert.rejects(writeRuleAuthoringRun(lockNext, lockRun.updatedAt), /lock record exceeds its byte limit/)

  const closureRoot = await workspace(t)
  const closureRun = await createRuleAuthoringRun({
    workspaceRoot: closureRoot,
    runId: "run-bounded-closure",
    now: "2026-07-14T08:00:00.000Z"
  })
  const closurePaths = getRuleAuthoringPaths(closureRoot, closureRun.runId)
  await fs.writeFile(
    path.join(closurePaths.runDirectory, ".authoring-run.lock.000000000001.closed"),
    "x".repeat(4097),
    "utf8"
  )
  const closureNext = { ...closureRun, updatedAt: "2026-07-14T08:12:00.000Z" }
  await assert.rejects(
    writeRuleAuthoringRun(closureNext, closureRun.updatedAt),
    /lock closure exceeds its byte limit/
  )
})

test("bounds a persisted run that grows after its size check and before reading", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-growing-read",
    now: "2026-07-14T08:13:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)

  const exit = await runGrowingReadProcess(paths, run.runId)
  assert.equal(exit.code, 2, exit.stderr)
  assert.match(exit.stderr, /run file exceeds its byte limit/)
})

test("bounds artifact paths in run metadata", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-artifact-bound",
    now: "2026-07-14T08:00:00.000Z"
  })
  const boundaryPath = [
    "a".repeat(255),
    "b".repeat(255),
    "c".repeat(255),
    "d".repeat(254),
    "e"
  ].join("/")
  assert.equal(Buffer.byteLength(boundaryPath, "utf8"), 1024)
  const boundary = {
    ...run,
    artifacts: { sourceManifest: boundaryPath },
    updatedAt: "2026-07-14T08:10:00.000Z"
  }
  await writeRuleAuthoringRun(boundary, run.updatedAt)
  const oversized = {
    ...boundary,
    artifacts: { sourceManifest: `${boundaryPath}f` },
    updatedAt: "2026-07-14T08:20:00.000Z"
  }
  await assert.rejects(
    writeRuleAuthoringRun(oversized, boundary.updatedAt),
    /bounded workspace-relative artifact name/
  )
  const oversizedMultibyte = {
    ...boundary,
    artifacts: {
      sourceManifest: [
        "é".repeat(127),
        "é".repeat(127),
        "é".repeat(127),
        "é".repeat(127),
        "é".repeat(3)
      ].join("/")
    },
    updatedAt: "2026-07-14T08:20:00.000Z"
  }
  await assert.rejects(
    writeRuleAuthoringRun(oversizedMultibyte, boundary.updatedAt),
    /bounded workspace-relative artifact name/
  )
})

test("fails closed when an open lock belongs to another process scope", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-foreign-scope",
    now: "2026-07-14T08:00:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const firstRecord = JSON.parse(await fs.readFile(
    path.join(paths.runDirectory, ".authoring-run.lock.000000000001"),
    "utf8"
  ))
  const foreignScope = firstRecord.scope_id === "f".repeat(64) ? "e".repeat(64) : "f".repeat(64)
  await fs.writeFile(
    path.join(paths.runDirectory, ".authoring-run.lock.000000000002"),
    `${JSON.stringify({
      schema_version: "bob-bazaar-review/run-lock/v1",
      pid: process.pid,
      token: "a".repeat(32),
      scope_id: foreignScope,
      created_at: "2026-07-14T08:30:00.000Z"
    })}\n`,
    "utf8"
  )
  const next = { ...run, updatedAt: "2026-07-14T08:31:00.000Z" }
  await assert.rejects(writeRuleAuthoringRun(next, run.updatedAt), /another process scope/)
})

test("caps foreign orphan owner files outside the generation history", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-owner-cap",
    now: "2026-07-14T08:00:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const firstRecord = JSON.parse(await fs.readFile(
    path.join(paths.runDirectory, ".authoring-run.lock.000000000001"),
    "utf8"
  ))
  const foreignScope = firstRecord.scope_id === "d".repeat(64) ? "c".repeat(64) : "d".repeat(64)
  await Promise.all(Array.from({ length: 257 }, (_, index) => fs.writeFile(
    path.join(
      paths.runDirectory,
      `.authoring-run.lock-owner.${foreignScope}.999999.${index.toString(16).padStart(32, "0")}.owner`
    ),
    "foreign owner\n",
    "utf8"
  )))
  const next = { ...run, updatedAt: "2026-07-14T08:41:00.000Z" }
  await assert.rejects(writeRuleAuthoringRun(next, run.updatedAt), /owner file limit/)
})

test("caps examined same-scope dead owners before cleanup work becomes unbounded", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-dead-owner-work-cap",
    now: "2026-07-14T08:42:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const firstRecord = JSON.parse(await fs.readFile(
    path.join(paths.runDirectory, ".authoring-run.lock.000000000001"),
    "utf8"
  ))
  const deadPid = await exitedChildPid()
  await Promise.all(Array.from({ length: 257 }, (_, index) => {
    const token = index.toString(16).padStart(32, "0")
    return fs.writeFile(
      path.join(
        paths.runDirectory,
        `.authoring-run.lock-owner.${firstRecord.scope_id}.${deadPid}.${token}.owner`
      ),
      `${JSON.stringify({
        schema_version: "bob-bazaar-review/run-lock/v1",
        pid: deadPid,
        token,
        scope_id: firstRecord.scope_id,
        created_at: "2026-07-14T08:42:30.000Z"
      })}\n`,
      "utf8"
    )
  }))

  const next = { ...run, updatedAt: "2026-07-14T08:43:00.000Z" }
  await assert.rejects(writeRuleAuthoringRun(next, run.updatedAt), /owner file limit/)
})

test("caps closure history entries before snapshot validation work becomes unbounded", async (t) => {
  const root = await workspace(t)
  const run = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-closure-work-cap",
    now: "2026-07-14T08:44:00.000Z"
  })
  const paths = getRuleAuthoringPaths(root, run.runId)
  const source = path.join(paths.runDirectory, ".authoring-run.lock.000000000001.closed")
  for (let start = 2; start <= 10_001; start += 200) {
    await Promise.all(Array.from({ length: Math.min(200, 10_002 - start) }, (_, offset) => {
      const generation = start + offset
      return fs.link(
        source,
        path.join(paths.runDirectory, `.authoring-run.lock.${String(generation).padStart(12, "0")}.closed`)
      )
    }))
  }

  const next = { ...run, updatedAt: "2026-07-14T08:45:00.000Z" }
  await assert.rejects(writeRuleAuthoringRun(next, run.updatedAt), /closure file limit/)
})

test("derives non-Linux lock scopes from machine identity and fails closed without one", async (t) => {
  const firstMachineRoot = await workspace(t)
  const secondMachineRoot = await workspace(t)
  const firstScope = await runMockNonLinuxScopeProcess(firstMachineRoot, "02:00:00:00:00:01")
  const secondScope = await runMockNonLinuxScopeProcess(secondMachineRoot, "02:00:00:00:00:02")
  assert.notEqual(firstScope, secondScope)

  const firstFallbackRoot = await workspace(t)
  const secondFallbackRoot = await workspace(t)
  const firstFallback = await runMockNonLinuxScopeProcess(firstFallbackRoot, "00:00:00:00:00:00")
  const secondFallback = await runMockNonLinuxScopeProcess(secondFallbackRoot, "00:00:00:00:00:00")
  assert.notEqual(firstFallback, secondFallback)
})

test("lists incomplete runs deterministically and resumes after restart", async (t) => {
  const root = await workspace(t)
  await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-b", now: "2026-07-14T02:00:00.000Z" })
  await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-a", now: "2026-07-14T02:00:00.000Z" })
  const completed = await createRuleAuthoringRun({
    workspaceRoot: root,
    runId: "run-complete",
    now: "2026-07-14T03:00:00.000Z"
  })
  for (const phase of Object.keys(completed.phases)) completed.phases[phase] = { status: "completed" }
  completed.currentPhase = "completed"
  completed.updatedAt = "2026-07-14T03:01:00.000Z"
  await writeRuleAuthoringRun(completed, "2026-07-14T03:00:00.000Z")

  const resumed = await listIncompleteRuleAuthoringRuns(root)
  assert.deepEqual(resumed.map((run) => run.runId), ["run-a", "run-b"])
  assert.equal(resumed[0].workspaceRoot, root)
})

test("uses code-unit run id ordering when timestamps tie", async (t) => {
  const root = await workspace(t)
  await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-a", now: "2026-07-14T08:00:00.000Z" })
  await createRuleAuthoringRun({ workspaceRoot: root, runId: "run-Z", now: "2026-07-14T08:00:00.000Z" })

  const runs = await listIncompleteRuleAuthoringRuns(root)
  assert.deepEqual(runs.map((run) => run.runId), ["run-Z", "run-a"])
})

function runWriterProcess(run, expectedUpdatedAt, delayMs) {
  return startWriterProcess(run, expectedUpdatedAt, delayMs).result
}

function startConcurrentCreateProcess(root, runId, readyPath, releasePath) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalMkdir = fs.mkdir",
    "const waitForPath = async (target) => {",
    "  for (;;) {",
    "    try { await fs.access(target); return } catch (error) { if (error.code !== 'ENOENT') throw error }",
    "    await new Promise((resolve) => setTimeout(resolve, 5))",
    "  }",
    "}",
    "let paused = false",
    "fs.mkdir = async (target, ...args) => {",
    "  if (!paused && target === process.env.BOB_DIRECTORY) {",
    "    paused = true",
    "    await fs.writeFile(process.env.READY_PATH, 'ready\\n', 'utf8')",
    "    await waitForPath(process.env.RELEASE_PATH)",
    "  }",
    "  return originalMkdir(target, ...args)",
    "}",
    "const store = require(process.env.STORE_PATH)",
    "store.createRuleAuthoringRun({ workspaceRoot: process.env.WORKSPACE_ROOT, runId: process.env.RUN_ID })",
    "  .then(() => process.stdout.write('ok'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      WORKSPACE_ROOT: root,
      RUN_ID: runId,
      BOB_DIRECTORY: path.join(root, ".bob"),
      READY_PATH: readyPath,
      RELEASE_PATH: releasePath
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return { child, readyPath, result }
}

async function exitedChildPid() {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" })
  const pid = child.pid
  await new Promise((resolve, reject) => {
    child.on("error", reject)
    child.on("close", resolve)
  })
  return pid
}

function runMockNonLinuxScopeProcess(root, mac) {
  const script = [
    "const Module = require('node:module')",
    "const originalLoad = Module._load",
    "Module._load = function (request, parent, isMain) {",
    "  const loaded = originalLoad.call(this, request, parent, isMain)",
    "  if (request !== 'node:os') return loaded",
    "  return {",
    "    ...loaded,",
    "    hostname: () => 'shared-hostname',",
    "    networkInterfaces: () => ({ adapter: [{ internal: false, mac: process.env.MOCK_MAC }] })",
    "  }",
    "}",
    "Object.defineProperty(process, 'platform', { value: 'darwin' })",
    "const fs = require('node:fs/promises')",
    "const path = require('node:path')",
    "const store = require(process.env.STORE_PATH)",
    "const pathsModule = require(process.env.PATHS_PATH)",
    "store.createRuleAuthoringRun({ workspaceRoot: process.env.WORKSPACE_ROOT, runId: 'run-scope' })",
    "  .then(async () => {",
    "    const paths = pathsModule.getRuleAuthoringPaths(process.env.WORKSPACE_ROOT, 'run-scope')",
    "    const record = JSON.parse(await fs.readFile(path.join(paths.runDirectory, '.authoring-run.lock.000000000001'), 'utf8'))",
    "    process.stdout.write(record.scope_id)",
    "  })",
    "  .catch((error) => { process.stderr.write(error.stack || error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      PATHS_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringPaths"),
      WORKSPACE_ROOT: root,
      MOCK_MAC: mac
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `scope process exited ${code}`))
    })
  })
}

function runGrowingReadProcess(paths, runId) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalOpen = fs.open",
    "let grown = false",
    "fs.open = async (target, ...args) => {",
    "  const handle = await originalOpen(target, ...args)",
    "  if (target !== process.env.RUN_PATH) return handle",
    "  return new Proxy(handle, {",
    "    get(object, property) {",
    "      if (property === 'read') return async (...readArgs) => {",
    "        if (!grown) {",
    "          grown = true",
    "          await fs.appendFile(target, 'x'.repeat(1024 * 1024 + 1), 'utf8')",
    "        }",
    "        return object.read(...readArgs)",
    "      }",
    "      const value = Reflect.get(object, property, object)",
    "      return typeof value === 'function' ? value.bind(object) : value",
    "    }",
    "  })",
    "}",
    "const store = require(process.env.STORE_PATH)",
    "const pathsModule = require(process.env.PATHS_PATH)",
    "const paths = pathsModule.getRuleAuthoringPaths(process.env.WORKSPACE_ROOT, process.env.RUN_ID)",
    "store.readRuleAuthoringRun(paths)",
    "  .then(() => process.stdout.write('unexpected success'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      PATHS_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringPaths"),
      WORKSPACE_ROOT: path.resolve(paths.reviewDirectory, "..", ".."),
      RUN_ID: runId,
      RUN_PATH: paths.authoringRunPath
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

function startWriterProcess(run, expectedUpdatedAt, delayMs) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalRename = fs.rename",
    "const delay = Number(process.env.DELAY_MS)",
    "if (delay > 0) fs.rename = async (...args) => { await new Promise((resolve) => setTimeout(resolve, delay)); return originalRename(...args) }",
    "const store = require(process.env.STORE_PATH)",
    "const run = JSON.parse(Buffer.from(process.env.RUN_BASE64, 'base64').toString('utf8'))",
    "store.writeRuleAuthoringRun(run, process.env.EXPECTED_UPDATED_AT)",
    "  .then(() => process.stdout.write('ok'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      RUN_BASE64: Buffer.from(JSON.stringify(run), "utf8").toString("base64"),
      EXPECTED_UPDATED_AT: expectedUpdatedAt,
      DELAY_MS: String(delayMs)
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return { child, result }
}

function startPausedRenameWriterProcess(run, expectedUpdatedAt) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalRename = fs.rename",
    "let releaseRename",
    "const released = new Promise((resolve) => { releaseRename = resolve })",
    "process.stdin.once('data', () => releaseRename())",
    "fs.rename = async (source, destination) => {",
    "  const payload = Buffer.from(JSON.stringify({ source, destination }), 'utf8').toString('base64')",
    "  process.stdout.write(`before-rename ${payload}\\n`)",
    "  await released",
    "  return originalRename(source, destination)",
    "}",
    "const store = require(process.env.STORE_PATH)",
    "const run = JSON.parse(Buffer.from(process.env.RUN_BASE64, 'base64').toString('utf8'))",
    "store.writeRuleAuthoringRun(run, process.env.EXPECTED_UPDATED_AT)",
    "  .then(() => process.stdout.write('ok'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      RUN_BASE64: Buffer.from(JSON.stringify(run), "utf8").toString("base64"),
      EXPECTED_UPDATED_AT: expectedUpdatedAt
    },
    stdio: ["pipe", "pipe", "pipe"]
  })
  let stdout = ""
  let stderr = ""
  let handshake = ""
  let paused = false
  const waitUntilPaused = new Promise((resolve, reject) => {
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString()
      stdout += text
      handshake += text
      const lineEnd = handshake.indexOf("\n")
      if (lineEnd < 0 || paused) return
      const line = handshake.slice(0, lineEnd)
      const match = /^before-rename ([A-Za-z0-9+/=]+)$/.exec(line)
      if (!match) {
        reject(new Error(`Unexpected writer handshake: ${line}`))
        return
      }
      paused = true
      resolve(JSON.parse(Buffer.from(match[1], "base64").toString("utf8")))
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (!paused) reject(new Error(`Writer exited before rename pause (${code}): ${stderr}`))
    })
  })
  child.stderr.on("data", (chunk) => { stderr += chunk })
  const result = new Promise((resolve, reject) => {
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return {
    child,
    waitUntilPaused,
    release: () => child.stdin.end("release\n"),
    result
  }
}

function recoveryControlPaths(directory, name) {
  return {
    startReady: path.join(directory, `${name}-start-ready`),
    startRelease: path.join(directory, `${name}-start-release`),
    generationReady: path.join(directory, `${name}-generation-ready`),
    generationRelease: path.join(directory, `${name}-generation-release`),
    reclaimReady: path.join(directory, `${name}-reclaim-ready`),
    reclaimRelease: path.join(directory, `${name}-reclaim-release`),
    renameReady: path.join(directory, `${name}-rename-ready`),
    renameRelease: path.join(directory, `${name}-rename-release`)
  }
}

function startRecoveryRaceWriterProcess(
  run,
  expectedUpdatedAt,
  authoringRunPath,
  legacyLockPath,
  abandonedClosedPath,
  controls,
  pauseRename
) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalRm = fs.rm",
    "const originalLink = fs.link",
    "const originalRename = fs.rename",
    "const waitForPath = async (target) => {",
    "  for (;;) {",
    "    try { await fs.access(target); return } catch (error) { if (error.code !== 'ENOENT') throw error }",
    "    await new Promise((resolve) => setTimeout(resolve, 5))",
    "  }",
    "}",
    "const main = async () => {",
    "await fs.writeFile(process.env.START_READY_PATH, 'ready\\n')",
    "await waitForPath(process.env.START_RELEASE_PATH)",
    "let attemptedLegacyReclaim = false",
    "let attemptedGenerationRecovery = false",
    "fs.link = async (source, destination) => {",
    "  if (!attemptedGenerationRecovery && destination === process.env.ABANDONED_CLOSED_PATH) {",
    "    attemptedGenerationRecovery = true",
    "    await fs.writeFile(process.env.GENERATION_READY_PATH, 'ready\\n')",
    "    await waitForPath(process.env.GENERATION_RELEASE_PATH)",
    "  }",
    "  return originalLink(source, destination)",
    "}",
    "fs.rm = async (target, ...args) => {",
    "  if (!attemptedLegacyReclaim && target === process.env.LEGACY_LOCK_PATH) {",
    "    attemptedLegacyReclaim = true",
    "    await fs.writeFile(process.env.RECLAIM_READY_PATH, 'ready\\n')",
    "    await waitForPath(process.env.RECLAIM_RELEASE_PATH)",
    "  }",
    "  return originalRm(target, ...args)",
    "}",
    "fs.rename = async (source, destination) => {",
    "  if (attemptedLegacyReclaim && process.env.PAUSE_RENAME === 'true' && destination === process.env.AUTHORING_RUN_PATH) {",
    "    await fs.writeFile(process.env.RENAME_READY_PATH, 'ready\\n')",
    "    await waitForPath(process.env.RENAME_RELEASE_PATH)",
    "  }",
    "  return originalRename(source, destination)",
    "}",
    "const store = require(process.env.STORE_PATH)",
    "const run = JSON.parse(Buffer.from(process.env.RUN_BASE64, 'base64').toString('utf8'))",
    "await store.writeRuleAuthoringRun(run, process.env.EXPECTED_UPDATED_AT)",
    "}",
    "main()",
    "  .then(() => process.stdout.write('ok'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      RUN_BASE64: Buffer.from(JSON.stringify(run), "utf8").toString("base64"),
      EXPECTED_UPDATED_AT: expectedUpdatedAt,
      AUTHORING_RUN_PATH: authoringRunPath,
      LEGACY_LOCK_PATH: legacyLockPath,
      ABANDONED_CLOSED_PATH: abandonedClosedPath,
      START_READY_PATH: controls.startReady,
      START_RELEASE_PATH: controls.startRelease,
      GENERATION_READY_PATH: controls.generationReady,
      GENERATION_RELEASE_PATH: controls.generationRelease,
      RECLAIM_READY_PATH: controls.reclaimReady,
      RECLAIM_RELEASE_PATH: controls.reclaimRelease,
      RENAME_READY_PATH: controls.renameReady,
      RENAME_RELEASE_PATH: controls.renameRelease,
      PAUSE_RENAME: String(pauseRename)
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return { child, result }
}

function runReaddirGlitchWriterProcess(run, expectedUpdatedAt, runDirectory, omittedName) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const originalOpendir = fs.opendir",
    "let injected = false",
    "let targetOpenCount = 0",
    "fs.opendir = async (target, options) => {",
    "  const directory = await originalOpendir(target, options)",
    "  if (target !== process.env.RUN_DIRECTORY) return directory",
    "  targetOpenCount += 1",
    "  if (targetOpenCount !== 2) return directory",
    "  return {",
    "    async *[Symbol.asyncIterator]() {",
    "      for await (const entry of directory) {",
    "        if (!injected && entry.name === process.env.OMITTED_NAME) { injected = true; continue }",
    "        yield entry",
    "      }",
    "    }",
    "  }",
    "}",
    "const store = require(process.env.STORE_PATH)",
    "const run = JSON.parse(Buffer.from(process.env.RUN_BASE64, 'base64').toString('utf8'))",
    "store.writeRuleAuthoringRun(run, process.env.EXPECTED_UPDATED_AT)",
    "  .then(() => process.stdout.write('ok'))",
    "  .catch((error) => { process.stderr.write(error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      RUN_BASE64: Buffer.from(JSON.stringify(run), "utf8").toString("base64"),
      EXPECTED_UPDATED_AT: expectedUpdatedAt,
      RUN_DIRECTORY: runDirectory,
      OMITTED_NAME: omittedName
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  return new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

function runRotatingLockProcess(root, lockDirectory, witnessPath, maxGenerationsPerEpoch) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const store = require(process.env.STORE_PATH)",
    "store.withRuleAuthoringRotatingDirectoryLock(",
    "  process.env.ROOT,",
    "  process.env.LOCK_DIRECTORY,",
    "  async () => {",
    "    let witness",
    "    try {",
    "      witness = await fs.open(process.env.WITNESS_PATH, 'wx', 0o600)",
    "    } catch (error) {",
    "      if (error && error.code === 'EEXIST') throw new Error('rotating lock callbacks overlapped')",
    "      throw error",
    "    }",
    "    try { await new Promise((resolve) => setTimeout(resolve, 20)) }",
    "    finally {",
    "      await witness.close()",
    "      await fs.rm(process.env.WITNESS_PATH, { force: true })",
    "    }",
    "  },",
    "  { maxGenerationsPerEpoch: Number(process.env.MAX_GENERATIONS) }",
    ")",
    "  .catch((error) => { process.stderr.write(error.stack || error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      ROOT: root,
      LOCK_DIRECTORY: lockDirectory,
      WITNESS_PATH: witnessPath,
      MAX_GENERATIONS: String(maxGenerationsPerEpoch)
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
  return { child, result }
}

function startHoldingRotatingLockProcess(root, lockDirectory, readyPath, maxGenerationsPerEpoch) {
  const script = [
    "const fs = require('node:fs/promises')",
    "const store = require(process.env.STORE_PATH)",
    "store.withRuleAuthoringRotatingDirectoryLock(",
    "  process.env.ROOT,",
    "  process.env.LOCK_DIRECTORY,",
    "  async () => {",
    "    await fs.writeFile(process.env.READY_PATH, 'ready', 'utf8')",
    "    setInterval(() => {}, 1_000)",
    "    await new Promise(() => {})",
    "  },",
    "  { maxGenerationsPerEpoch: Number(process.env.MAX_GENERATIONS) }",
    ")",
    "  .catch((error) => { process.stderr.write(error.stack || error.message); process.exitCode = 2 })"
  ].join("\n")
  const child = spawn(process.execPath, ["-e", script], {
    cwd: __dirname,
    env: {
      ...process.env,
      STORE_PATH: require.resolve("../out/ruleAuthoring/ruleAuthoringRunStore"),
      ROOT: root,
      LOCK_DIRECTORY: lockDirectory,
      READY_PATH: readyPath,
      MAX_GENERATIONS: String(maxGenerationsPerEpoch)
    },
    stdio: ["ignore", "pipe", "pipe"]
  })
  const result = new Promise((resolve, reject) => {
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (chunk) => { stdout += chunk })
    child.stderr.on("data", (chunk) => { stderr += chunk })
    child.on("error", reject)
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }))
  })
  return { child, result }
}

async function seedExhaustedDirectoryLock(lockDirectory) {
  await fs.mkdir(lockDirectory, { recursive: true })
  const lockSeed = path.join(lockDirectory, ".lock-seed")
  const closureSeed = path.join(lockDirectory, ".closure-seed")
  const ownerToken = "a".repeat(32)
  await fs.writeFile(lockSeed, `${JSON.stringify({
    schema_version: "bob-bazaar-review/run-lock/v1",
    pid: process.pid,
    token: ownerToken,
    scope_id: "f".repeat(64),
    created_at: "2026-07-14T08:00:00.000Z"
  })}\n`, "utf8")
  await fs.writeFile(closureSeed, `${JSON.stringify({
    schema_version: "bob-bazaar-review/run-lock-closed/v1",
    generation: 10_000,
    owner_token: ownerToken
  })}\n`, "utf8")
  for (let start = 1; start <= 10_000; start += 200) {
    await Promise.all(Array.from({ length: Math.min(200, 10_001 - start) }, async (_, offset) => {
      const generation = String(start + offset).padStart(12, "0")
      await fs.link(lockSeed, path.join(lockDirectory, `.authoring-run.lock.${generation}`))
      await fs.link(closureSeed, path.join(lockDirectory, `.authoring-run.lock.${generation}.closed`))
    }))
  }
}

async function waitForRecoveryMode(firstChild, secondChild, legacyReadyPaths, generationReadyPaths) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const pathStates = async (targets) => Promise.all(targets.map(async (target) => {
      try {
        await fs.access(target)
        return true
      } catch (error) {
        if (error.code === "ENOENT") return false
        throw error
      }
    }))
    if ((await pathStates(legacyReadyPaths)).every(Boolean)) return "legacy"
    if ((await pathStates(generationReadyPaths)).every(Boolean)) return "generation"
    if (firstChild.exitCode !== null || secondChild.exitCode !== null) {
      throw new Error("A recovery writer exited before both reclaimers reached the same generation")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out coordinating simultaneous recovery writers")
}

async function waitForPath(target) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fs.lstat(target)
      return
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for inter-process rule authoring lock")
}

async function waitForCreateReady(target) {
  for (let attempt = 0; attempt < 1_000; attempt += 1) {
    try {
      await fs.lstat(target)
      return
    } catch (error) {
      if (error.code !== "ENOENT") throw error
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out coordinating concurrent run creation")
}

async function waitForValidLock(runDirectory) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entries = await fs.readdir(runDirectory)
    const candidates = entries
      .filter((name) => /^\.authoring-run\.lock\.\d{12}$/.test(name))
      .sort()
      .reverse()
    for (const name of candidates) {
      const target = path.join(runDirectory, name)
      try {
        await fs.access(`${target}.closed`)
        continue
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
      try {
        const parsed = JSON.parse(await fs.readFile(target, "utf8"))
        if (parsed.schema_version === "bob-bazaar-review/run-lock/v1" && Number.isSafeInteger(parsed.pid)) {
          return { path: target, record: parsed }
        }
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for a complete inter-process rule authoring lock")
}

async function waitForOwnerFile(runDirectory, pid) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const names = await fs.readdir(runDirectory)
    const owners = names.filter((name) => (
      name.startsWith(".authoring-run.lock-owner.") &&
      name.endsWith(".owner") &&
      name.includes(`.${pid}.`)
    ))
    for (const owner of owners) {
      const ownerPath = path.join(runDirectory, owner)
      try {
        const parsed = JSON.parse(await fs.readFile(ownerPath, "utf8"))
        if (
          parsed.schema_version === "bob-bazaar-review/run-lock/v1" &&
          parsed.pid === pid &&
          /^[a-f0-9]{32}$/.test(parsed.token) &&
          /^[a-f0-9]{64}$/.test(parsed.scope_id)
        ) {
          return ownerPath
        }
      } catch (error) {
        if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("Timed out waiting for a complete inter-process lock owner file")
}

async function assertNoOpenRunLocks(runDirectory) {
  const entries = await fs.readdir(runDirectory)
  const generations = entries.filter((name) => /^\.authoring-run\.lock\.\d{12}$/.test(name))
  assert.ok(generations.length > 0)
  for (const name of generations) await fs.access(path.join(runDirectory, `${name}.closed`))
}
