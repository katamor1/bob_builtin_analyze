const assert = require("node:assert/strict")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/runAttemptRecovery.js")
}

const digest = `sha256:${"a".repeat(64)}`

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

function run(status = "completed") {
  return {
    workflowSchemaVersion: "workflow-register/v2",
    status: "paused",
    currentStep: "write",
    state: {},
    steps: [{ id: "write", status }]
  }
}

function classifier() {
  let calls = 0
  const classify = subject().createWorkflowContractV2AttemptRecoveryClassifier(async () => {
    calls += 1
    return Object.freeze({
      status: "committed",
      artifactSet: Object.freeze({}),
      artifactSetDigest: digest
    })
  })
  return { classify, calls: () => calls }
}

const runRoot = "/workspace/.bob/workflows/runs/run-1"

test("invalid deterministic skip evidence fails before artifact inspection", async () => {
  const selected = run()
  selected.state["workflow.contractV2.skipped.write"] = "false"
  const inspected = classifier()

  const result = await inspected.classify({ plan: plan(), run: selected, runRoot })

  assert.equal(result.kind, "invalid")
  assert.equal(inspected.calls(), 0)
})

test("artifact visibility and deterministic skip evidence cannot coexist", async () => {
  const selected = run()
  selected.state["workflow.contractV2.skipped.write"] = "true"
  selected.state["workflow.contractV2.artifactSet.write"] = JSON.stringify({
    artifactSetDigest: digest,
    attemptId: "attempt-0001-0001"
  })
  const inspected = classifier()

  const result = await inspected.classify({ plan: plan(), run: selected, runRoot })

  assert.equal(result.kind, "invalid")
  assert.equal(inspected.calls(), 0)
})

test("deterministic skip evidence requires a completed step", async () => {
  const selected = run("failed")
  selected.state["workflow.contractV2.skipped.write"] = "true"
  const inspected = classifier()

  const result = await inspected.classify({ plan: plan(), run: selected, runRoot })

  assert.equal(result.kind, "invalid")
  assert.equal(inspected.calls(), 0)
})
