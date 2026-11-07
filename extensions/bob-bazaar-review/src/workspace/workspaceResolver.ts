import * as path from "path"
import * as vscode from "vscode"
import { canonicalizePhysicalPathSync, selectDeepestPhysicalRoot } from "../sharedProcessingBudgetRuntime"
import { findMarkerRoots, MarkerRootCandidate, rootHasMarker } from "./workspaceRoots"

interface ResolveMarkerWorkspaceOptions {
  explicitRoot?: string
  workflowRoot?: string
  allowPick?: boolean
  title?: string
}

export async function resolveBazaarWorkspaceFolder(options: ResolveMarkerWorkspaceOptions = {}): Promise<vscode.WorkspaceFolder | undefined> {
  return resolveMarkerWorkspaceFolder(".bzr", "Bazaar", options)
}

export async function resolveBobWorkspaceFolder(options: ResolveMarkerWorkspaceOptions = {}): Promise<vscode.WorkspaceFolder | undefined> {
  return resolveMarkerWorkspaceFolder(".bob", "Bob", options)
}

async function resolveMarkerWorkspaceFolder(marker: string, label: string, options: ResolveMarkerWorkspaceOptions): Promise<vscode.WorkspaceFolder | undefined> {
  if (options.explicitRoot !== undefined) {
    const explicitRoot = physicalRoot(options.explicitRoot)
    if (explicitRoot && await rootHasMarker(options.explicitRoot, marker)) return folderFromRoot(explicitRoot)
    if (options.allowPick !== false) {
      await vscode.window.showWarningMessage(`${label} 明示rootに ${marker} が見つかりません: ${explicitRoot}`)
    }
    return undefined
  }
  const workflowRoot = options.workflowRoot && physicalRoot(options.workflowRoot)
  if (workflowRoot && await rootHasMarker(options.workflowRoot!, marker)) return folderFromRoot(workflowRoot)

  const folders = physicalFolders(vscode.workspace.workspaceFolders ?? [])
  if (folders.length === 0) {
    if (options.allowPick !== false) await vscode.window.showWarningMessage(`${label} ワークスペースフォルダーを先に開いてください。`)
    return undefined
  }

  const candidates = await findMarkerRoots(folders, marker)
  const activeUri = vscode.window.activeTextEditor?.document.uri
  const activeCandidate = activeUri?.scheme === "file" ? await candidateForFile(candidates, activeUri.fsPath) : undefined
  if (activeCandidate) return folderFromCandidate(activeCandidate)
  if (candidates.length === 1) return folderFromCandidate(candidates[0])
  if (candidates.length > 1 && options.allowPick !== false) return pickCandidate(candidates, options.title ?? `${label} ワークスペースを選択`)

  if (folders.length === 1) return folders[0]
  if (options.allowPick === false) return undefined
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: options.title ?? `${label} ワークスペースを選択` }
  )
  return picked?.folder
}

async function candidateForFile(candidates: MarkerRootCandidate[], filePath: string): Promise<MarkerRootCandidate | undefined> {
  const root = await selectDeepestPhysicalRoot(candidates.map(candidate => candidate.root), filePath)
  return candidates.find(candidate => candidate.root === root)
}

async function pickCandidate(candidates: MarkerRootCandidate[], title: string): Promise<vscode.WorkspaceFolder | undefined> {
  const picked = await vscode.window.showQuickPick(
    candidates.map((candidate) => ({
      label: candidate.name,
      description: candidate.root,
      detail: `${candidate.marker}; ${candidate.depth}; workspace=${candidate.workspaceFolderName}`,
      candidate
    })),
    { title }
  )
  return picked ? folderFromCandidate(picked.candidate) : undefined
}

function folderFromCandidate(candidate: MarkerRootCandidate): vscode.WorkspaceFolder {
  return folderFromRoot(candidate.root, candidate.name)
}

function folderFromRoot(root: string, name = path.basename(root)): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.file(root), name, index: -1 }
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
