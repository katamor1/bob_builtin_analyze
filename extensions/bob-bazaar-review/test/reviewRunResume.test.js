const assert = require("node:assert/strict")
const { test } = require("node:test")

const { createReviewRunContext, setReviewRunPhaseProgress } = require("../out/reviewRuns/reviewRunState")
const { buildReviewRunResumeCandidate, nextReviewRunAction } = require("../out/reviewRuns/reviewRunResume")

function run() {
  return createReviewRunContext({
    workspaceRoot: "/workspace",
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: "/repo", revision: "1" },
    now: "2026-07-12T00:00:00.000Z"
  })
}

test("routes a target-only Review Run back to the review surface", () => {
  assert.equal(nextReviewRunAction(run()), "review")
})

test("routes packet and result progress to the correct GUI", () => {
  const packet = setReviewRunPhaseProgress(run(), {
    trackedPhase: "packet",
    status: "completed",
    phase: "packet",
    artifacts: { reviewPacketPath: "packet.md" }
  })
  assert.equal(nextReviewRunAction(packet), "resultCapture")

  const result = setReviewRunPhaseProgress(packet, {
    trackedPhase: "result",
    status: "completed",
    phase: "result",
    artifacts: { reviewResultJsonPath: "result.json", reviewResultMarkdownPath: "result.md" }
  })
  assert.equal(nextReviewRunAction(result), "humanTriage")
})

test("routes completed triage or record to finalization", () => {
  let value = setReviewRunPhaseProgress(run(), {
    trackedPhase: "packet",
    status: "completed",
    phase: "packet",
    artifacts: { reviewPacketPath: "packet.md" }
  })
  value = setReviewRunPhaseProgress(value, {
    trackedPhase: "result",
    status: "completed",
    phase: "result",
    artifacts: { reviewResultJsonPath: "result.json", reviewResultMarkdownPath: "result.md" }
  })
  value = setReviewRunPhaseProgress(value, {
    trackedPhase: "triage",
    status: "completed",
    phase: "triage",
    artifacts: { triageYamlPath: "triage.yaml" }
  })
  assert.equal(nextReviewRunAction(value), "finalize")

  value = setReviewRunPhaseProgress(value, {
    trackedPhase: "record",
    status: "completed",
    artifacts: { recordYamlPath: "record.yaml" }
  })
  assert.equal(nextReviewRunAction(value), "finalize")
})

test("completed Review Runs have no resume action and candidate exposes status", () => {
  let value = run()
  value = setReviewRunPhaseProgress(value, { trackedPhase: "packet", status: "completed", artifacts: { reviewPacketPath: "packet.md" } })
  value = setReviewRunPhaseProgress(value, { trackedPhase: "result", status: "completed", artifacts: { reviewResultJsonPath: "result.json", reviewResultMarkdownPath: "result.md" } })
  value = setReviewRunPhaseProgress(value, { trackedPhase: "triage", status: "completed", artifacts: { triageYamlPath: "triage.yaml" } })
  value = setReviewRunPhaseProgress(value, { trackedPhase: "record", status: "completed", artifacts: { recordYamlPath: "record.yaml" } })
  value = setReviewRunPhaseProgress(value, { trackedPhase: "summary", status: "completed", artifacts: { summaryJsonPath: "summary.json", summaryMarkdownPath: "summary.md" } })
  value = { ...value, phase: "completed", status: "completed" }

  assert.equal(nextReviewRunAction(value), "none")
  const candidate = buildReviewRunResumeCandidate(value)
  assert.equal(candidate.action, "none")
  assert.equal(candidate.label, "review-1")
  assert.equal(candidate.description.includes("completed"), true)
  assert.equal(candidate.phases.summary, "completed")
})
