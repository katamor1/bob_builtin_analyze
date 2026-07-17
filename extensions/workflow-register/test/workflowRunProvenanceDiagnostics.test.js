const assert = require("node:assert/strict")
const { test } = require("node:test")

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
      context: "private hydrated body must not be printed",
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
      })
    },
    steps: [
      { id: "collect", title: "Collect", type: "agent", status: "completed" },
      { id: "analyze", title: "Analyze", type: "agent", status: "pending" }
    ],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:01:00.000Z"
  }
}

test("Run Diagnostics shows reuse provenance per step without state values", () => {
  const { formatWorkflowRunDiagnostics } = require("../out/core/runDiagnostics")
  const output = formatWorkflowRunDiagnostics(run()).join("\n")

  assert.match(output, /ワークフローの来歴:/)
  assert.match(output, /再利用元の実行: source-run/)
  assert.match(output, /開始ステップ: analyze/)
  assert.match(output, /再利用したステップ: collect/)
  assert.match(output, /復元した状態キー: context/)
  assert.match(output, /確認済みの成果物: context-artifact/)
  assert.match(output, /collect: 完了; 完了元（completionSource）=再利用; 成果物再利用による省略=はい; 成果物=context-artifact; 復元した状態キー=context/)
  assert.match(output, /analyze: 未開始; 完了元（completionSource）=未完了; 成果物再利用による省略=いいえ/)
  assert.doesNotMatch(output, /private hydrated body must not be printed/)
  assert.doesNotMatch(output, /sha256:aaaaaaaa/)
})
