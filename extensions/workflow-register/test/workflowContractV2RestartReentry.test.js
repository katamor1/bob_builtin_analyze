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
const orphanA = `sha256:${"b".repeat(64)}`
const orphanB = `sha256:${"c".repeat(64)}`

function plan() {
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
          provider: "writer",
          input: Object.freeze({ source: "input", id: "message", pointer: "" })
        })
      ])
    }),
    providerBindings: Object.freeze([
      Object.freeze({
        id: "writer",
        exactVersion: "1.0.0",
        sideEffect: "workspace-write",
        idempotency: "key-required"
      })
    ])
  })
}

function run() {
  return {
    runId: "run-1",
    workflowSchemaVersion: "workflow-register/v2",
    status: "running",
    currentStep: "invoke",
    inputs: { message: "hello" },
    state: {},
    steps: [{ id: "invoke", status: "running", attempt: 1 }]
  }
}

function intent(selectedPlan, selectedRun) {
  const value = intentSubject().createCompiledProviderEffectIntent({
    plan: selectedPlan,
    planDigest,
    run: selectedRun,
    context: Object.freeze({ input: selectedRun.inputs, outputs: Object.freeze({}) }),
    step: selectedPlan.workflow.steps[0],
    stepIndex: 0
  })
  selectedRun.state[intentSubject().providerEffectIntentStateKey("invoke")] =
    intentSubject().encodeWorkflowProviderEffectIntent(value)
  return value
}

function recovery(status, digest = undefined) {
  return Object.freeze({
    kind: "in-doubt",
    stepId: "invoke",
    attemptId: "attempt-0001-0001",
    artifactStatus: status,
    ...(digest === undefined ? {} : { artifactSetDigest: digest }),
    committed: Object.freeze([])
  })
}

function classify(selectedPlan, selectedRun, selectedIntent, attemptRecovery) {
  return restartSubject().classifyWorkflowContractV2Restart({
    plan: selectedPlan,
    run: selectedRun,
    attemptRecovery,
    effectIntent: selectedIntent
  })
}

test("prepared retry revalidates the same orphaned artifact-set digest", () => {
  const selectedPlan = plan()
  const selectedRun = run()
  const selectedIntent = intent(selectedPlan, selectedRun)
  const first = classify(selectedPlan, selectedRun, selectedIntent, recovery("orphaned", orphanA))
  assert.equal(first.kind, "restart")
  restartSubject().prepareWorkflowContractV2Restart(selectedRun, first)

  const same = classify(selectedPlan, selectedRun, selectedIntent, recovery("orphaned", orphanA))
  assert.equal(same.kind, "restart")
  assert.equal(same.prepared, true)
  assert.equal(same.artifactSetDigest, orphanA)

  const changed = classify(selectedPlan, selectedRun, selectedIntent, recovery("orphaned", orphanB))
  assert.equal(changed.kind, "blocked")
  assert.match(changed.reason, /artifact|digest|evidence/i)
})

test("prepared retry blocks when staging evidence disappears or changes class", () => {
  const selectedPlan = plan()
  const selectedRun = run()
  const selectedIntent = intent(selectedPlan, selectedRun)
  const first = classify(selectedPlan, selectedRun, selectedIntent, recovery("staging"))
  assert.equal(first.kind, "restart")
  restartSubject().prepareWorkflowContractV2Restart(selectedRun, first)

  assert.equal(
    classify(selectedPlan, selectedRun, selectedIntent, recovery("staging")).kind,
    "restart"
  )
  const missing = classify(selectedPlan, selectedRun, selectedIntent, recovery("missing"))
  assert.equal(missing.kind, "blocked")
})

test("product retry reinspects a prepared workspace-write attempt before classification", () => {
  const product = fs.readFileSync(
    path.join(__dirname, "..", "src", "workflowContractV2RunRecovery.ts"),
    "utf8"
  )
  const expected = product.indexOf("expectedWorkflowContractV2RestartEffectIntent")
  const reinspection = product.indexOf("reinspectWorkflowContractV2RestartAttempt", expected)
  const classifyCall = product.indexOf("classifyWorkflowContractV2Restart", reinspection)
  assert.ok(expected >= 0 && reinspection > expected && classifyCall > reinspection)
})
