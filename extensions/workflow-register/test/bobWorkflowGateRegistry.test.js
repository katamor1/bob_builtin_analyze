const assert = require("node:assert/strict")
const { test } = require("node:test")

const { BobWorkflowGateRegistry } = require("../out/bobWorkflowGateRegistry")

test("waitForDecision keeps one pending Promise until the gate is accepted", async () => {
  const registry = new BobWorkflowGateRegistry()
  const root = "C:\\workspace"
  const first = registry.waitForDecision({ workspaceRoot: root, runId: "run-1", stepId: "review", status: "reviewing" })
  const duplicate = registry.waitForDecision({ workspaceRoot: root, runId: "run-1", stepId: "review", status: "reviewing" })
  let settled = false
  void first.then(
    () => { settled = true },
    () => { settled = true }
  )

  await Promise.resolve()

  assert.equal(settled, false)
  assert.strictEqual(duplicate, first)
  assert.equal(registry.isPending(root, "run-1", "review"), true)
  assert.equal(registry.accept(root, "run-1", "review"), "accepted")
  assert.equal(await first, true)
  assert.equal(registry.isPending(root, "run-1", "review"), false)
  assert.equal(registry.accept(root, "run-1", "review"), "alreadyAccepted")
  assert.equal(registry.accept(root, "missing", "review"), "missing")
})

test("abort rejects a pending gate and ignores stale decisions", async () => {
  const registry = new BobWorkflowGateRegistry()
  const root = "C:\\workspace"
  const pending = registry.waitForDecision({ workspaceRoot: root, runId: "run-2", stepId: "review", status: "reviewing" })
  const rejected = assert.rejects(pending, /run was terminated/)

  assert.equal(registry.abort(root, "run-2", "review", "run was terminated"), true)
  await rejected
  assert.equal(registry.isPending(root, "run-2", "review"), false)
  assert.equal(registry.abort(root, "run-2", "review", "stale"), false)
  assert.equal(registry.accept(root, "run-2", "review"), "aborted")
})

test("dispose rejects every pending gate and is idempotent", async () => {
  const registry = new BobWorkflowGateRegistry()
  const root = "C:\\workspace"
  const first = registry.waitForDecision({ workspaceRoot: root, runId: "run-3", stepId: "first", status: "reviewing" })
  const second = registry.waitForDecision({ workspaceRoot: root, runId: "run-3", stepId: "second", status: "reviewing" })
  const firstRejected = assert.rejects(first, /disposed/i)
  const secondRejected = assert.rejects(second, /disposed/i)

  registry.dispose()
  registry.dispose()

  await Promise.all([firstRejected, secondRejected])
  assert.equal(registry.isPending(root, "run-3", "first"), false)
  assert.equal(registry.isPending(root, "run-3", "second"), false)
  assert.equal(registry.accept(root, "run-3", "first"), "aborted")
})

test("a later wait starts a fresh lifecycle for the same run and step", async () => {
  const registry = new BobWorkflowGateRegistry()
  const root = "C:\\workspace"
  const first = registry.waitForDecision({ workspaceRoot: root, runId: "run-4", stepId: "review", status: "reviewing" })
  assert.equal(registry.accept(root, "run-4", "review"), "accepted")
  assert.equal(await first, true)

  const retried = registry.waitForDecision({ workspaceRoot: root, runId: "run-4", stepId: "review", status: "reviewing" })

  assert.notStrictEqual(retried, first)
  assert.equal(registry.isPending(root, "run-4", "review"), true)
  const rejected = assert.rejects(retried, /retry terminated/)
  assert.equal(registry.abort(root, "run-4", "review", "retry terminated"), true)
  await rejected

  const afterAbort = registry.waitForDecision({ workspaceRoot: root, runId: "run-4", stepId: "review", status: "reviewing" })
  assert.equal(registry.accept(root, "run-4", "review"), "accepted")
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

  const firstOwner = firstService.coordinate("C:\\same-root", "same-run", "review-accept", async () => {
    firstOwnerCalls += 1
    await firstReleased
    return "first-service"
  })
  const firstDuplicate = firstService.coordinate("C:\\same-root", "same-run", "review-accept", async () => {
    firstDuplicateCalls += 1
    return "duplicate"
  })
  const secondOwner = secondService.coordinate("C:\\same-root", "same-run", "review-accept", async () => {
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

  const retry = firstService.coordinate("C:\\same-root", "same-run", "review-accept", async () => "first-service-retry")
  assert.notStrictEqual(retry, firstOwner)
  assert.equal(await retry, "first-service-retry")

  const failed = firstService.coordinate("C:\\same-root", "failed-run", "review-accept", async () => {
    throw new Error("coordinated acceptance failed")
  })
  await assert.rejects(failed, /coordinated acceptance failed/)
  const recovered = firstService.coordinate("C:\\same-root", "failed-run", "review-accept", async () => "recovered")
  assert.notStrictEqual(recovered, failed)
  assert.equal(await recovered, "recovered")
})

test("a different coordinator operation waits for a failed owner before running", async () => {
  const { ReviewAcceptanceCoordinator } = require("../out/reviewAcceptanceCoordinator")
  const coordinator = new ReviewAcceptanceCoordinator()
  let releaseOwner
  const ownerReleased = new Promise((resolve) => { releaseOwner = resolve })
  let retryCalls = 0
  const owner = coordinator.coordinate("C:\\same-root", "same-run", "run-resume", async () => {
    await ownerReleased
    throw new Error("resume failed")
  })
  const queued = coordinator.coordinate("C:\\same-root", "same-run", "run-retry", async () => {
    retryCalls += 1
    return "retry-after-failure"
  })
  const ownerRejected = assert.rejects(owner, /resume failed/)

  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(retryCalls, 0)
  releaseOwner()
  await ownerRejected
  assert.equal(await queued, "retry-after-failure")
  assert.equal(retryCalls, 1)
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
    registry.abort("C:\\workspace", "run-rebind", "source", "test cleanup")
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
    registry.abort("C:\\workspace", "run-abort", "source", "Bob workflow run aborted at branch checkpoint.")
    await rejected
  }
})

test("identical run and owner ids stay isolated across workspace roots", async () => {
  const registry = new BobWorkflowGateRegistry()
  const firstRoot = "C:\\workspace-a"
  const secondRoot = "C:\\workspace-b"
  const first = registry.waitForDecision({
    workspaceRoot: firstRoot,
    runId: "same-run",
    stepId: "same-step",
    ownerStepId: "same-step",
    status: "held"
  })
  const second = registry.waitForDecision({
    workspaceRoot: secondRoot,
    runId: "same-run",
    stepId: "same-step",
    ownerStepId: "same-step",
    status: "paused"
  })
  const secondRejected = assert.rejects(second, /second root aborted/)

  assert.notStrictEqual(first, second)
  assert.equal(registry.isPending(firstRoot, "same-run", "same-step"), true)
  assert.equal(registry.isPending(secondRoot, "same-run", "same-step"), true)
  assert.equal(registry.pendingForRun(firstRoot, "same-run").status, "held")
  assert.equal(registry.pendingForRun(secondRoot, "same-run").status, "paused")

  assert.equal(registry.accept(firstRoot, "same-run", "same-step"), "accepted")
  assert.equal(await first, true)
  assert.equal(registry.isPending(secondRoot, "same-run", "same-step"), true)
  assert.equal(registry.abort(secondRoot, "same-run", "same-step", "second root aborted"), true)
  await secondRejected
  assert.equal(registry.accept(firstRoot, "same-run", "same-step"), "alreadyAccepted")
  assert.equal(registry.accept(secondRoot, "same-run", "same-step"), "aborted")

  const fresh = registry.waitForDecision({
    workspaceRoot: firstRoot,
    runId: "same-run",
    stepId: "same-step",
    ownerStepId: "same-step",
    status: "reviewing"
  })
  assert.notStrictEqual(fresh, first)
  assert.equal(registry.accept(firstRoot, "same-run", "same-step"), "accepted")
  assert.equal(await fresh, true)
})
