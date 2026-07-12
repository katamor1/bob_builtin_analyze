const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  listLegacyReviewCandidates,
  previewLegacyReviewRecovery,
  recoverLegacyReviewRun
} = require("../out/reviewRuns/reviewRunRecovery")
const { readReviewRun, writeReviewRun } = require("../out/reviewRuns/reviewRunStore")
const { createReviewRunContext } = require("../out/reviewRuns/reviewRunState")
const { writeTriage } = require("../out/records/reviewRecordStore")

function reviewResult(reviewId) {
  return {
    review_id: reviewId,
    vcs: { type: "bazaar", repository: "legacy-repo", revision_mode: "singleRevision", revision: "9" },
    checklist_results: [],
    findings: [],
    summary: { pass: 0, fail: 0, unknown: 0, not_applicable: 0, blocked: 0 }
  }
}

async function writeResult(workspaceRoot, fileStem, reviewId = fileStem) {
  const directory = path.join(workspaceRoot, ".bob", "review", "results")
  await fs.mkdir(directory, { recursive: true })
  const jsonPath = path.join(directory, `${fileStem}.json`)
  const markdownPath = path.join(directory, `${fileStem}.md`)
  const jsonText = JSON.stringify(reviewResult(reviewId), null, 2) + "\n"
  await fs.writeFile(jsonPath, jsonText, "utf8")
  await fs.writeFile(markdownPath, `# ${reviewId}\n`, "utf8")
  return { jsonPath, markdownPath, jsonText }
}

async function recordDirectory(workspaceRoot, campaignId, reviewId) {
  const directory = path.join(workspaceRoot, ".bob-review-records", "campaigns", campaignId, "records", reviewId)
  await fs.mkdir(directory, { recursive: true })
  return directory
}

test("recovers result-only legacy artifacts without changing existing bytes", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-recovery-result-"))
  const written = await writeResult(workspaceRoot, "review-1")
  const [candidate] = await listLegacyReviewCandidates(workspaceRoot)
  const preview = await previewLegacyReviewRecovery(workspaceRoot, candidate, "campaign-1")

  assert.equal(preview.reviewId, "review-1")
  assert.equal(preview.phase, "result")
  assert.equal(preview.blockingIssues.length, 0)
  assert.equal(preview.artifacts.reviewPacketPath, undefined)

  const run = await recoverLegacyReviewRun(preview)
  assert.equal(run.phases.result.status, "completed")
  assert.equal(run.phases.packet.status, "blocked")
  assert.equal(await fs.readFile(written.jsonPath, "utf8"), written.jsonText)
  assert.equal((await readReviewRun(workspaceRoot, "campaign-1", "review-1")).reviewId, "review-1")
})

test("recovers packet and valid triage as completed phases", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-recovery-triage-"))
  await writeResult(workspaceRoot, "review-1")
  const directory = await recordDirectory(workspaceRoot, "campaign-1", "review-1")
  await fs.writeFile(path.join(directory, "review-packet.md"), "# packet\n", "utf8")
  await writeTriage(workspaceRoot, "campaign-1", "review-1", {
    schema_version: "bazaar-review-triage/v1",
    review_id: "review-1",
    items: [],
    summary: { accepted: 0, rejected: 0, needs_investigation: 0, deferred: 0 }
  })

  const [candidate] = await listLegacyReviewCandidates(workspaceRoot)
  const preview = await previewLegacyReviewRecovery(workspaceRoot, candidate, "campaign-1")
  const run = await recoverLegacyReviewRun(preview)
  assert.equal(run.phases.packet.status, "completed")
  assert.equal(run.phases.result.status, "completed")
  assert.equal(run.phases.triage.status, "completed")
})

test("recovers an existing record and leaves summary pending", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-recovery-record-"))
  await writeResult(workspaceRoot, "review-1")
  const directory = await recordDirectory(workspaceRoot, "campaign-1", "review-1")
  await fs.writeFile(path.join(directory, "review-packet.md"), "# packet\n", "utf8")
  await fs.writeFile(path.join(directory, "triage.yaml"), "schema_version: bazaar-review-triage/v1\nreview_id: review-1\nitems: []\nsummary:\n  accepted: 0\n  rejected: 0\n  needs_investigation: 0\n  deferred: 0\n", "utf8")
  await fs.writeFile(path.join(directory, "record.yaml"), "schema_version: bazaar-review-record/v1\nreview_id: review-1\n", "utf8")

  const [candidate] = await listLegacyReviewCandidates(workspaceRoot)
  const preview = await previewLegacyReviewRecovery(workspaceRoot, candidate, "campaign-1")
  const run = await recoverLegacyReviewRun(preview)
  assert.equal(run.phases.record.status, "completed")
  assert.equal(run.phases.summary.status, "not_started")
})

test("blocks recovery when artifact identity differs from the file name", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-recovery-mismatch-"))
  await writeResult(workspaceRoot, "review-file", "other-review")
  const [candidate] = await listLegacyReviewCandidates(workspaceRoot)
  const preview = await previewLegacyReviewRecovery(workspaceRoot, candidate, "campaign-1")
  assert.match(preview.blockingIssues.join("\n"), /file name review-file does not match review_id other-review/)
  await assert.rejects(() => recoverLegacyReviewRun(preview), /cannot be recovered/)
})

test("requires an explicit campaign when multiple record directories match", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-recovery-campaign-"))
  await writeResult(workspaceRoot, "review-1")
  await recordDirectory(workspaceRoot, "campaign-a", "review-1")
  await recordDirectory(workspaceRoot, "campaign-b", "review-1")
  const [candidate] = await listLegacyReviewCandidates(workspaceRoot)
  const preview = await previewLegacyReviewRecovery(workspaceRoot, candidate)
  assert.equal(preview.requiresCampaignSelection, true)
  assert.match(preview.blockingIssues.join("\n"), /multiple campaign candidates/)
})

test("does not overwrite an existing review-run.json", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-recovery-existing-"))
  await writeResult(workspaceRoot, "review-1")
  const directory = await recordDirectory(workspaceRoot, "campaign-1", "review-1")
  const existing = createReviewRunContext({
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" }
  })
  await writeReviewRun(existing)

  const [candidate] = await listLegacyReviewCandidates(workspaceRoot)
  const preview = await previewLegacyReviewRecovery(workspaceRoot, candidate, "campaign-1")
  assert.match(preview.blockingIssues.join("\n"), /review-run.json already exists/)
  await assert.rejects(() => recoverLegacyReviewRun(preview), /cannot be recovered/)
  assert.equal((await fs.readFile(path.join(directory, "review-run.json"), "utf8")).includes("review-1"), true)
})
