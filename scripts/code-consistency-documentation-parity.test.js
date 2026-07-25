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

test("Code Consistency current design mirrors the implemented panel and stage contract", () => {
  const stages = read("extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardStages.ts")
  const wizard = read("extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts")
  const design = read("extensions/bob-code-consistency-review/docs/detailed-design-ja.md")

  assertContainsAll(stages, [
    '| "review"',
    '| "traceability"',
    '| "review-result-capture"',
    '| "triage"'
  ], "Code Consistency runtime stage type")
  assert.ok(wizard.includes('createWebviewPanel("bobCodeConsistencyReviewWizard", "整合プレレビュー"'))
  assert.equal(wizard.includes("panel.reveal("), false, "the current wizard creates a panel instead of revealing a cached singleton")

  assertContainsAll(design, [
    '"review"',
    '"traceability"',
    '"review-result-capture"',
    '"triage"',
    "呼び出しごとに新しいWebview panel"
  ], "Code Consistency detailed design")

  for (const stale of [
    '| "input"',
    '| "preprocess"',
    '| "result"',
    '| "decision"',
    "既存panelを`reveal()`"
  ]) {
    assert.equal(design.includes(stale), false, `Code Consistency detailed design must not retain stale contract: ${stale}`)
  }
})

test("Code Consistency current design names implemented modules instead of speculative paths", () => {
  const design = read("extensions/bob-code-consistency-review/docs/detailed-design-ja.md")
  const requiredPaths = [
    "extensions/bob-code-consistency-review/src/commands/reviewInputCommands.ts",
    "extensions/bob-code-consistency-review/src/commands/workspaceCommands.ts",
    "extensions/bob-code-consistency-review/src/core/traceabilityCatalogStore.ts",
    "extensions/bob-code-consistency-review/src/webview/consistencyReviewWizardStages.ts",
    "extensions/bob-code-consistency-review/src/triage/triageTypes.ts",
    "extensions/bob-code-consistency-review/src/triage/triageSource.ts",
    "extensions/bob-code-consistency-review/src/triage/triageDecisions.ts",
    "extensions/bob-code-consistency-review/src/triage/triageProjection.ts",
    "extensions/bob-code-consistency-review/src/triage/triageFileTransaction.ts",
    "extensions/bob-code-consistency-review/src/triage/humanTriageWorkspace.ts"
  ]

  for (const relativePath of requiredPaths) {
    assert.ok(fs.existsSync(path.join(repoRoot, relativePath)), `implemented module is missing: ${relativePath}`)
    assert.ok(design.includes(relativePath.replace("extensions/bob-code-consistency-review/", "")), `design must name implemented module: ${relativePath}`)
  }

  for (const speculative of ["core/traceabilityStore.ts"]) {
    assert.equal(design.includes(speculative), false, `design must not name speculative module: ${speculative}`)
  }
})
