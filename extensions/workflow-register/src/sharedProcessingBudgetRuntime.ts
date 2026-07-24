declare const require: (id: string) => unknown

export interface SharedPhysicalContainedPath {
  readonly root_path: string
  readonly path: string
  readonly relative_path: string
  readonly exists: boolean
}

interface SharedPathRuntime {
  normalizeWorkspaceRelativePath(value: string, label?: string): string
  isPortablePathContained(rootPath: string, targetPath: string, platform?: string): boolean
  resolvePhysicalContainedPathSync(input: {
    rootPath: string
    candidatePath: string
    allowAbsolute?: boolean
    mustExist?: boolean
    expectedType?: "file" | "directory"
  }): SharedPhysicalContainedPath
  selectDeepestPhysicalRoot(roots: readonly string[], filePath: string): Promise<string | undefined>
}

const runtime = require("./shared-processing-budget-runtime/path-policy.js") as SharedPathRuntime

export const normalizeWorkspaceRelativePath = runtime.normalizeWorkspaceRelativePath
export const isPortablePathContained = runtime.isPortablePathContained
export const resolvePhysicalContainedPathSync = runtime.resolvePhysicalContainedPathSync
export const selectDeepestPhysicalRoot = runtime.selectDeepestPhysicalRoot
