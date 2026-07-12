const assert = require("node:assert/strict")
const { test } = require("node:test")

const { evaluateAutomaticPause } = require("../out/core/engine/automaticPause")

function run(createdAt) {
  return {
    runId: "run-local-cutoff",
    workflowId: "workflow-register.automatic-pause",
    workflowName: "automatic-pause",
    status: "running",
    currentStep: "summarize",
    inputs: {},
    state: {},
    steps: [],
    createdAt,
    updatedAt: createdAt
  }
}

const nextStep = { id: "summarize", title: "Summarize", type: "agent", prompt: "Summarize." }
const policies = [{
  source: "workflow",
  limits: { pauseAtLocalTime: "18:00", timezone: "Asia/Tokyo" }
}]

test("local-time cutoff remains due after the local calendar rolls past midnight", () => {
  const decision = evaluateAutomaticPause({
    run: run("2026-07-12T00:00:00.000Z"), // 09:00 on July 12 in Tokyo
    nextStep,
    now: new Date("2026-07-12T16:00:00.000Z"), // 01:00 on July 13 in Tokyo
    policies
  })

  assert.deepEqual(decision, {
    kind: "pauseAtLocalTime",
    source: "workflow",
    limit: { pauseAtLocalTime: "18:00", timezone: "Asia/Tokyo" },
    observed: { localTime: "01:00", timezone: "Asia/Tokyo" }
  })
})
