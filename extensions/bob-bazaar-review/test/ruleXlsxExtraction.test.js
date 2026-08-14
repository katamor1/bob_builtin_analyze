const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const zlib = require("node:zlib")
const { test } = require("node:test")

const { extractXlsx } = require("../out/ruleAuthoring/extraction/xlsxExtractor")
const { prepareOoxmlParserInput } = require("../out/ruleAuthoring/extraction/ooxmlArchive")
const { preflightOoxmlArchive } = require("../out/ruleAuthoring/extraction/ooxmlPreflight")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { fingerprintSource } = require("../out/ruleAuthoring/ruleSourceHash")
const { createXlsxFixture } = require("./helpers/ruleDocumentFixtures")

async function fixtureFile(t, bytes) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-xlsx-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "rules.xlsx")
  await fs.writeFile(filePath, bytes)
  return filePath
}

async function xlsxPreflightContext(filePath) {
  return preflightOoxmlArchive(await fs.readFile(filePath), DEFAULT_RULE_AUTHORING_LIMITS)
}

async function prepareXlsx(filePath) {
  return prepareOoxmlParserInput(
    filePath,
    await fingerprintSource(filePath),
    "xlsx",
    DEFAULT_RULE_AUTHORING_LIMITS
  )
}

async function extractPreparedXlsx(filePath, context) {
  const prepared = await prepareXlsx(filePath)
  return extractXlsx(prepared.parserInput, context)
}

function fixtureCrc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = (crc >>> 8) ^ FIXTURE_CRC32_TABLE[(crc ^ byte) & 0xff]
  return (crc ^ 0xffffffff) >>> 0
}

const FIXTURE_CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

test("extractXlsx normalizes a valid workbook with neither styles nor shared strings in memory", async (t) => {
  const sourceBytes = createXlsxFixture({ omitStyles: true })
  const filePath = await fixtureFile(t, sourceBytes)
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
    ["Second", 1, "beta\t\tdelta"],
    ["Second", 3, "cached\t\t2"],
    ["First", 2, "tail"]
  ])
  assert.deepEqual(result.chunks.map((chunk) => chunk.locator.cell_range), ["B1:D1", "A3:C3", "A2:A2"])
  assert.deepEqual(await fs.readFile(filePath), sourceBytes)
})

test("extractXlsx normalizes a valid deflated workbook with neither styles nor shared strings", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true, deflate: true }))
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
    ["Second", 1, "beta\t\tdelta"],
    ["Second", 3, "cached\t\t2"],
    ["First", 2, "tail"]
  ])
})

test("prepareOoxmlParserInput validates stored and deflated empty entries and preserves the normal snapshot", async (t) => {
  const emptyDeflate = zlib.deflateRawSync(Buffer.alloc(0))
  const sourceBytes = createXlsxFixture({
    additionalEntries: [
      { name: "custom/empty-stored.bin", data: Buffer.alloc(0) },
      {
        name: "custom/empty-deflated.bin",
        data: emptyDeflate,
        crc32: 0,
        compressionMethod: 8,
        compressedSize: emptyDeflate.length,
        uncompressedSize: 0
      }
    ]
  })
  const filePath = await fixtureFile(t, sourceBytes)

  const prepared = await prepareXlsx(filePath)

  assert.equal(prepared.normalization, "none")
  assert.deepEqual(prepared.parserInput, sourceBytes)
})

test("prepareOoxmlParserInput binds every snapshot fingerprint field before preflight", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture())
  const fingerprint = await fingerprintSource(filePath)
  const mutations = {
    byteSize: String(Number(fingerprint.byteSize) + 1),
    mtimeNs: String(BigInt(fingerprint.mtimeNs) + 1n),
    device: String(BigInt(fingerprint.device) + 1n),
    inode: String(BigInt(fingerprint.inode) + 1n),
    sha256: "0".repeat(64)
  }

  for (const [field, value] of Object.entries(mutations)) {
    await assert.rejects(
      () => prepareOoxmlParserInput(
        filePath,
        { ...fingerprint, [field]: value },
        "xlsx",
        DEFAULT_RULE_AUTHORING_LIMITS
      ),
      new RegExp(`fingerprint field ${field} differs`, "i")
    )
  }
})

test("prepareOoxmlParserInput rejects stat identity mismatch before reading snapshot bytes", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture())
  const fingerprint = await fingerprintSource(filePath)
  await fs.appendFile(filePath, Buffer.alloc(64 * 1024))
  const archivePath = require.resolve("../out/ruleAuthoring/extraction/ooxmlArchive")
  const script = `
    const Module = require("node:module")
    const originalLoad = Module._load
    let reads = 0
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain)
      if (request !== "node:fs/promises" || parent?.filename !== ${JSON.stringify(archivePath)}) return loaded
      return {
        ...loaded,
        async open(...args) {
          const handle = await loaded.open(...args)
          const originalRead = handle.read.bind(handle)
          handle.read = (...readArgs) => {
            reads += 1
            return originalRead(...readArgs)
          }
          return handle
        }
      }
    }
    require(${JSON.stringify(archivePath)}).prepareOoxmlParserInput(
      ${JSON.stringify(filePath)},
      ${JSON.stringify(fingerprint)},
      "xlsx",
      ${JSON.stringify(DEFAULT_RULE_AUTHORING_LIMITS)}
    ).then(() => {
      throw new Error("mismatched snapshot unexpectedly prepared")
    }).catch((error) => {
      if (!/fingerprint field byteSize differs/i.test(error.message)) throw error
      if (reads !== 0) throw new Error("snapshot reads before stat identity rejection: " + reads)
    })
  `

  const result = spawnSync(process.execPath, ["-e", script], { encoding: "utf8", timeout: 10_000 })

  assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"))
})

for (const dataDescriptorSignature of [true, false]) {
  test(`extractXlsx normalizes a missing-both workbook with ${dataDescriptorSignature ? "signed" : "unsigned"} ZIP32 data descriptors`, async (t) => {
    const filePath = await fixtureFile(t, createXlsxFixture({
      omitStyles: true,
      dataDescriptor: true,
      dataDescriptorSignature
    }))
    const result = await extractPreparedXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024
    })

    assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
      ["Second", 1, "beta\t\tdelta"],
      ["Second", 3, "cached\t\t2"],
      ["First", 2, "tail"]
    ])
  })
}

test("prepareOoxmlParserInput gives every deflate decoder a finite preflight-derived output bound", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true, deflate: true }))
  const preflight = await xlsxPreflightContext(filePath)
  const archivePath = require.resolve("../out/ruleAuthoring/extraction/ooxmlArchive")
  const originalCacheEntry = require.cache[archivePath]
  const originalLoad = Module._load
  const inflateOptions = []
  let boundedPrepare

  delete require.cache[archivePath]
  try {
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain)
      if (request !== "node:zlib" || parent?.filename !== archivePath) return loaded
      return {
        ...loaded,
        inflateRawSync(input, options) {
          inflateOptions.push({ ...options })
          return loaded.inflateRawSync(input, options)
        }
      }
    }
    boundedPrepare = require(archivePath).prepareOoxmlParserInput
  } finally {
    Module._load = originalLoad
    if (originalCacheEntry) require.cache[archivePath] = originalCacheEntry
    else delete require.cache[archivePath]
  }

  const result = await boundedPrepare(
    filePath,
    await fingerprintSource(filePath),
    "xlsx",
    DEFAULT_RULE_AUTHORING_LIMITS
  )
  const expectedBounds = preflight.entries
    .filter((entry) => entry.compressionMethod === 8)
    .map((entry) => Math.max(1, entry.uncompressedSize))

  assert.equal(result.normalization, "xlsx_minimal_styles")
  assert.deepEqual(inflateOptions.map((options) => options.maxOutputLength), expectedBounds)
  assert.ok(inflateOptions.every((options) => options.info === true))
})

test("prepareOoxmlParserInput rejects deflate output that exceeds its preflight-declared size", async (t) => {
  const inflated = Buffer.alloc(2 * 1024 * 1024, 0x41)
  const compressed = zlib.deflateRawSync(inflated)
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{
      name: "custom/under-declared.bin",
      data: compressed,
      compressionMethod: 8,
      compressedSize: compressed.length,
      uncompressedSize: 1
    }]
  }))
  await assert.rejects(
    () => prepareXlsx(filePath),
    /deflate output|decoded size|expansion exceeds/i
  )
})

test("prepareOoxmlParserInput rejects deflate output shorter than its preflight-declared size", async (t) => {
  const inflated = Buffer.from("x")
  const compressed = zlib.deflateRawSync(inflated)
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{
      name: "custom/over-declared.bin",
      data: compressed,
      crc32: fixtureCrc32(inflated),
      compressionMethod: 8,
      compressedSize: compressed.length,
      uncompressedSize: inflated.length + 1
    }]
  }))
  await assert.rejects(
    () => prepareXlsx(filePath),
    /decoded size does not match preflight/i
  )
})

test("prepareOoxmlParserInput rejects trailing bytes inside a declared deflate payload", async (t) => {
  const inflated = Buffer.from("x")
  const compressed = Buffer.concat([zlib.deflateRawSync(inflated), Buffer.from("junk")])
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{
      name: "custom/trailing-deflate.bin",
      data: compressed,
      crc32: fixtureCrc32(inflated),
      compressionMethod: 8,
      compressedSize: compressed.length,
      uncompressedSize: inflated.length
    }]
  }))
  await assert.rejects(
    () => prepareXlsx(filePath),
    /compressed payload was not consumed exactly/i
  )
})

test("prepareOoxmlParserInput rejects entry bytes whose CRC does not match preflight", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{ name: "custom/bad-crc.bin", data: Buffer.from("tampered"), crc32: 0 }]
  }))
  await assert.rejects(
    () => prepareXlsx(filePath),
    /entry CRC does not match preflight/i
  )
})

test("prepareOoxmlParserInput rejects a preflight-listed __proto__ entry before compatibility rebuild", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{ name: "__proto__", data: Buffer.from("untrusted") }]
  }))

  await assert.rejects(
    () => prepareXlsx(filePath),
    /unsafe XLSX compatibility entry/i
  )
})

test("extractXlsx reads a workbook with shared strings from its validated snapshot Buffer", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true, includeSharedStrings: true }))
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
    ["Second", 1, "beta\t\tdelta"],
    ["Second", 3, "cached\t\t2"],
    ["First", 2, "tail"]
  ])
})

test("extractXlsx preserves workbook sheet order and original Excel row numbers across blank rows", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture())
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row]), [
    ["Second", 1],
    ["Second", 3],
    ["First", 2]
  ])
  assert.equal(result.chunks.some((chunk) => chunk.locator.row === 2 && chunk.locator.sheet === "Second"), false)
  assert.deepEqual(result.chunks.map((chunk) => chunk.kind), ["row", "row", "row"])
})

test("extractXlsx locates the minimum/maximum non-empty cells and uses saved formula values", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture())
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.extractor, { id: "xlsx-read-excel-rows", version: "1" })
  assert.equal(result.status, "success")
  assert.equal(result.chunks[0].locator.cell_range, "B1:D1")
  assert.equal(result.chunks[0].text, "beta\t\tdelta")
  assert.equal(result.chunks[1].locator.cell_range, "A3:C3")
  assert.equal(result.chunks[1].text, "cached\t\t2")
  assert.doesNotMatch(result.chunks[1].text, /1\+1/)
})

test("extractXlsx splits an oversized row without losing its row/range locator", async (t) => {
  const longCell = `${"y".repeat(32 * 1024)}終端`
  const filePath = await fixtureFile(t, createXlsxFixture({ longCell }))
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })
  const parts = result.chunks.filter((chunk) => chunk.locator.sheet === "Second" && chunk.locator.row === 5)

  assert.equal(parts.length, 2)
  assert.deepEqual(parts.map((chunk) => chunk.locator.part_index), [0, 1])
  assert.ok(parts.every((chunk) => chunk.locator.cell_range === "A5:A5"))
  assert.equal(parts.map((chunk) => chunk.text).join(""), longCell)
})

test("extractXlsx clamps a caller-raised chunk limit to the approved 32 KiB ceiling", async (t) => {
  const longCell = "z".repeat(DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes + 1)
  const filePath = await fixtureFile(t, createXlsxFixture({ longCell }))
  const result = await extractPreparedXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes * 4
  })
  const parts = result.chunks.filter((chunk) => chunk.locator.sheet === "Second" && chunk.locator.row === 5)

  assert.equal(parts.length, 2)
  assert.ok(parts.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes))
})
