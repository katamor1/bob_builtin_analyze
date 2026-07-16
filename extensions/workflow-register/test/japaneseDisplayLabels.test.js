const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  workflowRunStatusLabel,
  workflowStepStatusLabel,
  workflowStepCompletionLabel
} = require("../out/ui/displayLabels")

test("known workflow statuses use Japanese labels", () => {
  assert.equal(workflowRunStatusLabel("running"), "実行中")
  assert.equal(workflowRunStatusLabel("reviewing"), "人による確認待ち")
  assert.equal(workflowRunStatusLabel("held"), "手動操作待ち")
  assert.equal(workflowRunStatusLabel("completed"), "完了")
  assert.equal(workflowStepStatusLabel("pending"), "未開始")
  assert.equal(workflowStepCompletionLabel("reused", "completed"), "再利用")
})

test("unknown statuses use a safe fallback", () => {
  assert.equal(workflowRunStatusLabel("future"), "不明（future）")
  assert.equal(workflowStepStatusLabel("future"), "不明（future）")
})
