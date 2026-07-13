const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function leaseModules() {
  return require("../out/core/runtime/runCleanupLease")
}

function lockModules() {
  return require("../out/core/runtime/runLock")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-cleanup-lease-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, ".bob", "workflows", "runs", "run-a"), { recursive: true })
  await fs.writeFile(path.join(root, ".bob", "workflows", "runs", "run-a", "run.json"), "{}")
  return root
}

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

test("cleanup lease safely reclaims a stale dead-owner lease", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const directory = path.join(root, ".bob", "workflows", "runs", ".cleanup-leases")
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

test("workflow execution lock waits for cleanup lease and fails closed on timeout", async (t) => {
  const root = await workspace(t)
  const { withWorkflowRunCleanupLeases } = leaseModules()
  const { withWorkflowRunLock } = lockModules()
  let releaseOwner
  const hold = new Promise((resolve) => { releaseOwner = resolve })
  let entered
  const enteredPromise = new Promise((resolve) => { entered = resolve })
  const cleanup = withWorkflowRunCleanupLeases(root, ["run-a"], async () => {
    entered()
    await hold
  }, { token: () => "cleanup-token", hostname: "test-host" })

  await enteredPromise
  await assert.rejects(
    withWorkflowRunLock(root, "run-a", async () => "must-not-run", {
      timeoutMs: 10,
      pollMs: 1,
      heartbeatMs: 0,
      sleep: async () => undefined
    }),
    /cleanup|reserved|busy/i
  )
  releaseOwner()
  await cleanup
})
