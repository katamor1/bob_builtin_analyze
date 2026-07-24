const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog
} = require("./workflowContractV2CompilerTestSupport")

test("audited compiler environments are opaque frozen and distinct per constructor call", () => {
  const { createAuditedWorkflowCompilerEnvironment } = compilerSubject()
  const providerCatalog = createEmptyProviderCatalog()
  const bobProfile = createBobProfile()
  const runtimeA = createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog,
    bobProfile
  })
  const runtimeB = createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog,
    bobProfile
  })
  const authoring = createAuditedWorkflowCompilerEnvironment({
    purpose: "authoring-validation",
    providerCatalog,
    bobProfile
  })
  const evidence = createAuditedWorkflowCompilerEnvironment({
    purpose: "evidence",
    providerCatalog,
    bobProfile
  })

  for (const environment of [runtimeA, runtimeB, authoring, evidence]) {
    assert.equal(Object.isFrozen(environment), true)
    assert.deepEqual(Object.keys(environment), [])
    assert.equal(JSON.stringify(environment), "{}")
    assert.equal("purpose" in environment, false)
    assert.equal("providerCatalog" in environment, false)
    assert.equal("bobProfile" in environment, false)
    assert.equal("leaseable" in environment, false)
  }
  assert.notEqual(runtimeA, runtimeB)
  assert.notEqual(runtimeA, authoring)
  assert.notEqual(authoring, evidence)
})

test("compiler environment rejects forged catalogs and profile drift without invoking accessors", () => {
  const { createAuditedWorkflowCompilerEnvironment } = compilerSubject()
  const bobProfile = createBobProfile()
  let catalogGetterCalls = 0
  const fakeCatalog = {}
  Object.defineProperty(fakeCatalog, "evidence", {
    enumerable: true,
    get() {
      catalogGetterCalls += 1
      throw new Error("must not inspect forged catalog evidence")
    }
  })
  assert.throws(() => createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: fakeCatalog,
    bobProfile
  }), TypeError)
  assert.equal(catalogGetterCalls, 0)

  let profileGetterCalls = 0
  const fakeProfile = {}
  Object.defineProperty(fakeProfile, "profileDigest", {
    enumerable: true,
    get() {
      profileGetterCalls += 1
      return "sha256:invalid"
    }
  })
  assert.throws(() => createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: fakeProfile
  }), TypeError)
  assert.equal(profileGetterCalls, 0)

})

test("compiler environment rejects unknown purposes and hostile outer inputs", () => {
  const { createAuditedWorkflowCompilerEnvironment } = compilerSubject()
  const input = {
    purpose: "runtime",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  }
  assert.throws(() => createAuditedWorkflowCompilerEnvironment({
    ...input,
    purpose: "preview"
  }), /purpose|runtime|authoring|evidence/i)

  let traps = 0
  const proxy = new Proxy(input, {
    get() { traps += 1; throw new Error("must not read proxy") },
    ownKeys() { traps += 1; throw new Error("must not inspect proxy") }
  })
  assert.throws(() => createAuditedWorkflowCompilerEnvironment(proxy), TypeError)
  assert.equal(traps, 0)
})

test("non-runtime environments replace executable provider snapshots with compile-only catalogs", () => {
  const { WorkflowProviderRegistry, bindWorkflowProvider } = require("../out/core/contractV2/providerRegistry.js")
  const registry = new WorkflowProviderRegistry()
  const schema = { id: "schemas/provider.json", bytes: 2, digest: `sha256:${"1".repeat(64)}` }
  registry.register({
    sourceId: "test.compiler",
    contract: {
      id: "example.provider",
      version: "1.0.0",
      inputSchema: schema,
      output: { kind: "unit" },
      errorSchema: schema,
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: [],
      dispatch() { throw new Error("live dispatch must remain runtime-only") }
    }
  })
  const catalog = registry.snapshot()
  const compiler = compilerSubject()
  const runtime = compiler.createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: catalog,
    bobProfile: createBobProfile()
  })
  const authoring = compiler.createAuditedWorkflowCompilerEnvironment({
    purpose: "authoring-validation",
    providerCatalog: catalog,
    bobProfile: createBobProfile()
  })
  const environmentModule = require("../out/core/contractV2/compilerEnvironment.js")
  const runtimeState = environmentModule.requireWorkflowCompilerEnvironmentState(runtime)
  const authoringState = environmentModule.requireWorkflowCompilerEnvironmentState(authoring)
  assert.equal(runtimeState.providerCatalog, catalog)
  assert.notEqual(authoringState.providerCatalog, catalog)
  assert.deepEqual(authoringState.providerCatalog.evidence, catalog.evidence)

  const requirement = {
    id: "example.provider",
    version: "1.0.0",
    inputSchema: schema,
    output: { kind: "unit" },
    errorSchema: schema,
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: []
  }
  const location = { path: "workflow.yaml", pointer: "/providers/0" }
  const live = bindWorkflowProvider({ catalog: runtimeState.providerCatalog, requirement, location })
  const compileOnly = bindWorkflowProvider({ catalog: authoringState.providerCatalog, requirement, location })
  assert.equal(live.ok, true)
  assert.equal(compileOnly.ok, true)
  assert.notEqual(live.dispatchHandle, compileOnly.dispatchHandle)
  assert.deepEqual(live.lockEvidence, compileOnly.lockEvidence)
})
