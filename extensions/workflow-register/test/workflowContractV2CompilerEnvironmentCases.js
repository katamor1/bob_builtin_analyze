const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
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

  const bob = require("../out/core/contractV2/bobProfile.js")
  let hostCalls = 0
  const liveExport = { registerSource() { hostCalls += 1; throw new Error("must not activate Bob") } }
  const task = Object.fromEntries(
    ["getAllMetadata", "getMessages", "sendMessage", "setStepComplete", "startSubagent"]
      .map((name) => [name, () => { hostCalls += 1; throw new Error("must not invoke Bob task") }])
  )
  const fixture = createLockedRawPackage()
  for (const version of ["2.1.0", "2.1.0+build.42"]) {
    const bound = bob.bindBobCapabilities({
      extensionId: "IBM.bob-code", extensionVersion: version,
      expectedProfileDigest: bob.BOB_2_0_1_PROFILE_DIGEST, liveExport
    })
    assert.equal(bound.extensionVersion, version)
    const probed = bob.probeBobTaskCapabilities({ expectedProfileDigest: bob.BOB_2_0_1_PROFILE_DIGEST, task })
    assert.equal(probed.taskCapabilities.includes("task.toSerializable"), false)
    assert.throws(() => bob.probeBobTaskCapabilities({
      expectedProfileDigest: bob.BOB_2_0_1_PROFILE_DIGEST, task, requiredCapabilities: ["task.toSerializable"]
    }), /toSerializable/)
    const profile = bob.snapshotBobContractProfile(liveExport)
    const compatible = createAuditedWorkflowCompilerEnvironment({ purpose: "runtime", providerCatalog, bobProfile: profile })
    assert.equal(profile.profile, bob.BOB_2_0_1_PROFILE)
    assert.equal(profile.profileDigest, bob.BOB_2_0_1_PROFILE_DIGEST)
    assert.deepEqual(profile.capabilities, bob.BOB_2_0_1_CAPABILITIES)
    const compiled = compilerSubject().compileWorkflowPackage({ rawPackage: fixture.rawPackage, environment: compatible })
    assert.equal(compiled.ok, true)
    assert.equal(compiled.handle.plan.bobProfileBinding.profile, "bob/2.0.1")
    assert.equal(compiled.handle.plan.bobProfileBinding.extensionVersion, "2.0.1")
    assert.throws(() => createAuditedWorkflowCompilerEnvironment({
      purpose: "runtime", providerCatalog, bobProfile: bound
    }), TypeError)
    assert.throws(() => createAuditedWorkflowCompilerEnvironment({
      purpose: "runtime", providerCatalog,
      bobProfile: { ...profile, capabilities: profile.capabilities.filter((name) => name !== "task.toSerializable") }
    }), TypeError)
  }
  assert.equal(hostCalls, 0)
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
