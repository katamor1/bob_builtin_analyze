const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { generateCampaignDashboardArtifacts, listCampaignIds } = require("../out/dashboard/campaignDashboardStore")

test("generates dashboard JSON, Markdown, and CSV from persisted campaign evidence", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-dashboard-"))
  const campaignId = "campaign-1"
  const reviewId = "review-1"
  const recordRoot = path.join(workspaceRoot, ".bob-review-records", "campaigns", campaignId, "records", reviewId)
  const resultRoot = path.join(workspaceRoot, ".bob", "review", "results")
  await fs.mkdir(recordRoot, { recursive: true })
  await fs.mkdir(resultRoot, { recursive: true })

  const resultPath = path.join(resultRoot, `${reviewId}.json`)
  await fs.writeFile(resultPath, JSON.stringify({
    review_id: reviewId,
    findings: [{ id: "F-1", rule_id: "RULE-1", severity: "warning", title: "Finding" }]
  }), "utf8")
  await fs.writeFile(path.join(recordRoot, "record.yaml"), JSON.stringify({
    schema_version: "bazaar-review-record/v1",
    campaign_id: campaignId,
    record_id: `${reviewId}-run-001`,
    review_id: reviewId,
    vcs: { revision_mode: "singleRevision" },
    outputs: { review_result_json: `.bob/review/results/${reviewId}.json` },
    quality_gate: { schema_valid: true },
    metrics: { baseline_review_minutes: 10, bob_review_minutes: 2, human_triage_minutes: 1, findings_total: 1 }
  }), "utf8")
  await fs.writeFile(path.join(recordRoot, "triage.yaml"), JSON.stringify({
    schema_version: "bazaar-review-triage/v1",
    review_id: reviewId,
    items: [{ finding_id: "F-1", rule_id: "RULE-1", decision: "accepted", owner: "team" }],
    summary: { accepted: 1, rejected: 0, needs_investigation: 0, deferred: 0 }
  }), "utf8")

  assert.deepEqual(await listCampaignIds(workspaceRoot), [campaignId])
  const artifacts = await generateCampaignDashboardArtifacts(workspaceRoot, campaignId, "2026-07-13T00:00:00.000Z")
  assert.equal(artifacts.dashboard.rules[0].rule_id, "RULE-1")
  assert.equal(artifacts.dashboard.timing.estimated_minutes_saved, 7)
  assert.equal(JSON.parse(await fs.readFile(artifacts.jsonPath, "utf8")).campaign_id, campaignId)
  assert.match(await fs.readFile(artifacts.markdownPath, "utf8"), /Rule effectiveness/)
  assert.match(await fs.readFile(artifacts.csvPath, "utf8"), /RULE-1/)
})

test("reports malformed evidence as warnings without hiding valid records", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-dashboard-warning-"))
  const recordsRoot = path.join(workspaceRoot, ".bob-review-records", "campaigns", "campaign-1", "records")
  await fs.mkdir(path.join(recordsRoot, "broken"), { recursive: true })
  await fs.mkdir(path.join(recordsRoot, "valid"), { recursive: true })
  await fs.writeFile(path.join(recordsRoot, "broken", "record.yaml"), "not: [valid", "utf8")
  await fs.writeFile(path.join(recordsRoot, "valid", "record.yaml"), JSON.stringify({
    schema_version: "bazaar-review-record/v1",
    campaign_id: "campaign-1",
    record_id: "valid-run-001",
    review_id: "valid",
    quality_gate: { schema_valid: true },
    metrics: {}
  }), "utf8")

  const artifacts = await generateCampaignDashboardArtifacts(workspaceRoot, "campaign-1")
  assert.equal(artifacts.dashboard.records.total, 1)
  assert.ok(artifacts.dashboard.warnings.some((warning) => warning.includes("broken")))
})
