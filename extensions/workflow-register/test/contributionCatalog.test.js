"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const Ajv = require("ajv")

const { buildWorkflowContributionCatalog } = require("../out/core/contributionCatalog")
const { discoverContributionManifests } = require("../scripts/discover-tracked-workflows")

const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
const fixtureRoot = path.join(__dirname, "fixtures", "workflow-contributions")
const fixtureContext = Object.freeze({
  expectedOwner: Object.freeze({ id: "local.sample-extension", version: "1.2.3" }),
  ownerDirectory: "extensions/sample-extension"
})

function readFixture(name = "valid.json") {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8"))
}

function fixtureContent(name = "valid.json") {
  return fs.readFileSync(path.join(fixtureRoot, name), "utf8")
}

function mutateManifestContent(content, mutate) {
  const manifest = JSON.parse(String(content))
  mutate(manifest)
  return JSON.stringify(manifest)
}

function fixtureEntry(overrides = {}) {
  return {
    manifestPath: "extensions/sample-extension/contracts/workflow-contributions.json",
    manifestContent: fixtureContent(),
    context: fixtureContext,
    readContent: (repositoryPath) => `fixture content for ${repositoryPath}`,
    ...overrides
  }
}

function secondEntry(overrides = {}) {
  const manifest = readFixture()
  manifest.owner = { id: "local.second-extension", version: "1.0.0" }
  manifest.workflow_templates = []
  manifest.workflow_claims = []
  manifest.workflow_exclusions = []
  manifest.external_commands = []
  manifest.schemas = []
  manifest.action_providers = []
  manifest.preflight_checks = []
  manifest.result_sinks = []
  delete manifest.agent_provider
  return fixtureEntry({
    manifestPath: "extensions/second-extension/contracts/workflow-contributions.json",
    manifest,
    manifestContent: JSON.stringify(manifest),
    context: {
      expectedOwner: manifest.owner,
      ownerDirectory: "extensions/second-extension"
    },
    ...overrides
  })
}

test("catalog rejects a missing manifest set", () => {
  assert.throws(
    () => buildWorkflowContributionCatalog([]),
    /at least one manifest/i
  )
})

test("catalog rejects manifests that fail the authoritative manifest contract", () => {
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry({ manifestContent: fixtureContent("invalid-range.json") })]),
    /registry\.invalid_range/i
  )
})

test("catalog rejects duplicate owners and contribution IDs across kinds", () => {
  const duplicateOwner = secondEntry()
  duplicateOwner.manifestContent = mutateManifestContent(duplicateOwner.manifestContent, (manifest) => {
    manifest.owner = fixtureContext.expectedOwner
  })
  duplicateOwner.context = fixtureContext
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry(), duplicateOwner]),
    /duplicate owner/i
  )

  const collision = secondEntry()
  collision.manifestContent = mutateManifestContent(collision.manifestContent, (manifest) => {
    manifest.preflight_checks = [{
      id: "sample.collect",
      contract_version: "second.workspace-ready/v1",
      result_schema: "sample.collect-input"
    }]
    manifest.schemas = [{
      id: "sample.collect-input",
      path: "extensions/second-extension/schema/input.json"
    }]
  })
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry(), collision]),
    /cross-kind collision.*sample\.collect/i
  )
})

test("catalog rejects globally incompatible registry ranges", () => {
  const entry = secondEntry()
  entry.manifestContent = mutateManifestContent(entry.manifestContent, (manifest) => {
    manifest.registry_api = { min: "provider-registry/v3", max: "provider-registry/v3" }
  })
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry(), entry]),
    /incompatible registry ranges/i
  )
})

test("catalog preserves manifest path safety for schema and template declarations", () => {
  for (const [field, mutate] of [
    ["schema", (manifest) => { manifest.schemas[0].path = "../outside.json" }],
    ["template", (manifest) => { manifest.workflow_templates[0].source = "extensions/elsewhere/WORKFLOW.md" }]
  ]) {
    assert.throws(
      () => buildWorkflowContributionCatalog([fixtureEntry({ manifestContent: mutateManifestContent(fixtureContent(), mutate) })]),
      new RegExp(`${field}|path\\.(not_normalized|outside_owner)`, "i")
    )
  }
})

test("catalog output is deterministic across input order and hashes declared content", () => {
  const first = fixtureEntry()
  const second = secondEntry()
  second.manifestContent = mutateManifestContent(second.manifestContent, (manifest) => {
    manifest.schemas = [{ id: "second.schema", path: "extensions/second-extension/schema/schema.json" }]
  })

  const forward = buildWorkflowContributionCatalog([first, second])
  const reverse = buildWorkflowContributionCatalog([second, first])
  assert.deepEqual(reverse, forward)
  assert.equal(forward.schemas[0].sha256.length, 64)
  assert.equal(forward.workflow_templates[0].sha256.length, 64)

  const mutated = fixtureEntry({
    readContent: (repositoryPath) => repositoryPath.includes("schema")
      ? `changed fixture content for ${repositoryPath}`
      : `fixture content for ${repositoryPath}`
  })
  const mutationCatalog = buildWorkflowContributionCatalog([mutated, second])
  assert.notEqual(mutationCatalog.schemas[0].sha256, forward.schemas[0].sha256)
})

test("catalog derives declarations only from UTF-8 manifest bytes", () => {
  const untrustedObject = readFixture()
  untrustedObject.action_providers[0].id = "different.object.only"
  const catalog = buildWorkflowContributionCatalog([fixtureEntry({ manifest: untrustedObject })])
  assert.equal(catalog.action_providers[0].id, "sample.collect")

  const contentTamper = buildWorkflowContributionCatalog([fixtureEntry({
    manifest: untrustedObject,
    manifestContent: mutateManifestContent(fixtureContent(), (manifest) => {
      manifest.action_providers[0].id = "content.wins"
    })
  })])
  assert.equal(contentTamper.action_providers[0].id, "content.wins")

  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry({ manifestContent: "{not json" })]),
    /valid UTF-8 JSON/i
  )
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry({ manifestContent: Buffer.from([0xc3, 0x28]) })]),
    /valid UTF-8 JSON/i
  )
})

test("catalog snapshots hostile manifest and provenance metadata before parsing and hashing", () => {
  const firstContent = fixtureContent()
  const laterContent = mutateManifestContent(firstContent, (manifest) => {
    manifest.action_providers[0].id = "later.bytes.only"
  })
  const reads = { manifestPath: 0, manifestContent: 0, context: 0, readContent: 0, owner: 0, id: 0, version: 0, ownerDirectory: 0 }
  const owner = {
    get id() { reads.id += 1; return "local.sample-extension" },
    get version() { reads.version += 1; return "1.2.3" }
  }
  const context = {
    get expectedOwner() { reads.owner += 1; return owner },
    get ownerDirectory() { reads.ownerDirectory += 1; return "extensions/sample-extension" }
  }
  const input = {
    get manifestPath() { reads.manifestPath += 1; return "extensions/sample-extension/contracts/workflow-contributions.json" },
    get manifestContent() { reads.manifestContent += 1; return reads.manifestContent === 1 ? firstContent : laterContent },
    get context() { reads.context += 1; return context },
    get readContent() { reads.readContent += 1; return (repositoryPath) => `fixture content for ${repositoryPath}` }
  }

  const catalog = buildWorkflowContributionCatalog([input])
  const baseline = buildWorkflowContributionCatalog([fixtureEntry()])
  assert.equal(catalog.action_providers[0].id, "sample.collect")
  assert.equal(catalog.owners[0].manifest_sha256, baseline.owners[0].manifest_sha256)
  assert.deepEqual(reads, {
    manifestPath: 1,
    manifestContent: 1,
    context: 1,
    readContent: 1,
    owner: 1,
    id: 1,
    version: 1,
    ownerDirectory: 1
  })

  assert.throws(
    () => buildWorkflowContributionCatalog([new Proxy({}, { get() { throw new Error("attacker text") } })]),
    /input 0 metadata is invalid/i
  )
})

test("catalog rejects malformed inputs and unavailable declared content before hashing", () => {
  for (const value of [null, {}, "not an array"]) {
    assert.throws(() => buildWorkflowContributionCatalog(value), /inputs must be an array/i)
  }
  assert.throws(
    () => buildWorkflowContributionCatalog([null]),
    /input 0 must be an object/i
  )
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry(), null]),
    /input 1 must be an object/i
  )
  assert.throws(
    () => buildWorkflowContributionCatalog([secondEntry({ readContent: undefined })]),
    /requires a readContent function/i
  )
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry({ readContent: () => { throw new Error("ENOENT") } })]),
    /failed to read declared content/i
  )
})

test("catalog rejects globally duplicated contract versions", () => {
  const second = secondEntry()
  second.manifestContent = mutateManifestContent(second.manifestContent, (manifest) => {
    manifest.action_providers = [{
      id: "second.collect",
      contract_version: "sample.collect/v1",
      input_schema: "second.input",
      output_schema: "second.output",
      error_codes: []
    }]
    manifest.schemas = [
      { id: "second.input", path: "extensions/second-extension/schema/input.json" },
      { id: "second.output", path: "extensions/second-extension/schema/output.json" }
    ]
  })
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry(), second]),
    /duplicate contract version.*sample\.collect\/v1/i
  )

  const externalCommand = secondEntry()
  externalCommand.manifestContent = mutateManifestContent(externalCommand.manifestContent, (manifest) => {
    const workflowPath = "extensions/second-extension/samples/contract/WORKFLOW.md"
    manifest.workflow_claims = [{ path: workflowPath, role: "sample" }]
    manifest.external_commands = [{
      id: "second.external",
      contract_version: "sample.collect/v1",
      workflow_paths: [workflowPath]
    }]
  })
  assert.throws(
    () => buildWorkflowContributionCatalog([fixtureEntry(), externalCommand]),
    /duplicate contract version.*sample\.collect\/v1/i
  )
})

test("catalog hashes manifest, schema, and template byte mutations independently", () => {
  const base = buildWorkflowContributionCatalog([fixtureEntry()])
  const manifestMutation = buildWorkflowContributionCatalog([fixtureEntry({
    manifestContent: `${fixtureContent()}\n`
  })])
  const schemaMutation = buildWorkflowContributionCatalog([fixtureEntry({
    readContent: (repositoryPath) => repositoryPath.includes("schema")
      ? `changed schema content for ${repositoryPath}`
      : `fixture content for ${repositoryPath}`
  })])
  const templateMutation = buildWorkflowContributionCatalog([fixtureEntry({
    readContent: (repositoryPath) => repositoryPath.endsWith("WORKFLOW.md")
      ? `changed template content for ${repositoryPath}`
      : `fixture content for ${repositoryPath}`
  })])

  assert.notEqual(manifestMutation.owners[0].manifest_sha256, base.owners[0].manifest_sha256)
  assert.notEqual(schemaMutation.schemas[0].sha256, base.schemas[0].sha256)
  assert.notEqual(templateMutation.workflow_templates[0].sha256, base.workflow_templates[0].sha256)
})

test("catalog output conforms to the generated catalog schema", () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(repositoryRoot, "extensions/workflow-register/schema/workflow-contribution-catalog.v1.schema.json"),
    "utf8"
  ))
  const validate = new Ajv({ strict: true }).compile(schema)
  const catalog = buildWorkflowContributionCatalog([fixtureEntry()])
  assert.equal(validate(catalog), true, JSON.stringify(validate.errors, null, 2))
  for (const mutation of [
    (value) => { value.action_providers = [null] },
    (value) => { value.preflight_checks = [42] },
    (value) => { value.result_sinks = [""] },
    (value) => { value.agent_providers = [{ owner: "local.sample-extension" }] },
    (value) => { value.action_providers[0].extra = true }
  ]) {
    const invalid = structuredClone(catalog)
    mutation(invalid)
    assert.equal(validate(invalid), false)
  }
})

test("tracked companion manifests fail closed when recovery lacks provenance and declared assets", () => {
  const manifests = discoverContributionManifests(repositoryRoot)
  assert.ok(manifests.length > 0)
  const missing = manifests.flatMap(({ manifest }) => [
    ...manifest.schemas.map((entry) => entry.path),
    ...manifest.workflow_templates.map((entry) => entry.source)
  ]).find((repositoryPath) => !fs.existsSync(path.join(repositoryRoot, repositoryPath)))
  assert.equal(typeof missing, "string")

  const companionManifest = manifests.find(({ path: manifestPath }) => !fs.existsSync(path.join(
    repositoryRoot,
    path.posix.dirname(path.posix.dirname(manifestPath)),
    "package.json"
  )))
  assert.ok(companionManifest)
  assert.throws(
    () => buildWorkflowContributionCatalog([{
      manifestPath: companionManifest.path,
      manifestContent: fs.readFileSync(path.join(repositoryRoot, companionManifest.path), "utf8"),
      readContent: (repositoryPath) => fs.readFileSync(path.join(repositoryRoot, repositoryPath), "utf8")
    }]),
    /context must provide expectedOwner and ownerDirectory/i
  )
})

test("a provenance-backed real manifest generates a catalog from real declared bytes", () => {
  const manifestPath = "extensions/workflow-register/contracts/workflow-contributions.json"
  const extensionRoot = path.join(repositoryRoot, "extensions/workflow-register")
  const packageJson = JSON.parse(fs.readFileSync(path.join(extensionRoot, "package.json"), "utf8"))
  const catalog = buildWorkflowContributionCatalog([{
    manifestPath,
    manifestContent: fs.readFileSync(path.join(repositoryRoot, manifestPath), "utf8"),
    context: {
      expectedOwner: { id: `${packageJson.publisher}.${packageJson.name}`, version: packageJson.version },
      ownerDirectory: "extensions/workflow-register"
    },
    readContent: (repositoryPath) => fs.readFileSync(path.join(repositoryRoot, repositoryPath), "utf8")
  }])
  assert.equal(catalog.owners[0].id, `${packageJson.publisher}.${packageJson.name}`)
  assert.ok(catalog.schemas.every((entry) => /^[0-9a-f]{64}$/.test(entry.sha256)))
})

test("catalog implementation and contract tests no longer use legacy source-regex or fixed provider catalogs", () => {
  const legacyContractTest = fs.readFileSync(path.join(__dirname, "workflowContractFiles.test.js"), "utf8")
  for (const identifier of [
    "providerImplementationSourcePaths",
    "discoverImplementedActionProviderIds",
    "action-provider-contracts.json"
  ]) {
    assert.equal(legacyContractTest.includes(identifier), false, identifier)
  }

  const source = fs.readFileSync(path.join(repositoryRoot, "extensions/workflow-register/src/core/contributionCatalog.ts"), "utf8")
  assert.equal(source.includes("from \"vscode\""), false)
  assert.equal(source.includes("from 'vscode'"), false)
  assert.equal(source.includes("matchAll("), false)
})
