"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  recordReviewPacket,
  startReviewRun
} = require("../out/reviewRuns/reviewRunCoordinator")
const {
  recordReviewPacketProcessingFailure
} = require("../out/reviewRuns/reviewRunProcessingFailure")
const { nextReviewRunAction } = require("../out/reviewRuns/reviewRunResume")
const { readReviewRun } = require("../out/reviewRuns/reviewRunStore")

async function start(t) {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bbr-packet-failure-"))
  t.after(() => fs.rm(workspaceRoot, { recursive: true, force: true }))
  const run = await startReviewRun({
    workspaceRoot,
    campaignId: "campaign-1",
    reviewId: "review-1",
    target: { mode: "singleRevision", repositoryRoot: workspaceRoot, revision: "1" },
    now: "2026-07-26T00:00:00.000Z"
  })
  return { workspaceRoot, run }
}

test("coverage failure marks the packet phase failed and keeps review retryable", async (t) => {
  const { workspaceRoot, run } = await start(t)
  const error = Object.assign(new Error("coverage partial\u0000 diagnostic"), {
    code: "processing_coverage_partial"
  })

  const failed = await recordReviewPacketProcessingFailure(
    run,
    error,
    "2026-07-26T00:01:00.000Z"
  )

  assert.equal(failed.phase, "target")
  assert.equal(failed.phases.packet.status, "failed")
  assert.equal(failed.phases.packet.issue, "coverage partial diagnostic")
  assert.equal(failed.issues.at(-1).phase, "packet")
  assert.equal(failed.issues.at(-1).retryable, true)
  assert.equal(nextReviewRunAction(failed), "review")
  assert.deepEqual(await readReviewRun(workspaceRoot, "campaign-1", "review-1"), failed)
})

test("a completed packet is never moved backwards by a late failure", async (t) => {
  const { workspaceRoot, run } = await start(t)
  const completed = await recordReviewPacket(run, "# packet\n", "2026-07-26T00:01:00.000Z")

  const observed = await recordReviewPacketProcessingFailure(
    completed,
    new Error("late failure"),
    "2026-07-26T00:02:00.000Z"
  )

  assert.equal(observed.phases.packet.status, "completed")
  assert.equal(observed.artifacts.reviewPacketPath, completed.artifacts.reviewPacketPath)
  assert.deepEqual(await readReviewRun(workspaceRoot, "campaign-1", "review-1"), completed)
})

test("GUI persists packet failure before surfacing coverage errors", async () => {
  const source = await fs.readFile(path.join(__dirname, "..", "src", "ui", "reviewGui.ts"), "utf8")
  const gate = source.indexOf("result = await runBazaarReviewProcessingOperation(")
  const persistFailure = source.indexOf("recordReviewPacketProcessingFailure(reviewRun, error)")
  const recordPacket = source.indexOf("recordReviewPacket(reviewRun, result.packet)")
  assert.ok(gate >= 0)
  assert.ok(persistFailure > gate)
  assert.ok(recordPacket > persistFailure)
  assert.match(source, /this\.activeReviewRun = reviewRun[\s\S]*await this\.postReviewRuns\(\)/)
})
