const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readJson, readSourceSet } = require("./helpers/sourceReader")

test("workflow operation surfaces use approved Japanese-first labels", () => {
  const source = readSourceSet([
    "gui/operationHubHtml.ts",
    "gui/operationHubModel.ts",
    "gui/operationHubProvider.ts",
    "webview/workflowBuilderHtml.ts",
    "webview/workflowBuilderStepRendererScript.ts",
    "webview/workflowBuilderTabRenderersScript.ts",
    "webview/workflowBuilderPreviewScript.ts",
    "webview/workflowBuilderHelpCatalog.ts",
    "webview/workflowBuilderHelpCatalogExtended.ts",
    "webview/workflowBuilderPanel.ts",
    "webview/manualStepPanel.ts",
    "webview/manualStepPanelHtml.ts",
    "webview/templateCustomizationStudioHtml.ts",
    "webview/templateCustomizationStudioClientScript.ts",
    "webview/templateCustomizationStudioPanel.ts"
  ])
  const packageJson = readJson("package.json")
  const visibleMetadata = JSON.stringify({
    displayName: packageJson.displayName,
    description: packageJson.description,
    commands: packageJson.contributes.commands,
    views: packageJson.contributes.views
  })

  for (const required of [
    "Bob 操作センター",
    "実行状況",
    "ワークフロー一覧",
    "セットアップ",
    "Bob ワークフロー作成・編集",
    "ステップ設定",
    "入力項目",
    "実行条件",
    "事前確認",
    "分岐・ループ",
    "成果物",
    "安全制限",
    "完了時の処理",
    "Markdown 本文",
    "プレビューと診断",
    "Bob 手動ステップ",
    "テンプレート調整",
    "テンプレート一覧",
    "プロジェクト設定",
    "適用準備状況"
  ]) {
    assert.match(`${source}\n${visibleMetadata}`, new RegExp(required))
  }

  for (const obsolete of [
    "Bob Operation Hub",
    "Run Monitor",
    "Bob Workflow Runs",
    "Bob Workflow Builder",
    "Step detail",
    "Preview / Diagnostics",
    "Bob Workflow Manual Step",
    "Template Customization Studio"
  ]) {
    assert.doesNotMatch(`${source}\n${visibleMetadata}`, new RegExp(obsolete))
  }
})

test("workflow commands and settings use approved Japanese metadata", () => {
  const packageJson = readJson("package.json")
  const commands = new Map(packageJson.contributes.commands.map((command) => [command.command, command]))

  assert.ok(packageJson.contributes.commands.every((command) => command.category === "Bob Workflow"))
  const expectedTitles = {
    "workflowRegister.openOperationHub": "操作センターを開く",
    "workflowRegister.refreshOperationHub": "操作センターを更新",
    "workflowRegister.openOperationHubPanel": "操作センターをパネルで開く",
    "workflowRegister.importArtifactsFromTaskSnapshots": "保存済みタスクから成果物を取り込む",
    "workflowRegister.pauseCurrentRun": "実行を一時停止",
    "workflowRegister.pauseAfterCurrentStep": "現在のステップ後に一時停止",
    "workflowRegister.pauseBeforeNextAiCall": "次の AI 呼び出し前に一時停止",
    "workflowRegister.resumePausedRun": "一時停止した実行を再開",
    "workflowRegister.inspectRunStorage": "実行履歴の保存状況を確認",
    "workflowRegister.previewRunCleanup": "実行履歴の削除候補を確認",
    "workflowRegister.cleanupCompletedRuns": "完了済みの実行履歴を整理",
    "bobTemplate.checkReadiness": "テンプレートの適用準備状況を確認",
    "bobTemplate.openCustomizationStudio": "テンプレート調整を開く"
  }
  for (const [commandId, title] of Object.entries(expectedTitles)) {
    assert.equal(commands.get(commandId)?.title, title, commandId)
  }

  const descriptions = Object.values(packageJson.contributes.configuration.properties)
    .map((property) => property.description ?? "")
    .join("\n")
  assert.doesNotMatch(descriptions, /\b(?:run|step|snapshot|cleanup|source id|source name)\b/i)
})
