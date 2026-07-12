const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { reviewRunJsonPath } = require("../out/reviewRuns/reviewRunPaths")
const { createReviewRunContext } = require("../out/reviewRuns/reviewRunState")
const { readReviewRun, writeReviewRun } = require("../out/reviewRuns/reviewRunStore")

async function makeRun() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-"))
  const run = createReviewRunContext({
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" },
    now: "2026-07-12T00:00:00.000Z"
  })
  return { workspaceRoot, run }
}

test("writes and reads a review run atomically", async () => {
  const { workspaceRoot, run } = await makeRun()
  const filePath = await writeReviewRun(run)
  assert.equal(filePath, reviewRunJsonPath(workspaceRoot, "campaign-1", "review-1"))
  assert.deepEqual(await readReviewRun(workspaceRoot, "campaign-1", "review-1"), run)
  const files = await fs.readdir(path.dirname(filePath))
  assert.deepEqual(files, ["review-run.json"])
})

test("rejects malformed review run JSON", async () => {
  const { workspaceRoot, run } = await makeRun()
  const filePath = reviewRunJsonPath(workspaceRoot, run.campaignId, run.reviewId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, "{not-json", "utf8")
  await assert.rejects(() => readReviewRun(workspaceRoot, run.campaignId, run.reviewId), /parse/)
})

test("rejects an unsupported review run schema version", async () => {
  const { workspaceRoot, run } = await makeRun()
  const filePath = reviewRunJsonPath(workspaceRoot, run.campaignId, run.reviewId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify({ ...run, schemaVersion: "bazaar-review-run/v999" }), "utf8")
  await assert.rejects(() => readReviewRun(workspaceRoot, run.campaignId, run.reviewId), /schemaVersion/)
})

test("rejects review run identity mismatches", async () => {
  const { workspaceRoot, run } = await makeRun()
  const filePath = reviewRunJsonPath(workspaceRoot, run.campaignId, run.reviewId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify({ ...run, reviewId: "other-review" }), "utf8")
  await assert.rejects(() => readReviewRun(workspaceRoot, run.campaignId, run.reviewId), /does not match/)
})

test("removes its temporary file when replacement fails", async () => {
  const { workspaceRoot, run } = await makeRun()
  const filePath = reviewRunJsonPath(workspaceRoot, run.campaignId, run.reviewId)
  await fs.mkdir(filePath, { recursive: true })
  await assert.rejects(() => writeReviewRun(run))
  const files = await fs.readdir(path.dirname(filePath))
  assert.deepEqual(files, ["review-run.json"])
})
