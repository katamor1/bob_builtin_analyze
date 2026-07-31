const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/workflowContractV2BobExecutor.js")
}

function handle(stepIds = ["first", "second"]) {
  return Object.freeze({
    planDigest: "plan-a",
    plan: Object.freeze({
      workflowId: "compiled-workflow",
      workflow: Object.freeze({
        steps: Object.freeze(stepIds.map((id) => Object.freeze({ id, required: true })))
      })
    })
  })
}

function run(status, currentStep, stepIds, statuses) {
  return {
    runId: "run-1",
    workflowId: "compiled-workflow",
    workflowDefinitionHash: "plan-a",
    workflowSchemaVersion: "workflow-register/v2",
    status,
    currentStep,
    steps: stepIds.map((id, index) => ({ id, status: statuses[index] })),
    state: {},
    inputs: {},
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  }
}

function stepInput(selectedHandle, selectedTask, stepId, stepIndex) {
  return {
    handle: selectedHandle,
    stepId,
    stepIndex,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }
}

test("overlapping first-step callbacks for one task create exactly one lease and one run", async () => {
  const selectedHandle = handle()
  const selectedTask = Object.freeze({})
  const durable = new Map()
  let acquisitions = 0
  let fresh = 0
  let releaseAcquire
  const acquireGate = new Promise((resolve) => { releaseAcquire = resolve })
  const lease = { handle: selectedHandle, released: false, release() { this.released = true } }
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => {
      acquisitions += 1
      await acquireGate
      return lease
    },
    resolveInputs: async () => ({}),
    createRunStore: () => ({ loadRun: async (runId) => durable.get(runId) }),
    createAgentProvider: () => undefined,
    runFresh: async (input) => {
      fresh += 1
      const value = run("paused", "second", ["first", "second"], ["completed", "pending"])
      durable.set(value.runId, value)
      input.onRunCreated?.(value)
      return value
    },
    runContinuation: async () => { throw new Error("must not continue") },
    runWithLease: async (_lease, operation) => operation()
  })

  const first = executor.runStep(stepInput(selectedHandle, selectedTask, "first", 0))
  const duplicate = executor.runStep(stepInput(selectedHandle, selectedTask, "first", 0))
  releaseAcquire()
  assert.deepEqual(await Promise.all([first, duplicate]), [true, true])
  assert.equal(acquisitions, 1)
  assert.equal(fresh, 1)
})

test("a forward compiled transition makes intervening Bob callbacks deterministic skips", async () => {
  const steps = ["first", "second", "third"]
  const selectedHandle = handle(steps)
  const selectedTask = Object.freeze({})
  const durable = new Map()
  let continuations = 0
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => ({ handle: selectedHandle, released: false, release() {} }),
    resolveInputs: async () => ({}),
    createRunStore: () => ({ loadRun: async (runId) => durable.get(runId) }),
    createAgentProvider: () => undefined,
    runFresh: async (input) => {
      const value = run("paused", "third", steps, ["completed", "pending", "pending"])
      durable.set(value.runId, value)
      input.onRunCreated?.(value)
      return value
    },
    runContinuation: async (input) => {
      continuations += 1
      assert.equal(input.options.stepId, "third")
      const value = run("completed", undefined, steps, ["completed", "pending", "completed"])
      durable.set(value.runId, value)
      return value
    },
    runWithLease: async (_lease, operation) => operation()
  })

  assert.equal(await executor.runStep(stepInput(selectedHandle, selectedTask, "first", 0)), true)
  assert.equal(await executor.runStep(stepInput(selectedHandle, selectedTask, "second", 1)), true)
  assert.equal(continuations, 0)
  assert.equal(await executor.runStep(stepInput(selectedHandle, selectedTask, "third", 2)), true)
  assert.equal(continuations, 1)
})

test("a backward compiled transition is driven within the current Bob callback", async () => {
  const steps = ["first", "second"]
  const selectedHandle = handle(steps)
  const selectedTask = Object.freeze({})
  const durable = new Map()
  const routed = []
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => ({ handle: selectedHandle, released: false, release() {} }),
    resolveInputs: async () => ({}),
    createRunStore: () => ({ loadRun: async (runId) => durable.get(runId) }),
    createAgentProvider: () => undefined,
    runFresh: async (input) => {
      const value = run("paused", "second", steps, ["completed", "pending"])
      durable.set(value.runId, value)
      input.onRunCreated?.(value)
      return value
    },
    runContinuation: async (input) => {
      routed.push(input.options.stepId)
      let value
      if (routed.length === 1) {
        value = run("paused", "first", steps, ["completed", "completed"])
      } else if (routed.length === 2) {
        value = run("paused", "second", steps, ["completed", "completed"])
      } else {
        value = run("completed", undefined, steps, ["completed", "completed"])
      }
      durable.set(value.runId, value)
      return value
    },
    runWithLease: async (_lease, operation) => operation()
  })

  assert.equal(await executor.runStep(stepInput(selectedHandle, selectedTask, "first", 0)), true)
  assert.equal(await executor.runStep(stepInput(selectedHandle, selectedTask, "second", 1)), true)
  assert.deepEqual(routed, ["second", "first", "second"])
})
