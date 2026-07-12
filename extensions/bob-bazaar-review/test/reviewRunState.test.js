const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  advanceReviewRun,
  buildReviewId,
  createReviewRunContext,
  normalizeReviewRunContext,
  setReviewRunPhaseProgress
} = require("../out/reviewRuns/reviewRunState")

function createRun() {
  return createReviewRunContext({
    workspaceRoot: "/workspace",
    campaignId: "campaign-1",
    reviewId: "bazaar-r125-project-rule-review",
    target: { mode: "singleRevision", repositoryRoot: "/workspace", revision: "125" },
    now: "2026-07-12T00:00:00.000Z"
  })
}

test("Review Run progress initializes target and pending phases", () => {
  const run = createRun()

  assert.equal(run.status, "in_progress")
  assert.equal(run.phases.target.status, "completed")
  assert.equal(run.phases.target.completedAt, "2026-07-12T00:00:00.000Z")
  for (const phase of ["packet", "result", "triage", "record", "summary"]) {
    assert.equal(run.phases[phase].status, "not_started")
  }
  assert.deepEqual(run.metrics, {
    bobReviewSeconds: 0,
    humanTriageSeconds: 0,
    timingSource: "auto_wall_clock",
    correctedByUser: false
  })
  assert.deepEqual(run.issues, [])
})

test("creates and advances a review run without mutating the original", () => {
  const run = createRun()
  const packetRun = advanceReviewRun(run, {
    phase: "packet",
    artifacts: { reviewPacketPath: ".bob-review-records/campaigns/campaign-1/records/bazaar-r125-project-rule-review/review-packet.md" },
    now: "2026-07-12T00:01:00.000Z"
  })

  assert.equal(run.phase, "target")
  assert.equal(run.phases.packet.status, "not_started")
  assert.equal(packetRun.phase, "packet")
  assert.equal(packetRun.phases.packet.status, "completed")
  assert.equal(packetRun.createdAt, run.createdAt)
  assert.equal(packetRun.updatedAt, "2026-07-12T00:01:00.000Z")
  assert.equal(packetRun.artifacts.reviewPacketPath.endsWith("review-packet.md"), true)
})

test("Review Run progress requires artifacts for completed phases", () => {
  const run = createRun()
  assert.throws(
    () => setReviewRunPhaseProgress(run, { trackedPhase: "packet", status: "completed" }),
    /reviewPacketPath/
  )
  assert.throws(
    () => setReviewRunPhaseProgress(run, { trackedPhase: "result", status: "completed" }),
    /reviewResultJsonPath/
  )
  assert.throws(
    () => setReviewRunPhaseProgress(run, { trackedPhase: "triage", status: "completed" }),
    /triageYamlPath/
  )
  assert.throws(
    () => setReviewRunPhaseProgress(run, { trackedPhase: "record", status: "completed" }),
    /recordYamlPath/
  )
  assert.throws(
    () => setReviewRunPhaseProgress(run, { trackedPhase: "summary", status: "completed" }),
    /summaryJsonPath/
  )
})

test("Review Run completion requires every mandatory phase", () => {
  let run = createRun()
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "packet",
    status: "completed",
    artifacts: { reviewPacketPath: "packet.md" }
  })
  assert.throws(() => advanceReviewRun(run, { phase: "completed" }), /result phase must be completed/)

  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "result",
    status: "completed",
    artifacts: { reviewResultJsonPath: "result.json", reviewResultMarkdownPath: "result.md" }
  })
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "triage",
    status: "completed",
    artifacts: { triageYamlPath: "triage.yaml" }
  })
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "record",
    status: "completed",
    artifacts: { recordYamlPath: "record.yaml" }
  })
  run = setReviewRunPhaseProgress(run, {
    trackedPhase: "summary",
    status: "completed",
    artifacts: { summaryJsonPath: "summary.json", summaryMarkdownPath: "summary.md" }
  })
  const completed = advanceReviewRun(run, { phase: "completed", now: "2026-07-12T01:00:00.000Z" })
  assert.equal(completed.status, "completed")
  assert.equal(completed.phase, "completed")
})

test("normalizes Iteration 1 Review Run JSON without treating a triage draft as completed", () => {
  const normalized = normalizeReviewRunContext({
    schemaVersion: "bazaar-review-run/v1",
    workspaceRoot: "/workspace",
    campaignId: "campaign-1",
    reviewId: "review-1",
    phase: "triage",
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:05:00.000Z",
    target: { mode: "singleRevision", repositoryRoot: "/workspace", revision: "1" },
    artifacts: {
      reviewPacketPath: "packet.md",
      reviewResultJsonPath: "result.json",
      reviewResultMarkdownPath: "result.md",
      triageYamlPath: "triage.yaml"
    }
  })

  assert.equal(normalized.phases.packet.status, "completed")
  assert.equal(normalized.phases.result.status, "completed")
  assert.equal(normalized.phases.triage.status, "in_progress")
  assert.equal(normalized.status, "in_progress")
})

test("does not allow a review run phase to move backwards", () => {
  const run = createRun()
  const packetRun = advanceReviewRun(run, {
    phase: "packet",
    artifacts: { reviewPacketPath: "packet.md" }
  })
  const resultRun = advanceReviewRun(packetRun, {
    phase: "result",
    artifacts: { reviewResultJsonPath: "result.json", reviewResultMarkdownPath: "result.md" }
  })
  assert.throws(() => advanceReviewRun(resultRun, { phase: "packet" }), /backwards/)
})

test("builds stable safe review ids for each target mode", () => {
  assert.equal(buildReviewId({ mode: "singleRevision", revision: "125" }), "bazaar-r125-project-rule-review")
  assert.equal(buildReviewId({ mode: "revisionRange", baseRevision: "120", targetRevision: "126" }), "bazaar-r120-r126-project-rule-review")
  assert.equal(buildReviewId({ mode: "workingTreeSinceRevision", baseRevision: "126" }), "bazaar-r126-working-tree-project-rule-review")
})
