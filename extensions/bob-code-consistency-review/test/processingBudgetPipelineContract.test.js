"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const test = require("node:test")

const source = fs.readFileSync(path.join(__dirname, "..", "src", "core", "pipeline.ts"), "utf8")

test("preprocessReview shares one processing budget ledger across diff and document stages", () => {
  assert.match(source, /const processingBudgetLedger = createPipelineProcessingBudgetLedger\(limits, input\.processingBudgetLimits\)/)
  assert.match(source, /collectGitDiff\([\s\S]*budgetLedger: processingBudgetLedger/)
  assert.match(source, /extractDocuments\([\s\S]*budgetLedger: processingBudgetLedger/)
  assert.match(source, /processingBudgetLimits\?: Readonly<Partial<SharedProcessingBudgetLimits>>/)
})
