import * as vscode from "vscode"
import { activate as activateCore, deactivate, WorkflowRegisterApi } from "./extension"
import { createWorkflowFromTemplate } from "./commands/createWorkflow"
import { validateCurrentWorkflow, validateWorkspaceWorkflows } from "./commands/validateWorkflow"

export { deactivate }

export function activate(context: vscode.ExtensionContext): WorkflowRegisterApi {
  const api = activateCore(context)
  const sourceId = () => vscode.workspace.getConfiguration("workflowRegister").get<string>("sourceId", "workflow-register")
  context.subscriptions.push(
    vscode.commands.registerCommand("workflowRegister.validateCurrentWorkflow", () => validateCurrentWorkflow({ sourceId: sourceId(), showMarkdownReport })),
    vscode.commands.registerCommand("workflowRegister.validateWorkspaceWorkflows", () => validateWorkspaceWorkflows({ sourceId: sourceId(), showMarkdownReport })),
    vscode.commands.registerCommand("workflowRegister.createWorkflowFromTemplate", () => createWorkflowFromTemplate({ sourceId: sourceId(), showMarkdownReport }))
  )
  return api
}

async function showMarkdownReport(title: string, summary: string, lines: string[]): Promise<void> {
  const document = await vscode.workspace.openTextDocument({
    language: "markdown",
    content: [`# ${title}`, "", summary, "", ...lines].join("\n")
  })
  await vscode.window.showTextDocument(document, { preview: false })
}
