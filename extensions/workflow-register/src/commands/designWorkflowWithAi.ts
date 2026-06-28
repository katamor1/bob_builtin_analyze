import * as vscode from "vscode"
import { buildWorkflowFromDesignDraft } from "../core/workflowDesignBuilder"
import { WorkflowDesignDraft } from "../core/workflowDesignDraft"
import { workflowTemplates } from "../core/workflowScaffold"

export interface DesignWorkflowWithAiOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
}

export async function designWorkflowWithAi(options: DesignWorkflowWithAiOptions): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    await vscode.window.showErrorMessage("No workspace folder is open.")
    return
  }
  const draft = await collectDesignDraft()
  if (!draft) return
  const result = buildWorkflowFromDesignDraft(draft, { sourceId: options.sourceId })
  if (!result.ok || !result.markdown) {
    await options.showMarkdownReport("Workflow Design Draft", "Generated workflow design is invalid and was not saved.", result.reportLines)
    return
  }
  const dir = vscode.Uri.joinPath(folder.uri, ".bob", "workflows", result.name)
  const uri = vscode.Uri.joinPath(dir, "WORKFLOW.md")
  await vscode.workspace.fs.createDirectory(dir)
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(result.markdown))
  await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri))
  await options.showMarkdownReport("Workflow Design Draft", `Saved ${result.filePath}.`, result.reportLines)
}

async function collectDesignDraft(): Promise<WorkflowDesignDraft | undefined> {
  const rawName = await vscode.window.showInputBox({ title: "Workflow design name", value: "new-workflow" })
  if (rawName === undefined) return undefined
  const title = await vscode.window.showInputBox({ title: "Workflow design title", value: titleFromName(rawName) })
  if (title === undefined) return undefined
  const description = await vscode.window.showInputBox({ title: "Workflow design goal", value: `Run ${title}.` })
  if (description === undefined) return undefined
  const picked = await vscode.window.showQuickPick(workflowTemplates.map((template) => ({ label: template.label, description: template.id, detail: template.description, template })), { title: "Design template" })
  if (!picked) return undefined
  return {
    name: rawName,
    title,
    description,
    template: picked.template.id,
    notes: ["Created through the WorkflowDesignDraft builder pipeline. Replace example command ids before runtime execution."]
  }
}

function titleFromName(name: string): string {
  return name.split(/[._-]+/).filter(Boolean).map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`).join(" ") || "New Workflow"
}
