const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function loadProviderWithVscode(vscode) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/gui/operationHubProvider")
    delete require.cache[modulePath]
    return require(modulePath).OperationHubProvider
  } finally {
    Module._load = originalLoad
  }
}

function providerHarness(t) {
  const root = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "workflow-register-operation-hub-provider-")))
  fs.mkdirSync(path.join(root, ".bob"), { recursive: true })
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const state = {
    commands: [],
    createPanelCalls: 0,
    errors: [],
    listenerDisposals: 0,
    panelDisposeCalls: 0,
    reveals: 0,
    watchers: []
  }
  const panelListeners = []
  const makeDisposable = () => ({ dispose: () => { state.listenerDisposals += 1 } })
  const panel = {
    webview: {
      cspSource: "vscode-resource:",
      html: "",
      onDidReceiveMessage: (_listener, _thisArg, disposables) => {
        const disposable = makeDisposable()
        disposables?.push(disposable)
        return disposable
      }
    },
    onDidDispose: (listener, _thisArg, disposables) => {
      panelListeners.push(listener)
      const disposable = makeDisposable()
      disposables?.push(disposable)
      return disposable
    },
    reveal: () => { state.reveals += 1 },
    dispose: () => {
      state.panelDisposeCalls += 1
      if (state.panelDisposeCalls !== 1) return
      for (const listener of panelListeners) listener()
    }
  }
  const vscode = {
    ViewColumn: { One: 1 },
    RelativePattern: class RelativePattern { constructor(rootPath, pattern) { this.rootPath = rootPath; this.pattern = pattern } },
    Uri: { file: (filePath) => ({ fsPath: filePath }) },
    commands: { executeCommand: async (...args) => { state.commands.push(args) } },
    extensions: { getExtension: () => undefined },
    window: {
      createWebviewPanel: () => { state.createPanelCalls += 1; return panel },
      showErrorMessage: async (message) => { state.errors.push(message) },
      showTextDocument: async () => undefined,
      showWarningMessage: async () => undefined
    },
    workspace: {
      workspaceFolders: [{ name: "workspace", uri: { fsPath: root } }],
      createFileSystemWatcher: () => {
        const callbacks = {}
        const watcher = {
          onDidChange: (listener) => { callbacks.change = listener },
          onDidCreate: (listener) => { callbacks.create = listener },
          onDidDelete: (listener) => { callbacks.delete = listener },
          dispose: () => undefined,
          callbacks
        }
        state.watchers.push(watcher)
        return watcher
      }
    }
  }
  const OperationHubProvider = loadProviderWithVscode(vscode)
  const provider = new OperationHubProvider({ api: { listWorkflows: () => [] }, extensionUri: {} })
  t.after(() => provider.dispose())
  return { panel, provider, state }
}

function captureUnhandledRejections(t) {
  const errors = []
  const listener = (error) => { errors.push(error) }
  process.on("unhandledRejection", listener)
  t.after(() => process.off("unhandledRejection", listener))
  return errors
}

test("Operation Hub reuses one panel, disables unavailable integrations, and disposes listeners once", async (t) => {
  const { provider, state, panel } = providerHarness(t)

  await provider.open()
  await provider.open()

  assert.equal(state.createPanelCalls, 1)
  assert.equal(state.reveals, 2)
  assert.match(panel.webview.html, /disabled[^>]*title="Bob Bazaar レビュー 拡張がインストールされていません。"[^>]*data-action="openBazaarReview"/)
  assert.match(panel.webview.html, /disabled[^>]*title="Bob コード整合プレレビュー 拡張がインストールされていません。"[^>]*data-action="openConsistencyWizard"/)

  await provider.handleMessage({ type: "operationHub.action", action: "openBazaarReview" })
  assert.deepEqual(state.commands, [])
  assert.deepEqual(state.errors, ["Bob 操作センター: Bob Bazaar レビュー 拡張がインストールされていません。画面を更新してから再実行してください。"])

  provider.dispose()
  provider.dispose()
  assert.equal(state.panelDisposeCalls, 1)
  assert.equal(state.listenerDisposals, 2)
})

test("Operation Hub catches rejected watcher debounce refreshes", async (t) => {
  const { provider, state } = providerHarness(t)
  const unhandled = captureUnhandledRejections(t)
  await provider.open()
  provider.refreshPanel = async () => { throw new Error("watch refresh failed") }

  state.watchers[0].callbacks.change()
  await new Promise((resolve) => setTimeout(resolve, 200))

  assert.deepEqual(unhandled, [])
  assert.deepEqual(state.errors, ["Bob 操作センター: 実行状態の自動更新に失敗しました。watch refresh failed"])
})

test("Operation Hub catches every rejected delayed action refresh once", async (t) => {
  const { provider, state } = providerHarness(t)
  const unhandled = captureUnhandledRejections(t)
  await provider.open()
  provider.refreshPanel = async () => { throw new Error("action refresh failed") }
  const originalSetTimeout = global.setTimeout
  global.setTimeout = (callback) => originalSetTimeout(callback, 0)
  t.after(() => { global.setTimeout = originalSetTimeout })

  provider.scheduleActionRefreshes()
  await new Promise((resolve) => originalSetTimeout(resolve, 50))

  assert.deepEqual(unhandled, [])
  assert.deepEqual(state.errors, ["Bob 操作センター: 操作後の自動更新に失敗しました。action refresh failed"])
})
