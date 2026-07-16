const assert = require("node:assert/strict")
const { test } = require("node:test")

function buildInput() {
  return {
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
    runs: [
      {
        root: "/repo",
        run: {
          runId: "target-run",
          workflowId: "qa.review",
          workflowName: "QA Review",
          status: "running",
          currentStep: "analyze",
          inputs: {},
          state: {
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
          },
          bobTaskSync: {
            schemaVersion: "workflow-register/bob-task-sync/v1",
            projectionVersion: 1,
            completedThroughIndex: 0,
            completedThroughStepId: "collect",
            liveTaskAvailable: false,
            drift: { status: "synced", reason: "inspect", detectedAt: "2026-07-12T00:00:30.000Z" }
          },
          steps: [
            { id: "collect", title: "Collect", type: "agent", status: "completed" },
            { id: "analyze", title: "Analyze", type: "agent", status: "pending" }
          ],
          createdAt: "2026-07-12T00:00:00.000Z",
          updatedAt: "2026-07-12T00:01:00.000Z"
        }
      }
    ]
  }
}

test("Operation Hub distinguishes reused steps and traces verified artifacts", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const model = buildOperationHubModel(buildInput())
  const run = model.runMonitor[0]

  assert.equal(run.stepProvenance.length, 2)
  assert.deepEqual(run.stepProvenance[0], {
    stepId: "collect",
    title: "Collect",
    status: "completed",
    completionLabel: "再利用",
    detail: "成果物を再利用したため省略 · 再利用元: source-run · 成果物を確認済み · 成果物: context-artifact · 復元した状態キー: context",
    reused: true
  })
  assert.equal(run.stepProvenance[1].completionLabel, "未開始")
  assert.equal(run.stepProvenance[1].reused, false)
})

test("Operation Hub renders reused provenance and does not call a stored projection live-synced", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const model = buildOperationHubModel(buildInput())
  const run = model.runMonitor[0]
  const html = renderOperationHubHtml({ cspSource: "vscode-resource:", nonce: "nonce", model })

  assert.equal(run.bobTaskSyncStatus, "warning")
  assert.match(run.bobTaskSyncLabel, /保存済みの進捗のみ/)
  assert.doesNotMatch(run.bobTaskSyncLabel, /^Bob Todo: 同期済み$/)
  assert.match(html, /Collect/)
  assert.match(html, /再利用/)
  assert.match(html, /成果物を再利用したため省略/)
  assert.match(html, /context-artifact/)
  assert.match(html, /source-run/)
})
