import * as vscode from "vscode"
import { WorkflowBuilderPanel } from "../webview/workflowBuilderPanel"
import { pickWorkflowRoot } from "./workspaceRootPicker"

export interface OpenWorkflowBuilderOptions {
  extensionUri: vscode.Uri
  sourceId: string
}

export async function openWorkflowBuilder(options: OpenWorkflowBuilderOptions): Promise<void> {
  const workflowRoot = await pickWorkflowRoot("ワークフローのワークスペースを選択")
  if (!workflowRoot) {
    await vscode.window.showErrorMessage("ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。")
    return
  }
  WorkflowBuilderPanel.createOrShow({ extensionUri: options.extensionUri, workflowRoot, sourceId: options.sourceId })
}
