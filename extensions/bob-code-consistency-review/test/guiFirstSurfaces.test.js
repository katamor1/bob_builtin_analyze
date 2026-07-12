const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  assertContributesCommand,
  readJson,
  readSrc
} = require("./helpers/sourceReader")

test("package and extension expose code consistency GUI first commands", () => {
  const packageJson = readJson("package.json")
  const source = readSrc("extension.ts")

  for (const command of [
    "bobCodeConsistency.openReviewWizard",
    "bobCodeConsistency.openResultCaptureGui",
    "bobCodeConsistency.openHumanTriageGui"
  ]) {
    assertContributesCommand(packageJson, command)
    assert.match(source, new RegExp(`registerCommand\\(\\s*"${command.replace(/\./g, "\\.")}"`))
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
      warnings: []
    }
  })

  assert.match(html, /Consistency Review Wizard/)
  assert.match(html, /Evidence Picker/)
  assert.match(html, /Traceability/)
  assert.match(html, /Package Preview/)
  assert.match(html, /data-action="createReviewInput"/)
  assert.match(html, /data-action="openTraceabilityPrep"/)
  assert.match(html, /data-action="preprocess"/)
  assert.match(html, /data-action="openResultCapture"/)
  assert.match(html, /docs\/requirements\.md/)
  assert.match(html, /nonce-123/)
  assert.doesNotMatch(html, /onclick=/)
})

test("code consistency result capture GUI exposes YAML validation before triage", () => {
  const { renderConsistencyResultCaptureHtml } = require("../out/webview/consistencyResultCaptureHtml")
  const html = renderConsistencyResultCaptureHtml({ cspSource: "vscode-resource:", nonce: "nonce-456" })

  assert.match(html, /Result Capture/)
  assert.match(html, /Bob output YAML/)
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

  assert.match(html, /Human Triage/)
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
