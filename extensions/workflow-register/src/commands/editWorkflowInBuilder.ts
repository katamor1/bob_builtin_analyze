import * as vscode from "vscode"
import { loadAuthoringModelFromMarkdown } from "../core/workflowAuthoringLoader"
import { isWorkflowDocumentPath } from "../core/workflowDocumentPath"
import { WorkflowBuilderPanel } from "../webview/workflowBuilderPanel"
import { pickWorkflowRootForUri, workflowRelativePath } from "./workspaceRootPicker"

export interface EditWorkflowInBuilderOptions {
  extensionUri: vscode.Uri
  sourceId: string
}

export interface EditWorkflowInBuilderRequest {
  uri?: vscode.Uri
  focusStepId?: string
}

export async function editWorkflowInBuilder(options: EditWorkflowInBuilderOptions, request?: vscode.Uri | EditWorkflowInBuilderRequest): Promise<void> {
  const uri = request instanceof vscode.Uri ? request : request?.uri
  const focusStepId = request instanceof vscode.Uri ? undefined : request?.focusStepId
  const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri ?? await pickWorkflowFile()
  if (!targetUri) {
    await vscode.window.showErrorMessage("編集する WORKFLOW.md を開くか選択してください。")
    return
  }
  if (!isWorkflowDocumentPath(targetUri.fsPath)) {
    await vscode.window.showErrorMessage(".bob/workflows/*/WORKFLOW.md を開いてから、ワークフロー作成・編集を実行してください。")
    return
  }

  const workflowRoot = await pickWorkflowRootForUri(targetUri, "ワークフローのワークスペースを選択")
  if (!workflowRoot) {
    await vscode.window.showErrorMessage("ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。")
    return
  }

  const bytes = await vscode.workspace.fs.readFile(targetUri)
  const text = new TextDecoder().decode(bytes)
  const filePath = workflowRelativePath(targetUri)

  try {
    const loaded = loadAuthoringModelFromMarkdown({ sourceId: options.sourceId, filePath, text })
    WorkflowBuilderPanel.createOrShow({
      extensionUri: options.extensionUri,
      workflowRoot,
      sourceId: options.sourceId,
      mode: "edit",
      editingFilePath: targetUri.fsPath,
      originalText: loaded.originalText,
      initialModel: loaded.model,
      focusStepId
    })
  } catch (error) {
    await vscode.window.showErrorMessage(`ワークフロー作成・編集で開けませんでした。WORKFLOW.md の内容を確認してください。詳細: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function pickWorkflowFile(): Promise<vscode.Uri | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    title: "編集する WORKFLOW.md を選択",
    filters: { Markdown: ["md"] }
  })
  return picked?.[0]
}
