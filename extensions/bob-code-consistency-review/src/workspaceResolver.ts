import * as path from "node:path"
import * as vscode from "vscode"
import {
  resolvePhysicalContainedPathSync,
  selectDeepestPhysicalRoot
} from "./sharedProcessingBudgetRuntime"
import { findMarkerRoots, MarkerRootCandidate, rootHasMarker } from "./workspaceRoots"

interface ResolveBobWorkspaceOptions {
  explicitRoot?: string
  workflowRoot?: string
  allowPick?: boolean
  title?: string
}

export async function resolveBobWorkspaceRoot(options: ResolveBobWorkspaceOptions = {}): Promise<string | undefined> {
  if (options.explicitRoot) return physicalWorkspaceRoot(options.explicitRoot)
  if (options.workflowRoot && await rootHasMarker(options.workflowRoot, ".bob")) return physicalWorkspaceRoot(options.workflowRoot)

  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return undefined

  const candidates = await findMarkerRoots(folders, ".bob")
  const activeUri = vscode.window.activeTextEditor?.document.uri
  const activeCandidate = activeUri?.scheme === "file" ? await candidateForFile(candidates, activeUri.fsPath) : undefined
  if (activeCandidate) return activeCandidate.root
  if (candidates.length === 1) return candidates[0].root
  if (candidates.length > 1 && options.allowPick !== false) return pickCandidate(candidates, options.title ?? "Select Bob workspace")

  const physicalFolders = folders
    .map((folder) => ({ folder, root: tryPhysicalWorkspaceRoot(folder.uri.fsPath) }))
    .filter((entry): entry is { folder: vscode.WorkspaceFolder; root: string } => Boolean(entry.root))
  if (physicalFolders.length === 1) return physicalFolders[0].root
  if (options.allowPick === false) return undefined
  const picked = await vscode.window.showQuickPick(
    physicalFolders.map(({ folder, root }) => ({ label: folder.name, description: root, root })),
    { title: options.title ?? "Select Bob workspace" }
  )
  return picked?.root
}

async function candidateForFile(candidates: MarkerRootCandidate[], filePath: string): Promise<MarkerRootCandidate | undefined> {
  const selectedRoot = await selectDeepestPhysicalRoot(candidates.map((candidate) => candidate.root), filePath)
  return selectedRoot ? candidates.find((candidate) => candidate.root === selectedRoot) : undefined
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
