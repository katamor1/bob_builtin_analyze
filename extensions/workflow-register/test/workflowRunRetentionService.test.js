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
        await allowCleanupMove.promise
      }
      return fs.rename(source, target)
    },
    rm: fs.rm,
    readdir: fs.readdir
  }
  const { applyWorkflowRunCleanupTransaction } = cleanupModules()
  const cleanup = applyWorkflowRunCleanupTransaction({
    workspaceRoot: root,
    candidates: [{ runId: "cleanup-first-run", revision }],
    transactionId: "cleanup-first-pin",
    fsOps
  })
  await cleanupAtMove.promise

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T01:00:00.000Z" })
  const pin = settle(service.setPinned("cleanup-first-run", true, "must not commit"))
  let barrierError
  try {
    const first = await Promise.race([
      pin.then((outcome) => ({ kind: "settled", outcome })),
      delay(100).then(() => ({ kind: "pending" }))
    ])
    assert.equal(first.kind, "pending", "pin mutation must wait behind the cleanup lease")
    assert.equal(await fs.readFile(retentionFile, "utf8"), originalRetention)
  } catch (error) {
    barrierError = error
  } finally {
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
      await releasePin.promise
    }
    return result
  }
  const { WorkflowRunRetentionService } = modules()
  const { applyWorkflowRunCleanupTransaction } = cleanupModules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T02:00:00.000Z" })
  const pin = settle(service.setPinned("pin-first-run", true, "pin wins"))
  let cleanupOutcome
  try {
    await committed.promise
    cleanupOutcome = await settle(applyWorkflowRunCleanupTransaction({
      workspaceRoot: root,
      candidates: [{ runId: "pin-first-run", revision }],
      transactionId: "pin-first-cleanup"
    }))
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
