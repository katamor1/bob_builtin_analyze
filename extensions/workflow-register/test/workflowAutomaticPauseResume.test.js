const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  automaticPauseOverrideChoices,
  parseAutomaticPauseState
} = require("../out/commands/automaticPauseResume")

test("automatic pause resume exposes bounded override choices", () => {
  assert.deepEqual([...automaticPauseOverrideChoices], [15, 30, 60])
})

test("automatic pause resume recognizes only structured automatic pause state", () => {
  const automatic = JSON.stringify({
    schemaVersion: "workflow-register/automatic-pause/v1",
    kind: "maxRunMinutes",
    source: "workflow",
    checkpoint: "before-step:analyze",
    nextStepId: "analyze",
    limit: { maxRunMinutes: 45 },
    observed: { elapsedMinutes: 45 },
    detectedAt: "2026-07-12T01:00:00.000Z"
  })
  assert.equal(parseAutomaticPauseState(automatic).kind, "maxRunMinutes")
  assert.equal(parseAutomaticPauseState(JSON.stringify({ pauseReason: "manual" })), undefined)
  assert.equal(parseAutomaticPauseState("not-json"), undefined)
})
