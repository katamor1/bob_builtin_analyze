const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function modules() {
  return require("../out/core/runtime/runRetentionService")
}

function cleanupModules() {
  return require("../out/core/runtime/runCleanupTransaction")
}

function pathModules() {
  return require("../out/core/runtime/runStatePath")
}

function storeModules() {
  return require("../out/core/runStateStore")
}

function durabilityModules() {
  return require("../out/core/runtime/runDurabilityPath")
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

function withTimeout(promise, label, timeoutMs = 10_000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out waiting for ${label} after ${timeoutMs}ms.`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-service-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, ".bob", "workflows", "runs"), { recursive: true })
  return root
}

async function writeRun(root, runId, overrides = {}) {
  const directory = path.join(root, ".bob", "workflows", "runs", runId)
  await fs.mkdir(directory)
  const run = {
    schemaVersion: "workflow-register/run-state/v1",
    runId,
    workflowId: "retention.test",
    workflowName: "Retention Test",
    workflowSchemaVersion: "workflow-register/v1",
    status: "completed",
    inputs: {},
    state: {},
    steps: [{ id: "collect", title: "Collect", type: "manual", status: "completed" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  }
  await fs.writeFile(path.join(directory, "run.json"), JSON.stringify(run, null, 2) + "\n")
  return { run, directory }
}

async function optionalBytes(filePath) {
  try {
    return await fs.readFile(filePath)
  } catch (error) {
    if (error.code === "ENOENT") return undefined
    throw error
  }
}

async function sumFileSizes(filePaths) {
  const stats = await Promise.all(filePaths.map((filePath) => fs.stat(filePath)))
  return stats.reduce((sum, stat) => sum + stat.size, 0)
}

async function replaceRunDirectoryWithExternalAlias(t, directory, files) {
  const outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-external-"))
  const parkedDirectory = `${directory}-parked`
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(outsideRoot, name), content)
  }
  try {
    await fs.rename(directory, parkedDirectory)
    await fs.symlink(outsideRoot, directory, process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    await fs.rename(parkedDirectory, directory).catch(() => undefined)
    await fs.rm(outsideRoot, { recursive: true, force: true })
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`directory alias unavailable: ${error.code}`)
      return undefined
    }
    throw error
  }
  t.after(() => fs.rm(outsideRoot, { recursive: true, force: true }))
  return { outsideRoot, parkedDirectory }
}

test("inventory protects referenced source runs and malformed pin sidecars", async (t) => {
  const root = await workspace(t)
  const source = await writeRun(root, "source-run")
  const target = await writeRun(root, "target-run", {
    state: {
      "workflow.artifactReuse": JSON.stringify({
        schemaVersion: "workflow-register/artifact-reuse/v1",
        sourceRunId: "source-run",
        reusedStepIds: ["collect"],
        hydratedKeys: []
      })
    }
  })
  await fs.writeFile(path.join(target.directory, "retention.json"), "not-json")

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T00:00:00.000Z" })
  const inventory = await service.inventory()
  const sourceItem = inventory.find((item) => item.runId === source.run.runId)
  const targetItem = inventory.find((item) => item.runId === target.run.runId)
  assert.deepEqual(sourceItem.referencedBy, ["target-run"])
  assert.equal(targetItem.pinned, true)

  const plan = await service.preview({ completedDays: 1 })
  assert.deepEqual(plan.candidateRunIds, [])
  assert.match(plan.decisions.find((item) => item.runId === "source-run").blockers.join(" "), /referenced-by/)
  assert.match(plan.decisions.find((item) => item.runId === "target-run").blockers.join(" "), /pinned/)
})

test("pin sidecar is independent from run.json and stale preview is rejected", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "old-run")
  const before = await fs.readFile(path.join(directory, "run.json"), "utf8")
  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T00:00:00.000Z" })
  const plan = await service.preview({ completedDays: 1 })
  assert.deepEqual(plan.candidateRunIds, ["old-run"])

  await service.setPinned("old-run", true, "changed after preview")
  assert.equal(await fs.readFile(path.join(directory, "run.json"), "utf8"), before)
  await assert.rejects(service.apply(plan), /inventory changed after preview/i)
  assert.equal((await fs.stat(directory)).isDirectory(), true)
})

test("setPinned recovers a pending journal inside its owned run lock", async (t) => {
  const root = await workspace(t)
  const { directory, run } = await writeRun(root, "journal-pin-run")
  const { FileRunStateStore } = storeModules()
  const crashing = new FileRunStateStore({
    workspaceRoot: root,
    now: () => "2026-07-13T00:30:00.000Z",
    lockOptions: { heartbeatMs: 0, timeoutMs: 2_000 },
    durabilityFault: (stage) => {
      if (stage === "afterJournal") throw new Error("crash:afterJournal")
    }
  })
  const pending = await withTimeout(crashing.loadRun(run.runId), "pending-journal source load")
  pending.state.recoveredByPin = "journal-value"
  await assert.rejects(
    withTimeout(crashing.saveRun(pending), "pending-journal crash injection"),
    /crash:afterJournal/
  )
  const journalFile = path.join(directory, "run-state.journal.json")
  assert.equal((await fs.stat(journalFile)).isFile(), true)

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T01:00:00.000Z" })
  await withTimeout(service.setPinned(run.runId, true, "recover before pin"), "pending-journal pin")

  const recovered = await withTimeout(
    new FileRunStateStore({ workspaceRoot: root, lockOptions: { heartbeatMs: 0, timeoutMs: 2_000 } }).loadRun(run.runId),
    "recovered run load"
  )
  assert.equal(recovered.state.recoveredByPin, "journal-value")
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, "retention.json"), "utf8")).pinned, true)
  await assert.rejects(fs.access(journalFile), { code: "ENOENT" })
})

test("cleanup lease acquired first prevents pin metadata mutation", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "cleanup-first-run")
  const retentionFile = path.join(directory, "retention.json")
  const originalRetention = `${JSON.stringify({
    schemaVersion: "workflow-register/run-retention/v1",
    pinned: false,
    updatedAt: "2026-07-13T00:00:00.000Z"
  }, null, 2)}\n`
  await fs.writeFile(retentionFile, originalRetention)
  const runBytes = await fs.readFile(path.join(directory, "run.json"))
  const revision = `sha256:${crypto.createHash("sha256").update(runBytes).digest("hex")}`
  const cleanupAtMove = deferred()
  const allowCleanupMove = deferred()
  const fsOps = {
    mkdir: fs.mkdir,
    lstat: fs.lstat,
    realpath: fs.realpath,
    rename: async (source, target) => {
      if (path.resolve(String(source)) === path.resolve(directory)) {
        cleanupAtMove.resolve()
        await withTimeout(allowCleanupMove.promise, "cleanup move release")
      }
      return fs.rename(source, target)
    },
    rm: fs.rm,
    readdir: fs.readdir
  }
  const { applyWorkflowRunCleanupTransaction } = cleanupModules()
  const cleanup = withTimeout(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [{ runId: "cleanup-first-run", revision }],
    transactionId: "cleanup-first-pin",
    fsOps
  }), "cleanup-first transaction")
  await withTimeout(cleanupAtMove.promise, "cleanup move barrier")

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T01:00:00.000Z" })
  const durability = durabilityModules()
  const originalDirectoryPresent = durability.runDurabilityDirectoryPresent
  const pinDirectoryObserved = deferred()
  durability.runDurabilityDirectoryPresent = async (...args) => {
    const present = await originalDirectoryPresent(...args)
    if (args[1] === "cleanup-first-run") pinDirectoryObserved.resolve(present)
    return present
  }
  let pin
  let barrierError
  try {
    pin = settle(withTimeout(service.setPinned("cleanup-first-run", true, "must not commit"), "cleanup-first pin"))
    const first = await withTimeout(Promise.race([
      pinDirectoryObserved.promise.then((present) => ({ kind: "directory", present })),
      pin.then((outcome) => ({ kind: "settled", outcome }))
    ]), "pin lock entry")
    assert.equal(first.kind, "directory", "pin must enter lock acquisition while the run still exists")
    assert.equal(first.present, true)
    assert.equal(await fs.readFile(retentionFile, "utf8"), originalRetention)
  } catch (error) {
    barrierError = error
  } finally {
    durability.runDurabilityDirectoryPresent = originalDirectoryPresent
    allowCleanupMove.resolve()
  }

  const cleanupOutcome = await settle(cleanup)
  const pinOutcome = await pin
  if (barrierError) throw barrierError
  if (cleanupOutcome.status === "rejected") {
    assert.match(String(cleanupOutcome.reason), /EISDIR|path is a directory/i)
  }
  assert.equal(pinOutcome.status, "rejected")
  await assert.rejects(fs.access(retentionFile), { code: "ENOENT" })
  await assert.rejects(fs.access(path.join(directory, "run.json")), { code: "ENOENT" })
  await assert.rejects(fs.access(directory), { code: "ENOENT" })
})

test("cleanup completed before a stale pin starts does not recreate the run directory", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "cleanup-complete-pin-run")
  const runBytes = await fs.readFile(path.join(directory, "run.json"))
  const revision = `sha256:${crypto.createHash("sha256").update(runBytes).digest("hex")}`
  const { applyWorkflowRunCleanupTransaction } = cleanupModules()
  const cleanupOutcome = await settle(withTimeout(applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [{ runId: "cleanup-complete-pin-run", revision }],
    transactionId: "cleanup-complete-before-pin"
  }), "cleanup-complete pin transaction"))
  if (cleanupOutcome.status === "rejected") {
    assert.match(String(cleanupOutcome.reason), /EISDIR|path is a directory/i)
  }
  await assert.rejects(fs.access(directory), { code: "ENOENT" })

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T01:30:00.000Z" })
  const pinOutcome = await settle(withTimeout(
    service.setPinned("cleanup-complete-pin-run", true, "stale pin must fail closed"),
    "cleanup-complete stale pin"
  ))

  assert.equal(pinOutcome.status, "rejected")
  await assert.rejects(fs.access(directory), { code: "ENOENT" })
})

test("pin metadata committed first keeps cleanup out until the run lock releases", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "pin-first-run")
  const runBytes = await fs.readFile(path.join(directory, "run.json"))
  const revision = `sha256:${crypto.createHash("sha256").update(runBytes).digest("hex")}`
  const retentionFile = path.join(directory, "retention.json")
  const committed = deferred()
  const releasePin = deferred()
  const originalRename = fs.rename
  fs.rename = async (source, target) => {
    const result = await originalRename(source, target)
    if (path.resolve(String(target)) === path.resolve(retentionFile)) {
      committed.resolve()
      await withTimeout(releasePin.promise, "pin metadata release")
    }
    return result
  }
  const { WorkflowRunRetentionService } = modules()
  const { applyWorkflowRunCleanupTransaction } = cleanupModules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T02:00:00.000Z" })
  const pin = settle(withTimeout(service.setPinned("pin-first-run", true, "pin wins"), "pin-first mutation"))
  let cleanupOutcome
  try {
    await withTimeout(committed.promise, "pin metadata commit")
    cleanupOutcome = await settle(withTimeout(applyWorkflowRunCleanupTransaction({
      workspaceRoot: root,
      candidates: [{ runId: "pin-first-run", revision }],
      transactionId: "pin-first-cleanup"
    }), "pin-first cleanup"))
  } finally {
    releasePin.resolve()
    fs.rename = originalRename
  }
  const pinOutcome = await pin

  assert.equal(pinOutcome.status, "fulfilled")
  assert.equal(cleanupOutcome.status, "rejected")
  assert.equal((await fs.stat(directory)).isDirectory(), true)
  assert.match(String(cleanupOutcome.reason), /execution lock|run lock|locked|busy/i)
  assert.equal(JSON.parse(await fs.readFile(retentionFile, "utf8")).pinned, true)
})

test("contained retention read rejects a parent directory swapped to an outside alias", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "retention-read-swap")
  const retentionFile = path.join(directory, "retention.json")
  const externalRetention = `${JSON.stringify({
    schemaVersion: "workflow-register/run-retention/v1",
    pinned: false,
    updatedAt: "2026-07-13T00:00:00.000Z"
  }, null, 2)}\n`
  await fs.writeFile(retentionFile, externalRetention)
  const originalLstat = fs.lstat
  let swapped = false
  let escaped
  fs.lstat = async (target, ...args) => {
    if (!swapped && path.resolve(String(target)) === path.resolve(retentionFile)) {
      swapped = true
      escaped = await replaceRunDirectoryWithExternalAlias(t, directory, {
        "run.json": await fs.readFile(path.join(directory, "run.json")),
        "retention.json": externalRetention
      })
    }
    return originalLstat(target, ...args)
  }
  let outcome
  try {
    const { readContainedRunFile } = pathModules()
    outcome = await settle(readContainedRunFile(root, "retention-read-swap", "retention.json"))
  } finally {
    fs.lstat = originalLstat
  }
  if (!escaped && swapped) return

  assert.equal(swapped, true, "retention read must reach contained parent verification")
  assert.equal(outcome.status, "rejected")
  assert.match(String(outcome.reason), /workspace|outside|symlink|junction|alias|direct|changed|identity/i)
  assert.equal(await fs.readFile(path.join(escaped.outsideRoot, "retention.json"), "utf8"), externalRetention)
})

test("contained retention write rejects a parent swap without mutating the outside target", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "retention-write-swap")
  const retentionFile = path.join(directory, "retention.json")
  const externalRetention = `${JSON.stringify({
    schemaVersion: "workflow-register/run-retention/v1",
    pinned: false,
    updatedAt: "2026-07-13T00:00:00.000Z"
  }, null, 2)}\n`
  await fs.writeFile(retentionFile, externalRetention)
  const replacement = `${JSON.stringify({
    schemaVersion: "workflow-register/run-retention/v1",
    pinned: true,
    updatedAt: "2026-07-13T03:00:00.000Z"
  }, null, 2)}\n`
  const originalOpen = fs.open
  const originalWriteFile = fs.writeFile
  let swapped = false
  let escaped
  const swapBeforeTempWrite = async (target) => {
    if (swapped || !String(target).endsWith(".tmp")) return
    swapped = true
    escaped = await replaceRunDirectoryWithExternalAlias(t, directory, {
      "run.json": await fs.readFile(path.join(directory, "run.json")),
      "retention.json": externalRetention
    })
  }
  fs.open = async (target, ...args) => {
    await swapBeforeTempWrite(target)
    return originalOpen(target, ...args)
  }
  fs.writeFile = async (target, ...args) => {
    await swapBeforeTempWrite(target)
    return originalWriteFile(target, ...args)
  }
  let outcome
  try {
    const { writeContainedRunFile } = pathModules()
    outcome = await settle(writeContainedRunFile(root, "retention-write-swap", replacement, "retention.json"))
  } finally {
    fs.open = originalOpen
    fs.writeFile = originalWriteFile
  }
  if (!escaped && swapped) return

  assert.equal(swapped, true, "retention write must use the contained atomic path")
  assert.equal(outcome.status, "rejected")
  assert.match(String(outcome.reason), /workspace|outside|symlink|junction|alias|direct|changed|identity/i)
  assert.equal(await fs.readFile(path.join(escaped.outsideRoot, "retention.json"), "utf8"), externalRetention)
})

test("storage summary reports counts and bytes without body values", async (t) => {
  const root = await workspace(t)
  await writeRun(root, "completed-run")
  await writeRun(root, "held-run", {
    status: "held",
    currentStep: "collect",
    steps: [{ id: "collect", title: "Collect", type: "manual", status: "held" }],
    state: { private: "secret body value" }
  })
  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const summary = await service.summarize()
  assert.equal(summary.runCount, 2)
  assert.equal(summary.terminalRunCount, 1)
  assert.equal(summary.recoverableRunCount, 1)
  assert.equal(JSON.stringify(summary).includes("secret body value"), false)
})

test("cleanup preview leaves legacy run state and pending journal byte-for-byte unchanged", async (t) => {
  const root = await workspace(t)
  const legacy = await writeRun(root, "legacy-preview", { schemaVersion: undefined })
  const journaled = await writeRun(root, "journal-preview")
  const { FileRunStateStore } = storeModules()
  const crashing = new FileRunStateStore({
    workspaceRoot: root,
    now: () => "2026-07-13T02:00:00.000Z",
    lockOptions: { heartbeatMs: 0, timeoutMs: 2_000 },
    durabilityFault: (stage) => {
      if (stage === "afterJournal") throw new Error("crash:afterJournal")
    }
  })
  const pending = await crashing.loadRun(journaled.run.runId)
  pending.state.private = "pending journal body"
  await assert.rejects(crashing.saveRun(pending), /crash:afterJournal/)

  const legacyFile = path.join(legacy.directory, "run.json")
  const journalRunFile = path.join(journaled.directory, "run.json")
  const journalFile = path.join(journaled.directory, "run-state.journal.json")
  const before = {
    legacy: await fs.readFile(legacyFile),
    run: await fs.readFile(journalRunFile),
    journal: await fs.readFile(journalFile)
  }
  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T03:00:00.000Z" })

  await service.preview({ completedDays: 1 })

  assert.deepEqual(await optionalBytes(legacyFile), before.legacy)
  assert.deepEqual(await optionalBytes(journalRunFile), before.run)
  assert.deepEqual(await optionalBytes(journalFile), before.journal)
})

test("a pending provenance journal makes the whole reference graph incomplete without recovery", async (t) => {
  const root = await workspace(t)
  await writeRun(root, "pending-source")
  const target = await writeRun(root, "pending-target")
  const { FileRunStateStore } = storeModules()
  const crashing = new FileRunStateStore({
    workspaceRoot: root,
    now: () => "2026-07-13T02:00:00.000Z",
    lockOptions: { heartbeatMs: 0, timeoutMs: 2_000 },
    durabilityFault: (stage) => {
      if (stage === "afterJournal") throw new Error("crash:afterJournal")
    }
  })
  const pending = await crashing.loadRun(target.run.runId)
  pending.state["workflow.artifactReuse"] = JSON.stringify({
    schemaVersion: "workflow-register/artifact-reuse/v1",
    sourceRunId: "pending-source",
    sourceWorkflowId: "retention.test",
    startStepId: "collect",
    reusedStepIds: ["collect"],
    hydratedKeys: [],
    createdAt: "2026-07-13T02:00:00.000Z"
  })
  await assert.rejects(crashing.saveRun(pending), /crash:afterJournal/)
  const runFile = path.join(target.directory, "run.json")
  const journalFile = path.join(target.directory, "run-state.journal.json")
  const beforeRun = await fs.readFile(runFile)
  const beforeJournal = await fs.readFile(journalFile)

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T03:00:00.000Z" })
  const inspection = await service.inspect()
  const plan = await service.preview({ completedDays: 1 })

  assert.equal(inspection.referenceGraphComplete, false)
  assert.deepEqual(plan.candidateRunIds, [])
  assert.match(
    plan.decisions.find((decision) => decision.runId === "pending-source").blockers.join(" "),
    /reference-graph-incomplete/
  )
  assert.deepEqual(await fs.readFile(runFile), beforeRun)
  assert.deepEqual(await fs.readFile(journalFile), beforeJournal)
})

test("malformed stored provenance makes the reference graph incomplete without leaking its body", async (t) => {
  const root = await workspace(t)
  await writeRun(root, "malformed-source")
  await writeRun(root, "malformed-target", {
    state: { "workflow.artifactReuse": "not-json PROVENANCE_BODY_SECRET" }
  })
  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T03:00:00.000Z" })

  const inspection = await service.inspect()
  const plan = await service.preview({ completedDays: 1 })

  assert.equal(inspection.referenceGraphComplete, false)
  assert.deepEqual(plan.candidateRunIds, [])
  assert.equal(JSON.stringify(inspection).includes("PROVENANCE_BODY_SECRET"), false)
})

test("physical inventory counts invalid missing future and unknown entries and blocks all cleanup", async (t) => {
  const root = await workspace(t)
  const runsRoot = path.join(root, ".bob", "workflows", "runs")
  const valid = await writeRun(root, "valid-old")
  const future = await writeRun(root, "future-old", { schemaVersion: "workflow-register/run-state/v2" })
  const invalidDirectory = path.join(runsRoot, "invalid-old")
  const missingDirectory = path.join(runsRoot, "missing-old")
  await fs.mkdir(invalidDirectory)
  await fs.mkdir(missingDirectory)
  const invalidRunFile = path.join(invalidDirectory, "run.json")
  const invalidPayloadFile = path.join(invalidDirectory, "payload.bin")
  const missingPayloadFile = path.join(missingDirectory, "payload.bin")
  await fs.writeFile(invalidRunFile, "not-json DECODE_PAYLOAD_SECRET")
  await fs.writeFile(invalidPayloadFile, "invalid-payload")
  await fs.writeFile(missingPayloadFile, "missing-payload")
  const unsafeName = `unsafe ${"x".repeat(180)}`
  const unsafeFile = path.join(runsRoot, unsafeName)
  await fs.writeFile(unsafeFile, "unknown-entry-bytes")
  const expectedBytes = await sumFileSizes([
    path.join(valid.directory, "run.json"),
    path.join(future.directory, "run.json"),
    invalidRunFile,
    invalidPayloadFile,
    missingPayloadFile,
    unsafeFile
  ])

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T03:00:00.000Z" })
  const inspection = await service.inspect()

  assert.equal(inspection.summary.runCount, 5)
  assert.equal(inspection.summary.totalBytes, expectedBytes)
  assert.equal(inspection.summary.terminalRunCount, 2)
  assert.equal(inspection.summary.unknownRunCount, 3)
  assert.equal(inspection.summary.referenceGraphComplete, false)
  assert.equal(inspection.referenceGraphComplete, false)
  const validItem = inspection.inventory.find((item) => item.runId === "valid-old")
  assert.equal(validItem.inspectionStatus, "valid")
  assert.equal(validItem.retentionRevision, "missing")
  assert.match(validItem.treeFingerprint, /^sha256:[a-f0-9]{64}$/)
  assert.match(validItem.directoryIdentity.dev, /^\d+$/)
  assert.match(validItem.directoryIdentity.ino, /^\d+$/)
  assert.equal(validItem.measurementComplete, true)
  assert.equal(inspection.inventory.find((item) => item.runId === "future-old").inspectionStatus, "future")
  assert.equal(inspection.inventory.find((item) => item.runId === "invalid-old").inspectionStatus, "invalid")
  assert.equal(inspection.inventory.find((item) => item.runId === "missing-old").inspectionStatus, "missing")
  const unsafe = inspection.inventory.find((item) => item.inspectionStatus === "unsafe")
  assert.ok(unsafe)
  assert.ok(unsafe.runId.length <= 100)
  assert.doesNotMatch(unsafe.runId, /[\u0000-\u001f\u007f]/)
  assert.match(unsafe.runId, /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/)
  assert.equal(JSON.stringify(inspection).includes("DECODE_PAYLOAD_SECRET"), false)

  const plan = await service.preview({ completedDays: 1 })
  assert.equal(plan.totalBytes, expectedBytes)
  assert.deepEqual(plan.candidateRunIds, [])
  assert.match(
    plan.decisions.find((decision) => decision.runId === "valid-old").blockers.join(" "),
    /reference-graph-incomplete/
  )
  assert.match(
    plan.decisions.find((decision) => decision.runId === "future-old").blockers.join(" "),
    /read-only/
  )
  assert.equal(plan.decisions.find((decision) => decision.runId === "valid-old").treeFingerprint, validItem.treeFingerprint)
  assert.deepEqual(plan.decisions.find((decision) => decision.runId === "valid-old").directoryIdentity, validItem.directoryIdentity)
  assert.equal(plan.decisions.find((decision) => decision.runId === "valid-old").retentionRevision, "missing")
  const unsafeSelection = await service.preview({ selectedRunIds: [unsafe.runId] })
  assert.deepEqual(unsafeSelection.candidateRunIds, [])
  assert.deepEqual(await service.apply(plan), { removedRunIds: [], reclaimedBytes: 0 })
  assert.equal((await fs.stat(valid.directory)).isDirectory(), true)
  assert.equal((await fs.stat(invalidDirectory)).isDirectory(), true)
  assert.equal((await fs.stat(missingDirectory)).isDirectory(), true)
  assert.equal((await fs.stat(unsafeFile)).isFile(), true)
})

test("inventory never follows an external directory alias and keeps known contained bytes", async (t) => {
  const root = await workspace(t)
  const run = await writeRun(root, "aliased-tree")
  const localFile = path.join(run.directory, "local.bin")
  await fs.writeFile(localFile, "known-local-bytes")
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-outside-"))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  const outsideFile = path.join(outside, "outside-secret.bin")
  await fs.writeFile(outsideFile, "outside-secret-body-that-must-not-be-counted")
  const alias = path.join(run.directory, "external")
  try {
    await fs.symlink(outside, alias, process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`directory alias unavailable: ${error.code}`)
      return
    }
    throw error
  }
  const expectedBytes = await sumFileSizes([path.join(run.directory, "run.json"), localFile])

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T03:00:00.000Z" })
  const inspection = await service.inspect()
  const item = inspection.inventory.find((entry) => entry.runId === run.run.runId)

  assert.equal(item.bytes, expectedBytes)
  assert.equal(item.measurementComplete, false)
  assert.equal(item.pathContained, false)
  assert.equal(JSON.stringify(inspection).includes("outside-secret-body"), false)
  const plan = await service.preview({ completedDays: 1 })
  assert.deepEqual(plan.candidateRunIds, [])
  assert.match(plan.decisions[0].blockers.join(" "), /measurement-incomplete|path-not-contained/)
})

test("inventory fails closed when the physical runs root changes during enumeration", async (t) => {
  const root = await workspace(t)
  await writeRun(root, "enumerated-run")
  const runsRoot = path.join(root, ".bob", "workflows", "runs")
  const originalReaddir = fs.readdir
  let changed = false
  fs.readdir = async (target, ...args) => {
    const entries = await originalReaddir(target, ...args)
    if (!changed && path.resolve(String(target)) === path.resolve(runsRoot)) {
      changed = true
      await writeRun(root, "late-run")
      const future = new Date(Date.now() + 5_000)
      await fs.utimes(runsRoot, future, future)
    }
    return entries
  }
  let inspection
  try {
    const { WorkflowRunRetentionService } = modules()
    inspection = await new WorkflowRunRetentionService({ workspaceRoot: root }).inspect()
  } finally {
    fs.readdir = originalReaddir
  }

  assert.equal(changed, true)
  assert.equal(inspection.referenceGraphComplete, false)
  assert.ok(inspection.inventory.every((item) => !item.measurementComplete && !item.pathContained))
})

test("a non-directory runs root is represented as an unsafe counted inventory item", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-root-file-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const workflowsRoot = path.join(root, ".bob", "workflows")
  await fs.mkdir(workflowsRoot, { recursive: true })
  const runsRoot = path.join(workflowsRoot, "runs")
  const content = "runs-root-file-bytes"
  await fs.writeFile(runsRoot, content)

  const { WorkflowRunRetentionService } = modules()
  const inspection = await new WorkflowRunRetentionService({ workspaceRoot: root }).inspect()

  assert.equal(inspection.summary.runCount, 1)
  assert.equal(inspection.summary.totalBytes, Buffer.byteLength(content))
  assert.equal(inspection.summary.referenceGraphComplete, false)
  assert.equal(inspection.inventory[0].inspectionStatus, "unsafe")
  assert.equal(inspection.inventory[0].pathContained, false)
})

test("a missing runs root behind an aliased parent remains fail closed", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-parent-alias-"))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-parent-outside-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  t.after(() => fs.rm(outside, { recursive: true, force: true }))
  try {
    await fs.symlink(outside, path.join(root, ".bob"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP", "UNKNOWN"].includes(error.code)) {
      t.skip(`directory alias unavailable: ${error.code}`)
      return
    }
    throw error
  }

  const { WorkflowRunRetentionService } = modules()
  const inspection = await new WorkflowRunRetentionService({ workspaceRoot: root }).inspect()

  assert.equal(inspection.referenceGraphComplete, false)
  assert.equal(inspection.summary.runCount, 1)
  assert.equal(inspection.inventory[0].inspectionStatus, "unsafe")
})
