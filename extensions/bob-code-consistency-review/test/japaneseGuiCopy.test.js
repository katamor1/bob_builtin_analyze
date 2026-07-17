const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readJson, readSourceSet } = require("./helpers/sourceReader")

test("code consistency GUI uses Japanese-first screen names and metadata", () => {
  const source = readSourceSet([
    "webview/consistencyReviewWizard.ts",
    "webview/consistencyReviewWizardHtml.ts",
    "webview/consistencyResultCapture.ts",
    "webview/consistencyResultCaptureHtml.ts",
    "webview/consistencyHumanTriage.ts",
    "webview/consistencyHumanTriageHtml.ts",
    "webview/traceabilityPrepWebview.ts",
    "webview/traceabilityPrepWebviewAssets.ts"
  ])
  for (const label of [
    "整合プレレビューを開始",
    "Bob 出力の取り込み",
    "指摘・確認事項の判定",
    "トレーサビリティ確認"
  ]) assert.match(source, new RegExp(label))
  for (const obsolete of [
    "Consistency Review Wizard",
    "Code Consistency Result Capture",
    "Code Consistency Human Triage",
    "Traceability Prep",
    "Rollback to Original"
  ]) assert.doesNotMatch(source, new RegExp(obsolete))

  const packageJson = readJson("package.json")
  assert.equal(packageJson.displayName, "Bob コード整合プレレビュー")
  assert.ok(packageJson.contributes.commands.every((command) => command.category === "Bob コード整合プレレビュー"))
  const titles = Object.fromEntries(packageJson.contributes.commands.map(({ command, title }) => [command, title]))
  assert.equal(titles["bobCodeConsistency.openReviewWizard"], "整合プレレビューを開始")
  assert.equal(titles["bobCodeConsistency.openResultCaptureGui"], "Bob 出力の取り込みを開く")
  assert.equal(titles["bobCodeConsistency.openHumanTriageGui"], "指摘・確認事項の判定を開く")
  assert.equal(titles["bobCodeConsistency.openTraceabilityPrep"], "トレーサビリティ確認を開く")
})
