const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const { ActionRegistry } = require("../out/core/actionRegistry")

function loadRuntimeFactory(vscode) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/workflowRuntimeFactory")
    delete require.cache[modulePath]
    return require(modulePath).WorkflowRuntimeFactory
  } finally {
    Module._load = originalLoad
  }
}

function createVscode(settings) {
  return {
    commands: { executeCommand: async () => undefined },
    workspace: {
      isTrusted: true,
      workspaceFolders: [],
      getConfiguration: () => ({
        get: (key, fallback) => Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback
      })
    }
  }
}

function createFactory(WorkflowRuntimeFactory) {
  return new WorkflowRuntimeFactory({
    engineVersion: "test",
    actionRegistry: new ActionRegistry(),
    customResultSinks: [],
    stepRuntime: { hold: async () => ({ completed: false }) },
    agentProvider: () => undefined,
    inputsProvider: () => (async () => ({})),
    gateRegistry: {}
  })
}

test("standalone runtime receives normalized workspace automatic pause limits", () => {
  const vscode = createVscode({
    "runControl.maxRunMinutes": 60,
    "runControl.maxAgentStepsPerRun": 8,
    "runControl.pauseAtLocalTime": "18:00",
    "runControl.timezone": "Asia/Tokyo",
    "taskSnapshots.enabled": false
  })
  const WorkflowRuntimeFactory = loadRuntimeFactory(vscode)
  const factory = createFactory(WorkflowRuntimeFactory)
  const engine = factory.createEngine("/workspace", { run: () => "done" })

  assert.deepEqual(engine.runControlStore.workspaceAutomaticPauseLimits, {
    maxRunMinutes: 60,
    maxAgentStepsPerRun: 8,
    pauseAtLocalTime: "18:00",
    timezone: "Asia/Tokyo"
  })
})

test("Bob runtime uses the same workspace automatic pause policy factory", () => {
  const vscode = createVscode({
    "runControl.maxRunMinutes": 30,
    "runControl.maxAgentStepsPerRun": 4,
    "taskSnapshots.enabled": false
  })
  const WorkflowRuntimeFactory = loadRuntimeFactory(vscode)
  const factory = createFactory(WorkflowRuntimeFactory)
  const runner = factory.createBobWorkflowRunner({
    id: "workflow-register.test",
    core: { id: "workflow-register.test" },
    stepExecution: { allowOutOfOrder: false }
  })
  const store = runner.options.runControlStore("/workspace")

  assert.deepEqual(store.workspaceAutomaticPauseLimits, {
    maxRunMinutes: 30,
    maxAgentStepsPerRun: 4
  })
})
