export type WorkflowPackageFileKind =
  | "file"
  | "directory"
  | "symbolic-link"
  | "other"

export interface WorkflowPackageFileStat {
  readonly kind: WorkflowPackageFileKind
  readonly size: number
  /**
   * Opaque adapter-owned identity used only to detect snapshot changes.
   * It must change whenever the file kind or byte snapshot changes.
   */
  readonly identity: string
}

export interface WorkflowPackageFileSystem<HostRoot = unknown> {
  lstat(root: HostRoot, segments: readonly string[]): Promise<WorkflowPackageFileStat>
  readDirectory(root: HostRoot, segments: readonly string[]): Promise<readonly string[]>
  readFile(root: HostRoot, segments: readonly string[]): Promise<Uint8Array>
  realpath(root: HostRoot, segments: readonly string[]): Promise<string>
  isWithin(rootPhysical: string, candidatePhysical: string): boolean

  /** Authoring-only operations; P2 loading never calls them. */
  flushFile?(root: HostRoot, segments: readonly string[]): Promise<void>
  flushDirectory?(root: HostRoot, segments: readonly string[]): Promise<void>
  rename?(root: HostRoot, from: readonly string[], to: readonly string[]): Promise<void>
}
