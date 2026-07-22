const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

test("traceability prep command opens the embedded approval stage", () => {
  const commandSource = readSrc("traceabilityCommands.ts")
  const webviewSource = readSrc("webview", "traceabilityPrepWebview.ts")
  const webviewAssetsSource = readSrc("webview", "traceabilityPrepWebviewAssets.ts")
  const combinedWebviewSource = `${webviewSource}\n${webviewAssetsSource}`

  assert.match(commandSource, /openConsistencyReviewWizard/)
  assert.match(commandSource, /initialStage:\s*"traceability"/)
  assert.match(commandSource, /トレーサビリティ整理を開きました/)
  assert.match(commandSource, /トレーサビリティ整理を開けません/)
  assert.doesNotMatch(commandSource, /traceability prep を開/)
  assert.doesNotMatch(webviewSource, /createWebviewPanel\(/)
  assert.match(webviewSource, /createTraceabilityPrepStage/)
  assert.match(combinedWebviewSource, /approveItem/)
  assert.match(combinedWebviewSource, /approveLink/)
  assert.match(combinedWebviewSource, /approveDecision/)
  assert.match(combinedWebviewSource, /トレーサビリティ整理/)
  assert.match(combinedWebviewSource, /検証レポート/)
  assert.match(combinedWebviewSource, /レビュー入力プレビュー/)
  assert.match(combinedWebviewSource, /未確定として保留/)
})

test("traceability command returns the embedded service outcome without a duplicate catalog preflight", () => {
  const commandSource = readSrc("traceabilityCommands.ts")
  const webviewSource = readSrc("webview", "traceabilityPrepWebview.ts")
  const commandBody = commandSource.slice(commandSource.indexOf("export async function runOpenTraceabilityPrep"))

  assert.doesNotMatch(commandBody.slice(0, commandBody.indexOf("async function resolveTraceabilityDraftText")), /readTraceabilityCatalog\(/)
  assert.match(commandBody, /return result/)
  assert.match(webviewSource, /status:\s*"ok"[^}]*catalogPath/s)
  assert.match(webviewSource, /status:\s*"error"[^}]*errors/s)
})

function loadOpenTraceabilityCommand(outcome, notifications) {
  const originalLoad = Module._load
  const modulePath = require.resolve("../out/traceabilityCommands")
  delete require.cache[modulePath]
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") {
      return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } }
    }
    if (request === "./extensionCommandOptions") {
      return {
        requireBobWorkspaceRoot: async () => "/workspace",
        stringOption: () => undefined,
        notifyInfo: (message) => notifications.push({ type: "info", message }),
        notifyError: (message) => notifications.push({ type: "error", message })
      }
    }
    if (request === "./workflowProviderRegistration") return { optionRecord: () => ({}) }
    if (request === "./webview/consistencyReviewWizard") {
      return { openConsistencyReviewWizard: async () => outcome }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(modulePath).runOpenTraceabilityPrep } finally { Module._load = originalLoad }
}

test("traceability workflow command reports only the embedded stage's actual structured outcome", async () => {
  const successNotifications = []
  const success = loadOpenTraceabilityCommand(
    { status: "ok", catalogPath: "/workspace/actual/catalog.json" },
    successNotifications
  )
  assert.deepEqual(await success({ subscriptions: [] }), {
    status: "ok",
    catalogPath: "/workspace/actual/catalog.json"
  })
  assert.deepEqual(successNotifications, [{
    type: "info",
    message: "トレーサビリティ整理を開きました: /workspace/actual/catalog.json"
  }])

  const failureNotifications = []
  const failure = loadOpenTraceabilityCommand(
    { status: "error", errors: ["CATALOG_READ_FAILED"] },
    failureNotifications
  )
  assert.deepEqual(await failure({ subscriptions: [] }), {
    status: "error",
    errors: ["CATALOG_READ_FAILED"]
  })
  assert.deepEqual(failureNotifications, [{
    type: "error",
    message: "トレーサビリティ整理を開けません: CATALOG_READ_FAILED"
  }])
})
