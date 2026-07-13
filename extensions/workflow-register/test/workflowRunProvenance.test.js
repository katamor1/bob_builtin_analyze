const assert = require("node:assert/strict")
const { test } = require("node:test")

function baseRun(state = {}) {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "target-run",
    workflowId: "qa.review",
    workflowName: "QA Review",
    status: "running",
    currentStep: "analyze",
    inputs: {},
    state,
    steps: [
      { id: "collect", title: "Collect", type: "agent", status: "completed" },
      { id: "analyze", title: "Analyze", type: "agent", status: "pending" },
      { id: "publish", title: "Publish", type: "result", status: "pending" }
    ],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:01:00.000Z"
  }
}

function reuseState() {
  return JSON.stringify({
    schemaVersion: "workflow-register/artifact-reuse/v1",
    sourceRunId: "source-run",
    sourceWorkflowId: "qa.review",
    sourceWorkflowDefinitionHash: "sha256:old",
    startStepId: "analyze",
    reusedStepIds: ["collect", "collect", "missing-step"],
    hydratedKeys: ["context", "context"],
    createdAt: "2026-07-12T00:00:30.000Z"
  })
}

function hydrationState() {
  return JSON.stringify({
    schemaVersion: "workflow-register/artifact-hydration/v1",
    sourceRunId: "source-run",
    sourceWorkflowId: "qa.review",
    sourceWorkflowDefinitionHash: "sha256:old",
    hydratedAt: "2026-07-12T00:00:30.000Z",
    hydrated: [
      {
        stateKey: "context",
        artifactId: "context-artifact",
        producedBy: "collect",
        path: ".bob/workflows/runs/source-run/artifacts/collect/context.md",
        sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        bytes: 12,
        sourceRunId: "source-run"
      }
    ]
  })
}

test("projects reused completion, source run, verified artifacts and hydrated keys per step", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  const run = baseRun({
    "workflow.artifactReuse": reuseState(),
    "workflow.artifactHydration": hydrationState()
  })

  const projection = projectWorkflowRunProvenance(run)
  const collect = projection.steps.find((step) => step.stepId === "collect")
  const analyze = projection.steps.find((step) => step.stepId === "analyze")

  assert.equal(projection.sourceRunId, "source-run")
  assert.equal(projection.startStepId, "analyze")
  assert.deepEqual(projection.reusedStepIds, ["collect", "missing-step"])
  assert.deepEqual(projection.hydratedStateKeys, ["context"])
  assert.deepEqual(projection.artifactIds, ["context-artifact"])

  assert.equal(collect.completion, "reused")
  assert.equal(collect.skippedByArtifactReuse, true)
  assert.equal(collect.sourceRunId, "source-run")
  assert.deepEqual(collect.artifactIds, ["context-artifact"])
  assert.deepEqual(collect.hydratedStateKeys, ["context"])
  assert.equal(collect.artifactVerified, true)
  assert.equal(collect.importedFromTaskSnapshot, false)

  assert.equal(analyze.completion, "not-completed")
  assert.equal(analyze.skippedByArtifactReuse, false)
  assert.equal(analyze.artifactVerified, false)
})

test("projects task snapshot import and definition mismatch without body text", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  const secretBody = "do-not-project-this-body"
  const run = baseRun({
    "workflow.taskSnapshotImport": JSON.stringify({
      schemaVersion: "workflow-register/task-snapshot-import/v1",
      sourceRunId: "target-run",
      importedAt: "2026-07-12T00:02:00.000Z",
      imported: [
        {
          artifactId: "analysis",
          stateKey: "analysis",
          producedBy: "analyze",
          snapshotReason: "agent-output",
          snapshotCreatedAt: "2026-07-12T00:01:30.000Z",
          path: ".bob/workflows/runs/target-run/artifacts/analyze/analysis.md",
          sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          bytes: secretBody.length
        }
      ],
      body: secretBody
    }),
    "workflow.definitionMismatch": JSON.stringify({
      runHash: "sha256:old",
      currentHash: "sha256:new",
      detectedAt: "2026-07-12T00:01:00.000Z"
    })
  })

  const projection = projectWorkflowRunProvenance(run)
  const analyze = projection.steps.find((step) => step.stepId === "analyze")
  const serialized = JSON.stringify(projection)

  assert.equal(projection.definitionMismatchAllowed, true)
  assert.equal(projection.taskSnapshotImportCount, 1)
  assert.equal(projection.taskSnapshotImportedAt, "2026-07-12T00:02:00.000Z")
  assert.equal(analyze.importedFromTaskSnapshot, true)
  assert.deepEqual(analyze.artifactIds, ["analysis"])
  assert.doesNotMatch(serialized, new RegExp(secretBody))
})

test("malformed optional provenance does not break projection", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  const projection = projectWorkflowRunProvenance(baseRun({
    "workflow.artifactReuse": "{broken",
    "workflow.artifactHydration": "[]",
    "workflow.taskSnapshotImport": "null",
    "workflow.definitionMismatch": "not-json"
  }))

  assert.equal(projection.sourceRunId, undefined)
  assert.deepEqual(projection.reusedStepIds, [])
  assert.deepEqual(projection.hydratedStateKeys, [])
  assert.deepEqual(projection.artifactIds, [])
  assert.equal(projection.definitionMismatchAllowed, false)
  assert.equal(projection.taskSnapshotImportCount, 0)
  assert.equal(projection.steps.length, 3)
})

test("normal completed steps remain distinguishable from reused completed steps", () => {
  const { projectWorkflowRunProvenance } = require("../out/core/runProvenance")
  const run = baseRun({ "workflow.artifactReuse": reuseState() })
  run.steps[1].status = "completed"

  const projection = projectWorkflowRunProvenance(run)
  assert.equal(projection.steps[0].completion, "reused")
  assert.equal(projection.steps[1].completion, "normal")
})
