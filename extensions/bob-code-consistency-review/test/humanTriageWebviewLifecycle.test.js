const assert = require("node:assert/strict")
const Module = require("node:module")
const { test } = require("node:test")

const MODULE = require.resolve("../out/webview/consistencyHumanTriage")

function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function loadStage(options = {}) {
  const originalLoad = Module._load
  delete require.cache[MODULE]
  Module._load = function patched(request, parent, isMain) {
    if (request === "vscode") {
      return { workspace: { getConfiguration: () => ({ get: (_key, fallback) => fallback }) } }
    }
    if (request === "../reviewExecutionCommands") {
      return { runTriage: options.runTriage ?? (async () => ({ status: "ok" })) }
    }
    if (request === "../triage/humanTriageWorkspace") {
      return {
        loadHumanTriageWorkspace: options.loadHumanTriageWorkspace ?? (async () => ({
          sourceSha256: "source-sha",
          decisionRevision: 4,
          items: [],
          issues: []
        })),
        saveHumanTriageDecisions: options.saveHumanTriageDecisions ?? (async () => undefined)
      }
    }
    if (request === "./consistencyHumanTriageHtml") {
      return { renderConsistencyHumanTriageHtml: ({ model }) => `<main>${model.sourceSha256}:${model.decisionRevision}</main>` }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try { return require(MODULE) } finally { Module._load = originalLoad }
}

function hostHarness(options = {}) {
  let active = true
  const html = []
  const posts = []
  const host = {
    cspSource: "vscode-resource:",
    stage: "triage",
    isActive: () => active,
    nextRenderToken: () => active ? "token" : "",
    render(value) { if (!active) return false; html.push(value); return options.renderResult ?? true },
    async post(message) { if (!active) return false; posts.push(message); return true },
    getWorkspaceRoot: () => active ? "/workspace" : undefined,
    async showStage() { return { status: "ok" } }
  }
  return { host, html, posts, deactivate: () => { active = false } }
}

test("embedded Human Triage returns a structured error when the host rejects its render", async () => {
  const module = loadStage()
  const harness = hostHarness({ renderResult: false })

  const outcome = await module.createConsistencyHumanTriageStage(harness.host).initialize()

  assert.deepEqual(outcome, { status: "error", errors: ["triage stage could not be rendered"] })
})

test("embedded Human Triage does not render when its stage becomes inactive during initialization", async () => {
  const load = deferred()
  const module = loadStage({ loadHumanTriageWorkspace: () => load.promise })
  const harness = hostHarness()
  const stage = module.createConsistencyHumanTriageStage(harness.host)

  const initializing = stage.initialize()
  harness.deactivate()
  load.resolve({ sourceSha256: "sha", decisionRevision: 0, items: [], issues: [] })
  const outcome = await initializing

  assert.equal(outcome.status, "error")
  assert.deepEqual(harness.html, [])
})

test("embedded Human Triage preserves source hash and decision revision conflict tokens", async () => {
  const saves = []
  const module = loadStage({ saveHumanTriageDecisions: async (input) => { saves.push(input) } })
  const harness = hostHarness()
  const stage = module.createConsistencyHumanTriageStage(harness.host)
  await stage.initialize()

  await stage.handleMessage({
    type: "consistencyHumanTriage.action",
    action: "saveDecisions",
    sourceSha256: "expected-source",
    decisionRevision: 7,
    items: []
  })

  assert.equal(saves.length, 1)
  assert.equal(saves[0].expectedSourceSha256, "expected-source")
  assert.equal(saves[0].expectedDecisionRevision, 7)
})

test("embedded Human Triage serializes overlapping mutations", async () => {
  const first = deferred()
  let calls = 0
  const module = loadStage({
    runTriage: async () => {
      calls += 1
      if (calls === 1) await first.promise
      return { status: "ok" }
    }
  })
  const harness = hostHarness()
  const stage = module.createConsistencyHumanTriageStage(harness.host)
  await stage.initialize()

  const one = stage.handleMessage({ type: "consistencyHumanTriage.action", action: "generateTriage" })
  const two = stage.handleMessage({ type: "consistencyHumanTriage.action", action: "generateTriage" })
  await Promise.resolve()
  assert.equal(calls, 1)
  first.resolve()
  await Promise.all([one, two])
  assert.equal(calls, 2)
})
