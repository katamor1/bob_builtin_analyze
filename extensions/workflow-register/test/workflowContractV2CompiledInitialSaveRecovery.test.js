const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  compiledRuntime,
  subject
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

test("an afterRun initial-save failure reloads and reports the one durable run before rejecting", async (t) => {
  let injected = false
  const runtime = await compiledRuntime(t, {
    runStoreOptions: {
      durabilityFault: async (stage) => {
        if (!injected && stage === "afterRun") {
          injected = true
          throw new Error("injected afterRun initial-save failure")
        }
      }
    }
  })
  let reported

  await assert.rejects(
    () => runtime.runWithLease(runtime.lease, () => subject().executeCompiledWorkflowRun({
      lease: runtime.lease,
      inputs: {},
      options: { executionMode: "singleStep", stepId: "invoke" },
      workspaceRoot: runtime.workspaceRoot,
      runStore: runtime.runStore,
      signal: new AbortController().signal,
      onRunCreated: (run) => { reported = run }
    })),
    /injected afterRun initial-save failure/
  )

  assert.ok(reported)
  const runs = await runtime.runStore.listRuns()
  assert.equal(runs.length, 1)
  assert.equal(runs[0].runId, reported.runId)
  assert.equal(runs[0].workflowDefinitionHash, runtime.lease.released ? reported.workflowDefinitionHash : runtime.lease.planDigest)
})
