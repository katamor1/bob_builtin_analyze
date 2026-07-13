const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

function run() {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "run-held",
    workflowId: "qa.review",
    workflowName: "QA Review",
    status: "held",
    currentStep: "approve",
    inputs: {},
    state: { context: "secret state value", decision: "private form value" },
    steps: [
      { id: "collect", title: "Collect", type: "agent", status: "completed" },
      { id: "approve", title: "Approve", type: "manual", status: "held" },
      { id: "publish", title: "Publish", type: "result", status: "pending" }
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:01:00.000Z"
  }
}

function assessment() {
  return {
    kind: "detached-resumable",
    runId: "run-held",
    stepId: "approve",
    nextStepId: "publish",
    title: "Held run can resume from saved state",
    explanation: "Explicit confirmation is required.",
    primaryAction: { id: "resume-saved-state", label: "Resume from saved state" },
    blockers: [],
    evidence: {
      liveTaskAvailable: false,
      activeManualStepAvailable: false,
      workflowLoaded: true,
      definitionCompatible: true,
      artifactManifestAvailable: false,
      taskSnapshotAvailable: false,
      missingRequiredStateKeys: []
    }
  }
}

test("held recovery preview and provenance contain metadata but no state values", () => {
  const {
    HELD_RECOVERY_STATE_KEY,
    buildHeldRunRecoveryPreview,
    createHeldRunRecoveryProvenance
  } = require("../out/core/heldRunRecovery")
  const preview = buildHeldRunRecoveryPreview(run(), assessment())
  const text = preview.join("\n")
  assert.equal(HELD_RECOVERY_STATE_KEY, "workflow.heldRecovery")
  assert.match(text, /run-held/)
  assert.match(text, /approve/)
  assert.match(text, /publish/)
  assert.match(text, /context, decision/)
  assert.doesNotMatch(text, /secret state value|private form value/)

  const provenance = createHeldRunRecoveryProvenance({
    runId: "run-held",
    stepId: "approve",
    nextStepId: "publish",
    recoveredAt: "2026-07-13T01:00:00.000Z",
    source: "operation-hub"
  })
  assert.deepEqual(provenance, {
    schemaVersion: "workflow-register/held-recovery/v1",
    kind: "saved-state",
    runId: "run-held",
    stepId: "approve",
    nextStepId: "publish",
    recoveredAt: "2026-07-13T01:00:00.000Z",
    source: "operation-hub"
  })
  assert.doesNotMatch(JSON.stringify(provenance), /secret|private/)
})

test("dedicated recovery command preserves preview-confirm-gate-guarded-resume boundary", () => {
  const source = readSrc("workflowRunCommands.ts")
  const start = source.indexOf("async recoverDetachedHeldRun")
  assert.notEqual(start, -1)
  const body = source.slice(start, source.indexOf("\n  async ", start + 10))
  const preview = body.indexOf("buildHeldRunRecoveryPreview")
  const confirmation = body.indexOf("const accepted = await vscode.window.showWarningMessage", preview)
  const gate = body.indexOf('"held-recovery"')
  const guardedResume = body.indexOf("resumeRunGuarded")
  const beforeResume = body.indexOf("beforeResume:", guardedResume)
  const secondClassification = body.indexOf("assessHeldRunRecovery", beforeResume)
  const afterResume = body.indexOf("afterResume:", secondClassification)
  const provenance = body.indexOf("HELD_RECOVERY_STATE_KEY", afterResume)
  assert.ok(preview >= 0)
  assert.ok(confirmation > preview)
  assert.ok(gate > confirmation)
  assert.ok(guardedResume > gate)
  assert.ok(beforeResume > guardedResume)
  assert.ok(secondClassification > beforeResume)
  assert.ok(afterResume > secondClassification)
  assert.ok(provenance > afterResume)
  assert.match(body, /completeHeldStep: true/)
  assert.match(body, /executionMode: "singleStep"/)
  assert.doesNotMatch(body, /coordinateWorkflowRunExecution\(runStore, selection\.runId, "recoverDetachedHeldRun"/)
})

test("ordinary resume guards held runs before completeHeldStep", () => {
  const source = readSrc("workflowRunCommands.ts")
  const start = source.indexOf("private async resumeOrRetryRunOnce")
  const end = source.indexOf("private updateLiveGateAfterCommand", start)
  const body = source.slice(start, end)
  const heldGuard = body.indexOf('run.status === "held"')
  const completion = body.indexOf("completeHeldStep: true")
  assert.ok(heldGuard >= 0)
  assert.ok(completion > heldGuard)
  assert.match(body, /recoverDetachedHeldRun/)
})

test("extension and package contribute detached held recovery command", () => {
  const extension = readSrc("extension.ts")
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, "..", "package.json"), "utf8"))
  assert.match(extension, /workflowRegister\.recoverDetachedHeldRun/)
  assert.ok(packageJson.activationEvents.includes("onCommand:workflowRegister.recoverDetachedHeldRun"))
  assert.ok(packageJson.contributes.commands.some((item) => item.command === "workflowRegister.recoverDetachedHeldRun"))
})
