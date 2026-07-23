import type {
  WorkflowPackageFileKind,
  WorkflowPackageFileStat,
  WorkflowPackageFileSystem
} from "./packageFileSystem"

export const WORKFLOW_PACKAGE_VSCODE_FILE_TYPE_FILE = 1
export const WORKFLOW_PACKAGE_VSCODE_FILE_TYPE_DIRECTORY = 2
export const WORKFLOW_PACKAGE_VSCODE_FILE_TYPE_SYMBOLIC_LINK = 64

export interface WorkflowPackageVscodeFileStat {
  readonly type: number
  readonly size: number
  readonly ctime: number
  readonly mtime: number
}

export interface WorkflowPackageVscodeFileSystemLike<Uri> {
  stat(uri: Uri): Promise<WorkflowPackageVscodeFileStat>
  readDirectory(uri: Uri): Promise<readonly (readonly [string, number])[]>
  readFile(uri: Uri): Promise<Uint8Array>
  rename(oldUri: Uri, newUri: Uri, options?: { overwrite?: boolean }): Promise<void>
}

export interface CreateVscodeWorkflowPackageFileSystemInput<Uri> {
  readonly workspaceFs: WorkflowPackageVscodeFileSystemLike<Uri>
  readonly joinPath: (root: Uri, ...segments: string[]) => Uri
  readonly realpath: (uri: Uri) => Promise<string>
  readonly isWithin: (rootPhysical: string, candidatePhysical: string) => boolean
  readonly flushFile?: (uri: Uri) => Promise<void>
  readonly flushDirectory?: (uri: Uri) => Promise<void>
}

const numberIsSafeInteger = Number.isSafeInteger
const objectFreeze = Object.freeze

/**
 * Builds the VS Code adapter from explicit URI/workspace-fs dependencies. Keeping
 * URI construction and physical realpath resolution injected lets extension-host
 * and remote-provider wiring share the same loader contract without exposing URIs
 * in RawWorkflowPackage evidence.
 */
export function createVscodeWorkflowPackageFileSystem<Uri>(
  input: CreateVscodeWorkflowPackageFileSystemInput<Uri>
): WorkflowPackageFileSystem<Uri> {
  const { workspaceFs, joinPath, realpath, isWithin, flushFile, flushDirectory } = input
  return objectFreeze({
    async lstat(root: Uri, segments: readonly string[]): Promise<WorkflowPackageFileStat> {
      const stat = await workspaceFs.stat(joinPath(root, ...segments))
      if (!numberIsSafeInteger(stat.size) || stat.size < 0) {
        throw new Error("Workflow package VS Code file size is not a safe integer.")
      }
      return objectFreeze({
        kind: vscodeFileKind(stat.type),
        size: stat.size,
        identity: `${stat.type}:${stat.size}:${stat.ctime}:${stat.mtime}`
      })
    },

    async readDirectory(root: Uri, segments: readonly string[]): Promise<readonly string[]> {
      const entries = await workspaceFs.readDirectory(joinPath(root, ...segments))
      return entries.map(([name]) => name)
    },

    async readFile(root: Uri, segments: readonly string[]): Promise<Uint8Array> {
      return workspaceFs.readFile(joinPath(root, ...segments))
    },

    async realpath(root: Uri, segments: readonly string[]): Promise<string> {
      return realpath(joinPath(root, ...segments))
    },

    isWithin,

    async flushFile(root: Uri, segments: readonly string[]): Promise<void> {
      if (flushFile !== undefined) await flushFile(joinPath(root, ...segments))
    },

    async flushDirectory(root: Uri, segments: readonly string[]): Promise<void> {
      if (flushDirectory !== undefined) await flushDirectory(joinPath(root, ...segments))
    },

    async rename(root: Uri, from: readonly string[], to: readonly string[]): Promise<void> {
      await workspaceFs.rename(
        joinPath(root, ...from),
        joinPath(root, ...to),
        { overwrite: false }
      )
    }
  })
}

function vscodeFileKind(type: number): WorkflowPackageFileKind {
  if ((type & WORKFLOW_PACKAGE_VSCODE_FILE_TYPE_SYMBOLIC_LINK) !== 0) return "symbolic-link"
  if ((type & WORKFLOW_PACKAGE_VSCODE_FILE_TYPE_FILE) !== 0) return "file"
  if ((type & WORKFLOW_PACKAGE_VSCODE_FILE_TYPE_DIRECTORY) !== 0) return "directory"
  return "other"
}
