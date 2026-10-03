const { workflowYamlText } = require("./workflowContractV2CompilerTestSupport")
const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  compilerSubject,
  createBobProfile,
  emptyBobBinding
} = require("./workflowContractV2CompilerTestSupport")
const {
  canonicalText,
  digestBytes,
  rawPackageFromFiles
} = require("./workflowContractV2LockTestSupport")

const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function schema(id, extra = {}) {
  return { $schema: DIALECT, $id: id, type: "object", ...extra }
}
function canonicalSchemaEvidence(value) {
  const bytes = Buffer.from(canonicalText(value), "utf8")
  return { id: value.$id, bytes: bytes.byteLength, digest: digestBytes(bytes) }
}
function workflow(outputSchema = "schemas/output.json") {
  return {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Provider workflow",
    description: "Runs a bound provider.",
    inputs: [],
    steps: [{
      id: "execute",
      title: "Execute",
      type: "command",
      required: true,
      provider: "example.provider",
      input: { source: "literal", value: {} },
      output: { kind: "value", id: "result", schema: outputSchema, maxBytes: 4096 },
      artifacts: []
    }],
    requiredArtifacts: [],
    resumePolicy: { mode: "fail-closed", maxAttempts: 1, retainCommittedOutputs: false, allowArtifactReuse: false },
    providers: [{
      id: "example.provider",
      version: "^1.0.0",
      inputSchema: "schemas/input.json",
      output: { kind: "value", schema: "schemas/output.json" },
      errorSchema: "schemas/error.json",
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: []
    }],
    bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
  }
}

function registerProvider(registry, version, documents, options = {}) {
  return registry.register({
    sourceId: options.sourceId ?? `test-${version}`,
    contract: {
      id: "example.provider",
      version,
      inputSchema: canonicalSchemaEvidence(documents.input),
      output: options.unit
        ? { kind: "unit" }
        : { kind: "value", schema: canonicalSchemaEvidence(options.output ?? documents.output) },
      errorSchema: canonicalSchemaEvidence(documents.error),
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: [],
      dispatch: options.dispatch ?? (() => { throw new Error("compiler must not dispatch") })
    }
  })
}

function providerFixture(options = {}) {
  const input = schema("schemas/input.json")
  const output = schema("schemas/output.json")
  const error = schema("schemas/error.json")
  const documents = { input, output, error }
  const { WorkflowProviderRegistry, bindWorkflowProvider } = require("../out/core/contractV2/providerRegistry.js")
  const registry = new WorkflowProviderRegistry()
  let dispatchCalls = 0
  const registration = registerProvider(registry, options.version ?? "1.2.3", documents, {
    dispatch() { dispatchCalls += 1; return {} }
  })
  if (options.extraProvider) options.extraProvider(registry, documents)
  const catalog = registry.snapshot()
  const requirement = {
    id: "example.provider",
    version: "^1.0.0",
    inputSchema: canonicalSchemaEvidence(input),
    output: { kind: "value", schema: canonicalSchemaEvidence(output) },
    errorSchema: canonicalSchemaEvidence(error),
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: []
  }
  const bound = bindWorkflowProvider({
    catalog,
    requirement,
    location: { path: "workflow.yaml", pointer: "/providers/0" }
  })
  if (!bound.ok) throw new Error("test provider did not bind")
  const files = {
    "workflow.yaml": Buffer.from(`${workflowYamlText(workflow())}`, "utf8"),
    "workflow.lock.json": Buffer.from("{}", "utf8"),
    "schemas/input.json": Buffer.from(`${JSON.stringify(input)}\n`, "utf8"),
    "schemas/output.json": Buffer.from(`${JSON.stringify(output)}\n`, "utf8"),
    "schemas/error.json": Buffer.from(`${JSON.stringify(error)}\n`, "utf8")
  }
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const initial = rawPackageFromFiles(files)
  const lock = lockModule.generateWorkflowPackageLock({
    rawPackage: initial,
    providers: [bound.lockEvidence],
    bob: emptyBobBinding()
  })
  files["workflow.lock.json"] = lockModule.encodeWorkflowPackageLock(lock)
  return {
    catalog,
    dispatchCalls: () => dispatchCalls,
    documents,
    lock,
    rawPackage: rawPackageFromFiles(files),
    registration,
    registry
  }
}

function environment(catalog) {
  return compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "runtime",
    providerCatalog: catalog,
    bobProfile: createBobProfile()
  })
}

test("compiler binds exact provider evidence and retains only the opaque dispatch handle privately", () => {
  const fixture = providerFixture()
  const result = compilerSubject().compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: environment(fixture.catalog)
  })
  assert.equal(result.ok, true)
  assert.equal(fixture.dispatchCalls(), 0)
  assert.equal(canonicalText(result.handle.plan.providerBindings), canonicalText(fixture.lock.providers))
  const privateState = require("../out/core/contractV2/compiledPlan.js").requireCompiledWorkflowPlanState(result.handle)
  assert.equal(privateState.providers.length, 1)
  assert.equal(privateState.providers[0].id, "example.provider")
  assert.equal(typeof privateState.providers[0].dispatchHandle, "object")
  assert.equal("dispatch" in privateState.providers[0], false)
  assert.equal("dispatch" in result.handle.plan.providerBindings[0], false)
})

test("unselected provider catalog entries and dispatch identities do not affect public plan evidence", () => {
  const first = providerFixture()
  const second = providerFixture({
    extraProvider(registry, documents) {
      registry.register({
        sourceId: "unselected",
        contract: {
          id: "unselected.provider",
          version: "9.9.9",
          inputSchema: canonicalSchemaEvidence(documents.input),
          output: { kind: "unit" },
          errorSchema: canonicalSchemaEvidence(documents.error),
          sideEffect: "none",
          idempotency: "idempotent",
          requiredCapabilities: [],
          dispatch() { throw new Error("unselected dispatch") }
        }
      })
    }
  })
  const compiler = compilerSubject()
  const firstResult = compiler.compileWorkflowPackage({ rawPackage: first.rawPackage, environment: environment(first.catalog) })
  const secondResult = compiler.compileWorkflowPackage({ rawPackage: second.rawPackage, environment: environment(second.catalog) })
  assert.equal(firstResult.ok, true)
  assert.equal(secondResult.ok, true)
  assert.deepEqual(firstResult.handle.plan, secondResult.handle.plan)
  assert.equal(firstResult.handle.planDigest, secondResult.handle.planDigest)
})

test("highest matching provider contract mismatch fails without lower-version fallback", () => {
  const input = schema("schemas/input.json")
  const output = schema("schemas/output.json")
  const changedOutput = schema("schemas/output.json", { properties: { changed: { type: "boolean" } } })
  const error = schema("schemas/error.json")
  const documents = { input, output, error }
  const { WorkflowProviderRegistry } = require("../out/core/contractV2/providerRegistry.js")
  const registry = new WorkflowProviderRegistry()
  registerProvider(registry, "1.0.0", documents)
  registerProvider(registry, "1.2.0", documents, { output: changedOutput })
  const files = {
    "workflow.yaml": Buffer.from(`${workflowYamlText(workflow())}`, "utf8"),
    "workflow.lock.json": Buffer.from("{}", "utf8"),
    "schemas/input.json": Buffer.from(`${JSON.stringify(input)}\n`, "utf8"),
    "schemas/output.json": Buffer.from(`${JSON.stringify(output)}\n`, "utf8"),
    "schemas/error.json": Buffer.from(`${JSON.stringify(error)}\n`, "utf8")
  }
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const initial = rawPackageFromFiles(files)
  const lock = lockModule.generateWorkflowPackageLock({ rawPackage: initial, providers: [], bob: emptyBobBinding() })
  files["workflow.lock.json"] = lockModule.encodeWorkflowPackageLock(lock)
  const result = compilerSubject().compileWorkflowPackage({
    rawPackage: rawPackageFromFiles(files),
    environment: environment(registry.snapshot())
  })
  assert.equal(result.ok, false)
  assert.equal(result.diagnostics[0].code, "WF2_PROVIDER_CONTRACT_MISMATCH")
  assert.match(result.diagnostics[0].location.pointer, /^\/providers\/0\/output/)
})

test("command output kind or full schema identity mismatch fails before lock verification", async (t) => {
  const fixture = providerFixture()
  const files = Object.fromEntries(fixture.rawPackage.files.map((file) => [file.path, Buffer.from(file.bytes)]))
  const base = workflow()
  const cases = [
    ["kind", { ...base, steps: [{ ...base.steps[0], output: { kind: "unit" } }] }, "/steps/0/output"],
    ["schema", { ...base, steps: [{ ...base.steps[0], output: { ...base.steps[0].output, schema: "schemas/input.json" } }] }, "/steps/0/output/schema"]
  ]
  for (const [name, document, pointer] of cases) await t.test(name, () => {
    const changed = { ...files, "workflow.yaml": Buffer.from(`${workflowYamlText(document)}`, "utf8") }
    const lockModule = require("../out/core/contractV2/workflowLock.js")
    const placeholder = rawPackageFromFiles({ ...changed, "workflow.lock.json": Buffer.from("{}") })
    const staleLock = lockModule.generateWorkflowPackageLock({ rawPackage: placeholder, providers: [], bob: emptyBobBinding() })
    changed["workflow.lock.json"] = lockModule.encodeWorkflowPackageLock(staleLock)
    const result = compilerSubject().compileWorkflowPackage({ rawPackage: rawPackageFromFiles(changed), environment: environment(fixture.catalog) })
    assert.equal(result.ok, false)
    assert.equal(result.diagnostics[0].location.pointer, pointer)
  })
})

test("compiled handles retain their bound provider generation after registry disposal and re-registration", () => {
  const fixture = providerFixture()
  const compiler = compilerSubject()
  const originalEnvironment = environment(fixture.catalog)
  const original = compiler.compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: originalEnvironment
  })
  assert.equal(original.ok, true)
  const compiledPlan = require("../out/core/contractV2/compiledPlan.js")
  const originalState = compiledPlan.requireCompiledWorkflowPlanState(original.handle)
  const originalDispatchHandle = originalState.providers[0].dispatchHandle
  const originalPlan = original.handle.plan

  fixture.registration.dispose()
  registerProvider(fixture.registry, "1.2.3", fixture.documents, {
    dispatch() { throw new Error("replacement dispatch must not alter an existing handle") }
  })
  const replacementEnvironment = environment(fixture.registry.snapshot())
  const replacement = compiler.compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment: replacementEnvironment
  })
  assert.equal(replacement.ok, true)
  const replacementState = compiledPlan.requireCompiledWorkflowPlanState(replacement.handle)

  assert.equal(compiledPlan.requireCompiledWorkflowPlanState(original.handle), originalState)
  assert.equal(originalState.providers[0].dispatchHandle, originalDispatchHandle)
  assert.notEqual(replacementState.providers[0].dispatchHandle, originalDispatchHandle)
  assert.equal(original.handle.plan, originalPlan)
  assert.deepEqual(replacement.handle.plan, original.handle.plan)
  assert.equal(replacement.handle.planDigest, original.handle.planDigest)
  assert.equal(fixture.dispatchCalls(), 0)
})
