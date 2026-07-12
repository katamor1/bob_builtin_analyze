const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { dump } = require("js-yaml")

const {
  generateCampaignDashboard,
  listCampaignDashboardCampaigns
} = require("../out/dashboard/campaignDashboard")
const {
  advanceReviewRun,
  createReviewRunContext,
  setReviewRunPhaseProgress
} = require("../out/reviewRuns/reviewRunState")
const { writeReviewRun } = require("../out/reviewRuns/reviewRunStore")
const { writeReviewRecord, writeTriage } = require("../out/records/reviewRecordStore")

async function makeWorkspace() {
  return fs.mkdtemp(path.join(os.tmpdir(), "bbr-dashboard-"))
}

function resultArtifact(reviewId) {
  return {
    review_id: reviewId,
    vcs: { type: "bazaar", revision_mode: "singleRevision", revision: "1" },
    checklist_results: [
      {
        rule_id: "RULE-1",
        title: "Rule one",
        status: "fail",
        severity: "warning",
        confidence: "high",
        evidence: [{ summary: "evidence" }],
        reason: "needs review"
      }
    ],
    findings: [
      {
        id: "F-1",
        rule_id: "RULE-1",
        severity: "warning",
        title: "Finding one",
        description: "description"
      }
    ],
    summary: { pass: 0, fail: 1, unknown: 0, not_applicable: 0, blocked: 0 }
  }
}

function triageArtifact(reviewId) {
  return {
    schema_version: "bazaar-review-triage/v1",
    review_id: reviewId,
    items: [{ finding_id: "F-1", rule_id: "RULE-1", decision: "accepted", owner: "team" }],
    summary: { accepted: 1, rejected: 0, needs_investigation: 0, deferred: 0 }
  }
}

async function createRun(workspaceRoot, campaignId, reviewId, options = {}) {
  const recordRelative = `.bob-review-records/campaigns/${campaignId}/records/${reviewId}`
  const resultRelative = `.bob/review/results/${reviewId}`
  let run = createReviewRunContext({
    workspaceRoot,
    campaignId,
    reviewId,
    target: {
      mode: options.targetMode ?? "singleRevision",
      repositoryRoot: workspaceRoot,
      revision: "1",
      baseRevision: options.targetMode === "revisionRange" ? "1" : undefined,
      targetRevision: options.targetMode === "revisionRange" ? "2" : undefined
    },
    now: options.createdAt ?? "2026-07-12T00:00:00.000Z"
  })
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "packet",
    status: "completed",
    phase: "packet",
    artifacts: { reviewPacketPath: `${recordRelative}/review-packet.md` },
    now: "2026-07-12T00:01:00.000Z"
  })
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "result",
    status: "completed",
    phase: "result",
    artifacts: {
      reviewResultJsonPath: `${resultRelative}.json`,
      reviewResultMarkdownPath: `${resultRelative}.md`
    },
    now: options.updatedAt ?? "2026-07-12T00:02:00.000Z"
  })
  if (options.complete) {
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "triage",
      status: "completed",
      phase: "triage",
      artifacts: { triageYamlPath: `${recordRelative}/triage.yaml` },
      now: "2026-07-12T00:03:00.000Z"
    })
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "record",
      status: "completed",
      artifacts: { recordYamlPath: `${recordRelative}/record.yaml` },
      now: "2026-07-12T00:04:00.000Z"
    })
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "summary",
      status: "completed",
      artifacts: {
        summaryJsonPath: `.bob-review-records/campaigns/${campaignId}/summary.json`,
        summaryMarkdownPath: `.bob-review-records/campaigns/${campaignId}/summary.md`
      },
      now: options.updatedAt ?? "2026-07-12T00:05:00.000Z"
    })
    run = advanceReviewRun(run, { phase: "completed", now: options.updatedAt ?? "2026-07-12T00:05:00.000Z" })
  }
  await writeReviewRun(run)

  const recordDir = path.join(workspaceRoot, recordRelative)
  const resultDir = path.join(workspaceRoot, ".bob", "review", "results")
  await fs.mkdir(recordDir, { recursive: true })
  await fs.mkdir(resultDir, { recursive: true })
  await fs.writeFile(path.join(recordDir, "review-packet.md"), "# packet\n", "utf8")
  await fs.writeFile(path.join(resultDir, `${reviewId}.json`), JSON.stringify(resultArtifact(reviewId)), "utf8")
  await fs.writeFile(path.join(resultDir, `${reviewId}.md`), "# result\n", "utf8")

  return run
}

function recordArtifact(campaignId, reviewId, schemaValid = true) {
  return {
    schema_version: "bazaar-review-record/v1",
    campaign_id: campaignId,
    record_id: `${reviewId}-run-001`,
    review_id: reviewId,
    workflow: { status: "completed" },
    vcs: { revision_mode: "singleRevision" },
    inputs: {
      review_packet_path: `.bob-review-records/campaigns/${campaignId}/records/${reviewId}/review-packet.md`
    },
    outputs: {
      review_result_json: `.bob/review/results/${reviewId}.json`,
      review_result_markdown: `.bob/review/results/${reviewId}.md`,
      triage_yaml: `.bob-review-records/campaigns/${campaignId}/records/${reviewId}/triage.yaml`
    },
    quality_gate: { schema_valid: schemaValid },
    metrics: {
      baseline_review_minutes: 12,
      bob_review_minutes: 3,
      human_triage_minutes: 2
    }
  }
}

test("loads complete and pending Review Runs and reports malformed evidence", async () => {
  const workspaceRoot = await makeWorkspace()
  const campaignId = "campaign-1"
  await createRun(workspaceRoot, campaignId, "review-complete", {
    complete: true,
    updatedAt: "2026-07-12T02:00:00.000Z"
  })
  await writeReviewRecord(workspaceRoot, recordArtifact(campaignId, "review-complete", true))
  await writeTriage(workspaceRoot, campaignId, "review-complete", triageArtifact("review-complete"))

  await createRun(workspaceRoot, campaignId, "review-pending", {
    targetMode: "revisionRange",
    updatedAt: "2026-07-12T01:00:00.000Z"
  })
  const malformedRecordPath = path.join(
    workspaceRoot,
    ".bob-review-records",
    "campaigns",
    campaignId,
    "records",
    "review-pending",
    "record.yaml"
  )
  await fs.writeFile(malformedRecordPath, "record: [not valid", "utf8")

  const linkedPath = path.join(
    workspaceRoot,
    ".bob-review-records",
    "campaigns",
    campaignId,
    "records",
    "linked-review"
  )
  try {
    await fs.symlink(path.dirname(malformedRecordPath), linkedPath, "dir")
  } catch (error) {
    if (!["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) throw error
  }

  const dashboard = await generateCampaignDashboard(
    workspaceRoot,
    campaignId,
    "2026-07-12T03:00:00.000Z"
  )

  assert.equal(dashboard.overview.review_runs_total, 2)
  assert.equal(dashboard.overview.completed_runs, 1)
  assert.equal(dashboard.overview.triage_pending, 1)
  assert.deepEqual(dashboard.runs.map((run) => run.review_id), ["review-complete", "review-pending"])
  assert.deepEqual(dashboard.triage_pending.map((run) => run.review_id), ["review-pending"])
  assert.equal(dashboard.overview.findings_accepted, 1)
  assert.equal(dashboard.rule_trends[0].title, "Rule one")
  assert.match(dashboard.warnings.map((warning) => warning.message).join("\n"), /record.yaml.*review-pending/i)
  assert.equal(dashboard.runs.some((run) => run.review_id === "linked-review"), false)
  assert.deepEqual(await listCampaignDashboardCampaigns(workspaceRoot), [campaignId])
})

test("excludes identity-mismatched evidence from finding decisions", async () => {
  const workspaceRoot = await makeWorkspace()
  const campaignId = "campaign-1"
  const reviewId = "review-mismatch"
  await createRun(workspaceRoot, campaignId, reviewId, { complete: true })
  await writeReviewRecord(workspaceRoot, recordArtifact(campaignId, reviewId, true))

  const resultPath = path.join(workspaceRoot, ".bob", "review", "results", `${reviewId}.json`)
  await fs.writeFile(resultPath, JSON.stringify(resultArtifact("other-review")), "utf8")
  const triagePath = path.join(
    workspaceRoot,
    ".bob-review-records",
    "campaigns",
    campaignId,
    "records",
    reviewId,
    "triage.yaml"
  )
  await fs.writeFile(triagePath, dump(triageArtifact(reviewId)), "utf8")

  const dashboard = await generateCampaignDashboard(workspaceRoot, campaignId)
  assert.equal(dashboard.overview.findings_total, 0)
  assert.equal(dashboard.overview.triage_pending, 1)
  assert.match(dashboard.warnings.map((warning) => warning.message).join("\n"), /review_id.*other-review.*review-mismatch/i)
})

test("returns an empty warning-backed dashboard for a missing campaign", async () => {
  const workspaceRoot = await makeWorkspace()
  const dashboard = await generateCampaignDashboard(
    workspaceRoot,
    "campaign-missing",
    "2026-07-12T03:00:00.000Z"
  )
  assert.equal(dashboard.overview.review_runs_total, 0)
  assert.equal(dashboard.overview.schema_validation_rate, null)
  assert.match(dashboard.warnings[0].message, /campaign.*not found/i)
  assert.deepEqual(await listCampaignDashboardCampaigns(workspaceRoot), [])
})

test("does not count triage decisions when review-result coverage is unavailable", async () => {
  const workspaceRoot = await makeWorkspace()
  const campaignId = "campaign-1"
  const reviewId = "review-without-result"
  const recordRelative = `.bob-review-records/campaigns/${campaignId}/records/${reviewId}`
  let run = createReviewRunContext({
    workspaceRoot,
    campaignId,
    reviewId,
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" },
    now: "2026-07-12T00:00:00.000Z"
  })
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "packet",
    status: "completed",
    phase: "packet",
    artifacts: { reviewPacketPath: `${recordRelative}/review-packet.md` },
    now: "2026-07-12T00:01:00.000Z"
  })
  await writeReviewRun(run)
  await fs.mkdir(path.join(workspaceRoot, recordRelative), { recursive: true })
  await fs.writeFile(path.join(workspaceRoot, recordRelative, "review-packet.md"), "# packet\n", "utf8")
  await writeTriage(workspaceRoot, campaignId, reviewId, triageArtifact(reviewId))

  const dashboard = await generateCampaignDashboard(workspaceRoot, campaignId)
  assert.equal(dashboard.overview.findings_total, 0)
  assert.equal(dashboard.overview.triage_pending, 1)
  assert.match(dashboard.warnings.map((warning) => warning.message).join("\n"), /coverage.*review-result.*unavailable/i)
})
