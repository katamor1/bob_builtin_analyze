const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

function diagnosticRun(overrides = {}) {
  return {
    schemaVersion: "workflow-register/run-state/v1",
    runId: "run-ja",
    workflowId: "qa.review",
    workflowName: "QA Review",
    status: "paused",
    currentStep: "approve",
    inputs: {},
    state: {},
    steps: [{ id: "approve", title: "承認", type: "manual", status: "held" }],
    error: "Required workflow file is missing: package.json",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:01:00.000Z",
    ...overrides
  }
}

test("run diagnostics use Japanese operator headings and actionable hints", () => {
  const { buildWorkflowRunDiagnosticReport } = require("../out/core/runDiagnostics")
  const report = buildWorkflowRunDiagnosticReport([diagnosticRun()], {
    durabilityByRunId: {
      "run-ja": { eventCount: 2, journalPending: false, lockPresent: true }
    }
  })
  const text = [report.title, report.summary, ...report.lines].join("\n")

  for (const label of [
    "ワークフロー実行診断",
    "状態: 一時停止",
    "実行データの耐久性:",
    "推奨対応:",
    "現在対応が必要なステップ:",
    "状態キー:",
    "ステップ:"
  ]) assert.match(text, new RegExp(label))

  for (const obsolete of [
    "Workflow Run Diagnostics",
    "Run durability:",
    "Current attention step:",
    "suggested fix:",
    "State:",
    "Steps:"
  ]) assert.doesNotMatch(text, new RegExp(obsolete))
})

test("task snapshot import preview and selection labels are Japanese", () => {
  const {
    formatTaskSnapshotImportPreviewReport,
    taskSnapshotImportSelectionItems
  } = require("../out/taskSnapshotImportReport")
  const preview = {
    ok: true,
    previewDigest: "sha256:preview",
    issues: [],
    candidates: [{
      artifactId: "report",
      stateKey: "report",
      stepId: "write",
      stepTitle: "レポート作成",
      snapshotCreatedAt: "2026-07-17T00:00:00.000Z",
      snapshotReason: "completed",
      extractionSource: "taskExport",
      text: "report",
      path: ".bob/workflows/runs/run-ja/artifacts/report.md",
      schema: "text/markdown",
      bytes: 6,
      sha256: `sha256:${"a".repeat(64)}`,
      truncated: false,
      redactionPossible: false,
      existing: { exists: false, changed: false },
      diff: "",
      defaultSelected: true,
      issues: []
    }]
  }
  const report = formatTaskSnapshotImportPreviewReport({
    preview,
    run: { runId: "run-ja", workflowId: "qa.review", status: "completed" },
    workflow: { id: "qa.review", label: "QA Review" }
  }).join("\n")
  const items = taskSnapshotImportSelectionItems(preview)

  assert.match(report, /実行 ID（runId）: run-ja/)
  assert.match(report, /プレビュー識別子: sha256:preview/)
  assert.match(report, /プレビューは読み取り専用です/)
  assert.match(report, /サイズ: 6バイト/)
  assert.equal(items[0].description, "既定で選択")
  assert.match(items[0].detail, /新規ファイル/)
  assert.doesNotMatch(report, /The preview is read-only|selected by default|new file/)
})

test("held-run recovery copy is Japanese while action ids remain stable", () => {
  const { classifyHeldRunRecovery, buildHeldRunRecoveryPreview } = require("../out/core/heldRunRecovery")
  const workflow = {
    id: "qa.review",
    name: "qa-review",
    label: "QA Review",
    description: "QA review",
    schemaVersion: "workflow-register/v1",
    definitionHash: "sha256:current",
    workflowFile: ".bob/workflows/qa-review/WORKFLOW.md",
    inputs: {},
    artifacts: [],
    engineSteps: [
      { id: "approve", title: "承認", type: "manual", userAction: { message: "確認" } },
      { id: "publish", title: "公開", type: "result", result: { source: "literal", text: "done" } }
    ]
  }
  const run = diagnosticRun({
    status: "held",
    error: undefined,
    workflowDefinitionHash: "sha256:current",
    steps: [
      { id: "approve", title: "承認", type: "manual", status: "held" },
      { id: "publish", title: "公開", type: "result", status: "pending" }
    ]
  })
  const assessment = classifyHeldRunRecovery({
    run,
    workflow,
    liveTaskAvailable: false,
    activeManualStepAvailable: false,
    artifactManifestAvailable: false,
    taskSnapshotAvailable: false
  })
  const preview = buildHeldRunRecoveryPreview(run, assessment).join("\n")

  assert.equal(assessment.kind, "detached-resumable")
  assert.equal(assessment.primaryAction.id, "resume-saved-state")
  assert.equal(assessment.title, "保存済み状態から再開できます")
  assert.equal(assessment.primaryAction.label, "保存済み状態から再開")
  assert.match(preview, /完了対象の手動待ちステップ: approve/)
  assert.match(preview, /状態値、フォーム入力値/)
})

test("remaining workflow surface names consistently use Bob 操作センター", () => {
  const { buildWorkflowControlBlock } = require("../out/bobWorkflowMessages")
  const block = buildWorkflowControlBlock({ runId: "run-ja", status: "held", currentStep: "approve", includeResume: true })
  const source = readSourceSet([
    "bobWorkflowRunner.ts",
    "operationHubMutationTarget.ts",
    "workflowRunCommands.ts"
  ])

  assert.match(block, /Bob 操作センターの「実行状況」/)
  assert.match(source, /中断した実行の復旧プレビュー/)
  assert.match(source, /Bob 操作センターを更新してから再実行してください/)
  for (const obsolete of [
    "Operation Hub を開きました",
    "Refresh Operation Hub",
    "Detached Held Run Recovery Preview",
    "Held step '",
    "Operation Hub を更新してから"
  ]) assert.doesNotMatch(source, new RegExp(obsolete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})

test("template readiness reports use Japanese headings", () => {
  const { renderReadinessMarkdown } = require("../out/template/templateReadiness")
  const markdown = renderReadinessMarkdown({
    status: "warning",
    score: 75,
    checks: [{ id: "uat-evidence", title: "UAT 証跡の有無", status: "warning", diagnostics: ["UAT 証跡がありません"] }],
    nextActions: ["uat-evidence: UAT 証跡がありません"]
  })
  const source = readSourceSet(["template/templateReadiness.ts"])

  assert.match(markdown, /# テンプレートの適用準備状況: 注意/)
  assert.match(markdown, /## 確認項目/)
  assert.match(markdown, /## 次の対応/)
  for (const label of [
    "テンプレート・プロジェクト情報・調整内容の形式",
    "生成したワークフローの契約",
    "UAT 証跡の有無"
  ]) assert.match(source, new RegExp(label))
  for (const obsolete of [
    "# Template Readiness",
    "## Checks",
    "## Next Actions",
    "UAT evidence presence",
    "Generated workflow contract"
  ]) assert.doesNotMatch(source, new RegExp(obsolete))
})


test("step inspection and active-step reports use Japanese-first field labels", () => {
  const source = readSourceSet([
    "commands/stepReview.ts",
    "workflowRegisterService.ts"
  ])

  for (const label of [
    "ワークフロー定義ハッシュ（workflowDefinitionHash）",
    "ワークフロー定義の差異（workflowDefinitionMismatch）",
    "Bob タスク同期（bobTaskSync）",
    "現在のステップ状態（currentStepStatus）",
    "現在のステップ名（currentStepTitle）",
    "現在の試行番号（currentAttempt）",
    "保存済みの試行数（archivedAttempts）",
    "実行キー（key）"
  ]) assert.match(source, new RegExp(label))

  for (const obsolete of [
    "- workflowDefinitionHash:",
    "- workflowDefinitionMismatch:",
    "- bobTaskSync:",
    "- currentStepStatus:",
    "- currentStepTitle:",
    "- currentAttempt:",
    "- archivedAttempts:",
    "- key="
  ]) assert.doesNotMatch(source, new RegExp(obsolete.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
})
