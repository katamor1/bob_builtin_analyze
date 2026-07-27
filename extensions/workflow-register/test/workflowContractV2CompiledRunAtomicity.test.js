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

test("a pre-promotion artifact failure commits neither provider output nor staging residue", async (t) => {
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

  const root = runRoot(runtime, run)
  const staging = path.join(root, "attempts", "staging")
  const committed = path.join(root, "attempts", "committed")
  assert.deepEqual(fs.existsSync(staging) ? fs.readdirSync(staging) : [], [])
  assert.deepEqual(fs.existsSync(committed) ? fs.readdirSync(committed) : [], [])
})

test("a visibility-save failure rolls back output and artifact evidence while retaining an orphan", async (t) => {
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
    }
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
