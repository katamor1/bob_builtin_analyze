const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSourceSet } = require("./helpers/sourceReader")

test("workflow host-owned dialogs use actionable Japanese copy", () => {
  const source = readSourceSet([
    "bobStepRuntime.ts",
    "bobWorkflowRunner.ts",
    "commands/automaticPauseResumeUi.ts",
    "commands/createWorkflow.ts",
    "commands/designWorkflowWithAi.ts",
    "commands/editWorkflowInBuilder.ts",
    "commands/explainWorkflowDiagnostics.ts",
    "commands/improveWorkflowWithAi.ts",
    "commands/inspectRunDiagnostics.ts",
    "commands/openWorkflowBuilder.ts",
    "commands/runRetention.ts",
    "commands/validateWorkflow.ts",
    "commands/workspaceRootPicker.ts",
    "manualStepPrompt.ts",
    "workflowInputPrompt.ts",
    "workflowRunCommands.ts",
    "workflowRunSelection.ts",
    "workflowRegisterService.ts",
    "webview/workflowBuilderPanel.ts",
    "gui/operationHubProvider.ts",
    "core/workspaceTrust.ts"
  ])

  for (const label of [
    "ワークフローのワークスペースを選択",
    "ワークフローテンプレート",
    "ワークフロー名",
    "AI でワークフローを設計",
    "実行履歴の削除候補",
    "ワークフロー実行",
    "完了する Bob ワークフローステップを選択",
    "Bob ワークフローの入力を中止しました",
    "はい",
    "いいえ",
    "実行診断",
    "既存の WORKFLOW.md がないため差分は表示できません",
    "画面を更新してから再実行してください"
  ]) assert.match(source, new RegExp(label))

  for (const forbidden of [
    /No workspace folder is open/i,
    /Select workflow workspace/i,
    /Workflow Template/i,
    /Workflow name/i,
    /Workflow title/i,
    /Workflow description/i,
    /No active editor is open/i,
    /Open a \.bob\/workflows/i,
    /Workflow generation failed/i,
    /Apply Replacement/i,
    /Select workflow runs for cleanup preview/i,
    /Pin Workflow Run/i,
    /Unpin Workflow Run/i,
    /Manual field is required/i,
    /Manual field must be a number/i,
    /Reject reason/i,
    /Task Snapshot Artifact Import/i,
    /Workflow Runs/i,
    /Workflow Branching/i,
    /Run Workflow(?: Step)?/i,
    /Bob workflow workspace root is not available/i,
    /Bob workflow input failed/i,
    /Could not capture Bob workflow step result/i,
    /Select the Bob workflow step to complete/i,
    /["'`]Completed:/i,
    /Bob Operation Hub/i,
    /Workspace is not trusted/i,
    /["'`]Provider:/i,
    /No workflow run selected/i,
    /diff は開かず/i
  ]) assert.doesNotMatch(source, forbidden)
})
