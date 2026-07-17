const assert = require("node:assert/strict")
const { test } = require("node:test")
const labels = require("../out/ui/displayLabels")

test("Bazaar review values use Japanese display labels", () => {
  assert.equal(labels.reviewRunPhaseLabel("packet"), "レビュー資料")
  assert.equal(labels.reviewRunStatusLabel("in_progress"), "実行中")
  assert.equal(labels.reviewDecisionLabel("needs_investigation"), "要調査")
  assert.equal(labels.targetModeLabel("revisionRange"), "リビジョン範囲")
  assert.equal(labels.nextReviewActionLabel("humanTriage"), "人による判定")
  assert.equal(labels.extractionStatusLabel("requires_ocr"), "OCR が必要")
  assert.equal(labels.proposalOperationLabel("retire"), "廃止")
  assert.equal(labels.confidenceLabel("high"), "高")
  assert.equal(labels.severityLabel("warning"), "警告")
  assert.equal(labels.ruleAuthoringPhaseLabel("evidence_selection"), "対象範囲の選択")
  assert.equal(labels.proposalAssetLabel("project_context"), "プロジェクト情報")
})

test("unknown Bazaar UI values use a safe fallback", () => {
  assert.equal(labels.reviewRunPhaseLabel("future"), "不明（future）")
  assert.equal(labels.reviewDecisionLabel("future"), "不明（future）")
  assert.equal(labels.ruleAuthoringPhaseLabel("future"), "不明（future）")
})
