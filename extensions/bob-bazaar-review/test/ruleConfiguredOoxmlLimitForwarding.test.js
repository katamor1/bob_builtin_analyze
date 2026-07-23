"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const docxModule = require("../out/ruleAuthoring/extraction/docxExtractor")
const xlsxModule = require("../out/ruleAuthoring/extraction/xlsxExtractor")
const { DEFAULT_RULE_AUTHORING_LIMITS } = require("../out/ruleAuthoring/ruleAuthoringLimits")
const { createDocxFixture, createXlsxFixture } = require("./helpers/ruleDocumentFixtures")

test("batch extraction forwards effective source and OOXML caps to both bounded snapshot extractors", async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "bob-configured-ooxml-"))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const docxPath = path.join(directory, "rules.docx")
  const xlsxPath = path.join(directory, "rules.xlsx")
  const docxBytes = createDocxFixture()
  const xlsxBytes = createXlsxFixture()
  await fs.writeFile(docxPath, docxBytes)
  await fs.writeFile(xlsxPath, xlsxBytes)

  const observed = []
  const originalDocx = docxModule.extractDocx
  const originalXlsx = xlsxModule.extractXlsx
  docxModule.extractDocx = async (_filePath, context) => {
    observed.push(["docx", context])
    return { chunks: [], status: "success", warnings: [], extractor: { id: "fixture-docx", version: "1" } }
  }
  xlsxModule.extractXlsx = async (_filePath, context) => {
    observed.push(["xlsx", context])
    return { chunks: [], status: "success", warnings: [], extractor: { id: "fixture-xlsx", version: "1" } }
  }
  t.after(() => {
    docxModule.extractDocx = originalDocx
    xlsxModule.extractXlsx = originalXlsx
  })

  delete require.cache[require.resolve("../out/ruleAuthoring/extraction/documentExtractor")]
  const { extractRuleDocuments } = require("../out/ruleAuthoring/extraction/documentExtractor")
  const maxSourceBytes = Math.max(docxBytes.length, xlsxBytes.length) + 1
  const limits = {
    ...DEFAULT_RULE_AUTHORING_LIMITS,
    maxSourceBytes,
    maxAggregateSourceBytes: docxBytes.length + xlsxBytes.length + 2,
    maxOoxmlEntries: 37,
    maxOoxmlDeclaredUncompressedBytes: 7 * 1024 * 1024
  }

  await extractRuleDocuments([{ filePath: docxPath }, { filePath: xlsxPath }], undefined, limits)

  assert.deepEqual(observed.map(([kind, context]) => [
    kind,
    context.maxFileBytes,
    context.maxArchiveEntries,
    context.maxExpandedBytes
  ]), [
    ["docx", limits.maxSourceBytes, limits.maxOoxmlEntries, limits.maxOoxmlDeclaredUncompressedBytes],
    ["xlsx", limits.maxSourceBytes, limits.maxOoxmlEntries, limits.maxOoxmlDeclaredUncompressedBytes]
  ])
})
