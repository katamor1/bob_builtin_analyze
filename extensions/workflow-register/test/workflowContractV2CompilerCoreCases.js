const assert = require("node:assert/strict")
const { test } = require("node:test")
const { runInThisContext } = require("node:vm")
const {
  assertDeepFrozen,
  assertNoNodeValues,
  canonicalDigest,
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage,
  sourceFiles,
  workflowYamlText
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
  assert.equal("generation" in handle.plan, false)
  assert.equal(handle.plan.schemaVersion, "workflow-compiled-plan/v2")
  assert.equal(handle.plan.compilerContractVersion, "workflow-register-compiler/v2")
  assert.equal(handle.plan.workflowId, "minimal")
  assert.equal(handle.plan.packageDigest, fixture.rawPackage.packageDigest)
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

  const state = require("../out/core/contractV2/compiledPlan.js").requireCompiledWorkflowPlanState(handle)
  assert.equal(state.publication, "published")
  assert.equal(state.generation, fixture.rawPackage.generation)
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

test("P4-owned compiler modules use captured collection and string intrinsics after module load", () => {
  const compiler = compilerSubject()
  const workflow = require("js-yaml").load(sourceFiles()["workflow.yaml"].toString("utf8"))
  workflow.steps = [{
    id: "review",
    title: "Review",
    type: "manual",
    required: true,
    prompt: "prompts/review.md",
    approval: {
      message: "Approve the result?",
      approveLabel: "Approve",
      rejectLabel: "Reject"
    },
    output: { kind: "value", id: "reviewResult", schema: "schemas/review.json", maxBytes: 4096 }
  }]
  const fixture = createLockedRawPackage({
    "workflow.yaml": workflowYamlText(workflow),
    "prompts/review.md": "Line one\r\nLine two\rLine three\n",
    "schemas/review.json": JSON.stringify({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "schemas/review.json",
      type: "object",
      properties: { decision: { type: "string", enum: ["approved", "rejected"] } },
      required: ["decision"],
      additionalProperties: false
    })
  })
  const audited = environment()
  const baseline = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: audited })
  assert.equal(baseline.ok, true)
  const originals = {
    map: Array.prototype.map,
    filter: Array.prototype.filter,
    sort: Array.prototype.sort,
    find: Array.prototype.find,
    replace: String.prototype.replace
  }
  const ownedModules = [
    "jsonSchemaCatalog", "jsonSchemaRole", "compilerFiles", "compilerReferences",
    "compilerSchemaRoles", "compilerEnvironment", "compilerBindings", "compiledPlan",
    "compilerWorkflow", "compiler", "index"
  ]
  const ownedCaller = new RegExp(
    "[\\\\/]out[\\\\/]core[\\\\/]contractV2[\\\\/](?:" + ownedModules.join("|") + ")\\.js:\\d+:\\d+\\)?$"
  )
  // Check the intrinsic's direct caller. Foundation and AJV can run beneath a P4 ancestor.
  const isOwnedCall = (stack) => ownedCaller.test(stack.split("\n")[2] ?? "")
  for (const separator of ["/", "\\"]) {
    const directory = ["fixture", "out", "core", "contractV2"].join(separator) + separator
    for (const module of ownedModules) {
      assert.equal(isOwnedCall("Error\n    at guarded (test.js:1:1)\n    at owned (" + directory + module + ".js:1:1)"), true)
    }
    for (const caller of [directory + "workflowLockBob.js", "node_modules" + separator + "ajv" + separator + "index.js"]) {
      assert.equal(isOwnedCall("Error\n    at guarded (test.js:1:1)\n    at dependency (" + caller + ":1:1)\n    at ancestor (" + directory + "compiler.js:1:1)"), false)
    }
  }
  let denied = 0
  const guarded = (original, name) => function (...args) {
    if (isOwnedCall(new Error().stack ?? "")) {
      denied += 1
      throw new Error("compiler used live " + name)
    }
    return Reflect.apply(original, this, args)
  }
  Array.prototype.map = guarded(originals.map, "Array.prototype.map")
  Array.prototype.filter = guarded(originals.filter, "Array.prototype.filter")
  Array.prototype.sort = guarded(originals.sort, "Array.prototype.sort")
  Array.prototype.find = guarded(originals.find, "Array.prototype.find")
  String.prototype.replace = guarded(originals.replace, "String.prototype.replace")
  try {
    // Synthetic source locations calibrate the real guard in this realm for both path styles.
    // A separate VM realm would have unpatched prototypes and would not test this guard.
    const controls = [
      ["Array.prototype.map", "[1].map(value => value)"],
      ["Array.prototype.filter", "[1].filter(value => value)"],
      ["Array.prototype.sort", "[2, 1].sort()"],
      ["Array.prototype.find", "[1].find(value => value)"],
      ["String.prototype.replace", "'a'.replace('a', 'b')"]
    ]
    for (const separator of ["/", "\\"]) {
      const filename = ["fixture", "out", "core", "contractV2", "compilerFiles.js"].join(separator)
      for (const [name, expression] of controls) {
        assert.throws(() => runInThisContext(expression, { filename }), (error) => error.message === "compiler used live " + name)
      }
    }
    assert.equal(denied, 10)
    const result = compiler.compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: audited })
    assert.equal(result.ok, true)
    assert.equal(denied, 10)
    assert.equal(result.handle.plan.prompts[0].text, "Line one\nLine two\nLine three\n")
    assert.equal(result.handle.plan.schemas.length, 1)
    assert.deepEqual(result.handle.plan, baseline.handle.plan)
    assert.equal(result.handle.planDigest, baseline.handle.planDigest)
  } finally {
    Array.prototype.map = originals.map
    Array.prototype.filter = originals.filter
    Array.prototype.sort = originals.sort
    Array.prototype.find = originals.find
    String.prototype.replace = originals.replace
  }
})
