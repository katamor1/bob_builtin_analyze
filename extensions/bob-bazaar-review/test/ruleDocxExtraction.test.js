const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { extractDocx } = require("../out/ruleAuthoring/extraction/docxExtractor")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { createDocxFixture } = require("./helpers/ruleDocumentFixtures")

async function fixtureFile(t, bytes) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-docx-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "rules.docx")
  await fs.writeFile(filePath, bytes)
  return filePath
}

test("extractDocx preserves heading, paragraph, list, and table document order with structural locators", async (t) => {
  const filePath = await fixtureFile(t, createDocxFixture())
  const result = await extractDocx(filePath, {
    sourceId: "src-0123456789ab",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.chunks.slice(0, 5).map((chunk) => chunk.kind), [
    "heading", "paragraph", "list", "table", "heading"
  ])
  assert.deepEqual(result.chunks[0].locator, {
    heading_path: ["Engineering Rules"],
    block_index: 0
  })
  assert.deepEqual(result.chunks[1].locator.heading_path, ["Engineering Rules"])
  assert.equal(result.chunks[1].locator.block_index, 1)
  assert.match(result.chunks[2].text, /Run the bounded checks\./)
  assert.deepEqual(result.chunks[3].locator, {
    heading_path: ["Engineering Rules"],
    block_index: 3,
    table_index: 0
  })
  assert.equal(result.chunks[3].text, "Rule\tRequired\nReview\tYes")
  assert.deepEqual(result.chunks[4].locator.heading_path, ["Engineering Rules", "Details"])
})

test("extractDocx emits bounded Mammoth/image warning codes and omits image bytes", async (t) => {
  const filePath = await fixtureFile(t, createDocxFixture())
  const result = await extractDocx(filePath, {
    sourceId: "src-0123456789ab",
    maxChunkBytes: 32 * 1024
  })

  assert.equal(result.status, "partial")
  assert.deepEqual(result.extractor, { id: "docx-mammoth-html", version: "2" })
  assert.ok(result.warnings.includes("mammoth_warning"))
  assert.ok(result.warnings.includes("image_omitted"))
  assert.doesNotMatch(result.chunks.map((chunk) => chunk.text).join("\n"), /data:image|89504e47/i)
  assert.ok(result.warnings.every((warning) => /^[a-z][a-z0-9_]+$/.test(warning)))
})

test("extractDocx applies the UTF-8 chunk limit and assigns ordered part_index locators", async (t) => {
  const longParagraph = `${"x".repeat(32 * 1024)}終端`
  const filePath = await fixtureFile(t, createDocxFixture({ longParagraph }))
  const result = await extractDocx(filePath, {
    sourceId: "src-0123456789ab",
    maxChunkBytes: 32 * 1024
  })
  const parts = result.chunks.filter((chunk) => chunk.text.includes("x") || chunk.text.includes("終端"))

  assert.equal(parts.length, 2)
  assert.deepEqual(parts.map((chunk) => chunk.locator.part_index), [0, 1])
  assert.equal(parts.map((chunk) => chunk.text).join(""), longParagraph)
  assert.ok(parts.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= 32 * 1024))
})

test("extractDocx clamps a caller-raised chunk limit to the approved 32 KiB ceiling", async (t) => {
  const longParagraph = "z".repeat(DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes + 1)
  const filePath = await fixtureFile(t, createDocxFixture({ longParagraph }))
  const result = await extractDocx(filePath, {
    sourceId: "src-0123456789ab",
    maxChunkBytes: DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes * 4
  })
  const parts = result.chunks.filter((chunk) => chunk.text.includes("z"))

  assert.equal(parts.length, 2)
  assert.ok(parts.every((chunk) => Buffer.byteLength(chunk.text, "utf8") <= DEFAULT_RULE_AUTHORING_LIMITS.maxChunkBytes))
})
