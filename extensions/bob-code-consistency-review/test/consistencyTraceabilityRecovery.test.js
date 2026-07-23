const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const MODULE = require.resolve("../out/webview/consistencyReviewWizard")

function loadWizard(harness) {
  const originalLoad = Module._load
  delete require.cache[MODULE]
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") return harness.vscode
    if (request === "../core/reviewInputDiscovery") {
      return { discoverReviewInputCandidates: async () => ({ documents: [], warnings: [] }) }
    }
    if (request === "../core/reviewInputBuilder") {
      return {
        CHANGE_TYPE_VALUES: ["maintenance"],
        REVIEW_FOCUS_VALUES: ["requirement-code-consistency", "design-code-consistency", "test-gap"],
        VCS_VALUES: ["git"],
        writeReviewInputFromDraft: async () => ({ status: "error", errors: ["not used"] })
      }
    }
    if (request === "../core/fileSystem") {
      return { resolveWorkspacePathStrict: (_root, value) => value }
    }
    if (request === "../core/traceabilityCatalogStore") {
      return {
        DEFAULT_TRACEABILITY_CATALOG_PATH: ".bob-trace/default-catalog.json",
        DEFAULT_TRACEABILITY_GATE_REPORT_PATH: ".bob-trace/default-gate.md",
        readTraceabilityCatalog: async (input) => {
          harness.reads.push({ ...input })
          return { status: "error", errors: ["CUSTOM_CATALOG_READ_FAILED"] }
        },
        validateAndWriteTraceabilityGateReport: async (input) => {
          harness.gateWrites.push({ ...input })
          return { status: "error", errors: ["MUST_NOT_WRITE"] }
        },
        writeTraceabilityCatalog: async () => { throw new Error("MUST_NOT_WRITE_CATALOG") }
      }
    }
    if (request === "../workspaceInitializer") {
      return {
        getCodeConsistencyWorkspaceInitializationStatus: async () => ({
          initialized: true,
          workflowPath: "/workspace/.bob/workflows/code-consistency-review/WORKFLOW.md",
          missing: []
        })
      }
    }
    if (request === "../workspaceResolver") {
      return { resolveBobWorkspaceRoot: async () => "/workspace" }
    }
    if (request === "./consistencyReviewWizardHtml") {
      return {
        renderConsistencyReviewWizardHtml: ({ renderToken }) => {
          harness.renderToken = renderToken
          return `<main data-stage="review">review:${renderToken}</main>`
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(MODULE) } finally { Module._load = originalLoad }
}

function recoveryHarness() {
  const messageListeners = []
  const posts = []
  const html = []
  const panel = {
    webview: {
      cspSource: "vscode-resource:",
      onDidReceiveMessage(listener) { messageListeners.push(listener); return { dispose() {} } },
      async postMessage(message) { posts.push(message); return true }
    },
    onDidDispose() { return { dispose() {} } }
  }
  Object.defineProperty(panel.webview, "html", {
    get: () => html.at(-1) ?? "",
    set: (value) => html.push(String(value))
  })
  const harness = {
    reads: [],
    gateWrites: [],
    renderToken: "",
    posts,
    html,
    vscode: {
      ViewColumn: { One: 1 },
      window: {
        createWebviewPanel: () => panel,
        showErrorMessage: async () => undefined,
        showTextDocument: async () => undefined
      },
      workspace: {
        getConfiguration: () => ({
          get: (key, fallback) => {
            if (key === "traceabilityCatalogPath") return ".bob-trace/default-catalog.json"
            if (key === "traceabilityGateReportPath") return ".bob-trace/default-gate.md"
            return fallback
          }
        }),
        openTextDocument: async () => ({})
      },
      commands: { executeCommand: async () => undefined }
    },
    async send(message) {
      for (const listener of messageListeners) {
        await Promise.resolve(listener({ ...message, renderToken: harness.renderToken }))
      }
    }
  }
  return harness
}

test("initial traceability read failure restores a usable review without a second read or gate write", async () => {
  const harness = recoveryHarness()
  const { openConsistencyReviewWizard } = loadWizard(harness)

  const result = await openConsistencyReviewWizard({ subscriptions: [] }, {
    initialStage: "traceability",
    workspaceRoot: "/workspace",
    catalogPath: ".bob-trace/custom-catalog.json",
    reportPath: ".bob-trace/custom-gate.md",
    textEncoding: "shift_jis"
  })

  assert.deepEqual(result, { status: "error", errors: ["CUSTOM_CATALOG_READ_FAILED"] })
  assert.deepEqual(harness.reads, [{
    workspaceRoot: "/workspace",
    catalogPath: ".bob-trace/custom-catalog.json",
    textEncoding: "shift_jis"
  }])
  assert.deepEqual(harness.gateWrites, [])
  assert.match(harness.html.at(-1), /data-stage="review"/)

  await harness.send({ type: "consistencyWizard.action", action: "unknown" })
  assert.deepEqual(harness.posts.at(-1), {
    error: true,
    message: "不正な画面操作を拒否しました。"
  })
})
