const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  assertContributesCommand,
  readJson,
  readSrc
} = require("./helpers/sourceReader")

test("package and extension expose Review Run-aware capture and triage commands", () => {
  const packageJson = readJson("package.json")
  const source = readSrc("extension.ts")

  for (const command of [
    "bobBazaar.openResultCaptureGui",
    "bobBazaar.openHumanTriageGui"
  ]) {
    assertContributesCommand(packageJson, command)
    assert.match(source, new RegExp(`registerCommand\\(\\s*"${command.replace(/\./g, "\\.")}"`))
  }
  assert.match(source, /ReviewRunCommandInput/)
  assert.match(source, /openBazaarResultCaptureGui\(context, input\)/)
  assert.match(source, /openBazaarHumanTriageGui\(context, input\)/)
})

test("Bazaar review GUI renders Review Run Wizard v3 and persists packet handoff", () => {
  const { renderHtml } = require("../out/ui/reviewGuiHtml")
  const html = renderHtml("vscode-resource:")
  const source = readSrc("ui/reviewGui.ts")

  assert.match(html, /Wizard v3/)
  assert.match(html, /id="campaignId"/)
  assert.match(html, /id="reviewId"/)
  assert.match(html, /id="runState"/)
  assert.match(html, /id="openResultCapture"/)
  assert.match(html, /id="openHumanTriage"/)
  assert.match(source, /startReviewRun/)
  assert.match(source, /recordReviewPacket/)
  assert.match(source, /buildReviewRunMetadataSection/)
  assert.match(source, /reviewRunCommandInput/)
})

test("Bazaar result capture GUI binds to an active Review Run", () => {
  const { renderResultCaptureHtml } = require("../out/ui/resultCaptureGuiHtml")
  const source = readSrc("ui/resultCaptureGui.ts")
  const html = renderResultCaptureHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-123",
    reviewRun: {
      workspaceRoot: "C:/workspace",
      campaignId: "campaign-1",
      reviewId: "review-1"
    }
  })

  assert.match(html, /Result Capture/)
  assert.match(html, /Active Review Run/)
  assert.match(html, /campaign-1/)
  assert.match(html, /review-1/)
  assert.match(html, /exact review_id/)
  assert.match(html, /data-action="captureCandidates"/)
  assert.match(html, /data-action="captureManual"/)
  assert.match(html, /data-action="validateActive"/)
  assert.match(html, /data-action="openTriage"/)
  assert.match(html, /nonce-123/)
  assert.match(html, /vscode\.postMessage/)
  assert.match(source, /validateReviewRunCommandInput/)
  assert.match(source, /vscode\.workspace\.workspaceFolders/)
  assert.match(source, /expectedReviewId: reviewRun\?\.reviewId/)
  assert.doesNotMatch(html, /onclick=/)
})

test("Bazaar human triage GUI renders read-only Review Run identity and decision actions", () => {
  const { renderHumanTriageHtml } = require("../out/ui/humanTriageGuiHtml")
  const source = readSrc("ui/humanTriageGui.ts")
  const html = renderHumanTriageHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-456",
    model: {
      campaignId: "phase1",
      reviewId: "review-1",
      reviewResultJsonPath: ".bob/review/results/review-1.json",
      triagePath: ".bob-review-records/campaigns/phase1/records/review-1/triage.yaml",
      reviewRunBound: true,
      issues: [],
      items: [
        {
          finding_id: "F-1",
          rule_id: "RULE-1",
          decision: "needs_investigation",
          action: "investigate",
          reason: "確認が必要"
        }
      ]
    }
  })

  assert.match(html, /Human Triage/)
  assert.match(html, /Active Review Runから引き継いだ値/)
  assert.match(html, /id="campaignId"[^>]*readonly/)
  assert.match(html, /id="reviewId"[^>]*readonly/)
  assert.match(html, /id="reviewResultJsonPath"[^>]*readonly/)
  assert.match(html, /data-action="createTriage"/)
  assert.match(html, /data-action="saveDecisions"/)
  assert.match(html, /data-action="generateSummary"/)
  assert.match(html, /F-1/)
  assert.match(html, /needs_investigation/)
  assert.match(html, /nonce-456/)
  assert.match(source, /validateReviewRunCommandInput/)
  assert.match(source, /vscode\.workspace\.workspaceFolders/)
  assert.doesNotMatch(html, /onclick=/)
})
