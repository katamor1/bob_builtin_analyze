import * as path from "path"
import * as vscode from "vscode"
import { findMarkerRoots, MarkerRootCandidate, rootHasMarker } from "./workspaceRoots"

interface ResolveBazaarWorkspaceOptions {
  explicitRoot?: string
  workflowRoot?: string
  allowPick?: boolean
  title?: string
}

export async function resolveBazaarWorkspaceFolder(options: ResolveBazaarWorkspaceOptions = {}): Promise<vscode.WorkspaceFolder | undefined> {
  if (options.explicitRoot) return folderFromRoot(path.resolve(options.explicitRoot))
  if (options.workflowRoot && await rootHasMarker(options.workflowRoot, ".bzr")) {
    return folderFromRoot(path.resolve(options.workflowRoot))
  }

  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) {
    if (options.allowPick !== false) await vscode.window.showWarningMessage("Open a Bazaar workspace folder first.")
    return undefined
  }

  const candidates = await findMarkerRoots(folders, ".bzr")
  const activeUri = vscode.window.activeTextEditor?.document.uri
  const activeCandidate = activeUri?.scheme === "file" ? candidateForFile(candidates, activeUri.fsPath) : undefined
  if (activeCandidate) return folderFromCandidate(activeCandidate)
  if (candidates.length === 1) return folderFromCandidate(candidates[0])
  if (candidates.length > 1 && options.allowPick !== false) return pickCandidate(candidates, options.title ?? "Select Bazaar workspace")

  if (folders.length === 1) return folders[0]
  if (options.allowPick === false) return undefined
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: options.title ?? "Select Bazaar workspace" }
  )
  return picked?.folder
}

function candidateForFile(candidates: MarkerRootCandidate[], filePath: string): MarkerRootCandidate | undefined {
  const resolved = path.resolve(filePath)
  return candidates
    .filter((candidate) => isInside(candidate.root, resolved))
    .sort((a, b) => b.root.length - a.root.length)[0]
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

function isInside(root: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(filePath))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
