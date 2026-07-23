const assert = require("node:assert/strict")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const GUI_MODULE = require.resolve("../out/ui/reviewGui")

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function reviewRun(reviewId, overrides = {}) {
  const progress = (status) => ({ status, updatedAt: "2026-07-23T00:00:00.000Z" })
  return {
    workspaceRoot: "/workspace",
    campaignId: "campaign-a",
    reviewId,
    phase: "result",
    status: "in_progress",
    phases: {
      target: progress("completed"),
      packet: progress("completed"),
      result: progress("in_progress"),
      triage: progress("not_started"),
      record: progress("not_started"),
      summary: progress("not_started")
    },
    artifacts: {},
    metrics: {},
    issues: [],
    target: { mode: "singleRevision", repositoryRoot: "/workspace", revision: "42" },
    createdAt: "2026-07-23T00:00:00.000Z",
    updatedAt: "2026-07-23T00:00:00.000Z",
    ...overrides
  }
}

function fakePanel(options = {}) {
  const messageListeners = []
  const disposeListeners = []
  const posts = []
  const htmlHistory = []
  const webview = {
    cspSource: "vscode-resource:",
    onDidReceiveMessage(listener) {
      messageListeners.push(listener)
      return { dispose() {} }
    },
    async postMessage(message) {
      posts.push(structuredClone(message))
      if (options.postMessage) return options.postMessage(message)
      return true
    }
  }
  Object.defineProperty(webview, "html", {
    get: () => htmlHistory.at(-1) ?? "",
    set: (value) => htmlHistory.push(String(value))
  })
  const panel = {
    webview,
    posts,
    htmlHistory,
    renderToken: undefined,
    onDidDispose(listener) {
      disposeListeners.push(listener)
      return { dispose() {} }
    },
    emitWithoutWaiting(message) {
      const ownedMessage = panel.renderToken && message?.renderToken === undefined
        ? { ...message, renderToken: panel.renderToken }
        : message
      for (const listener of messageListeners) void listener(structuredClone(ownedMessage))
    },
    async emit(message) {
      const ownedMessage = panel.renderToken && message?.renderToken === undefined
        ? { ...message, renderToken: panel.renderToken }
        : message
      for (const listener of messageListeners) await Promise.resolve(listener(structuredClone(ownedMessage)))
      await turn()
    },
    dispose() {
      for (const listener of disposeListeners.splice(0)) listener()
    }
  }
  return panel
}

function loadReviewGui(errorMessages, options = {}) {
  const vscode = {
    ViewColumn: { One: 1 },
    window: {
      showErrorMessage: async (message) => { errorMessages.push(String(message)) },
      showInformationMessage: async () => undefined,
      showWarningMessage: async () => undefined,
      showQuickPick: async () => undefined,
      showInputBox: async () => undefined
    },
    workspace: {
      workspaceFolders: [{ uri: { fsPath: "/workspace" } }],
      isTrusted: true,
      getConfiguration: () => ({
        get: (_name, fallback) => fallback,
        inspect: () => undefined
      })
    },
    commands: { executeCommand: async () => undefined },
    env: { clipboard: { writeText: async () => undefined } }
  }
  const originalLoad = Module._load
  delete require.cache[GUI_MODULE]
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") return vscode
    if (request === "../bazaar/reviewTarget" && options.prepareTarget) {
      return { ...originalLoad.call(this, request, parent, isMain), prepareTarget: options.prepareTarget }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(GUI_MODULE)
  } finally {
    Module._load = originalLoad
  }
}

function controllerHarness(options = {}) {
  const errors = []
  const module = loadReviewGui(errors, options)
  assert.equal(typeof module.BazaarReviewGuiController, "function")
  const panel = options.panel ?? fakePanel()
  const hosts = new Map()
  const services = new Map()
  const stageRequests = []
  let tokenSequence = 0
  const createStageService = options.createStageService ?? ((stage, host) => {
    hosts.set(stage, host)
    const service = {
      async initialize() { host.render(`<main data-stage="${stage}">${stage}</main>`) },
      async handleMessage() {}
    }
    services.set(stage, service)
    return service
  })
  const context = { subscriptions: [] }
  const controller = new module.BazaarReviewGuiController(context, panel, undefined, {
    renderReviewHtml: () => "<main data-stage=\"review\">review</main>",
    createRenderToken: () => {
      panel.renderToken = `render-${++tokenSequence}`
      return panel.renderToken
    },
    createStageService: (stage, host, request) => {
      hosts.set(stage, host)
      stageRequests.push({ stage, request })
      const service = createStageService(stage, host, request)
      services.set(stage, service)
      return service
    },
    initialReviewRun: options.initialReviewRun,
    validateReviewRunCommandInput: options.validateReviewRunCommandInput ?? (async (input) => input),
    loadReviewRun: options.loadReviewRun ?? (async (input) => reviewRun(input.reviewId)),
    nextReviewRunAction: options.nextReviewRunAction ?? (() => "resultCapture")
  })
  controller.initialize()
  return { controller, panel, errors, hosts, services, stageRequests }
}

test("dashboard campaign request is propagated without an active Review Run", async () => {
  const harness = controllerHarness()

  await harness.panel.emit({ type: "openCampaignDashboard", campaignId: "campaign-requested" })

  assert.deepEqual(harness.stageRequests, [{
    stage: "review-results",
    request: { campaignId: "campaign-requested" }
  }])
})

test("messages require both the active render token and matching source stage", async () => {
  const received = []
  const harness = controllerHarness({
    createStageService(stage, host) {
      return {
        async initialize() { host.render(`<main>${stage}</main>`) },
        async handleMessage(message) { received.push(message.type) }
      }
    }
  })

  await harness.panel.emit({ type: "openResultCapture" })
  const firstCaptureToken = harness.panel.renderToken ?? "render-2"
  await harness.panel.emit({
    type: "bazaarReview.navigate",
    fromStage: "review-result-capture",
    stage: "review-result-capture"
  })
  const secondCaptureToken = harness.panel.renderToken ?? "render-3"

  await harness.panel.emit({
    type: "bazaarResultCapture.action",
    action: "captureCandidates",
    renderToken: firstCaptureToken
  })
  await harness.panel.emit({
    type: "bazaarResultCapture.action",
    action: "captureCandidates",
    renderToken: secondCaptureToken
  })
  await harness.panel.emit({
    type: "bazaarReview.navigate",
    fromStage: "triage",
    stage: "review-results",
    renderToken: secondCaptureToken
  })

  assert.deepEqual(received, ["bazaarResultCapture.action"])
  assert.match(harness.panel.webview.html, /review-result-capture/)
})

test("latest stage wins when stage initializers finish out of order", async () => {
  const gates = new Map([
    ["review-result-capture", deferred()],
    ["triage", deferred()]
  ])
  const harness = controllerHarness({
    createStageService(stage, host) {
      return {
        async initialize() {
          await gates.get(stage)?.promise
          host.render(`<main>${stage}</main>`)
        },
        async handleMessage() {}
      }
    }
  })

  harness.panel.emitWithoutWaiting({ type: "openResultCapture" })
  await turn()
  harness.panel.emitWithoutWaiting({
    type: "bazaarReview.navigate",
    fromStage: "review-result-capture",
    stage: "triage"
  })
  await turn()
  gates.get("triage").resolve()
  await turn()
  gates.get("review-result-capture").resolve()
  await turn()

  assert.match(harness.panel.webview.html, /triage/)
  assert.doesNotMatch(harness.panel.webview.html, /review-result-capture/)
})

test("inactive stage completion cannot render post commit context or navigate", async () => {
  const completion = deferred()
  const initial = reviewRun("review-a")
  const next = reviewRun("review-a", { phase: "triage" })
  const observations = {}
  const harness = controllerHarness({
    initialReviewRun: initial,
    createStageService(stage, host) {
      if (stage !== "review-result-capture") {
        return { async initialize() { host.render(`<main>${stage}</main>`) }, async handleMessage() {} }
      }
      return {
        async initialize() { host.render("<main>capture</main>") },
        async handleMessage() {
          await completion.promise
          observations.committed = host.commitActiveReviewRun(initial, next)
          observations.posted = await host.post({ ok: true })
          observations.navigated = await host.showStage("triage")
        }
      }
    }
  })
  await harness.panel.emit({ type: "openResultCapture" })
  harness.panel.emitWithoutWaiting({ type: "bazaarResultCapture.action", action: "captureCandidates" })
  await turn()
  await harness.panel.emit({
    type: "bazaarReview.navigate",
    fromStage: "review-result-capture",
    stage: "review-results"
  })
  completion.resolve()
  await turn()

  assert.deepEqual(observations, { committed: false, posted: false, navigated: false })
  assert.match(harness.panel.webview.html, /review-results/)
  assert.equal(harness.panel.posts.some((message) => message.ok === true), false)
})

test("disposed panel rejects delayed stage effects", async () => {
  const completion = deferred()
  let outcomes
  const harness = controllerHarness({
    createStageService(_stage, host) {
      return {
        async initialize() {
          await completion.promise
          outcomes = {
            rendered: host.render("<main>late</main>"),
            posted: await host.post({ late: true })
          }
        },
        async handleMessage() {}
      }
    }
  })
  harness.panel.emitWithoutWaiting({ type: "openResultCapture" })
  await turn()
  harness.panel.dispose()
  completion.resolve()
  await turn()

  assert.deepEqual(outcomes, { rendered: false, posted: false })
  assert.doesNotMatch(harness.panel.webview.html, /late/)
})

test("transport rejection is caught and reported once per stage lease", async () => {
  const panel = fakePanel({ postMessage: async () => { throw new Error("transport down") } })
  let outcomes
  const harness = controllerHarness({
    panel,
    createStageService(_stage, host) {
      return {
        async initialize() {
          outcomes = await Promise.all([
            host.post({ attempt: 1 }),
            host.post({ attempt: 2 }),
            host.post({ attempt: 3 })
          ])
        },
        async handleMessage() {}
      }
    }
  })
  await harness.panel.emit({ type: "openResultCapture" })
  await turn()

  assert.deepEqual(outcomes, [false, false, false])
  assert.equal(harness.errors.length, 1)
  assert.match(harness.errors[0], /transport down/)
})

test("messages are dispatched only to the active stage namespace", async () => {
  const received = []
  const harness = controllerHarness({
    createStageService(stage, host) {
      return {
        async initialize() { host.render(`<main>${stage}</main>`) },
        async handleMessage(message) { received.push(message.type) }
      }
    }
  })
  await harness.panel.emit({ type: "openResultCapture" })
  await harness.panel.emit({ type: "openHumanTriage" })
  await harness.panel.emit({ type: "bazaarHumanTriage.action", action: "saveDecisions" })
  await harness.panel.emit({ type: "campaignDashboard.refresh" })
  await harness.panel.emit({ type: "bazaarResultCapture.action", action: "captureCandidates" })

  assert.deepEqual(received, ["bazaarResultCapture.action"])
})

test("stage messages are ignored until initialization finishes", async () => {
  const initialization = deferred()
  const received = []
  const harness = controllerHarness({
    createStageService(_stage, host) {
      return {
        async initialize() {
          await initialization.promise
          host.render("<main>ready</main>")
        },
        async handleMessage(message) { received.push(message.type) }
      }
    }
  })

  harness.panel.emitWithoutWaiting({ type: "openResultCapture" })
  await turn()
  await harness.panel.emit({ type: "bazaarResultCapture.action", action: "captureCandidates" })
  assert.deepEqual(received, [])
  initialization.resolve()
  await turn()
  await harness.panel.emit({ type: "bazaarResultCapture.action", action: "captureCandidates" })
  assert.deepEqual(received, ["bazaarResultCapture.action"])
})

test("active Review Run commits compare exact prior identity", async () => {
  const initial = reviewRun("review-a")
  const staleClone = structuredClone(initial)
  const staleSameIdentity = reviewRun("review-a", { phase: "triage" })
  const first = reviewRun("review-a", { phase: "triage" })
  const stale = reviewRun("review-a", { phase: "record" })
  const foreign = reviewRun("review-b")
  let outcomes
  const harness = controllerHarness({
    initialReviewRun: initial,
    createStageService(_stage, host) {
      return {
        async initialize() {
          outcomes = [
            host.commitActiveReviewRun(staleClone, staleSameIdentity),
            host.commitActiveReviewRun(initial, first),
            host.commitActiveReviewRun(initial, stale),
            host.commitActiveReviewRun(first, foreign)
          ]
        },
        async handleMessage() {}
      }
    }
  })
  await harness.panel.emit({ type: "openResultCapture" })

  assert.deepEqual(outcomes, [false, true, false, false])
  assert.equal(harness.hosts.get("review-result-capture").getActiveReviewRun().phase, "triage")
})

test("resume rechecks its lease after awaiting postMessage", async () => {
  const postGate = deferred()
  const panel = fakePanel({
    postMessage: async (message) => {
      if (message.type === "activeReviewRun") await postGate.promise
      return true
    }
  })
  const harness = controllerHarness({ panel, nextReviewRunAction: () => "resultCapture" })
  harness.panel.emitWithoutWaiting({
    type: "resumeReviewRun",
    workspaceRoot: "/workspace",
    campaignId: "campaign-a",
    reviewId: "review-a"
  })
  await until(() => panel.posts.some((message) => message.type === "activeReviewRun"))
  await harness.panel.emit({ type: "openCampaignDashboard" })
  postGate.resolve()
  await turn()

  assert.match(harness.panel.webview.html, /review-results/)
  assert.equal(harness.hosts.has("review-result-capture"), false)
  assert.equal(harness.hosts.get("review-results").getActiveReviewRun(), undefined)
})

test("latest main-stage target load wins when requests finish out of order", async () => {
  const firstLoad = deferred()
  const preparedTarget = (revision) => ({
    root: "/workspace",
    diff: { stdout: "", stderr: "", exitCode: 0 },
    info: {
      mode: "singleRevision",
      targetLabel: revision,
      revision,
      targetRevision: revision,
      author: "author",
      committer: "committer",
      timestamp: "2026-07-23T00:00:00.000Z",
      message: revision,
      changedFileCount: 0,
      changedFiles: [],
      changedFileEntries: []
    }
  })
  const calls = []
  const harness = controllerHarness({
    async prepareTarget(_client, _workspaceRoot, request) {
      calls.push(request.revision)
      if (request.revision === "old") return firstLoad.promise
      return preparedTarget(request.revision)
    }
  })
  harness.controller.bazaarWorkspaceFolder = { uri: { fsPath: "/workspace" }, name: "workspace", index: 0 }

  harness.panel.emitWithoutWaiting({ type: "loadTarget", mode: "singleRevision", revision: "old" })
  await until(() => calls.includes("old") || harness.errors.length > 0 || harness.panel.posts.some((message) => message.type === "error"))
  assert.deepEqual(harness.errors, [])
  assert.deepEqual(harness.panel.posts.filter((message) => message.type === "error"), [])
  harness.panel.emitWithoutWaiting({ type: "loadTarget", mode: "singleRevision", revision: "new" })
  await until(() => harness.panel.posts.some((message) => message.type === "targetInfo" && message.info.revision === "new"))
  firstLoad.resolve(preparedTarget("old"))
  await turn()

  assert.deepEqual(
    harness.panel.posts.filter((message) => message.type === "targetInfo").map((message) => message.info.revision),
    ["new"]
  )
})

test("stage initialization failure is contained without an unhandled rejection", async () => {
  const harness = controllerHarness({
    createStageService() {
      return {
        async initialize() { throw new Error("initialization failed") },
        async handleMessage() {}
      }
    }
  })

  await harness.panel.emit({ type: "openResultCapture" })
  await turn()

  assert.equal(harness.errors.length, 1)
  assert.match(harness.errors[0], /initialization failed/)
})

async function until(predicate, attempts = 50) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return
    await turn()
  }
  assert.fail("condition was not reached")
}

function turn() {
  return new Promise((resolve) => setImmediate(resolve))
}
