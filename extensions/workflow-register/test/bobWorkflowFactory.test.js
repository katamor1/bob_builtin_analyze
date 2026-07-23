const assert = require("node:assert/strict")
const path = require("node:path")
const { test } = require("node:test")

const outRoot = path.resolve(__dirname, "..", "out")
const { createBobWorkflow } = require(path.join(outRoot, "bobWorkflowFactory.js"))

class AuditedTask {
  constructor() {
    this.id = "task-1"
    this.status = "running"
  }

  getAllMetadata() { return { id: this.id } }
  getMessages() { return [] }
  sendMessage() { return undefined }
  setStepComplete() { return undefined }
  startSubagent() { return Promise.resolve("ok") }
  toSerializable() { return { id: this.id } }
  unrelatedTaskMethod() { throw new Error("The task probe must not expose unrelated methods.") }
}

function definition(overrides = {}) {
  return {
    id: "workflow-register.sample",
    label: "Sample",
    menuLabel: "Sample",
    description: "Sample workflow.",
    mode: "agent",
    permissions: ["read"],
    autoApprovalEnabled: true,
    workspaceRequired: false,
    hidden: false,
    todoEnabled: true,
    todoAsSteps: true,
    stepExecution: { mode: "engineSteps", allowOutOfOrder: false, showInBob: true },
    todos: [{ id: "todo-only", text: "Todo only", raw: "todo-only: Todo only" }],
    core: {
      engineSteps: [
        { id: "collect", title: "Collect", type: "command" },
        { id: "review", title: "Review", type: "agent" }
      ]
    },
    ...overrides
  }
}

test("Bob workflow factory probes an audited task before dispatching an engine step", async () => {
  const calls = []
  const originalTask = new AuditedTask()
  const workflow = createBobWorkflow(definition(), {
    runSingleWorkflowStep: async () => { calls.push(["single"]); return true },
    runTodoStep: async (todo) => { calls.push(["todo", todo.id]); return true },
    runEngineStep: async (stepId, index, task) => {
      calls.push(["engine", stepId, index, task])
      return true
    }
  })

  const steps = workflow.getSteps()
  assert.deepEqual(steps.map((step) => [step.id, step.title]), [["collect", "Collect"], ["review", "Review"]])
  assert.equal(await steps[1].execution(originalTask), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].slice(0, 3), ["engine", "review", 1])
  assert.notEqual(calls[0][3], originalTask)
  assert.deepEqual(Object.keys(calls[0][3]), [
    "getAllMetadata", "getMessages", "sendMessage", "setStepComplete", "startSubagent", "toSerializable"
  ])
  assert.deepEqual(calls[0][3].getAllMetadata(), { id: "task-1" })
})

test("Bob workflow factory probes an audited task before dispatching a Todo step", async () => {
  const calls = []
  const workflow = createBobWorkflow(definition({ stepExecution: { mode: "todo", allowOutOfOrder: false, showInBob: true } }), {
    runSingleWorkflowStep: async () => { calls.push(["single"]); return true },
    runTodoStep: async (todo, index, task) => { calls.push(["todo", todo.id, index, task]); return true },
    runEngineStep: async (stepId) => { calls.push(["engine", stepId]); return true }
  })

  const steps = workflow.getSteps()
  assert.deepEqual(steps.map((step) => [step.id, step.title]), [["todo-only", "Todo only"]])
  assert.equal(await steps[0].execution(new AuditedTask()), true)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].slice(0, 3), ["todo", "todo-only", 0])
  assert.equal(Object.isFrozen(calls[0][3]), true)
})

test("Bob workflow factory fails closed before runner dispatch when a task capability is missing", async () => {
  let dispatches = 0
  const workflow = createBobWorkflow(definition(), {
    runSingleWorkflowStep: async () => { dispatches += 1; return true },
    runTodoStep: async () => { dispatches += 1; return true },
    runEngineStep: async () => { dispatches += 1; return true }
  })
  const task = new AuditedTask()
  Object.defineProperty(task, "startSubagent", { value: undefined })

  await assert.rejects(workflow.getSteps()[0].execution(task), /startSubagent/)
  assert.equal(dispatches, 0)
})
