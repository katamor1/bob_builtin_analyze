const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

function run() {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "target-run",
    workflowId: "qa.review",
    workflowName: "QA Review",
    status: "running",
    currentStep: "analyze",
    inputs: {},
    state: {
      context: "secret hydrated body must not reach Bob controls",
      "workflow.artifactReuse": JSON.stringify({
        schemaVersion: "workflow-register/artifact-reuse/v1",
        sourceRunId: "source-run",
        sourceWorkflowId: "qa.review",
        startStepId: "analyze",
        reusedStepIds: ["collect"],
        hydratedKeys: ["context"],
        createdAt: "2026-07-12T00:00:00.000Z"
      }),
      "workflow.artifactHydration": JSON.stringify({
        schemaVersion: "workflow-register/artifact-hydration/v1",
        sourceRunId: "source-run",
        sourceWorkflowId: "qa.review",
        hydratedAt: "2026-07-12T00:00:00.000Z",
        hydrated: [{
          stateKey: "context",
          artifactId: "context-artifact",
          producedBy: "collect",
          path: ".bob/workflows/runs/source-run/artifacts/collect/context.md",
          sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          bytes: 12,
          sourceRunId: "source-run"
        }]
      }),
      "workflow.taskSnapshotImport": JSON.stringify({
        schemaVersion: "workflow-register/task-snapshot-import/v1",
        sourceRunId: "target-run",
        importedAt: "2026-07-12T00:02:00.000Z",
        imported: [{ artifactId: "analysis", stateKey: "analysis", producedBy: "analyze" }]
      }),
      "workflow.definitionMismatch": JSON.stringify({ runHash: "old", currentHash: "new" })
    },
    steps: [
      { id: "collect", title: "Collect", type: "agent", status: "completed" },
      { id: "analyze", title: "Analyze", type: "agent", status: "pending" }
    ],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:01:00.000Z"
  }
}

test("Bob control block includes bounded reuse provenance without state values", () => {
  const {
    projectWorkflowRunProvenance,
    workflowRunProvenanceControlLines
  } = require("../out/core/runProvenance")
  const { buildWorkflowControlBlock } = require("../out/bobWorkflowMessages")
  const targetRun = run()
  const lines = workflowRunProvenanceControlLines(projectWorkflowRunProvenance(targetRun))
  const message = buildWorkflowControlBlock({
    runId: targetRun.runId,
    stepId: targetRun.currentStep,
    status: targetRun.status,
    currentStep: targetRun.currentStep,
    provenanceLines: lines
  })

  assert.match(message, /ワークフローの来歴:/)
  assert.match(message, /再利用元の実行: source-run/)
  assert.match(message, /再利用したステップ: collect/)
  assert.match(message, /確認済みの成果物: context-artifact/)
  assert.match(message, /復元した状態キー: context/)
  assert.match(message, /保存済みタスクから取り込み: 1件/)
  assert.match(message, /定義の差異を許可: はい/)
  assert.doesNotMatch(message, /secret hydrated body/)
  assert.doesNotMatch(message, /sha256:aaaaaaaa/)
})

test("Bob provenance lists are bounded", () => {
  const { workflowRunProvenanceControlLines } = require("../out/core/runProvenance")
  const ids = Array.from({ length: 25 }, (_, index) => `step-${index + 1}`)
  const lines = workflowRunProvenanceControlLines({
    sourceRunId: "source-run",
    startStepId: "step-26",
    reusedStepIds: ids,
    hydratedStateKeys: ids.map((id) => `key-${id}`),
    artifactIds: ids.map((id) => `artifact-${id}`),
    definitionMismatchAllowed: false,
    taskSnapshotImportCount: 0,
    steps: ids.map((id) => ({
      stepId: id,
      title: id,
      runStatus: "completed",
      completion: "reused",
      skippedByArtifactReuse: true,
      sourceRunId: "source-run",
      artifactIds: [`artifact-${id}`],
      hydratedStateKeys: [`key-${id}`],
      artifactVerified: true,
      importedFromTaskSnapshot: false
    }))
  }, 20)
  const output = lines.join("\n")

  assert.match(output, /step-20/)
  assert.doesNotMatch(output, /step-21(?:,|$)/)
  assert.match(output, /（ほか5件）/)
})

test("Bob runner derives control provenance from the persisted run", () => {
  const source = readSrc("bobWorkflowRunner.ts")
  assert.match(source, /projectWorkflowRunProvenance\(run\)/)
  assert.match(source, /workflowRunProvenanceControlLines/)
  assert.match(source, /provenanceLines:/)
})
