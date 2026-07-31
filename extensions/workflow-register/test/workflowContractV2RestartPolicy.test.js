const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/runRestartRecovery.js")
}

function plan(idempotency = "idempotent", mode = "restart-step", maxAttempts = 3) {
  return Object.freeze({
    workflow: Object.freeze({
      resumePolicy: Object.freeze({
        mode,
        maxAttempts,
        retainCommittedOutputs: true,
        allowArtifactReuse: false
      }),
      steps: Object.freeze([
        Object.freeze({ id: "invoke", type: "command", provider: "provider" })
      ])
    }),
    providerBindings: Object.freeze([
      Object.freeze({
        id: "provider",
        sideEffect: "workspace-write",
        idempotency
      })
    ])
  })
}

function run(attempt = 1) {
  return {
    runId: "run-1",
    workflowSchemaVersion: "workflow-register/v2",
    status: "running",
    currentStep: "invoke",
    error: "ambiguous provider outcome",
    state: {},
    steps: [{
      id: "invoke",
      status: "running",
      attempt,
      startedAt: "2026-07-31T00:00:00.000Z"
    }]
  }
}

function inDoubt(status = "staging") {
  return Object.freeze({
    kind: "in-doubt",
    stepId: "invoke",
    attemptId: "attempt-0001-0001",
    artifactStatus: status,
    committed: Object.freeze([])
  })
}

test("idempotent and key-required providers may restart one in-doubt attempt", () => {
  for (const idempotency of ["idempotent", "key-required"]) {
    const selectedRun = run()
    const decision = subject().classifyWorkflowContractV2Restart({
      plan: plan(idempotency),
      run: selectedRun,
      attemptRecovery: inDoubt()
    })

    assert.equal(decision.kind, "restart")
    assert.equal(decision.stepId, "invoke")
    assert.equal(decision.previousAttempt, 1)
    assert.equal(decision.nextAttempt, 2)
    assert.equal(decision.idempotency, idempotency)
    assert.equal(decision.artifactStatus, "staging")

    const prepared = subject().prepareWorkflowContractV2Restart(selectedRun, decision)
    assert.equal(prepared, selectedRun)
    assert.equal(selectedRun.status, "paused")
    assert.equal(selectedRun.currentStep, "invoke")
    assert.equal(selectedRun.steps[0].status, "failed")
    assert.equal(selectedRun.steps[0].attempt, 1)
    assert.equal(selectedRun.state["workflow.contractV2.executionOrdinal.invoke"], undefined)
    assert.match(selectedRun.state[subject().workflowContractV2RestartStateKey("invoke")], /workflow-restart-preparation\/v1/)
  }
})

test("non-idempotent running effects remain in-doubt", () => {
  const decision = subject().classifyWorkflowContractV2Restart({
    plan: plan("non-idempotent"),
    run: run(),
    attemptRecovery: inDoubt("orphaned")
  })
  assert.equal(decision.kind, "blocked")
  assert.match(decision.reason, /non-idempotent|in doubt/i)
})

test("fail-closed policy and exhausted attempt budget block restart", () => {
  const failClosed = subject().classifyWorkflowContractV2Restart({
    plan: plan("idempotent", "fail-closed", 3),
    run: run(),
    attemptRecovery: inDoubt()
  })
  assert.equal(failClosed.kind, "blocked")
  assert.match(failClosed.reason, /fail-closed|policy/i)

  const exhausted = subject().classifyWorkflowContractV2Restart({
    plan: plan("key-required", "restart-step", 2),
    run: run(2),
    attemptRecovery: Object.freeze({
      ...inDoubt(),
      attemptId: "attempt-0001-0002"
    })
  })
  assert.equal(exhausted.kind, "blocked")
  assert.match(exhausted.reason, /attempt|limit/i)
})

test("restart decision must match the exact running step and attempt", () => {
  const mismatch = subject().classifyWorkflowContractV2Restart({
    plan: plan("idempotent"),
    run: run(),
    attemptRecovery: Object.freeze({
      ...inDoubt(),
      attemptId: "attempt-0001-0002"
    })
  })
  assert.equal(mismatch.kind, "blocked")
  assert.match(mismatch.reason, /attempt|evidence/i)
})
