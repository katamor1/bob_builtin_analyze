const assert = require("node:assert/strict")
const { test } = require("node:test")

const { buildRunControlReportLines } = require("../out/commands/runControlReport")

test("run-control report expands automatic pause and override metadata", () => {
  const run = {
    runId: "run-1",
    workflowId: "workflow-register.automatic-pause",
    workflowName: "automatic-pause",
    status: "paused",
    currentStep: "summarize",
    inputs: {},
    state: {
      "workflow.pause": JSON.stringify({
        schemaVersion: "workflow-register/automatic-pause/v1",
        kind: "pauseAtLocalTime",
        source: "workflow",
        checkpoint: "after-step:analyze",
        nextStepId: "summarize",
        limit: { pauseAtLocalTime: "18:00", timezone: "Asia/Tokyo" },
        observed: { localTime: "18:01", timezone: "Asia/Tokyo" },
        detectedAt: "2026-07-12T09:01:00.000Z"
      })
    },
    steps: [],
    createdAt: "2026-07-12T08:00:00.000Z",
    updatedAt: "2026-07-12T09:01:00.000Z"
  }
  const control = {
    schemaVersion: "workflow-register/run-control/v1",
    runId: run.runId,
    automaticPauseOverride: {
      schemaVersion: "workflow-register/automatic-pause-override/v1",
      createdAt: "2026-07-12T09:02:00.000Z",
      expiresAt: "2026-07-12T09:32:00.000Z",
      requestedBy: "operator",
      reason: "Complete approved work"
    }
  }

  const lines = buildRunControlReportLines({ runId: run.runId, root: "/workspace", run, control })

  assert.ok(lines.includes("- 自動一時停止種別（automaticPauseKind）: pauseAtLocalTime"))
  assert.ok(lines.includes("- 自動一時停止の設定元（automaticPauseSource）: workflow"))
  assert.ok(lines.includes("- 自動一時停止の区切り（automaticPauseCheckpoint）: after-step:analyze"))
  assert.ok(lines.includes("- 自動一時停止の検出日時（automaticPauseDetectedAt）: 2026-07-12T09:01:00.000Z"))
  assert.ok(lines.includes("- 自動停止上書きスキーマ（automaticOverrideSchema）: workflow-register/automatic-pause-override/v1"))
  assert.ok(lines.includes("- 自動停止上書きの依頼元（automaticOverrideRequestedBy）: operator"))
  assert.ok(lines.includes("- 自動停止上書きの作成日時（automaticOverrideCreatedAt）: 2026-07-12T09:02:00.000Z"))
  assert.ok(lines.includes("- 自動停止上書きの有効期限（automaticOverrideExpiresAt）: 2026-07-12T09:32:00.000Z"))
  assert.ok(lines.includes("- 自動停止上書きの理由（automaticOverrideReason）: Complete approved work"))
})
