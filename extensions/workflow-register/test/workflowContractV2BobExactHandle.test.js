const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  compiledRuntime
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

test("R5 leases the exact registered handle and rejects it after slot invalidation", async (t) => {
  const runtime = await compiledRuntime(t)
  const planStore = require("../out/core/contractV2/planStore.js")
  const exact = planStore.acquireWorkflowPlanHandle(runtime.lease.handle)
  try {
    assert.equal(exact.handle, runtime.lease.handle)
  } finally {
    exact.release()
  }

  runtime.planStore.invalidateSlot("test/compiled-runtime", "compiled-runtime")
  assert.throws(
    () => planStore.acquireWorkflowPlanHandle(runtime.lease.handle),
    /invalidated|owned|exact workflow plan/i
  )
})
