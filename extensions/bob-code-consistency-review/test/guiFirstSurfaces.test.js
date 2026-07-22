const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  assertContributesCommand,
  readJson,
  readSrc
} = require("./helpers/sourceReader")

function assertApprovedStageNavigation(html) {
  const navigation = html.match(/<nav class="actions" aria-label="レビュー工程">[\s\S]*?<\/nav>/)?.[0]
  assert.ok(navigation, "review stage navigation")
  for (const label of ["レビュー準備", "トレーサビリティ整理", "レビュー結果取り込み", "指摘確認・振り分け"]) {
    assert.match(navigation, new RegExp(`>${label}<\\/button>`))
  }
  assert.doesNotMatch(navigation, />トレーサビリティ<\/button>/)
  assert.doesNotMatch(navigation, /人による判定/)
}

test("package and extension expose one code consistency GUI command", () => {
  const packageJson = readJson("package.json")
  const source = readSrc("extension.ts")

  assertContributesCommand(packageJson, "bobCodeConsistency.openReviewWizard")
  assert.match(source, /registerCommand\(\s*"bobCodeConsistency\.openReviewWizard"/)
  for (const obsoleteCommand of [
    "bobCodeConsistency.openResultCaptureGui",
    "bobCodeConsistency.openHumanTriageGui"
  ]) {
    assert.equal(packageJson.contributes.commands.some(({ command }) => command === obsoleteCommand), false)
    assert.doesNotMatch(source, new RegExp(`registerCommand\\(\\s*"${obsoleteCommand.replace(/\./g, "\\.")}"`))
  }
})

test("only the review wizard owns a webview panel and all review stages are routed through it", () => {
  const sources = [
    readSrc("webview", "consistencyReviewWizard.ts"),
    readSrc("webview", "consistencyResultCapture.ts"),
    readSrc("webview", "consistencyHumanTriage.ts"),
    readSrc("webview", "traceabilityPrepWebview.ts")
  ]
  const combined = sources.join("\n")

  assert.equal((combined.match(/createWebviewPanel\(/g) ?? []).length, 1)
  assert.match(sources[0], /createWebviewPanel\(\s*"bobCodeConsistencyReviewWizard"/)
  for (const stage of ["review", "traceability", "review-result-capture", "triage"]) {
    assert.match(combined, new RegExp(`"${stage}"`))
  }
})

test("embedded stage initialization treats a rejected render as a structured failure", () => {
  for (const source of [
    readSrc("webview", "consistencyResultCapture.ts"),
    readSrc("webview", "consistencyHumanTriage.ts"),
    readSrc("webview", "traceabilityPrepWebview.ts")
  ]) {
    assert.match(source, /if \(!this\.(?:host\.)?render\(/)
  }
})

test("consistency review wizard renders evidence picker traceability and package actions", () => {
  const { renderConsistencyReviewWizardHtml } = require("../out/webview/consistencyReviewWizardHtml")
  const html = renderConsistencyReviewWizardHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-123",
    model: {
      workspaceRoot: "C:\\repo",
      base: "HEAD~1",
      head: "HEAD",
      vcs: "git",
      changeType: "maintenance",
      focus: ["requirement-code-consistency", "design-code-consistency"],
      documents: [
        { kind: "requirements", path: "docs/requirements.md", label: "docs/requirements.md", description: "REQ-1" }
      ],
      traceability: { proposed: 2, accepted: 1, rejected: 0, deprecated: 0, errors: 0, warnings: 1 },
      packagePreview: [
        { label: "bob-input.md", path: ".bob-review/review-package/bob-input.md" }
      ],
      initialization: {
        initialized: false,
        workflowPath: "C:\\repo\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md",
        missing: [".bob/workflows/code-consistency-review/WORKFLOW.md"]
      },
      warnings: [],
      status: { tone: "muted", message: "未実行" }
    }
  })

  assert.match(html, /整合プレレビューを開始/)
  assertApprovedStageNavigation(html)
  assert.match(html, /変更範囲/)
  assert.match(html, /関連資料の選択/)
  assert.match(html, /確認観点/)
  assert.match(html, /トレーサビリティ整理/)
  assert.match(html, /Bob に渡す資料/)
  assert.match(html, /value="maintenance" selected>保守変更<\/option>/)
  assert.match(html, /data-focus="requirement-code-consistency"[^>]*checked[^>]*>要求とコードの整合<\/label>/)
  assert.match(html, /data-action="createReviewInput"/)
  assert.match(html, /data-action="openTraceabilityPrep"/)
  assert.match(html, />トレーサビリティ整理を開く<\/button>/)
  assert.match(html, /data-action="preprocess"/)
  assert.match(html, /data-action="openResultCapture"/)
  assert.match(html, />指摘確認・振り分けへ進む<\/button>/)
  assert.match(html, /docs\/requirements\.md/)
  assert.match(html, /nonce-123/)
  assert.match(html, /\.bob ワークフロー初期化: 未完了/)
  assert.match(html, /data-action="initializeWorkspace"/)
  assert.match(html, /\.bob\/workflows\/code-consistency-review\/WORKFLOW\.md/)
  assert.doesNotMatch(html, /onclick=/)
})

test("all embedded review stage templates expose only the approved navigation labels", () => {
  const sources = [
    readSrc("webview", "consistencyReviewWizardHtml.ts"),
    readSrc("webview", "consistencyResultCaptureHtml.ts"),
    readSrc("webview", "consistencyHumanTriageHtml.ts"),
    readSrc("webview", "traceabilityPrepWebview.ts")
  ]

  for (const source of sources) {
    assertApprovedStageNavigation(source)
    assert.match(source, /consistencyReview\.navigate/)
  }
})

test("consistency review wizard hides workspace initialization card after initialization", () => {
  const { renderConsistencyReviewWizardHtml } = require("../out/webview/consistencyReviewWizardHtml")
  const html = renderConsistencyReviewWizardHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-123",
    model: {
      workspaceRoot: "C:\\repo",
      base: "HEAD~1",
      head: "HEAD",
      vcs: "git",
      changeType: "maintenance",
      focus: ["requirement-code-consistency", "design-code-consistency"],
      documents: [],
      traceability: { proposed: 0, accepted: 0, rejected: 0, deprecated: 0, errors: 0, warnings: 0 },
      packagePreview: [],
      initialization: {
        initialized: true,
        workflowPath: "C:\\repo\\.bob\\workflows\\code-consistency-review\\WORKFLOW.md",
        missing: []
      },
      warnings: [],
      status: { tone: "ok", message: "初期化が完了しました" }
    }
  })

  assert.doesNotMatch(html, /\.bob ワークフロー初期化: 未完了/)
  assert.doesNotMatch(html, /data-action="initializeWorkspace"/)
  assert.match(html, /初期化が完了しました/)
  assert.match(html, /class="status ok"/)
})

test("code consistency result capture GUI exposes YAML validation before triage", () => {
  const { renderConsistencyResultCaptureHtml } = require("../out/webview/consistencyResultCaptureHtml")
  const html = renderConsistencyResultCaptureHtml({ cspSource: "vscode-resource:", nonce: "nonce-456" })

  assertApprovedStageNavigation(html)
  assert.match(html, /Bob 出力の取り込み/)
  assert.match(html, /Bob 出力（YAML）/)
  assert.match(html, /クリップボードから取り込む/)
  assert.match(html, /保存済みの Bob 出力を検証/)
  assert.match(html, /指摘確認・振り分けへ進む/)
  assert.match(html, /data-action="captureManual"/)
  assert.match(html, /data-action="captureClipboard"/)
  assert.match(html, /data-action="validateOutput"/)
  assert.match(html, /data-action="openHumanTriage"/)
  assert.match(html, /vscode\.postMessage/)
  assert.doesNotMatch(html, /onclick=/)
})

test("code consistency human triage GUI renders source context and conflict tokens", () => {
  const { renderConsistencyHumanTriageHtml } = require("../out/webview/consistencyHumanTriageHtml")
  const html = renderConsistencyHumanTriageHtml({
    cspSource: "vscode-resource:",
    nonce: "nonce-789",
    model: {
      outDir: ".bob-review/human-triage",
      bobOutputPath: ".bob-review/bob-output/bob-output.yaml",
      sourceSha256: "abc123",
      decisionRevision: 4,
      items: [
        {
          source_id: "PRE-001",
          source_type: "finding",
          category: "risk",
          severity: "high",
          confidence: "medium",
          summary: "要確認",
          source_reason: "根拠を確認する",
          impact: "利用者影響",
          recommended_action: "実装を修正する",
          human_check: "設計担当が確認する",
          evidence: [{ evidence_id: "SRC-0001", type: "code", ref: "src/a.ts:1" }],
          decision: "",
          final_severity: "",
          owner: "",
          reason: "",
          review_comment: "",
          follow_up: { required: false, action: "", due: "" }
        }
      ],
      issues: []
    }
  })

  assertApprovedStageNavigation(html)
  assert.match(html, /<title>指摘確認・振り分け<\/title>/)
  assert.match(html, /<h1>指摘確認・振り分け<\/h1>/)
  assert.match(html, /value="needs_investigation">要調査<\/option>/)
  assert.match(html, /value="critical">緊急<\/option>/)
  assert.match(html, /data-action="generateTriage"/)
  assert.match(html, /data-action="saveDecisions"/)
  assert.match(html, /PRE-001/)
  assert.match(html, /SRC-0001/)
  assert.match(html, /value="" selected>未判断/)
  assert.match(html, /data-field="follow_up_required"/)
  assert.match(html, /data-field="follow_up_action"/)
  assert.match(html, /data-field="follow_up_due"/)
  assert.match(html, /sourceSha256/)
  assert.match(html, /decisionRevision/)
  assert.match(html, /nonce-789/)
  assert.doesNotMatch(html, /onclick=/)
})
