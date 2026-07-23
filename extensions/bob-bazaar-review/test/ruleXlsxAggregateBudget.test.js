"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")
const { extractXlsx } = require("../out/ruleAuthoring/extraction/xlsxExtractor")
const { ProcessingBudgetLedger } = require("../out/sharedProcessingBudgetRuntime")
const { createXlsxFixture } = require("./helpers/ruleDocumentFixtures")

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bob-xlsx-budget-"))
  t.after(() => fs.rm(root, { recursive: true, force: true }))
  const filePath = path.join(root, "rules.xlsx")
  await fs.writeFile(filePath, createXlsxFixture())
  return filePath
}

function exceeded(category, limit, observed) {
  return (error) => {
    assert.equal(error?.code, "processing_budget_exceeded")
    assert.equal(error?.details?.constrainedCategory, category)
    assert.equal(error?.details?.limit, limit)
    assert.equal(error?.details?.observed, observed)
    return true
  }
}

test("rejects sheets per workbook before row chunks", async (t) => {
  const filePath = await fixture(t)
  await assert.rejects(
    extractXlsx(filePath, {
      sourceId: "src-sheet-limit",
      maxChunkBytes: 32768,
      budgetLedger: new ProcessingBudgetLedger({ limits: { sheets_per_workbook: 1 } })
    }),
    exceeded("sheets_per_workbook", 1, 2)
  )
})

test("rejects rows per sheet before row chunks", async (t) => {
  const filePath = await fixture(t)
  await assert.rejects(
    extractXlsx(filePath, {
      sourceId: "src-row-limit",
      maxChunkBytes: 32768,
      budgetLedger: new ProcessingBudgetLedger({ limits: { rows_per_sheet: 1 } })
    }),
    exceeded("rows_per_sheet", 1, 2)
  )
})
