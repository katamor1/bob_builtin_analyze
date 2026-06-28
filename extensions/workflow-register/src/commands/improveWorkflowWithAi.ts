import * as vscode from "vscode"
import { validateWorkflowText } from "../core/workflowValidator"
import { buildWorkflowRepairContext, formatWorkflowRepairContext } from "../core/workflowRepairContext"

export interface ImproveWorkflowWithAiOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
}

export async function improveWorkflowWithAi(options: ImproveWorkflowWithAiOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage("No active editor is open.")
    return
  }
  const filePath = vscode.workspace.asRelativePath(editor.document.uri, false)
  const validation = validateWorkflowText({ sourceId: options.sourceId, filePath, text: editor.document.getText() })
  const context = buildWorkflowRepairContext(filePath, validation)
  const summary = validation.ok
    ? "Workflow is valid. Repair context is still shown for AI review."
    : `${context.problems.length} problem(s) found. Use the repair context JSON as the input to an AI repair step.`
  await options.showMarkdownReport("Improve Workflow With AI", summary, formatWorkflowRepairContext(context))
}
