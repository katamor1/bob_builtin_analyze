const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

function compileFixture() {
  const fixture = createLockedRawPackage()
  const environment = compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "evidence",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  const result = compilerSubject().compileWorkflowPackage({
    rawPackage: fixture.rawPackage,
    environment
  })
  assert.equal(result.ok, true)
  return { fixture, handle: result.handle }
}

test("manifest rejects cross-platform aliases, non-portable paths, and generation drift", () => {
  const subject = require("../out/core/contractV2/compiledPlanManifest.js")
  const { fixture, handle } = compileFixture()
  const upper = subject.createCompiledWorkflowPlanManifestPackage({
    collection: "Collections/A",
    slot: "minimal",
    generation: fixture.rawPackage.generation,
    handle
  })
  const lower = subject.createCompiledWorkflowPlanManifestPackage({
    collection: "collections/a",
    slot: "minimal",
    generation: fixture.rawPackage.generation,
    handle
  })
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifest({ packages: [upper, lower] }),
    /alias/i
  )
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifest({
      packages: [{ ...lower, packageDigest: `sha256:${"f".repeat(64)}` }]
    }),
    /generation.*package digest/i
  )
  for (const collection of ["collections/CON", "collections/a:b", "collections/ſample"]) {
    assert.throws(
      () => subject.createCompiledWorkflowPlanManifestPackage({
        collection,
        slot: "minimal",
        generation: fixture.rawPackage.generation,
        handle
      }),
      /portable/i
    )
  }
})

test("manifest captures canonical encoding and private-state readers at module load", () => {
  const canonical = require("../out/core/contractV2/canonicalJson.js")
  const compiledPlan = require("../out/core/contractV2/compiledPlan.js")
  const subject = require("../out/core/contractV2/compiledPlanManifest.js")
  const { fixture, handle } = compileFixture()
  const entry = subject.createCompiledWorkflowPlanManifestPackage({
    collection: "collections/a",
    slot: "minimal",
    generation: fixture.rawPackage.generation,
    handle
  })
  const manifest = subject.createCompiledWorkflowPlanManifest({ packages: [entry] })
  const originalCanonical = canonical.canonicalJsonBytes
  const originalState = compiledPlan.requireCompiledWorkflowPlanState
  canonical.canonicalJsonBytes = () => { throw new Error("ambient canonical replacement") }
  compiledPlan.requireCompiledWorkflowPlanState = () => { throw new Error("ambient state replacement") }
  try {
    assert.equal(subject.encodeCompiledWorkflowPlanManifest(manifest).at(-1), 0x0a)
    assert.doesNotThrow(() => subject.createCompiledWorkflowPlanManifestPackage({
      collection: "collections/b",
      slot: "minimal",
      generation: fixture.rawPackage.generation,
      handle
    }))
  } finally {
    canonical.canonicalJsonBytes = originalCanonical
    compiledPlan.requireCompiledWorkflowPlanState = originalState
  }
})

test("manifest CLI rejects case-folded collection and slot aliases", () => {
  let cli = {}; try { cli = require("../scripts/compile-workflow-contract-v2-packages.js") } catch (error) { if (error.code !== "MODULE_NOT_FOUND") throw error } assert.equal(typeof cli.main, "function", "P7 explicit manifest CLI is not implemented")
  const environment = require("../scripts/lib/workflow-contract-v2-environment.js")
  assert.throws(
    () => cli.normalizeCollections(["Collections/A", "collections/a"]),
    /unique|alias/i
  )
  assert.throws(
    () => cli.normalizeSlotNames(["Alpha", "alpha"]),
    /alias/i
  )
  for (const collection of ["collections/CON", "collections/ſample"]) {
    assert.throws(
      () => environment.repositoryRelativePath(collection, "collection"),
      /portable/i
    )
  }
})

test("manifest control files reject symbolic-link path components", async (t) => {
  const environment = require("../scripts/lib/workflow-contract-v2-environment.js")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-manifest-symlink-"))
  t.after(() => { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.equal(fs.lstatSync(root).isSymbolicLink(), false); fs.rmSync(root, { recursive: true, force: true }) })
  const real = path.join(root, "real")
  const linked = path.join(root, "linked")
  fs.mkdirSync(real)
  fs.writeFileSync(
    path.join(real, "providers.json"),
    '{"providers":[],"schemaVersion":"workflow-provider-catalog-source/v1"}\n'
  )
  try {
    fs.symlinkSync(real, linked, process.platform === "win32" ? "junction" : "dir")
  } catch (error) {
    if (error && (error.code === "EPERM" || error.code === "EACCES")) {
      t.skip("symbolic-link creation is unavailable on this host")
      return
    }
    throw error
  }
  const repositoryRoot = await environment.canonicalRepositoryRoot(root)
  await assert.rejects(
    () => environment.readCanonicalJsonFile(
      repositoryRoot,
      "linked/providers.json",
      "Workflow provider catalog"
    ),
    /symbolic-link/i
  )
})

test("manifest environment captures the F6 registry methods at module load", async (t) => {
  const canonical = require("../out/core/contractV2/canonicalJson.js")
  const environment = require("../scripts/lib/workflow-contract-v2-environment.js")
  const providerRegistry = require("../out/core/contractV2/providerRegistry.js")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-manifest-registry-"))
  t.after(() => { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.equal(fs.lstatSync(root).isSymbolicLink(), false); fs.rmSync(root, { recursive: true, force: true }) })
  const digest = (character) => `sha256:${character.repeat(64)}`
  const document = {
    schemaVersion: "workflow-provider-catalog-source/v1",
    providers: [{
      id: "sample.provider",
      version: "1.0.0",
      inputSchema: { id: "schemas/input.json", bytes: 2, digest: digest("a") },
      output: { kind: "unit" },
      errorSchema: { id: "schemas/error.json", bytes: 2, digest: digest("b") },
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: []
    }]
  }
  fs.writeFileSync(
    path.join(root, "providers.json"),
    Buffer.concat([canonical.canonicalJsonBytes(document), Buffer.from("\n", "utf8")])
  )
  const originalRegister = providerRegistry.WorkflowProviderRegistry.prototype.register
  const originalSnapshot = providerRegistry.WorkflowProviderRegistry.prototype.snapshot
  providerRegistry.WorkflowProviderRegistry.prototype.register = () => {
    throw new Error("ambient register replacement")
  }
  providerRegistry.WorkflowProviderRegistry.prototype.snapshot = () => {
    throw new Error("ambient snapshot replacement")
  }
  try {
    await assert.doesNotReject(() => environment.createWorkflowContractV2EvidenceEnvironment({
      repositoryRoot: root,
      providerCatalogPath: "providers.json"
    }))
  } finally {
    providerRegistry.WorkflowProviderRegistry.prototype.register = originalRegister
    providerRegistry.WorkflowProviderRegistry.prototype.snapshot = originalSnapshot
  }
})
