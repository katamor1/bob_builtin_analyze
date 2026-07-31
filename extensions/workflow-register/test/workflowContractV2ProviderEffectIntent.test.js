const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

function subject() {
  return require("../out/core/contractV2/providerEffectIntent.js")
}

function plan(idempotency = "key-required", sideEffect = "external") {
  return Object.freeze({
    workflowId: "compiled-workflow",
    workflow: Object.freeze({
      steps: Object.freeze([
        Object.freeze({
          id: "invoke",
          type: "command",
          provider: "tool",
          input: Object.freeze({ source: "input", id: "message", pointer: "" })
        })
      ])
    }),
    providerBindings: Object.freeze([
      Object.freeze({
        id: "tool",
        exactVersion: "2.1.0",
        sideEffect,
        idempotency
      })
    ])
  })
}

function run(attempt, message = "hello") {
  return {
    runId: "run-1",
    state: {},
    inputs: { message },
    steps: [{ id: "invoke", status: "running", attempt }]
  }
}

function create(selectedPlan, selectedRun) {
  return subject().createCompiledProviderEffectIntent({
    plan: selectedPlan,
    planDigest: `sha256:${"a".repeat(64)}`,
    run: selectedRun,
    context: Object.freeze({ input: selectedRun.inputs, outputs: Object.freeze({}) }),
    step: selectedPlan.workflow.steps[0],
    stepIndex: 0
  })
}

test("key-required retries retain one logical effect key while attempt identity advances", () => {
  const selectedPlan = plan()
  const first = create(selectedPlan, run(1))
  const retry = create(selectedPlan, run(2))

  assert.equal(first.logicalEffectOrdinal, 1)
  assert.equal(retry.logicalEffectOrdinal, 1)
  assert.equal(first.inputDigest, retry.inputDigest)
  assert.equal(first.idempotencyKey, retry.idempotencyKey)
  assert.equal(first.attemptId, "attempt-0001-0001")
  assert.equal(retry.attemptId, "attempt-0001-0002")
})

test("changing the reconstructed provider input changes the input digest and stable key", () => {
  const selectedPlan = plan()
  const first = create(selectedPlan, run(1, "first"))
  const changed = create(selectedPlan, run(2, "changed"))

  assert.notEqual(first.inputDigest, changed.inputDigest)
  assert.notEqual(first.idempotencyKey, changed.idempotencyKey)
})

test("effect intent encoding is canonical and its decoder rejects variant drift", () => {
  const intent = create(plan(), run(1))
  const encoded = subject().encodeWorkflowProviderEffectIntent(intent)

  assert.deepEqual(subject().decodeWorkflowProviderEffectIntent(encoded), intent)
  assert.throws(
    () => subject().decodeWorkflowProviderEffectIntent(`${encoded.slice(0, -1)},"extra":true}`),
    /invalid|shape|canonical/i
  )
  const idempotent = create(plan("idempotent", "none"), run(1))
  assert.equal(Object.hasOwn(idempotent, "idempotencyKey"), false)
})

test("the compiled run loop saves effect intent before provider dispatch", () => {
  const loop = fs.readFileSync(
    path.join(__dirname, "..", "src", "core", "contractV2", "compiledRunLoop.ts"),
    "utf8"
  )
  const intent = loop.indexOf("createCompiledProviderEffectIntent")
  const save = loop.indexOf("await input.runStore.saveRun(run)", intent)
  const dispatch = loop.indexOf("executeCompiledStep({", save)
  assert.ok(intent >= 0 && save > intent && dispatch > save)
  assert.match(loop, /delete run\.state\[`workflow\.contractV2\.skipped\.\$\{step\.id\}`\]/)
})
