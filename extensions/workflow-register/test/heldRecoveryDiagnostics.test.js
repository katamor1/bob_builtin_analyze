const assert = require("node:assert/strict")
const { test } = require("node:test")

function run(value) {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "run-recovered",
    workflowId: "qa.review",
    workflowName: "QA Review",
    status: "running",
    currentStep: "publish",
    inputs: {},
    state: {
      "workflow.heldRecovery": value,
      context: "secret state value",
      decision: "private form value"
    },
    steps: [
      { id: "approve", title: "Approve", type: "manual", status: "completed" },
      { id: "publish", title: "Publish", type: "result", status: "pending" }
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T01:00:00.000Z"
  }
}

function record(overrides = {}) {
  return JSON.stringify({
    schemaVersion: "workflow-register/held-recovery/v1",
    kind: "saved-state",
    runId: "run-recovered",
    stepId: "approve",
    nextStepId: "publish",
    recoveredAt: "2026-07-13T00:59:00.000Z",
    source: "operation-hub",
    ...overrides
  })
}

test("run provenance projects held recovery metadata", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  const projection = projectWorkflowRunProvenance(run(record()))
  assert.deepEqual(projection.heldRecovery, {
    kind: "saved-state",
    runId: "run-recovered",
    stepId: "approve",
    nextStepId: "publish",
    recoveredAt: "2026-07-13T00:59:00.000Z",
    source: "operation-hub"
  })
})

test("run diagnostics display held recovery metadata without state values", () => {
  const { formatWorkflowRunDiagnostics } = require("../out/core/runDiagnostics")
  const text = formatWorkflowRunDiagnostics(run(record())).join("\n")
  assert.match(text, /Held run recovery:/)
  assert.match(text, /kind: saved-state/)
  assert.match(text, /step: approve/)
  assert.match(text, /next step: publish/)
  assert.match(text, /recovered: 2026-07-13T00:59:00.000Z/)
  assert.match(text, /source: operation-hub/)
  assert.doesNotMatch(text, /secret state value|private form value/)
})

test("malformed or unsafe held recovery metadata is ignored", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  assert.equal(projectWorkflowRunProvenance(run("{bad json")).heldRecovery, undefined)
  assert.equal(projectWorkflowRunProvenance(run(record({ stepId: "approve\nforged" }))).heldRecovery, undefined)
  assert.equal(projectWorkflowRunProvenance(run(record({ schemaVersion: "workflow-register/held-recovery/v2" }))).heldRecovery, undefined)
  assert.equal(projectWorkflowRunProvenance(run(record({ runId: "different-run" }))).heldRecovery, undefined)
})
