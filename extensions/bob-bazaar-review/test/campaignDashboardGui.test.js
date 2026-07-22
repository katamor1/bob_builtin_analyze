const assert = require("node:assert/strict")
const fs = require("node:fs")
const Module = require("node:module")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

function dashboardFixture(campaignId = "campaign-<one>") {
  return {
    schema_version: "bazaar-campaign-dashboard/v1",
    campaign_id: campaignId,
    generated_at: "2026-07-12T03:00:00.000Z",
    overview: {
      review_runs_total: 2,
      completed_runs: 1,
      in_progress_runs: 1,
      failed_or_blocked_runs: 0,
      records_total: 1,
      triage_pending: 1,
      schema_valid_records: 1,
      schema_invalid_records: 0,
      schema_validation_rate: 1,
      findings_total: 1,
      findings_accepted: 1,
      findings_rejected: 0,
      findings_needs_investigation: 0,
      findings_deferred: 0,
      finding_acceptance_rate: 1,
      finding_rejection_rate: 0,
      finding_resolution_rate: 1,
      baseline_review_minutes_total: 10,
      bob_review_minutes_total: 2,
      human_triage_minutes_total: 1,
      estimated_minutes_saved: 7
    },
    runs: [
      {
        review_id: "review-<one>",
        status: "completed",
        target_mode: "singleRevision",
        next_action: "none",
        updated_at: "2026-07-12T02:00:00.000Z",
        triage_status: "completed",
        schema_valid: true,
        issue_count: 0,
        metrics_source: "record",
        baseline_review_minutes: 10,
        bob_review_minutes: 2,
        human_triage_minutes: 1,
        estimated_minutes_saved: 7,
        phases: {
          target: "completed", packet: "completed", result: "completed",
          triage: "completed", record: "completed", summary: "completed"
        },
        artifacts: {}
      }
    ],
    triage_pending: [
      {
        review_id: "pending-review",
        status: "in_progress",
        target_mode: "revisionRange",
        next_action: "humanTriage",
        updated_at: "2026-07-12T01:00:00.000Z",
        triage_status: "in_progress",
        schema_valid: null,
        issue_count: 1,
        metrics_source: "review_run",
        baseline_review_minutes: null,
        bob_review_minutes: 3,
        human_triage_minutes: 0,
        estimated_minutes_saved: null,
        phases: {
          target: "completed", packet: "completed", result: "completed",
          triage: "in_progress", record: "not_started", summary: "not_started"
        },
        artifacts: {}
      }
    ],
    rule_trends: [
      {
        rule_id: "RULE-<1>",
        title: "Unsafe <script>alert(1)</script>",
        detected_count: 1,
        accepted: 1,
        rejected: 0,
        needs_investigation: 0,
        deferred: 0,
        acceptance_rate: 1,
        rejection_rate: 0
      }
    ],
    change_type_trends: [
      {
        change_type: "singleRevision",
        review_runs: 1,
        completed_runs: 1,
        triage_pending: 0,
        schema_valid_records: 1,
        findings_total: 1,
        accepted: 1,
        rejected: 0,
        needs_investigation: 0,
        deferred: 0,
        acceptance_rate: 1,
        rejection_rate: 0,
        baseline_review_minutes: 10,
        bob_review_minutes: 2,
        human_triage_minutes: 1,
        estimated_minutes_saved: 7
      }
    ],
    warnings: [{ code: "unsafe", message: "Bad <img src=x onerror=alert(1)>" }]
  }
}

test("renders a CSP-safe accessible campaign dashboard with fixed actions", () => {
  const { renderCampaignDashboardHtml } = require("../out/ui/campaignDashboardGuiHtml")
  const html = renderCampaignDashboardHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-dashboard",
    renderToken: "render-dashboard",
    model: {
      workspaceRoot: "/workspace",
      campaigns: ["campaign-<one>", "campaign-two"],
      selectedCampaignId: "campaign-<one>",
      dashboard: dashboardFixture(),
      status: "loaded"
    }
  })

  assert.match(html, /レビュー実績/)
  assert.match(html, /id="campaignId"/)
  assert.match(html, /data-action="refresh"/)
  assert.match(html, /data-action="export"/)
  assert.match(html, /概要/)
  assert.match(html, /レビュー実行/)
  assert.match(html, /判定待ち/)
  assert.match(html, /規約別の傾向/)
  assert.match(html, /変更種別の傾向/)
  assert.match(html, /所要時間/)
  assert.match(html, /注意事項/)
  assert.match(html, /campaignDashboard\.refresh/)
  assert.match(html, /campaignDashboard\.selectCampaign/)
  assert.match(html, /campaignDashboard\.export/)
  assert.match(html, /nonce-dashboard/)
  assert.match(html, /render-dashboard/)
  assert.match(html, /100\.0%/)
  assert.match(html, /review-&lt;one&gt;/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.doesNotMatch(html, /<img src=x onerror=/)
  assert.doesNotMatch(html, /onclick=/)
})

test("requested campaign is selected without an active Review Run", async () => {
  const generated = []
  const { createBazaarReviewResultsStage } = loadDashboardStage({
    async listCampaignDashboardCampaigns() { return ["campaign-a", "campaign-b"] },
    async generateCampaignDashboard(_root, campaignId) {
      generated.push(campaignId)
      return dashboardFixture(campaignId)
    }
  })
  const host = dashboardHost()
  const stage = createBazaarReviewResultsStage(host, { campaignId: "campaign-b" })

  await stage.initialize()

  assert.deepEqual(generated, ["campaign-b"])
  assert.match(host.html, /<option value="campaign-b" selected>/)
})

test("campaign selection precedence is active Review Run then explicit request then first fallback", async () => {
  const generated = []
  const { createBazaarReviewResultsStage } = loadDashboardStage({
    async listCampaignDashboardCampaigns() { return ["campaign-a", "campaign-b"] },
    async generateCampaignDashboard(_root, campaignId) {
      generated.push(campaignId)
      return dashboardFixture(campaignId)
    }
  })

  const activeRunHost = dashboardHost({
    workspaceRoot: "/workspace",
    campaignId: "campaign-a"
  })
  await createBazaarReviewResultsStage(activeRunHost, { campaignId: "campaign-b" }).initialize()

  const fallbackHost = dashboardHost()
  await createBazaarReviewResultsStage(fallbackHost).initialize()

  assert.deepEqual(generated, ["campaign-a", "campaign-a"])
  assert.match(activeRunHost.html, /<option value="campaign-a" selected>/)
  assert.match(fallbackHost.html, /<option value="campaign-a" selected>/)
})

test("each in-stage dashboard render rotates its render token", async () => {
  const { createBazaarReviewResultsStage } = loadDashboardStage({
    async listCampaignDashboardCampaigns() { return ["campaign-a"] },
    async generateCampaignDashboard(_root, campaignId) { return dashboardFixture(campaignId) }
  })
  const host = dashboardHost()
  const stage = createBazaarReviewResultsStage(host, { campaignId: "campaign-a" })

  await stage.initialize()
  await stage.handleMessage({ type: "campaignDashboard.refresh" })

  assert.equal(host.renders.length, 2)
  assert.match(host.renders[0], /dashboard-render-token-1/)
  assert.match(host.renders[1], /dashboard-render-token-2/)
  assert.doesNotMatch(host.renders[1], /dashboard-render-token-1/)
})

test("latest dashboard operation wins when refresh and selection finish out of order", async () => {
  const oldRefresh = deferred()
  let holdOldRefresh = false
  const generated = []
  const { createBazaarReviewResultsStage } = loadDashboardStage({
    async listCampaignDashboardCampaigns() { return ["campaign-a", "campaign-b"] },
    async generateCampaignDashboard(_root, campaignId) {
      generated.push(campaignId)
      if (campaignId === "campaign-a" && holdOldRefresh) return oldRefresh.promise
      return dashboardFixture(campaignId)
    }
  })
  const host = dashboardHost()
  const stage = createBazaarReviewResultsStage(host, { campaignId: "campaign-a" })
  await stage.initialize()
  holdOldRefresh = true

  const refresh = stage.handleMessage({ type: "campaignDashboard.refresh" })
  await turn()
  const select = stage.handleMessage({ type: "campaignDashboard.selectCampaign", campaignId: "campaign-b" })
  await select
  oldRefresh.resolve(dashboardFixture("campaign-a"))
  await refresh

  assert.deepEqual(generated, ["campaign-a", "campaign-a", "campaign-b"])
  assert.match(host.html, /キャンペーン: campaign-b/)
  assert.doesNotMatch(host.html, /キャンペーン: campaign-a/)
})

test("inactive export completion has no write render post or notification effects", async () => {
  const exportBuild = deferred()
  let exporting = false
  let writes = 0
  const informationMessages = []
  const { createBazaarReviewResultsStage } = loadDashboardStage({
    async listCampaignDashboardCampaigns() { return ["campaign-a"] },
    async generateCampaignDashboard(_root, campaignId) {
      if (exporting) return exportBuild.promise
      return dashboardFixture(campaignId)
    },
    async writeCampaignDashboardArtifacts() {
      writes += 1
      return { jsonPath: "dashboard.json", markdownPath: "dashboard.md", csvPath: "dashboard.csv" }
    },
    async showInformationMessage(message) { informationMessages.push(message) }
  })
  const host = dashboardHost()
  const stage = createBazaarReviewResultsStage(host, { campaignId: "campaign-a" })
  await stage.initialize()
  const renderedBeforeExport = host.renders.length
  exporting = true

  const pending = stage.handleMessage({ type: "campaignDashboard.export" })
  await turn()
  host.active = false
  exportBuild.resolve(dashboardFixture("campaign-a"))
  await pending

  assert.equal(writes, 0)
  assert.equal(host.renders.length, renderedBeforeExport)
  assert.deepEqual(host.posts, [])
  assert.deepEqual(informationMessages, [])
})

test("campaign dashboard controller validates workspace and keeps a fixed message allowlist", () => {
  const source = fs.readFileSync(path.join(extensionRoot, "src", "ui", "campaignDashboardGui.ts"), "utf8")
  assert.match(source, /generateCampaignDashboard/)
  assert.match(source, /listCampaignDashboardCampaigns/)
  assert.match(source, /writeCampaignDashboardArtifacts/)
  assert.match(source, /assertReviewRunPathContained/)
  assert.match(source, /validateReviewRunSegment/)
  assert.match(source, /campaignDashboard\.refresh/)
  assert.match(source, /campaignDashboard\.selectCampaign/)
  assert.match(source, /campaignDashboard\.export/)
  assert.doesNotMatch(source, /executeCommand\(message/)
})

function dashboardHost(activeReviewRun) {
  const host = {
    active: true,
    renders: [],
    posts: [],
    cspSource: "vscode-resource:",
    stage: "review-results",
    isActive() { return host.active },
    nextRenderToken() { return "dashboard-render-token-" + (host.renders.length + 1) },
    render(html) {
      if (!host.active) return false
      host.renders.push(String(html))
      return true
    },
    async post(message) {
      if (!host.active) return false
      host.posts.push(structuredClone(message))
      return true
    },
    getActiveReviewRun() { return activeReviewRun },
    commitActiveReviewRun() { return false },
    getWorkspaceRoot() { return "/workspace" },
    async showStage() { return false }
  }
  Object.defineProperty(host, "html", { get: () => host.renders.at(-1) ?? "" })
  return host
}

function loadDashboardStage(overrides = {}) {
  const modulePath = require.resolve("../out/ui/campaignDashboardGui")
  const originalLoad = Module._load
  delete require.cache[modulePath]
  Module._load = function load(request, parent, isMain) {
    if (request === "vscode") {
      return {
        workspace: { workspaceFolders: [{ uri: { fsPath: "/workspace" } }] },
        window: { showInformationMessage: overrides.showInformationMessage ?? (async () => undefined) }
      }
    }
    if (request === "../dashboard/campaignDashboard") {
      return {
        listCampaignDashboardCampaigns: overrides.listCampaignDashboardCampaigns,
        generateCampaignDashboard: overrides.generateCampaignDashboard
      }
    }
    if (request === "../dashboard/campaignDashboardExport") {
      return { writeCampaignDashboardArtifacts: overrides.writeCampaignDashboardArtifacts ?? (async () => ({})) }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
  }
}

function deferred() {
  let resolve
  const promise = new Promise((resolvePromise) => { resolve = resolvePromise })
  return { promise, resolve }
}

function turn() {
  return new Promise((resolve) => setImmediate(resolve))
}
