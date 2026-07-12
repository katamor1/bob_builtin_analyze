const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  renderCampaignDashboardCsv,
  renderCampaignDashboardMarkdown,
  writeCampaignDashboardArtifacts
} = require("../out/dashboard/campaignDashboardExport")

function dashboardFixture() {
  const run = {
    review_id: "review-1",
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
      target: "completed",
      packet: "completed",
      result: "completed",
      triage: "completed",
      record: "completed",
      summary: "completed"
    },
    artifacts: { recordYamlPath: ".bob-review-records/campaigns/campaign-1/records/review-1/record.yaml" }
  }
  return {
    schema_version: "bazaar-campaign-dashboard/v1",
    campaign_id: "campaign-1",
    generated_at: "2026-07-12T03:00:00.000Z",
    overview: {
      review_runs_total: 1,
      completed_runs: 1,
      in_progress_runs: 0,
      failed_or_blocked_runs: 0,
      records_total: 1,
      triage_pending: 0,
      schema_valid_records: 1,
      schema_invalid_records: 0,
      schema_validation_rate: 1,
      findings_total: 2,
      findings_accepted: 1,
      findings_rejected: 1,
      findings_needs_investigation: 0,
      findings_deferred: 0,
      finding_acceptance_rate: 0.5,
      finding_rejection_rate: 0.5,
      finding_resolution_rate: 1,
      baseline_review_minutes_total: 10,
      bob_review_minutes_total: 2,
      human_triage_minutes_total: 1,
      estimated_minutes_saved: 7
    },
    runs: [run],
    triage_pending: [],
    rule_trends: [
      {
        rule_id: "RULE-1",
        title: "Rule, \"quoted\"",
        detected_count: 2,
        accepted: 1,
        rejected: 1,
        needs_investigation: 0,
        deferred: 0,
        acceptance_rate: 0.5,
        rejection_rate: 0.5
      }
    ],
    change_type_trends: [
      {
        change_type: "singleRevision",
        review_runs: 1,
        completed_runs: 1,
        triage_pending: 0,
        schema_valid_records: 1,
        findings_total: 2,
        accepted: 1,
        rejected: 1,
        needs_investigation: 0,
        deferred: 0,
        acceptance_rate: 0.5,
        rejection_rate: 0.5,
        baseline_review_minutes: 10,
        bob_review_minutes: 2,
        human_triage_minutes: 1,
        estimated_minutes_saved: 7
      },
      {
        change_type: "revisionRange",
        review_runs: 0,
        completed_runs: 0,
        triage_pending: 0,
        schema_valid_records: 0,
        findings_total: 0,
        accepted: 0,
        rejected: 0,
        needs_investigation: 0,
        deferred: 0,
        acceptance_rate: null,
        rejection_rate: null,
        baseline_review_minutes: 0,
        bob_review_minutes: 0,
        human_triage_minutes: 0,
        estimated_minutes_saved: 0
      },
      {
        change_type: "workingTreeSinceRevision",
        review_runs: 0,
        completed_runs: 0,
        triage_pending: 0,
        schema_valid_records: 0,
        findings_total: 0,
        accepted: 0,
        rejected: 0,
        needs_investigation: 0,
        deferred: 0,
        acceptance_rate: null,
        rejection_rate: null,
        baseline_review_minutes: 0,
        bob_review_minutes: 0,
        human_triage_minutes: 0,
        estimated_minutes_saved: 0
      }
    ],
    warnings: [
      {
        code: "fixture_warning",
        review_id: "review-1",
        message: "warning, with \"quotes\"\nand newline"
      }
    ]
  }
}

test("renders answer-first Markdown and RFC 4180 CSV from the same dashboard", () => {
  const dashboard = dashboardFixture()
  const markdown = renderCampaignDashboardMarkdown(dashboard)
  const csv = renderCampaignDashboardCsv(dashboard)

  assert.match(markdown, /# IBM Bob Bazaar Campaign Dashboard/)
  assert.match(markdown, /campaign-1/)
  assert.match(markdown, /schema validation rate \| 100\.0%/i)
  assert.match(markdown, /RULE-1/)
  assert.match(markdown, /singleRevision/)
  assert.match(markdown, /warning, with "quotes"/)

  assert.equal(
    csv.split(/\r?\n/)[0],
    "section,campaign_id,review_id,rule_id,change_type,status,next_action,updated_at,metric,value,accepted,rejected,needs_investigation,deferred,baseline_review_minutes,bob_review_minutes,human_triage_minutes,estimated_minutes_saved,message"
  )
  assert.match(csv, /rule_trend,campaign-1,,RULE-1/)
  assert.match(csv, /change_type_trend,campaign-1,,,singleRevision/)
  assert.match(csv, /"warning, with ""quotes""\nand newline"/)
})

test("writes JSON Markdown and CSV artifacts under the campaign directory", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-dashboard-export-"))
  const dashboard = dashboardFixture()
  const result = await writeCampaignDashboardArtifacts(workspaceRoot, "campaign-1", dashboard)

  assert.equal(path.basename(result.jsonPath), "dashboard.json")
  assert.equal(path.basename(result.markdownPath), "dashboard.md")
  assert.equal(path.basename(result.csvPath), "dashboard.csv")
  assert.equal(JSON.parse(await fs.readFile(result.jsonPath, "utf8")).campaign_id, "campaign-1")
  assert.match(await fs.readFile(result.markdownPath, "utf8"), /RULE-1/)
  assert.match(await fs.readFile(result.csvPath, "utf8"), /fixture_warning/)

  const files = await fs.readdir(path.dirname(result.jsonPath))
  assert.deepEqual(files.sort(), ["dashboard.csv", "dashboard.json", "dashboard.md"])
})

test("renders before writing so serialization failure preserves existing exports", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-dashboard-export-preserve-"))
  const campaignDir = path.join(workspaceRoot, ".bob-review-records", "campaigns", "campaign-1")
  await fs.mkdir(campaignDir, { recursive: true })
  for (const fileName of ["dashboard.json", "dashboard.md", "dashboard.csv"]) {
    await fs.writeFile(path.join(campaignDir, fileName), `old-${fileName}`, "utf8")
  }

  const invalid = { ...dashboardFixture(), unsupported: 1n }
  await assert.rejects(
    () => writeCampaignDashboardArtifacts(workspaceRoot, "campaign-1", invalid),
    /BigInt|serialize/i
  )
  for (const fileName of ["dashboard.json", "dashboard.md", "dashboard.csv"]) {
    assert.equal(await fs.readFile(path.join(campaignDir, fileName), "utf8"), `old-${fileName}`)
  }
})

test("escapes active HTML and Markdown table delimiters in Markdown export", () => {
  const dashboard = {
    ...dashboardFixture(),
    warnings: [{ code: "unsafe", message: "<script>alert(1)</script>|pipe" }]
  }
  const markdown = renderCampaignDashboardMarkdown(dashboard)
  assert.doesNotMatch(markdown, /<script>alert\(1\)<\/script>/)
  assert.match(markdown, /&lt;script&gt;alert\(1\)&lt;\/script&gt;\\\|pipe/)
})

test("keeps a transaction backup when rollback cannot restore an old export", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-dashboard-export-rollback-"))
  const campaignDir = path.join(workspaceRoot, ".bob-review-records", "campaigns", "campaign-1")
  await fs.mkdir(campaignDir, { recursive: true })
  for (const fileName of ["dashboard.json", "dashboard.md", "dashboard.csv"]) {
    await fs.writeFile(path.join(campaignDir, fileName), `old-${fileName}`, "utf8")
  }

  const originalRename = fs.rename
  let installFailed = false
  fs.rename = async (source, destination) => {
    if (String(source).includes(".dashboard.") && String(source).endsWith(".md.tmp") && String(destination).endsWith("dashboard.md")) {
      installFailed = true
      throw new Error("forced dashboard install failure")
    }
    if (installFailed && String(source).includes("dashboard.md.replace.") && String(source).endsWith(".bak")) {
      throw new Error("forced dashboard restore failure")
    }
    return originalRename(source, destination)
  }

  try {
    await assert.rejects(
      () => writeCampaignDashboardArtifacts(workspaceRoot, "campaign-1", dashboardFixture()),
      /forced dashboard install failure|rollback/i
    )
  } finally {
    fs.rename = originalRename
  }

  assert.equal(await fs.readFile(path.join(campaignDir, "dashboard.json"), "utf8"), "old-dashboard.json")
  const backupName = (await fs.readdir(campaignDir)).find((name) => name.startsWith("dashboard.md.replace.") && name.endsWith(".bak"))
  assert.ok(backupName, "failed rollback must retain the old Markdown export as a backup")
  assert.equal(await fs.readFile(path.join(campaignDir, backupName), "utf8"), "old-dashboard.md")
})
