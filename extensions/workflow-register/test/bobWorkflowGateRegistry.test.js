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
  assert.equal(registry.accept("run-1", "review"), "alreadyAccepted")
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
  assert.equal(registry.accept("run-2", "review"), "aborted")
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
  assert.equal(registry.accept("run-3", "first"), "aborted")
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

  const afterAbort = registry.waitForDecision({ runId: "run-4", stepId: "review", status: "reviewing" })
  assert.equal(registry.accept("run-4", "review"), "accepted")
  assert.equal(await afterAbort, true)
})

test("review acceptance coordinators isolate identical workspace and run keys per service", async () => {
  const { ReviewAcceptanceCoordinator } = require("../out/reviewAcceptanceCoordinator")
  const firstService = new ReviewAcceptanceCoordinator()
  const secondService = new ReviewAcceptanceCoordinator()
  let releaseFirst
  const firstReleased = new Promise((resolve) => { releaseFirst = resolve })
  let releaseSecond
  const secondReleased = new Promise((resolve) => { releaseSecond = resolve })
  let firstOwnerCalls = 0
  let firstDuplicateCalls = 0
  let secondOwnerCalls = 0

  const firstOwner = firstService.coordinate("C:\\same-root", "same-run", async () => {
    firstOwnerCalls += 1
    await firstReleased
    return "first-service"
  })
  const firstDuplicate = firstService.coordinate("C:\\same-root", "same-run", async () => {
    firstDuplicateCalls += 1
    return "duplicate"
  })
  const secondOwner = secondService.coordinate("C:\\same-root", "same-run", async () => {
    secondOwnerCalls += 1
    await secondReleased
    return "second-service"
  })
  await Promise.resolve()

  assert.strictEqual(firstDuplicate, firstOwner)
  assert.notStrictEqual(secondOwner, firstOwner)
  assert.equal(firstOwnerCalls, 1)
  assert.equal(firstDuplicateCalls, 0)
  assert.equal(secondOwnerCalls, 1)

  releaseFirst()
  releaseSecond()
  assert.deepEqual(await Promise.all([firstOwner, firstDuplicate, secondOwner]), [
    "first-service",
    "first-service",
    "second-service"
  ])

  const retry = firstService.coordinate("C:\\same-root", "same-run", async () => "first-service-retry")
  assert.notStrictEqual(retry, firstOwner)
  assert.equal(await retry, "first-service-retry")

  const failed = firstService.coordinate("C:\\same-root", "failed-run", async () => {
    throw new Error("coordinated acceptance failed")
  })
  await assert.rejects(failed, /coordinated acceptance failed/)
  const recovered = firstService.coordinate("C:\\same-root", "failed-run", async () => "recovered")
  assert.notStrictEqual(recovered, failed)
  assert.equal(await recovered, "recovered")
})

test("a live gate keeps its Bob-visible owner while the durable gate step is rebound", async () => {
  const registry = new BobWorkflowGateRegistry()
  const pending = registry.waitForDecision({
    workspaceRoot: "C:\\workspace",
    runId: "run-rebind",
    stepId: "source",
    ownerStepId: "source",
    status: "held"
  })

  try {
    const initial = registry.pendingForRun("C:\\workspace", "run-rebind")
    assert.deepEqual(initial, {
      workspaceRoot: "C:\\workspace",
      runId: "run-rebind",
      stepId: "source",
      ownerStepId: "source",
      status: "held"
    })

    const rebound = registry.rebind("C:\\workspace", "run-rebind", {
      stepId: "target",
      status: "checkpoint"
    })

    assert.strictEqual(rebound, pending)
    assert.deepEqual(registry.pendingForRun("C:\\workspace", "run-rebind"), {
      workspaceRoot: "C:\\workspace",
      runId: "run-rebind",
      stepId: "target",
      ownerStepId: "source",
      status: "checkpoint"
    })
    assert.equal(registry.acceptPending("C:\\workspace", "run-rebind"), "accepted")
    assert.equal(await pending, true)
    assert.equal(registry.acceptPending("C:\\workspace", "run-rebind"), "alreadyAccepted")
  } finally {
    registry.abort("run-rebind", "source", "test cleanup")
    registry.abort("run-rebind", "target", "test cleanup")
    await pending.catch(() => undefined)
  }
})

test("abortPending rejects a rebound gate with the stable terminal reason", async () => {
  const registry = new BobWorkflowGateRegistry()
  const pending = registry.waitForDecision({
    workspaceRoot: "C:\\workspace",
    runId: "run-abort",
    stepId: "source",
    ownerStepId: "source",
    status: "checkpoint"
  })
  const rejected = assert.rejects(pending, /Bob workflow run aborted at branch checkpoint\./)

  try {
    assert.equal(
      registry.abortPending("C:\\workspace", "run-abort", "Bob workflow run aborted at branch checkpoint."),
      true
    )
    await rejected
    assert.equal(registry.pendingForRun("C:\\workspace", "run-abort"), undefined)
    assert.equal(registry.acceptPending("C:\\workspace", "run-abort"), "aborted")
  } finally {
    registry.abort("run-abort", "source", "Bob workflow run aborted at branch checkpoint.")
    await rejected
  }
})
