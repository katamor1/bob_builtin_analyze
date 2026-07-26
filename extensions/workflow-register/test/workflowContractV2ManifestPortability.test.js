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
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifestPackage({
      collection: "collections/CON",
      slot: "minimal",
      generation: fixture.rawPackage.generation,
      handle
    }),
    /portable/i
  )
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifestPackage({
      collection: "collections/a:b",
      slot: "minimal",
      generation: fixture.rawPackage.generation,
      handle
    }),
    /portable/i
  )
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
  const cli = require("../scripts/compile-workflow-contract-v2-packages.js")
  const environment = require("../scripts/lib/workflow-contract-v2-environment.js")
  assert.throws(
    () => cli.normalizeCollections(["Collections/A", "collections/a"]),
    /unique|alias/i
  )
  assert.throws(
    () => cli.normalizeSlotNames(["Alpha", "alpha"]),
    /alias/i
  )
  assert.throws(
    () => environment.repositoryRelativePath("collections/CON", "collection"),
    /portable/i
  )
})

test("manifest control files reject symbolic-link path components", async (t) => {
  const environment = require("../scripts/lib/workflow-contract-v2-environment.js")
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-manifest-symlink-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
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
