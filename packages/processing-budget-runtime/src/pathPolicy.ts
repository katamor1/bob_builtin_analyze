declare const require: (id: string) => unknown

export type PortablePathPlatform = "win32" | "linux" | "darwin" | string
export type PhysicalPathExpectedType = "file" | "directory"

export interface CanonicalPhysicalPath {
  readonly path: string
  readonly existing_ancestor: string
  readonly exists: boolean
}

export interface PhysicalContainedPath {
  readonly root_path: string
  readonly path: string
  readonly relative_path: string
  readonly exists: boolean
}

export interface ResolvePhysicalContainedPathInput {
  readonly rootPath: string
  readonly candidatePath: string
  readonly allowAbsolute?: boolean
  readonly mustExist?: boolean
  readonly expectedType?: PhysicalPathExpectedType
}

export interface CanonicalizePhysicalPathOptions {
  readonly label?: string
  readonly mustExist?: boolean
  readonly rejectLinks?: boolean
  readonly expectedType?: PhysicalPathExpectedType
}

export interface SharedPathPolicyError extends Error {
  readonly code:
    | "path_policy_invalid"
    | "path_policy_device"
    | "path_policy_drive_relative"
    | "path_policy_absolute"
    | "path_policy_escape"
    | "path_policy_symlink"
    | "path_policy_unavailable"
    | "path_policy_not_directory"
    | "path_policy_not_file"
}

interface PathPolicyRuntime {
  readonly MAX_PUBLIC_PATH_UTF8_BYTES: number
  readonly PathPolicyError: new (code: SharedPathPolicyError["code"], message: string) => SharedPathPolicyError
  normalizeWorkspaceRelativePath(value: string, label?: string): string
  isPortablePathContained(rootPath: string, targetPath: string, platform?: PortablePathPlatform): boolean
  canonicalizePhysicalPathSync(value: string, options?: CanonicalizePhysicalPathOptions): CanonicalPhysicalPath
  resolvePhysicalContainedPathSync(input: ResolvePhysicalContainedPathInput): PhysicalContainedPath
  resolvePhysicalContainedPath(input: ResolvePhysicalContainedPathInput): Promise<PhysicalContainedPath>
  selectDeepestPhysicalRoot(roots: readonly string[], filePath: string): Promise<string | undefined>
}

const runtime = require("./path-policy.js") as PathPolicyRuntime

export const MAX_PUBLIC_PATH_UTF8_BYTES = runtime.MAX_PUBLIC_PATH_UTF8_BYTES
export const PathPolicyError = runtime.PathPolicyError
export const normalizeWorkspaceRelativePath = runtime.normalizeWorkspaceRelativePath
export const isPortablePathContained = runtime.isPortablePathContained
export const canonicalizePhysicalPathSync = runtime.canonicalizePhysicalPathSync
export const resolvePhysicalContainedPathSync = runtime.resolvePhysicalContainedPathSync
export const resolvePhysicalContainedPath = runtime.resolvePhysicalContainedPath
export const selectDeepestPhysicalRoot = runtime.selectDeepestPhysicalRoot
