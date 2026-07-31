const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  compiledRuntime
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

async function persistedPausedRun(runtime) {
  let run
  const handle = runtime.lease.handle
  await runtime.runWithLease(runtime.lease, async () => {
    run = await runtime.runStore.createRunFromPlanLease(runtime.lease, {})
    run.status = "paused"
    run.currentStep = "invoke"
    await runtime.runStore.saveRun(run)
  })
  const provenance = require("../out/core/contractV2/runPlanProvenance.js")
  provenance.releaseWorkflowContractV2RunPlanLease(runtime.workspaceRoot, run.runId)
  assert.equal(runtime.lease.released, true)
  return { handle, run }
}

function observedLease(handle) {
  const { createWorkflowPlanLease } = require("../out/core/contractV2/planLease.js")
  let releases = 0
  const lease = createWorkflowPlanLease({
    handle,
    onRelease: () => { releases += 1 }
  })
  return { lease, releases: () => releases }
}

test("failed recorded-generation recovery releases the adopted candidate exactly once", async (t) => {
  const runtime = await compiledRuntime(t, { sideEffect: "workspace-write" })
  const { handle, run } = await persistedPausedRun(runtime)
  run.steps[0].status = "completed"
  const candidate = observedLease(handle)
  const product = require("../out/workflowContractV2RunRecovery.js")

  await assert.rejects(
    () => product.recoverWorkflowContractV2ProductRunPlan({
      workspaceRoot: runtime.workspaceRoot,
      run,
      acquireGeneration: async () => Object.freeze({
        ok: true,
        lease: candidate.lease,
        rawPackage: Object.freeze({})
      })
    }),
    /attempt|artifact|resume/i
  )

  assert.equal(candidate.lease.released, true)
  assert.equal(candidate.releases(), 1)
  candidate.lease.release()
  candidate.lease.release()
  assert.equal(candidate.releases(), 1)
})

test("duplicate recovery contention acquires and retains one candidate lease", async (t) => {
  const runtime = await compiledRuntime(t)
  const { handle, run } = await persistedPausedRun(runtime)
  const candidate = observedLease(handle)
  const recovery = require("../out/core/contractV2/runPlanRecovery.js")
  const provenance = require("../out/core/contractV2/runPlanProvenance.js")
  const coordinator = require("../out/core/engine/runExecutionCoordinator.js")
  let recoveryCalls = 0
  let operationCalls = 0
  let openGate
  const gate = new Promise((resolve) => { openGate = resolve })

  const recover = async (loaded) => {
    recoveryCalls += 1
    await gate
    await recovery.recoverWorkflowContractV2RunPlanLease({
      workspaceScope: runtime.workspaceRoot,
      run: loaded,
      acquireGeneration: async () => candidate.lease
    })
  }
  const operation = async () => {
    operationCalls += 1
    return runtime.runStore.loadRun(run.runId)
  }

  const first = coordinator.coordinateWorkflowContractV2RunRecovery(
    runtime.runStore,
    run.runId,
    "same-recovery",
    recover,
    operation
  )
  const duplicate = coordinator.coordinateWorkflowContractV2RunRecovery(
    runtime.runStore,
    run.runId,
    "same-recovery",
    recover,
    operation
  )
  openGate()
  const [left, right] = await Promise.all([first, duplicate])

  assert.equal(left.runId, run.runId)
  assert.equal(right.runId, run.runId)
  assert.equal(recoveryCalls, 1)
  assert.equal(operationCalls, 1)
  assert.equal(candidate.lease.released, false)

  provenance.releaseWorkflowContractV2RunPlanLease(runtime.workspaceRoot, run.runId)
  provenance.releaseWorkflowContractV2RunPlanLease(runtime.workspaceRoot, run.runId)
  candidate.lease.release()
  assert.equal(candidate.releases(), 1)
})

test("terminal recovery releases the recovered lease once across loop and coordinator cleanup", async (t) => {
  const runtime = await compiledRuntime(t)
  const { handle, run } = await persistedPausedRun(runtime)
  const candidate = observedLease(handle)
  const recovery = require("../out/core/contractV2/runPlanRecovery.js")
  const coordinator = require("../out/core/engine/runExecutionCoordinator.js")

  const result = await coordinator.coordinateWorkflowContractV2RunRecovery(
    runtime.runStore,
    run.runId,
    "terminal-recovery",
    (loaded) => recovery.recoverWorkflowContractV2RunPlanLease({
      workspaceScope: runtime.workspaceRoot,
      run: loaded,
      acquireGeneration: async () => candidate.lease
    }),
    async () => {
      const loaded = await runtime.runStore.loadRun(run.runId)
      loaded.status = "completed"
      delete loaded.currentStep
      await runtime.runStore.saveRun(loaded)
      return loaded
    }
  )

  assert.equal(result.status, "completed")
  assert.equal(candidate.lease.released, true)
  assert.equal(candidate.releases(), 1)
  candidate.lease.release()
  assert.equal(candidate.releases(), 1)
})
