const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

function restartSubject() {
  return require("../out/core/contractV2/runRestartRecovery.js")
}

function intentSubject() {
  return require("../out/core/contractV2/providerEffectIntent.js")
}

const planDigest = `sha256:${"a".repeat(64)}`

function plan(idempotency = "key-required") {
  return Object.freeze({
    workflowId: "compiled-workflow",
    workflow: Object.freeze({
      resumePolicy: Object.freeze({
        mode: "restart-step",
        maxAttempts: 3,
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

function run(message = "hello") {
  return {
    runId: "run-1",
    workflowSchemaVersion: "workflow-register/v2",
    status: "running",
    currentStep: "invoke",
    inputs: { message },
    state: {},
    steps: [{ id: "invoke", status: "running", attempt: 1 }]
  }
}

function expectedIntent(selectedPlan, selectedRun) {
  return intentSubject().createCompiledProviderEffectIntent({
    plan: selectedPlan,
    planDigest,
    run: selectedRun,
    context: Object.freeze({ input: selectedRun.inputs, outputs: Object.freeze({}) }),
    step: selectedPlan.workflow.steps[0],
    stepIndex: 0
  })
}

function inDoubt() {
  return Object.freeze({
    kind: "in-doubt",
    stepId: "invoke",
    attemptId: "attempt-0001-0001",
    artifactStatus: "missing",
    committed: Object.freeze([])
  })
}

function classify(selectedPlan, selectedRun, intent) {
  return restartSubject().classifyWorkflowContractV2Restart({
    plan: selectedPlan,
    run: selectedRun,
    attemptRecovery: inDoubt(),
    effectIntent: intent
  })
}

test("restart requires the exact durable effect intent used before dispatch", () => {
  const selectedPlan = plan()
  const selectedRun = run()
  const intent = expectedIntent(selectedPlan, selectedRun)
  selectedRun.state[intentSubject().providerEffectIntentStateKey("invoke")] =
    intentSubject().encodeWorkflowProviderEffectIntent(intent)

  const decision = classify(selectedPlan, selectedRun, intent)

  assert.equal(decision.kind, "restart")
  assert.equal(decision.idempotency, "key-required")
  assert.match(decision.effectIntentDigest, /^sha256:[0-9a-f]{64}$/)
})

test("changed reconstructed input blocks a key-required retry", () => {
  const selectedPlan = plan()
  const selectedRun = run("original")
  const original = expectedIntent(selectedPlan, selectedRun)
  selectedRun.state[intentSubject().providerEffectIntentStateKey("invoke")] =
    intentSubject().encodeWorkflowProviderEffectIntent(original)
  selectedRun.inputs.message = "changed"
  const changed = expectedIntent(selectedPlan, selectedRun)

  const decision = classify(selectedPlan, selectedRun, changed)

  assert.equal(decision.kind, "blocked")
  assert.match(decision.reason, /intent|input|key|evidence/i)
})

test("tampered stable idempotency key blocks retry before preparation", () => {
  const selectedPlan = plan()
  const selectedRun = run()
  const intent = expectedIntent(selectedPlan, selectedRun)
  const tampered = {
    ...intent,
    idempotencyKey: `wf2:${"f".repeat(64)}`
  }
  selectedRun.state[intentSubject().providerEffectIntentStateKey("invoke")] =
    intentSubject().encodeWorkflowProviderEffectIntent(tampered)

  const decision = classify(selectedPlan, selectedRun, intent)

  assert.equal(decision.kind, "blocked")
})

test("product retry reconstructs effect intent from the recovered exact lease", () => {
  const product = fs.readFileSync(
    path.join(__dirname, "..", "src", "workflowContractV2RunRecovery.ts"),
    "utf8"
  )
  const expected = product.indexOf("expectedWorkflowContractV2RestartEffectIntent")
  const classifyCall = product.indexOf("classifyWorkflowContractV2Restart", expected)
  assert.ok(expected >= 0 && classifyCall > expected)
})
