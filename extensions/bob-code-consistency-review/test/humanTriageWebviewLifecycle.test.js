const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

async function drainMicrotasks() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function loadHumanTriageWebview(harness) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return harness.vscode
    if (request === "../reviewExecutionCommands") {
      return { runTriage: harness.runTriage }
    }
    if (request === "../triage/humanTriageWorkspace") {
      return {
        loadHumanTriageWorkspace: harness.loadHumanTriageWorkspace,
        saveHumanTriageDecisions: async () => undefined
      }
    }
    if (request === "../workspaceResolver") {
      return { resolveBobWorkspaceRoot: harness.resolveBobWorkspaceRoot }
    }
    if (request === "./consistencyHumanTriageHtml") {
      return { renderConsistencyHumanTriageHtml: () => "<html>human triage</html>" }
    }
    if (request === "./consistencyHumanTriageMessage") {
      return { parseHumanTriageMessage: harness.parseHumanTriageMessage }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/webview/consistencyHumanTriage")
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function webviewHarness(options = {}) {
  const initialized = deferred()
  const postStarted = deferred()
  const htmlWrites = []
  const subscriptions = []
  const disposeListeners = []
  let receiveMessage
  let disposed = false

  const webview = {
    cspSource: "vscode-resource:",
    onDidReceiveMessage: (listener) => {
      receiveMessage = listener
      return { dispose: () => undefined }
    },
    postMessage: (message) => {
      postStarted.resolve(message)
      return options.postMessage?.(message) ?? Promise.resolve(true)
    }
  }
  Object.defineProperty(webview, "html", {
    get: () => htmlWrites.at(-1)?.value ?? "",
    set: (value) => {
      htmlWrites.push({ value, disposed })
      initialized.resolve()
    }
  })

  const panel = {
    webview,
    onDidDispose: (listener) => {
      disposeListeners.push(listener)
      return { dispose: () => undefined }
    }
  }
  const vscode = {
    ViewColumn: { One: 1 },
    commands: { executeCommand: async () => undefined },
    window: { createWebviewPanel: () => panel },
    workspace: {
      getConfiguration: () => ({ get: (_key, defaultValue) => defaultValue })
    }
  }
  const module = loadHumanTriageWebview({
    vscode,
    parseHumanTriageMessage: options.parseHumanTriageMessage ?? (() => undefined),
    resolveBobWorkspaceRoot: options.resolveBobWorkspaceRoot ?? (async () => "C:\\workspace"),
    runTriage: options.runTriage ?? (async () => ({ status: "ok" })),
    loadHumanTriageWorkspace: options.loadHumanTriageWorkspace ?? (async () => ({
      sourceSha256: "source-sha",
      decisionRevision: 0,
      items: [],
      issues: []
    }))
  })

  return {
    context: { subscriptions },
    dispose: () => {
      disposed = true
      for (const listener of disposeListeners) listener()
    },
    htmlWrites,
    initialized: initialized.promise,
    open: module.openConsistencyHumanTriageGui,
    postStarted: postStarted.promise,
    send: (message) => receiveMessage(message)
  }
}

function controlledThenable() {
  let rejectHandler
  let unobservedRejection
  return {
    thenable: {
      then: (_resolve, reject) => {
        rejectHandler = reject
      }
    },
    reject: (error) => {
      if (rejectHandler) rejectHandler(error)
      else unobservedRejection = error
    },
    rejectionObserved: () => rejectHandler !== undefined,
    unobservedRejection: () => unobservedRejection
  }
}

test("Human Triage does not render when the panel is disposed during initialization", async () => {
  const rootRequested = deferred()
  const workspaceRoot = deferred()
  let loadCalls = 0
  const harness = webviewHarness({
    resolveBobWorkspaceRoot: async () => {
      rootRequested.resolve()
      return workspaceRoot.promise
    },
    loadHumanTriageWorkspace: async () => {
      loadCalls += 1
      return { sourceSha256: "source-sha", decisionRevision: 0, items: [], issues: [] }
    }
  })

  const opening = harness.open(harness.context)
  await rootRequested.promise
  harness.dispose()
  workspaceRoot.resolve("C:\\workspace")
  await Promise.resolve(opening)
  await drainMicrotasks()

  assert.equal(loadCalls, 0, "disposed initialization must not continue into model loading")
  assert.deepEqual(harness.htmlWrites, [], "disposed initialization must not render HTML")
})

test("Human Triage observes a pending post rejection when the panel is disposed", async () => {
  const post = controlledThenable()
  const harness = webviewHarness({ postMessage: () => post.thenable })
  await Promise.resolve(harness.open(harness.context))
  await harness.initialized

  harness.send({ type: "invalid" })
  await harness.postStarted
  await drainMicrotasks()
  harness.dispose()
  const disposedError = new Error("Webview is disposed")
  post.reject(disposedError)
  await drainMicrotasks()

  assert.equal(post.rejectionObserved(), true, "postMessage rejection must be observed")
  assert.equal(post.unobservedRejection(), undefined)
})

test("Human Triage reports a non-disposal action failure that settles after disposal", async () => {
  const actionStarted = deferred()
  const actionResult = deferred()
  const reports = []
  const harness = webviewHarness({
    parseHumanTriageMessage: (message) => message,
    runTriage: async () => {
      actionStarted.resolve()
      return actionResult.promise
    }
  })
  await Promise.resolve(harness.open(harness.context))
  await harness.initialized

  const originalConsoleError = console.error
  console.error = (...args) => reports.push(args)
  try {
    harness.send({ type: "consistencyHumanTriage.action", action: "generateTriage" })
    await actionStarted.promise
    harness.dispose()
    const actionError = new Error("ACTION_FAILED_AFTER_DISPOSE")
    actionResult.reject(actionError)
    await drainMicrotasks()

    assert.equal(reports.length, 1, "non-disposal failures must reach the listener task boundary")
    assert.equal(reports[0][1], actionError)
  } finally {
    console.error = originalConsoleError
  }
})
