"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const root = path.resolve(__dirname, "..", "..", "..")
const text = (relative) => fs.readFileSync(path.join(root, relative), "utf8")

test("shared runtime exports the atomic workbook helper", () => {
  const source = text("packages/processing-budget-runtime/src/index.ts")
  const helper = text("packages/processing-budget-runtime/src/workbookBudget.ts")
  assert.match(source, /commitWorkbookBudget/)
  assert.match(helper, /reserveForTarget\("sheets_per_workbook"/)
  assert.match(helper, /reserveForTarget\("rows_per_sheet"/)
  assert.match(helper, /for \(let index = reservations\.length - 1/)
})

test("Bazaar shares document, expansion, sheet, and row budgets", () => {
  const coordinator = text("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts")
  const docx = text("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts")
  const xlsx = text("extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts")
  const wrapper = text("extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts")

  assert.match(wrapper, /commitWorkbookBudget/)
  assert.match(coordinator, /reserve\("document_count"/)
  assert.match(coordinator, /ledger: context\.ledger/)
  assert.match(coordinator, /budgetLedger: context\.ledger/)
  assert.match(docx, /ledger: context\.budgetLedger \?\? readLedger/)
  assert.match(xlsx, /ledger: context\.budgetLedger \?\? readLedger/)
  assert.match(xlsx, /commitWorkbookBudget/)
  assert.doesNotMatch(xlsx, /slice\(0,|Math\.min\([^\n]*rows/)
})

test("consistency review shares one operation ledger and fails closed on budget errors", () => {
  const coordinator = text("extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts")
  const xlsx = text("extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts")
  const wrapper = text("extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts")

  assert.match(wrapper, /commitWorkbookBudget/)
  assert.match(coordinator, /const ledger = documentLedger/)
  assert.match(coordinator, /reserve\("document_count", 1\)/)
  assert.match(coordinator, /isProcessingBudgetExceeded\(error\).*throw error/s)
  assert.match(coordinator, /\{ ledger, workbookTarget: workbookTarget\(filePath\), signal \}/)
  assert.match(xlsx, /commitWorkbookBudget/)
  assert.doesNotMatch(xlsx, /slice\(0,|Math\.min\([^\n]*dataRows/)
})
