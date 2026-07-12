const assert = require("node:assert/strict")
const Module = require("node:module")
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
  assert.match(summary.taskSnapshotImportLabel, /Imported from task snapshot: 1 artifact/)
  assert.match(summary.taskSnapshotImportLabel, /2026-07-12T12:34:56.000Z/)
  const html = renderOperationHubHtml(model, { cspSource: "vscode-resource:", nonce: "nonce" })
  assert.match(html, /Imported from task snapshot: 1 artifact/)
})

test("Runs View source projects task snapshot provenance into description, tooltip, and icon", () => {
  const source = readSrc("commands", "runControlView.ts")
  assert.match(source, /TASK_SNAPSHOT_IMPORT_STATE_KEY/)
  assert.match(source, /imported from task snapshot/i)
  assert.match(source, /snapshot \$\{importedCount\}/)
  assert.match(source, /cloud-download|history/)
})

test("invalid import provenance is ignored instead of breaking run projections", () => {
  const { summarizeRunForHub } = require("../out/gui/operationHubModel")
  const target = run()
  target.state["workflow.taskSnapshotImport"] = "{not-json"
  const summary = summarizeRunForHub("/repo", target)
  assert.equal(summary.taskSnapshotImportLabel, undefined)
  assert.equal(summary.taskSnapshotImportStatus, undefined)
})
