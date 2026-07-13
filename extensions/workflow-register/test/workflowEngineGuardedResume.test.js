const assert = require("node:assert/strict")
const fs = require("node:fs")
const { test } = require("node:test")
const { createWorkflowEngineContext } = require("./helpers/workflowEngineFixtures")

function workflow() {
  return {
    id: "workflow-register.guarded-held-resume",
    name: "guarded-held-resume",
    label: "Guarded Held Resume",
    schemaVersion: "workflow-register/v1",
    inputs: {},
    engineSteps: [
      { id: "approve", title: "Approve", type: "manual", form: { fields: [] } }
    ]
  }
}

async function heldContext(t) {
  const context = createWorkflowEngineContext()
  t.after(() => fs.rmSync(context.workspaceRoot, { recursive: true, force: true }))
  const run = await context.runStore.createRun(workflow(), {})
  run.status = "held"
  run.currentStep = "approve"
  run.steps[0].status = "held"
  await context.runStore.saveRun(run)
  return { ...context, run }
}

test("guarded resume validates and finalizes inside one execution coordination", async (t) => {
  const { engine, run, runStore } = await heldContext(t)
  const phases = []
  const result = await engine.resumeRunGuarded(
    run.runId,
    { workflow: workflow(), completeHeldStep: true, executionMode: "singleStep" },
    {
      beforeResume: (current) => {
        phases.push(`before:${current.status}`)
        assert.equal(current.status, "held")
      },
      afterResume: (current) => {
        phases.push(`after:${current.status}`)
        current.state["workflow.heldRecovery"] = JSON.stringify({ kind: "saved-state" })
      }
    }
  )

  assert.equal(result.status, "completed")
  assert.deepEqual(phases, ["before:held", "after:completed"])
  const persisted = await runStore.loadRun(run.runId)
  assert.equal(JSON.parse(persisted.state["workflow.heldRecovery"]).kind, "saved-state")
})

test("guard failure preserves the held run without partial mutation", async (t) => {
  const { engine, run, runStore } = await heldContext(t)
  await assert.rejects(
    engine.resumeRunGuarded(
      run.runId,
      { workflow: workflow(), completeHeldStep: true, executionMode: "singleStep" },
      { beforeResume: () => { throw new Error("classification changed") } }
    ),
    /classification changed/
  )
  const persisted = await runStore.loadRun(run.runId)
  assert.equal(persisted.status, "held")
  assert.equal(persisted.steps[0].status, "held")
  assert.equal(persisted.state["workflow.heldRecovery"], undefined)
})
