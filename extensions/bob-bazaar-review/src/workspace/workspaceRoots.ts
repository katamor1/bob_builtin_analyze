import * as fs from "fs/promises"
import * as path from "path"
import { resolvePhysicalContainedPathSync } from "../sharedProcessingBudgetRuntime"

export interface WorkspaceFolderLike {
  name: string
  uri: { fsPath: string }
}

export interface MarkerRootCandidate {
  root: string
  name: string
  marker: string
  depth: "direct" | "child"
  workspaceFolderName: string
  workspaceFolderRoot: string
}

export async function findMarkerRoots(folders: readonly WorkspaceFolderLike[], marker: string): Promise<MarkerRootCandidate[]> {
  const direct: MarkerRootCandidate[] = []
  for (const folder of folders) {
    const root = physicalDirectory(folder.uri.fsPath)
    if (root && await rootHasMarker(root, marker)) direct.push(candidate(root, folder.name, marker, "direct", folder))
  }
  if (direct.length > 0) return sortCandidates(direct)

  const child: MarkerRootCandidate[] = []
  for (const folder of folders) {
    const root = physicalDirectory(folder.uri.fsPath)
    if (!root) continue
    for (const entry of await safeReadDir(root)) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue
      const childRoot = physicalDirectory(path.join(root, entry.name))
      if (childRoot && await rootHasMarker(childRoot, marker)) child.push(candidate(childRoot, entry.name, marker, "child", folder))
    }
  }
  return sortCandidates(child)
}

export async function rootHasMarker(root: string, marker: string): Promise<boolean> {
  const physicalRoot = physicalDirectory(root)
  if (!physicalRoot) return false
  try {
    resolvePhysicalContainedPathSync({
      rootPath: physicalRoot,
      candidatePath: marker,
      allowAbsolute: false,
      mustExist: true,
      expectedType: "directory"
    })
    return true
  } catch {
    return false
  }
}

function physicalDirectory(value: string): string | undefined {
  const absolute = path.resolve(value)
  try {
    return resolvePhysicalContainedPathSync({
      rootPath: absolute,
      candidatePath: absolute,
      allowAbsolute: true,
      mustExist: true,
      expectedType: "directory"
    }).root_path
  } catch {
    return undefined
  }
}

function candidate(root: string, name: string, marker: string, depth: "direct" | "child", folder: WorkspaceFolderLike): MarkerRootCandidate {
  return {
    root,
    name,
    marker,
    depth,
    workspaceFolderName: folder.name,
    workspaceFolderRoot: physicalDirectory(folder.uri.fsPath) ?? path.resolve(folder.uri.fsPath)
  }
}

async function safeReadDir(root: string): Promise<Array<{ name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }>> {
  try {
    return await fs.readdir(root, { withFileTypes: true })
  } catch {
    return []
  }
}

function sortCandidates(candidates: MarkerRootCandidate[]): MarkerRootCandidate[] {
  return [...candidates].sort((a, b) => a.root.localeCompare(b.root))
}
