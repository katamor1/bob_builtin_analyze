import * as vscode from "vscode"
import { createMockWorkflowAiProvider } from "../core/mockWorkflowAiProvider"
import { formatWorkflowRepairProposal, WorkflowAiProvider } from "../core/workflowAiProvider"
import { createWorkflowReplacementCandidate, previewFileNameForWorkflow, WorkflowReplacementCandidate } from "../core/workflowReplacementPreview"
import { buildWorkflowRepairContext, formatWorkflowRepairContext } from "../core/workflowRepairContext"
import { formatWorkflowDiagnostics, validateWorkflowText } from "../core/workflowValidator"
import { isWorkflowDocumentPath } from "../core/workflowDocumentPath"
import { pickWorkflowRootForUri, workflowRelativePath } from "./workspaceRootPicker"

export interface ImproveWorkflowWithAiOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
  provider?: WorkflowAiProvider
}

export async function improveWorkflowWithAi(options: ImproveWorkflowWithAiOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage("アクティブなエディターがありません。WORKFLOW.md を開いてからもう一度実行してください。")
    return
  }
  if (!isWorkflowDocumentPath(editor.document.uri.fsPath)) {
    await vscode.window.showErrorMessage("AI による改善を実行する前に .bob/workflows/*/WORKFLOW.md を開いてください。")
    return
  }
  const filePath = workflowRelativePath(editor.document.uri)
  const workflowText = editor.document.getText()
  const validation = validateWorkflowText({ sourceId: options.sourceId, filePath, text: workflowText })
  const context = buildWorkflowRepairContext(filePath, validation)
  const provider = options.provider ?? createMockWorkflowAiProvider()
  const proposal = await Promise.resolve(provider.improveWorkflow({ filePath, workflowText, repairContext: context }))
  const lines = [
    "## 現在の検証結果",
    "",
    ...formatWorkflowDiagnostics(validation),
    "",
    ...formatWorkflowRepairContext(context),
    "",
    ...formatWorkflowRepairProposal(proposal)
  ]
  let summary = proposal.replacementMarkdown
    ? "AI の改善案に置換用 Markdown が含まれています。"
    : "AI の改善案に置換用 Markdown がないため、ファイルは変更していません。"
  if (proposal.replacementMarkdown) {
    const candidate = createWorkflowReplacementCandidate({ sourceId: options.sourceId, filePath, originalMarkdown: workflowText, replacementMarkdown: proposal.replacementMarkdown })
    lines.push("", "## 置換内容の検証", "", ...formatWorkflowDiagnostics(candidate.validation), "", "## 置換内容の反映計画", "", `- 反映可能（canApply）: ${candidate.canApply}`, `- バックアップ先（backup）: ${candidate.backupRelativePath}`)
    if (candidate.canApply) {
      const outcome = await previewAndMaybeApplyReplacement(editor.document.uri, candidate)
      summary = outcome
    } else {
      summary = "AI の改善案に置換用 Markdown がありますが、検証に通らないためプレビューも反映もしていません。"
    }
  }
  await options.showMarkdownReport("AI でワークフローを改善", `${summary} プロバイダー: ${provider.id}。`, lines)
}

async function previewAndMaybeApplyReplacement(originalUri: vscode.Uri, candidate: WorkflowReplacementCandidate): Promise<string> {
  const preview = await vscode.workspace.openTextDocument({ language: "markdown", content: candidate.replacementMarkdown })
  await vscode.window.showTextDocument(preview, { preview: false })
  const workflowRoot = await pickWorkflowRootForUri(originalUri, "置換内容をプレビューするワークスペースを選択")
  if (workflowRoot) {
    const previewDir = vscode.Uri.joinPath(vscode.Uri.file(workflowRoot), ".bob", "workflows", ".previews", candidate.workflowName)
    const previewUri = vscode.Uri.joinPath(previewDir, previewFileNameForWorkflow(candidate.filePath, new Date()))
    await vscode.workspace.fs.createDirectory(previewDir)
    await vscode.workspace.fs.writeFile(previewUri, new TextEncoder().encode(candidate.replacementMarkdown))
    await vscode.commands.executeCommand("vscode.diff", originalUri, previewUri, `ワークフロー置換: ${candidate.workflowName}`)
  }
  const picked = await vscode.window.showQuickPick([
    { label: "置換内容を反映", description: "バックアップを作成してから WORKFLOW.md を上書き" },
    { label: "中止", description: "現在のワークフローを変更しない" }
  ], { title: "AI のワークフロー置換" })
  if (picked?.label !== "置換内容を反映") return "AI の置換案をプレビューしましたが、反映していません。"
  const confirmed = await vscode.window.showWarningMessage(`AI の置換案を ${candidate.filePath} に反映しますか？バックアップを ${candidate.backupRelativePath} に作成します。`, { modal: true }, "置換内容を反映")
  if (confirmed !== "置換内容を反映") return "AI の置換案の反映を中止しました。"
  await writeBackupAndReplacement(originalUri, candidate)
  return `AI の置換案を反映しました。バックアップ: ${candidate.backupRelativePath}。`
}

async function writeBackupAndReplacement(originalUri: vscode.Uri, candidate: WorkflowReplacementCandidate): Promise<void> {
  if (!isWorkflowDocumentPath(originalUri.fsPath)) throw new Error("AI による改善で上書きできるのは .bob/workflows/*/WORKFLOW.md だけです。")
  const workflowRoot = await pickWorkflowRootForUri(originalUri, "置換内容のバックアップ先ワークスペースを選択")
  if (!workflowRoot) throw new Error("ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。")
  const parts = candidate.backupRelativePath.split("/").filter(Boolean)
  const backupUri = vscode.Uri.joinPath(vscode.Uri.file(workflowRoot), ...parts)
  const backupDir = vscode.Uri.joinPath(vscode.Uri.file(workflowRoot), ...parts.slice(0, -1))
  await vscode.workspace.fs.createDirectory(backupDir)
  await vscode.workspace.fs.writeFile(backupUri, new TextEncoder().encode(candidate.originalMarkdown))
  await vscode.workspace.fs.writeFile(originalUri, new TextEncoder().encode(candidate.replacementMarkdown))
}
