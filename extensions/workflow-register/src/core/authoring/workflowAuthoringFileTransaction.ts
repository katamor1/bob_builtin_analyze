import { createHash, randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"

const authoringTransactionTails = new Map<string, Promise<void>>()

export async function withAuthoringFileTransactionLock<T>(
  workspaceRoot: string,
  relativePath: string,
  operation: () => Promise<T>
): Promise<T> {
  const root = path.resolve(workspaceRoot)
  const target = containedTarget(root, relativePath)
  const key = await physicalTargetKey(workspaceRoot, relativePath)
  const predecessor = authoringTransactionTails.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const tail = predecessor.then(() => current, () => current)
  authoringTransactionTails.set(key, tail)
  await predecessor.catch(() => undefined)
  try { return await operation() } finally {
    release()
    if (authoringTransactionTails.get(key) === tail) authoringTransactionTails.delete(key)
  }
}

export type AuthoringFileExpectation = {
  readonly relativePath: string
  readonly parentLogicalPath: string
  readonly parentPhysicalPath: string
  readonly parentDevice: bigint
  readonly parentInode: bigint
  readonly targetDevice?: bigint
  readonly targetInode?: bigint
  readonly expectedBytes?: Buffer
}

export async function captureAuthoringFileExpectation(
  workspaceRoot: string,
  relativePath: string,
  expectedBytes?: Uint8Array
): Promise<AuthoringFileExpectation> {
  const root = path.resolve(workspaceRoot)
  const target = containedTarget(root, relativePath)
  const parentLogicalPath = path.dirname(target)
  const rootPhysical = await fs.realpath(root)
  const parentPhysicalPath = await fs.realpath(parentLogicalPath)
  assertInside(rootPhysical, parentPhysicalPath)
  const parent = await fs.stat(parentPhysicalPath, { bigint: true })
  if (!parent.isDirectory()) throw new Error("authoring target parent is not a directory")
  const physicalTarget = path.join(parentPhysicalPath, path.basename(target))
  try {
    const targetStat = await fs.lstat(physicalTarget, { bigint: true })
    if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error("authoring target is not a regular file")
    if (expectedBytes === undefined) throw new AuthoringTargetChangedError()
    return {
      relativePath,
      parentLogicalPath,
      parentPhysicalPath,
      parentDevice: parent.dev,
      parentInode: parent.ino,
      targetDevice: targetStat.dev,
      targetInode: targetStat.ino,
      expectedBytes: Buffer.from(expectedBytes)
    }
  } catch (error) {
    if (!isMissing(error)) throw error
    if (expectedBytes !== undefined) throw new AuthoringTargetChangedError()
    return { relativePath, parentLogicalPath, parentPhysicalPath, parentDevice: parent.dev, parentInode: parent.ino }
  }
}

export async function commitAuthoringFileAtomically(
  workspaceRoot: string,
  expectation: AuthoringFileExpectation,
  bytes: Uint8Array,
  options: { canCommit?: () => boolean; createPersistentBackup?: boolean } = {}
): Promise<"committed" | "changed" | "stale"> {
  const rootPhysical = await fs.realpath(path.resolve(workspaceRoot))
  const target = path.join(expectation.parentPhysicalPath, path.basename(expectation.relativePath))
  const marker = `.workflow-builder-${randomUUID()}`
  const temporary = path.join(expectation.parentPhysicalPath, `${marker}.tmp`)
  const ownershipAnchor = path.join(expectation.parentPhysicalPath, `${marker}.anchor`)
  const rollback = path.join(expectation.parentPhysicalPath, `${marker}.bak`)
  let movedOriginal = false
  let published = false
  let committed = false
  let stagedIdentity: { dev: bigint; ino: bigint } | undefined
  const stagedDigest = digest(Buffer.from(bytes))
  let persistentBackup: string | undefined
  let persistentBackupIdentity: { dev: bigint; ino: bigint } | undefined
  let operationError: unknown
  try {
    if (!(await parentIsStable(rootPhysical, expectation))) return "changed"
    if (options.canCommit && !options.canCommit()) return "stale"
    await fs.writeFile(temporary, bytes, { flag: "wx" })
    stagedIdentity = await regularIdentity(temporary)
    try {
      await fs.link(temporary, ownershipAnchor)
    } catch (error) {
      try {
        await requireOwnedPublishedTarget(temporary, ownershipAnchor, stagedIdentity, stagedDigest)
      } catch {
        throw error
      }
    }
    await requireOwnedPublishedTarget(temporary, ownershipAnchor, stagedIdentity, stagedDigest)
    if (!(await parentIsStable(rootPhysical, expectation))) return "changed"
    if (options.canCommit && !options.canCommit()) return "stale"

    if (expectation.expectedBytes !== undefined) {
      const current = await optionalRegularIdentity(target)
      if (!current || current.dev !== expectation.targetDevice || current.ino !== expectation.targetInode) return "changed"
      if (!(await fs.readFile(target)).equals(expectation.expectedBytes)) return "changed"
      if (options.createPersistentBackup) {
        persistentBackup = path.join(
          expectation.parentPhysicalPath,
          `WORKFLOW.backup-${backupTimestamp()}-${randomUUID()}.md`
        )
        try {
          await fs.writeFile(persistentBackup, expectation.expectedBytes, { flag: "wx" })
          persistentBackupIdentity = await regularIdentity(persistentBackup)
        } catch (error) {
          const identity = await optionalRegularIdentity(persistentBackup).catch(() => undefined)
          const backupBytes = identity ? await fs.readFile(persistentBackup).catch(() => undefined) : undefined
          if (identity && backupBytes?.equals(expectation.expectedBytes)) persistentBackupIdentity = identity
          throw error
        }
        if (!(await parentIsStable(rootPhysical, expectation))) return "changed"
        const currentAfterBackup = await optionalRegularIdentity(target)
        if (!currentAfterBackup || currentAfterBackup.dev !== expectation.targetDevice || currentAfterBackup.ino !== expectation.targetInode
          || !(await fs.readFile(target)).equals(expectation.expectedBytes)) return "changed"
        if (options.canCommit && !options.canCommit()) return "stale"
      }
      try {
        await fs.rename(target, rollback)
        movedOriginal = true
      } catch (error) {
        const moved = await optionalRegularIdentity(rollback)
        const remaining = await optionalRegularIdentity(target)
        if (moved && moved.dev === expectation.targetDevice && moved.ino === expectation.targetInode && !remaining) {
          movedOriginal = true
        }
        throw error
      }
      const moved = await regularIdentity(rollback)
      const movedBytes = await fs.readFile(rollback)
      if (moved.dev !== expectation.targetDevice || moved.ino !== expectation.targetInode || !movedBytes.equals(expectation.expectedBytes)) {
        await fs.rename(rollback, target)
        movedOriginal = false
        return "changed"
      }
    } else if (await optionalRegularIdentity(target)) {
      return "changed"
    }

    if (options.canCommit && !options.canCommit()) return "stale"

    try {
      await fs.link(temporary, target)
      published = true
    } catch (error) {
      const targetIdentity = await optionalRegularIdentity(target)
      if (targetIdentity && stagedIdentity && targetIdentity.dev === stagedIdentity.dev && targetIdentity.ino === stagedIdentity.ino) {
        published = true
        await requireOwnedPublishedTarget(target, ownershipAnchor, stagedIdentity, stagedDigest)
        throw error
      }
      if (isAlreadyExists(error)) return "changed"
      if (!(await parentIsStable(rootPhysical, expectation).catch(() => false))) return "changed"
      throw error
    }
    if (!(await parentIsStable(rootPhysical, expectation))) return "changed"
    if (!stagedIdentity) throw new Error("authoring staging identity is unavailable")
    await requireOwnedPublishedTarget(target, ownershipAnchor, stagedIdentity, stagedDigest)
    if (movedOriginal) {
      await removePathReconciled(rollback)
      movedOriginal = false
    }
    committed = true
    return "committed"
  } catch (error) {
    operationError = error
    throw error
  } finally {
    const cleanupErrors: string[] = []
    const ownedParent = await findOwnedParentPath(expectation).catch(() => undefined)
    const cleanupTarget = ownedParent ? path.join(ownedParent, path.basename(target)) : target
    const cleanupTemporary = ownedParent ? path.join(ownedParent, path.basename(temporary)) : temporary
    const cleanupOwnershipAnchor = ownedParent ? path.join(ownedParent, path.basename(ownershipAnchor)) : ownershipAnchor
    const cleanupRollback = ownedParent ? path.join(ownedParent, path.basename(rollback)) : rollback
    const cleanupPersistentBackup = persistentBackup
      ? ownedParent ? path.join(ownedParent, path.basename(persistentBackup)) : persistentBackup
      : undefined
    if (!committed && published && stagedIdentity) {
      const current = await optionalRegularIdentity(cleanupTarget).catch(() => undefined)
      if (current && current.dev === stagedIdentity.dev && current.ino === stagedIdentity.ino) {
        try {
          await requireOwnedPublishedTarget(cleanupTarget, cleanupOwnershipAnchor, stagedIdentity, stagedDigest)
          await removePathReconciled(cleanupTarget)
          published = false
        } catch (error) {
          cleanupErrors.push(`cannot remove published authoring target: ${errorMessage(error)}`)
        }
      }
    }
    if (movedOriginal) {
      if (!(await pathExists(cleanupTarget))) {
        try {
          await fs.rename(cleanupRollback, cleanupTarget)
          if (!(await originalTargetIsRestored(cleanupTarget, cleanupRollback, expectation))) {
            throw new Error("restored authoring target changed during rollback")
          }
          movedOriginal = false
        } catch (error) {
          if (await originalTargetIsRestored(cleanupTarget, cleanupRollback, expectation).catch(() => false)) {
            movedOriginal = false
          } else {
            cleanupErrors.push(`cannot restore original authoring target: ${errorMessage(error)}`)
          }
        }
      } else {
        cleanupErrors.push("cannot restore original authoring target because the target path is occupied")
      }
    }
    try { if (stagedIdentity) await removeOwnedStagingPath(cleanupTemporary, stagedIdentity) } catch (error) {
      cleanupErrors.push(`cannot remove authoring staging file: ${errorMessage(error)}`)
    }
    try { if (stagedIdentity) await removeOwnedStagingPath(cleanupOwnershipAnchor, stagedIdentity) } catch (error) {
      cleanupErrors.push(`cannot remove authoring ownership anchor: ${errorMessage(error)}`)
    }
    if (!movedOriginal) {
      try { await removeOwnedRollbackPath(cleanupRollback, expectation) } catch (error) {
        cleanupErrors.push(`cannot remove authoring rollback file: ${errorMessage(error)}`)
      }
    }
    if (!committed && cleanupPersistentBackup && persistentBackupIdentity) {
      const current = await optionalRegularIdentity(cleanupPersistentBackup).catch(() => undefined)
      if (current && current.dev === persistentBackupIdentity.dev && current.ino === persistentBackupIdentity.ino) {
        try {
          if (expectation.expectedBytes === undefined
            || digest(await fs.readFile(cleanupPersistentBackup)) !== digest(expectation.expectedBytes)) {
            throw new Error("authoring persistent backup changed before cleanup")
          }
          await removePathReconciled(cleanupPersistentBackup)
        } catch (error) {
          cleanupErrors.push(`cannot remove authoring persistent backup: ${errorMessage(error)}`)
        }
      }
    }
    if (cleanupErrors.length > 0) {
      const prefix = operationError === undefined ? "Authoring file transaction cleanup failed" : errorMessage(operationError)
      throw new Error(`${prefix}; rollback failed: ${cleanupErrors.join("; ")}`, operationError === undefined ? undefined : { cause: operationError })
    }
  }
}

export async function authoringFileExpectationIsCurrent(
  workspaceRoot: string,
  expectation: AuthoringFileExpectation
): Promise<boolean> {
  const rootPhysical = await fs.realpath(path.resolve(workspaceRoot))
  if (!(await parentIsStable(rootPhysical, expectation))) return false
  const target = path.join(expectation.parentPhysicalPath, path.basename(expectation.relativePath))
  const current = await optionalRegularIdentity(target)
  if (expectation.expectedBytes === undefined) return current === undefined
  if (!current || current.dev !== expectation.targetDevice || current.ino !== expectation.targetInode) return false
  return (await fs.readFile(target)).equals(expectation.expectedBytes)
}

export class AuthoringTargetChangedError extends Error {
  constructor() { super("authoring target changed before commit") }
}

async function parentIsStable(rootPhysical: string, expected: AuthoringFileExpectation): Promise<boolean> {
  const resolved = await fs.realpath(expected.parentLogicalPath)
  assertInside(rootPhysical, resolved)
  if (normalized(resolved) !== normalized(expected.parentPhysicalPath)) return false
  const stat = await fs.stat(resolved, { bigint: true })
  return stat.isDirectory() && stat.dev === expected.parentDevice && stat.ino === expected.parentInode
}

async function findOwnedParentPath(expected: AuthoringFileExpectation): Promise<string | undefined> {
  const container = path.dirname(expected.parentLogicalPath)
  for (const entry of await fs.readdir(container, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const candidate = path.join(container, entry.name)
    const stat = await fs.stat(candidate, { bigint: true })
    if (stat.dev === expected.parentDevice && stat.ino === expected.parentInode) return candidate
  }
  return undefined
}

async function optionalRegularIdentity(target: string): Promise<{ dev: bigint; ino: bigint } | undefined> {
  try { return await regularIdentity(target) } catch (error) { if (isMissing(error)) return undefined; throw error }
}

async function regularIdentity(target: string): Promise<{ dev: bigint; ino: bigint }> {
  const stat = await fs.lstat(target, { bigint: true })
  if (!stat.isFile() || stat.isSymbolicLink()) throw new AuthoringTargetChangedError()
  return { dev: stat.dev, ino: stat.ino }
}

async function requireOwnedPublishedTarget(
  target: string,
  ownershipAnchor: string,
  stagedIdentity: { dev: bigint; ino: bigint },
  stagedDigest: string
): Promise<void> {
  const current = await optionalRegularIdentity(target)
  const anchor = await optionalRegularIdentity(ownershipAnchor)
  if (!current || current.dev !== stagedIdentity.dev || current.ino !== stagedIdentity.ino
    || !anchor || anchor.dev !== stagedIdentity.dev || anchor.ino !== stagedIdentity.ino
    || digest(await fs.readFile(target)) !== stagedDigest) {
    throw new Error("published authoring target changed before commit")
  }
}

async function removeOwnedStagingPath(target: string, stagedIdentity: { dev: bigint; ino: bigint }): Promise<void> {
  const current = await optionalRegularIdentity(target)
  if (!current) return
  if (current.dev !== stagedIdentity.dev || current.ino !== stagedIdentity.ino) {
    throw new Error("authoring staging path changed before cleanup")
  }
  await removePathReconciled(target)
}

async function removeOwnedRollbackPath(target: string, expectation: AuthoringFileExpectation): Promise<void> {
  const current = await optionalRegularIdentity(target)
  if (!current) return
  if (expectation.targetDevice === undefined || expectation.targetInode === undefined
    || expectation.expectedBytes === undefined
    || current.dev !== expectation.targetDevice || current.ino !== expectation.targetInode
    || digest(await fs.readFile(target)) !== digest(expectation.expectedBytes)) {
    throw new Error("authoring rollback path changed before cleanup")
  }
  await removePathReconciled(target)
}

async function originalTargetIsRestored(
  target: string,
  rollback: string,
  expectation: AuthoringFileExpectation
): Promise<boolean> {
  if (expectation.targetDevice === undefined || expectation.targetInode === undefined || expectation.expectedBytes === undefined) return false
  const restored = await optionalRegularIdentity(target)
  if (!restored || restored.dev !== expectation.targetDevice || restored.ino !== expectation.targetInode) return false
  if (digest(await fs.readFile(target)) !== digest(expectation.expectedBytes)) return false
  return !(await pathExists(rollback))
}

async function removePathReconciled(target: string): Promise<void> {
  try {
    await fs.rm(target, { force: true })
  } catch (error) {
    if (await pathExists(target)) throw error
  }
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function containedTarget(root: string, relativePath: string): string {
  const target = path.resolve(root, relativePath)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("authoring target escapes workspace")
  return target
}

function assertInside(root: string, target: string): void {
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("authoring target escapes physical workspace")
}

function normalized(value: string): string { const resolved = path.resolve(value); return process.platform === "win32" ? resolved.toLowerCase() : resolved }
async function physicalTargetKey(workspaceRoot: string, relativePath: string): Promise<string> {
  const target = containedTarget(path.resolve(workspaceRoot), relativePath)
  let current = path.dirname(target)
  const missingSegments: string[] = []
  while (true) {
    try {
      const physicalParent = await fs.realpath(current)
      return normalized(path.join(physicalParent, ...missingSegments.reverse(), path.basename(target)))
    } catch (error) {
      if (!isMissing(error)) throw error
      const parent = path.dirname(current)
      if (parent === current) throw error
      missingSegments.push(path.basename(current))
      current = parent
    }
  }
}
function isMissing(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "ENOENT" }
function isAlreadyExists(error: unknown): boolean { return (error as NodeJS.ErrnoException).code === "EEXIST" }
async function pathExists(target: string): Promise<boolean> { try { await fs.lstat(target); return true } catch (error) { if (isMissing(error)) return false; throw error } }
function backupTimestamp(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, "0")
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
