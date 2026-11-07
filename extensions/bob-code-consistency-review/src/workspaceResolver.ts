import * as path from "node:path"
import * as vscode from "vscode"
import { canonicalizePhysicalPathSync, selectDeepestPhysicalRoot } from "./sharedProcessingBudgetRuntime"
import { findMarkerRoots, MarkerRootCandidate, rootHasMarker } from "./workspaceRoots"

interface ResolveBobWorkspaceOptions {
  explicitRoot?: string
  workflowRoot?: string
  allowPick?: boolean
  title?: string
}

export async function resolveBobWorkspaceRoot(options: ResolveBobWorkspaceOptions = {}): Promise<string | undefined> {
  if (options.explicitRoot !== undefined) return physicalRoot(options.explicitRoot)
  const workflowRoot = options.workflowRoot && physicalRoot(options.workflowRoot)
  if (workflowRoot && await rootHasMarker(options.workflowRoot!, ".bob")) return workflowRoot

  const folders = physicalFolders(vscode.workspace.workspaceFolders ?? [])
  if (folders.length === 0) return undefined

  const candidates = await findMarkerRoots(folders, ".bob")
  const activeUri = vscode.window.activeTextEditor?.document.uri
  const activeCandidate = activeUri?.scheme === "file" ? await candidateForFile(candidates, activeUri.fsPath) : undefined
  if (activeCandidate) return activeCandidate.root
  if (candidates.length === 1) return candidates[0].root
  if (candidates.length > 1 && options.allowPick !== false) return pickCandidate(candidates, options.title ?? "Select Bob workspace")

  if (folders.length === 1) return folders[0].uri.fsPath
  if (options.allowPick === false) return undefined
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, root: folder.uri.fsPath })),
    { title: options.title ?? "Select Bob workspace" }
  )
  return picked?.root
}

async function candidateForFile(candidates: MarkerRootCandidate[], filePath: string): Promise<MarkerRootCandidate | undefined> {
  const root = await selectDeepestPhysicalRoot(candidates.map(candidate => candidate.root), filePath)
  return candidates.find(candidate => candidate.root === root)
}

async function pickCandidate(candidates: MarkerRootCandidate[], title: string): Promise<string | undefined> {
  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: candidate.name,
      description: candidate.root,
      detail: `${candidate.marker}; ${candidate.depth}; workspace=${candidate.workspaceFolderName}`,
      candidate
    })),
    { title }
  )
  return picked?.candidate.root
}

function physicalRoot(value: string): string | undefined {
  try { return canonicalizePhysicalPathSync(value, { expectedType: "directory" }).path } catch { return undefined }
}
function physicalFolders(folders: readonly vscode.WorkspaceFolder[]): vscode.WorkspaceFolder[] {
  const seen = new Set<string>(), result: vscode.WorkspaceFolder[] = []
  for (const folder of folders) {
    const root = physicalRoot(folder.uri.fsPath)
    if (!root) continue
    const key = path.sep === "\\" ? root.toLowerCase() : root
    if (seen.has(key)) continue
    seen.add(key)
    result.push({ ...folder, uri: vscode.Uri.file(root) })
  }
  return result
}
