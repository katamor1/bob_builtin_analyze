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

function runRoot(runtime, run) {
  return path.join(runtime.workspaceRoot, ".bob", "workflows", "runs", run.runId)
}

function committedOutputs(run) {
  return JSON.parse(run.state["workflow.contractV2.committedOutputs"] ?? "{}")
}

function faultingRunStore(runtime, targetStage) {
  const { ContractV2GuardedRunStateStore } = require("../out/workflowContractV2RunStateStore.js")
  let transaction = 0
  let injected = false
  return {
    store: new ContractV2GuardedRunStateStore({
      workspaceRoot: runtime.workspaceRoot,
      engineVersion: "test",
      durabilityFault: (stage) => {
        if (stage === "afterJournal") transaction += 1
        if (!injected && transaction === 3 && stage === targetStage) {
          injected = true
          throw new Error(`injected ${targetStage} visibility-save fault`)
        }
      }
    }),
    wasInjected: () => injected
  }
}

test("a pre-promotion artifact failure commits neither provider output nor a visible artifact set", async (t) => {
  const runtime = await compiledRuntime(t, {
    sideEffect: "workspace-write",
    dispatch: async (input) => {
      await input.effect.artifacts.writeArtifact({
        id: "report",
        bytes: Buffer.from("not-json", "utf8")
      })
      return { ok: true }
    }
  })

  const run = await runtime.runWithLease(runtime.lease, () => (
    subject().executeCompiledWorkflowRun(runInput(runtime, {}))
  ))

  assert.equal(run.status, "failed")
  assert.deepEqual(committedOutputs(run), {})
  assert.equal(run.state["workflow.contractV2.artifactSet.invoke"], undefined)

  const committed = path.join(runRoot(runtime, run), "attempts", "committed")
  assert.deepEqual(fs.existsSync(committed) ? fs.readdirSync(committed) : [], [])
})

test("a pre-write visibility-save failure rolls back output and artifact evidence while retaining an orphan", async (t) => {
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

  let saves = 0
  const failingStore = {
    createRunFromPlanLease: (...args) => runtime.runStore.createRunFromPlanLease(...args),
    saveRun: async (run) => {
      saves += 1
      if (saves === 3) throw new Error("injected visibility save failure")
      return runtime.runStore.saveRun(run)
    },
    loadRun: (...args) => runtime.runStore.loadRun(...args)
  }

  const run = await runtime.runWithLease(runtime.lease, () => (
    subject().executeCompiledWorkflowRun(runInput(runtime, {}, { runStore: failingStore }))
  ))

  assert.equal(run.status, "failed")
  assert.deepEqual(committedOutputs(run), {})
  assert.equal(run.state["workflow.contractV2.artifactSet.invoke"], undefined)

  const committed = path.join(runRoot(runtime, run), "attempts", "committed")
  assert.equal(fs.existsSync(committed), true)
  assert.equal(fs.readdirSync(committed).length, 1)
})

for (const stage of ["afterJournal", "afterRun", "afterEvent"]) {
  test(`an ambiguous ${stage} visibility-save fault reconciles the durable completed step`, async (t) => {
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
    const fault = faultingRunStore(runtime, stage)

    const run = await runtime.runWithLease(runtime.lease, () => (
      subject().executeCompiledWorkflowRun(runInput(runtime, {}, { runStore: fault.store }))
    ))

    assert.equal(fault.wasInjected(), true)
    assert.equal(run.status, "completed")
    assert.deepEqual(committedOutputs(run), { providerResult: { ok: true } })
    assert.match(run.state["workflow.contractV2.artifactSet.invoke"], /artifactSetDigest/)
    const persisted = await fault.store.loadRun(run.runId)
    assert.equal(persisted.status, "completed")
    assert.deepEqual(committedOutputs(persisted), { providerResult: { ok: true } })
  })
}
