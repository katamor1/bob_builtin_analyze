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
      {
        id: "approve",
        title: "Approve",
        type: "manual",
        form: {
          resultKey: "decision",
          fields: [{ id: "notes", type: "string", required: true }]
        },
        stateRequired: true,
        includeState: ["context"]
      },
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
    state: { context: "captured", decision: JSON.stringify({ notes: "approved offline" }) },
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

test("detached compatible held run with persisted form result can resume", () => {
  const result = classify()
  assert.equal(result.kind, "detached-resumable")
  assert.equal(result.primaryAction.id, "resume-saved-state")
  assert.equal(result.nextStepId, "publish")
  assert.deepEqual(result.blockers, [])
  assert.deepEqual(result.evidence.missingRequiredStateKeys, [])
})

test("manual form result must exist and contain every required field", () => {
  const missing = classify({ run: heldRun({ state: { context: "captured" } }) })
  assert.equal(missing.kind, "blocked")
  assert.match(missing.blockers.join("\n"), /manual form result 'decision'/i)

  const incomplete = classify({ run: heldRun({ state: { context: "captured", decision: JSON.stringify({ notes: "" }) } }) })
  assert.equal(incomplete.kind, "blocked")
  assert.match(incomplete.blockers.join("\n"), /required manual form field 'notes'/i)
})

test("manual approval result must contain a persisted decision", () => {
  const definition = workflow()
  definition.engineSteps[1] = {
    id: "approve",
    title: "Approve",
    type: "manual",
    approval: { resultKey: "approval" },
    stateRequired: true,
    includeState: ["context"]
  }
  const missing = classify({
    workflow: definition,
    run: heldRun({ state: { context: "captured" } })
  })
  assert.equal(missing.kind, "blocked")
  assert.match(missing.blockers.join("\n"), /manual approval result 'approval'/i)

  const available = classify({
    workflow: definition,
    run: heldRun({ state: { context: "captured", approval: JSON.stringify({ decision: "approved" }) } })
  })
  assert.equal(available.kind, "detached-resumable")
})

test("state required by the next step blocks direct resume", () => {
  const definition = workflow()
  definition.engineSteps[1] = { id: "approve", title: "Approve", type: "manual", userAction: { message: "Check the release." } }
  definition.engineSteps[2] = {
    id: "publish",
    title: "Publish",
    type: "result",
    stateRequired: true,
    includeState: ["releaseToken"],
    result: { source: "literal", text: "done", sinks: [] }
  }
  const result = classify({
    workflow: definition,
    run: heldRun({ state: { context: "captured" } })
  })
  assert.equal(result.kind, "blocked")
  assert.deepEqual(result.evidence.missingRequiredStateKeys, ["releaseToken"])
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
  const run = heldRun({ state: { decision: JSON.stringify({ notes: "approved offline" }) } })
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
