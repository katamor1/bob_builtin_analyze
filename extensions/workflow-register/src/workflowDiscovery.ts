import * as fs from "fs/promises"
import * as path from "path"
import { createHash } from "crypto"
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
    const [files, currentPointers, generationFiles] = await Promise.all([
      vscode.workspace.findFiles(
        new vscode.RelativePattern(root.root, ".bob/workflows/*/WORKFLOW.md")
      ),
      vscode.workspace.findFiles(
        new vscode.RelativePattern(root.root, ".bob/workflows/*/current.json"), null
      ),
      vscode.workspace.findFiles(new vscode.RelativePattern(root.root, ".bob/workflows/*/versions/*/workflow.yaml"), null)
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
    const pointers = new Map(currentPointers.filter(uri => /^\.bob\/workflows\/[^/]+\/current\.json$/.test(relativePathFromRoot(root.root, uri.fsPath))).map(uri => [path.dirname(uri.fsPath), uri]))
    for (const file of generationFiles) {
      if (!/^\.bob\/workflows\/[^/]+\/versions\/[^/]+\/workflow\.yaml$/.test(relativePathFromRoot(root.root, file.fsPath))) continue
      const slotRoot = path.dirname(path.dirname(path.dirname(file.fsPath)))
      if (!pointers.has(slotRoot)) pointers.set(slotRoot, vscode.Uri.file(path.join(slotRoot, "current.json")))
    }
    // Structural ownership survives file exclusions and incomplete or wrong-type entries.
    const collection = path.join(root.root, ".bob/workflows")
    try {
      for (const entry of await fs.readdir(collection, { withFileTypes: true })) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue
        const slotRoot = path.join(collection, entry.name)
        let reserved = false
        try {
          const names = await fs.readdir(slotRoot)
          reserved = names.includes("current.json") || names.includes("versions")
        } catch {
          reserved = true
          diagnostics.push("- WF2_PACKAGE_LAYOUT_INVALID: unreadable workflow slot: " + entry.name)
        }
        if (reserved) pointers.set(slotRoot, vscode.Uri.file(path.join(slotRoot, "current.json")))
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        files.length = 0
        diagnostics.push("- WF2_PACKAGE_LAYOUT_INVALID: workflow collection ownership is unreadable.")
      }
    }
    for (const currentPointer of pointers.values()) {
      const slotRoot = path.dirname(currentPointer.fsPath)
      const collectionRoot = path.dirname(slotRoot)
      packages.push({
        root,
        currentPointer,
        relativePath: relativePathFromRoot(root.root, currentPointer.fsPath),
        folderName: path.basename(slotRoot),
        collectionId: workflowContractV2CollectionId(collectionRoot),
        collectionRoot,
        workflowId: path.basename(slotRoot)
      })
    }
  }
  candidates.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  packages.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  return { files: candidates, packages, diagnostics }
}

export function workflowContractV2CollectionId(collectionRoot: string): string {
  return "collection-" + createHash("sha256").update(path.resolve(collectionRoot).replaceAll("\\", "/"), "utf8").digest("hex")
}
