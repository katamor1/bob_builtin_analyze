const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function assertContainsAll(text, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `${label} must document: ${phrase}`)
  }
}

test("workflow-register current design mirrors Operation Hub and Builder ownership", () => {
  const hub = read("extensions/workflow-register/src/gui/operationHubProvider.ts")
  const builder = read("extensions/workflow-register/src/webview/workflowBuilderPanel.ts")
  const design = read("extensions/workflow-register/docs/detailed-design-ja.md")

  assertContainsAll(hub, [
    "private panel?: vscode.WebviewPanel",
    "const panel = this.ensurePanel()",
    "panel.reveal(vscode.ViewColumn.One)",
    '"workflowRegisterOperationHub"',
    '"Bob 操作ハブ"'
  ], "Operation Hub implementation")
  assertContainsAll(builder, [
    'export type WorkflowBuilderMode = "empty" | "standard-template" | "edit"',
    "private static currentPanel: WorkflowBuilderPanel | undefined",
    'createWebviewPanel("workflowRegisterBuilder", "ワークフロー作成・編集"',
    "current.reopenSameSession",
    "current.startSession"
  ], "Workflow Builder implementation")

  assertContainsAll(design, [
    "OperationHubProvider",
    "existing panelは再作成せず`reveal()`",
    "WorkflowBuilderPanel",
    "single current panel",
    "`empty` / `standard-template` / `edit`",
    "同じsessionはrevealする"
  ], "workflow-register detailed design")
})

test("workflow-register current design mirrors the writable run-state codec", () => {
  const codecPath = path.join(repoRoot, "extensions/workflow-register/src/core/runtime/runStateCodec.ts")
  assert.ok(fs.existsSync(codecPath), "implemented run-state codec is missing")

  const codec = fs.readFileSync(codecPath, "utf8")
  const runtime = read("extensions/workflow-register/src/core/modelRuntime.ts")
  const design = read("extensions/workflow-register/docs/detailed-design-ja.md")

  assert.ok(codec.includes('CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION = "workflow-register/run-state/v1"'))
  assert.ok(codec.includes('if (schemaVersion === "unversioned")'))
  assert.ok(codec.includes("readOnly: true"))
  assert.ok(runtime.includes('export type RunStatus = "running" | "paused" | "checkpoint" | "reviewing" | "held" | "completed" | "failed"'))

  assertContainsAll(design, [
    "workflow-register/run-state/v1",
    "version省略はhistorical v0",
    "future version",
    "read-only",
    "running`、`paused`、`checkpoint`、`reviewing`、`held`、`completed`、`failed"
  ], "workflow-register detailed design")
  assert.equal(design.includes("current schema:\n\n```text\nworkflow-register/run-state/v2"), false)
})

test("workflow-register current design names implemented surface modules", () => {
  const design = read("extensions/workflow-register/docs/detailed-design-ja.md")
  const requiredPaths = [
    "extensions/workflow-register/src/extension.ts",
    "extensions/workflow-register/src/extensionWithAuthoring.ts",
    "extensions/workflow-register/src/gui/operationHubProvider.ts",
    "extensions/workflow-register/src/gui/operationHubMutationCoordinator.ts",
    "extensions/workflow-register/src/webview/workflowBuilderPanel.ts",
    "extensions/workflow-register/src/core/runStateStore.ts",
    "extensions/workflow-register/src/commands/openWorkflowBuilder.ts",
    "extensions/workflow-register/src/commands/runRetention.ts"
  ]

  for (const relativePath of requiredPaths) {
    assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `implemented module is missing: ${relativePath}`)
    const documentedPath = relativePath.replace("extensions/workflow-register/", "")
    assert.ok(design.includes(path.basename(documentedPath)) || design.includes(documentedPath), `design must name implemented module: ${relativePath}`)
  }
})
