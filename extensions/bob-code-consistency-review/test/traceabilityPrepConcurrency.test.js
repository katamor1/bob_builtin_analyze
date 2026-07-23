const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { writeTraceabilityCatalog } = require("../out/core/traceabilityCatalogStore")

async function makeWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "bob-trace-prep-cas-"))
}

function catalogWithDomains(domains) {
  return {
    schema_version: 1,
    documents: [],
    domains,
    items: [],
    links: [],
    decisions: []
  }
}

function webviewHarness(modelPostDelayMs = 0, options = {}) {
  const posted = []
  const html = []
  const host = {
    cspSource: "vscode-resource:",
    stage: "traceability",
    isActive: () => true,
    nextRenderToken: () => "token",
    render: (value) => { html.push(value); return options.renderResult ?? true },
    post: async (message) => {
      posted.push(message)
      if (modelPostDelayMs > 0 && message.type === "model") {
        await new Promise((resolve) => setTimeout(resolve, modelPostDelayMs))
      }
      return true
    },
    getWorkspaceRoot: () => undefined,
    showStage: async () => ({ status: "ok" })
  }
  return {
    create: (request) => require("../out/webview/traceabilityPrepWebview").createTraceabilityPrepStage(host, request),
    html,
    posted,
  }
}

test("Traceability Prep returns a structured error when the host rejects its render", async () => {
  const workspaceRoot = await makeWorkspace()
  await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDomains([]) })
  const harness = webviewHarness(0, { renderResult: false })

  const outcome = await harness.create(options(workspaceRoot)).initialize()

  assert.deepEqual(outcome, {
    status: "error",
    errors: ["traceability stage could not be rendered"]
  })
})

test("Traceability Prep renders the approved embedded stage navigation labels", async () => {
  const workspaceRoot = await makeWorkspace()
  await writeTraceabilityCatalog({ workspaceRoot, catalog: catalogWithDomains([]) })
  const harness = webviewHarness()

  const outcome = await harness.create(options(workspaceRoot)).initialize()

  assert.equal(outcome.status, "ok")
  const navigation = harness.html.at(-1).match(/<nav class="actions" aria-label="レビュー工程">[\s\S]*?<\/nav>/)?.[0]
  assert.ok(navigation)
  for (const label of ["レビュー準備", "トレーサビリティ整理", "レビュー結果取り込み", "指摘確認・振り分け"]) {
    assert.match(navigation, new RegExp(`>${label}<\\/button>`))
  }
  assert.doesNotMatch(navigation, />トレーサビリティ<\/button>/)
  assert.doesNotMatch(navigation, /人による判定/)
  assert.match(harness.html.at(-1), /<title>トレーサビリティ整理<\/title>/)
  assert.match(harness.html.at(-1), /<h1>トレーサビリティ整理<\/h1>/)
})

function options(workspaceRoot) {
  return {
    workspaceRoot,
    catalogPath: ".bob-trace/traceability-catalog.json",
    reportPath: ".bob-trace/gate-report.md",
    textEncoding: "utf8"
  }
}

test("Traceability Prep rejects an external winner without saved or gate-report side effects", async () => {
  const workspaceRoot = await makeWorkspace()
  await writeTraceabilityCatalog({
    workspaceRoot,
    catalog: catalogWithDomains([{ code: "PAY", status: "proposed" }])
  })
  const harness = webviewHarness()
  const stage = harness.create(options(workspaceRoot))
  await stage.initialize()
  await writeTraceabilityCatalog({
    workspaceRoot,
    catalog: catalogWithDomains([{ code: "AUTH", status: "accepted" }])
  })

  await stage.handleMessage({ type: "action", action: { type: "approveDomain", code: "PAY" } })
  await stage.handleMessage({ type: "save" })

  const final = JSON.parse(await fs.readFile(path.join(workspaceRoot, ".bob-trace", "traceability-catalog.json"), "utf8"))
  assert.deepEqual(final.domains, [{ code: "AUTH", status: "accepted" }])
  assert.equal(harness.posted.some((message) => message.type === "saved"), false)
  assert.ok(harness.posted.some((message) => message.type === "error" && /stale|refresh|再読込|更新/i.test(message.message)))
  await assert.rejects(fs.readFile(path.join(workspaceRoot, ".bob-trace", "gate-report.md"), "utf8"), /ENOENT/)
})

test("Traceability Prep serializes same-panel actions and consecutive saves while advancing revision", async () => {
  const workspaceRoot = await makeWorkspace()
  await writeTraceabilityCatalog({
    workspaceRoot,
    catalog: catalogWithDomains([
      { code: "PAY", status: "proposed" },
      { code: "AUTH", status: "proposed" }
    ])
  })
  const harness = webviewHarness(10)
  const stage = harness.create(options(workspaceRoot))
  await stage.initialize()

  await Promise.all([
    stage.handleMessage({ type: "action", action: { type: "approveDomain", code: "PAY" } }),
    stage.handleMessage({ type: "save" }),
    stage.handleMessage({ type: "action", action: { type: "approveDomain", code: "AUTH" } }),
    stage.handleMessage({ type: "save" })
  ])

  const saved = harness.posted.filter((message) => message.type === "saved")
  assert.equal(saved.length, 2)
  assert.notEqual(saved[0].backupPath, saved[1].backupPath)
  const final = JSON.parse(await fs.readFile(path.join(workspaceRoot, ".bob-trace", "traceability-catalog.json"), "utf8"))
  assert.deepEqual(final.domains.map((domain) => domain.status), ["accepted", "accepted"])
  assert.match(await fs.readFile(path.join(workspaceRoot, ".bob-trace", "gate-report.md"), "utf8"), /Traceability Gate Report/)
})
