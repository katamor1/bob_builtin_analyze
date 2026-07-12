const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  correctActiveReviewRunMetrics,
  finalizeReviewRun,
  recordReviewPacket,
  recordReviewResult,
  recordTriageCompleted,
  startReviewRun
} = require("../out/reviewRuns/reviewRunCoordinator")
const { readReviewRun } = require("../out/reviewRuns/reviewRunStore")
const { readReviewRecord, writeTriage } = require("../out/records/reviewRecordStore")
const { generateCampaignDashboard } = require("../out/dashboard/campaignDashboard")
const { writeCampaignDashboardArtifacts } = require("../out/dashboard/campaignDashboardExport")

function validReviewResult(reviewId) {
  return {
    review_id: reviewId,
    vcs: {
      type: "bazaar",
      repository: "acceptance-repository",
      revision_mode: "singleRevision",
      revision: "42"
    },
    checklist_results: [
      {
        rule_id: "RULE-ACCEPTANCE-001",
        title: "Acceptance rule",
        status: "fail",
        severity: "warning",
        confidence: "high",
        evidence: [{ file: "src/main.c", start_line: 10, end_line: 12, summary: "Observed acceptance fixture." }],
        reason: "A human decision is required."
      }
    ],
    findings: [
      {
        id: "F-ACCEPTANCE-001",
        rule_id: "RULE-ACCEPTANCE-001",
        severity: "warning",
        file: "src/main.c",
        start_line: 10,
        end_line: 12,
        title: "Acceptance finding",
        description: "The finding exercises Review Run v3 end to end."
      }
    ],
    summary: { pass: 0, fail: 1, unknown: 0, not_applicable: 0, blocked: 0 }
  }
}

async function sha256(filePath) {
  return crypto.createHash("sha256").update(await fs.readFile(filePath)).digest("hex")
}

async function hashFiles(filePaths) {
  return Object.fromEntries(await Promise.all(filePaths.map(async (filePath) => [filePath, await sha256(filePath)])))
}

function absoluteArtifact(workspaceRoot, relativePath) {
  assert.equal(typeof relativePath, "string")
  return path.join(workspaceRoot, relativePath)
}

test("completes Review Run v3 through dashboard export without mutating review evidence", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-v3-acceptance-"))
  const campaignId = "campaign-acceptance"
  const reviewId = "review-acceptance"

  let run = await startReviewRun({
    workspaceRoot,
    campaignId,
    reviewId,
    target: {
      mode: "singleRevision",
      repositoryRoot: workspaceRoot,
      revision: "42"
    },
    now: "2026-07-13T00:00:00.000Z"
  })

  run = await recordReviewPacket(
    run,
    "# Bazaar Revision Review Request\n\nAcceptance packet.\n",
    "2026-07-13T00:01:00.000Z"
  )

  const resultDirectory = path.join(workspaceRoot, ".bob", "review", "results")
  await fs.mkdir(resultDirectory, { recursive: true })
  const reviewResultJsonPath = path.join(resultDirectory, `${reviewId}.json`)
  const reviewResultMarkdownPath = path.join(resultDirectory, `${reviewId}.md`)
  await fs.writeFile(reviewResultJsonPath, `${JSON.stringify(validReviewResult(reviewId), null, 2)}\n`, "utf8")
  await fs.writeFile(reviewResultMarkdownPath, "# Review Result\n\nAcceptance result.\n", "utf8")

  run = await recordReviewResult(run, {
    status: "ok",
    valid: true,
    reviewId,
    jsonPath: reviewResultJsonPath,
    markdownPath: reviewResultMarkdownPath
  }, "2026-07-13T00:04:00.000Z")

  const triage = {
    schema_version: "bazaar-review-triage/v1",
    review_id: reviewId,
    triaged_by: "acceptance-reviewer",
    triaged_at: "2026-07-13T00:06:00.000Z",
    items: [
      {
        finding_id: "F-ACCEPTANCE-001",
        rule_id: "RULE-ACCEPTANCE-001",
        decision: "accepted",
        owner: "team-acceptance",
        action: "apply the verified fix"
      }
    ],
    summary: { accepted: 1, rejected: 0, needs_investigation: 0, deferred: 0 }
  }
  const triagePath = await writeTriage(workspaceRoot, campaignId, reviewId, triage)
  run = await recordTriageCompleted(run, triagePath, "2026-07-13T00:06:00.000Z")
  run = await correctActiveReviewRunMetrics(
    run,
    { baselineReviewMinutes: 20 },
    "2026-07-13T00:06:30.000Z"
  )

  const finalized = await finalizeReviewRun(run, "2026-07-13T00:07:00.000Z")
  assert.equal(finalized.context.status, "completed")
  assert.equal(finalized.context.phase, "completed")
  for (const [phase, progress] of Object.entries(finalized.context.phases)) {
    assert.equal(progress.status, "completed", `${phase} phase must be completed`)
  }

  const persistedRun = await readReviewRun(workspaceRoot, campaignId, reviewId)
  const record = await readReviewRecord(workspaceRoot, campaignId, reviewId)
  assert.equal(persistedRun.status, "completed")
  assert.equal(record.metrics.baseline_review_minutes, 20)
  assert.equal(record.metrics.bob_review_minutes, 3)
  assert.equal(record.metrics.human_triage_minutes, 2)
  assert.equal(record.metrics.findings_accepted, 1)

  const reviewRunPath = path.join(
    workspaceRoot,
    ".bob-review-records",
    "campaigns",
    campaignId,
    "records",
    reviewId,
    "review-run.json"
  )
  const evidencePaths = [
    reviewRunPath,
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.reviewPacketPath),
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.reviewResultJsonPath),
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.reviewResultMarkdownPath),
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.triageYamlPath),
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.recordYamlPath),
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.summaryJsonPath),
    absoluteArtifact(workspaceRoot, persistedRun.artifacts.summaryMarkdownPath)
  ]
  const evidenceHashesBeforeDashboard = await hashFiles(evidencePaths)

  const dashboard = await generateCampaignDashboard(
    workspaceRoot,
    campaignId,
    "2026-07-13T00:08:00.000Z"
  )
  assert.equal(dashboard.campaign_id, campaignId)
  assert.equal(dashboard.overview.review_runs_total, 1)
  assert.equal(dashboard.overview.completed_runs, 1)
  assert.equal(dashboard.overview.triage_pending, 0)
  assert.equal(dashboard.overview.schema_valid_records, 1)
  assert.equal(dashboard.overview.findings_total, 1)
  assert.equal(dashboard.overview.findings_accepted, 1)
  assert.equal(dashboard.overview.estimated_minutes_saved, 15)
  assert.equal(dashboard.runs[0].review_id, reviewId)
  assert.equal(dashboard.runs[0].metrics_source, "record")
  assert.equal(dashboard.rule_trends[0].rule_id, "RULE-ACCEPTANCE-001")
  assert.equal(dashboard.rule_trends[0].accepted, 1)
  assert.equal(
    dashboard.change_type_trends.find((entry) => entry.change_type === "singleRevision").review_runs,
    1
  )
  assert.deepEqual(dashboard.warnings, [])

  const dashboardPaths = await writeCampaignDashboardArtifacts(workspaceRoot, campaignId, dashboard)
  assert.equal(JSON.parse(await fs.readFile(dashboardPaths.jsonPath, "utf8")).campaign_id, campaignId)
  assert.match(await fs.readFile(dashboardPaths.markdownPath, "utf8"), /RULE-ACCEPTANCE-001/)
  assert.match(await fs.readFile(dashboardPaths.csvPath, "utf8"), /review-acceptance/)

  const evidenceHashesAfterDashboard = await hashFiles(evidencePaths)
  assert.deepEqual(
    evidenceHashesAfterDashboard,
    evidenceHashesBeforeDashboard,
    "Dashboard refresh/export must not mutate Review Run evidence"
  )
})
