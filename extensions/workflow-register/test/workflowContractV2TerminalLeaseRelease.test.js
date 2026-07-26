const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

async function runtimeLease() {
  const fixture = createLockedRawPackage()
  const environment = compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  const { WorkflowPlanStore } = require("../out/core/contractV2/index.js")
  const store = new WorkflowPlanStore()
  const lease = await store.acquire({
    collectionId: "test/collection",
    workflowId: fixture.rawPackage.workflowId,
    rawPackage: fixture.rawPackage,
    environment
  })
  return { lease }
}

function temporaryRunStore(t) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-terminal-release-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const { ContractV2GuardedRunStateStore } = require("../out/workflowContractV2RunStateStore.js")
  return new ContractV2GuardedRunStateStore({
    workspaceRoot,
    now: () => "2026-07-26T00:00:00.000Z",
    engineVersion: "test-engine"
  })
}

test("terminal durable save retains the lease through post-save hooks and the coordinator releases afterward", async (t) => {
  const { lease } = await runtimeLease()
  const runStore = temporaryRunStore(t)
  const provenance = require("../out/core/contractV2/runPlanProvenance.js")
  const { coordinateWorkflowRunExecution } = require("../out/core/engine/runExecutionCoordinator.js")
  t.after(() => provenance.releaseAllWorkflowContractV2RunPlanLeases())

  let run
  await provenance.runWithWorkflowContractV2PlanLease(lease, async () => {
    run = await runStore.createRun({ id: "ignored-by-v2-context" }, {})
    await runStore.saveRun(run)
  })
  assert.equal(lease.released, false)

  let hookObservedLease = false
  const terminal = await coordinateWorkflowRunExecution(runStore, run.runId, "terminal-with-hook", async () => {
    const loaded = await runStore.loadRun(run.runId)
    assert.ok(loaded)
    loaded.status = "completed"
    await runStore.saveRun(loaded)

    assert.strictEqual(provenance.requireWorkflowContractV2RunPlanLease(loaded), lease)
    hookObservedLease = true
    return loaded
  })

  assert.equal(terminal.status, "completed")
  assert.equal(hookObservedLease, true)
  assert.equal(lease.released, true)
  assert.throws(
    () => provenance.requireWorkflowContractV2RunPlanLease(terminal),
    /unavailable|released/i
  )
})
