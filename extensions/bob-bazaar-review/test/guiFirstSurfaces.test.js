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

test("Bazaar review GUI renders Review Run Wizard v3 resume and recovery surfaces", () => {
  const { renderHtml } = require("../out/ui/reviewGuiHtml")
  const html = renderHtml("vscode-resource:")
  const source = readSrc("ui/reviewGui.ts")

  assert.match(html, /Wizard v3/)
  assert.match(html, /id="campaignId"/)
  assert.match(html, /id="reviewId"/)
  assert.match(html, /id="runState"/)
  assert.match(html, /id="openResultCapture"/)
  assert.match(html, /id="openHumanTriage"/)
  assert.match(html, /id="incompleteRun"/)
  assert.match(html, /id="refreshReviewRuns"/)
  assert.match(html, /id="resumeReviewRun"/)
  assert.match(html, /id="phaseStatuses"/)
  assert.match(html, /id="runArtifacts"/)
  assert.match(html, /id="recoverLegacyReview"/)
  assert.match(html, /type: "refreshReviewRuns"/)
  assert.match(html, /type: "resumeReviewRun"/)
  assert.match(html, /type: "recoverLegacyReview"/)
  assert.match(source, /startReviewRun/)
  assert.match(source, /recordReviewPacket/)
  assert.match(source, /buildReviewRunMetadataSection/)
  assert.match(source, /reviewRunCommandInput/)
  assert.match(source, /listReviewRuns/)
  assert.match(source, /nextReviewRunAction/)
  assert.match(source, /listLegacyReviewCandidates/)
  assert.match(source, /previewLegacyReviewRecovery/)
  assert.match(source, /recoverLegacyReviewRun/)
  assert.doesNotMatch(html, /onclick=/)
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

test("Bazaar human triage GUI renders metrics decision validation and finalize actions", () => {
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
      reviewRunStatus: "in_progress",
      phaseStatuses: {
        target: "completed",
        packet: "completed",
        result: "completed",
        triage: "completed",
        record: "in_progress",
        summary: "not_started"
      },
      baselineReviewMinutes: 15,
      bobReviewMinutes: 2.5,
      humanTriageMinutes: 1.2,
      canFinalize: true,
      issues: [],
      items: [
        {
          finding_id: "F-1",
          rule_id: "RULE-1",
          decision: "needs_investigation",
          owner: "team-a",
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
  assert.match(html, /id="baselineReviewMinutes"/)
  assert.match(html, /id="bobReviewMinutes"/)
  assert.match(html, /id="humanTriageMinutes"/)
  assert.match(html, /data-action="createTriage"/)
  assert.match(html, /data-action="saveDecisions"/)
  assert.match(html, /data-action="saveMetrics"/)
  assert.match(html, /data-action="finalizeReviewRun"/)
  assert.doesNotMatch(html, /data-action="generateSummary"/)
  assert.match(html, /acceptedにはownerまたはaction/)
  assert.match(html, /needs_investigationにはowner/)
  assert.match(html, /F-1/)
  assert.match(html, /needs_investigation/)
  assert.match(html, /nonce-456/)
  assert.match(source, /validateReviewRunCommandInput/)
  assert.match(source, /recordTriageCompleted/)
  assert.match(source, /correctActiveReviewRunMetrics/)
  assert.match(source, /finalizeReviewRun/)
  assert.match(source, /vscode\.workspace\.workspaceFolders/)
  assert.doesNotMatch(html, /onclick=/)
})

test("Campaign Dashboard command is registered and Review GUI opens it with fixed context", () => {
  const packageJson = readJson("package.json")
  const extensionSource = readSrc("extension.ts")
  const reviewSource = readSrc("ui/reviewGui.ts")
  const { renderHtml } = require("../out/ui/reviewGuiHtml")
  const html = renderHtml("vscode-resource:")

  assertContributesCommand(packageJson, "bobBazaar.openCampaignDashboard")
  assert.match(extensionSource, /openBazaarCampaignDashboardGui/)
  assert.match(extensionSource, /registerCommand\(\s*"bobBazaar\.openCampaignDashboard"/)
  assert.match(html, /id="openCampaignDashboard"/)
  assert.match(html, /type: "openCampaignDashboard"/)
  assert.match(reviewSource, /bobBazaar\.openCampaignDashboard/)
  assert.match(reviewSource, /campaignId/)
  assert.doesNotMatch(html, /onclick=/)
})

test("project rule authoring is a GUI-first environment, source-scope, and AI-consent surface", () => {
  const { renderRuleAuthoringGuiHtml } = require("../out/ui/ruleAuthoringGuiHtml")
  const html = renderRuleAuthoringGuiHtml({
    cspSource: "vscode-resource:",
    phase: "sources",
    environment: {
      workspaceName: "project-one",
      workspaceReady: true,
      bobExtensionAvailable: true,
      configuredBobModelRoute: "Configured Bob workflow model"
    },
    runId: "authoring-run-1",
    resumableRuns: [],
    sources: [{
      sourceId: "selected-1",
      logicalName: "engineering-policy.docx",
      mediaType: "docx",
      byteSize: 1024,
      extractionStatus: "success",
      warnings: []
    }],
    chunks: [{
      chunkId: "chunk-1",
      sourceId: "src-aaaaaaaaaaaa",
      title: "Engineering policy",
      locator: "Heading: Engineering",
      utf8Bytes: 128,
      included: true
    }],
    aiPayload: {
      logicalNames: ["engineering-policy.docx"],
      selectedChunkCount: 1,
      utf8Bytes: 128
    },
    warnings: [],
    scopeOverflow: false,
    exclusionsApproved: true,
    canConfirmAiPayload: true,
    status: "Ready for explicit AI consent"
  }, "nonce-rule-authoring")

  assert.match(html, /Environment/i)
  assert.match(html, /Source Selection/i)
  assert.match(html, /Extraction (?:Preview|Scope)/i)
  assert.match(html, /AI (?:Payload|Consent)/i)
  assert.match(html, /Configured Bob workflow model/)
  assert.match(html, /engineering-policy\.docx/)
  assert.match(html, /data-action="chooseSources"/)
  assert.match(html, /data-action="extractSources"/)
  assert.match(html, /data-action="confirmAiPayload"/)
  assert.match(html, /nonce-rule-authoring/)
  assert.doesNotMatch(html, /onclick=/)
})
