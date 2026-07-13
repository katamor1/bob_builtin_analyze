const assert = require("node:assert/strict")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

class EventEmitter {
  constructor() { this.event = () => ({ dispose() {} }) }
  fire() {}
  dispose() {}
}
class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label
    this.collapsibleState = collapsibleState
  }
}
class ThemeIcon { constructor(id) { this.id = id } }
const statusBar = { text: "", tooltip: "", show() {}, dispose() {} }
const vscode = {
  EventEmitter,
  StatusBarAlignment: { Left: 1 },
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState: { None: 0 },
  window: { createStatusBarItem: () => statusBar },
  workspace: { workspaceFolders: [], onDidChangeWorkspaceFolders: () => ({ dispose() {} }) }
}

function loadViewModule() {
  const modulePath = path.resolve(__dirname, "..", "out", "commands", "runControlView.js")
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    delete require.cache[require.resolve(modulePath)]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function reusedRun() {
  return {
    schemaVersion: "workflow-register/run-state/v1",
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

test("Runs View traces reused steps, source run, verified artifacts and hydrated keys", () => {
  const { WorkflowRunControlView } = loadViewModule()
  const view = new WorkflowRunControlView()
  const item = view.getTreeItem({ root: "/workspace", run: reusedRun() })

  assert.match(item.description, /reused 1/)
  assert.match(item.tooltip, /reused steps: collect/)
  assert.match(item.tooltip, /source run: source-run/)
  assert.match(item.tooltip, /hydrated state keys: context/)
  assert.match(item.tooltip, /verified artifacts: context-artifact/)
  assert.match(item.tooltip, /definition mismatch allowed: yes/)
  assert.doesNotMatch(item.tooltip, /sha256:aaaaaaaa/)
  view.dispose()
})
