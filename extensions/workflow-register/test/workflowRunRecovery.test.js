const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-recovery-"))
}

function sampleWorkflow() {
  return {
    id: "workflow-register.recovery",
    name: "recovery",
    label: "Recovery",
    description: "Recovery workflow.",
    schemaVersion: "workflow-register/v1",
    definitionHash: "definition-v1",
    filePath: ".bob/workflows/recovery/WORKFLOW.md",
    prompt: "",
    promptWithoutTodo: "",
    commandArgs: [],
    mode: "agent",
    permissions: [],
    autoApprovalEnabled: false,
    workspaceRequired: false,
    hidden: false,
    todoEnabled: false,
    todoRequired: false,
    todoAsSteps: false,
    stepCompletion: "auto",
    stepMessage: "silent",
    todos: [],
    inputs: { revision: { type: "string", required: true } },
    requires: {},
    preflight: [],
    tools: {},
    guardrails: { allowedCommands: ["sample.collect", "sample.analyze"] },
    artifacts: [],
    completion: {},
    engineSteps: [
      { id: "collect", title: "Collect", type: "command", action: { provider: "sample.collect" }, resultKey: "collectResult" },
      { id: "analyze", title: "Analyze", type: "command", action: { provider: "sample.analyze" }, resultKey: "analyzeResult" }
    ]
  }
}

test("workflow engine resumes a recoverable run with the same serialized inputs and state", async () => {
  const { ActionRegistry } = require("../out/core/actionRegistry")
  const { WorkflowEngine } = require("../out/core/engine")
  const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry")
  const { FileRunStateStore } = require("../out/core/runStateStore")

  const workspaceRoot = tempDir()
  const workflow = sampleWorkflow()
  const inputs = { revision: "77" }
  const runStore = new FileRunStateStore({ workspaceRoot, now: () => "2026-06-30T00:00:00.000Z", engineVersion: "test-engine" })

  const interrupted = await runStore.createRun(workflow, inputs)
  interrupted.status = "running"
  interrupted.currentStep = "analyze"
  interrupted.state.collectResult = "cached-context"
  interrupted.steps[0].status = "completed"
  interrupted.steps[1].status = "running"
  await runStore.saveRun(interrupted)

  let collectCount = 0
  const actions = new ActionRegistry()
  actions.register({ id: "sample.collect", execute: async () => { collectCount += 1; return "unexpected" } })
  actions.register({ id: "sample.analyze", execute: async (input) => ({ revision: input.inputs.revision, collectResult: input.state.collectResult, resumed: true }) })

  const engine = new WorkflowEngine({ actions, resultSinks: createDefaultResultSinkRegistry({ workspaceRoot, executeCommand: async () => undefined }), runStore })
  const result = await engine.runWorkflow(workflow, { revision: "77" })

  assert.equal(result.runId, interrupted.runId)
  assert.equal(result.status, "completed")
  assert.equal(collectCount, 0)
  assert.equal(result.state.collectResult, "cached-context")
  assert.deepEqual(JSON.parse(result.state.analyzeResult), { revision: "77", collectResult: "cached-context", resumed: true })
  assert.equal((await runStore.listRuns()).length, 1)
})

test("workflow run recovery does not reuse a cache for different inputs", async () => {
  const { ActionRegistry } = require("../out/core/actionRegistry")
  const { WorkflowEngine } = require("../out/core/engine")
  const { createDefaultResultSinkRegistry } = require("../out/core/resultSinkRegistry")
  const { FileRunStateStore } = require("../out/core/runStateStore")

  const workspaceRoot = tempDir()
  const workflow = sampleWorkflow()
  const runStore = new FileRunStateStore({ workspaceRoot, now: () => "2026-06-30T00:00:00.000Z", engineVersion: "test-engine" })

  const interrupted = await runStore.createRun(workflow, { revision: "77" })
  interrupted.status = "running"
  interrupted.currentStep = "analyze"
  interrupted.state.collectResult = "old-context"
  interrupted.steps[0].status = "completed"
  interrupted.steps[1].status = "running"
  await runStore.saveRun(interrupted)

  const actions = new ActionRegistry()
  actions.register({ id: "sample.collect", execute: async (input) => `fresh-context-${input.inputs.revision}` })
  actions.register({ id: "sample.analyze", execute: async (input) => input.state.collectResult })

  const engine = new WorkflowEngine({ actions, resultSinks: createDefaultResultSinkRegistry({ workspaceRoot, executeCommand: async () => undefined }), runStore })
  const result = await engine.runWorkflow(workflow, { revision: "88" })

  assert.notEqual(result.runId, interrupted.runId)
  assert.equal(result.status, "completed")
  assert.equal(result.state.collectResult, "fresh-context-88")
  assert.equal(result.state.analyzeResult, "fresh-context-88")
  assert.equal((await runStore.listRuns()).length, 2)
})
