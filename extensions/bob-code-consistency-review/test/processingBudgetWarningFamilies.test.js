"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  coverageIssuesFromWarnings
} = require("../out/core/processingBudgetCoverage")
const {
  ProcessingBudgetLedger
} = require("../out/sharedProcessingBudgetRuntime")

test("code and ledger warning families block complete coverage regardless of wording or language", () => {
  const issues = coverageIssuesFromWarnings({
    ledger: new ProcessingBudgetLedger(),
    codeWarnings: [
      "変更された C/C++ ファイルがワークスペース内で見つかりません: src/missing.cpp",
      "ambiguous basename fallback for src/device.cpp: legacy/device.cpp, current/device.cpp"
    ],
    ledgerWarnings: [
      "artifact ledger ignored: Unexpected token } in JSON at position 4"
    ]
  })

  assert.equal(issues.filter((issue) => issue.code === "code_evidence_incomplete").length, 2)
  assert.equal(issues.filter((issue) => issue.code === "artifact_ledger_incomplete").length, 1)
})

test("repository cache recovery warnings are not evidence loss after a complete rebuild", () => {
  const issues = coverageIssuesFromWarnings({
    ledger: new ProcessingBudgetLedger(),
    repositoryWarnings: [
      "repository index cache ignored: Unexpected token } in JSON at position 4",
      "repository index cache invalidated: producer identity or options changed"
    ]
  })

  assert.deepEqual(issues, [])
})

test("unknown repository warnings still block complete coverage", () => {
  const issues = coverageIssuesFromWarnings({
    ledger: new ProcessingBudgetLedger(),
    repositoryWarnings: [
      "repository index omitted an unsupported source"
    ]
  })

  assert.equal(issues.length, 1)
  assert.equal(issues[0].code, "repository_evidence_incomplete")
})
