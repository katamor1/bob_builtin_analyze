const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  compiledRuntime,
  subject
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

test("R5 continues one durable paused run with the exact retained lease", async (t) => {
  let dispatches = 0
  const runtime = await compiledRuntime(t, {
    dispatch: () => {
      dispatches += 1
      return { ok: true }
    }
  })

  const created = await runtime.runWithLease(runtime.lease, async () => {
    const run = await runtime.runStore.createRunFromPlanLease(runtime.lease, {})
    run.status = "paused"
    run.currentStep = "invoke"
    await runtime.runStore.saveRun(run)
    return run
  })

  const continued = await subject().continueCompiledWorkflowRun({
    lease: runtime.lease,
    runId: created.runId,
    options: { executionMode: "singleStep", stepId: "invoke" },
    workspaceRoot: runtime.workspaceRoot,
    runStore: runtime.runStore,
    signal: new AbortController().signal
  })

  assert.equal(continued.runId, created.runId)
  assert.equal(continued.status, "completed")
  assert.equal(dispatches, 1)
  const runs = await runtime.runStore.listRuns()
  assert.equal(runs.length, 1)
  assert.equal(runs[0].runId, created.runId)
})

test("R5 continuation never creates a replacement run when the recorded run is missing", async (t) => {
  let dispatches = 0
  const runtime = await compiledRuntime(t, {
    dispatch: () => {
      dispatches += 1
      return { ok: true }
    }
  })
  await assert.rejects(
    () => subject().continueCompiledWorkflowRun({
      lease: runtime.lease,
      runId: "missing-run",
      options: { executionMode: "singleStep", stepId: "invoke" },
      workspaceRoot: runtime.workspaceRoot,
      runStore: runtime.runStore,
      signal: new AbortController().signal
    }),
    /continuation run is unavailable/i
  )
  assert.equal(dispatches, 0)
  assert.deepEqual(await runtime.runStore.listRuns(), [])
})
