"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const path = require("node:path")
const test = require("node:test")

test("XLSX extraction rechecks cancellation after module import and parser awaits", async () => {
  const source = await fs.readFile(
    path.join(__dirname, "..", "src", "analyzers", "documentXlsxExtractor.ts"),
    "utf8"
  )

  const moduleAwait = source.indexOf("const readExcelFile = await loadExcelFile()")
  const parserAwait = source.indexOf("const workbook = await readExcelFile.default(", moduleAwait)
  const postParserMaterialization = source.indexOf("assertParsedXlsxWorkbookWithinBudget", parserAwait)
  const guardAfterModule = source.indexOf("throwIfCancelled(budget.signal)", moduleAwait)
  const guardAfterParser = source.indexOf("throwIfCancelled(budget.signal)", parserAwait)

  assert.ok(moduleAwait >= 0)
  assert.ok(guardAfterModule > moduleAwait && guardAfterModule < parserAwait)
  assert.ok(parserAwait > guardAfterModule)
  assert.ok(guardAfterParser > parserAwait && guardAfterParser < postParserMaterialization)
})
