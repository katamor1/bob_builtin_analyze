const assert = require("node:assert/strict")
const { test } = require("node:test")

function workflow() {
  return {
    id: "qa.review",
    name: "qa-review",
    label: "QA Review",
    description: "QA review",
    schemaVersion: "workflow-register/v1",
    definitionHash: "sha256:current",
    filePath: ".bob/workflows/qa-review/WORKFLOW.md",
    inputs: {},
    artifacts: [],
    stepExecution: { mode: "engineSteps", allowOutOfOrder: false, showInBob: true },
    engineSteps: [
      { id: "collect", title: "Collect", type: "agent", prompt: "Collect", resultKey: "context" },
      { id: "approve", title: "Approve", type: "manual", form: { resultKey: "decision", fields: [] }, stateRequired: true, includeState: ["context"] },
      { id: "publish", title: "Publish", type: "result", result: { source: "state", stateKey: "decision" } }
    ]
  }
}

function heldRun(overrides = {}) {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "run-held",
    workflowId: "qa.review",
    workflowName: "QA Review",
    workflowDefinitionHash: "sha256:current",
    status: "held",
    currentStep: "approve",
    inputs: {},
    state: { context: "captured" },
    steps: [
      { id: "collect", title: "Collect", type: "agent", status: "completed" },
      { id: "approve", title: "Approve", type: "manual", status: "held" },
      { id: "publish", title: "Publish", type: "result", status: "pending" }
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:01:00.000Z",
    ...overrides
  }
}

function classify(overrides = {}) {
  const { classifyHeldRunRecovery } = require("../out/core/heldRunRecovery")
  return classifyHeldRunRecovery({
    run: heldRun(),
    workflow: workflow(),
    liveTaskAvailable: false,
    activeManualStepAvailable: false,
    artifactManifestAvailable: false,
    taskSnapshotAvailable: false,
    ...overrides
  })
}

test("non-held runs do not expose a recovery action", () => {
  const result = classify({ run: heldRun({ status: "paused" }) })
  assert.equal(result.kind, "not-held")
  assert.equal(result.primaryAction.id, "none")
})

test("connected held run opens the active manual step", () => {
  const result = classify({ liveTaskAvailable: true, activeManualStepAvailable: true })
  assert.equal(result.kind, "connected")
  assert.equal(result.primaryAction.id, "open-manual-step")
  assert.equal(result.stepId, "approve")
  assert.equal(result.evidence.liveTaskAvailable, true)
})

test("detached compatible held run can resume from saved state", () => {
  const result = classify()
  assert.equal(result.kind, "detached-resumable")
  assert.equal(result.primaryAction.id, "resume-saved-state")
  assert.equal(result.nextStepId, "publish")
  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.evidence.missingRequiredStateKeys, [])
})

test("definition mismatch blocks direct resume but chooses artifacts when available", () => {
  const result = classify({
    run: heldRun({ workflowDefinitionHash: "sha256:old" }),
    artifactManifestAvailable: true
  })
  assert.equal(result.kind, "detached-artifact-recoverable")
  assert.equal(result.primaryAction.id, "review-artifacts")
  assert.match(result.blockers.join("\n"), /definition/i)
})

test("missing required state chooses snapshot recovery when available", () => {
  const run = heldRun({ state: {} })
  const result = classify({ run, taskSnapshotAvailable: true })
  assert.equal(result.kind, "detached-artifact-recoverable")
  assert.equal(result.primaryAction.id, "review-task-snapshot")
  assert.deepEqual(result.evidence.missingRequiredStateKeys, ["context"])
})

test("missing workflow is blocked when no recovery evidence exists", () => {
  const result = classify({ workflow: undefined })
  assert.equal(result.kind, "blocked")
  assert.equal(result.primaryAction.id, "open-diagnostics")
  assert.match(result.blockers.join("\n"), /workflow definition/i)
})

test("missing current held step is blocked", () => {
  const run = heldRun({ currentStep: "missing" })
  const result = classify({ run })
  assert.equal(result.kind, "blocked")
  assert.equal(result.primaryAction.id, "open-diagnostics")
  assert.match(result.blockers.join("\n"), /current held step/i)
})

test("classifier is pure", () => {
  const run = heldRun()
  const before = structuredClone(run)
  classify({ run })
  assert.deepEqual(run, before)
})
