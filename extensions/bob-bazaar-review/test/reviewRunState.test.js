const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  advanceReviewRun,
  buildReviewId,
  createReviewRunContext
} = require("../out/reviewRuns/reviewRunState")

test("creates and advances a review run without mutating the original", () => {
  const run = createReviewRunContext({
    workspaceRoot: "/workspace",
    campaignId: "campaign-1",
    reviewId: "bazaar-r125-project-rule-review",
    target: { mode: "singleRevision", repositoryRoot: "/workspace", revision: "125" },
    now: "2026-07-12T00:00:00.000Z"
  })
  const packetRun = advanceReviewRun(run, {
    phase: "packet",
    artifacts: { reviewPacketPath: ".bob-review-records/campaigns/campaign-1/records/bazaar-r125-project-rule-review/review-packet.md" },
    now: "2026-07-12T00:01:00.000Z"
  })

  assert.equal(run.phase, "target")
  assert.equal(packetRun.phase, "packet")
  assert.equal(packetRun.createdAt, run.createdAt)
  assert.equal(packetRun.updatedAt, "2026-07-12T00:01:00.000Z")
  assert.equal(packetRun.artifacts.reviewPacketPath.endsWith("review-packet.md"), true)
})

test("does not allow a review run phase to move backwards", () => {
  const run = createReviewRunContext({
    workspaceRoot: "/workspace",
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: "/workspace", revision: "1" }
  })
  const resultRun = advanceReviewRun(run, { phase: "result" })
  assert.throws(() => advanceReviewRun(resultRun, { phase: "packet" }), /backwards/)
})

test("builds stable safe review ids for each target mode", () => {
  assert.equal(buildReviewId({ mode: "singleRevision", revision: "125" }), "bazaar-r125-project-rule-review")
  assert.equal(buildReviewId({ mode: "revisionRange", baseRevision: "120", targetRevision: "126" }), "bazaar-r120-r126-project-rule-review")
  assert.equal(buildReviewId({ mode: "workingTreeSinceRevision", baseRevision: "126" }), "bazaar-r126-working-tree-project-rule-review")
})
