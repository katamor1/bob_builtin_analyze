const assert = require("node:assert/strict")
const { test } = require("node:test")

function modules() {
  return require("../out/core/retention/runRetention")
}

function item(runId, overrides = {}) {
  return {
    runId,
    status: "completed",
    updatedAt: "2026-01-01T00:00:00.000Z",
    bytes: 100,
    revision: `sha256:${runId}`,
    recoverable: false,
    pinned: false,
    referencedBy: [],
    readOnly: false,
    journalPending: false,
    lockPresent: false,
    pathContained: true,
    ...overrides
  }
}

test("cleanup planner excludes active, recoverable, referenced, pinned, read-only, journaled, locked and unsafe runs", () => {
  const { planWorkflowRunCleanup } = modules()
  const plan = planWorkflowRunCleanup([
    item("running", { status: "running" }),
    item("paused", { status: "paused" }),
    item("checkpoint", { status: "checkpoint" }),
    item("reviewing", { status: "reviewing" }),
    item("held", { status: "held" }),
    item("recoverable", { recoverable: true }),
    item("referenced", { referencedBy: ["target-run"] }),
    item("pinned", { pinned: true }),
    item("readonly", { readOnly: true }),
    item("journal", { journalPending: true }),
    item("locked", { lockPresent: true }),
    item("unsafe", { pathContained: false })
  ], { now: "2026-07-13T00:00:00.000Z", completedDays: 1 })

  assert.deepEqual(plan.candidateRunIds, [])
  const byId = Object.fromEntries(plan.decisions.map((decision) => [decision.runId, decision]))
  assert.match(byId.running.blockers.join(" "), /active:running/)
  assert.match(byId.recoverable.blockers.join(" "), /recoverable/)
  assert.match(byId.referenced.blockers.join(" "), /referenced-by:target-run/)
  assert.match(byId.pinned.blockers.join(" "), /pinned/)
  assert.match(byId.readonly.blockers.join(" "), /read-only/)
  assert.match(byId.journal.blockers.join(" "), /journal-pending/)
  assert.match(byId.locked.blockers.join(" "), /execution-lock-present/)
  assert.match(byId.unsafe.blockers.join(" "), /path-not-contained/)
})

test("cleanup planner deterministically combines age, count and storage criteria", () => {
  const { planWorkflowRunCleanup, verifyWorkflowRunCleanupPlan } = modules()
  const inventory = [
    item("oldest", { updatedAt: "2026-01-01T00:00:00.000Z", bytes: 400 }),
    item("failed", { status: "failed", updatedAt: "2026-02-01T00:00:00.000Z", bytes: 100 }),
    item("middle", { updatedAt: "2026-04-01T00:00:00.000Z", bytes: 300 }),
    item("newest", { updatedAt: "2026-07-12T00:00:00.000Z", bytes: 200 })
  ]
  const policy = {
    now: "2026-07-13T00:00:00.000Z",
    completedDays: 90,
    maxCompletedRuns: 2,
    maxTotalBytes: 450
  }
  const first = planWorkflowRunCleanup(inventory, policy)
  const second = planWorkflowRunCleanup([...inventory].reverse(), policy)

  assert.deepEqual(first, second)
  assert.deepEqual(first.candidateRunIds, ["oldest", "failed", "middle"])
  assert.equal(first.reclaimBytes, 800)
  assert.match(first.digest, /^sha256:[a-f0-9]{64}$/)
  assert.equal(verifyWorkflowRunCleanupPlan(first), true)
})

test("explicit selection remains preview-bound and protected runs stay excluded", () => {
  const { planWorkflowRunCleanup } = modules()
  const plan = planWorkflowRunCleanup([
    item("selected"),
    item("selected-pinned", { pinned: true }),
    item("other")
  ], {
    now: "2026-07-13T00:00:00.000Z",
    selectedRunIds: ["selected", "selected-pinned"]
  })
  assert.deepEqual(plan.candidateRunIds, ["selected"])
  assert.match(plan.decisions.find((item) => item.runId === "selected-pinned").blockers.join(" "), /pinned/)
})

test("cleanup plan digest detects tampering and invalid policies are rejected", () => {
  const { planWorkflowRunCleanup, verifyWorkflowRunCleanupPlan } = modules()
  const plan = planWorkflowRunCleanup([item("old")], {
    now: "2026-07-13T00:00:00.000Z",
    completedDays: 1
  })
  const tampered = structuredClone(plan)
  tampered.decisions[0].action = "keep"
  assert.equal(verifyWorkflowRunCleanupPlan(tampered), false)
  assert.throws(() => planWorkflowRunCleanup([], { now: "invalid", completedDays: 1 }), /timestamp/i)
  assert.throws(() => planWorkflowRunCleanup([], { now: "2026-07-13T00:00:00.000Z" }), /criterion/i)
  assert.throws(() => planWorkflowRunCleanup([item("duplicate"), item("duplicate")], { now: "2026-07-13T00:00:00.000Z", completedDays: 1 }), /Duplicate/i)
})
