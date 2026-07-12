const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { ActionRegistry } = require("../out/core/actionRegistry")
const { WorkflowEngine } = require("../out/core/engine")
const { ResultSinkRegistry } = require("../out/core/resultSinkRegistry")
const { FileRunStateStore } = require("../out/core/runStateStore")

const agentStep = (id) => ({ id, title: id, type: "agent", prompt: `Run ${id}.` })

function workflow(overrides = {}) {
  return {
    id: "workflow-register.automatic-pause",
    name: "automatic-pause",
    label: "Automatic Pause",
    menuLabel: "Automatic Pause",
    description: "Automatic pause test workflow.",
    schemaVersion: "workflow-register/v1",
    prompt: "Automatic pause test workflow.",
    promptWithoutTodo: "Automatic pause test workflow.",
    commandArgs: [],
    mode: "agent",
    permissions: ["read"],
    autoApprovalEnabled: true,
    workspaceRequired: true,
    hidden: false,
    todoEnabled: false,
    todoRequired: false,
    todoAsSteps: false,
    stepCompletion: "auto",
    stepMessage: "current",
    stepExecution: { mode: "full", allowOutOfOrder: false, showInBob: true },
    stepReview: {
      enabled: false,
      pauseAfter: "none",
      requireAcceptBeforeNext: false,
      allowRetry: true,
      allowEditBeforeRetry: false,
      preserveAttempts: true
    },
    todos: [], inputs: {}, requires: {}, preflight: [], tools: {},
    guardrails: {}, artifacts: [], completion: {},
    engineSteps: [agentStep("analyze")],
    ...overrides
  }
}

async function root() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "workflow-automatic-pause-"))
}

test("engine pauses before preflight when elapsed limit is due", async () => {
  const workspaceRoot = await root()
  let calls = 0
  const engine = new WorkflowEngine({
    actions: new ActionRegistry(),
    resultSinks: new ResultSinkRegistry(),
    runStore: new FileRunStateStore({ workspaceRoot, now: () => "2026-07-12T00:00:00.000Z" }),
    agentProvider: { run: () => { calls += 1; return "done" } },
    clock: () => new Date("2026-07-12T00:45:00.000Z")
  })
  const result = await engine.runWorkflow(workflow({
    runControl: { limits: { maxRunMinutes: 45 } }
  }), {})

  assert.equal(result.status, "paused")
  assert.equal(result.currentStep, "analyze")
  assert.equal(calls, 0)
  assert.deepEqual(JSON.parse(result.state["workflow.pause"]), {
    schemaVersion: "workflow-register/automatic-pause/v1",
    kind: "maxRunMinutes",
    source: "workflow",
    checkpoint: "before-preflight",
    nextStepId: "analyze",
    limit: { maxRunMinutes: 45 },
    observed: { elapsedMinutes: 45 },
    detectedAt: "2026-07-12T00:45:00.000Z"
  })
})

test("engine pauses after the first agent step before starting the next agent call", async () => {
  const workspaceRoot = await root()
  const calls = []
  const engine = new WorkflowEngine({
    actions: new ActionRegistry(),
    resultSinks: new ResultSinkRegistry(),
    runStore: new FileRunStateStore({ workspaceRoot, now: () => "2026-07-12T00:00:00.000Z" }),
    agentProvider: { run: (input) => { calls.push(input.stepId); return `${input.stepId}-done` } },
    clock: () => new Date("2026-07-12T00:01:00.000Z")
  })
  const result = await engine.runWorkflow(workflow({
    runControl: { limits: { maxAgentStepsPerRun: 1 } },
    engineSteps: [agentStep("analyze"), agentStep("summarize")]
  }), {})

  assert.equal(result.status, "paused")
  assert.equal(result.currentStep, "summarize")
  assert.deepEqual(calls, ["analyze"])
})
