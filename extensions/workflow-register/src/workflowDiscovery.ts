import * as path from "path"
import * as vscode from "vscode"
import {
  fallbackWorkspaceRootCandidates,
  findWorkflowRootCandidates,
  relativePathFromRoot
} from "./core/workspaceRoots"
import type { MarkerRootCandidate } from "./core/workspaceRoots"

export interface WorkflowFileCandidate {
  root: MarkerRootCandidate
  file: vscode.Uri
  relativePath: string
  folderName: string
}

export interface WorkflowPackageSlotCandidate {
  root: MarkerRootCandidate
  currentPointer: vscode.Uri
  relativePath: string
  folderName: string
  collectionId: string
  collectionRoot: string
  workflowId: string
}

export interface WorkflowDiscoveryResult {
  files: WorkflowFileCandidate[]
  packages: WorkflowPackageSlotCandidate[]
  diagnostics: string[]
}

export async function discoverWorkspaceWorkflowFiles(): Promise<WorkflowDiscoveryResult> {
  const diagnostics: string[] = []
  const candidates: WorkflowFileCandidate[] = []
  const packages: WorkflowPackageSlotCandidate[] = []
  const folders = vscode.workspace.workspaceFolders ?? []
  const roots = await findWorkflowRootCandidates(folders)
  const searchRoots = roots.length > 0 ? roots : fallbackWorkspaceRootCandidates(folders)
  for (const root of searchRoots) {
    const [files, currentPointers] = await Promise.all([
      vscode.workspace.findFiles(
        new vscode.RelativePattern(root.root, ".bob/workflows/*/WORKFLOW.md")
      ),
      vscode.workspace.findFiles(
        new vscode.RelativePattern(root.root, ".bob/workflows/*/current.json")
      )
    ])
    diagnostics.push(
      `- workspace: ${root.workspaceFolderName}; workflowRoot=${root.root}; marker=${root.marker}; depth=${root.depth}; workflow files: ${files.length}`
    )
    diagnostics.push(
      `- workspace: ${root.workspaceFolderName}; Contract v2 package slots: ${currentPointers.length}`
    )
    for (const file of files) {
      candidates.push({
        root,
        file,
        relativePath: relativePathFromRoot(root.root, file.fsPath),
        folderName: path.basename(path.dirname(file.fsPath))
      })
    }
    for (const currentPointer of currentPointers) {
      const slotRoot = path.dirname(currentPointer.fsPath)
      const collectionRoot = path.dirname(slotRoot)
      packages.push({
        root,
        currentPointer,
        relativePath: relativePathFromRoot(root.root, currentPointer.fsPath),
        folderName: path.basename(slotRoot),
        collectionId: relativePathFromRoot(root.root, collectionRoot),
        collectionRoot,
        workflowId: path.basename(slotRoot)
      })
    }
  }
  candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  packages.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return { files: candidates, packages, diagnostics }
}
