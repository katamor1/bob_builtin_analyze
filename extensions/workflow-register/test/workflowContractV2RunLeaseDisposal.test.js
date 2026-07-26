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

test("process disposal releases every live Contract v2 run plan lease", async (t) => {
  const fixture = createLockedRawPackage()
  const environment = compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  const { WorkflowPlanStore } = require("../out/core/contractV2/index.js")
  const subject = require("../out/core/contractV2/runPlanProvenance.js")
  const { ContractV2GuardedRunStateStore } = require("../out/workflowContractV2RunStateStore.js")
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-run-dispose-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const runStore = new ContractV2GuardedRunStateStore({ workspaceRoot })
  const store = new WorkflowPlanStore()
  const leases = await Promise.all(["a", "b"].map(async (collectionId) => {
    const lease = await store.acquire({
      collectionId,
      workflowId: fixture.rawPackage.workflowId,
      rawPackage: fixture.rawPackage,
      environment
    })
    await subject.runWithWorkflowContractV2PlanLease(lease, async () => {
      const run = await runStore.createRunFromPlanLease(lease, { collectionId })
      await runStore.saveRun(run)
    })
    return lease
  }))

  assert.deepEqual(leases.map((lease) => lease.released), [false, false])
  subject.releaseAllWorkflowContractV2RunPlanLeases()
  assert.deepEqual(leases.map((lease) => lease.released), [true, true])
  subject.releaseAllWorkflowContractV2RunPlanLeases()
  assert.deepEqual(leases.map((lease) => lease.released), [true, true])
})
