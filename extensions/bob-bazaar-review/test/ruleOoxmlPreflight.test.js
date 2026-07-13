const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { preflightOoxmlArchive } = require("../out/ruleAuthoring/extraction/ooxmlPreflight")
const {
  CENTRAL_DIRECTORY_ENTRY_SIGNATURE,
  createStoredZip
} = require("./helpers/storedZipFixture")

const MAX_ENTRIES = 5_000
const MAX_DECLARED_BYTES = 250 * 1024 * 1024
const DEFAULT_LIMITS = {
  maxOoxmlEntries: MAX_ENTRIES,
  maxOoxmlDeclaredUncompressedBytes: MAX_DECLARED_BYTES
}

function docxEntries(overrides = {}) {
  return [
    { name: "[Content_Types].xml", data: "types", ...overrides.contentTypes },
    { name: "word/document.xml", data: "document", ...overrides.document }
  ]
}

function xlsxEntries(overrides = {}) {
  return [
    { name: "[Content_Types].xml", data: "types", ...overrides.contentTypes },
    { name: "xl/workbook.xml", data: "workbook", ...overrides.workbook }
  ]
}

async function withArchive(buffer, action) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-ooxml-preflight-"))
  const filePath = path.join(directory, "source.office")
  try {
    await fs.writeFile(filePath, buffer)
    return await action(filePath)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
}

async function preflight(buffer, limits = DEFAULT_LIMITS) {
  return withArchive(buffer, (filePath) => preflightOoxmlArchive(filePath, limits))
}

test("preflights a DOCX signature from ZIP metadata without extracting entries", async () => {
  const result = await preflight(createStoredZip(docxEntries({ document: { compressionMethod: 8 } })))

  assert.deepEqual(result, {
    entryCount: 2,
    declaredUncompressedBytes: 13,
    entryNames: ["[Content_Types].xml", "word/document.xml"],
    documentKind: "docx"
  })
})

test("preflights an XLSX signature from ZIP metadata", async () => {
  const result = await preflight(createStoredZip(xlsxEntries()))

  assert.equal(result.documentKind, "xlsx")
  assert.equal(result.entryCount, 2)
  assert.equal(result.declaredUncompressedBytes, 13)
  assert.deepEqual(result.entryNames, ["[Content_Types].xml", "xl/workbook.xml"])
})

test("rejects archives without exactly one supported OOXML document signature", async () => {
  await assert.rejects(
    preflight(createStoredZip([{ name: "[Content_Types].xml" }])),
    /DOCX or XLSX signature/i
  )
  await assert.rejects(
    preflight(createStoredZip([...docxEntries(), { name: "xl/workbook.xml" }])),
    /exactly one|ambiguous/i
  )
})

test("requires exact forward-slash non-directory OOXML signature entry names", async () => {
  const invalidSignatures = [
    [
      { name: "[Content_Types].xml/" },
      { name: "word/document.xml" }
    ],
    [
      { name: "[Content_Types].xml" },
      { name: "word/document.xml/" }
    ],
    [
      { name: "[Content_Types].xml" },
      { name: "word\\document.xml" }
    ],
    [
      { name: "[Content_Types].xml" },
      { name: "xl/workbook.xml/" }
    ],
    [
      { name: "[Content_Types].xml" },
      { name: "xl\\workbook.xml" }
    ]
  ]

  for (const entries of invalidSignatures) {
    await assert.rejects(preflight(createStoredZip(entries)), /DOCX or XLSX signature/i)
  }
})

test("rejects a missing ZIP end-of-central-directory record", async () => {
  const archive = createStoredZip(docxEntries())
  await assert.rejects(preflight(archive.subarray(0, archive.length - 22)), /end.of.central.directory|EOCD/i)
})

test("rejects a truncated central-directory range", async () => {
  const archive = Buffer.from(createStoredZip(docxEntries()))
  const endOffset = archive.length - 22
  archive.writeUInt32LE(archive.readUInt32LE(endOffset + 12) + 1, endOffset + 12)
  await assert.rejects(preflight(archive), /central.directory/i)
})

test("rejects an unsupported gap between the central directory and EOCD", async () => {
  const archive = createStoredZip(docxEntries(), { beforeEocd: Buffer.from("unsupported-gap") })
  await assert.rejects(preflight(archive), /central.directory.*EOCD|adjacent/i)
})

test("rejects an invalid central-directory entry signature", async () => {
  const archive = Buffer.from(createStoredZip(docxEntries()))
  const signature = Buffer.alloc(4)
  signature.writeUInt32LE(CENTRAL_DIRECTORY_ENTRY_SIGNATURE)
  const centralOffset = archive.indexOf(signature)
  assert.ok(centralOffset >= 0)
  archive.writeUInt32LE(0x12345678, centralOffset)
  await assert.rejects(preflight(archive), /central.directory.*signature/i)
})

test("enforces the 5,000-entry hard ceiling even when caller limits are relaxed", async () => {
  const entries = docxEntries()
  for (let index = entries.length; index <= MAX_ENTRIES; index += 1) entries.push({ name: `custom/item-${index}.xml` })
  const archive = createStoredZip(entries)

  await assert.rejects(
    preflight(archive, {
      maxOoxmlEntries: MAX_ENTRIES + 10_000,
      maxOoxmlDeclaredUncompressedBytes: MAX_DECLARED_BYTES * 2
    }),
    /entry count.*5.?000|too many entries/i
  )
})

test("enforces the 250 MiB declared-byte hard ceiling even when caller limits are relaxed", async () => {
  const archive = createStoredZip(docxEntries({
    contentTypes: { uncompressedSize: MAX_DECLARED_BYTES },
    document: { uncompressedSize: 1 }
  }))

  await assert.rejects(
    preflight(archive, {
      maxOoxmlEntries: MAX_ENTRIES * 2,
      maxOoxmlDeclaredUncompressedBytes: MAX_DECLARED_BYTES * 2
    }),
    /declared uncompressed bytes.*250|declared.*limit/i
  )
})

for (const [label, unsafeName] of [
  ["parent traversal", "custom/../secret.xml"],
  ["absolute", "/word/secret.xml"],
  ["drive-relative", "C:word/secret.xml"],
  ["drive-absolute", "C:/word/secret.xml"],
  ["UNC", "\\\\server\\share\\secret.xml"],
  ["device", "\\\\?\\C:\\word\\secret.xml"],
  ["control character", "word/\u0000secret.xml"]
]) {
  test(`rejects an unsafe ${label} entry path`, async () => {
    const archive = createStoredZip([...docxEntries(), { name: unsafeName }])
    await assert.rejects(preflight(archive), /unsafe OOXML entry path|entry path/i)
  })
}

test("normalizes separators when rejecting duplicate entries", async () => {
  const archive = createStoredZip([...docxEntries(), { name: "word\\document.xml" }])
  await assert.rejects(preflight(archive), /duplicate.*word.document\.xml/i)
})

test("rejects encrypted entries", async () => {
  const archive = createStoredZip(docxEntries({ document: { flags: 0x0001 } }))
  await assert.rejects(preflight(archive), /encrypted.*word.document\.xml/i)
})

test("rejects unsupported compression methods", async () => {
  const archive = createStoredZip(docxEntries({ document: { compressionMethod: 12 } }))
  await assert.rejects(preflight(archive), /compression method.*12|unsupported compression/i)
})

test("rejects multi-disk archives", async () => {
  await assert.rejects(preflight(createStoredZip(docxEntries(), { diskNumber: 1 })), /multi.disk/i)
  await assert.rejects(preflight(createStoredZip(docxEntries(), { centralDirectoryDisk: 1 })), /multi.disk/i)
  await assert.rejects(preflight(createStoredZip(docxEntries(), { entriesOnDisk: 1 })), /multi.disk/i)
})

test("rejects ZIP64 EOCD markers and locators", async () => {
  await assert.rejects(preflight(createStoredZip(docxEntries(), { entryCount: 0xffff })), /ZIP64/i)
  await assert.rejects(preflight(createStoredZip(docxEntries(), { centralDirectorySize: 0xffffffff })), /ZIP64/i)
  await assert.rejects(preflight(createStoredZip(docxEntries(), { centralDirectoryOffset: 0xffffffff })), /ZIP64/i)
  await assert.rejects(preflight(createStoredZip(docxEntries(), { zip64Locator: true })), /ZIP64/i)
})

test("rejects ZIP64 central-directory entry markers", async () => {
  const archive = createStoredZip(docxEntries({ document: { uncompressedSize: 0xffffffff } }))
  await assert.rejects(preflight(archive), /ZIP64/i)
})
