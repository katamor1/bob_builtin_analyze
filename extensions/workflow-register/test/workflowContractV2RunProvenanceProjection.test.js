const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

test("run provenance projection exposes exact plan evidence without prompt or schema bodies", async (t) => {
  const fixture = createLockedRawPackage()
  const environment = compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  const { WorkflowPlanStore } = require("../out/core/contractV2/index.js")
  const planStore = new WorkflowPlanStore()
  const lease = await planStore.acquire({
    collectionId: "test/projection",
    workflowId: fixture.rawPackage.workflowId,
    rawPackage: fixture.rawPackage,
    environment
  })
  t.after(() => lease.release())
  const subject = require("../out/core/contractV2/runPlanProvenance.js")
  const expected = subject.createWorkflowContractV2RunPlanProvenance(lease)
  const run = {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "projection-run",
    workflowId: lease.handle.plan.workflowId,
    workflowName: lease.handle.plan.workflow.name,
    workflowSchemaVersion: "workflow-register/v2",
    workflowDefinitionHash: lease.planDigest,
    status: "running",
    inputs: {},
    state: {},
    steps: [],
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
    planProvenance: expected
  }

  const { projectWorkflowRunProvenance, workflowRunProvenanceControlLines } = require("../out/core/runProvenance.js")
  const projection = projectWorkflowRunProvenance(run)
  assert.deepEqual(projection.plan, expected)
  assert.match(workflowRunProvenanceControlLines(projection).join("\n"), new RegExp(lease.planDigest))
  const serialized = JSON.stringify(projection)
  for (const prompt of lease.handle.plan.prompts) assert.doesNotMatch(serialized, new RegExp(prompt.text))
})
