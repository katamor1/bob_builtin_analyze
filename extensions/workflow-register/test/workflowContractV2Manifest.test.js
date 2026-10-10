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
  t.after(() => { assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)); assert.equal(fs.lstatSync(root).isSymbolicLink(), false); fs.rmSync(root, { recursive: true, force: true }) })
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
test("manifest CLI produces identical bytes for permuted explicit collection order and collection-list input", async (t) => {
  const root = createCliRepository(t)
  const cli = cliSubject()
  const outputA = path.join(root, "manifest-a.json")
  const outputB = path.join(root, "manifest-b.json")
  const outputC = path.join(root, "manifest-c.json")
  const common = [
    "--root", root,
    "--provider-catalog", "providers.json"
  ]
  await cli.main([
    ...common,
    "--collection", "collections/z",
    "--collection", "collections/a",
    "--manifest", outputA
  ])
  await cli.main([
    ...common,
    "--collection", "collections/a",
    "--collection", "collections/z",
    "--manifest", outputB
  ])
  await cli.main([
    ...common,
    "--collections", "collections.json",
    "--manifest", outputC
  ])
  const bytesA = fs.readFileSync(outputA)
  assert.deepEqual(fs.readFileSync(outputB), bytesA)
  assert.deepEqual(fs.readFileSync(outputC), bytesA)
  const manifest = JSON.parse(bytesA.toString("utf8"))
  assert.deepEqual(manifest.packages.map((entry) => [entry.collection, entry.slot]), [
    ["collections/a", "minimal"],
    ["collections/z", "minimal"]
  ])
  assert.equal(manifest.packages[0].generation, manifest.packages[0].packageDigest)
})

test("manifest CLI rejects implicit discovery, overlapping roots, and noncanonical provider input", async (t) => {
  const root = createCliRepository(t)
  const cli = cliSubject()
  assert.throws(
    () => cli.parseArguments([
      "--root", root,
      "--provider-catalog", "providers.json",
      "--manifest", path.join(root, "missing.json")
    ]),
    /collection/i
  )
  assert.throws(
    () => cli.normalizeCollections(["collections", "collections-extra", "collections/a"]),
    /overlap/i
  )
  fs.writeFileSync(path.join(root, "noncanonical.json"), JSON.stringify(PROVIDER_CATALOG, null, 2))
  await assert.rejects(
    () => cli.main([
      "--root", root,
      "--collection", "collections/a",
      "--provider-catalog", "noncanonical.json",
      "--manifest", path.join(root, "noncanonical-output.json")
    ]),
    /canonical JSON/i
  )
})

test("manifest is written only after every package compiles", async (t) => {
  const root = createCliRepository(t)
  const cli = cliSubject()
  const pointer = JSON.parse(fs.readFileSync(path.join(root, "collections/z/minimal/current.json"), "utf8"))
  const generationName = require("../out/core/contractV2/packageGenerationPath.js")
    .workflowPackageGenerationDirectoryName(pointer.generation)
  fs.appendFileSync(path.join(root, "collections/z/minimal/versions", generationName, "workflow.yaml"), "# drift\n")
  const output = path.join(root, "must-not-exist.json")
  await assert.rejects(
    () => cli.main([
      "--root", root,
      "--collection", "collections/a",
      "--collection", "collections/z",
      "--provider-catalog", "providers.json",
      "--manifest", output
    ])
  )
  assert.equal(fs.existsSync(output), false)
})

function cliSubject() {
  let value = {}
  try { value = require("../scripts/compile-workflow-contract-v2-packages.js") }
  catch (error) { if (error.code !== "MODULE_NOT_FOUND" || !error.message.includes("compile-workflow-contract-v2-packages.js")) throw error }
  assert.equal(typeof value.main, "function", "P7 explicit manifest CLI is not implemented")
  return value
}

test("manifest rename failure preserves existing output bytes", async (t) => {
  const root = createCliRepository(t), output = path.join(root, "prior.json")
  cliSubject(); const cliPath = require.resolve("../scripts/compile-workflow-contract-v2-packages.js")
  const fsp = require("node:fs/promises"), original = fsp.rename
  for (const code of ["EPERM", "EEXIST"]) {
    fs.writeFileSync(output, "prior complete manifest")
    fsp.rename = async () => { const error = new Error("injected rename failure"); error.code = code; throw error }
    delete require.cache[cliPath]
    try {
      await assert.rejects(() => cliSubject().main([
        "--root", root, "--collection", "collections/a", "--provider-catalog", "providers.json", "--manifest", output
      ]), (error) => error.code === code)
      assert.equal(fs.existsSync(output), true, "prior manifest must survive rename failure"); assert.equal(fs.readFileSync(output, "utf8"), "prior complete manifest")
      assert.equal(fs.readdirSync(root).some(name => name.includes(".tmp-")), false)
    } finally { fsp.rename = original; delete require.cache[cliPath] }
  }
})

test("exclusive output collision retains a peer-owned temporary file", async (t) => {
  const root = createCliRepository(t), output = path.join(root, "collision.json")
  cliSubject(); const cliPath = require.resolve("../scripts/compile-workflow-contract-v2-packages.js")
  const fsp = require("node:fs/promises"), originalOpen = fsp.open, originalWrite = fsp.writeFile
  let peer
  const collision = (file) => { peer = file; fs.writeFileSync(file, "peer-owned data"); const error = new Error("exclusive collision"); error.code = "EEXIST"; throw error }
  fsp.open = async (file, flags, ...args) => flags === "wx" ? collision(file) : originalOpen(file, flags, ...args)
  fsp.writeFile = async (file, data, options) => options?.flag === "wx" ? collision(file) : originalWrite(file, data, options)
  delete require.cache[cliPath]
  try {
    await assert.rejects(() => cliSubject().main([
      "--root", root, "--collection", "collections/a", "--provider-catalog", "providers.json", "--manifest", output
    ]), (error) => error.code === "EEXIST")
    assert.equal(fs.existsSync(peer), true, "peer-owned temp must survive exclusive collision"); assert.equal(fs.readFileSync(peer, "utf8"), "peer-owned data")
    assert.equal(fs.existsSync(output), false)
  } finally { fsp.open = originalOpen; fsp.writeFile = originalWrite; delete require.cache[cliPath] }
})