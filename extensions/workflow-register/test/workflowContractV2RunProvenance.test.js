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

function runtimeLease() {
  const fixture = createLockedRawPackage()
  const environment = compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  const { WorkflowPlanStore } = require("../out/core/contractV2/index.js")
  const store = new WorkflowPlanStore()
  return store.acquire({
    collectionId: "test/collection",
    workflowId: fixture.rawPackage.workflowId,
    rawPackage: fixture.rawPackage,
    environment
  }).then((lease) => ({ environment, fixture, lease, store }))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function temporaryRunStore(t, options = {}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-run-provenance-"))
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }))
  const { ContractV2GuardedRunStateStore } = require("../out/workflowContractV2RunStateStore.js")
  return new ContractV2GuardedRunStateStore({
    workspaceRoot,
    now: () => "2026-07-26T00:00:00.000Z",
    engineVersion: "test-engine",
    ...options
  })
}

test("run creation persists exact detached provenance from the leased compiled plan", async (t) => {
  const { lease } = await runtimeLease()
  t.after(() => lease.release())
  const runStore = temporaryRunStore(t)
  const subject = require("../out/core/contractV2/runPlanProvenance.js")

  const expected = subject.createWorkflowContractV2RunPlanProvenance(lease)
  const run = await runStore.createRunFromPlanLease(lease, { sample: "input" })

  assert.equal(run.workflowSchemaVersion, "workflow-register/v2")
  assert.equal(run.workflowId, lease.handle.plan.workflowId)
  assert.equal(run.workflowDefinitionHash, lease.planDigest)
  assert.deepEqual(run.planProvenance, expected)
  assert.notStrictEqual(run.planProvenance, expected)
  assert.equal(Object.isFrozen(run.planProvenance), true)

  await runStore.saveRun(run)
  const reopened = await runStore.loadRun(run.runId)
  assert.ok(reopened)
  assert.deepEqual(reopened.planProvenance, expected)
  assert.equal(Object.isFrozen(reopened.planProvenance), true)
  assert.deepEqual(subject.createWorkflowContractV2RunPlanProvenance(lease), expected)
})

test("run provenance decoder is closed and rejects omitted or drifted evidence", async (t) => {
  const { lease } = await runtimeLease()
  t.after(() => lease.release())
  const subject = require("../out/core/contractV2/runPlanProvenance.js")
  const { decodeWorkflowRunState } = require("../out/core/runStateStore.js")
  const valid = subject.createWorkflowContractV2RunPlanProvenance(lease)

  const mutations = [
    (value) => { value.generation = `sha256:${"f".repeat(64)}` },
    (value) => { value.planDigest = `sha256:${"e".repeat(64)}` },
    (value) => { value.packageDigest = `sha256:${"d".repeat(64)}` },
    (value) => { value.lockfileDigest = `sha256:${"c".repeat(64)}` },
    (value) => { value.environmentDigest = `sha256:${"b".repeat(64)}` },
    (value) => { value.compilerContractVersion = "workflow-register-compiler/v9" },
    (value) => { value.providerExactBindings = [{ id: "unknown" }] },
    (value) => { value.bobProfileBinding.profileDigest = `sha256:${"a".repeat(64)}` },
    (value) => { delete value.workflowId },
    (value) => { value.unexpected = true }
  ]
  for (const mutate of mutations) {
    const changed = clone(valid)
    mutate(changed)
    assert.throws(
      () => subject.assertWorkflowContractV2RunPlanProvenanceMatchesLease(changed, lease),
      /provenance|match|invalid/i
    )
  }

  const baseRun = {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "run-1",
    workflowId: lease.handle.plan.workflowId,
    workflowName: lease.handle.plan.workflow.name,
    workflowSchemaVersion: "workflow-register/v2",
    status: "running",
    inputs: {},
    state: {},
    steps: [],
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z"
  }
  assert.throws(() => decodeWorkflowRunState(baseRun), /plan provenance|required/i)
  assert.doesNotThrow(() => decodeWorkflowRunState({ ...baseRun, planProvenance: valid }))
})

test("run coordinator retains one live lease across invalidation and releases it at terminal status", async (t) => {
  const { lease, store: planStore } = await runtimeLease()
  const runStore = temporaryRunStore(t)
  const subject = require("../out/core/contractV2/runPlanProvenance.js")
  const {
    coordinateWorkflowRunExecution
  } = require("../out/core/engine/runExecutionCoordinator.js")

  let created
  await subject.runWithWorkflowContractV2PlanLease(lease, async () => {
    created = await runStore.createRunFromPlanLease(lease, { sample: "input" })
    await runStore.saveRun(created)
    const result = await coordinateWorkflowRunExecution(runStore, created.runId, "initial", async () => {
      const loaded = await runStore.loadRun(created.runId)
      assert.ok(loaded)
      assert.strictEqual(subject.requireWorkflowContractV2RunPlanLease(loaded), lease)
      return loaded
    })
    assert.equal(result.status, "running")
  })

  assert.equal(lease.released, false)
  planStore.invalidateSlot("test/collection", created.workflowId)

  await coordinateWorkflowRunExecution(runStore, created.runId, "terminal", async () => {
    const loaded = await runStore.loadRun(created.runId)
    assert.ok(loaded)
    assert.strictEqual(subject.requireWorkflowContractV2RunPlanLease(loaded), lease)
    loaded.status = "completed"
    await runStore.saveRun(loaded)
    return loaded
  })

  assert.equal(lease.released, true)
  lease.release()
  assert.equal(lease.released, true)
})

test("overlapping failure cleanup releases an adopted lease exactly once and blocks unleased v2 continuation", async (t) => {
  const { lease } = await runtimeLease()
  const runStore = temporaryRunStore(t)
  const subject = require("../out/core/contractV2/runPlanProvenance.js")
  const { coordinateWorkflowRunExecution } = require("../out/core/engine/runExecutionCoordinator.js")

  let run
  await assert.rejects(
    subject.runWithWorkflowContractV2PlanLease(lease, async () => {
      run = await runStore.createRunFromPlanLease(lease, {})
      await runStore.saveRun(run)
      return coordinateWorkflowRunExecution(runStore, run.runId, "failing-create", async () => {
        throw new Error("injected create failure")
      })
    }),
    /injected create failure/
  )

  assert.equal(lease.released, true)
  lease.release()
  assert.equal(lease.released, true)
  await assert.rejects(
    () => coordinateWorkflowRunExecution(runStore, run.runId, "unleased", async () => run),
    /lease.*unavailable|plan.*lease/i
  )
})
