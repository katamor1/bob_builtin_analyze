const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const initializeMessage = {
  type: "consistencyWizard.action",
  action: "initializeWorkspace"
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

function initializationStatus(initialized) {
  return {
    initialized,
    workflowPath: "C:\\workspace\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md",
    missing: initialized ? [] : [".bob/workflows/code-consistency-review/WORKFLOW.md"]
  }
}

function loadConsistencyReviewWizard(harness) {
  const originalLoad = Module._load
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === "vscode") return harness.vscode
    if (request === "../core/reviewInputDiscovery") return {
      discoverReviewInputCandidates: async () => ({ documents: [], warnings: [] })
    }
    if (request === "../core/reviewInputBuilder") return {
      CHANGE_TYPE_VALUES: ["maintenance"],
      REVIEW_FOCUS_VALUES: ["requirement-code-consistency", "design-code-consistency", "test-gap"],
      VCS_VALUES: ["git"],
      writeReviewInputFromDraft: async () => ({ status: "error", errors: ["not used"] })
    }
    if (request === "../core/fileSystem") return {
      resolveWorkspacePathStrict: () => "/tmp/bob-code-consistency-review-missing-package"
    }
    if (request === "../core/traceabilityCatalogStore") return {
      DEFAULT_TRACEABILITY_CATALOG_PATH: ".bob-trace/traceability-catalog.json",
      DEFAULT_TRACEABILITY_GATE_REPORT_PATH: ".bob-trace/gate-report.md",
      readTraceabilityCatalog: async () => ({ status: "error", errors: [] }),
      validateAndWriteTraceabilityGateReport: async () => ({ status: "error", errors: [] })
    }
    if (request === "../workspaceResolver") return {
      resolveBobWorkspaceRoot: async () => harness.workspaceRoot
    }
    if (request === "../workspaceInitializer") return {
      getCodeConsistencyWorkspaceInitializationStatus: harness.getInitializationStatus
    }
    if (request === "./consistencyReviewWizardHtml") return {
      renderConsistencyReviewWizardHtml: ({ model, renderToken }) => {
        harness.models.push(model)
        harness.setRenderToken(renderToken)
        return "<html>consistency wizard</html>"
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    const modulePath = require.resolve("../out/webview/consistencyReviewWizard")
    delete require.cache[modulePath]
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function controllerHarness(options = {}) {
  const firstHtmlWrite = deferred()
  const commandStarted = deferred()
  const commandCalls = []
  const htmlWrites = []
  const models = []
  const posts = []
  const subscriptions = []
  const workspaceRoot = "C:\\workspace"
  let renderToken = ""
  let receiveMessage

  const webview = {
    cspSource: "vscode-resource:",
    onDidReceiveMessage: (listener) => {
      receiveMessage = listener
      return { dispose: () => undefined }
    },
    postMessage: async (message) => {
      posts.push(message)
      return true
    }
  }
  Object.defineProperty(webview, "html", {
    get: () => htmlWrites.at(-1) ?? "",
    set: (value) => {
      htmlWrites.push(value)
      firstHtmlWrite.resolve()
    }
  })

  const panel = {
    webview,
    onDidDispose: () => ({ dispose: () => undefined })
  }
  const vscode = {
    ViewColumn: { One: 1 },
    commands: {
      executeCommand: async (command, ...args) => {
        commandCalls.push({ command, args })
        commandStarted.resolve()
        return options.executeCommand?.(command, ...args)
      }
    },
    window: {
      createWebviewPanel: () => panel,
      showTextDocument: async () => undefined
    },
    workspace: {
      getConfiguration: () => ({ get: (_key, defaultValue) => defaultValue }),
      openTextDocument: async () => ({})
    }
  }
  const harness = {
    commandCalls,
    getInitializationStatus: options.getInitializationStatus ?? (async () => initializationStatus(false)),
    models,
    setRenderToken: (value) => { renderToken = value },
    vscode,
    workspaceRoot
  }
  const { openConsistencyReviewWizard } = loadConsistencyReviewWizard(harness)

  return {
    commandCalls,
    commandStarted: commandStarted.promise,
    htmlWrites,
    models,
    open: async () => {
      await openConsistencyReviewWizard({ subscriptions })
    },
    posts,
    send: (message) => receiveMessage({ ...message, renderToken })
  }
}

async function waitForCommandStart(commandStarted) {
  let timeout
  try {
    await Promise.race([
      commandStarted,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("initializer command did not start")), 100)
      })
    ])
  } finally {
    clearTimeout(timeout)
  }
}

test("workspace initialization executes the existing command and reloads the rendered model", async () => {
  let initialized = false
  const harness = controllerHarness({
    executeCommand: async () => {
      initialized = true
      return {
        message: "コード整合プレレビュー workflow を作成しました",
        backupPath: "C:\\workspace\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md.bak-20260717T000000Z",
        reviewInputBackupPath: "C:\\workspace\\review-input.yaml.bak-20260717T000000Z"
      }
    },
    getInitializationStatus: async () => initializationStatus(initialized)
  })
  await harness.open()

  await harness.send({
    type: "consistencyWizard.action",
    action: "initializeWorkspace"
  })

  assert.deepEqual(harness.commandCalls, [{
    command: "bobCodeConsistency.initializeWorkspace",
    args: [{ workspaceRoot: "C:\\workspace" }]
  }])
  assert.equal(harness.models.at(-1).initialization.initialized, true)
  assert.equal(harness.models.at(-1).status.tone, "ok")
  assert.match(harness.models.at(-1).status.message, /workflow を作成しました/)
  assert.match(harness.models.at(-1).status.message, /workflow backup:/)
  assert.match(harness.models.at(-1).status.message, /review-input backup:/)
  assert.equal(harness.posts.some((message) => message.message === "操作を実行しました。"), false)
})

test("workspace initialization reports workflow and review-input outcomes without applying the aggregate status to both", async () => {
  let initialized = false
  const workflowBackupPath = "C:\\workspace\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md.bak-20260717T000000Z"
  const reviewInputBackupPath = "C:\\workspace\\review-input.yaml.bak-20260717T000000Z"
  const harness = controllerHarness({
    executeCommand: async () => {
      initialized = true
      return {
        status: "updated",
        message: "aggregate initialization status: updated",
        backupPath: workflowBackupPath,
        reviewInputBackupPath,
        workflowResult: {
          status: "updated",
          path: "C:\\workspace\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md",
          backupPath: workflowBackupPath,
          message: "workflow was updated"
        },
        reviewInputResult: {
          status: "unchanged",
          path: "C:\\workspace\\review-input.yaml",
          backupPath: reviewInputBackupPath,
          message: "existing review input was preserved"
        }
      }
    },
    getInitializationStatus: async () => initializationStatus(initialized)
  })
  await harness.open()

  await harness.send(initializeMessage)

  const message = harness.models.at(-1).status.message
  assert.match(message, /workflow \[updated\]: workflow was updated/)
  assert.match(message, /review-input \[unchanged\]: existing review input was preserved/)
  assert.match(message, new RegExp(`workflow backup: ${escapeRegExp(workflowBackupPath)}`))
  assert.match(message, new RegExp(`review-input backup: ${escapeRegExp(reviewInputBackupPath)}`))
  assert.doesNotMatch(message, /review-input \[updated\]/)
})

test("unknown wizard actions are rejected without executing a command", async () => {
  const harness = controllerHarness()
  await harness.open()

  await harness.send({ type: "consistencyWizard.action", action: "unknown" })

  assert.deepEqual(harness.commandCalls, [])
  assert.deepEqual(harness.posts.at(-1), {
    error: true,
    message: "不正な画面操作を拒否しました。"
  })
})

test("concurrent workspace initialization is single-flight and renders once on completion", async () => {
  let initialized = false
  const commandResult = deferred()
  const harness = controllerHarness({
    executeCommand: async () => {
      const result = await commandResult.promise
      initialized = true
      return result
    },
    getInitializationStatus: async () => initializationStatus(initialized)
  })
  await harness.open()

  const first = harness.send(initializeMessage)
  await waitForCommandStart(harness.commandStarted)
  await harness.send(initializeMessage)

  assert.equal(harness.commandCalls.length, 1)
  assert.ok(harness.posts.some((message) => message.message === "初期化を実行中です。"))
  assert.equal(harness.models.length, 1)
  commandResult.resolve({ message: "初期化が完了しました" })
  await first

  assert.equal(harness.models.length, 2)
  assert.equal(harness.htmlWrites.length, 2)
  assert.equal(harness.models.at(-1).initialization.initialized, true)
})

test("failed workspace initialization keeps the current card and permits retry", async () => {
  let initialized = false
  let attempts = 0
  const harness = controllerHarness({
    executeCommand: async () => {
      attempts += 1
      if (attempts === 1) throw new Error("INITIALIZE_FAILED")
      initialized = true
      return { message: "初期化が完了しました" }
    },
    getInitializationStatus: async () => initializationStatus(initialized)
  })
  await harness.open()
  const initialModel = harness.models.at(-1)
  const initialHtml = harness.htmlWrites.at(-1)

  await harness.send(initializeMessage)

  assert.equal(harness.commandCalls.length, 1)
  assert.equal(harness.models.length, 1)
  assert.equal(harness.models.at(-1), initialModel)
  assert.equal(harness.models.at(-1).initialization.initialized, false)
  assert.equal(harness.htmlWrites.length, 1)
  assert.equal(harness.htmlWrites.at(-1), initialHtml)
  assert.ok(harness.posts.some((message) => message.error === true && /INITIALIZE_FAILED/.test(message.message)))

  await harness.send(initializeMessage)

  assert.equal(harness.commandCalls.length, 2)
  assert.equal(harness.models.at(-1).initialization.initialized, true)
  assert.equal(harness.models.at(-1).status.tone, "ok")
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
