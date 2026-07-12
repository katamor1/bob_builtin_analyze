const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { readReviewRun } = require("../out/reviewRuns/reviewRunStore")
const {
  buildReviewRunMetadataSection,
  recordReviewPacket,
  recordReviewResult,
  recordTriageDraft,
  startReviewRun,
  validateReviewRunCommandInput
} = require("../out/reviewRuns/reviewRunCoordinator")

async function start() {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-coordinator-"))
  const run = await startReviewRun({
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" },
    now: "2026-07-12T00:00:00.000Z"
  })
  return { workspaceRoot, run }
}

test("starts a Review Run and persists the target phase", async () => {
  const { workspaceRoot, run } = await start()
  assert.equal(run.phase, "target")
  assert.deepEqual(await readReviewRun(workspaceRoot, "campaign-1", "review-1"), run)
})

test("records the packet and persists a workspace-relative artifact path", async () => {
  const { workspaceRoot, run } = await start()
  const packetRun = await recordReviewPacket(run, "# packet\n")
  assert.equal(packetRun.phase, "packet")
  assert.equal(packetRun.artifacts.reviewPacketPath, ".bob-review-records/campaigns/campaign-1/records/review-1/review-packet.md")
  assert.equal(await fs.readFile(path.join(workspaceRoot, packetRun.artifacts.reviewPacketPath), "utf8"), "# packet\n")
})

test("rejects a captured result whose review id does not match", async () => {
  const { run } = await start()
  await assert.rejects(
    () => recordReviewResult(run, {
      status: "ok",
      valid: true,
      reviewId: "other-review",
      jsonPath: path.join(run.workspaceRoot, ".bob/review/results/other-review.json"),
      markdownPath: path.join(run.workspaceRoot, ".bob/review/results/other-review.md")
    }),
    /does not match active Review Run/
  )
})

test("records captured result paths and advances to result", async () => {
  const { workspaceRoot, run } = await start()
  const resultRun = await recordReviewResult(run, {
    status: "ok",
    valid: true,
    reviewId: "review-1",
    jsonPath: path.join(workspaceRoot, ".bob/review/results/review-1.json"),
    markdownPath: path.join(workspaceRoot, ".bob/review/results/review-1.md"),
    metadataPath: path.join(workspaceRoot, ".bob/review/results/review-1.artifact-metadata.json")
  })
  assert.equal(resultRun.phase, "result")
  assert.equal(resultRun.artifacts.reviewResultJsonPath, ".bob/review/results/review-1.json")
  assert.equal(resultRun.artifacts.reviewResultMarkdownPath, ".bob/review/results/review-1.md")
  assert.equal(resultRun.artifacts.reviewResultMetadataPath, ".bob/review/results/review-1.artifact-metadata.json")
})

test("records a triage draft and renders exact metadata for the Bob packet", async () => {
  const { workspaceRoot, run } = await start()
  const triagePath = path.join(workspaceRoot, ".bob-review-records/campaigns/campaign-1/records/review-1/triage.yaml")
  const triageRun = await recordTriageDraft(run, triagePath)
  assert.equal(triageRun.phase, "triage")
  assert.equal(triageRun.artifacts.triageYamlPath, ".bob-review-records/campaigns/campaign-1/records/review-1/triage.yaml")
  const metadata = buildReviewRunMetadataSection(run)
  assert.match(metadata, /campaign_id: campaign-1/)
  assert.match(metadata, /review_id: review-1/)
  assert.match(metadata, /Use this exact review_id/)
})

test("rejects artifact paths outside the workspace", async () => {
  const { run } = await start()
  await assert.rejects(
    () => recordTriageDraft(run, path.resolve(run.workspaceRoot, "..", "escape.yaml")),
    /outside Review Run workspace/
  )
})

test("allocates a suffix instead of overwriting an existing Review Run", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-coordinator-collision-"))
  const input = {
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" },
    now: "2026-07-12T00:00:00.000Z"
  }
  const first = await startReviewRun(input)
  const second = await startReviewRun(input)

  assert.equal(first.reviewId, "review-1")
  assert.equal(second.reviewId, "review-1-02")
  assert.equal((await readReviewRun(workspaceRoot, "campaign-1", "review-1")).reviewId, "review-1")
  assert.equal((await readReviewRun(workspaceRoot, "campaign-1", "review-1-02")).reviewId, "review-1-02")
})

test("treats an existing legacy record directory as an occupied Review Run id", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-coordinator-legacy-"))
  const legacyDirectory = path.join(
    workspaceRoot,
    ".bob-review-records",
    "campaigns",
    "campaign-1",
    "records",
    "review-1"
  )
  await fs.mkdir(legacyDirectory, { recursive: true })
  await fs.writeFile(path.join(legacyDirectory, "record.yaml"), "review_id: review-1\n", "utf8")

  const run = await startReviewRun({
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" }
  })

  assert.equal(run.reviewId, "review-1-02")
  assert.equal(await fs.readFile(path.join(legacyDirectory, "record.yaml"), "utf8"), "review_id: review-1\n")
})

test("allocates unique Review Run ids for concurrent starts", async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-coordinator-concurrent-"))
  const input = {
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" }
  }
  const runs = await Promise.all([startReviewRun(input), startReviewRun(input)])
  assert.deepEqual(runs.map((run) => run.reviewId).sort(), ["review-1", "review-1-02"])
})

test("validates Review Run command roots against open workspace folders", async (t) => {
  const openWorkspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-command-boundary-"))
  const workspaceRoot = path.join(openWorkspaceRoot, "project")
  await fs.mkdir(workspaceRoot)
  t.after(() => fs.rm(openWorkspaceRoot, { recursive: true, force: true }))

  assert.deepEqual(
    await validateReviewRunCommandInput(
      { workspaceRoot, campaignId: "campaign-1", reviewId: "review-1" },
      [openWorkspaceRoot]
    ),
    { workspaceRoot, campaignId: "campaign-1", reviewId: "review-1" }
  )
  await assert.rejects(
    () => validateReviewRunCommandInput(
      { workspaceRoot: path.resolve(openWorkspaceRoot, "..", "outside"), campaignId: "campaign-1", reviewId: "review-1" },
      [openWorkspaceRoot]
    ),
    /inside an open workspace folder/
  )
  await assert.rejects(
    () => validateReviewRunCommandInput(
      { workspaceRoot, campaignId: "campaign\/escape", reviewId: "review-1" },
      [openWorkspaceRoot]
    ),
    /campaignId/
  )
})
