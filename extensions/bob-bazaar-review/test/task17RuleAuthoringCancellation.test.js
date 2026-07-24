"use strict"

const assert = require("node:assert/strict")
const { EventEmitter } = require("node:events")
const Module = require("node:module")
const path = require("node:path")
const test = require("node:test")

const GUI_MODULE = path.join(__dirname, "..", "out", "ui", "ruleAuthoringGui.js")
const WORKSPACE = path.resolve("task17-rule-authoring-workspace")
const SOURCE = path.join(WORKSPACE, "policy.pdf")

function runRecord() {
  const timestamp = "2026-07-24T00:00:00.000Z"
  const phases = ["sources", "extraction", "evidence_selection", "proposal", "human_review", "apply", "completed"]
  return {
    schemaVersion: "bob-bazaar-review/rule-authoring-run/v1",
    workspaceRoot: WORKSPACE,
    runId: "task17-cancel-run",
    currentPhase: "sources",
    phases: Object.fromEntries(phases.map((phase, index) => [
      phase,
      index === 0 ? { status: "in_progress", startedAt: timestamp } : { status: "not_started" }
    ])),
    artifacts: {},
    warnings: [],
    issues: [],
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function fakeVscode() {
  const panel = new EventEmitter()
  const messageListeners = []
  const disposeListeners = []
  panel.webview = {
    cspSource: "vscode-resource:",
    html: "",
    onDidReceiveMessage(listener) {
      messageListeners.push(listener)
      return { dispose() {} }
    }
  }
  panel.onDidDispose = (listener) => {
    disposeListeners.push(listener)
    return { dispose() {} }
  }
  panel.dispose = () => {
    if (panel.disposed) return
    panel.disposed = true
    for (const listener of disposeListeners) listener()
  }
  panel.emitMessage = async (message) => {
    for (const listener of messageListeners) await Promise.resolve(listener(structuredClone(message)))
    await new Promise((resolve) => setImmediate(resolve))
  }
  panel.emitMessageWithoutWaiting = (message) => {
    for (const listener of messageListeners) void listener(structuredClone(message))
  }

  return {
    panel,
    vscode: {
      ViewColumn: { One: 1 },
      Uri: { file: (fsPath) => ({ scheme: "file", fsPath, path: fsPath }) },
      window: {
        createWebviewPanel: () => panel,
        showOpenDialog: async () => [[{ scheme: "file", fsPath: SOURCE, path: SOURCE }][0]],
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined
      },
      workspace: {
        workspaceFolders: [{ uri: { scheme: "file", fsPath: WORKSPACE }, name: "task17", index: 0 }],
        fs: { stat: async () => ({ type: 1, ctime: 0, mtime: 0, size: 64 }) }
      },
      extensions: { getExtension: () => undefined },
      commands: { executeCommand: async () => undefined }
    }
  }
}

function loadGui(vscode) {
  const originalLoad = Module._load
  delete require.cache[GUI_MODULE]
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(GUI_MODULE)
  } finally {
    Module._load = originalLoad
  }
}

test("cancelRun aborts the in-flight rule-document operation signal", async () => {
  const fake = fakeVscode()
  const gui = loadGui(fake.vscode)
  let extractionSignal
  let persistenceCalls = 0
  const host = gui.createRuleAuthoringGuiHost({
    createNonce: () => "task17-nonce",
    renderRuleAuthoringGuiHtml: () => "<html></html>",
    findIncompleteRuleApplyTransactions: async () => [],
    listIncompleteRuleAuthoringRuns: async () => [],
    createRuleAuthoringRun: async () => runRecord(),
    resumeRuleAuthoringRun: async (run) => ({ run, sources: [], chunks: [] }),
    loadApprovedRuleSourceManifest: async () => undefined,
    extractRuleDocuments: async (requests) => {
      extractionSignal = requests[0]?.signal
      return new Promise((resolve, reject) => {
        extractionSignal?.addEventListener("abort", () => reject(extractionSignal.reason), { once: true })
      })
    },
    persistRuleAuthoringExtraction: async () => {
      persistenceCalls += 1
      throw new Error("cancelled extraction must not persist")
    },
    updateRuleAuthoringScopeSelection: async ({ run }) => ({ run }),
    confirmRuleAuthoringScope: async ({ run }) => ({ status: "overflow", run }),
    bindRuleAuthoringRunToWorkflow: async ({ run }) => run,
    invalidateRuleAuthoringExtraction: async ({ run }) => run,
    completeCurrentWorkflowStepAfterGuiAction: async () => false
  })

  const resultPromise = host.openRuleAuthoringGui({ subscriptions: [], extensionUri: fake.vscode.Uri.file("/extension") }, {
    workspaceRoot: WORKSPACE,
    bobExtensionAvailable: true
  })
  await new Promise((resolve) => setImmediate(resolve))
  await fake.panel.emitMessage({ type: "chooseSources" })
  fake.panel.emitMessageWithoutWaiting({ type: "extractSources" })
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(extractionSignal, "the extraction request must receive an operation signal")
  assert.equal(extractionSignal.aborted, false)
  fake.panel.emitMessageWithoutWaiting({ type: "cancelRun" })
  await new Promise((resolve) => setImmediate(resolve))

  assert.equal(extractionSignal.aborted, true)
  assert.equal((await resultPromise).status, "cancelled")
  assert.equal(persistenceCalls, 0)
})
