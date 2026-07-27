const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  compiledRuntime
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

test("compiled Bob input readiness reports only the missing required compiled input", async (t) => {
  const runtime = await compiledRuntime(t, { withInput: true })
  const inputs = require("../out/core/contractV2/compiledRunInputs.js")
  const planState = require("../out/core/contractV2/compiledPlan.js")
    .requireCompiledWorkflowPlanState(runtime.lease.handle)

  const empty = inputs.prepareCompiledWorkflowInputs(runtime.lease.handle.plan, planState, {})
  assert.deepEqual(
    inputs.missingRequiredCompiledWorkflowInputIds(runtime.lease.handle.plan, empty),
    ["providerInput"]
  )

  const ready = inputs.prepareCompiledWorkflowInputs(runtime.lease.handle.plan, planState, {
    providerInput: { message: "hello" }
  })
  assert.deepEqual(inputs.missingRequiredCompiledWorkflowInputIds(runtime.lease.handle.plan, ready), [])
  assert.equal(Object.isFrozen(ready), true)
  assert.equal(Object.isFrozen(ready.providerInput), true)
})

test("Bob product input collection uses compiled readiness rather than the empty legacy view", () => {
  const source = fs.readFileSync(path.join(
    __dirname,
    "..",
    "src",
    "workflowContractV2BobProductExecutor.ts"
  ), "utf8")
  assert.match(source, /prepareCompiledWorkflowInputs/)
  assert.match(source, /missingRequiredCompiledWorkflowInputIds/)
  assert.match(source, /promptCompiledBobInput/)
  assert.doesNotMatch(source, /collectBobWorkflowInputs/)
})
