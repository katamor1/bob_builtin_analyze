const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  assertDeepFrozen,
  assertNoNodeValues,
  canonicalDigest,
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

function environment(purpose = "runtime") {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose,
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
}

test("single compiler returns a canonical frozen plan and a separate digest", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const runtime = environment("runtime")
  const evidence = environment("evidence")

  const first = compiler.compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: runtime
  })
  const second = compiler.compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: evidence
  })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.notEqual(first.handle, second.handle)
  assert.deepEqual(second.handle.plan, first.handle.plan)
  assert.equal(second.handle.planDigest, first.handle.planDigest)
  assert.equal(first.handle.planDigest, canonicalDigest(first.handle.plan))
  assert.equal("planDigest" in first.handle.plan, false)
  assert.equal("purpose" in first.handle.plan, false)
  assert.equal("leaseable" in first.handle.plan, false)
  assert.equal(first.handle.plan.packageDigest, fixture.rawPackage.packageDigest)
  assert.equal(first.handle.plan.generation, fixture.rawPackage.generation)
  assert.equal(first.handle.plan.lockfileDigest, fixture.rawPackage.files.find(
    (file) => file.path === "workflow.lock.json"
  ).digest)
  assert.equal(first.handle.plan.compilerContractVersion, "workflow-register-compiler/v2")
  assert.deepEqual(first.handle.plan.providerBindings, [])
  assert.deepEqual(first.handle.plan.prompts, [])
  assert.deepEqual(first.handle.plan.schemas, [])
  assert.deepEqual(first.diagnostics, [])
  assertDeepFrozen(first.handle)
  assertDeepFrozen(first.handle.plan)
  assertNoNodeValues(first.handle.plan)
  assert.doesNotThrow(() => JSON.stringify(first.handle.plan))
})

test("the same environment and package still produce detached immutable handles", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const audited = environment()
  const first = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: audited })
  const second = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: audited })

  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.notEqual(first.handle, second.handle)
  assert.equal(first.handle.planDigest, second.handle.planDigest)
  assert.deepEqual(first.handle.plan, second.handle.plan)
})
