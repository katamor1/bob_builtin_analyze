import * as vscode from "vscode"
import { createMockWorkflowAiProvider } from "../core/mockWorkflowAiProvider"
import { formatWorkflowRepairProposal, WorkflowAiProvider } from "../core/workflowAiProvider"
import { buildWorkflowRepairContext, formatWorkflowRepairContext } from "../core/workflowRepairContext"
import { formatWorkflowDiagnostics, validateWorkflowText } from "../core/workflowValidator"

export interface ImproveWorkflowWithAiOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
  provider?: WorkflowAiProvider
}

export async function improveWorkflowWithAi(options: ImproveWorkflowWithAiOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage("No active editor is open.")
    return
  }
  const filePath = vscode.workspace.asRelativePath(editor.document.uri, false)
  const workflowText = editor.document.getText()
  const validation = validateWorkflowText({ sourceId: options.sourceId, filePath, text: workflowText })
  const context = buildWorkflowRepairContext(filePath, validation)
  const provider = options.provider ?? createMockWorkflowAiProvider()
  const proposal = await Promise.resolve(provider.improveWorkflow({ filePath, workflowText, repairContext: context }))
  const lines = [
    "## Current validation",
    "",
    ...formatWorkflowDiagnostics(validation),
    "",
    ...formatWorkflowRepairContext(context),
    "",
    ...formatWorkflowRepairProposal(proposal)
  ]
  if (proposal.replacementMarkdown) {
    const replacementValidation = validateWorkflowText({ sourceId: options.sourceId, filePath, text: proposal.replacementMarkdown })
    lines.push("", "## Replacement validation", "", ...formatWorkflowDiagnostics(replacementValidation))
    if (replacementValidation.ok) {
      const preview = await vscode.workspace.openTextDocument({ language: "markdown", content: proposal.replacementMarkdown })
      await vscode.window.showTextDocument(preview, { preview: false })
    }
  }
  const summary = proposal.replacementMarkdown
    ? "AI repair proposal includes replacement Markdown; it is previewed only if validation succeeds."
    : "AI repair proposal does not include replacement Markdown; no files were modified."
  await options.showMarkdownReport("Improve Workflow With AI", `${summary} Provider: ${provider.id}.`, lines)
}
