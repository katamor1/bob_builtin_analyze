const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const { extensionRoot } = require("./helpers/sourceReader")

function dashboardFixture() {
  return {
    schema_version: "bazaar-campaign-dashboard/v1",
    campaign_id: "campaign-<one>",
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
    model: {
      workspaceRoot: "/workspace",
      campaigns: ["campaign-<one>", "campaign-two"],
      selectedCampaignId: "campaign-<one>",
      dashboard: dashboardFixture(),
      status: "loaded"
    }
  })

  assert.match(html, /レビューキャンペーン ダッシュボード/)
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
  assert.match(html, /100\.0%/)
  assert.match(html, /review-&lt;one&gt;/)
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/)
  assert.doesNotMatch(html, /<img src=x onerror=/)
  assert.doesNotMatch(html, /onclick=/)
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
