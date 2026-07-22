const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readExtensionFile } = require("./helpers/sourceReader")

test("current Task 4 docs index names the traceability organization stage", () => {
  const docsIndex = readExtensionFile("docs", "README-ja.md")
  assert.match(docsIndex, /トレーサビリティ整理/)
  assert.doesNotMatch(docsIndex, /トレーサビリティ確認画面/)
})

test("current Task 4 real-machine spec uses the approved triage terminology", () => {
  const realMachine = readExtensionFile("docs", "real-machine-test-spec-ja.md")
  assert.match(realMachine, /指摘確認・振り分け Integrity 実機テスト/)
  assert.doesNotMatch(realMachine, /トレーサビリティ確認を開く|人による判定一覧を作成|人による判定 Integrity/)
})

test("current Task 4 action contract routes traceability prep into the primary GUI stage", () => {
  const actionContracts = readExtensionFile("docs", "workflow-action-contracts-ja.md")
  assert.match(actionContracts, /bobCodeConsistency\.openTraceabilityPrep[^\n]*主GUI[^\n]*トレーサビリティ整理/)
  assert.doesNotMatch(actionContracts, /Traceability Prep Webview を開く/)
})

test("current Task 4 operational docs route every later step through the one primary GUI", () => {
  const realMachine = readExtensionFile("docs", "real-machine-test-spec-ja.md")
  assert.match(realMachine, /整合プレレビューを開始[\s\S]*トレーサビリティ整理/)
  assert.match(realMachine, /整合プレレビューを開始[\s\S]*指摘確認・振り分け/)
  assert.doesNotMatch(realMachine, /トレーサビリティ確認を開く|人による判定一覧を作成/)

  const uat = readExtensionFile("docs", "triage-integrity-ibm-bob-uat-runbook-ja.md")
  assert.match(uat, /現行UI[\s\S]*整合プレレビュー[\s\S]*指摘確認・振り分け/)
  assert.match(uat, /standalone[^\n]*削除/)
  assert.doesNotMatch(uat, /Result Capture GUI を開く|Human Triage GUI を開く|Human Triage commandでpanel/)

  const hostSpec = readExtensionFile("docs", "triage-operator-extension-host-test-spec-ja.md")
  assert.match(hostSpec, /現行UI[\s\S]*整合プレレビュー[\s\S]*指摘確認・振り分け/)
  assert.doesNotMatch(hostSpec, /Human Triage commandでpanel/)
})

test("current Task 4 design assigns panel ownership only to the primary review GUI", () => {
  const basic = readExtensionFile("docs", "basic-design-ja.md")
  const detailed = readExtensionFile("docs", "detailed-design-ja.md")

  for (const design of [basic, detailed]) {
    assert.match(design, /openConsistencyReviewWizard/)
    assert.match(design, /bobCodeConsistencyReviewWizard/)
    assert.match(design, /トレーサビリティ整理/)
    assert.match(design, /レビュー結果取り込み/)
    assert.match(design, /指摘確認・振り分け/)
    assert.match(design, /embedded stage/)
  }
  assert.doesNotMatch(basic, /openTraceabilityPrep` は Webview を開/)
  assert.doesNotMatch(basic, /traceability prep Webview を開く/)
  assert.doesNotMatch(detailed, /traceability prep Webview を開く/)
  assert.doesNotMatch(detailed, /`Traceability Prep` panel を作成/)
})
