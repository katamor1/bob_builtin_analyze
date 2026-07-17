const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { buildWorkflowRunDiagnosticReport } = require("../out/core/runDiagnostics.js")
const { CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION } = require("../out/core/runStateStore.js")

function fixture() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "run-state", "v1-basic.json"), "utf8"))
}

test("run diagnostics show current and future run-state access modes", () => {
  const current = fixture()
  const future = {
    ...fixture(),
    runId: "20260712T000000Z-future-000000000002",
    schemaVersion: "workflow-register/run-state/v2"
  }

  const report = buildWorkflowRunDiagnosticReport([current, future])
  const currentIndex = report.lines.indexOf(`## ${current.runId}`)
  const futureIndex = report.lines.indexOf(`## ${future.runId}`)

  assert.ok(currentIndex >= 0)
  assert.ok(futureIndex >= 0)
  assert.ok(report.lines.slice(currentIndex, futureIndex).includes(`- 実行状態スキーマ: ${CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION}`))
  assert.ok(report.lines.slice(futureIndex).includes("- 実行状態スキーマ: workflow-register/run-state/v2"))
  assert.ok(report.lines.slice(futureIndex).includes("- 実行状態へのアクセス: 読み取り専用"))
})

test("run diagnostics include isolated run document diagnostics", () => {
  const run = fixture()
  const report = buildWorkflowRunDiagnosticReport([run], {
    runDocumentDiagnostics: [
      {
        runId: "20260712T000000Z-invalid-000000000003",
        severity: "error",
        code: "invalid",
        message: "Workflow run contains invalid JSON."
      },
      {
        runId: run.runId,
        severity: "info",
        code: "migrated",
        message: `Migrated unversioned workflow run state to '${CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION}'.`
      }
    ]
  })

  assert.ok(report.lines.includes("実行状態ファイルの診断:"))
  assert.ok(report.lines.includes(`- ${run.runId} [info/migrated]: Migrated unversioned workflow run state to '${CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION}'.`))
  assert.ok(report.lines.includes("- 20260712T000000Z-invalid-000000000003 [error/invalid]: Workflow run contains invalid JSON."))
  assert.match(report.summary, /実行状態ファイルの診断 2件/)
})
