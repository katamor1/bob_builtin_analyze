const assert = require("node:assert/strict")
const { createHash } = require("node:crypto")
const { test } = require("node:test")

const {
  buildDocumentChunkId,
  splitDocumentChunk
} = require("../out/ruleAuthoring/documentChunk")

test("document chunk IDs are stable for canonical locators and include media type", () => {
  const sourceId = "src-0123456789ab"
  const firstLocator = { heading_path: ["Rules"], block_index: 4 }
  const reorderedLocator = { block_index: 4, heading_path: ["Rules"] }

  const docxId = buildDocumentChunkId(sourceId, "docx", "paragraph", firstLocator)
  const repeatedId = buildDocumentChunkId(sourceId, "docx", "paragraph", reorderedLocator)
  const pdfId = buildDocumentChunkId(sourceId, "pdf", "paragraph", firstLocator)

  assert.match(docxId, /^chunk-[a-f0-9]{64}$/)
  assert.equal(docxId, repeatedId)
  assert.notEqual(docxId, pdfId)
  assert.notEqual(docxId, buildDocumentChunkId("src-fedcba987654", "docx", "paragraph", firstLocator))
  assert.notEqual(docxId, buildDocumentChunkId(sourceId, "docx", "heading", firstLocator))
  assert.notEqual(docxId, buildDocumentChunkId(sourceId, "docx", "paragraph", {
    heading_path: ["Rules"],
    block_index: 5
  }))
})

test("every structural locator field contributes to document chunk identity", () => {
  const locator = {
    heading_path: ["Rules"],
    block_index: 4,
    table_index: 2,
    sheet: "Policy",
    row: 7,
    cell_range: "A7:C7",
    page: 3,
    part_index: 1
  }
  const baseId = buildDocumentChunkId("src-0123456789ab", "docx", "table", locator)
  const variants = [
    { ...locator, heading_path: ["Other"] },
    { ...locator, block_index: 5 },
    { ...locator, table_index: 3 },
    { ...locator, sheet: "Other" },
    { ...locator, row: 8 },
    { ...locator, cell_range: "A8:C8" },
    { ...locator, page: 4 },
    { ...locator, part_index: 2 }
  ]

  for (const variant of variants) {
    assert.notEqual(buildDocumentChunkId("src-0123456789ab", "docx", "table", variant), baseId)
  }
})

test("splitDocumentChunk splits at UTF-8 code-point boundaries without truncation", () => {
  const maxBytes = 32 * 1024
  const text = `${"a".repeat(maxBytes - 1)}あ${"b".repeat(maxBytes)}🙂end`
  const chunks = splitDocumentChunk({
    sourceId: "src-0123456789ab",
    mediaType: "docx",
    kind: "paragraph",
    locator: { heading_path: ["Overview"], block_index: 7 },
    title: "Overview",
    text,
    flags: ["generated-fixture"]
  }, maxBytes)

  assert.equal(chunks.length, 3)
  assert.equal(chunks.map((chunk) => chunk.text).join(""), text)
  assert.deepEqual(chunks.map((chunk) => chunk.locator.part_index), [0, 1, 2])
  assert.equal(new Set(chunks.map((chunk) => chunk.chunk_id)).size, chunks.length)

  for (const [index, chunk] of chunks.entries()) {
    assert.equal(chunk.schema_version, "bob-bazaar-review/document-chunk/v1")
    assert.equal(chunk.source_id, "src-0123456789ab")
    assert.equal(chunk.kind, "paragraph")
    assert.deepEqual(chunk.locator.heading_path, ["Overview"])
    assert.equal(chunk.locator.block_index, 7)
    assert.equal(chunk.locator.part_index, index)
    assert.equal(chunk.title, "Overview")
    assert.deepEqual(chunk.flags, ["generated-fixture"])
    assert.ok(Buffer.byteLength(chunk.text, "utf8") <= maxBytes)
    assert.equal(chunk.text_sha256, createHash("sha256").update(chunk.text, "utf8").digest("hex"))
    assert.equal(
      chunk.chunk_id,
      buildDocumentChunkId("src-0123456789ab", "docx", "paragraph", chunk.locator)
    )
  }

  assert.equal(chunks[0].text, "a".repeat(maxBytes - 1))
  assert.equal(chunks[1].text.startsWith("あ"), true)
  assert.equal(chunks[2].text.includes("🙂"), true)
})

test("splitDocumentChunk leaves an in-budget structural element unsplit", () => {
  const [chunk] = splitDocumentChunk({
    sourceId: "src-fedcba987654",
    mediaType: "xlsx",
    kind: "row",
    locator: { sheet: "Rules", row: 2, cell_range: "A2:C2" },
    text: "A\tB\tC",
    flags: []
  }, 32 * 1024)

  assert.equal(Object.hasOwn(chunk.locator, "part_index"), false)
  assert.equal(chunk.text, "A\tB\tC")
})

test("splitDocumentChunk rejects a limit too small for one Unicode code point", () => {
  assert.throws(() => splitDocumentChunk({
    sourceId: "src-fedcba987654",
    mediaType: "pdf",
    kind: "page",
    locator: { page: 1 },
    text: "🙂",
    flags: []
  }, 3), /code point/i)
})
