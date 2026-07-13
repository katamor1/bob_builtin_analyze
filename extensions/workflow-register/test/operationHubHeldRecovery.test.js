const assert = require("node:assert/strict")
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
    state: {},
    steps: [
      { id: "collect", title: "Collect", type: "agent", status: "completed" },
      { id: "approve", title: "Approve", type: "manual", status: "held" },
      { id: "publish", title: "Publish", type: "result", status: "pending" }
    ],
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:01:00.000Z"
  }
}

function recovery(kind, actionId, overrides = {}) {
  return {
    kind,
    runId: "run-held",
    stepId: "approve",
    nextStepId: "publish",
    title: `Recovery ${kind}`,
    explanation: `Explanation for ${kind}`,
    primaryAction: { id: actionId, label: actionId },
    blockers: overrides.blockers ?? [],
    evidence: {
      liveTaskAvailable: false,
      activeManualStepAvailable: false,
      workflowLoaded: true,
      definitionCompatible: true,
      artifactManifestAvailable: false,
      taskSnapshotAvailable: false,
      missingRequiredStateKeys: [],
      ...overrides.evidence
    }
  }
}

function summary(heldRecovery, state = {}) {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const heldRun = run()
  heldRun.state = state
  return buildOperationHubModel({
    workspaceName: "repo",
    workspaceRoots: ["/repo"],
    extensionStatus: [],
    setup: {
      bobRootPresent: true,
      workflowsPresent: true,
      runStatePresent: true,
      mcpConfigPresent: true,
      traceabilityPresent: false
    },
    workflows: [],
    runs: [{ root: "/repo", run: heldRun, revision: "sha256:run", heldRecovery }]
  }).runMonitor[0]
}

function primaryIds(item) {
  return item.primaryActions.filter((action) => action.variant === "primary").map((action) => action.id)
}

test("connected held run exposes only the manual-step primary action", () => {
  const item = summary(recovery("connected", "open-manual-step"))
  assert.deepEqual(primaryIds(item), ["openManualStepPanel"])
  assert.equal(item.primaryActions.some((action) => action.id === "runNextStep"), false)
})

test("detached resumable held run exposes only dedicated recovery", () => {
  const item = summary(recovery("detached-resumable", "resume-saved-state"))
  assert.deepEqual(primaryIds(item), ["recoverDetachedHeldRun"])
  assert.match(item.heldRecoveryExplanation, /detached-resumable/)
})

test("artifact and snapshot recovery select their corresponding primary actions", () => {
  const manifest = JSON.stringify({
    schemaVersion: "workflow-register/artifact-manifest/v1",
    workflowId: "qa.review",
    runId: "run-held",
    inputsHash: "sha256:ignored",
    createdAt: "2026-07-13T00:00:00.000Z",
    updatedAt: "2026-07-13T00:00:00.000Z",
    artifacts: [
      {
        id: "context",
        stateKey: "context",
        producedBy: "collect",
        path: ".bob/workflows/runs/run-held/artifacts/collect/context.txt",
        sha256: "sha256:context",
        bytes: 12,
        source: "workflow-artifact",
        updatedAt: "2026-07-13T00:00:00.000Z"
      }
    ]
  })
  const artifact = summary(recovery("detached-artifact-recoverable", "review-artifacts"), {
    "workflow.artifactManifest": manifest
  })
  const snapshot = summary(recovery("detached-artifact-recoverable", "review-task-snapshot"))
  assert.deepEqual(primaryIds(artifact), ["startFromArtifacts"])
  assert.deepEqual(primaryIds(snapshot), ["importTaskSnapshotArtifacts"])
})

test("blocked held run exposes diagnostics as its only primary action", () => {
  const item = summary(recovery("blocked", "open-diagnostics", { blockers: ["Required workflow state is missing: context."] }))
  assert.deepEqual(primaryIds(item), ["inspectRunControl"])
  assert.deepEqual(item.heldRecoveryBlockers, ["Required workflow state is missing: context."])
})

test("Operation Hub provider gathers live task, manual-step and snapshot evidence", () => {
  const source = readSrc("gui", "operationHubProvider.ts")
  assert.match(source, /classifyHeldRunRecovery/)
  assert.match(source, /reviewTaskRegistry\.taskForRun/)
  assert.match(source, /reviewTaskRegistry\.taskForStep/)
  assert.match(source, /FileTaskSnapshotStore/)
})
