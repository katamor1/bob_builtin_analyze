const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { FileRunControlStore } = require("../out/core/runControlStore")
const { FileRunStateStore } = require("../out/core/runStateStore")

function loadUi(vscode) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/commands/automaticPauseResumeUi")
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

async function fixture() {
  const workspaceRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "workflow-pause-resume-ui-"))
  const runStore = new FileRunStateStore({ workspaceRoot, now: () => "2026-07-12T01:00:00.000Z" })
  const workflow = {
    id: "workflow-register.resume-ui", name: "resume-ui", label: "Resume UI",
    description: "Resume UI", schemaVersion: "workflow-register/v1",
    engineSteps: [{ id: "analyze", title: "Analyze", type: "agent" }]
  }
  const run = await runStore.createRun(workflow, {})
  run.status = "paused"
  run.state["workflow.pause"] = JSON.stringify({
    schemaVersion: "workflow-register/automatic-pause/v1",
    kind: "maxRunMinutes",
    source: "workflow",
    checkpoint: "before-step:analyze",
    nextStepId: "analyze",
    limit: { maxRunMinutes: 45 },
    observed: { elapsedMinutes: 45 },
    detectedAt: "2026-07-12T01:00:00.000Z"
  })
  await runStore.saveRun(run)
  return { workspaceRoot, run }
}

test("automatic pause resume UI persists the selected bounded override", async () => {
  const { workspaceRoot, run } = await fixture()
  const vscode = {
    window: {
      showQuickPick: async (items) => items[1],
      showInputBox: async () => "Finish the review."
    }
  }
  const { prepareAutomaticPauseResume } = loadUi(vscode)
  assert.equal(await prepareAutomaticPauseResume({ workspaceRoot, run }), true)
  const control = await new FileRunControlStore({ workspaceRoot }).loadControl(run.runId)
  assert.equal(control.automaticPauseOverride.reason, "Finish the review.")
  assert.ok(Date.parse(control.automaticPauseOverride.expiresAt) > Date.parse(control.automaticPauseOverride.createdAt))
})

test("automatic pause resume UI cancels without mutating control state", async () => {
  const { workspaceRoot, run } = await fixture()
  const vscode = {
    window: {
      showQuickPick: async () => undefined,
      showInputBox: async () => { throw new Error("input must not be requested") }
    }
  }
  const { prepareAutomaticPauseResume } = loadUi(vscode)
  assert.equal(await prepareAutomaticPauseResume({ workspaceRoot, run }), false)
  assert.equal(await new FileRunControlStore({ workspaceRoot }).loadControl(run.runId), undefined)
})

test("manual pause resumes without asking for an automatic override", async () => {
  const { workspaceRoot, run } = await fixture()
  run.state["workflow.pause"] = JSON.stringify({ pauseReason: "manual" })
  const vscode = {
    window: {
      showQuickPick: async () => { throw new Error("quick pick must not open") },
      showInputBox: async () => { throw new Error("input must not open") }
    }
  }
  const { prepareAutomaticPauseResume } = loadUi(vscode)
  assert.equal(await prepareAutomaticPauseResume({ workspaceRoot, run }), true)
})
