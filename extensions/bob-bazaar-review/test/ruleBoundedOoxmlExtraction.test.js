const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { extractDocx } = require("../out/ruleAuthoring/extraction/docxExtractor")
const { extractXlsx } = require("../out/ruleAuthoring/extraction/xlsxExtractor")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { createDocxFixture, createXlsxFixture } = require("./helpers/ruleDocumentFixtures")

async function fixtureFile(t, name, bytes) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-bounded-ooxml-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, name)
  await fs.writeFile(filePath, bytes)
  return filePath
}

for (const [kind, name, createFixture, extract] of [
  ["docx", "rules.docx", createDocxFixture, extractDocx],
  ["xlsx", "rules.xlsx", createXlsxFixture, extractXlsx]
]) {
  test(`${kind} extraction rejects a CRC-corrupt archive before the document parser`, async (t) => {
    const archive = mutateEntryMetadata(createFixture(), "[Content_Types].xml", ({ crc32 }) => ({ crc32: (crc32 ^ 0xffffffff) >>> 0 }))
    const filePath = await fixtureFile(t, name, archive)
    await assert.rejects(
      extract(filePath, { sourceId: `bounded-${kind}`, maxChunkBytes: 32 * 1024 }),
      (error) => error?.code === "archive_crc_mismatch"
    )
  })

  test(`${kind} extraction rejects a declared expanded entry above the per-entry cap`, async (t) => {
    const archive = mutateEntryMetadata(createFixture(), "[Content_Types].xml", () => ({
      uncompressedSize: DEFAULT_RULE_AUTHORING_LIMITS.maxSourceBytes + 1
    }))
    const filePath = await fixtureFile(t, name, archive)
    await assert.rejects(
      extract(filePath, { sourceId: `bounded-${kind}`, maxChunkBytes: 32 * 1024 }),
      (error) => error?.code === "archive_entry_too_large"
    )
  })

  test(`${kind} extraction enforces the shared archive entry ceiling before parsing`, async (t) => {
    const filePath = await fixtureFile(t, name, createFixture())
    await assert.rejects(
      extract(filePath, {
        sourceId: `bounded-${kind}`,
        maxChunkBytes: 32 * 1024,
        maxArchiveEntries: 1
      }),
      (error) => error?.code === "archive_entry_count_exceeded"
    )
  })
}

function mutateEntryMetadata(input, targetName, mutate) {
  const archive = Buffer.from(input)
  const endOffset = findEndOfCentralDirectory(archive)
  const centralOffset = archive.readUInt32LE(endOffset + 16)
  const totalEntries = archive.readUInt16LE(endOffset + 10)
  let offset = centralOffset
  for (let index = 0; index < totalEntries; index += 1) {
    assert.equal(archive.readUInt32LE(offset), 0x02014b50)
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
    if (name === targetName) {
      const localOffset = archive.readUInt32LE(offset + 42)
      const current = {
        crc32: archive.readUInt32LE(offset + 16),
        compressedSize: archive.readUInt32LE(offset + 20),
        uncompressedSize: archive.readUInt32LE(offset + 24)
      }
      const next = { ...current, ...mutate(current) }
      archive.writeUInt32LE(next.crc32 >>> 0, offset + 16)
      archive.writeUInt32LE(next.compressedSize >>> 0, offset + 20)
      archive.writeUInt32LE(next.uncompressedSize >>> 0, offset + 24)
      archive.writeUInt32LE(next.crc32 >>> 0, localOffset + 14)
      archive.writeUInt32LE(next.compressedSize >>> 0, localOffset + 18)
      archive.writeUInt32LE(next.uncompressedSize >>> 0, localOffset + 22)
      return archive
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new Error(`entry not found: ${targetName}`)
}

function findEndOfCentralDirectory(archive) {
  for (let offset = archive.length - 22; offset >= 0; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50 && offset + 22 + archive.readUInt16LE(offset + 20) === archive.length) return offset
  }
  throw new Error("EOCD not found")
}
