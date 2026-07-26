import * as linux from "./attemptArtifactWorkspaceLinux"
import type {
  AttemptArtifactWorkspace,
  AttemptArtifactWorkspaceTree,
  VerifiedAttemptArtifactFile
} from "./attemptArtifactWorkspaceLinux"

export type {
  AttemptArtifactWorkspace,
  AttemptArtifactWorkspaceTree,
  VerifiedAttemptArtifactFile
} from "./attemptArtifactWorkspaceLinux"

const runtimePlatform = process.platform

function requireSecureArtifactPlatform(): void {
  if (runtimePlatform !== "linux") {
    throw new Error(
      "Secure artifact filesystem operations are unsupported on this platform; failing closed."
    )
  }
}

export async function allocateAttemptArtifactWorkspace(
  runRoot: string,
  attemptId: string
): Promise<AttemptArtifactWorkspace> {
  requireSecureArtifactPlatform()
  return linux.allocateAttemptArtifactWorkspace(runRoot, attemptId)
}

export async function writeAttemptArtifactWorkspaceFile(
  workspace: AttemptArtifactWorkspace,
  relativePath: string,
  bytes: Uint8Array
): Promise<void> {
  requireSecureArtifactPlatform()
  return linux.writeAttemptArtifactWorkspaceFile(workspace, relativePath, bytes)
}

export async function listAttemptArtifactWorkspaceFiles(
  workspace: AttemptArtifactWorkspace
): Promise<readonly string[]> {
  requireSecureArtifactPlatform()
  return linux.listAttemptArtifactWorkspaceFiles(workspace)
}

export async function inspectAttemptArtifactWorkspaceTree(
  workspace: AttemptArtifactWorkspace
): Promise<AttemptArtifactWorkspaceTree> {
  requireSecureArtifactPlatform()
  return linux.inspectAttemptArtifactWorkspaceTree(workspace)
}

export async function inspectCommittedAttemptArtifactWorkspaceTree(input: {
  readonly runRoot: string
  readonly attemptId: string
}): Promise<AttemptArtifactWorkspaceTree | undefined> {
  requireSecureArtifactPlatform()
  return linux.inspectCommittedAttemptArtifactWorkspaceTree(input)
}

export async function readVerifiedAttemptArtifactWorkspaceFile(
  workspace: AttemptArtifactWorkspace,
  relativePath: string,
  maximumBytes: number
): Promise<VerifiedAttemptArtifactFile> {
  requireSecureArtifactPlatform()
  return linux.readVerifiedAttemptArtifactWorkspaceFile(workspace, relativePath, maximumBytes)
}

export async function writeAttemptArtifactSetFile(
  workspace: AttemptArtifactWorkspace,
  bytes: Uint8Array
): Promise<void> {
  requireSecureArtifactPlatform()
  return linux.writeAttemptArtifactSetFile(workspace, bytes)
}

export async function promoteAttemptArtifactWorkspace(
  workspace: AttemptArtifactWorkspace
): Promise<string> {
  requireSecureArtifactPlatform()
  return linux.promoteAttemptArtifactWorkspace(workspace)
}

export async function abortAttemptArtifactWorkspace(
  workspace: AttemptArtifactWorkspace
): Promise<void> {
  requireSecureArtifactPlatform()
  return linux.abortAttemptArtifactWorkspace(workspace)
}

export async function readCommittedAttemptArtifactSetBytes(input: {
  readonly runRoot: string
  readonly attemptId: string
}): Promise<Uint8Array | undefined> {
  requireSecureArtifactPlatform()
  return linux.readCommittedAttemptArtifactSetBytes(input)
}

export async function readCommittedAttemptArtifactFile(input: {
  readonly runRoot: string
  readonly attemptId: string
  readonly relativePath: string
  readonly maximumBytes: number
}): Promise<Uint8Array> {
  requireSecureArtifactPlatform()
  return linux.readCommittedAttemptArtifactFile(input)
}
