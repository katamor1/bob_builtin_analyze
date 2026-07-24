import * as path from "path"
import * as vscode from "vscode"
import { compileWorkflowDocument, formatWorkflowDiagnostics } from "../core/workflowCompiler"
import type { WorkflowContractV2Diagnostic } from "../core/contractV2/diagnostics"
import { relativePathFromRoot, workspaceRootFromFile } from "../core/workspaceRoots"
import type {
  CompileCurrentWorkflowContractV2Input,
  WorkflowContractV2CompileResult
} from "../workflowContractV2Entrypoint"
import { discoverWorkspaceWorkflowFiles } from "../workflowDiscovery"
import { WorkflowDiagnosticsReporter } from "./workflowDiagnostics"

export interface ValidateWorkflowCommandOptions {
  sourceId: string
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
  diagnostics?: WorkflowDiagnosticsReporter
  compileCurrentWorkflowPackage: (
    input: CompileCurrentWorkflowContractV2Input
  ) => Promise<WorkflowContractV2CompileResult>
}

export async function validateCurrentWorkflow(options: ValidateWorkflowCommandOptions): Promise<void> {
  const editor = vscode.window.activeTextEditor
  if (!editor) {
    await vscode.window.showErrorMessage("アクティブなエディターがありません。WORKFLOW.md または current.json を開いてからもう一度実行してください。")
    return
  }
  if (isContractV2CurrentPointer(editor.document.uri)) {
    const slot = contractV2SlotFromPointer(editor.document.uri)
    const result = await options.compileCurrentWorkflowPackage({ slot, consumer: "command-validation" })
    const diagnostics = result.ok ? [] : result.diagnostics
    await options.showMarkdownReport(
      "現在のContract v2ワークフローの検証",
      result.ok
        ? `plan ${result.handle.planDigest} を検証しました。`
        : `エラー ${diagnostics.filter((item) => item.severity === "error").length}件。`,
      result.ok
        ? [
            `- workflowId: ${result.handle.plan.workflowId}`,
            `- packageDigest: ${result.handle.plan.packageDigest}`,
            `- planDigest: ${result.handle.planDigest}`
          ]
        : formatContractV2Diagnostics(diagnostics)
    )
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
  const v2SlotKeys = new Set(discovered.packages.map((candidate) => `${candidate.root.root}\u0000${candidate.folderName}`))

  for (const candidate of discovered.packages) {
    const result = await options.compileCurrentWorkflowPackage({
      slot: {
        collectionId: candidate.collectionId,
        collectionRoot: candidate.collectionRoot,
        workflowId: candidate.workflowId
      },
      consumer: "command-validation"
    })
    if (result.ok) {
      lines.push(`- ok: ${candidate.relativePath}; planDigest=${result.handle.planDigest}`)
      continue
    }
    errors += result.diagnostics.filter((item) => item.severity === "error").length
    warnings += result.diagnostics.filter((item) => item.severity === "warning").length
    lines.push(...formatContractV2Diagnostics(result.diagnostics))
  }

  for (const candidate of discovered.files) {
    if (v2SlotKeys.has(`${candidate.root.root}\u0000${candidate.folderName}`)) continue
    const text = new TextDecoder("utf-8").decode(await vscode.workspace.fs.readFile(candidate.file))
    const result = compileWorkflowDocument({ sourceId: options.sourceId, filePath: candidate.relativePath, text, strict: true })
    options.diagnostics?.set(candidate.file, result)
    errors += result.diagnostics.filter((item) => item.severity === "error").length
    warnings += result.diagnostics.filter((item) => item.severity === "warning").length
    lines.push(...formatWorkflowDiagnostics(result))
  }
  const total = discovered.packages.length + discovered.files.filter(
    (candidate) => !v2SlotKeys.has(`${candidate.root.root}\u0000${candidate.folderName}`)
  ).length
  await options.showMarkdownReport(
    "ワークスペースのワークフロー検証",
    `ワークフロー ${total}件、エラー ${errors}件、警告 ${warnings}件。`,
    lines.length > 0 ? lines : ["- 問題は見つかりませんでした。"]
  )
}

export function validateTextDocument(
  document: vscode.TextDocument,
  options: Pick<ValidateWorkflowCommandOptions, "sourceId" | "diagnostics">
) {
  const filePath = workflowDocumentFilePath(document.uri)
  const result = compileWorkflowDocument({ sourceId: options.sourceId, filePath, text: document.getText(), strict: true })
  options.diagnostics?.set(document.uri, result)
  return result
}

export function isWorkflowDocument(document: vscode.TextDocument): boolean {
  const filePath = workflowDocumentFilePath(document.uri)
  return filePath.match(/^\.bob\/workflows\/[^/]+\/WORKFLOW\.md$/) !== null
}

function isContractV2CurrentPointer(uri: vscode.Uri): boolean {
  return workflowDocumentFilePath(uri).match(/^\.bob\/workflows\/[^/]+\/current\.json$/) !== null
}

function contractV2SlotFromPointer(uri: vscode.Uri): CompileCurrentWorkflowContractV2Input["slot"] {
  const workspaceRoot = workspaceRootFromFile(uri.fsPath, ".bob")
  if (!workspaceRoot) throw new Error("Contract v2 current.json is not inside an open .bob workspace root.")
  const slotRoot = path.dirname(uri.fsPath)
  const collectionRoot = path.dirname(slotRoot)
  return {
    collectionId: relativePathFromRoot(workspaceRoot, collectionRoot),
    collectionRoot,
    workflowId: path.basename(slotRoot)
  }
}

function formatContractV2Diagnostics(diagnostics: readonly WorkflowContractV2Diagnostic[]): string[] {
  return diagnostics.map((item) => (
    `- ${item.severity}: [${item.code}] ${item.location.path}${item.location.pointer}: ${item.message}`
  ))
}

function workflowDocumentFilePath(uri: vscode.Uri): string {
  const workflowRoot = workspaceRootFromFile(uri.fsPath, ".bob")
  return workflowRoot
    ? relativePathFromRoot(workflowRoot, uri.fsPath)
    : vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/")
}
