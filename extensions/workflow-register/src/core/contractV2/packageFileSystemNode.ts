import {
  lstat as nodeLstat,
  open as nodeOpen,
  readFile as nodeReadFile,
  readdir as nodeReadDirectory,
  realpath as nodeRealpath,
  rename as nodeRename
} from "node:fs/promises"
import * as nodePath from "node:path"

import type {
  WorkflowPackageFileKind,
  WorkflowPackageFileStat,
  WorkflowPackageFileSystem
} from "./packageFileSystem"

const numberIsSafeInteger = Number.isSafeInteger
const objectFreeze = Object.freeze
const stringStartsWith = String.prototype.startsWith

export function createNodeWorkflowPackageFileSystem(): WorkflowPackageFileSystem<string> {
  return objectFreeze({
    async lstat(root: string, segments: readonly string[]): Promise<WorkflowPackageFileStat> {
      const stats = await nodeLstat(resolveNodePath(root, segments), { bigint: true })
      const size = Number(stats.size)
      if (!numberIsSafeInteger(size) || size < 0) throw new Error("Workflow package file size is not a safe integer.")
      return objectFreeze({
        kind: nodeFileKind(stats),
        size,
        identity: [stats.dev, stats.ino, stats.mode, stats.size, stats.mtimeNs, stats.ctimeNs]
          .map((value) => value.toString())
          .join(":")
      })
    },

    async readDirectory(root: string, segments: readonly string[]): Promise<readonly string[]> {
      return nodeReadDirectory(resolveNodePath(root, segments), { encoding: "utf8" })
    },

    async readFile(root: string, segments: readonly string[]): Promise<Uint8Array> {
      return nodeReadFile(resolveNodePath(root, segments))
    },

    async realpath(root: string, segments: readonly string[]): Promise<string> {
      return nodeRealpath(resolveNodePath(root, segments))
    },

    isWithin(rootPhysical: string, candidatePhysical: string): boolean {
      const relative = nodePath.relative(rootPhysical, candidatePhysical)
      return relative === "" || (
        !nodePath.isAbsolute(relative)
        && relative !== ".."
        && !reflectStartsWith(relative, `..${nodePath.sep}`)
      )
    },

    async flushFile(root: string, segments: readonly string[]): Promise<void> {
      const handle = await nodeOpen(resolveNodePath(root, segments), "r")
      try {
        await handle.sync()
      } finally {
        await handle.close()
      }
    },

    async flushDirectory(root: string, segments: readonly string[]): Promise<void> {
      const handle = await nodeOpen(resolveNodePath(root, segments), "r")
      try {
        await handle.sync()
      } catch (error) {
        if (!isUnsupportedDirectorySync(error)) throw error
      } finally {
        await handle.close()
      }
    },

    async rename(root: string, from: readonly string[], to: readonly string[]): Promise<void> {
      await nodeRename(resolveNodePath(root, from), resolveNodePath(root, to))
    }
  })
}

function resolveNodePath(root: string, segments: readonly string[]): string {
  return nodePath.join(root, ...segments)
}

function nodeFileKind(stats: {
  isFile(): boolean
  isDirectory(): boolean
  isSymbolicLink(): boolean
}): WorkflowPackageFileKind {
  if (stats.isSymbolicLink()) return "symbolic-link"
  if (stats.isFile()) return "file"
  if (stats.isDirectory()) return "directory"
  return "other"
}

function reflectStartsWith(value: string, expected: string): boolean {
  return Reflect.apply(stringStartsWith, value, [expected]) as boolean
}

function isUnsupportedDirectorySync(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  const code = (error as { code?: unknown }).code
  return code === "EINVAL" || code === "ENOTSUP" || code === "EPERM" || code === "EISDIR"
}
