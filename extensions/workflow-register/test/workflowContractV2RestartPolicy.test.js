const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/runRestartRecovery.js")
}

function intentSubject() {
  return require("../out/core/contractV2/providerEffectIntent.js")
}

const planDigest = `sha256:${"a".repeat(64)}`

function plan(idempotency = "idempotent", mode = "restart-step", maxAttempts = 3) {
  return Object.freeze({
    workflowId: "compiled-workflow",
    workflow: Object.freeze({
      resumePolicy: Object.freeze({
        mode,
        maxAttempts,
        retainCommittedOutputs: true,
        allowArtifactReuse: false
      }),
      steps: Object.freeze([
        Object.freeze({
          id: "invoke",
          type: "command",
          provider: "provider",
          input: Object.freeze({ source: "input", id: "message", pointer: "" })
        })
      ])
    }),
    providerBindings: Object.freeze([
      Object.freeze({
        id: "provider",
        exactVersion: "2.0.0",
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
    inputs: { message: "hello" },
    state: {},
    steps: [{
      id: "invoke",
      status: "running",
      attempt,
      startedAt: "2026-07-31T00:00:00.000Z"
    }]
  }
}

function effectIntent(selectedPlan, selectedRun) {
  const intent = intentSubject().createCompiledProviderEffectIntent({
    plan: selectedPlan,
    planDigest,
    run: selectedRun,
    context: Object.freeze({ input: selectedRun.inputs, outputs: Object.freeze({}) }),
    step: selectedPlan.workflow.steps[0],
    stepIndex: 0
  })
  selectedRun.state[intentSubject().providerEffectIntentStateKey("invoke")] =
    intentSubject().encodeWorkflowProviderEffectIntent(intent)
  return intent
}

function inDoubt(status = "staging", attempt = 1) {
  return Object.freeze({
    kind: "in-doubt",
    stepId: "invoke",
    attemptId: `attempt-0001-${String(attempt).padStart(4, "0")}`,
    artifactStatus: status,
    committed: Object.freeze([])
  })
}

function classify(selectedPlan, selectedRun, recovery = inDoubt("staging", selectedRun.steps[0].attempt)) {
  const intent = effectIntent(selectedPlan, selectedRun)
  return subject().classifyWorkflowContractV2Restart({
    plan: selectedPlan,
    run: selectedRun,
    attemptRecovery: recovery,
    effectIntent: intent
  })
}

test("idempotent and key-required providers may restart one in-doubt attempt", () => {
  for (const idempotency of ["idempotent", "key-required"]) {
    const selectedPlan = plan(idempotency)
    const selectedRun = run()
    const decision = classify(selectedPlan, selectedRun)

    assert.equal(decision.kind, "restart")
    assert.equal(decision.stepId, "invoke")
    assert.equal(decision.previousAttempt, 1)
    assert.equal(decision.nextAttempt, 2)
    assert.equal(decision.idempotency, idempotency)
    assert.equal(decision.artifactStatus, "staging")
    assert.match(decision.effectIntentDigest, /^sha256:[0-9a-f]{64}$/)

    const prepared = subject().prepareWorkflowContractV2Restart(selectedRun, decision)
    assert.equal(prepared, selectedRun)
    assert.equal(selectedRun.status, "paused")
    assert.equal(selectedRun.currentStep, "invoke")
    assert.equal(selectedRun.steps[0].status, "failed")
    assert.equal(selectedRun.steps[0].attempt, 1)
    assert.equal(selectedRun.state["workflow.contractV2.executionOrdinal.invoke"], undefined)
    const preparation = selectedRun.state[subject().workflowContractV2RestartStateKey("invoke")]
    assert.match(preparation, /workflow-restart-preparation\/v1/)
    assert.match(preparation, new RegExp(decision.effectIntentDigest.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  }
})

test("non-idempotent running effects remain in-doubt", () => {
  const selectedPlan = plan("non-idempotent")
  const selectedRun = run()
  const decision = classify(selectedPlan, selectedRun, inDoubt("orphaned"))
  assert.equal(decision.kind, "blocked")
  assert.match(decision.reason, /non-idempotent|in doubt/i)
})

test("fail-closed policy and exhausted attempt budget block restart", () => {
  const failClosedPlan = plan("idempotent", "fail-closed", 3)
  const failClosedRun = run()
  const failClosed = classify(failClosedPlan, failClosedRun)
  assert.equal(failClosed.kind, "blocked")
  assert.match(failClosed.reason, /fail-closed|policy/i)

  const exhaustedPlan = plan("key-required", "restart-step", 2)
  const exhaustedRun = run(2)
  const exhausted = classify(exhaustedPlan, exhaustedRun, inDoubt("staging", 2))
  assert.equal(exhausted.kind, "blocked")
  assert.match(exhausted.reason, /attempt|limit/i)
})

test("restart decision must match the exact running step and attempt", () => {
  const selectedPlan = plan("idempotent")
  const selectedRun = run()
  const mismatch = classify(selectedPlan, selectedRun, Object.freeze({
    ...inDoubt(),
    attemptId: "attempt-0001-0002"
  }))
  assert.equal(mismatch.kind, "blocked")
  assert.match(mismatch.reason, /attempt|evidence/i)
})
