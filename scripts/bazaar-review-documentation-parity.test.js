const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")

const repoRoot = path.resolve(__dirname, "..")

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8")
}

function assertContainsAll(text, phrases, label) {
  for (const phrase of phrases) {
    assert.ok(text.includes(phrase), `${label} must document: ${phrase}`)
  }
}

test("Bazaar current design mirrors the implemented Review Run schema and UI stages", () => {
  const runTypes = read("extensions/bob-bazaar-review/src/reviewRuns/reviewRunTypes.ts")
  const uiStages = read("extensions/bob-bazaar-review/src/ui/reviewGuiStages.ts")
  const reviewGui = read("extensions/bob-bazaar-review/src/ui/reviewGui.ts")
  const design = read("extensions/bob-bazaar-review/docs/detailed-design-ja.md")

  assertContainsAll(runTypes, [
    'REVIEW_RUN_SCHEMA_VERSION = "bazaar-review-run/v1"',
    '"target" | "packet" | "result" | "triage" | "completed"',
    '"target" | "packet" | "result" | "triage" | "record" | "summary"',
    "schemaVersion: typeof REVIEW_RUN_SCHEMA_VERSION",
    "reviewPacketPath?: string",
    "reviewResultJsonPath?: string",
    "triageYamlPath?: string",
    "recordYamlPath?: string"
  ], "Review Run runtime types")

  assertContainsAll(uiStages, [
    '| "review"',
    '| "review-result-capture"',
    '| "triage"',
    '| "review-results"'
  ], "Bazaar UI stage runtime types")
  assert.ok(reviewGui.includes('createWebviewPanel("bobBazaarReviewGui", "Bazaar レビュー"'))
  assert.equal(reviewGui.includes("panel.reveal("), false, "the current GUI command creates a panel instead of revealing a cached singleton")

  assertContainsAll(design, [
    "bazaar-review-run/v1",
    '"schemaVersion"',
    '"workspaceRoot"',
    '"campaignId"',
    '"reviewId"',
    '"phase": "result"',
    '"reviewPacketPath"',
    '"reviewResultJsonPath"',
    '"triageYamlPath"',
    '"recordYamlPath"',
    '"review-result-capture"',
    '"review-results"',
    "呼び出しごとに新しいWebview panel"
  ], "Bazaar detailed design")

  for (const stale of [
    "bazaar-review-run/v3",
    '"schema_version"',
    '"campaign_id"',
    '"review_id"',
    '"stage": "result"',
    '"base_revision"',
    '"target_revision"',
    "既存panelを`reveal()`"
  ]) {
    assert.equal(design.includes(stale), false, `Bazaar detailed design must not retain stale contract: ${stale}`)
  }
})

test("Bazaar current design names implemented source modules instead of speculative paths", () => {
  const design = read("extensions/bob-bazaar-review/docs/detailed-design-ja.md")
  const requiredPaths = [
    "extensions/bob-bazaar-review/src/ui/reviewGuiStages.ts",
    "extensions/bob-bazaar-review/src/reviewRuns/reviewRunState.ts",
    "extensions/bob-bazaar-review/src/reviewRuns/reviewRunCoordinator.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/ruleProposalValidation.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/ruleApplyPlan.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/ruleApplyTransaction.ts",
    "extensions/bob-bazaar-review/src/records/reviewRecordCommands.ts",
    "extensions/bob-bazaar-review/src/records/reviewRecordStore.ts",
    "extensions/bob-bazaar-review/src/records/reviewTriage.ts",
    "extensions/bob-bazaar-review/src/workflow/workflowActions.ts",
    "extensions/bob-bazaar-review/src/workspace/workspaceCommands.ts"
  ]

  for (const relativePath of requiredPaths) {
    assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `implemented module is missing: ${relativePath}`)
    assert.ok(design.includes(relativePath.replace("extensions/bob-bazaar-review/", "")), `design must name implemented module: ${relativePath}`)
  }

  for (const speculative of [
    "sourceExtraction.ts",
    "proposalValidation.ts",
    "campaignStore.ts",
    "reviewRecord.ts",
    "records/triage.ts",
    "records/summary.ts"
  ]) {
    assert.equal(design.includes(speculative), false, `design must not name speculative module: ${speculative}`)
  }
})
