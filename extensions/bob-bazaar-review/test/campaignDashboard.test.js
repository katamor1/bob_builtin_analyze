const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  buildCampaignDashboard,
  renderCampaignDashboardCsv,
  renderCampaignDashboardMarkdown
} = require("../out/dashboard/campaignDashboard")

function run(reviewId, phase, status = "in_progress") {
  const completed = ["target", "packet", "result", "triage", "record", "summary"]
  const index = completed.indexOf(phase)
  return {
    campaignId: "campaign-1",
    reviewId,
    status,
    phase,
    phases: Object.fromEntries(completed.map((name, i) => [name, { status: status === "completed" || i <= index ? "completed" : "not_started" }])),
    metrics: { bobReviewSeconds: 60, humanTriageSeconds: 30, timingSource: "auto_wall_clock", correctedByUser: false },
    issues: []
  }
}

const record1 = {
  schema_version: "bazaar-review-record/v1",
  campaign_id: "campaign-1",
  record_id: "r1-run-001",
  review_id: "r1",
  vcs: { revision_mode: "singleRevision" },
  quality_gate: { schema_valid: true },
  metrics: {
    baseline_review_minutes: 20,
    bob_review_minutes: 5,
    human_triage_minutes: 3,
    findings_total: 2,
    findings_accepted: 1,
    findings_rejected: 1,
    findings_needs_investigation: 0,
    findings_deferred: 0
  }
}

const result1 = {
  review_id: "r1",
  findings: [
    { id: "F-1", rule_id: "RULE-A", severity: "error", title: "A" },
    { id: "F-2", rule_id: "RULE-B", severity: "warning", title: "B" }
  ]
}

const triage1 = {
  review_id: "r1",
  items: [
    { finding_id: "F-1", rule_id: "RULE-A", decision: "accepted" },
    { finding_id: "F-2", rule_id: "RULE-B", decision: "rejected", reason: "not applicable" }
  ],
  summary: { accepted: 1, rejected: 1, needs_investigation: 0, deferred: 0 }
}

test("builds campaign dashboard with progress, coverage, timing, and change type metrics", () => {
  const dashboard = buildCampaignDashboard({
    campaignId: "campaign-1",
    reviewRuns: [run("r1", "summary", "completed"), run("r2", "result")],
    records: [record1, {
      ...record1,
      record_id: "r3-run-001",
      review_id: "r3",
      vcs: { revision_mode: "revisionRange" },
      metrics: { bob_review_minutes: 2, human_triage_minutes: 1, findings_total: 0 }
    }],
    results: [{ reviewId: "r1", value: result1 }],
    triages: [{ reviewId: "r1", value: triage1 }],
    warnings: ["seed warning"]
  })

  assert.equal(dashboard.review_runs.total, 2)
  assert.equal(dashboard.review_runs.completed, 1)
  assert.equal(dashboard.review_runs.incomplete, 1)
  assert.equal(dashboard.review_runs.by_next_phase.triage, 1)
  assert.equal(dashboard.records.total, 2)
  assert.equal(dashboard.coverage.baseline_records, 1)
  assert.equal(dashboard.coverage.baseline_percent, 50)
  assert.equal(dashboard.timing.estimated_minutes_saved, 12)
  assert.equal(dashboard.change_types.singleRevision.records, 1)
  assert.equal(dashboard.change_types.revisionRange.records, 1)
  assert.ok(dashboard.warnings.includes("seed warning"))
})

test("joins findings to triage by finding id and reports orphan or missing rule evidence", () => {
  const dashboard = buildCampaignDashboard({
    campaignId: "campaign-1",
    reviewRuns: [run("r1", "summary", "completed")],
    records: [record1],
    results: [{ reviewId: "r1", value: {
      ...result1,
      findings: [...result1.findings, { id: "F-3", severity: "info", title: "No rule" }]
    }}],
    triages: [{ reviewId: "r1", value: {
      ...triage1,
      items: [...triage1.items, { finding_id: "MISSING", rule_id: "RULE-C", decision: "deferred", reason: "later" }]
    }}]
  })

  assert.deepEqual(dashboard.rules.map((row) => row.rule_id), ["RULE-A", "RULE-B"])
  assert.equal(dashboard.rules[0].accepted, 1)
  assert.equal(dashboard.rules[1].rejected, 1)
  assert.ok(dashboard.warnings.some((value) => value.includes("F-3") && value.includes("rule_id")))
  assert.ok(dashboard.warnings.some((value) => value.includes("MISSING") && value.includes("orphan")))
})

test("renders stable markdown and spreadsheet-safe CSV", () => {
  const dashboard = buildCampaignDashboard({
    campaignId: "=campaign-1",
    reviewRuns: [run("r1", "summary", "completed")],
    records: [record1],
    results: [{ reviewId: "r1", value: result1 }],
    triages: [{ reviewId: "r1", value: triage1 }]
  })

  const markdown = renderCampaignDashboardMarkdown(dashboard)
  assert.match(markdown, /# Campaign Dashboard/)
  assert.match(markdown, /## Coverage/)
  assert.match(markdown, /## Rule effectiveness/)

  const csv = renderCampaignDashboardCsv(dashboard)
  assert.equal(csv.split("\n")[0], "campaign_id,rule_id,severity,findings,accepted,rejected,needs_investigation,deferred,acceptance_rate_percent")
  assert.match(csv, /^'=campaign-1,RULE-A,error,1,1,0,0,0,100/m)
})
