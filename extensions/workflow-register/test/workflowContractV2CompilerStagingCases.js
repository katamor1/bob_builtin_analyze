const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  emptyBobBinding,
  sourceFiles
} = require("./workflowContractV2CompilerTestSupport")
const {
  rawPackageFromFiles
} = require("./workflowContractV2LockTestSupport")

function environment() {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
}

function lockedRawPackages() {
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const placeholder = sourceFiles()
  const initialPublished = rawPackageFromFiles(placeholder)
  const lock = lockModule.generateWorkflowPackageLock({
    rawPackage: initialPublished,
    providers: [],
    bob: emptyBobBinding()
  })
  const files = sourceFiles({
    "workflow.lock.json": lockModule.encodeWorkflowPackageLock(lock)
  })
  return {
    published: rawPackageFromFiles(files),
    staging: rawPackageFromFiles(files, {
      publication: "staging",
      generation: ".staging-authoring-abc123"
    })
  }
}

test("staging and published forms of identical bytes share public plan evidence but not leaseability", () => {
  const compiler = compilerSubject()
  const raw = lockedRawPackages()
  const audited = environment()
  const publishedResult = compiler.compileWorkflowPackage({
    rawPackage: raw.published,
    environment: audited
  })
  const stagingResult = compiler.compileWorkflowPackage({
    rawPackage: raw.staging,
    environment: audited
  })

  assert.equal(publishedResult.ok, true)
  assert.equal(stagingResult.ok, true)
  assert.equal("generation" in publishedResult.handle.plan, false)
  assert.equal("generation" in stagingResult.handle.plan, false)
  assert.deepEqual(stagingResult.handle.plan, publishedResult.handle.plan)
  assert.equal(stagingResult.handle.planDigest, publishedResult.handle.planDigest)

  const compiledPlan = require("../out/core/contractV2/compiledPlan.js")
  const publishedState = compiledPlan.requireCompiledWorkflowPlanState(publishedResult.handle)
  const stagingState = compiledPlan.requireCompiledWorkflowPlanState(stagingResult.handle)
  assert.equal(publishedState.publication, "published")
  assert.equal(publishedState.generation, raw.published.generation)
  assert.equal(stagingState.publication, "staging")
  assert.equal(stagingState.generation, ".staging-authoring-abc123")
  assert.equal(compiledPlan.isCompiledWorkflowPlanLeasable(publishedResult.handle), true)
  assert.equal(compiledPlan.isCompiledWorkflowPlanLeasable(stagingResult.handle), false)
})
