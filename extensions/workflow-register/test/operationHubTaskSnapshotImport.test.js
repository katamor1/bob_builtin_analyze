const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

function importRecord() {
  return JSON.stringify({
    schemaVersion: "workflow-register/task-snapshot-import/v1",
    sourceRunId: "run-imported",
    importedAt: "2026-07-12T12:34:56.000Z",
    imported: [
      {
        artifactId: "draft",
        stateKey: "draft",
        producedBy: "draft",
        snapshotReason: "agent-output",
        snapshotCreatedAt: "2026-07-12T12:30:00.000Z",
        path: ".bob/workflows/runs/run-imported/artifacts/draft/draft.md",
        sha256: "abc",
        bytes: 123
      }
    ]
  })
}

function run() {
  return {
    runId: "run-imported",
    workflowId: "workflow-register.import",
    workflowName: "Import Workflow",
    status: "completed",
    inputs: {},
    state: { "workflow.taskSnapshotImport": importRecord() },
    steps: [{ id: "draft", title: "Draft", type: "agent", status: "completed" }],
    createdAt: "2026-07-12T12:00:00.000Z",
    updatedAt: "2026-07-12T12:35:00.000Z"
  }
}

test("Operation Hub exposes task snapshot import provenance as a distinct badge", () => {
  const { buildOperationHubModel } = require("../out/gui/operationHubModel")
  const { renderOperationHubHtml } = require("../out/gui/operationHubHtml")
  const model = buildOperationHubModel({
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
    runs: [{ root: "/repo", run: run() }]
  })

  const summary = model.runMonitor[0]
  assert.equal(summary.taskSnapshotImportStatus, "ok")
  assert.match(summary.taskSnapshotImportLabel, /保存済みタスクから取り込み: 成果物 1件/)
  assert.match(summary.taskSnapshotImportLabel, /2026-07-12T12:34:56.000Z/)
  const html = renderOperationHubHtml({ model, cspSource: "vscode-resource:", nonce: "nonce" })
  assert.match(html, /保存済みタスクから取り込み: 成果物 1件/)
})

test("Operation Hub model projects task snapshot provenance", () => {
  const source = readSrc("gui", "operationHubModel.ts")
  assert.match(source, /TASK_SNAPSHOT_IMPORT_STATE_KEY/)
  assert.match(source, /保存済みタスクから取り込み: 成果物 \$\{count\}件/)
})

test("invalid import provenance is ignored instead of breaking run projections", () => {
  const { summarizeRunForHub } = require("../out/gui/operationHubModel")
  const target = run()
  target.state["workflow.taskSnapshotImport"] = "{not-json"
  const summary = summarizeRunForHub("/repo", target)
  assert.equal(summary.taskSnapshotImportLabel, undefined)
  assert.equal(summary.taskSnapshotImportStatus, undefined)
})
