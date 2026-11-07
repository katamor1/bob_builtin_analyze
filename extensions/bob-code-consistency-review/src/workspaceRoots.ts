import * as fs from "fs/promises"
import * as path from "node:path"
import { canonicalizePhysicalPathSync, normalizeWorkspaceRelativePath, resolvePhysicalContainedPathSync } from "./sharedProcessingBudgetRuntime"

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
  if (!validMarker(marker)) return []
  const safeFolders = physicalFolders(folders)
  const direct: MarkerRootCandidate[] = []
  for (const folder of safeFolders) {
    const root = folder.uri.fsPath
    if (await rootHasMarker(root, marker)) direct.push(candidate(root, folder.name, marker, "direct", folder))
  }
  if (direct.length > 0) return sortCandidates(direct)
  const children: MarkerRootCandidate[] = []
  for (const folder of safeFolders) {
    const root = folder.uri.fsPath
    for (const entry of await safeReadDir(root)) {
      if (!entry.isDirectory()) continue
      const childRoot = root + (root.endsWith(path.sep) ? "" : path.sep) + entry.name
      if (await rootHasMarker(childRoot, marker)) {
        const physical = physicalDirectory(childRoot)
        if (physical) children.push(candidate(physical, entry.name, marker, "child", folder))
      }
    }
  }
  return sortCandidates(children)
}

export async function rootHasMarker(root: string, marker: string): Promise<boolean> {
  if (!validMarker(marker)) return false
  try {
    resolvePhysicalContainedPathSync({ rootPath: root, candidatePath: marker, allowAbsolute: false, expectedType: "directory" })
    return true
  } catch { return false }
}

function validMarker(marker: string): boolean {
  try { return !/[\\/]/u.test(marker) && normalizeWorkspaceRelativePath(marker) === marker } catch { return false }
}
function physicalDirectory(value: string): string | undefined {
  try { return canonicalizePhysicalPathSync(value, { expectedType: "directory" }).path } catch { return undefined }
}
function physicalKey(value: string): string { return path.sep === "\\" ? value.toLowerCase() : value }
function physicalFolders(folders: readonly WorkspaceFolderLike[]): WorkspaceFolderLike[] {
  const seen = new Set<string>(), result: WorkspaceFolderLike[] = []
  for (const folder of folders) {
    const root = physicalDirectory(folder.uri.fsPath)
    if (!root || seen.has(physicalKey(root))) continue
    seen.add(physicalKey(root))
    result.push({ name: folder.name, uri: { fsPath: root } })
  }
  return result
}
function candidate(root: string, name: string, marker: string, depth: "direct" | "child", folder: WorkspaceFolderLike): MarkerRootCandidate {
  return { root, name, marker, depth, workspaceFolderName: folder.name, workspaceFolderRoot: folder.uri.fsPath }
}
async function safeReadDir(root: string): Promise<Array<{ name: string; isDirectory: () => boolean }>> {
  try { return await fs.readdir(root, { withFileTypes: true }) } catch { return [] }
}
function sortCandidates(candidates: MarkerRootCandidate[]): MarkerRootCandidate[] {
  const seen = new Set<string>()
  return [...candidates].sort((a, b) => a.root.localeCompare(b.root)).filter(row => {
    const key = physicalKey(row.root)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
