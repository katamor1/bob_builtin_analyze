const assert = require("node:assert/strict")
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

function validReviewResult(reviewId) {
  return {
    review_id: reviewId,
    vcs: {
      type: "bazaar",
      repository: "test-repo",
      revision_mode: "singleRevision",
      revision: "2"
    },
    checklist_results: [
      {
        rule_id: "RULE-001",
        title: "Rule one",
        status: "fail",
        severity: "warning",
        confidence: "high",
        evidence: [{ file: "src/main.c", summary: "Observed changed behavior." }],
        reason: "Human review is required."
      }
    ],
    findings: [
      {
        id: "F-1",
        rule_id: "RULE-001",
        severity: "warning",
        title: "Review finding",
        description: "Needs a human decision."
      }
    ],
    summary: { pass: 0, fail: 1, unknown: 0, not_applicable: 0, blocked: 0 }
  }
}

async function prepareTriageCompletedRun(prefix = "bbr-finalize-") {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  const campaignId = "campaign-1"
  const reviewId = "review-1"
  let run = await startReviewRun({
    workspaceRoot,
    campaignId,
    reviewId,
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "2" },
    now: "2026-07-12T00:00:00.000Z"
  })
  run = await recordReviewPacket(run, "# packet\n", "2026-07-12T00:01:00.000Z")

  const resultDirectory = path.join(workspaceRoot, ".bob", "review", "results")
  await fs.mkdir(resultDirectory, { recursive: true })
  const jsonPath = path.join(resultDirectory, `${reviewId}.json`)
  const markdownPath = path.join(resultDirectory, `${reviewId}.md`)
  await fs.writeFile(jsonPath, JSON.stringify(validReviewResult(reviewId), null, 2), "utf8")
  await fs.writeFile(markdownPath, "# result\n", "utf8")
  run = await recordReviewResult(run, {
    status: "ok",
    valid: true,
    reviewId,
    jsonPath,
    markdownPath
  }, "2026-07-12T00:03:00.000Z")

  const triage = {
    schema_version: "bazaar-review-triage/v1",
    review_id: reviewId,
    triaged_by: "reviewer",
    triaged_at: "2026-07-12T00:05:00.000Z",
    items: [
      {
        finding_id: "F-1",
        rule_id: "RULE-001",
        decision: "accepted",
        owner: "team-a",
        action: "fix"
      }
    ],
    summary: { accepted: 1, rejected: 0, needs_investigation: 0, deferred: 0 }
  }
  const triagePath = await writeTriage(workspaceRoot, campaignId, reviewId, triage)
  run = await recordTriageCompleted(run, triagePath, "2026-07-12T00:05:00.000Z")

  return { workspaceRoot, campaignId, reviewId, run, triagePath }
}

test("finalizes a valid Review Run into record and campaign summary with measured metrics", async () => {
  const { workspaceRoot, campaignId, reviewId, run: triageCompletedRun } = await prepareTriageCompletedRun()
  const run = await correctActiveReviewRunMetrics(
    triageCompletedRun,
    { baselineReviewMinutes: 15 },
    "2026-07-12T00:05:30.000Z"
  )

  const result = await finalizeReviewRun(run, "2026-07-12T00:06:00.000Z")
  assert.equal(result.context.status, "completed")
  assert.equal(result.context.phase, "completed")
  assert.equal(result.context.phases.record.status, "completed")
  assert.equal(result.context.phases.summary.status, "completed")
  assert.match(result.context.artifacts.recordYamlPath, /record\.yaml$/)
  assert.match(result.context.artifacts.summaryJsonPath, /summary\.json$/)
  assert.match(result.context.artifacts.summaryMarkdownPath, /summary\.md$/)

  const record = await readReviewRecord(workspaceRoot, campaignId, reviewId)
  assert.equal(record.metrics.baseline_review_minutes, 15)
  assert.equal(record.metrics.bob_review_minutes, 2)
  assert.equal(record.metrics.human_triage_minutes, 2)
  assert.equal(record.metrics.findings_accepted, 1)

  const summary = JSON.parse(await fs.readFile(path.join(workspaceRoot, result.context.artifacts.summaryJsonPath), "utf8"))
  assert.equal(summary.records_total, 1)
  assert.equal(summary.estimated_minutes_saved, 11)
  assert.equal((await readReviewRun(workspaceRoot, campaignId, reviewId)).status, "completed")
})

test("does not double-count Human Triage time when a completed decision set is saved again", async () => {
  const { run, triagePath } = await prepareTriageCompletedRun("bbr-finalize-idempotent-")
  const repeated = await recordTriageCompleted(run, triagePath, "2026-07-12T00:06:00.000Z")

  assert.equal(repeated.metrics.humanTriageSeconds, run.metrics.humanTriageSeconds)
  assert.equal(repeated.phases.triage.completedAt, run.phases.triage.completedAt)
  assert.equal(repeated.phases.record.status, "in_progress")
})

test("retries summary finalization from the persisted record phase with a stale caller context", async () => {
  const { workspaceRoot, campaignId, reviewId, run } = await prepareTriageCompletedRun("bbr-finalize-retry-")
  const summaryJsonPath = path.join(workspaceRoot, ".bob-review-records", "campaigns", campaignId, "summary.json")
  await fs.mkdir(summaryJsonPath, { recursive: true })

  await assert.rejects(
    () => finalizeReviewRun(run, "2026-07-12T00:06:00.000Z"),
    /EISDIR|directory|illegal operation/i
  )

  const failed = await readReviewRun(workspaceRoot, campaignId, reviewId)
  assert.equal(failed.phases.record.status, "completed")
  assert.equal(failed.phases.summary.status, "failed")
  assert.match(failed.artifacts.recordYamlPath, /record\.yaml$/)
  const recordPath = path.join(workspaceRoot, failed.artifacts.recordYamlPath)
  const recordBeforeRetry = await fs.readFile(recordPath, "utf8")

  await fs.rm(summaryJsonPath, { recursive: true, force: true })
  const retried = await finalizeReviewRun(run, "2026-07-12T00:07:00.000Z")

  assert.equal(retried.context.status, "completed")
  assert.equal(retried.context.phases.record.status, "completed")
  assert.equal(retried.context.phases.summary.status, "completed")
  assert.equal(await fs.readFile(recordPath, "utf8"), recordBeforeRetry)
})

test("does not finalize while triage remains incomplete", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-finalize-incomplete-"))
  const run = await startReviewRun({
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" }
  })
  await assert.rejects(() => finalizeReviewRun(run), /triage phase must be completed/)
})
