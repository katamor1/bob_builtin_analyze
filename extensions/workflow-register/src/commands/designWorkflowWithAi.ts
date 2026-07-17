import * as vscode from "vscode"
import { createMockWorkflowAiProvider } from "../core/mockWorkflowAiProvider"
import { WorkflowAiProvider } from "../core/workflowAiProvider"
import { buildWorkflowFromDesignDraft } from "../core/workflowDesignBuilder"
import { WorkflowTemplateKind, workflowTemplates } from "../core/workflowScaffold"
import { pickWorkflowRoot } from "./workspaceRootPicker"

export interface DesignWorkflowWithAiOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
  provider?: WorkflowAiProvider
}

export async function designWorkflowWithAi(options: DesignWorkflowWithAiOptions): Promise<void> {
  const workflowRoot = await pickWorkflowRoot("ワークフローのワークスペースを選択")
  if (!workflowRoot) {
    await vscode.window.showErrorMessage("ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。")
    return
  }
  const input = await collectDesignInput()
  if (!input) return
  const provider = options.provider ?? createMockWorkflowAiProvider()
  const draft = await Promise.resolve(provider.designWorkflow(input))
  const result = buildWorkflowFromDesignDraft(draft, { sourceId: options.sourceId })
  if (!result.ok || !result.markdown) {
    await options.showMarkdownReport("AI でワークフローを設計", `プロバイダー '${provider.id}' が返したワークフロー設計に問題があるため、保存しませんでした。`, result.reportLines)
    return
  }
  const dir = vscode.Uri.joinPath(vscode.Uri.file(workflowRoot), ".bob", "workflows", result.name)
  const uri = vscode.Uri.joinPath(dir, "WORKFLOW.md")
  await vscode.workspace.fs.createDirectory(dir)
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(result.markdown))
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri))
  await options.showMarkdownReport("AI でワークフローを設計", `プロバイダー '${provider.id}' の設計を ${result.filePath} に保存しました。`, result.reportLines)
}

async function collectDesignInput(): Promise<{ goal: string; preferredTemplate?: WorkflowTemplateKind } | undefined> {
  const goal = await vscode.window.showInputBox({ title: "ワークフローの目的", value: "現在のワークフローを確認し、レポートを作成する。" })
  if (goal === undefined) return undefined
  const picked = await vscode.window.showQuickPick([
    { label: "プロバイダーに選択を任せる", description: "自動", template: undefined },
    ...workflowTemplates.map((template) => ({ label: template.label, description: template.id, detail: template.description, template: template.id }))
  ], { title: "希望するワークフローテンプレート" })
  if (!picked) return undefined
  return { goal, preferredTemplate: picked.template }
}
