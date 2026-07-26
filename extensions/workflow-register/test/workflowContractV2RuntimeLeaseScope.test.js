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
  return { fixture, lease, store }
}

function temporaryRunStore(t) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-runtime-lease-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const { ContractV2GuardedRunStateStore } = require("../out/workflowContractV2RunStateStore.js")
  return new ContractV2GuardedRunStateStore({
    workspaceRoot,
    now: () => "2026-07-26T00:00:00.000Z",
    engineVersion: "test-engine"
  })
}

function subject() {
  return require("../out/workflowContractV2RuntimeBoundary.js")
}

test("runtime boundary leaves a legacy operation outside Contract v2 lease ownership", async () => {
  let legacyCalls = 0
  let compiledCalls = 0
  const result = await subject().executeWorkflowContractV2RuntimeBoundary({
    acquireLease: async () => undefined,
    legacyOperation: async () => {
      legacyCalls += 1
      return "legacy-result"
    },
    compiledOperation: async () => {
      compiledCalls += 1
      return "compiled-result"
    }
  })

  assert.equal(result, "legacy-result")
  assert.equal(legacyCalls, 1)
  assert.equal(compiledCalls, 0)
})

test("runtime boundary rejects an unimplemented compiled executor without falling back and releases the lease", async (t) => {
  const { lease } = await runtimeLease()
  t.after(() => lease.release())
  let legacyCalls = 0

  await assert.rejects(
    () => subject().executeWorkflowContractV2RuntimeBoundary({
      acquireLease: async () => lease,
      legacyOperation: async () => {
        legacyCalls += 1
        return "legacy-result"
      }
    }),
    /compiled runtime execution is not enabled/i
  )

  assert.equal(legacyCalls, 0)
  assert.equal(lease.released, true)
})

test("runtime boundary exposes one exact lease through run creation and retains it after durable adoption", async (t) => {
  const { lease } = await runtimeLease()
  const runStore = temporaryRunStore(t)
  const provenance = require("../out/core/contractV2/runPlanProvenance.js")
  t.after(() => provenance.releaseAllWorkflowContractV2RunPlanLeases())
  let legacyCalls = 0

  const run = await subject().executeWorkflowContractV2RuntimeBoundary({
    acquireLease: async () => lease,
    legacyOperation: async () => {
      legacyCalls += 1
      throw new Error("legacy fallback")
    },
    compiledOperation: async (activeLease) => {
      assert.strictEqual(activeLease, lease)
      assert.strictEqual(provenance.currentWorkflowContractV2PlanLease(), lease)
      const created = await runStore.createRun({ id: "ignored-by-v2-context" }, { sample: "input" })
      await runStore.saveRun(created)
      return created
    }
  })

  assert.equal(legacyCalls, 0)
  assert.equal(run.workflowSchemaVersion, "workflow-register/v2")
  assert.equal(run.workflowDefinitionHash, lease.planDigest)
  assert.deepEqual(run.planProvenance, provenance.createWorkflowContractV2RunPlanProvenance(lease))
  assert.equal(lease.released, false)
})

test("a nested runtime boundary releases a newly acquired lease that conflicts with the active scope", async (t) => {
  const { lease: outer } = await runtimeLease()
  const { lease: rejected } = await runtimeLease()
  const provenance = require("../out/core/contractV2/runPlanProvenance.js")
  t.after(() => {
    outer.release()
    rejected.release()
  })

  await provenance.runWithWorkflowContractV2PlanLease(outer, async () => {
    await assert.rejects(
      () => subject().executeWorkflowContractV2RuntimeBoundary({
        acquireLease: async () => rejected,
        legacyOperation: async () => { throw new Error("legacy fallback") },
        compiledOperation: async () => "unreachable"
      }),
      /mix plan leases|different plan lease/i
    )
    assert.equal(rejected.released, true)
    assert.equal(outer.released, false)
  })
  assert.equal(outer.released, true)
})

test("direct lease-based run creation rejects a lease that is not the active runtime context", async (t) => {
  const { lease } = await runtimeLease()
  const runStore = temporaryRunStore(t)
  t.after(() => lease.release())

  await assert.rejects(
    () => runStore.createRunFromPlanLease(lease, {}),
    /active.*lease context|runtime context/i
  )
})
