const assert = require("node:assert/strict")
const { test } = require("node:test")

const { buildWorkflowRunDiagnosticReport } = require("../out/core/runDiagnostics")

function run() {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "20260712T120000Z-automatic-pause",
    workflowId: "workflow-register.automatic-pause",
    workflowName: "automatic-pause",
    status: "paused",
    currentStep: "summarize",
    inputs: {},
    state: {
      "workflow.pause": JSON.stringify({
        schemaVersion: "workflow-register/automatic-pause/v1",
        kind: "maxAgentStepsPerRun",
        source: "workspace",
        checkpoint: "after-step:analyze",
        nextStepId: "summarize",
        limit: { maxAgentStepsPerRun: 6 },
        observed: { agentStepsExecuted: 6 },
        detectedAt: "2026-07-12T12:00:00.000Z"
      })
    },
    steps: [
      { id: "analyze", title: "Analyze", type: "agent", status: "completed" },
      { id: "summarize", title: "Summarize", type: "agent", status: "pending" }
    ],
    createdAt: "2026-07-12T11:00:00.000Z",
    updatedAt: "2026-07-12T12:00:00.000Z"
  }
}

test("run diagnostics show structured automatic-pause and override evidence", () => {
  const workflowRun = run()
  const report = buildWorkflowRunDiagnosticReport([workflowRun], {
    controlsByRunId: {
      [workflowRun.runId]: {
        schemaVersion: "workflow-register/run-control/v1",
        runId: workflowRun.runId,
        automaticPauseOverride: {
          schemaVersion: "workflow-register/automatic-pause-override/v1",
          createdAt: "2026-07-12T12:01:00.000Z",
          expiresAt: "2026-07-12T12:31:00.000Z",
          requestedBy: "operator",
          reason: "Finish the approved report"
        }
      }
    }
  })

  assert.ok(report.lines.includes("自動一時停止:"))
  assert.ok(report.lines.includes("- 種別: maxAgentStepsPerRun"))
  assert.ok(report.lines.includes("- 設定元: workspace"))
  assert.ok(report.lines.includes("- 区切り: after-step:analyze"))
  assert.ok(report.lines.includes("- 次のステップ: summarize"))
  assert.ok(report.lines.includes("- 上限.maxAgentStepsPerRun: 6"))
  assert.ok(report.lines.includes("- 検出値.agentStepsExecuted: 6"))
  assert.ok(report.lines.includes("自動一時停止の一時解除:"))
  assert.ok(report.lines.includes("- 依頼者: operator"))
  assert.ok(report.lines.includes("- 作成日時: 2026-07-12T12:01:00.000Z"))
  assert.ok(report.lines.includes("- 有効期限: 2026-07-12T12:31:00.000Z"))
  assert.ok(report.lines.includes("- 理由: Finish the approved report"))
})
