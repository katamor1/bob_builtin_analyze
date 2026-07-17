const assert = require("node:assert/strict")
const { test } = require("node:test")
const labels = require("../out/webview/displayLabels")

test("consistency review values use Japanese labels", () => {
  assert.equal(labels.reviewFocusLabel("requirement-code-consistency"), "要求とコードの整合")
  assert.equal(labels.changeTypeLabel("spec_change"), "仕様変更")
  assert.equal(labels.artifactKindLabel("basic_design"), "基本設計")
  assert.equal(labels.traceabilityStatusLabel("proposed"), "未承認")
  assert.equal(labels.humanDecisionLabel("needs_investigation"), "要調査")
  assert.equal(labels.severityLabel("critical"), "緊急")
  assert.equal(labels.confidenceLabel("medium"), "中")
  assert.equal(labels.sourceTypeLabel("question"), "確認事項")
})

test("unknown consistency values use a safe fallback", () => {
  assert.equal(labels.reviewFocusLabel("future"), "不明（future）")
  assert.equal(labels.severityLabel("future"), "不明（future）")
})
