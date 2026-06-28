import * as vscode from "vscode"
import { formatWorkflowDiagnostics, validateWorkflowText } from "../core/workflowValidator"
import { buildWorkflowRepairContext, formatWorkflowRepairContext } from "../core/workflowRepairContext"

export interface ExplainWorkflowDiagnosticsOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
}

export async function explainWorkflowDiagnostics(options: ExplainWorkflowDiagnosticsOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage("No active editor is open.")
    return
  }
  const filePath = vscode.workspace.asRelativePath(editor.document.uri, false)
  const validation = validateWorkflowText({ sourceId: options.sourceId, filePath, text: editor.document.getText() })
  const context = buildWorkflowRepairContext(filePath, validation)
  const errorCount = validation.diagnostics.filter((item) => item.severity === "error").length
  const warningCount = validation.diagnostics.filter((item) => item.severity === "warning").length
  await options.showMarkdownReport("Workflow Diagnostics Explained", `${errorCount} error(s); ${warningCount} warning(s).`, [
    "## Diagnostics",
    "",
    ...formatWorkflowDiagnostics(validation),
    "",
    ...formatWorkflowRepairContext(context)
  ])
}
