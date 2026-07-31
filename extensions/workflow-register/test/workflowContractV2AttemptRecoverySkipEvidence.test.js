const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/runAttemptRecovery.js")
}

const digestA = `sha256:${"a".repeat(64)}`

function plan() {
  return Object.freeze({
    workflow: Object.freeze({
      steps: Object.freeze([
        Object.freeze({ id: "write", type: "command", provider: "writer" })
      ])
    }),
    providerBindings: Object.freeze([
      Object.freeze({ id: "writer", sideEffect: "workspace-write" })
    ])
  })
}

function run() {
  return {
    runId: "run-1",
    workflowSchemaVersion: "workflow-register/v2",
    status: "paused",
    currentStep: "write",
    state: {},
    steps: [{ id: "write", status: "completed" }]
  }
}

test("malformed skip evidence fails closed before artifact inspection", async () => {
  let calls = 0
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async () => {
    calls += 1
    return Object.freeze({ status: "missing" })
  })
  const selectedRun = run()
  selectedRun.state["workflow.contractV2.skipped.write"] = "yes"

  const result = await classify({
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "invalid")
  assert.equal(calls, 0)
})

test("skip and committed visibility evidence cannot describe the same step", async () => {
  let calls = 0
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async () => {
    calls += 1
    return Object.freeze({
      status: "committed",
      artifactSet: Object.freeze({}),
      artifactSetDigest: digestA
    })
  })
  const selectedRun = run()
  selectedRun.state["workflow.contractV2.skipped.write"] = "true"
  selectedRun.state["workflow.contractV2.artifactSet.write"] = JSON.stringify({
    artifactSetDigest: digestA,
    attemptId: "attempt-0001-0001"
  })

  const result = await classify({
    plan: plan(),
    run: selectedRun,
    runRoot: "/workspace/.bob/workflows/runs/run-1"
  })

  assert.equal(result.kind, "invalid")
  assert.equal(calls, 0)
})
