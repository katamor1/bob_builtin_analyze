const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { reviewRunJsonPath } = require("../out/reviewRuns/reviewRunPaths")
const { advanceReviewRun, createReviewRunContext } = require("../out/reviewRuns/reviewRunState")
const { listReviewRuns, readReviewRun, writeReviewRun } = require("../out/reviewRuns/reviewRunStore")

async function makeRun(overrides = {}) {
  const workspaceRoot = overrides.workspaceRoot ?? await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-"))
  const run = createReviewRunContext({
    workspaceRoot,
    campaignId: overrides.campaignId ?? "campaign-1",
    reviewId: overrides.reviewId ?? "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" },
    now: overrides.now ?? "2026-07-12T00:00:00.000Z"
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

test("rejects a stale Review Run update and preserves the newer state", async () => {
  const { workspaceRoot, run } = await makeRun()
  await writeReviewRun(run)
  const firstReader = await readReviewRun(workspaceRoot, run.campaignId, run.reviewId)
  const staleReader = await readReviewRun(workspaceRoot, run.campaignId, run.reviewId)

  const newer = advanceReviewRun(firstReader, {
    phase: "packet",
    artifacts: { reviewPacketPath: "packet.md" },
    now: "2026-07-12T00:01:00.000Z"
  })
  await writeReviewRun(newer, { expectedUpdatedAt: firstReader.updatedAt })

  const staleUpdate = advanceReviewRun(staleReader, {
    phase: "packet",
    artifacts: { reviewPacketPath: "stale-packet.md" },
    now: "2026-07-12T00:02:00.000Z"
  })
  await assert.rejects(
    () => writeReviewRun(staleUpdate, { expectedUpdatedAt: staleReader.updatedAt }),
    /changed since it was loaded/
  )
  assert.equal((await readReviewRun(workspaceRoot, run.campaignId, run.reviewId)).artifacts.reviewPacketPath, "packet.md")
})

test("lists normalized Review Runs newest first and skips templates and symlinks", async (t) => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-list-"))
  const first = (await makeRun({
    workspaceRoot,
    campaignId: "campaign-a",
    reviewId: "review-a",
    now: "2026-07-12T00:00:00.000Z"
  })).run
  const second = (await makeRun({
    workspaceRoot,
    campaignId: "campaign-b",
    reviewId: "review-b",
    now: "2026-07-12T01:00:00.000Z"
  })).run
  await writeReviewRun(first)
  await writeReviewRun(second)

  const templateDirectory = path.join(workspaceRoot, ".bob-review-records", "campaigns", "campaign-a", "records", "_template")
  await fs.mkdir(templateDirectory, { recursive: true })
  await fs.writeFile(path.join(templateDirectory, "review-run.json"), "{}", "utf8")

  const recordsRoot = path.join(workspaceRoot, ".bob-review-records", "campaigns", "campaign-a", "records")
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-review-run-list-outside-"))
  try {
    await fs.symlink(outside, path.join(recordsRoot, "linked-review"), process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      t.diagnostic(`symlink assertion skipped: ${error.code}`)
    } else {
      throw error
    }
  }

  const runs = await listReviewRuns(workspaceRoot)
  assert.deepEqual(runs.map((item) => item.reviewId), ["review-b", "review-a"])
  assert.equal(runs.every((item) => item.status === "in_progress"), true)
  assert.equal(runs.every((item) => item.phases.target.status === "completed"), true)
})
