const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  CAMPAIGN_DASHBOARD_SCHEMA_VERSION,
  buildCampaignDashboard
} = require("../out/dashboard/campaignDashboardCore")

function phase(status, extra = {}) {
  return { status, ...extra }
}

function makeRun(overrides = {}) {
  const reviewId = overrides.reviewId ?? "review-1"
  const targetMode = overrides.targetMode ?? "singleRevision"
  const completed = overrides.status === "completed"
  return {
    schemaVersion: "bazaar-review-run/v1",
    workspaceRoot: "/workspace",
    campaignId: "campaign-1",
    reviewId,
    phase: completed ? "completed" : "result",
    status: overrides.status ?? "in_progress",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-07-12T01:00:00.000Z",
    target: {
      mode: targetMode,
      repositoryRoot: "/workspace",
      revision: targetMode === "singleRevision" ? "1" : undefined,
      baseRevision: targetMode === "singleRevision" ? undefined : "1",
      targetRevision: targetMode === "revisionRange" ? "2" : undefined
    },
    artifacts: {
      reviewPacketPath: `.bob-review-records/campaigns/campaign-1/records/${reviewId}/review-packet.md`,
      reviewResultJsonPath: `.bob/review/results/${reviewId}.json`,
      reviewResultMarkdownPath: `.bob/review/results/${reviewId}.md`,
      ...(overrides.triageCompleted
        ? { triageYamlPath: `.bob-review-records/campaigns/campaign-1/records/${reviewId}/triage.yaml` }
        : {}),
      ...(completed
        ? {
            recordYamlPath: `.bob-review-records/campaigns/campaign-1/records/${reviewId}/record.yaml`,
            summaryJsonPath: ".bob-review-records/campaigns/campaign-1/summary.json",
            summaryMarkdownPath: ".bob-review-records/campaigns/campaign-1/summary.md"
          }
        : {})
    },
    phases: {
      target: phase("completed"),
      packet: phase("completed"),
      result: phase("completed"),
      triage: phase(overrides.triageCompleted ? "completed" : "in_progress"),
      record: phase(completed ? "completed" : "not_started"),
      summary: phase(completed ? "completed" : "not_started")
    },
    metrics: {
      baselineReviewMinutes: overrides.provisionalBaseline,
      bobReviewSeconds: overrides.provisionalBobSeconds ?? 0,
      humanTriageSeconds: overrides.provisionalTriageSeconds ?? 0,
      timingSource: "auto_wall_clock",
      correctedByUser: false
    },
    issues: overrides.issues ?? []
  }
}

function makeRecord(reviewId, schemaValid, metrics) {
  return {
    schema_version: "bazaar-review-record/v1",
    campaign_id: "campaign-1",
    record_id: `${reviewId}-run-001`,
    review_id: reviewId,
    workflow: { status: "completed" },
    vcs: { revision_mode: reviewId === "review-1" ? "singleRevision" : "revisionRange" },
    quality_gate: { schema_valid: schemaValid },
    metrics
  }
}

function makeTriage(reviewId) {
  const items = [
    { finding_id: "F-1", rule_id: "RULE-1", decision: "accepted", owner: "team" },
    { finding_id: "F-2", rule_id: "RULE-1", decision: "accepted", action: "fix" },
    { finding_id: "F-3", rule_id: "RULE-1", decision: "rejected", reason: "not reproducible" },
    { finding_id: "F-4", rule_id: "RULE-2", decision: "needs_investigation", owner: "team", action: "inspect" }
  ]
  return {
    schema_version: "bazaar-review-triage/v1",
    review_id: reviewId,
    items,
    summary: { accepted: 2, rejected: 1, needs_investigation: 1, deferred: 0 }
  }
}

test("builds campaign overview with explicit rate denominators", () => {
  const dashboard = buildCampaignDashboard({
    campaignId: "campaign-1",
    generatedAt: "2026-07-12T02:00:00.000Z",
    evidence: [
      {
        run: makeRun({ status: "completed", triageCompleted: true, updatedAt: "2026-07-12T01:30:00.000Z" }),
        recordPresent: true,
        record: makeRecord("review-1", true, {
          baseline_review_minutes: 10,
          bob_review_minutes: 2,
          human_triage_minutes: 1
        }),
        triage: makeTriage("review-1"),
        triageValid: true,
        ruleTitles: { "RULE-1": "Rule one", "RULE-2": "Rule two" },
        warnings: []
      },
      {
        run: makeRun({ reviewId: "review-2", targetMode: "revisionRange", updatedAt: "2026-07-12T01:00:00.000Z" }),
        recordPresent: true,
        record: makeRecord("review-2", false, {
          baseline_review_minutes: 20,
          bob_review_minutes: 4,
          human_triage_minutes: 2
        }),
        triageValid: false,
        ruleTitles: {},
        warnings: []
      }
    ],
    warnings: []
  })

  assert.equal(dashboard.schema_version, CAMPAIGN_DASHBOARD_SCHEMA_VERSION)
  assert.equal(dashboard.overview.review_runs_total, 2)
  assert.equal(dashboard.overview.completed_runs, 1)
  assert.equal(dashboard.overview.in_progress_runs, 1)
  assert.equal(dashboard.overview.records_total, 2)
  assert.equal(dashboard.overview.triage_pending, 1)
  assert.equal(dashboard.overview.schema_valid_records, 1)
  assert.equal(dashboard.overview.schema_invalid_records, 1)
  assert.equal(dashboard.overview.schema_validation_rate, 0.5)
  assert.equal(dashboard.overview.findings_total, 4)
  assert.equal(dashboard.overview.findings_accepted, 2)
  assert.equal(dashboard.overview.findings_rejected, 1)
  assert.equal(dashboard.overview.finding_acceptance_rate, 0.5)
  assert.equal(dashboard.overview.finding_rejection_rate, 0.25)
  assert.equal(dashboard.overview.finding_resolution_rate, 0.75)
  assert.equal(dashboard.overview.baseline_review_minutes_total, 30)
  assert.equal(dashboard.overview.bob_review_minutes_total, 6)
  assert.equal(dashboard.overview.human_triage_minutes_total, 3)
  assert.equal(dashboard.overview.estimated_minutes_saved, 21)
  assert.deepEqual(dashboard.triage_pending.map((run) => run.review_id), ["review-2"])
})

test("aggregates rule and target-mode trends deterministically", () => {
  const dashboard = buildCampaignDashboard({
    campaignId: "campaign-1",
    generatedAt: "2026-07-12T02:00:00.000Z",
    evidence: [
      {
        run: makeRun({ status: "completed", triageCompleted: true }),
        recordPresent: true,
        record: makeRecord("review-1", true, {}),
        triage: makeTriage("review-1"),
        triageValid: true,
        ruleTitles: { "RULE-1": "Rule one", "RULE-2": "Rule two" },
        warnings: []
      },
      {
        run: makeRun({ reviewId: "review-2", targetMode: "revisionRange" }),
        recordPresent: false,
        triageValid: false,
        ruleTitles: {},
        warnings: []
      }
    ],
    warnings: []
  })

  assert.deepEqual(dashboard.rule_trends.map((item) => item.rule_id), ["RULE-1", "RULE-2"])
  assert.equal(dashboard.rule_trends[0].detected_count, 3)
  assert.equal(dashboard.rule_trends[0].accepted, 2)
  assert.equal(dashboard.rule_trends[0].acceptance_rate, 0.6667)
  assert.equal(dashboard.rule_trends[0].rejection_rate, 0.3333)
  assert.deepEqual(
    dashboard.change_type_trends.map((item) => item.change_type),
    ["singleRevision", "revisionRange", "workingTreeSinceRevision"]
  )
  assert.equal(dashboard.change_type_trends[0].review_runs, 1)
  assert.equal(dashboard.change_type_trends[0].findings_total, 4)
  assert.equal(dashboard.change_type_trends[1].review_runs, 1)
  assert.equal(dashboard.change_type_trends[2].review_runs, 0)
})

test("uses null rates for empty denominators and exposes provisional run metrics", () => {
  const empty = buildCampaignDashboard({
    campaignId: "campaign-empty",
    generatedAt: "2026-07-12T02:00:00.000Z",
    evidence: [],
    warnings: []
  })
  assert.equal(empty.overview.schema_validation_rate, null)
  assert.equal(empty.overview.finding_acceptance_rate, null)
  assert.equal(empty.overview.finding_rejection_rate, null)
  assert.equal(empty.overview.finding_resolution_rate, null)

  const dashboard = buildCampaignDashboard({
    campaignId: "campaign-1",
    generatedAt: "2026-07-12T02:00:00.000Z",
    evidence: [
      {
        run: makeRun({
          provisionalBaseline: 8,
          provisionalBobSeconds: 90,
          provisionalTriageSeconds: 30,
          issues: [{ phase: "result", message: "retry", retryable: true, recordedAt: "2026-07-12T01:00:00.000Z" }]
        }),
        recordPresent: false,
        triageValid: false,
        ruleTitles: {},
        warnings: []
      }
    ],
    warnings: []
  })
  assert.equal(dashboard.runs[0].metrics_source, "review_run")
  assert.equal(dashboard.runs[0].baseline_review_minutes, 8)
  assert.equal(dashboard.runs[0].bob_review_minutes, 1.5)
  assert.equal(dashboard.runs[0].human_triage_minutes, 0.5)
  assert.equal(dashboard.runs[0].estimated_minutes_saved, 6)
  assert.equal(dashboard.runs[0].issue_count, 1)
})
