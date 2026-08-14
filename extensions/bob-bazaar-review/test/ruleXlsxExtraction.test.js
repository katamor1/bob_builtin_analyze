const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const Module = require("node:module")
const os = require("node:os")
const path = require("node:path")
const zlib = require("node:zlib")
const { test } = require("node:test")

const { extractXlsx } = require("../out/ruleAuthoring/extraction/xlsxExtractor")
const { preflightOoxmlArchive } = require("../out/ruleAuthoring/extraction/ooxmlPreflight")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { createXlsxFixture } = require("./helpers/ruleDocumentFixtures")
const { createStoredZip } = require("./helpers/storedZipFixture")

async function fixtureFile(t, bytes) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-xlsx-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "rules.xlsx")
  await fs.writeFile(filePath, bytes)
  return filePath
}

async function xlsxPreflightContext(filePath) {
  const preflight = await preflightOoxmlArchive(filePath, DEFAULT_RULE_AUTHORING_LIMITS)
  return {
    ooxmlEntryNames: preflight.entryNames,
    ooxmlDeclaredUncompressedBytes: preflight.declaredUncompressedBytes,
    ooxmlArchiveByteLength: preflight.archiveByteLength,
    ooxmlEntries: preflight.entries
  }
}

const STYLE_BEARING_XLSX_ENTRIES = [
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
  "xl/styles.xml",
  "xl/worksheets/sheet1.xml",
  "xl/worksheets/sheet2.xml"
]

const STYLE_AND_SHARED_STRING_FREE_XLSX_ENTRIES = STYLE_BEARING_XLSX_ENTRIES.filter(
  (entryName) => entryName !== "xl/styles.xml"
)
const SHARED_STRING_BEARING_XLSX_ENTRIES = [
  ...STYLE_AND_SHARED_STRING_FREE_XLSX_ENTRIES,
  "xl/sharedStrings.xml"
]

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
  const preflight = await xlsxPreflightContext(filePath)
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ...preflight
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
  const preflight = await xlsxPreflightContext(filePath)
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ...preflight
  })

  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
    ["Second", 1, "beta\t\tdelta"],
    ["Second", 3, "cached\t\t2"],
    ["First", 2, "tail"]
  ])
})

for (const dataDescriptorSignature of [true, false]) {
  test(`extractXlsx normalizes a missing-both workbook with ${dataDescriptorSignature ? "signed" : "unsigned"} ZIP32 data descriptors`, async (t) => {
    const filePath = await fixtureFile(t, createXlsxFixture({
      omitStyles: true,
      dataDescriptor: true,
      dataDescriptorSignature
    }))
    const preflight = await xlsxPreflightContext(filePath)
    const result = await extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight
    })

    assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
      ["Second", 1, "beta\t\tdelta"],
      ["Second", 3, "cached\t\t2"],
      ["First", 2, "tail"]
    ])
  })
}

test("extractXlsx gives every compatibility deflate decoder a finite preflight-derived output bound", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true, deflate: true }))
  const preflight = await xlsxPreflightContext(filePath)
  const extractorPath = require.resolve("../out/ruleAuthoring/extraction/xlsxExtractor")
  const originalCacheEntry = require.cache[extractorPath]
  const originalLoad = Module._load
  const inflateOptions = []
  let boundedExtractXlsx

  delete require.cache[extractorPath]
  try {
    Module._load = function(request, parent, isMain) {
      const loaded = originalLoad.call(this, request, parent, isMain)
      if (request !== "node:zlib" || parent?.filename !== extractorPath) return loaded
      return {
        ...loaded,
        inflateRawSync(input, options) {
          inflateOptions.push({ ...options })
          return loaded.inflateRawSync(input, options)
        }
      }
    }
    boundedExtractXlsx = require(extractorPath).extractXlsx
  } finally {
    Module._load = originalLoad
    if (originalCacheEntry) require.cache[extractorPath] = originalCacheEntry
    else delete require.cache[extractorPath]
  }

  const result = await boundedExtractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ...preflight
  })
  const expectedBounds = preflight.ooxmlEntries
    .filter((entry) => entry.compressionMethod === 8)
    .map((entry) => Math.max(1, entry.uncompressedSize))

  assert.equal(result.status, "success")
  assert.deepEqual(inflateOptions.map((options) => options.maxOutputLength), expectedBounds)
  assert.ok(inflateOptions.every((options) => options.info === true))
})

test("extractXlsx rejects deflate output that exceeds its preflight-declared size", async (t) => {
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
  const preflight = await xlsxPreflightContext(filePath)

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight
    }),
    /deflate output|decoded size|expansion exceeds/i
  )
})

test("extractXlsx rejects deflate output shorter than its preflight-declared size", async (t) => {
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
  const preflight = await xlsxPreflightContext(filePath)

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight
    }),
    /decoded size does not match preflight/i
  )
})

test("extractXlsx rejects trailing bytes inside a declared deflate payload", async (t) => {
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
  const preflight = await xlsxPreflightContext(filePath)

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight
    }),
    /compressed payload was not consumed exactly/i
  )
})

test("extractXlsx rejects entry bytes whose CRC does not match preflight", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{ name: "custom/bad-crc.bin", data: Buffer.from("tampered"), crc32: 0 }]
  }))
  const preflight = await xlsxPreflightContext(filePath)

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight
    }),
    /entry CRC does not match preflight/i
  )
})

test("extractXlsx rejects a preflight-listed __proto__ entry before compatibility unzip", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({
    omitStyles: true,
    additionalEntries: [{ name: "__proto__", data: Buffer.from("untrusted") }]
  }))

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ooxmlEntryNames: [...STYLE_AND_SHARED_STRING_FREE_XLSX_ENTRIES, "__proto__"],
      ooxmlDeclaredUncompressedBytes: 0
    }),
    /unsafe XLSX compatibility entry/i
  )
})

test("extractXlsx fails closed when unzip entries do not match the preflight entry list", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true }))
  const preflight = await xlsxPreflightContext(filePath)

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight,
      ooxmlEntryNames: preflight.ooxmlEntryNames.filter(
        (entryName) => entryName !== "xl/worksheets/sheet2.xml"
      )
    }),
    /compatibility archive entries do not match preflight/i
  )
})

test("extractXlsx rejects compatibility expansion beyond the preflight declared total", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true }))
  const preflight = await xlsxPreflightContext(filePath)

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ...preflight,
      ooxmlDeclaredUncompressedBytes: 1
    }),
    /compatibility expansion exceeds preflight/i
  )
})

test("extractXlsx rejects a stored entry whose compressed and uncompressed sizes differ", async (t) => {
  const entries = [
    { name: "[Content_Types].xml", data: "types" },
    { name: "xl/workbook.xml", data: Buffer.alloc(1024), uncompressedSize: 0 }
  ]
  const filePath = await fixtureFile(t, createStoredZip(entries))
  const archiveByteLength = (await fs.stat(filePath)).size

  await assert.rejects(
    () => extractXlsx(filePath, {
      sourceId: "src-abcdef012345",
      maxChunkBytes: 32 * 1024,
      ooxmlEntryNames: entries.map((entry) => entry.name),
      ooxmlDeclaredUncompressedBytes: 5,
      ooxmlArchiveByteLength: archiveByteLength,
      ooxmlEntries: [
        {
          name: "[Content_Types].xml",
          flags: 0,
          compressionMethod: 0,
          crc32: 0,
          compressedSize: 5,
          uncompressedSize: 5,
          localHeaderOffset: 0,
          dataOffset: 49,
          dataEnd: 54
        },
        {
          name: "xl/workbook.xml",
          flags: 0,
          compressionMethod: 0,
          crc32: 0,
          compressedSize: 1024,
          uncompressedSize: 0,
          localHeaderOffset: 54,
          dataOffset: 99,
          dataEnd: 1123
        }
      ]
    }),
    /stored entry size mismatch/i
  )
})

test("extractXlsx leaves a workbook with shared strings on the original file path", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture({ omitStyles: true, includeSharedStrings: true }))
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ooxmlEntryNames: SHARED_STRING_BEARING_XLSX_ENTRIES
  })

  assert.deepEqual(result.chunks.map((chunk) => [chunk.locator.sheet, chunk.locator.row, chunk.text]), [
    ["Second", 1, "beta\t\tdelta"],
    ["Second", 3, "cached\t\t2"],
    ["First", 2, "tail"]
  ])
})

test("extractXlsx preserves workbook sheet order and original Excel row numbers across blank rows", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture())
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ooxmlEntryNames: STYLE_BEARING_XLSX_ENTRIES
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
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ooxmlEntryNames: STYLE_BEARING_XLSX_ENTRIES
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
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024,
    ooxmlEntryNames: STYLE_BEARING_XLSX_ENTRIES
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
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes * 4,
    ooxmlEntryNames: STYLE_BEARING_XLSX_ENTRIES
  })
  const parts = result.chunks.filter((chunk) => chunk.locator.sheet === "Second" && chunk.locator.row === 5)

  assert.equal(parts.length, 2)
  assert.ok(parts.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes))
})
