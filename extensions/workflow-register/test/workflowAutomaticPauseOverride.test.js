const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { ActionRegistry } = require("../out/core/actionRegistry")
const { WorkflowEngine } = require("../out/core/engine")
const { FileRunControlStore } = require("../out/core/runControlStore")
const { ResultSinkRegistry } = require("../out/core/resultSinkRegistry")
const { FileRunStateStore } = require("../out/core/runStateStore")

function workflow() {
  return {
    id: "workflow-register.override",
    name: "override",
    label: "Override",
    menuLabel: "Override",
    description: "Override test workflow.",
    schemaVersion: "workflow-register/v1",
    prompt: "Override test workflow.",
    promptWithoutTodo: "Override test workflow.",
    commandArgs: [], mode: "agent", permissions: ["read"],
    autoApprovalEnabled: true, workspaceRequired: true, hidden: false,
    todoEnabled: false, todoRequired: false, todoAsSteps: false,
    stepCompletion: "auto", stepMessage: "current",
    stepExecution: { mode: "full", allowOutOfOrder: false, showInBob: true },
    stepReview: {
      enabled: false, pauseAfter: "none", requireAcceptBeforeNext: false,
      allowRetry: true, allowEditBeforeRetry: false, preserveAttempts: true
    },
    runControl: { limits: { maxRunMinutes: 1 } },
    todos: [], inputs: {}, requires: {}, preflight: [], tools: {},
    guardrails: {}, artifacts: [], completion: {},
    engineSteps: [{ id: "analyze", title: "Analyze", type: "agent", prompt: "Analyze." }]
  }
}

async function stores(now = "2026-07-12T01:00:00.000Z") {
  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-pause-override-"))
  const runStore = new FileRunStateStore({ workspaceRoot, now: () => "2026-07-12T00:00:00.000Z" })
  const run = await runStore.createRun(workflow(), {})
  await runStore.saveRun(run)
  return {
    run,
    runStore,
    controlStore: new FileRunControlStore({ workspaceRoot, now: () => now })
  }
}

test("FileRunControlStore persists a bounded automatic pause override", async () => {
  const { run, controlStore } = await stores()
  const control = await controlStore.setAutomaticPauseOverride({
    runId: run.runId,
    durationMinutes: 30,
    requestedBy: "user",
    reason: "Finish the current review."
  })
  assert.deepEqual(control.automaticPauseOverride, {
    schemaVersion: "workflow-register/automatic-pause-override/v1",
    createdAt: "2026-07-12T01:00:00.000Z",
    expiresAt: "2026-07-12T01:30:00.000Z",
    requestedBy: "user",
    reason: "Finish the current review."
  })
  assert.deepEqual((await controlStore.loadControl(run.runId)).automaticPauseOverride, control.automaticPauseOverride)
})

test("clearing a manual pause preserves an unexpired automatic pause override", async () => {
  const { run, controlStore } = await stores()
  await controlStore.setAutomaticPauseOverride({
    runId: run.runId,
    durationMinutes: 15,
    reason: "Continue briefly."
  })
  await controlStore.requestPause({ runId: run.runId, reason: "manual" })
  const cleared = await controlStore.clearPause(run.runId)
  assert.equal(cleared.pauseRequestedAt, undefined)
  assert.equal(cleared.automaticPauseOverride.expiresAt, "2026-07-12T01:15:00.000Z")
})

test("manual pause remains authoritative while an automatic override is active", async () => {
  const { run, runStore, controlStore } = await stores()
  await controlStore.setAutomaticPauseOverride({
    runId: run.runId,
    durationMinutes: 30,
    reason: "Continue briefly."
  })
  await controlStore.requestPause({ runId: run.runId, reason: "manual", requestedBy: "user" })
  let agentCalls = 0
  const engine = new WorkflowEngine({
    actions: new ActionRegistry(),
    resultSinks: new ResultSinkRegistry(),
    runStore,
    runControlStore: controlStore,
    agentProvider: { run: () => { agentCalls += 1; return "done" } }
  })

  const result = await engine.runWorkflow(workflow(), {})
  assert.equal(result.status, "paused")
  assert.equal(agentCalls, 0)
  assert.equal(JSON.parse(result.state["workflow.pause"]).pauseReason, "manual")
})

test("automatic pause override input rejects unsafe durations and empty reasons", async () => {
  const { run, controlStore } = await stores()
  await assert.rejects(
    controlStore.setAutomaticPauseOverride({ runId: run.runId, durationMinutes: 0, reason: "No" }),
    /durationMinutes must be an integer between 1 and 1440/
  )
  await assert.rejects(
    controlStore.setAutomaticPauseOverride({ runId: run.runId, durationMinutes: 30, reason: "   " }),
    /reason is required/
  )
})
