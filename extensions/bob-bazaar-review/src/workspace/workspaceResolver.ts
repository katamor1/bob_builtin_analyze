import * as path from "path"
import * as vscode from "vscode"
import {
  resolvePhysicalContainedPathSync,
  selectDeepestPhysicalRoot
} from "../sharedProcessingBudgetRuntime"
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
  if (options.explicitRoot) {
    const explicitRoot = tryPhysicalWorkspaceRoot(options.explicitRoot)
    if (explicitRoot && await rootHasMarker(explicitRoot, marker)) return folderFromRoot(explicitRoot)
    if (options.allowPick !== false) {
      await vscode.window.showWarningMessage(`${label} 明示rootに安全な ${marker} が見つかりません: ${path.resolve(options.explicitRoot)}`)
    }
    return undefined
  }
  if (options.workflowRoot && await rootHasMarker(options.workflowRoot, marker)) {
    const workflowRoot = tryPhysicalWorkspaceRoot(options.workflowRoot)
    if (workflowRoot) return folderFromRoot(workflowRoot)
  }

  const folders = vscode.workspace.workspaceFolders ?? []
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

  const physicalFolders = folders
    .map((folder) => ({ folder, root: tryPhysicalWorkspaceRoot(folder.uri.fsPath) }))
    .filter((entry): entry is { folder: vscode.WorkspaceFolder; root: string } => Boolean(entry.root))
    .map(({ folder, root }) => folderFromRoot(root, folder.name))
  if (physicalFolders.length === 1) return physicalFolders[0]
  if (options.allowPick === false) return undefined
  const picked = await vscode.window.showQuickPick(
    physicalFolders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: options.title ?? `${label} ワークスペースを選択` }
  )
  return picked?.folder
}

async function candidateForFile(candidates: MarkerRootCandidate[], filePath: string): Promise<MarkerRootCandidate | undefined> {
  const selectedRoot = await selectDeepestPhysicalRoot(candidates.map((candidate) => candidate.root), filePath)
  return selectedRoot ? candidates.find((candidate) => candidate.root === selectedRoot) : undefined
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
  return { uri: vscode.Uri.file(physicalWorkspaceRoot(root)), name, index: -1 }
}

function physicalWorkspaceRoot(value: string): string {
  const root = path.resolve(value)
  return resolvePhysicalContainedPathSync({
    rootPath: root,
    candidatePath: root,
    allowAbsolute: true,
    mustExist: true,
    expectedType: "directory"
  }).root_path
}

function tryPhysicalWorkspaceRoot(value: string): string | undefined {
  try {
    return physicalWorkspaceRoot(value)
  } catch {
    return undefined
  }
}
