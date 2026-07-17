import * as vscode from "vscode"
import { compileWorkflowDocument, formatWorkflowDiagnostics } from "../core/workflowCompiler"
import { relativePathFromRoot, workspaceRootFromFile } from "../core/workspaceRoots"
import { discoverWorkspaceWorkflowFiles } from "../workflowDiscovery"
import { WorkflowDiagnosticsReporter } from "./workflowDiagnostics"

export interface ValidateWorkflowCommandOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
  diagnostics?: WorkflowDiagnosticsReporter
}

export async function validateCurrentWorkflow(options: ValidateWorkflowCommandOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage("アクティブなエディターがありません。WORKFLOW.md を開いてからもう一度実行してください。")
    return
  }
  const result = validateTextDocument(editor.document, options)
  const errors = result.diagnostics.filter((item) => item.severity === "error").length
  const warnings = result.diagnostics.filter((item) => item.severity === "warning").length
  const summary = `ワークフローファイル1件、エラー ${errors}件、警告 ${warnings}件。`
  await options.showMarkdownReport("現在のワークフローの検証", summary, formatWorkflowDiagnostics(result))
}

export async function validateWorkspaceWorkflows(options: ValidateWorkflowCommandOptions): Promise<void> {
  const discovered = await discoverWorkspaceWorkflowFiles()
  const lines: string[] = []
  let errors = 0
  let warnings = 0
  options.diagnostics?.clear()
  for (const candidate of discovered.files) {
    const text = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(candidate.file))
    const result = compileWorkflowDocument({ sourceId: options.sourceId, filePath: candidate.relativePath, text, strict: true })
    options.diagnostics?.set(candidate.file, result)
    errors += result.diagnostics.filter((item) => item.severity === "error").length
    warnings += result.diagnostics.filter((item) => item.severity === "warning").length
    lines.push(...formatWorkflowDiagnostics(result))
  }
  await options.showMarkdownReport("ワークスペースのワークフロー検証", `ワークフローファイル ${discovered.files.length}件、エラー ${errors}件、警告 ${warnings}件。`, lines.length > 0 ? lines : ["- 問題は見つかりませんでした。"])
}

export function validateTextDocument(document: vscode.TextDocument, options: Pick<ValidateWorkflowCommandOptions, "sourceId" | "diagnostics">) {
  const filePath = workflowDocumentFilePath(document.uri)
  const result = compileWorkflowDocument({ sourceId: options.sourceId, filePath, text: document.getText(), strict: true })
  options.diagnostics?.set(document.uri, result)
  return result
}

export function isWorkflowDocument(document: vscode.TextDocument): boolean {
  const filePath = workflowDocumentFilePath(document.uri)
  return filePath.match(/^\.bob\/workflows\/[^/]+\/WORKFLOW\.md$/) !== null
}

function workflowDocumentFilePath(uri: vscode.Uri): string {
  const workflowRoot = workspaceRootFromFile(uri.fsPath, ".bob")
  return workflowRoot
    ? relativePathFromRoot(workflowRoot, uri.fsPath)
    : vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
}
