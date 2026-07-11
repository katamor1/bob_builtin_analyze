const assert = require("node:assert/strict")
const { test } = require("node:test")

const { BobWorkflowGateRegistry } = require("../out/bobWorkflowGateRegistry")

test("waitForDecision keeps one pending Promise until the gate is accepted", async () => {
  const registry = new BobWorkflowGateRegistry()
  const first = registry.waitForDecision({ runId: "run-1", stepId: "review", status: "reviewing" })
  const duplicate = registry.waitForDecision({ runId: "run-1", stepId: "review", status: "reviewing" })
  let settled = false
  void first.then(
    () => { settled = true },
    () => { settled = true }
  )

  await Promise.resolve()

  assert.equal(settled, false)
  assert.strictEqual(duplicate, first)
  assert.equal(registry.isPending("run-1", "review"), true)
  assert.equal(registry.accept("run-1", "review"), "accepted")
  assert.equal(await first, true)
  assert.equal(registry.isPending("run-1", "review"), false)
  assert.equal(registry.accept("run-1", "review"), "alreadySettled")
  assert.equal(registry.accept("missing", "review"), "missing")
})

test("abort rejects a pending gate and ignores stale decisions", async () => {
  const registry = new BobWorkflowGateRegistry()
  const pending = registry.waitForDecision({ runId: "run-2", stepId: "review", status: "reviewing" })
  const rejected = assert.rejects(pending, /run was terminated/)

  assert.equal(registry.abort("run-2", "review", "run was terminated"), true)
  await rejected
  assert.equal(registry.isPending("run-2", "review"), false)
  assert.equal(registry.abort("run-2", "review", "stale"), false)
  assert.equal(registry.accept("run-2", "review"), "alreadySettled")
})

test("dispose rejects every pending gate and is idempotent", async () => {
  const registry = new BobWorkflowGateRegistry()
  const first = registry.waitForDecision({ runId: "run-3", stepId: "first", status: "reviewing" })
  const second = registry.waitForDecision({ runId: "run-3", stepId: "second", status: "reviewing" })
  const firstRejected = assert.rejects(first, /disposed/i)
  const secondRejected = assert.rejects(second, /disposed/i)

  registry.dispose()
  registry.dispose()

  await Promise.all([firstRejected, secondRejected])
  assert.equal(registry.isPending("run-3", "first"), false)
  assert.equal(registry.isPending("run-3", "second"), false)
  assert.equal(registry.accept("run-3", "first"), "alreadySettled")
})

test("a later wait starts a fresh lifecycle for the same run and step", async () => {
  const registry = new BobWorkflowGateRegistry()
  const first = registry.waitForDecision({ runId: "run-4", stepId: "review", status: "reviewing" })
  assert.equal(registry.accept("run-4", "review"), "accepted")
  assert.equal(await first, true)

  const retried = registry.waitForDecision({ runId: "run-4", stepId: "review", status: "reviewing" })

  assert.notStrictEqual(retried, first)
  assert.equal(registry.isPending("run-4", "review"), true)
  const rejected = assert.rejects(retried, /retry terminated/)
  assert.equal(registry.abort("run-4", "review", "retry terminated"), true)
  await rejected
})
