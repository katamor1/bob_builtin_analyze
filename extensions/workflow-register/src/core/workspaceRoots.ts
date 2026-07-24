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

export async function findWorkflowRootCandidates(folders: readonly WorkspaceFolderLike[]): Promise<MarkerRootCandidate[]> {
  return findMarkerRoots(folders, ".bob")
}

export async function findMarkerRoots(folders: readonly WorkspaceFolderLike[], marker: string): Promise<MarkerRootCandidate[]> {
  const direct: MarkerRootCandidate[] = []
  for (const folder of folders) {
    const root = physicalDirectory(folder.uri.fsPath)
    if (root && rootHasMarker(root, marker)) direct.push(candidate(root, folder.name, marker, "direct", folder))
  }
  if (direct.length > 0) return sortCandidates(direct)

  const child: MarkerRootCandidate[] = []
  for (const folder of folders) {
    const root = physicalDirectory(folder.uri.fsPath)
    if (!root) continue
    for (const entry of await safeReadDir(root)) {
      if (entry.isSymbolicLink() || !entry.isDirectory()) continue
      const childRoot = physicalDirectory(path.join(root, entry.name))
      if (childRoot && rootHasMarker(childRoot, marker)) child.push(candidate(childRoot, entry.name, marker, "child", folder))
    }
  }
  return sortCandidates(child)
}

export async function rootHasMarker(root: string, marker: string): Promise<boolean> {
  return rootHasMarkerSync(root, marker)
}

export function workspaceRootFromFile(filePath: string, marker: string): string | undefined {
  const resolved = path.resolve(filePath)
  const parts = resolved.split(path.sep)
  const markerIndex = parts.lastIndexOf(marker)
  if (markerIndex <= 0) return undefined
  const lexicalRoot = parts.slice(0, markerIndex).join(path.sep) || path.parse(resolved).root
  const root = physicalDirectory(lexicalRoot)
  if (!root || !rootHasMarkerSync(root, marker)) return undefined
  try {
    resolvePhysicalContainedPathSync({
      rootPath: root,
      candidatePath: resolved,
      allowAbsolute: true,
      mustExist: false
    })
    return root
  } catch {
    return undefined
  }
}

export function relativePathFromRoot(root: string, filePath: string): string {
  return path.relative(root, filePath).replace(/\\/g, "/")
}

export function fallbackWorkspaceRootCandidates(folders: readonly WorkspaceFolderLike[]): MarkerRootCandidate[] {
  const candidates: MarkerRootCandidate[] = []
  const seen = new Set<string>()
  for (const folder of folders) {
    const root = physicalDirectory(folder.uri.fsPath)
    if (!root) continue
    const identity = process.platform === "win32" ? root.toLowerCase() : root
    if (seen.has(identity)) continue
    seen.add(identity)
    candidates.push(candidate(root, folder.name, ".bob", "direct", folder))
  }
  return sortCandidates(candidates)
}

function rootHasMarkerSync(root: string, marker: string): boolean {
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
