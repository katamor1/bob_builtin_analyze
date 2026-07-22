"use strict"

const assert = require("node:assert/strict")
const { spawnSync } = require("node:child_process")
const { createHash } = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const zlib = require("node:zlib")

const { discoverContributionManifests } = require("../scripts/discover-tracked-workflows")

const fixtureRoot = path.join(__dirname, "fixtures", "workflow-contributions")
const manifestPath = "extensions/sample-extension/contracts/workflow-contributions.json"
const ownerDirectory = "extensions/sample-extension"
const context = Object.freeze({
  expectedOwner: Object.freeze({ id: "local.sample-extension", version: "1.2.3" }),
  ownerDirectory
})

function loadValidators() {
  return {
    ...require("../out/core/templateMirrorValidator"),
    ...require("../out/core/vsixContributionPayloadValidator")
  }
}

function manifestBuffer(mutate) {
  const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "valid.json"), "utf8"))
  mutate?.(manifest)
  return Buffer.from(JSON.stringify(manifest))
}

function packageBuffer() {
  return Buffer.from(JSON.stringify({
    publisher: "local",
    name: "sample-extension",
    version: "1.2.3",
    contributes: { commands: [] }
  }))
}

function contentFor(repositoryPath) {
  if (repositoryPath === `${ownerDirectory}/package.json`) return packageBuffer()
  if (repositoryPath.endsWith("/WORKFLOW.md")) return Buffer.from("shared workflow bytes\n")
  return Buffer.from(`exact bytes for ${repositoryPath}`)
}

function mirrorInput(overrides = {}) {
  return {
    manifestPath,
    manifestContent: manifestBuffer(),
    context,
    readContent: contentFor,
    ...overrides
  }
}

function buildExpectation(
  content = manifestBuffer(),
  packageContent = packageBuffer(),
  readContent = contentFor
) {
  const manifest = JSON.parse(content.toString("utf8"))
  return {
    schema_version: "workflow-package-expectation/v1",
    owner: {
      id: context.expectedOwner.id,
      version: context.expectedOwner.version,
      owner_directory: ownerDirectory,
      manifest_path: manifestPath,
      manifest_sha256: sha256(content),
      package_path: `${ownerDirectory}/package.json`,
      package_sha256: sha256(packageContent)
    },
    assets: [
      ...manifest.schemas.map((schema) => ({
        kind: "schema",
        id: schema.id,
        path: schema.path,
        sha256: sha256(readContent(schema.path))
      })),
      ...manifest.workflow_templates.map((template) => ({
        kind: "template",
        id: template.id,
        path: template.source,
        sha256: sha256(readContent(template.source))
      }))
    ].sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
  }
}

function sha256(content) {
  return createHash("sha256").update(content).digest("hex")
}

function packageEntryPath(repositoryPath) {
  assert.ok(repositoryPath.startsWith(`${ownerDirectory}/`), repositoryPath)
  return `extension/${repositoryPath.slice(ownerDirectory.length + 1)}`
}

function completeVsixEntries(content = manifestBuffer(), options = {}) {
  const manifest = JSON.parse(content.toString("utf8"))
  const readContent = options.readContent ?? contentFor
  const entries = {
    "extension/package.json": options.packageContent ?? packageBuffer(),
    "extension/contracts/workflow-contributions.json": content
  }
  for (const schema of manifest.schemas) entries[packageEntryPath(schema.path)] = readContent(schema.path)
  for (const template of manifest.workflow_templates) entries[packageEntryPath(template.source)] = readContent(template.source)
  return entries
}

function storedZip(entries, options = {}) {
  const records = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([name, value]) => ({ name, value }))
  const localParts = []
  const centralParts = []
  let localOffset = 0
  for (const record of records) {
    const nameBytes = Buffer.isBuffer(record.name) ? Buffer.from(record.name) : Buffer.from(record.name, "utf8")
    const localNameBytes = Buffer.from(record.localName ?? nameBytes)
    const content = Buffer.from(record.value)
    const method = record.method ?? options.method ?? 0
    const flags = record.flags ?? options.flags ?? 0x0800
    const compressed = method === 8 ? zlib.deflateRawSync(content) : content
    const checksum = crc32(content)
    const gapAfter = Buffer.from(record.gapAfter ?? Buffer.alloc(0))
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(flags, 6)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(record.localCrc ?? record.centralCrc ?? checksum, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(localNameBytes.length, 26)
    localParts.push(local, localNameBytes, compressed, gapAfter)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(flags, 8)
    central.writeUInt16LE(method, 10)
    central.writeUInt32LE(record.centralCrc ?? checksum, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(nameBytes.length, 28)
    central.writeUInt32LE(localOffset, 42)
    centralParts.push(central, nameBytes)
    localOffset += local.length + localNameBytes.length + compressed.length + gapAfter.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(records.length, 8)
  end.writeUInt16LE(records.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(localOffset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function crc32(content) {
  let value = 0xffffffff
  for (const byte of content) {
    value ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0)
    }
  }
  return (value ^ 0xffffffff) >>> 0
}

function diagnosticCodes(result) {
  return result.diagnostics.map((diagnostic) => diagnostic.code)
}

test("template mirror validation rejects byte drift", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  const input = mirrorInput({
    readContent: (repositoryPath) => repositoryPath.includes("samples/sample-review")
      ? Buffer.from("changed destination bytes")
      : contentFor(repositoryPath)
  })

  const result = validateWorkflowTemplateMirrors([input])

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("template.byte_mismatch"))
})

test("template mirror validation rejects an orphan destination", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  const input = mirrorInput({
    manifestContent: manifestBuffer((manifest) => {
      manifest.workflow_claims = manifest.workflow_claims.filter((claim) => claim.role !== "sample")
      manifest.external_commands = []
    })
  })

  const result = validateWorkflowTemplateMirrors([input])

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("template.destination_orphan"))
})

test("template mirror validation rejects a missing source", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  const source = JSON.parse(manifestBuffer().toString("utf8")).workflow_templates[0].source
  const input = mirrorInput({
    readContent: (repositoryPath) => {
      if (repositoryPath === source) throw new Error("ENOENT")
      return contentFor(repositoryPath)
    }
  })

  const result = validateWorkflowTemplateMirrors([input])

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("template.source_unavailable"))
})

test("template mirror validation rejects a path escape before reading content", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  let reads = 0
  const input = mirrorInput({
    manifestContent: manifestBuffer((manifest) => {
      manifest.workflow_templates[0].source = "../outside/WORKFLOW.md"
    }),
    readContent: () => {
      reads += 1
      return Buffer.from("must not be read")
    }
  })

  const result = validateWorkflowTemplateMirrors([input])

  assert.equal(result.ok, false)
  assert.equal(reads, 0)
  assert.ok(diagnosticCodes(result).includes("path.not_normalized"))
})

test("VSIX payload validation rejects an absent contribution manifest", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const entries = completeVsixEntries()
  delete entries["extension/contracts/workflow-contributions.json"]

  const result = validateVsixContributionPayload({
    archiveContent: storedZip(entries),
    expectedCatalog: buildExpectation(),
    ownerId: context.expectedOwner.id
  })

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("vsix.manifest_missing"))
})

test("VSIX payload validation rejects an absent declared schema", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const missingSchema = JSON.parse(content.toString("utf8")).schemas[0].path
  const entries = completeVsixEntries(content)
  delete entries[packageEntryPath(missingSchema)]

  const result = validateVsixContributionPayload({
    archiveContent: storedZip(entries),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("vsix.schema_missing"))
})

test("VSIX payload validation rejects a packaged asset digest mismatch", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const schemaPath = JSON.parse(content.toString("utf8")).schemas[0].path
  const entries = completeVsixEntries(content)
  entries[packageEntryPath(schemaPath)] = Buffer.from("mutated after catalog generation")

  const result = validateVsixContributionPayload({
    archiveContent: storedZip(entries),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("vsix.asset_digest_mismatch"))
})

test("manifest-driven mirrors and a complete archive validate without a source-tree package fallback", () => {
  const { validateWorkflowTemplateMirrors, validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()

  const mirrors = validateWorkflowTemplateMirrors([mirrorInput({ manifestContent: content })])
  const packaged = validateVsixContributionPayload({
    archiveContent: storedZip(completeVsixEntries(content), { method: 8 }),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })

  assert.deepEqual(mirrors, { ok: true, diagnostics: [] })
  assert.deepEqual(packaged, { ok: true, diagnostics: [] })
})

test("template validation rejects metadata accessors and revoked input arrays without invoking getters", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  const counts = { manifestPath: 0, manifestContent: 0, context: 0, expectedOwner: 0, id: 0, version: 0, ownerDirectory: 0, readContent: 0 }
  const initialManifest = manifestBuffer()
  const pathsRead = new Map()
  const owner = {
    get id() { counts.id += 1; return context.expectedOwner.id },
    get version() { counts.version += 1; return context.expectedOwner.version }
  }
  const untrustedContext = {
    get expectedOwner() { counts.expectedOwner += 1; return owner },
    get ownerDirectory() { counts.ownerDirectory += 1; return ownerDirectory }
  }
  const input = {
    get manifestPath() { counts.manifestPath += 1; return manifestPath },
    get manifestContent() {
      counts.manifestContent += 1
      return counts.manifestContent === 1 ? initialManifest : Buffer.from("later hostile bytes")
    },
    get context() { counts.context += 1; return untrustedContext },
    get readContent() {
      counts.readContent += 1
      return (repositoryPath) => {
        pathsRead.set(repositoryPath, (pathsRead.get(repositoryPath) ?? 0) + 1)
        return contentFor(repositoryPath)
      }
    }
  }

  const result = validateWorkflowTemplateMirrors([input])

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("template.input_invalid"))
  assert.deepEqual(counts, {
    manifestPath: 0,
    manifestContent: 0,
    context: 0,
    expectedOwner: 0,
    id: 0,
    version: 0,
    ownerDirectory: 0,
    readContent: 0
  })
  assert.equal(pathsRead.size, 0)

  const revoked = Proxy.revocable([mirrorInput()], {})
  revoked.revoke()
  const revokedResult = validateWorkflowTemplateMirrors(revoked.proxy)
  assert.equal(revokedResult.ok, false)
  assert.ok(diagnosticCodes(revokedResult).includes("template.input_invalid"))
})

test("template validation fatal-decodes manifest bytes and never reads declared content after failure", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  let reads = 0

  const result = validateWorkflowTemplateMirrors([mirrorInput({
    manifestContent: Buffer.from([0xc3, 0x28]),
    readContent: () => {
      reads += 1
      return Buffer.alloc(0)
    }
  })])

  assert.equal(result.ok, false)
  assert.equal(reads, 0)
  assert.ok(diagnosticCodes(result).includes("manifest.invalid_utf8_json"))
})

test("template validation bounds input count, mirror bytes, and diagnostic count", () => {
  const { validateWorkflowTemplateMirrors } = loadValidators()
  const tooMany = validateWorkflowTemplateMirrors(Array.from({ length: 300 }, () => null))
  assert.equal(tooMany.ok, false)
  assert.ok(diagnosticCodes(tooMany).includes("template.input_limit"))
  assert.ok(tooMany.diagnostics.length <= 256)

  const aggregateContent = manifestBuffer((manifest) => {
    manifest.workflow_templates = Array.from({ length: 3 }, (_, index) => ({
      id: `aggregate.template.${index}`,
      source: `${ownerDirectory}/templates/.bob/workflows/aggregate-${index}/WORKFLOW.md`,
      destinations: [`${ownerDirectory}/samples/aggregate-${index}/.bob/workflows/aggregate-${index}/WORKFLOW.md`]
    }))
    manifest.workflow_claims = manifest.workflow_templates.flatMap((template) => [
      { path: template.source, role: "template" },
      { path: template.destinations[0], role: "sample" }
    ])
    manifest.external_commands = []
  })
  const aggregateAsset = Buffer.alloc(6 * 1024 * 1024, 0x63)
  const aggregateResult = validateWorkflowTemplateMirrors([mirrorInput({
    manifestContent: aggregateContent,
    readContent: () => aggregateAsset
  })])
  assert.equal(aggregateResult.ok, false)
  assert.ok(diagnosticCodes(aggregateResult).includes("template.content_budget_exceeded"))
  assert.ok(aggregateResult.diagnostics.length <= 256)

  const oneTemplateContent = manifestBuffer((manifest) => {
    const template = {
      id: "aggregate.cross-input",
      source: `${ownerDirectory}/templates/.bob/workflows/cross-input/WORKFLOW.md`,
      destinations: [`${ownerDirectory}/samples/cross-input/.bob/workflows/cross-input/WORKFLOW.md`]
    }
    manifest.workflow_templates = [template]
    manifest.workflow_claims = [
      { path: template.source, role: "template" },
      { path: template.destinations[0], role: "sample" }
    ]
    manifest.external_commands = []
  })
  const crossInputResult = validateWorkflowTemplateMirrors(Array.from({ length: 3 }, () => mirrorInput({
    manifestContent: oneTemplateContent,
    readContent: () => aggregateAsset
  })))
  assert.equal(crossInputResult.ok, false)
  assert.ok(diagnosticCodes(crossInputResult).includes("template.content_budget_exceeded"))
})

test("VSIX validation rejects duplicate and noncanonical entry names", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const entries = Object.entries(completeVsixEntries(content)).map(([name, value]) => ({ name, value }))
  const duplicate = [...entries, { name: entries[0].name, value: entries[0].value }]
  const escaped = [...entries, { name: "extension/contracts/../escaped.json", value: Buffer.from("x") }]

  for (const [name, records] of [["duplicate", duplicate], ["escaped", escaped]]) {
    const result = validateVsixContributionPayload({
      archiveContent: storedZip(records),
      expectedCatalog: buildExpectation(content),
      ownerId: context.expectedOwner.id
    })
    assert.equal(result.ok, false, name)
    assert.ok(diagnosticCodes(result).includes("vsix.archive_invalid"), name)
  }
})

test("VSIX validation fatal-decodes entry names and rejects local/central disagreement", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const common = {
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  }
  const invalidUtf8 = storedZip([{ name: Buffer.from([0xc3, 0x28]), value: Buffer.from("x") }])
  const mismatchedName = storedZip([{ name: "extension/package.json", localName: "extension/other.json", value: packageBuffer() }])

  for (const archiveContent of [invalidUtf8, mismatchedName]) {
    const result = validateVsixContributionPayload({ archiveContent, ...common })
    assert.equal(result.ok, false)
    assert.ok(diagnosticCodes(result).includes("vsix.archive_invalid"))
  }
})

test("VSIX validation rejects encrypted, unsupported, multi-disk, and truncated archives", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const entries = completeVsixEntries(content)
  const encrypted = storedZip(entries, { flags: 0x0801 })
  const strongEncrypted = storedZip(entries, { flags: 0x0840 })
  const unsupported = storedZip(Object.entries(entries).map(([name, value]) => ({ name, value, method: 12 })))
  const multiDisk = Buffer.from(storedZip(entries))
  multiDisk.writeUInt16LE(1, multiDisk.length - 18)
  const truncated = storedZip(entries).subarray(0, storedZip(entries).length - 4)

  for (const [name, archiveContent] of [["encrypted", encrypted], ["strong-encrypted", strongEncrypted], ["unsupported", unsupported], ["multi-disk", multiDisk], ["truncated", truncated]]) {
    const result = validateVsixContributionPayload({
      archiveContent,
      expectedCatalog: buildExpectation(content),
      ownerId: context.expectedOwner.id
    })
    assert.equal(result.ok, false, name)
    assert.ok(diagnosticCodes(result).includes("vsix.archive_invalid"), name)
  }
})

test("VSIX validation rejects unexplained bytes between bounded local entries", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const records = Object.entries(completeVsixEntries(content)).map(([name, value], index) => ({
    name,
    value,
    gapAfter: index === 0 ? Buffer.from("unexplained") : undefined
  }))

  const result = validateVsixContributionPayload({
    archiveContent: storedZip(records),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("vsix.archive_invalid"))
})

test("VSIX validation rejects drive-qualified names and corrupt non-required entry CRC", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const expectedCatalog = buildExpectation(content)
  const baseRecords = Object.entries(completeVsixEntries(content)).map(([name, value]) => ({ name, value }))
  const drivePath = storedZip([...baseRecords, { name: "C:/outside.txt", value: Buffer.from("x") }])
  const corruptNonRequired = storedZip([
    ...baseRecords,
    { name: "extension/out/non-required.js", value: Buffer.from("valid bytes"), centralCrc: 0x12345678 }
  ])

  for (const [name, archiveContent] of [["drive path", drivePath], ["non-required CRC", corruptNonRequired]]) {
    const result = validateVsixContributionPayload({
      archiveContent,
      expectedCatalog,
      ownerId: context.expectedOwner.id
    })
    assert.equal(result.ok, false, name)
    assert.ok(diagnosticCodes(result).includes("vsix.archive_invalid"), name)
  }
})

test("VSIX validation enforces 8 MiB per-entry and 32 MiB aggregate uncompressed budgets", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const expectedCatalog = buildExpectation(content)
  const oversizedEntry = {
    ...completeVsixEntries(content),
    "extension/out/oversized.js": Buffer.alloc(8 * 1024 * 1024 + 1, 0x61)
  }
  const oversizedResult = validateVsixContributionPayload({
    archiveContent: storedZip(oversizedEntry, { method: 8 }),
    expectedCatalog,
    ownerId: context.expectedOwner.id
  })
  assert.equal(oversizedResult.ok, false)
  assert.ok(diagnosticCodes(oversizedResult).includes("vsix.archive_invalid"))

  const aggregateContent = manifestBuffer((manifest) => {
    manifest.schemas.push(...Array.from({ length: 5 }, (_, index) => ({
      id: `aggregate.schema.${index}`,
      path: `${ownerDirectory}/schema/aggregate-${index}.json`
    })))
  })
  const aggregateAsset = Buffer.alloc(7 * 1024 * 1024, 0x62)
  const aggregateReader = (repositoryPath) => repositoryPath.includes("/schema/aggregate-")
    ? aggregateAsset
    : contentFor(repositoryPath)
  const aggregateExpectation = buildExpectation(aggregateContent, packageBuffer(), aggregateReader)
  const aggregateResult = validateVsixContributionPayload({
    archiveContent: storedZip(completeVsixEntries(aggregateContent, { readContent: aggregateReader }), { method: 8 }),
    expectedCatalog: aggregateExpectation,
    ownerId: context.expectedOwner.id
  })
  assert.equal(aggregateResult.ok, false)
  assert.ok(diagnosticCodes(aggregateResult).includes("vsix.archive_invalid"))
})

test("VSIX validation checks archive package identity and manifest digest before declarations", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const wrongPackageEntries = completeVsixEntries(content)
  wrongPackageEntries["extension/package.json"] = Buffer.from(JSON.stringify({
    publisher: "attacker",
    name: "sample-extension",
    version: "1.2.3"
  }))
  const changedManifestEntries = completeVsixEntries(content)
  changedManifestEntries["extension/contracts/workflow-contributions.json"] = manifestBuffer((manifest) => {
    manifest.workflow_templates = []
    manifest.workflow_claims = []
  })

  const wrongIdentity = validateVsixContributionPayload({
    archiveContent: storedZip(wrongPackageEntries),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })
  const changedManifest = validateVsixContributionPayload({
    archiveContent: storedZip(changedManifestEntries),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })

  assert.ok(diagnosticCodes(wrongIdentity).includes("vsix.package_identity_mismatch"))
  assert.ok(diagnosticCodes(changedManifest).includes("vsix.manifest_digest_mismatch"))
})

test("VSIX validation binds exact package bytes beyond matching identity and version", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const changedPackage = Buffer.from(JSON.stringify({
    publisher: "local",
    name: "sample-extension",
    version: "1.2.3",
    main: "./out/attacker.js",
    contributes: { commands: [] }
  }))
  const entries = completeVsixEntries(content)
  entries["extension/package.json"] = changedPackage

  const result = validateVsixContributionPayload({
    archiveContent: storedZip(entries),
    expectedCatalog: buildExpectation(content),
    ownerId: context.expectedOwner.id
  })

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("vsix.package_digest_mismatch"))
})

test("VSIX validation rejects input accessors without invocation and bounds hostile diagnostics", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const firstArchive = storedZip(completeVsixEntries(content))
  const counts = { archiveContent: 0, expectedCatalog: 0, ownerId: 0 }
  const input = {
    get archiveContent() {
      counts.archiveContent += 1
      return counts.archiveContent === 1 ? firstArchive : Buffer.from("later hostile bytes")
    },
    get expectedCatalog() { counts.expectedCatalog += 1; return buildExpectation(content) },
    get ownerId() { counts.ownerId += 1; return context.expectedOwner.id }
  }

  const accessorResult = validateVsixContributionPayload(input)
  assert.equal(accessorResult.ok, false)
  assert.ok(diagnosticCodes(accessorResult).includes("vsix.input_invalid"))
  assert.deepEqual(counts, { archiveContent: 0, expectedCatalog: 0, ownerId: 0 })

  const hostile = new Proxy({}, { get() { throw new Error("x".repeat(10_000)) } })
  const first = validateVsixContributionPayload(hostile)
  const second = validateVsixContributionPayload(hostile)
  assert.deepEqual(second, first)
  assert.equal(first.ok, false)
  assert.ok(diagnosticCodes(first).includes("vsix.input_invalid"))
  for (const diagnostic of first.diagnostics) {
    assert.ok(Buffer.byteLength(diagnostic.code, "utf8") <= 256)
    assert.ok(Buffer.byteLength(diagnostic.path, "utf8") <= 256)
    assert.ok(Buffer.byteLength(diagnostic.message, "utf8") <= 256)
  }
})

test("VSIX validation rejects expectation asset accessors without invoking value getters", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const expectedCatalog = buildExpectation(content)
  let gets = 0
  const assets = expectedCatalog.assets.slice()
  Object.defineProperty(assets, "0", {
    configurable: true,
    enumerable: true,
    get() {
      gets += 1
      throw new Error("expectation asset getter must not run")
    }
  })

  const result = validateVsixContributionPayload({
    archiveContent: storedZip(completeVsixEntries(content)),
    expectedCatalog: { ...expectedCatalog, assets },
    ownerId: context.expectedOwner.id
  })

  assert.equal(result.ok, false)
  assert.ok(diagnosticCodes(result).includes("vsix.input_invalid"))
  assert.equal(gets, 0)
})

test("VSIX validation requires a closed canonical sorted expectation without duplicates", () => {
  const { validateVsixContributionPayload } = loadValidators()
  const content = manifestBuffer()
  const archiveContent = storedZip(completeVsixEntries(content))
  const baseline = buildExpectation(content)
  const variants = [
    { ...baseline, unknown: true },
    { ...baseline, [Symbol("unknown")]: true },
    { ...baseline, assets: baseline.assets.slice().reverse() },
    { ...baseline, assets: [...baseline.assets, baseline.assets[0]] },
    {
      ...baseline,
      assets: baseline.assets.map((asset, index) => index === 0 ? { ...asset, path: "C:/outside.json" } : asset)
    }
  ]
  let ownerGets = 0
  const accessorOwner = { ...baseline.owner }
  Object.defineProperty(accessorOwner, "id", {
    enumerable: true,
    get() {
      ownerGets += 1
      return baseline.owner.id
    }
  })
  variants.push({ ...baseline, owner: accessorOwner })

  for (const expectedCatalog of variants) {
    const result = validateVsixContributionPayload({ archiveContent, expectedCatalog, ownerId: context.expectedOwner.id })
    assert.equal(result.ok, false)
    assert.ok(diagnosticCodes(result).includes("vsix.input_invalid"))
    assert.ok(result.diagnostics.length <= 256)
  }
  assert.equal(ownerGets, 0)
})

test("all extension package policies route contribution checks through actual archive-byte validation", () => {
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
  const ownerDirectories = discoverContributionManifests(repositoryRoot)
    .map(({ path: manifestPath }) => path.posix.dirname(path.posix.dirname(manifestPath)))
  for (const ownerDirectory of ownerDirectories) {
    const policy = fs.readFileSync(path.join(repositoryRoot, ownerDirectory, "scripts", "check-vsix-policy.js"), "utf8")
    assert.match(policy, /validatePackagedContribution/iu, ownerDirectory)
    assert.match(policy, /const archiveContent = fs\.readFileSync\(vsixPath\)/u, ownerDirectory)
    assert.match(policy, /validatePackagedContribution\(\{[\s\S]*?\n\s+archiveContent,/u, ownerDirectory)
    assert.match(
      policy,
      /typeof packageJson\.publisher !== "string" \|\| packageJson\.publisher\.trim\(\)\.length === 0/u,
      `${ownerDirectory} must fail closed before expectation creation when publisher provenance is invalid`
    )
    assert.doesNotMatch(policy, /readZipEntries\(vsixPath\)/u, ownerDirectory)
  }
})

test("tracked package policy sources load in a clean tree without ignored compiler output", (t) => {
  const { probeRoot, policyPaths } = createCleanPolicyProbe(t)
  assert.equal(fs.existsSync(path.join(probeRoot, "extensions", "workflow-register", "out")), false)

  for (const policyPath of policyPaths) {
    const loaded = spawnSync(process.execPath, ["-e", `require(${JSON.stringify(policyPath)})`], {
      cwd: probeRoot,
      encoding: "utf8"
    })
    assert.equal(loaded.status, 0, `${path.relative(probeRoot, policyPath)}\n${loaded.stdout}\n${loaded.stderr}`)
  }
})

test("Bazaar package policy validates explicit archive payloads outside Git without source fallback", (t) => {
  const { probeRoot } = createCleanPolicyProbe(t)
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task11-bazaar-policy-"))
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }))
  const packageJson = {
    publisher: "local",
    name: "bob-bazaar-review",
    version: "1.0.0",
    main: "./out/extension.js"
  }
  const manifest = {
    schema_version: "workflow-contributions/v1",
    owner: { id: "local.bob-bazaar-review", version: "1.0.0" },
    registry_api: { min: "provider-registry/v1", max: "provider-registry/v1" },
    action_providers: [],
    preflight_checks: [],
    result_sinks: [],
    workflow_templates: [],
    workflow_claims: [],
    workflow_exclusions: [],
    external_commands: [],
    schemas: [{
      id: "synthetic.schema",
      path: "extensions/bob-bazaar-review/contracts/schemas/synthetic.schema.json"
    }]
  }
  const packageContent = Buffer.from(JSON.stringify(packageJson))
  const manifestContent = Buffer.from(JSON.stringify(manifest))
  const schemaContent = Buffer.from('{"type":"object"}\n')
  fs.mkdirSync(path.join(fixtureRoot, "contracts", "schemas"), { recursive: true })
  fs.writeFileSync(path.join(fixtureRoot, "package.json"), packageContent)
  fs.writeFileSync(path.join(fixtureRoot, "package-lock.json"), JSON.stringify({
    lockfileVersion: 3,
    packages: { "": { dependencies: {} } }
  }))
  fs.writeFileSync(path.join(fixtureRoot, "contracts", "workflow-contributions.json"), manifestContent)
  fs.writeFileSync(path.join(fixtureRoot, "contracts", "schemas", "synthetic.schema.json"), schemaContent)

  const archivePath = path.join(fixtureRoot, "bob-bazaar-review-1.0.0.vsix")
  const baseEntries = {
    "extension/package.json": packageContent,
    "extension/out/extension.js": Buffer.alloc(0),
    "extension/contracts/workflow-contributions.json": manifestContent,
    "extension/contracts/schemas/synthetic.schema.json": schemaContent
  }
  const policyPath = path.join(
    probeRoot,
    "extensions",
    "bob-bazaar-review",
    "scripts",
    "check-vsix-policy.js"
  )
  const runPolicy = () => spawnSync(process.execPath, [policyPath, "--max-bytes", "100000"], {
    cwd: fixtureRoot,
    encoding: "utf8"
  })
  assert.notEqual(spawnSync("git", ["-C", fixtureRoot, "rev-parse", "--git-dir"]).status, 0)

  fs.writeFileSync(archivePath, storedZip(baseEntries))
  const valid = runPolicy()
  assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`)

  const missingSchema = { ...baseEntries }
  delete missingSchema["extension/contracts/schemas/synthetic.schema.json"]
  fs.writeFileSync(archivePath, storedZip(missingSchema))
  const missing = runPolicy()
  assert.notEqual(missing.status, 0)
  assert.match(`${missing.stdout}\n${missing.stderr}`, /vsix\.schema_missing/iu)

  fs.writeFileSync(archivePath, storedZip({
    ...baseEntries,
    "extension/contracts/schemas/synthetic.schema.json": Buffer.from("mutated archive bytes")
  }))
  const mutated = runPolicy()
  assert.notEqual(mutated.status, 0)
  assert.match(`${mutated.stdout}\n${mutated.stderr}`, /vsix\.asset_digest_mismatch/iu)

  for (const [label, publisher] of [["missing", undefined], ["blank", ""], ["non-string", 7]]) {
    const invalidPackageJson = { ...packageJson, publisher }
    if (publisher === undefined) delete invalidPackageJson.publisher
    const invalidPackageContent = Buffer.from(JSON.stringify(invalidPackageJson))
    fs.writeFileSync(path.join(fixtureRoot, "package.json"), invalidPackageContent)
    fs.writeFileSync(archivePath, storedZip({
      ...baseEntries,
      "extension/package.json": invalidPackageContent,
      "extension/contracts/schemas/synthetic.schema.json": Buffer.from("mutated archive bytes")
    }))
    const rejected = runPolicy()
    assert.notEqual(rejected.status, 0, `${label} publisher must not skip contribution validation`)
    assert.match(`${rejected.stdout}\n${rejected.stderr}`, /publisher.*non-empty string/iu, label)
  }
})

function createCleanPolicyProbe(t) {
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..")
  const probeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "task11-clean-policy-"))
  t.after(() => fs.rmSync(probeRoot, { recursive: true, force: true }))
  const relativePolicyPaths = discoverContributionManifests(repositoryRoot).map(({ path: manifestPath }) => (
    `${path.posix.dirname(path.posix.dirname(manifestPath))}/scripts/check-vsix-policy.js`
  ))
  const sourcePaths = [
    ...relativePolicyPaths,
    "extensions/workflow-register/scripts/validate-contribution-assets.js",
    "extensions/workflow-register/scripts/lib/vsix-contribution-payload-validator.js"
  ]
  for (const relativePath of sourcePaths) {
    const source = path.join(repositoryRoot, relativePath)
    assert.equal(fs.existsSync(source), true, `${relativePath} must be tracked package-policy source`)
    const destination = path.join(probeRoot, relativePath)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(source, destination)
  }
  return {
    probeRoot,
    policyPaths: relativePolicyPaths.map((relativePath) => path.join(probeRoot, relativePath))
  }
}
