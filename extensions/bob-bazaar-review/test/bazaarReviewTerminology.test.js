const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  readExtensionFile,
  readJson,
  readSrc
} = require("./helpers/sourceReader")

const REMOVED_GUI_COMMANDS = [
  ["bobBazaar", "openCampaignDashboard"].join("."),
  ["bobBazaar", "openResultCaptureGui"].join("."),
  ["bobBazaar", "openHumanTriageGui"].join(".")
]

test("current Bazaar documentation routes users through the single primary GUI", () => {
  const currentDocs = [
    "README.md",
    "docs/README-ja.md",
    "docs/real-machine-test-spec-ja.md",
    "docs/review-run-command-boundary-ja.md",
    "docs/review-run-v3-acceptance-ja.md",
    "docs/review-run-v3-iteration1-ja.md",
    "docs/review-run-v3-iteration2-ja.md",
    "docs/review-run-v3-iteration3-dashboard-ja.md",
    "docs/review-run-v3-integration-result-ja.md",
    "docs/unit-test-spec-ja.md"
  ].map((file) => readExtensionFile(...file.split("/"))).join("\n")

  assert.match(currentDocs, /レビュー結果取り込み/)
  assert.match(currentDocs, /指摘確認・振り分け/)
  assert.match(currentDocs, /レビュー実績/)
  assert.doesNotMatch(currentDocs, /packet、result、人による判定/)
  assert.doesNotMatch(currentDocs, /時間指標をDashboardで/)
  assert.doesNotMatch(currentDocs, /\b(?:Result Capture|Human Triage|Campaign Dashboard)\b/)
  assert.doesNotMatch(currentDocs, /standalone mode/i)
  for (const command of REMOVED_GUI_COMMANDS) {
    assert.doesNotMatch(currentDocs, new RegExp(command.replace(/\./g, "\\.")))
  }
})

test("real-machine operator instructions use the approved review-results name", () => {
  const realMachine = readExtensionFile("docs", "real-machine-test-spec-ja.md")
  const legacyOperatorLines = realMachine
    .split(/\r?\n/)
    .filter((line) => /Dashboard(?:起動|を開く|全体|のrefresh| refresh)/.test(line))

  assert.deepEqual(legacyOperatorLines, [])
})

test("primary command and exported Markdown use the approved current names", () => {
  const packageJson = readJson("package.json")
  const command = packageJson.contributes.commands.find((entry) => entry.command === "bobBazaar.openReviewGui")
  const exportSource = readSrc("dashboard/campaignDashboardExport.ts")
  const currentInstructions = [
    readExtensionFile("README.md"),
    readExtensionFile("docs", "real-machine-test-spec-ja.md")
  ].join("\n")

  const displayName = `${command.category}: ${command.title}`
  assert.equal(displayName, "Bob Bazaar Review: レビューを開始")
  assert.match(currentInstructions, new RegExp(displayName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.match(exportSource, /# IBM Bob Bazaar レビュー実績/)
  assert.match(exportSource, /## 指摘確認・振り分け待ち/)
  assert.doesNotMatch(exportSource, /Campaign Dashboard/)
  assert.doesNotMatch(exportSource, /Human Triage Pending/)
})

test("terminology migration preserves persisted schema field names", () => {
  const exportSource = readSrc("dashboard/campaignDashboardExport.ts")
  const typeSource = readSrc("dashboard/campaignDashboardTypes.ts")

  assert.match(exportSource, /"human_triage_minutes"/)
  assert.match(typeSource, /human_triage_minutes_total/)
  assert.match(typeSource, /human_triage_minutes/)
})
