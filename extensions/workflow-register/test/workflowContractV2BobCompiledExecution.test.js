const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/workflowContractV2BobExecutor.js")
}

function handle(id = "plan-a") {
  return Object.freeze({
    planDigest: id,
    plan: Object.freeze({
      workflowId: "compiled-workflow",
      workflow: Object.freeze({
        steps: Object.freeze([
          Object.freeze({ id: "first", required: true }),
          Object.freeze({ id: "second", required: true })
        ])
      })
    })
  })
}

function run(status, currentStep, stepStatuses) {
  return {
    runId: "run-1",
    workflowId: "compiled-workflow",
    workflowDefinitionHash: "plan-a",
    workflowSchemaVersion: "workflow-register/v2",
    status,
    currentStep,
    steps: stepStatuses.map(([id, stepStatus]) => ({ id, status: stepStatus })),
    state: {},
    inputs: {},
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z"
  }
}

function task() {
  return Object.freeze({})
}

test("compiled Bob steps share one exact lease and one durable run across the live task", async () => {
  const selectedHandle = handle()
  const selectedTask = task()
  const lease = { handle: selectedHandle, released: false, release() { this.released = true } }
  const durable = new Map()
  let acquisitions = 0
  let fresh = 0
  let continuations = 0
  const runStore = {
    loadRun: async (runId) => durable.get(runId),
    createRunFromPlanLease: async () => { throw new Error("test double only") },
    saveRun: async () => {}
  }
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async (value) => {
      acquisitions += 1
      assert.equal(value, selectedHandle)
      return lease
    },
    resolveInputs: async (value) => {
      assert.equal(value, selectedTask)
      return { message: "hello" }
    },
    createRunStore: () => runStore,
    createAgentProvider: () => undefined,
    runFresh: async (input) => {
      fresh += 1
      assert.equal(input.lease, lease)
      assert.equal(input.options.stepId, "first")
      const value = run("paused", "second", [["first", "completed"], ["second", "pending"]])
      durable.set(value.runId, value)
      return value
    },
    runContinuation: async (input) => {
      continuations += 1
      assert.equal(input.lease, lease)
      assert.equal(input.runId, "run-1")
      assert.equal(input.options.stepId, "second")
      const value = run("completed", undefined, [["first", "completed"], ["second", "completed"]])
      durable.set(value.runId, value)
      return value
    },
    runWithLease: async (_lease, operation) => operation()
  })

  assert.equal(await executor.runStep({
    handle: selectedHandle,
    stepId: "first",
    stepIndex: 0,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), true)
  assert.equal(await executor.runStep({
    handle: selectedHandle,
    stepId: "second",
    stepIndex: 1,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), true)

  assert.equal(acquisitions, 1)
  assert.equal(fresh, 1)
  assert.equal(continuations, 1)
})

test("a later Bob step without the live task session fails before lease acquisition or run creation", async () => {
  const selectedHandle = handle()
  let acquisitions = 0
  let fresh = 0
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => {
      acquisitions += 1
      return { handle: selectedHandle, released: false, release() {} }
    },
    resolveInputs: async () => ({}),
    createRunStore: () => ({ loadRun: async () => undefined }),
    createAgentProvider: () => undefined,
    runFresh: async () => { fresh += 1; throw new Error("must not run") },
    runContinuation: async () => { throw new Error("must not continue") },
    runWithLease: async (_lease, operation) => operation()
  })
  await assert.rejects(() => executor.runStep({
    handle: selectedHandle,
    stepId: "second",
    stepIndex: 1,
    task: task(),
    workspaceRoot: "/workspace",
    allowOutOfOrder: true
  }), /live Bob task session|R6/i)
  assert.equal(acquisitions, 0)
  assert.equal(fresh, 0)
})

test("a stale or different compiled handle cannot join an existing Bob task session", async () => {
  const firstHandle = handle("plan-a")
  const secondHandle = handle("plan-b")
  const selectedTask = task()
  const durable = new Map()
  const lease = { handle: firstHandle, released: false, release() { this.released = true } }
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => lease,
    resolveInputs: async () => ({}),
    createRunStore: () => ({ loadRun: async (runId) => durable.get(runId) }),
    createAgentProvider: () => undefined,
    runFresh: async () => {
      const value = run("paused", "second", [["first", "completed"], ["second", "pending"]])
      durable.set(value.runId, value)
      return value
    },
    runContinuation: async () => { throw new Error("must not continue") },
    runWithLease: async (_lease, operation) => operation()
  })
  assert.equal(await executor.runStep({
    handle: firstHandle,
    stepId: "first",
    stepIndex: 0,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), true)
  await assert.rejects(() => executor.runStep({
    handle: secondHandle,
    stepId: "second",
    stepIndex: 1,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), /different compiled plan|session/i)
})

test("a duplicate completed Bob step is idempotent and does not continue or acquire again", async () => {
  const selectedHandle = handle()
  const selectedTask = task()
  const durable = new Map()
  let acquisitions = 0
  let continuations = 0
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => {
      acquisitions += 1
      return { handle: selectedHandle, released: false, release() {} }
    },
    resolveInputs: async () => ({}),
    createRunStore: () => ({ loadRun: async (runId) => durable.get(runId) }),
    createAgentProvider: () => undefined,
    runFresh: async () => {
      const value = run("paused", "second", [["first", "completed"], ["second", "pending"]])
      durable.set(value.runId, value)
      return value
    },
    runContinuation: async () => {
      continuations += 1
      throw new Error("must not continue")
    },
    runWithLease: async (_lease, operation) => operation()
  })
  assert.equal(await executor.runStep({
    handle: selectedHandle,
    stepId: "first",
    stepIndex: 0,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), true)
  assert.equal(await executor.runStep({
    handle: selectedHandle,
    stepId: "first",
    stepIndex: 0,
    task: selectedTask,
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), true)
  assert.equal(acquisitions, 1)
  assert.equal(continuations, 0)
})

test("setup failure releases a pre-run Bob lease", async () => {
  const selectedHandle = handle()
  const lease = { handle: selectedHandle, released: false, release() { this.released = true } }
  const executor = new (subject().WorkflowContractV2BobExecutor)({
    acquireLease: async () => lease,
    resolveInputs: async () => { throw new Error("metadata failed") },
    createRunStore: () => ({}),
    createAgentProvider: () => undefined,
    runFresh: async () => { throw new Error("must not run") },
    runContinuation: async () => { throw new Error("must not continue") },
    runWithLease: async (_lease, operation) => operation()
  })
  await assert.rejects(() => executor.runStep({
    handle: selectedHandle,
    stepId: "first",
    stepIndex: 0,
    task: task(),
    workspaceRoot: "/workspace",
    allowOutOfOrder: false
  }), /metadata failed/)
  assert.equal(lease.released, true)
})
