const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

function modules() {
  return require("../out/core/runtime/runRetentionService")
}

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "workflow-retention-service-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  await fs.mkdir(path.join(root, ".bob", "workflows", "runs"), { recursive: true })
  return root
}

async function writeRun(root, runId, overrides = {}) {
  const directory = path.join(root, ".bob", "workflows", "runs", runId)
  await fs.mkdir(directory)
  const run = {
    schemaVersion: "workflow-register/run-state/v1",
    runId,
    workflowId: "retention.test",
    workflowName: "Retention Test",
    workflowSchemaVersion: "workflow-register/v1",
    status: "completed",
    inputs: {},
    state: {},
    steps: [{ id: "collect", title: "Collect", type: "manual", status: "completed" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  }
  await fs.writeFile(path.join(directory, "run.json"), JSON.stringify(run, null, 2) + "\n")
  return { run, directory }
}

test("inventory protects referenced source runs and malformed pin sidecars", async (t) => {
  const root = await workspace(t)
  const source = await writeRun(root, "source-run")
  const target = await writeRun(root, "target-run", {
    state: {
      "workflow.artifactReuse": JSON.stringify({
        schemaVersion: "workflow-register/artifact-reuse/v1",
        sourceRunId: "source-run",
        reusedStepIds: ["collect"],
        hydratedKeys: []
      })
    }
  })
  await fs.writeFile(path.join(target.directory, "retention.json"), "not-json")

  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T00:00:00.000Z" })
  const inventory = await service.inventory()
  const sourceItem = inventory.find((item) => item.runId === source.run.runId)
  const targetItem = inventory.find((item) => item.runId === target.run.runId)
  assert.deepEqual(sourceItem.referencedBy, ["target-run"])
  assert.equal(targetItem.pinned, true)

  const plan = await service.preview({ completedDays: 1 })
  assert.deepEqual(plan.candidateRunIds, [])
  assert.match(plan.decisions.find((item) => item.runId === "source-run").blockers.join(" "), /referenced-by/)
  assert.match(plan.decisions.find((item) => item.runId === "target-run").blockers.join(" "), /pinned/)
})

test("pin sidecar is independent from run.json and stale preview is rejected", async (t) => {
  const root = await workspace(t)
  const { directory } = await writeRun(root, "old-run")
  const before = await fs.readFile(path.join(directory, "run.json"), "utf8")
  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root, now: () => "2026-07-13T00:00:00.000Z" })
  const plan = await service.preview({ completedDays: 1 })
  assert.deepEqual(plan.candidateRunIds, ["old-run"])

  await service.setPinned("old-run", true, "changed after preview")
  assert.equal(await fs.readFile(path.join(directory, "run.json"), "utf8"), before)
  await assert.rejects(service.apply(plan), /inventory changed after preview/i)
  assert.equal((await fs.stat(directory)).isDirectory(), true)
})

test("storage summary reports counts and bytes without body values", async (t) => {
  const root = await workspace(t)
  await writeRun(root, "completed-run")
  await writeRun(root, "held-run", {
    status: "held",
    currentStep: "collect",
    steps: [{ id: "collect", title: "Collect", type: "manual", status: "held" }],
    state: { private: "secret body value" }
  })
  const { WorkflowRunRetentionService } = modules()
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const summary = await service.summarize()
  assert.equal(summary.runCount, 2)
  assert.equal(summary.terminalRunCount, 1)
  assert.equal(summary.recoverableRunCount, 1)
  assert.equal(JSON.stringify(summary).includes("secret body value"), false)
})
