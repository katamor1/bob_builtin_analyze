const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  assertContributesCommand,
  readJson,
  readSrc
} = require("./helpers/sourceReader")

function extractInlineClient(html, name) {
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  assert.equal(scripts.length, 1, `${name} renders one inline client`)
  return scripts[0][1]
}

test("package and extension expose one public Bazaar review GUI route", () => {
  const packageJson = readJson("package.json")
  const source = readSrc("extension.ts")
  const removedCommands = [
    "bobBazaar.openCampaignDashboard",
    "bobBazaar.openResultCaptureGui",
    "bobBazaar.openHumanTriageGui"
  ]

  assertContributesCommand(packageJson, "bobBazaar.openReviewGui")
  const contributed = packageJson.contributes.commands.map((entry) => entry.command)
  const activated = packageJson.activationEvents
  const palette = packageJson.contributes.menus.commandPalette.map((entry) => entry.command)
  for (const command of removedCommands) {
    assert.ok(!contributed.includes(command), `${command} is not contributed`)
    assert.ok(!activated.includes(`onCommand:${command}`), `${command} is not an activation route`)
    assert.ok(!palette.includes(command), `${command} is not in the command palette`)
    assert.doesNotMatch(source, new RegExp(`registerCommand\\(\\s*"${command.replace(/\./g, "\\.")}"`))
  }
  assert.match(source, /openBazaarReviewGui\(context\)/)
})

test("Bazaar review stages share one view type and one panel factory", () => {
  const reviewSource = readSrc("ui/reviewGui.ts")
  const embeddedSources = [
    readSrc("ui/resultCaptureGui.ts"),
    readSrc("ui/humanTriageGui.ts"),
    readSrc("ui/campaignDashboardGui.ts")
  ]

  assert.equal((reviewSource.match(/createWebviewPanel\(/g) ?? []).length, 1)
  assert.match(reviewSource, /createWebviewPanel\("bobBazaarReviewGui"/)
  assert.match(reviewSource, /type BazaarReviewStage|BazaarReviewStage/)
  for (const stage of ["review", "review-result-capture", "triage", "review-results"]) {
    assert.match(reviewSource, new RegExp(`"${stage}"`))
  }
  for (const source of embeddedSources) assert.doesNotMatch(source, /createWebviewPanel\(/)
})

test("Bazaar review GUI renders Review Run Wizard v3 resume and recovery surfaces", () => {
  const { renderHtml } = require("../out/ui/reviewGuiHtml")
  const html = renderHtml("vscode-resource:", undefined, "review-render-owner")
  const source = readSrc("ui/reviewGui.ts")

  assert.match(html, /レビュー手順/)
  assert.match(html, /キャンペーン ID/)
  assert.match(html, /レビュー ID/)
  assert.doesNotMatch(html, /Wizard v3/)
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
  assert.match(html, /review-render-owner/)
  assert.match(html, /rawPostMessage\(\{ \.\.\.message, renderToken \}\)/)
  assert.match(source, /startReviewRun/)
  assert.match(source, /recordReviewPacket/)
  assert.match(source, /buildReviewRunMetadataSection/)
  assert.match(source, /showStage\("review-result-capture"/)
  assert.match(source, /showStage\("triage"/)
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
    renderToken: "capture-render-owner",
    reviewRun: {
      workspaceRoot: "C:/workspace",
      campaignId: "campaign-1",
      reviewId: "review-1"
    }
  })

  assert.match(html, /レビュー結果取り込み/)
  assert.match(html, /現在のレビュー/)
  assert.match(html, /campaign-1/)
  assert.match(html, /review-1/)
  assert.match(html, /レビュー ID/)
  assert.match(html, /data-action="captureCandidates"/)
  assert.match(html, /data-action="captureManual"/)
  assert.match(html, /data-action="validateActive"/)
  assert.match(html, /data-action="openTriage"/)
  assert.match(html, /nonce-123/)
  assert.match(html, /vscode\.postMessage/)
  assert.match(html, /capture-render-owner/)
  assert.match(html, /postMessage\(\{[\s\S]*type: 'bazaarResultCapture\.action'/)
  assert.match(source, /getActiveReviewRun/)
  assert.match(source, /commitActiveReviewRun/)
  assert.match(source, /expectedReviewId: reviewRun\?\.reviewId/)
  assert.doesNotMatch(source, /createWebviewPanel/)
  assert.doesNotMatch(html, /onclick=/)
})

test("Bazaar human triage GUI renders metrics decision validation and finalize actions", () => {
  const { renderHumanTriageHtml } = require("../out/ui/humanTriageGuiHtml")
  const source = readSrc("ui/humanTriageGui.ts")
  const html = renderHumanTriageHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-456",
    renderToken: "triage-render-owner",
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

  assert.match(html, /指摘確認・振り分け/)
  assert.match(html, /現在のレビューから引き継いだ値/)
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
  assert.match(html, /採用には担当者または対応内容/)
  assert.match(html, /要調査には担当者/)
  assert.match(html, /F-1/)
  assert.match(html, /value="needs_investigation"[^>]*>要調査</)
  assert.match(html, /nonce-456/)
  assert.match(html, /triage-render-owner/)
  assert.match(html, /postMessage\(\{[\s\S]*type: 'bazaarHumanTriage\.action'/)
  assert.match(source, /getActiveReviewRun/)
  assert.match(source, /commitActiveReviewRun/)
  assert.match(source, /recordTriageCompleted/)
  assert.match(source, /correctActiveReviewRunMetrics/)
  assert.match(source, /finalizeReviewRun/)
  assert.doesNotMatch(source, /createWebviewPanel/)
  assert.doesNotMatch(html, /onclick=/)
})

test("Review GUI routes capture triage and review results as internal stages", () => {
  const reviewSource = readSrc("ui/reviewGui.ts")
  const { renderHtml } = require("../out/ui/reviewGuiHtml")
  const html = renderHtml("vscode-resource:")

  assert.match(html, /id="openCampaignDashboard"/)
  assert.match(html, /type: "openCampaignDashboard"/)
  assert.match(html, /レビュー結果取り込み/)
  assert.match(html, /指摘確認・振り分け/)
  assert.match(html, /レビュー実績/)
  assert.match(reviewSource, /showStage\("review-result-capture"/)
  assert.match(reviewSource, /showStage\("triage"/)
  assert.match(reviewSource, /showStage\("review-results"/)
  assert.doesNotMatch(reviewSource, /executeCommand\("bobBazaar\.open(?:CampaignDashboard|ResultCaptureGui|HumanTriageGui)"/)
  assert.doesNotMatch(html, /onclick=/)
})

test("all Bazaar review clients parse and send only render-token-owned messages", () => {
  const { renderHtml } = require("../out/ui/reviewGuiHtml")
  const { renderResultCaptureHtml } = require("../out/ui/resultCaptureGuiHtml")
  const { renderHumanTriageHtml } = require("../out/ui/humanTriageGuiHtml")
  const { renderCampaignDashboardHtml } = require("../out/ui/campaignDashboardGuiHtml")
  const clients = {
    review: extractInlineClient(renderHtml("vscode-resource:", undefined, "review-owner"), "review"),
    capture: extractInlineClient(renderResultCaptureHtml({
      cspSource: "vscode-resource:",
      nonce: "capture-nonce",
      renderToken: "capture-owner"
    }), "capture"),
    triage: extractInlineClient(renderHumanTriageHtml({
      cspSource: "vscode-resource:",
      nonce: "triage-nonce",
      renderToken: "triage-owner",
      model: {
        campaignId: "campaign-a",
        reviewId: "review-a",
        reviewResultJsonPath: ".bob/review/results/review-a.json",
        issues: [],
        items: []
      }
    }), "triage"),
    results: extractInlineClient(renderCampaignDashboardHtml({
      cspSource: "vscode-resource:",
      nonce: "results-nonce",
      renderToken: "results-owner",
      model: { campaigns: [], status: "empty" }
    }), "results")
  }

  for (const [name, script] of Object.entries(clients)) {
    assert.doesNotThrow(() => new Function(script), `${name} client parses`)
  }

  assert.match(clients.review, /const postMessage = \(message\) => rawPostMessage\(\{ \.\.\.message, renderToken \}\)/)
  assert.equal((clients.review.match(/\brawPostMessage\(/g) ?? []).length, 1)
  assert.doesNotMatch(clients.review, /\bvscode\.postMessage\(/)
  assert.match(clients.review, /postMessage\(\{ type: "ready" \}\)/)

  for (const name of ["capture", "triage", "results"]) {
    const script = clients[name]
    assert.match(script, /const postMessage = \(message\) => vscode\.postMessage\(\{ \.\.\.message, renderToken \}\);/)
    assert.equal((script.match(/\bvscode\.postMessage\(/g) ?? []).length, 1, `${name} has no direct outbound bypass`)
  }
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

  assert.match(html, /実行環境/)
  assert.match(html, /資料の選択/)
  assert.match(html, /抽出内容と対象範囲/)
  assert.match(html, /AI に送る内容の確認/)
  assert.match(html, /Configured Bob workflow model/)
  assert.match(html, /engineering-policy\.docx/)
  assert.match(html, /data-action="chooseSources"/)
  assert.match(html, /data-action="extractSources"/)
  assert.match(html, /data-action="confirmAiPayload"/)
  assert.match(html, /nonce-rule-authoring/)
  assert.doesNotMatch(html, /onclick=/)
})
