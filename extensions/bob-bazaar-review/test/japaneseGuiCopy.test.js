const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readJson, readSourceSet } = require("./helpers/sourceReader")

test("Bazaar GUI source uses approved Japanese screen names", () => {
  const source = readSourceSet([
    "ui/reviewGuiHtml.ts",
    "ui/reviewGuiHtmlAssets.ts",
    "ui/resultCaptureGuiHtml.ts",
    "ui/humanTriageGuiHtml.ts",
    "ui/campaignDashboardGuiHtml.ts",
    "ui/ruleAuthoringGuiHtml.ts",
    "ui/ruleProposalTriageGuiHtml.ts"
  ])
  for (const label of [
    "Bazaar レビューを開始",
    "レビュー手順",
    "レビュー結果取り込み",
    "指摘確認・振り分け",
    "レビュー実績",
    "規約資料の取り込み",
    "規約案の確認・採否"
  ]) assert.match(source, new RegExp(label))
  for (const obsolete of [
    "Wizard v3 / Review Run",
    "Project Rule Source Wizard",
    "Project Rule Proposal Triage",
    ">Result Capture<",
    ">Human Triage<",
    ">Campaign Dashboard<"
  ]) assert.doesNotMatch(source, new RegExp(obsolete))
})

test("Bazaar command metadata is Japanese-first without changing command IDs", () => {
  const packageJson = readJson("package.json")
  assert.equal(packageJson.displayName, "Bob Bazaar レビュー")
  assert.equal(packageJson.contributes.configuration.title, "Bob Bazaar レビュー")
  const commands = new Map(packageJson.contributes.commands.map((entry) => [entry.command, entry]))
  assert.equal(commands.get("bobBazaar.openReviewGui").title, "レビューを開始")
  assert.equal(commands.get("bobBazaar.openReviewGui").category, "Bob Bazaar Review")
  assert.equal(commands.has(["bobBazaar", "openCampaignDashboard"].join(".")), false)
  assert.equal(commands.has(["bobBazaar", "openResultCaptureGui"].join(".")), false)
  assert.equal(commands.has(["bobBazaar", "openHumanTriageGui"].join(".")), false)
  assert.equal(commands.get("bobBazaar.authorProjectRulesFromDocuments").title, "資料からプロジェクト規約を作成")
  assert.equal(commands.get("bobBazaar.authorProjectRulesFromDocuments").category, "Bob Bazaar Review")
  assert.equal(commands.get("bobBazaar.records.initCampaign").title, "実績キャンペーンを初期化")
  assert.equal(commands.get("bobBazaar.records.createRecord").title, "実績記録を作成")
  assert.equal(commands.get("bobBazaar.records.createTriage").title, "指摘確認・振り分け一覧を作成")
  assert.equal(commands.get("bobBazaar.records.validateTriage").title, "指摘確認・振り分け内容を検証")
  assert.equal(commands.get("bobBazaar.records.generateSummary").title, "集計レポートを生成")
  for (const [commandId, entry] of commands) {
    if (!["bobBazaar.openReviewGui", "bobBazaar.authorProjectRulesFromDocuments"].includes(commandId)) {
      assert.equal(entry.category, "Bob Bazaar レビュー")
    }
  }
})
