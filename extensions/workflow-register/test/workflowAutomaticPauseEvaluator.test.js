const assert = require("node:assert/strict")
const { test } = require("node:test")

const { evaluateAutomaticPause } = require("../out/core/engine/automaticPause")

function run(overrides = {}) {
  return {
    runId: "run-1",
    workflowId: "workflow-register.automatic-pause",
    workflowName: "automatic-pause",
    status: "running",
    currentStep: "analyze",
    inputs: {},
    state: {},
    steps: [],
    createdAt: "2026-07-12T00:00:00.000Z",
    updatedAt: "2026-07-12T00:00:00.000Z",
    ...overrides
  }
}

const agentStep = (id = "analyze") => ({ id, title: id, type: "agent", prompt: `Run ${id}.` })
const commandStep = (id = "collect") => ({ id, title: id, type: "command", action: { provider: "test.command" } })
const policy = (source, limits) => ({ source, limits })

test("elapsed run limit triggers at the exact boundary", () => {
  const policies = [policy("workflow", { maxRunMinutes: 45 })]
  assert.equal(evaluateAutomaticPause({
    run: run(), nextStep: agentStep(),
    now: new Date("2026-07-12T00:44:59.999Z"), policies
  }), undefined)

  assert.deepEqual(evaluateAutomaticPause({
    run: run(), nextStep: agentStep(),
    now: new Date("2026-07-12T00:45:00.000Z"), policies
  }), {
    kind: "maxRunMinutes",
    source: "workflow",
    limit: { maxRunMinutes: 45 },
    observed: { elapsedMinutes: 45 }
  })
})

test("agent limit counts archived and current attempts and blocks only agent calls", () => {
  const state = run({
    steps: [{
      id: "analyze", title: "Analyze", type: "agent", status: "completed",
      startedAt: "2026-07-12T00:00:00.000Z",
      completedAt: "2026-07-12T00:01:00.000Z",
      attempts: [{ attempt: 1, status: "completed", startedAt: "2026-07-11T23:58:00.000Z" }]
    }]
  })
  const policies = [policy("workflow", { maxAgentStepsPerRun: 2 })]
  assert.deepEqual(evaluateAutomaticPause({
    run: state, nextStep: agentStep("summarize"),
    now: new Date("2026-07-12T00:02:00.000Z"), policies
  }), {
    kind: "maxAgentStepsPerRun",
    source: "workflow",
    limit: { maxAgentStepsPerRun: 2 },
    observed: { agentStepsExecuted: 2 }
  })
  assert.equal(evaluateAutomaticPause({
    run: state, nextStep: commandStep(),
    now: new Date("2026-07-12T00:02:00.000Z"), policies
  }), undefined)
})

test("local time cutoff uses the configured IANA timezone", () => {
  const policies = [policy("workflow", { pauseAtLocalTime: "18:00", timezone: "Asia/Tokyo" })]
  assert.equal(evaluateAutomaticPause({
    run: run(), nextStep: agentStep(),
    now: new Date("2026-07-12T08:59:59.999Z"), policies
  }), undefined)
  assert.deepEqual(evaluateAutomaticPause({
    run: run(), nextStep: agentStep(),
    now: new Date("2026-07-12T09:00:00.000Z"), policies
  }), {
    kind: "pauseAtLocalTime",
    source: "workflow",
    limit: { pauseAtLocalTime: "18:00", timezone: "Asia/Tokyo" },
    observed: { localTime: "18:00", timezone: "Asia/Tokyo" }
  })
})

test("workflow policy wins deterministic ties before workspace policy", () => {
  const decision = evaluateAutomaticPause({
    run: run(), nextStep: agentStep(),
    now: new Date("2026-07-12T01:00:00.000Z"),
    policies: [
      policy("workflow", { maxRunMinutes: 45 }),
      policy("workspace", { maxRunMinutes: 30 })
    ]
  })
  assert.equal(decision.source, "workflow")
  assert.equal(decision.kind, "maxRunMinutes")
})
