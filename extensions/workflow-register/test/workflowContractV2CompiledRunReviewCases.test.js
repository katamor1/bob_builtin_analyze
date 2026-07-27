const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  compiledRuntime,
  subject
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

function runInput(runtime, inputs, overrides = {}) {
  return {
    lease: runtime.lease,
    inputs,
    options: {},
    workspaceRoot: runtime.workspaceRoot,
    runStore: runtime.runStore,
    signal: new AbortController().signal,
    ...overrides
  }
}

test("single-step selection is validated before any run is created", async (t) => {
  const runtime = await compiledRuntime(t)
  await assert.rejects(
    () => runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun(runInput(runtime, {}, {
      options: { executionMode: "singleStep", stepId: "missing" }
    }))),
    /single-step target|unavailable/i
  )
  assert.deepEqual(await runtime.runStore.listRuns(), [])
})

test("single-step execution honors an explicit failing transition", async (t) => {
  const runtime = await compiledRuntime(t, { transitionGoto: "$fail" })
  const run = await runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun(runInput(runtime, {}, {
    options: { executionMode: "singleStep", stepId: "invoke" }
  })))
  assert.equal(run.status, "failed")
})

test("an optional provider failure records the step failure and completes lexically", async (t) => {
  const runtime = await compiledRuntime(t, {
    required: false,
    dispatch: () => ({ unexpected: true })
  })
  const run = await runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun(runInput(runtime, {})))
  assert.equal(run.status, "completed")
  assert.equal(run.steps[0].status, "failed")
  assert.deepEqual(JSON.parse(run.state["workflow.contractV2.committedOutputs"]), {})
})

test("terminal fresh runs release their adopted plan lease", async (t) => {
  const runtime = await compiledRuntime(t)
  const run = await runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun(runInput(runtime, {})))
  assert.equal(run.status, "completed")
  assert.equal(runtime.lease.released, true)
})

test("required runtime-owned artifacts fail before dispatch or run creation", async (t) => {
  let dispatches = 0
  const runtime = await compiledRuntime(t, {
    runtimeRequiredArtifact: true,
    dispatch: () => {
      dispatches += 1
      return { ok: true }
    }
  })
  await assert.rejects(
    () => runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun(runInput(runtime, {}))),
    /required runtime artifact|unsupported artifact/i
  )
  assert.equal(dispatches, 0)
  assert.deepEqual(await runtime.runStore.listRuns(), [])
})

test("agent JSON text is decoded into the compiled structured value", async (t) => {
  const runtime = await compiledRuntime(t, { stepType: "agent" })
  const run = await runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun(runInput(runtime, {}, {
    agentProvider: { run: () => '{"ok":true}' }
  })))
  assert.equal(run.status, "completed")
  assert.deepEqual(JSON.parse(run.state["workflow.contractV2.committedOutputs"]), {
    providerResult: { ok: true }
  })
})

test("logical effect ordinals distinguish loop executions but remain stable for retries", () => {
  const values = require("../out/core/contractV2/compiledRunValues.js")
  const provider = {
    id: "sample.provider",
    exactVersion: "1.0.0"
  }
  const base = {
    runId: "run-1",
    stepId: "invoke",
    inputDigest: `sha256:${"1".repeat(64)}`,
    planDigest: `sha256:${"2".repeat(64)}`,
    provider
  }
  const first = values.compiledProviderIdempotencyKey({ ...base, logicalEffectOrdinal: 1 })
  const retry = values.compiledProviderIdempotencyKey({ ...base, logicalEffectOrdinal: 1 })
  const nextLoop = values.compiledProviderIdempotencyKey({ ...base, logicalEffectOrdinal: 2 })
  assert.equal(first, retry)
  assert.notEqual(first, nextLoop)
})
