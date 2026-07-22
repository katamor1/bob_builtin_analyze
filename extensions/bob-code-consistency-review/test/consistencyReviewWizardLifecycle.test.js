const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const MODULE = require.resolve("../out/webview/consistencyReviewWizard")

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

async function turn() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}

function fakePanel(options = {}) {
  const messageListeners = []
  const disposeListeners = []
  const posts = []
  const htmlHistory = []
  const webview = {
    cspSource: "vscode-resource:",
    onDidReceiveMessage(listener) { messageListeners.push(listener); return { dispose() {} } },
    async postMessage(message) {
      posts.push(structuredClone(message))
      return options.postMessage ? options.postMessage(message) : true
    }
  }
  Object.defineProperty(webview, "html", {
    get: () => htmlHistory.at(-1) ?? "",
    set: (value) => htmlHistory.push(String(value))
  })
  return {
    webview,
    posts,
    htmlHistory,
    renderToken: "",
    onDidDispose(listener) { disposeListeners.push(listener); return { dispose() {} } },
    async emit(message) {
      const owned = message.renderToken === undefined ? { ...message, renderToken: this.renderToken } : message
      for (const listener of messageListeners) await Promise.resolve(listener(structuredClone(owned)))
      await turn()
    },
    emitWithoutWaiting(message) {
      const owned = message.renderToken === undefined ? { ...message, renderToken: this.renderToken } : message
      for (const listener of messageListeners) void listener(structuredClone(owned))
    },
    emitPending(message) {
      const owned = message.renderToken === undefined ? { ...message, renderToken: this.renderToken } : message
      return Promise.all(messageListeners.map((listener) => Promise.resolve(listener(structuredClone(owned)))))
    },
    dispose() { for (const listener of disposeListeners.splice(0)) listener() }
  }
}

function loadController(errors, options = {}) {
  const originalLoad = Module._load
  const vscode = {
    ViewColumn: { One: 1 },
    window: {
      showErrorMessage: async (message) => { errors.push(String(message)) },
      showTextDocument: async () => undefined
    },
    workspace: {
      getConfiguration: () => ({ get: (_key, fallback) => fallback }),
      openTextDocument: async () => ({})
    },
    commands: { executeCommand: options.executeCommand ?? (async () => undefined) }
  }
  delete require.cache[MODULE]
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") return vscode
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(MODULE) } finally { Module._load = originalLoad }
}

function harness(options = {}) {
  const errors = []
  const module = loadController(errors, options)
  assert.equal(typeof module.ConsistencyReviewWizardController, "function")
  const panel = options.panel ?? fakePanel(options)
  const hosts = new Map()
  let token = 0
  const controller = new module.ConsistencyReviewWizardController(
    { subscriptions: [] },
    panel,
    {
      resolveWorkspaceRoot: async () => "/workspace",
      loadReviewModel: options.loadReviewModel ?? (async () => ({ status: { tone: "muted", message: "ready" } })),
      renderReviewHtml: options.renderReviewHtml ?? ((_input) => `<main data-stage="review">review</main>`),
      createRenderToken: () => (panel.renderToken = `token-${++token}`),
      createStageService: (stage, host) => {
        hosts.set(stage, host)
        return options.createStageService
          ? options.createStageService(stage, host)
          : {
              async initialize() { host.render(`<main data-stage="${stage}">${stage}</main>`); return { status: "ok" } },
              async handleMessage() {}
            }
      }
    }
  )
  return { controller, panel, errors, hosts }
}

test("latest stage wins when embedded initializers complete out of order", async () => {
  const first = deferred()
  const second = deferred()
  const h = harness({
    createStageService(stage, host) {
      return {
        async initialize() {
          await (stage === "traceability" ? first.promise : second.promise)
          host.render(`<main>${stage}</main>`)
          return { status: "ok" }
        },
        async handleMessage() {}
      }
    }
  })
  await h.controller.initialize()

  h.panel.emitWithoutWaiting({ type: "consistencyWizard.action", action: "openTraceabilityPrep" })
  await turn()
  h.panel.emitWithoutWaiting({ type: "consistencyReview.navigate", fromStage: "traceability", stage: "triage" })
  await turn()
  second.resolve()
  await turn()
  first.resolve()
  await turn()

  assert.match(h.panel.webview.html, /triage/)
  assert.doesNotMatch(h.panel.webview.html, /traceability/)
})

test("stale render token and wrong source stage cannot reach a stage service", async () => {
  const received = []
  const h = harness({
    createStageService(stage, host) {
      return {
        async initialize() { host.render(`<main>${stage}</main>`); return { status: "ok" } },
        async handleMessage(message) { received.push(message.type) }
      }
    }
  })
  await h.controller.initialize({ initialStage: "traceability" })
  const current = h.panel.renderToken

  await h.panel.emit({ type: "action", action: { type: "approveItem" }, renderToken: "stale" })
  await h.panel.emit({ type: "consistencyHumanTriage.action", action: "generateTriage", renderToken: current })
  await h.panel.emit({ type: "action", action: { type: "approveItem" }, renderToken: current })

  assert.deepEqual(received, ["action"])
})

test("dispose invalidates pending initialization", async () => {
  const gate = deferred()
  const h = harness({
    createStageService(stage, host) {
      return {
        async initialize() { await gate.promise; host.render(`<main>${stage}</main>`); return { status: "ok" } },
        async handleMessage() { await host.post({ type: "late" }) }
      }
    }
  })
  await h.controller.initialize()
  h.panel.emitWithoutWaiting({ type: "consistencyWizard.action", action: "openHumanTriage" })
  await turn()
  h.panel.dispose()
  gate.resolve()
  await turn()

  assert.doesNotMatch(h.panel.webview.html, /triage/)
  assert.deepEqual(h.errors, [])
})

test("a pending post rejection after disposal is observed at the controller boundary", async () => {
  const post = deferred()
  const h = harness({
    postMessage: () => post.promise,
    createStageService(stage, host) {
      return {
        async initialize() { host.render(`<main>${stage}</main>`); return { status: "ok" } },
        async handleMessage() { await host.post({ type: "pending" }) }
      }
    }
  })
  await h.controller.initialize({ initialStage: "triage" })
  h.panel.emitWithoutWaiting({ type: "consistencyHumanTriage.action", action: "generateTriage" })
  await turn()
  h.panel.dispose()
  post.reject(new Error("Webview is disposed"))
  await turn()

  assert.deepEqual(h.errors, [])
})

test("initial traceability failure is returned as a structured command outcome", async () => {
  const h = harness({
    createStageService() {
      return {
        async initialize() { return { status: "error", errors: ["CATALOG_READ_FAILED"] } },
        async handleMessage() {}
      }
    }
  })

  const result = await h.controller.initialize({ initialStage: "traceability" })

  assert.deepEqual(result, { status: "error", errors: ["CATALOG_READ_FAILED"] })
  assert.deepEqual(h.errors, [], "the workflow command owns initial-stage error notification")
  assert.match(h.panel.webview.html, /review/, "the primary panel must remain usable after initial-stage failure")
})

test("a failed embedded transition restores the review stage for a later user action", async () => {
  const attempts = []
  const h = harness({
    createStageService(stage) {
      attempts.push(stage)
      return {
        async initialize() { return { status: "error", errors: [`${stage} failed`] } },
        async handleMessage() {}
      }
    }
  })
  await h.controller.initialize()

  await h.panel.emit({ type: "consistencyWizard.action", action: "openTraceabilityPrep" })
  await h.panel.emit({ type: "consistencyWizard.action", action: "openHumanTriage" })

  assert.deepEqual(attempts, ["traceability", "triage"])
  assert.match(h.panel.webview.html, /review/)
  assert.equal(h.errors.length, 2)
})

test("navigation requires the exact active fromStage", async () => {
  const h = harness()
  await h.controller.initialize({ initialStage: "traceability" })
  const before = h.panel.webview.html

  await h.panel.emit({ type: "consistencyReview.navigate", fromStage: "triage", stage: "review" })

  assert.equal(h.panel.webview.html, before)
  assert.equal(h.hosts.get("traceability").isActive(), true)
})

test("stage messages stay blocked until the exact service initialization becomes ready", async () => {
  const gate = deferred()
  const received = []
  const h = harness({
    createStageService(stage, host) {
      return {
        async initialize() {
          await gate.promise
          host.render(`<main>${stage}</main>`)
          return { status: "ok" }
        },
        async handleMessage(message) { received.push(message.type) }
      }
    }
  })
  await h.controller.initialize()

  h.panel.emitWithoutWaiting({ type: "consistencyWizard.action", action: "openTraceabilityPrep" })
  await turn()
  await h.panel.emit({ type: "action", action: { type: "approveDomain", code: "PAY" } })
  assert.deepEqual(received, [])
  gate.resolve()
  await turn()
  await h.panel.emit({ type: "action", action: { type: "approveDomain", code: "PAY" } })
  assert.deepEqual(received, ["action"])
})

test("same-stage ABA invalidates the old host by exact generation", async () => {
  const stageHosts = []
  const h = harness({
    createStageService(stage, host) {
      stageHosts.push(host)
      return {
        async initialize() { host.render(`<main>${stage}</main>`); return { status: "ok" } },
        async handleMessage() {}
      }
    }
  })
  await h.controller.initialize({ initialStage: "traceability" })
  const oldHost = stageHosts[0]

  await h.panel.emit({ type: "consistencyReview.navigate", fromStage: "traceability", stage: "traceability" })

  assert.equal(stageHosts.length, 2)
  assert.equal(oldHost.isActive(), false)
  assert.equal(oldHost.render("<main>stale</main>"), false)
  assert.equal(await oldHost.post({ type: "stale" }), false)
  assert.equal((await oldHost.showStage("review")).status, "error")
  assert.equal(stageHosts[1].isActive(), true)
})

test("transport failures are reported once per exact stage generation", async () => {
  const panel = fakePanel({ postMessage: async () => { throw new Error("TRANSPORT_FAILED") } })
  const h = harness({ panel })
  await h.controller.initialize({ initialStage: "traceability" })
  const host = h.hosts.get("traceability")

  await Promise.all([host.post({ type: "one" }), host.post({ type: "two" }), host.post({ type: "three" })])

  assert.deepEqual(h.errors, ["Code Consistency Review GUI: TRANSPORT_FAILED"])
})

test("initializer rechecks its lease immediately after the write before reloading", async () => {
  const commandStarted = deferred()
  const command = deferred()
  let loads = 0
  const h = harness({
    executeCommand: async () => { commandStarted.resolve(); return command.promise },
    loadReviewModel: async () => {
      loads += 1
      return { marker: `model-${loads}`, status: { tone: "muted", message: "ready" } }
    }
  })
  await h.controller.initialize()

  h.panel.emitWithoutWaiting({ type: "consistencyWizard.action", action: "initializeWorkspace" })
  await commandStarted.promise
  await h.panel.emit({ type: "consistencyReview.navigate", fromStage: "review", stage: "review-result-capture" })
  command.resolve({ status: "updated" })
  await turn()

  assert.equal(loads, 1, "a stale post-write operation must not start model reload")
  assert.match(h.panel.webview.html, /review-result-capture/)
})

test("initializer rechecks its lease after post-write model reload before committing", async () => {
  const reloadStarted = deferred()
  const reload = deferred()
  const initialModel = {
    marker: "initial",
    initialization: { initialized: true },
    status: { tone: "muted", message: "ready" }
  }
  const staleModel = {
    marker: "stale",
    initialization: { initialized: true },
    status: { tone: "ok", message: "stale" }
  }
  let loads = 0
  const h = harness({
    executeCommand: async () => ({ status: "updated" }),
    loadReviewModel: async () => {
      loads += 1
      if (loads === 1) return initialModel
      reloadStarted.resolve()
      return reload.promise
    }
  })
  await h.controller.initialize()

  const initialize = h.panel.emitPending({ type: "consistencyWizard.action", action: "initializeWorkspace" })
  await reloadStarted.promise
  await h.panel.emit({ type: "consistencyReview.navigate", fromStage: "review", stage: "review-result-capture" })
  reload.resolve(staleModel)
  await initialize

  assert.equal(h.controller.model, initialModel, "a stale reloaded model must not be committed")
  assert.match(h.panel.webview.html, /review-result-capture/)
})
