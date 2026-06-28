import * as vscode from "vscode"
import { activate as activateCore, deactivate, WorkflowRegisterApi } from "./extension"
import { createWorkflowFromTemplate } from "./commands/createWorkflow"
import { isWorkflowDocument, validateCurrentWorkflow, validateTextDocument, validateWorkspaceWorkflows } from "./commands/validateWorkflow"
import { WorkflowDiagnosticsReporter } from "./commands/workflowDiagnostics"

export { deactivate }

export function activate(context: vscode.ExtensionContext): WorkflowRegisterApi {
  const api = activateCore(context)
  const diagnostics = new WorkflowDiagnosticsReporter()
  const sourceId = () => vscode.workspace.getConfiguration("workflowRegister").get<string>("sourceId", "workflow-register")
  context.subscriptions.push(
    diagnostics,
    vscode.commands.registerCommand("workflowRegister.validateCurrentWorkflow", () => validateCurrentWorkflow({ sourceId: sourceId(), showMarkdownReport, diagnostics })),
    vscode.commands.registerCommand("workflowRegister.validateWorkspaceWorkflows", () => validateWorkspaceWorkflows({ sourceId: sourceId(), showMarkdownReport, diagnostics })),
    vscode.commands.registerCommand("workflowRegister.createWorkflowFromTemplate", () => createWorkflowFromTemplate({ sourceId: sourceId(), showMarkdownReport })),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isWorkflowDocument(document)) validateTextDocument(document, { sourceId: sourceId(), diagnostics })
    }),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isWorkflowDocument(editor.document)) validateTextDocument(editor.document, { sourceId: sourceId(), diagnostics })
    })
  )
  for (const document of vscode.workspace.textDocuments) if (isWorkflowDocument(document)) validateTextDocument(document, { sourceId: sourceId(), diagnostics })
  return api
}

async function showMarkdownReport(title: string, summary: string, lines: string[]): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: [`# ${title}`, "", summary, "", ...lines].join("\n")
  })
  await vscode.window.showTextDocument(document, { preview: false })
}
