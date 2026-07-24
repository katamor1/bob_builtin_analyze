const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

test("compiler publication and generation come from the same detached top-level raw-package snapshot", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const originalGeneration = fixture.rawPackage.generation
  const snapshotModule = require("../out/core/contractV2/workflowLockSnapshot.js")
  const compiledPlan = require("../out/core/contractV2/compiledPlan.js")
  const originalSnapshot = snapshotModule.snapshotWorkflowLockGenerationRawPackage
  const inputs = []
  snapshotModule.snapshotWorkflowLockGenerationRawPackage = (value) => {
    inputs.push(value)
    if (inputs.length === 1) {
      fixture.rawPackage.publication = "staging"
      fixture.rawPackage.generation = ".staging-race-replacement"
    }
    return originalSnapshot(value)
  }
  try {
    const environment = compiler.createAuditedWorkflowCompilerEnvironment({
      purpose: "runtime",
      providerCatalog: createEmptyProviderCatalog(),
      bobProfile: createBobProfile()
    })
    const result = compiler.compileWorkflowPackage({
      rawPackage: fixture.rawPackage,
      environment
    })
    assert.equal(result.ok, true)
    assert.notEqual(inputs[0], fixture.rawPackage)
    const state = compiledPlan.requireCompiledWorkflowPlanState(result.handle)
    assert.equal(state.publication, "published")
    assert.equal(state.generation, originalGeneration)
    assert.equal(compiledPlan.isCompiledWorkflowPlanLeasable(result.handle), true)
  } finally {
    snapshotModule.snapshotWorkflowLockGenerationRawPackage = originalSnapshot
  }
})
