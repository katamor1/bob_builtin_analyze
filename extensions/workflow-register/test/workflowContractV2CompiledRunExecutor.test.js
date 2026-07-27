const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const {
  compiledRuntime,
  subject
} = require("./workflowContractV2CompiledRunExecutorTestSupport")

function runInput(runtime, inputs, overrides = {}) {
  return {
    lease: runtime.lease,
    inputs,
    options: {},
    workspaceRoot: runtime.workspaceRoot,
    runStore: runtime.runStore,
    signal: new AbortController().signal,
    ...overrides
  }
}

test("compiled command execution validates inputs, dispatches once, and persists the exact plan run", async (t) => {
  let dispatches = 0
  const runtime = await compiledRuntime(t, {
    withInput: true,
    dispatch: (input) => {
      dispatches += 1
      assert.deepEqual(input.value, { message: "hello" })
      return { ok: true }
    }
  })
  const planDigest = runtime.lease.planDigest

  const run = await runtime.runWithLease(runtime.lease, () => (
    subject().executeCompiledWorkflowRun(runInput(runtime, {
      providerInput: { message: "hello" }
    }))
  ))

  assert.equal(dispatches, 1)
  assert.equal(run.workflowSchemaVersion, "workflow-register/v2")
  assert.equal(run.workflowDefinitionHash, planDigest)
  assert.equal(run.status, "completed")
  assert.equal(run.steps[0].status, "completed")
  assert.equal(runtime.lease.released, true)
  assert.deepEqual(JSON.parse(run.state["workflow.contractV2.committedOutputs"]), {
    providerResult: { ok: true }
  })
  const persisted = await runtime.runStore.loadRun(run.runId)
  assert.equal(persisted.status, "completed")
  assert.deepEqual(persisted.planProvenance, run.planProvenance)
})

test("invalid compiled workflow inputs perform zero dispatches and create no run", async (t) => {
  let dispatches = 0
  const runtime = await compiledRuntime(t, {
    withInput: true,
    dispatch: () => {
      dispatches += 1
      return { ok: true }
    }
  })

  await assert.rejects(
    () => runtime.runWithLease(runtime.lease, () => (
      subject().executeCompiledWorkflowRun(runInput(runtime, {
        providerInput: { unexpected: true }
      }))
    )),
    /compiled workflow input/i
  )

  assert.equal(dispatches, 0)
  assert.deepEqual(await runtime.runStore.listRuns(), [])
})

test("a false compiled entry predicate skips the provider without creating attempt evidence", async (t) => {
  let dispatches = 0
  const runtime = await compiledRuntime(t, {
    withInput: true,
    skipCommand: true,
    dispatch: () => {
      dispatches += 1
      return { ok: true }
    }
  })

  const run = await runtime.runWithLease(runtime.lease, () => (
    subject().executeCompiledWorkflowRun(runInput(runtime, {
      providerInput: { message: "hello" },
      shouldRun: false
    }))
  ))

  assert.equal(dispatches, 0)
  assert.equal(run.status, "completed")
  assert.equal(run.steps[0].status, "completed")
  assert.equal(run.steps[0].attempt, undefined)
  assert.equal(run.steps[0].startedAt, undefined)
  assert.equal(run.state["workflow.contractV2.skipped.invoke"], "true")
})

test("workspace-write command artifacts become visible only through the R3 transaction callback", async (t) => {
  const runtime = await compiledRuntime(t, {
    sideEffect: "workspace-write",
    dispatch: async (input) => {
      await input.effect.artifacts.writeArtifact({
        id: "report",
        bytes: Buffer.from('{"ok":true}', "utf8")
      })
      return { ok: true }
    }
  })

  const run = await runtime.runWithLease(runtime.lease, () => (
    subject().executeCompiledWorkflowRun(runInput(runtime, {}))
  ))

  const committedRoot = path.join(
    runtime.workspaceRoot,
    ".bob",
    "workflows",
    "runs",
    run.runId,
    "attempts",
    "committed"
  )
  assert.equal(run.status, "completed")
  assert.equal(fs.existsSync(committedRoot), true)
  const attempts = fs.readdirSync(committedRoot)
  assert.equal(attempts.length, 1)
  assert.equal(fs.existsSync(path.join(committedRoot, attempts[0], "artifact-set.json")), true)
})
