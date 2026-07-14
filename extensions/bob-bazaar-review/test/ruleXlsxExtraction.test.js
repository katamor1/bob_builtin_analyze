const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const { extractXlsx } = require("../out/ruleAuthoring/extraction/xlsxExtractor")
const { createXlsxFixture } = require("./helpers/ruleDocumentFixtures")

async function fixtureFile(t, bytes) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-rule-xlsx-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const filePath = path.join(directory, "rules.xlsx")
  await fs.writeFile(filePath, bytes)
  return filePath
}

test("extractXlsx preserves workbook sheet order and original Excel row numbers across blank rows", async (t) => {
  const filePath = await fixtureFile(t, createXlsxFixture())
  const result = await extractXlsx(filePath, {
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
  const result = await extractXlsx(filePath, {
    sourceId: "src-abcdef012345",
    maxChunkBytes: 32 * 1024
  })

  assert.deepEqual(result.extractor, { id: "read-excel-file", version: "9.2.0" })
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
    maxChunkBytes: 32 * 1024
  })
  const parts = result.chunks.filter((chunk) => chunk.locator.sheet === "Second" && chunk.locator.row === 5)

  assert.equal(parts.length, 2)
  assert.deepEqual(parts.map((chunk) => chunk.locator.part_index), [0, 1])
  assert.ok(parts.every((chunk) => chunk.locator.cell_range === "A5:A5"))
  assert.equal(parts.map((chunk) => chunk.text).join(""), longCell)
})
