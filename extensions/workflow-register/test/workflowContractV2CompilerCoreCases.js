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

test("minimal package compiles to one deterministic deeply frozen public plan", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const result = compiler.compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: environment()
  })

  assert.equal(result.ok, true)
  assert.deepEqual(result.diagnostics, [])
  const { handle } = result
  assert.equal(Object.isFrozen(handle), true)
  assert.equal(handle.planDigest, canonicalDigest(handle.plan))
  assert.equal("planDigest" in handle.plan, false)
  assert.equal(handle.plan.schemaVersion, "workflow-compiled-plan/v2")
  assert.equal(handle.plan.compilerContractVersion, "workflow-register-compiler/v2")
  assert.equal(handle.plan.workflowId, "minimal")
  assert.equal(handle.plan.packageDigest, fixture.rawPackage.packageDigest)
  assert.equal(handle.plan.generation, fixture.rawPackage.generation)
  assert.equal(handle.plan.lockfileDigest, fixture.rawPackage.files.find(
    (file) => file.path === "workflow.lock.json"
  ).digest)
  assert.equal(handle.plan.environmentDigest, fixture.lock.environmentDigest)
  assert.deepEqual(handle.plan.prompts, [])
  assert.deepEqual(handle.plan.schemas, [])
  assert.deepEqual(handle.plan.predicates, [])
  assert.deepEqual(handle.plan.providerBindings, [])
  assertDeepFrozen(handle.plan)
  assertNoNodeValues(handle.plan)
  assert.doesNotThrow(() => JSON.stringify(handle.plan))
})

test("equal public evidence across distinct environments never reuses private handle identity", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const environmentA = environment("runtime")
  const environmentB = environment("runtime")
  const first = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: environmentA })
  const second = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: environmentB })
  assert.equal(first.ok, true)
  assert.equal(second.ok, true)
  assert.notEqual(first.handle, second.handle)
  assert.deepEqual(first.handle.plan, second.handle.plan)
  assert.equal(first.handle.planDigest, second.handle.planDigest)

  const internals = require("../out/core/contractV2/compiledPlan.js")
  assert.equal(internals.compiledWorkflowPlanBelongsToEnvironment(first.handle, environmentA), true)
  assert.equal(internals.compiledWorkflowPlanBelongsToEnvironment(first.handle, environmentB), false)
  assert.equal(internals.isCompiledWorkflowPlanLeasable(first.handle), true)
})

test("non-runtime compiler environments produce non-leasable handles without changing public evidence", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const runtime = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: environment("runtime") })
  const authoring = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: environment("authoring-validation") })
  const evidence = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: environment("evidence") })
  assert.equal(runtime.ok, true)
  assert.equal(authoring.ok, true)
  assert.equal(evidence.ok, true)
  assert.deepEqual(runtime.handle.plan, authoring.handle.plan)
  assert.deepEqual(authoring.handle.plan, evidence.handle.plan)
  assert.equal(runtime.handle.planDigest, authoring.handle.planDigest)
  const internals = require("../out/core/contractV2/compiledPlan.js")
  assert.equal(internals.isCompiledWorkflowPlanLeasable(runtime.handle), true)
  assert.equal(internals.isCompiledWorkflowPlanLeasable(authoring.handle), false)
  assert.equal(internals.isCompiledWorkflowPlanLeasable(evidence.handle), false)
})

test("compiler rejects hostile outer input without invoking proxy behavior", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  let traps = 0
  const proxy = new Proxy({ rawPackage: fixture.rawPackage, environment: environment() }, {
    get() { traps += 1; throw new Error("must not read proxy") },
    ownKeys() { traps += 1; throw new Error("must not inspect proxy") }
  })
  const result = compiler.compileWorkflowPackage(proxy)
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, "WF2_PACKAGE_LAYOUT_INVALID")
  assert.equal(traps, 0)
})

test("compiler uses captured collection and string intrinsics after module load", () => {
  const compiler = compilerSubject()
  const fixture = createLockedRawPackage()
  const audited = environment()
  const originals = {
    map: Array.prototype.map,
    filter: Array.prototype.filter,
    sort: Array.prototype.sort,
    find: Array.prototype.find,
    replace: String.prototype.replace
  }
  const guarded = (original, name) => function (...args) {
    const stack = new Error().stack ?? ""
    if (stack.includes("/out/core/contractV2/")) {
      throw new Error(`compiler used live ${name}`)
    }
    return Reflect.apply(original, this, args)
  }
  Array.prototype.map = guarded(originals.map, "Array.prototype.map")
  Array.prototype.filter = guarded(originals.filter, "Array.prototype.filter")
  Array.prototype.sort = guarded(originals.sort, "Array.prototype.sort")
  Array.prototype.find = guarded(originals.find, "Array.prototype.find")
  String.prototype.replace = guarded(originals.replace, "String.prototype.replace")
  try {
    const result = compiler.compileWorkflowPackage({
      rawPackage: fixture.rawPackage,
      environment: audited
    })
    assert.equal(result.ok, true)
  } finally {
    Array.prototype.map = originals.map
    Array.prototype.filter = originals.filter
    Array.prototype.sort = originals.sort
    Array.prototype.find = originals.find
    String.prototype.replace = originals.replace
  }
})
