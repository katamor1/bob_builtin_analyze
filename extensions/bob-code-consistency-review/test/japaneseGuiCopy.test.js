const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readExtensionFile, readJson, readRepoFile, readSourceSet } = require("./helpers/sourceReader")

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
    "指摘確認・振り分け",
    "トレーサビリティ整理"
  ]) assert.match(source, new RegExp(label))
  assert.doesNotMatch(source, /人による判定/)
  for (const obsolete of [
    "Consistency Review Wizard",
    "Code Consistency Result Capture",
    "Code Consistency Human Triage",
    "Traceability Prep",
    "Rollback to Original"
  ]) assert.doesNotMatch(source, new RegExp(obsolete))

  const packageJson = readJson("package.json")
  assert.equal(packageJson.displayName, "Bob コード整合プレレビュー")
  assert.equal(
    packageJson.contributes.commands.find(({ command }) => command === "bobCodeConsistency.openReviewWizard").category,
    "Bob Code Consistency Review"
  )
  assert.ok(packageJson.contributes.commands
    .filter(({ command }) => command !== "bobCodeConsistency.openReviewWizard")
    .every((command) => command.category === "Bob コード整合プレレビュー"))
  const titles = Object.fromEntries(packageJson.contributes.commands.map(({ command, title }) => [command, title]))
  assert.equal(titles["bobCodeConsistency.openReviewWizard"], "整合プレレビューを開始")
  assert.equal(titles[["bobCodeConsistency", "openResultCaptureGui"].join(".")], undefined)
  assert.equal(titles[["bobCodeConsistency", "openHumanTriageGui"].join(".")], undefined)
  assert.equal(titles["bobCodeConsistency.openTraceabilityPrep"], "トレーサビリティ整理を開く")
  assert.equal(titles["bobCodeConsistency.triage"], "指摘確認・振り分け一覧を作成")

  const readme = readExtensionFile("README.md")
  assert.match(readme, /トレーサビリティ整理画面/)
  assert.match(readme, /指摘確認・振り分け一覧を作成/)
  assert.doesNotMatch(readme, /トレーサビリティ確認画面|人による判定一覧を作成|指摘・確認事項の判定/)

  const uat = readRepoFile("docs", "gui-first-operation-operator-uat-guide-ja.md")
  const consistencySection = uat.match(/## 3\. 整合プレレビュー UAT[\s\S]*?(?=\n## 4\.)/)?.[0]
  assert.ok(consistencySection)
  assert.match(consistencySection, /トレーサビリティ整理を開く/)
  assert.match(consistencySection, /指摘確認・振り分け/)
  assert.doesNotMatch(consistencySection, /トレーサビリティ確認を開く|指摘・確認事項の判定|人による判定/)
})

test("current real-machine test specification uses canonical consistency stage terminology", () => {
  const realMachineSpec = readExtensionFile("docs", "real-machine-test-spec-ja.md")

  assert.match(realMachineSpec, /整合プレレビューを開始/)
  assert.match(realMachineSpec, /トレーサビリティ整理/)
  assert.match(realMachineSpec, /指摘確認・振り分け/)
  assert.equal((realMachineSpec.match(/指摘確認・振り分け画面/g) ?? []).length, 2)
  assert.doesNotMatch(realMachineSpec, /トレーサビリティ確認を開く|人による判定一覧を作成|指摘・確認事項の判定/)
  assert.doesNotMatch(realMachineSpec, /トレーサビリティ整理を開く|指摘確認・振り分け一覧を作成/)
})

test("current Japanese GUI validation note names the rendered consistency triage title", () => {
  const validation = readExtensionFile("docs", "japanese-gui-validation-2026-07-17.md")

  assert.match(validation, /日本語 Webview タイトル `指摘確認・振り分け`/)
  assert.doesNotMatch(validation, /指摘・確認事項の判定/)
})
