const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  canonicalDigest,
  compilerSubject,
  createBobProfile,
  createEmptyProviderCatalog,
  createLockedRawPackage
} = require("./workflowContractV2CompilerTestSupport")

const PROVIDER_CATALOG = {
  schemaVersion: "workflow-provider-catalog-source/v1",
  providers: []
}
const COLLECTIONS_SCHEMA_VERSION = "workflow-contract-v2-collections/v1"

function manifestSubject() {
  const subject = require("../out/core/contractV2/index.js"); assert.equal(typeof subject.createCompiledWorkflowPlanManifest, "function", "P7 manifest API is not implemented"); return subject
}

function compileFixture(overrides = {}) {
  const fixture = createLockedRawPackage()
  const environment = compilerSubject().createAuditedWorkflowCompilerEnvironment({
    purpose: "evidence",
    providerCatalog: createEmptyProviderCatalog(),
    bobProfile: createBobProfile()
  })
  const rawPackage = { ...fixture.rawPackage, ...overrides }
  const result = compilerSubject().compileWorkflowPackage({ rawPackage, environment })
  assert.equal(result.ok, true)
  return { fixture, handle: result.handle, rawPackage }
}

function canonicalLine(value) {
  const bytes = require("../out/core/contractV2/canonicalJson.js").canonicalJsonBytes(value)
  return Buffer.concat([bytes, Buffer.from("\n", "utf8")])
}

function materializeCollection(repositoryRoot, collection, slot = "minimal") {
  const fixture = createLockedRawPackage()
  const generationName = require("../out/core/contractV2/packageGenerationPath.js")
    .workflowPackageGenerationDirectoryName(fixture.rawPackage.generation)
  const slotRoot = path.join(repositoryRoot, ...collection.split("/"), slot)
  const generationRoot = path.join(slotRoot, "versions", generationName)
  fs.mkdirSync(generationRoot, { recursive: true })
  for (const [logicalPath, bytes] of Object.entries(fixture.files)) {
    const target = path.join(generationRoot, ...logicalPath.split("/"))
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, bytes)
  }
  fs.writeFileSync(path.join(slotRoot, "current.json"), canonicalLine({
    schemaVersion: "workflow-package-pointer/v1",
    workflowId: slot,
    generation: fixture.rawPackage.generation,
    packageDigest: fixture.rawPackage.packageDigest
  }))
  return fixture
}

function createCliRepository(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-contract-v2-manifest-"))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  materializeCollection(root, "collections/z")
  materializeCollection(root, "collections/a")
  fs.writeFileSync(path.join(root, "providers.json"), canonicalLine(PROVIDER_CATALOG))
  fs.writeFileSync(path.join(root, "collections.json"), canonicalLine({
    schemaVersion: COLLECTIONS_SCHEMA_VERSION,
    collections: ["collections/z", "collections/a"]
  }))
  return root
}

test("compiled-plan manifest is canonical, sorted by collection and slot, and detached", () => {
  const subject = manifestSubject()
  const { handle, rawPackage } = compileFixture()
  const right = subject.createCompiledWorkflowPlanManifestPackage({
    collection: "z/workflows",
    slot: "minimal",
    generation: rawPackage.generation,
    handle
  })
  const left = subject.createCompiledWorkflowPlanManifestPackage({
    collection: "a/workflows",
    slot: "minimal",
    generation: rawPackage.generation,
    handle
  })
  const manifest = subject.createCompiledWorkflowPlanManifest({ packages: [right, left] })
  assert.deepEqual(manifest.packages.map((entry) => [entry.collection, entry.slot]), [
    ["a/workflows", "minimal"],
    ["z/workflows", "minimal"]
  ])
  assert.equal(manifest.packages[0].planDigest, canonicalDigest(handle.plan))
  assert.equal(Object.isFrozen(manifest), true)
  assert.equal(Object.isFrozen(manifest.packages), true)
  assert.equal(Object.isFrozen(manifest.packages[0]), true)
  const encoded = subject.encodeCompiledWorkflowPlanManifest(manifest)
  assert.equal(encoded.at(-1), 0x0a)
  assert.equal(encoded.subarray(0, -1).toString("utf8"), require("../out/core/contractV2/canonicalJson.js").canonicalJsonText(manifest))
})

test("manifest rejects duplicate pairs, unsafe collection paths, staging handles, and generation drift", () => {
  const subject = manifestSubject()
  const { handle, rawPackage } = compileFixture()
  const entry = subject.createCompiledWorkflowPlanManifestPackage({
    collection: "collections/a",
    slot: "minimal",
    generation: rawPackage.generation,
    handle
  })
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifest({ packages: [entry, entry] }),
    /duplicate collection and slot pair/i
  )
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifest({ packages: [{ ...entry, collection: "../escape" }] }),
    /repository-relative|segment/i
  )
  const staging = compileFixture({ publication: "staging", generation: ".staging-manifest" })
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifestPackage({
      collection: "collections/a",
      slot: "minimal",
      generation: rawPackage.generation,
      handle: staging.handle
    }),
    /identity/i
  )
  const otherDigest = `sha256:${"f".repeat(64)}`
  assert.throws(
    () => subject.createCompiledWorkflowPlanManifestPackage({
      collection: "collections/a",
      slot: "minimal",
      generation: otherDigest,
      handle
    }),
    /identity/i
  )
})


test("compiled-plan manifest emits hand-reviewed canonical bytes", () => {
  const subject = manifestSubject()
  const digest = (c) => `sha256:${c.repeat(64)}`
  const entry = {
    collection: "a/workflows", slot: "minimal", generation: digest("a"),
    packageDigest: digest("a"), environmentDigest: digest("b"),
    lockfileDigest: digest("c"), planDigest: digest("d")
  }
  const input = { packages: [entry] }
  const manifest = subject.createCompiledWorkflowPlanManifest(input)
  input.packages.length = 0
  entry.slot = "changed"
  const expected = `{"compilerContractVersion":"workflow-register-compiler/v2","packages":[{"collection":"a/workflows","environmentDigest":"${digest("b")}","generation":"${digest("a")}","lockfileDigest":"${digest("c")}","packageDigest":"${digest("a")}","planDigest":"${digest("d")}","slot":"minimal"}],"schemaVersion":"workflow-compiled-plan-manifest/v1"}\n`
  assert.equal(subject.encodeCompiledWorkflowPlanManifest(manifest).toString("utf8"), expected)
})

test("manifest rejects active inputs without invoking their getters", () => {
  const subject = manifestSubject()
  let reads = 0
  const active = Object.defineProperty({}, "packages", { enumerable: true, get() { reads += 1; return [] } })
  for (const input of [active, new Proxy({ packages: [] }, {}), { packages: [], extra: true }, { packages: new Array(1) }]) {
    assert.throws(() => subject.createCompiledWorkflowPlanManifest(input))
  }
  assert.equal(reads, 0)
  const { handle, rawPackage } = compileFixture()
  assert.throws(() => subject.createCompiledWorkflowPlanManifestPackage({
    collection: "a/workflows", slot: "different", generation: rawPackage.generation, handle
  }))
  assert.throws(() => subject.createCompiledWorkflowPlanManifestPackage({
    collection: "a/workflows", slot: "minimal", generation: rawPackage.generation, handle: { ...handle }
  }))
})