import { createHash, randomUUID } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"

export interface WorkspaceFileTransactionWrite {
  relativePath: string
  text: string | Buffer
  encoding?: BufferEncoding
}

interface VerifiedPhysicalDirectory {
  path: string
  dev: bigint
  ino: bigint
}

interface StagedWorkspaceWrite {
  relativePath: string
  parent: VerifiedPhysicalDirectory
  target: string
  temporary: string
  ownershipAnchor: string
  backup: string
  backupCreated: boolean
  committed: boolean
  stagedDevice?: bigint
  stagedInode?: bigint
  stagedDigest?: string
}

const workspaceTransactionTails = new Map<string, Promise<void>>()

export async function writeWorkspaceFilesAtomically(
  workspaceRoot: string,
  writes: WorkspaceFileTransactionWrite[],
  commitState: () => Promise<void> | void = () => undefined,
  prepareCommit: () => Promise<void> | void = () => undefined
): Promise<void> {
  if (writes.length === 0) return
  const root = path.resolve(workspaceRoot)
  const physicalRoot = await fs.realpath(root)
  await withPhysicalRootTransactionLock(physicalRoot, () => writeWorkspaceFilesTransaction(
    root,
    physicalRoot,
    writes,
    commitState,
    prepareCommit
  ))
}

async function writeWorkspaceFilesTransaction(
  root: string,
  physicalRoot: string,
  writes: WorkspaceFileTransactionWrite[],
  commitState: () => Promise<void> | void,
  prepareCommit: () => Promise<void> | void
): Promise<void> {
  const transactionId = randomUUID().replace(/-/g, "")
  const stagingDirectory = await verifiedPhysicalDirectory(
    root,
    physicalRoot,
    path.join(root, ".bob", ".workflow-file-transactions")
  )
  const targets = new Set<string>()
  const staged: StagedWorkspaceWrite[] = []

  try {
    for (const [index, write] of writes.entries()) {
      const lexicalTarget = containedTarget(root, write.relativePath)
      const parent = await verifiedPhysicalDirectory(root, physicalRoot, path.dirname(lexicalTarget))
      const target = path.join(parent.path, path.basename(lexicalTarget))
      assertPhysicalContainment(physicalRoot, target, write.relativePath)
      await rejectSymbolicFileTarget(target, write.relativePath)
      const targetKey = normalizedPhysicalPath(target)
      if (targets.has(targetKey)) throw new Error(`Workspace file transaction has duplicate physical target: ${write.relativePath}`)
      targets.add(targetKey)
      const marker = `.workflow-txn-${transactionId}-${index}`
      const temporary = path.join(stagingDirectory.path, `${marker}.tmp`)
      const ownershipAnchor = path.join(stagingDirectory.path, `${marker}.anchor`)
      const backup = path.join(stagingDirectory.path, `${marker}.bak`)
      const stagedWrite: StagedWorkspaceWrite = {
        relativePath: write.relativePath,
        parent,
        target,
        temporary,
        ownershipAnchor,
        backup,
        backupCreated: false,
        committed: false
      }
      staged.push(stagedWrite)
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, stagedWrite)
      if (typeof write.text === "string") {
        await fs.writeFile(temporary, write.text, { encoding: write.encoding ?? "utf8", flag: "wx" })
      } else {
        await fs.writeFile(temporary, write.text, { flag: "wx" })
      }
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, stagedWrite)
      await requireRegularFile(temporary, `transaction staging file for ${write.relativePath}`)
      const stagedIdentity = await fs.lstat(temporary, { bigint: true })
      stagedWrite.stagedDevice = stagedIdentity.dev
      stagedWrite.stagedInode = stagedIdentity.ino
      stagedWrite.stagedDigest = await regularFileDigest(temporary)
      await fs.link(temporary, ownershipAnchor)
      const anchorIdentity = await optionalRegularFileIdentity(ownershipAnchor, write.relativePath)
      if (!anchorIdentity || anchorIdentity.dev !== stagedIdentity.dev || anchorIdentity.ino !== stagedIdentity.ino) {
        throw new Error(`Workspace file transaction ownership anchor changed: ${write.relativePath}`)
      }
    }

    for (const write of staged) await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
    await Promise.resolve(prepareCommit())

    for (const write of staged) {
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
      await rejectSymbolicFileTarget(write.target, write.relativePath)
      const originalIdentity = await optionalRegularFileIdentity(write.target, write.relativePath)
      try {
        await fs.rename(write.target, write.backup)
        write.backupCreated = true
      } catch (error) {
        const backupIdentity = await optionalRegularFileIdentity(write.backup, write.relativePath)
        const targetIdentity = await optionalRegularFileIdentity(write.target, write.relativePath)
        if (originalIdentity && backupIdentity
          && originalIdentity.dev === backupIdentity.dev && originalIdentity.ino === backupIdentity.ino
          && !targetIdentity) {
          write.backupCreated = true
          throw error
        }
        if (!isMissingPathError(error) || originalIdentity || backupIdentity) throw error
      }
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
      if (write.backupCreated) {
        await requireRegularFile(write.backup, `transaction backup for ${write.relativePath}`)
      }
      await assertMissingPath(write.target, write.relativePath)
      await requireRegularFile(write.temporary, `transaction staging file for ${write.relativePath}`)
      try {
        await fs.rename(write.temporary, write.target)
        write.committed = true
      } catch (error) {
        const targetIdentity = await optionalRegularFileIdentity(write.target, write.relativePath)
        const temporaryIdentity = await optionalRegularFileIdentity(write.temporary, write.relativePath)
        if (targetIdentity && targetIdentity.dev === write.stagedDevice && targetIdentity.ino === write.stagedInode && !temporaryIdentity) {
          write.committed = true
        }
        throw error
      }
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
      await rejectSymbolicFileTarget(write.target, write.relativePath)
    }
    for (const write of staged) {
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
      await requireOwnedPublishedTarget(write)
    }
    await Promise.resolve(commitState())
    for (const write of staged) {
      await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
      await requireOwnedPublishedTarget(write)
    }
  } catch (error) {
    const rollbackErrors = await rollbackWorkspaceWrites(physicalRoot, stagingDirectory, staged)
    if (rollbackErrors.length > 0) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message}; rollback failed: ${rollbackErrors.join("; ")}`, { cause: error })
    }
    throw error
  }

  await cleanupWorkspaceWrites(physicalRoot, stagingDirectory, staged)
}

async function rollbackWorkspaceWrites(
  physicalRoot: string,
  stagingDirectory: VerifiedPhysicalDirectory,
  staged: StagedWorkspaceWrite[]
): Promise<string[]> {
  const errors: string[] = []
  for (const write of [...staged].reverse()) {
    if (write.committed || write.backupCreated) {
      try {
        await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
        if (write.committed) {
          await removeOwnedPublishedTargetForRollback(write)
          write.committed = false
          await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
        }
        if (write.backupCreated) {
          if (!write.committed) {
            const targetIdentity = await optionalRegularFileIdentity(write.target, write.relativePath)
            if (targetIdentity) {
              await removeOwnedPublishedTargetForRollback(write)
              await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
            }
          }
          const backupIdentity = await optionalRegularFileIdentity(write.backup, write.relativePath)
          if (!backupIdentity) throw new Error(`Workspace file transaction backup is missing: ${write.relativePath}`)
          const backupDigest = await regularFileDigest(write.backup)
          await assertMissingPath(write.target, write.relativePath)
          let restoreError: unknown
          try {
            await fs.rename(write.backup, write.target)
          } catch (error) {
            restoreError = error
          }
          const restored = await optionalRegularFileIdentity(write.target, write.relativePath)
          const backupRemaining = await optionalRegularFileIdentity(write.backup, write.relativePath)
          const restoredDigest = restored && restored.dev === backupIdentity.dev && restored.ino === backupIdentity.ino
            ? await regularFileDigest(write.target)
            : undefined
          if (!restored || restored.dev !== backupIdentity.dev || restored.ino !== backupIdentity.ino
            || restoredDigest !== backupDigest || backupRemaining) {
            if (restoreError) throw restoreError
            throw new Error(`Workspace file transaction restored target changed during rollback: ${write.relativePath}`)
          }
          write.backupCreated = false
          await assertStableWriteDirectories(physicalRoot, stagingDirectory, write)
          await rejectSymbolicFileTarget(write.target, write.relativePath)
        }
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
    const stagingPaths = write.backupCreated
      ? [write.temporary, write.ownershipAnchor]
      : [write.temporary, write.ownershipAnchor, write.backup]
    for (const stagingPath of stagingPaths) {
      try {
        await removeStagingPath(physicalRoot, stagingDirectory, stagingPath)
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error))
      }
    }
  }
  return errors
}

async function cleanupWorkspaceWrites(
  physicalRoot: string,
  stagingDirectory: VerifiedPhysicalDirectory,
  staged: StagedWorkspaceWrite[]
): Promise<void> {
  const errors = (await Promise.all(staged.flatMap((write) => [write.temporary, write.ownershipAnchor, write.backup].map(async (stagingPath) => {
    try {
      await removeStagingPath(physicalRoot, stagingDirectory, stagingPath)
      return undefined
    } catch (error) {
      return `${path.basename(stagingPath)}: ${error instanceof Error ? error.message : String(error)}`
    }
  })))).filter((error): error is string => error !== undefined)
  if (errors.length > 0) throw new Error(`Workspace file transaction cleanup failed: ${errors.join("; ")}`)
}

async function removeStagingPath(
  physicalRoot: string,
  stagingDirectory: VerifiedPhysicalDirectory,
  stagingPath: string
): Promise<void> {
  await assertVerifiedDirectory(physicalRoot, stagingDirectory, "transaction staging directory")
  assertPhysicalContainment(stagingDirectory.path, stagingPath, stagingPath)
  try {
    await fs.rm(stagingPath, { force: true })
  } catch (error) {
    try {
      await fs.lstat(stagingPath)
    } catch (inspectionError) {
      if (isMissingPathError(inspectionError)) return
    }
    throw error
  }
}

async function assertStableWriteDirectories(
  physicalRoot: string,
  stagingDirectory: VerifiedPhysicalDirectory,
  write: StagedWorkspaceWrite
): Promise<void> {
  // Node has no openat-style path operations. Rechecking both directory identities
  // around every write/rename narrows, but cannot eliminate, a hostile same-user swap window.
  await assertVerifiedDirectory(physicalRoot, stagingDirectory, "transaction staging directory")
  await assertVerifiedDirectory(physicalRoot, write.parent, `parent for ${write.relativePath}`)
}

async function withPhysicalRootTransactionLock<T>(
  physicalRoot: string,
  operation: () => Promise<T>
): Promise<T> {
  const key = normalizedPhysicalPath(physicalRoot)
  const predecessor = workspaceTransactionTails.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  const tail = predecessor.then(() => current, () => current)
  workspaceTransactionTails.set(key, tail)
  await predecessor.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (workspaceTransactionTails.get(key) === tail) workspaceTransactionTails.delete(key)
  }
}

function containedTarget(root: string, relativePath: string): string {
  if (!relativePath.trim()) throw new Error("Workspace file transaction path is required.")
  const target = path.resolve(root, relativePath)
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Workspace file transaction path escapes workspace root: ${relativePath}`)
  }
  return target
}

async function verifiedPhysicalDirectory(
  root: string,
  physicalRoot: string,
  directory: string
): Promise<VerifiedPhysicalDirectory> {
  const relative = path.relative(root, directory)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Workspace file transaction directory escapes workspace root: ${directory}`)
  }
  let physical = physicalRoot
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    const current = await fs.realpath(physical)
    assertPhysicalContainment(physicalRoot, current, directory)
    if (normalizedPhysicalPath(current) !== normalizedPhysicalPath(physical)) {
      throw new Error(`Workspace file transaction directory changed during verification: ${directory}`)
    }
    const next = path.join(physical, segment)
    try {
      await fs.lstat(next)
    } catch (error) {
      if (!isMissingPathError(error)) throw error
      try {
        await fs.mkdir(next)
      } catch (mkdirError) {
        if (!isAlreadyExistsError(mkdirError)) throw mkdirError
      }
    }
    physical = await fs.realpath(next)
    assertPhysicalContainment(physicalRoot, physical, directory)
    const stat = await fs.stat(physical, { bigint: true })
    if (!stat.isDirectory()) throw new Error(`Workspace file transaction parent is not a directory: ${directory}`)
  }
  const stat = await fs.stat(physical, { bigint: true })
  if (!stat.isDirectory()) throw new Error(`Workspace file transaction parent is not a directory: ${directory}`)
  return { path: physical, dev: stat.dev, ino: stat.ino }
}

async function assertVerifiedDirectory(
  physicalRoot: string,
  directory: VerifiedPhysicalDirectory,
  label: string
): Promise<void> {
  let resolved: string
  try {
    resolved = await fs.realpath(directory.path)
  } catch (error) {
    throw new Error(`Workspace file transaction directory changed: ${label}`, { cause: error })
  }
  assertPhysicalContainment(physicalRoot, resolved, label)
  if (normalizedPhysicalPath(resolved) !== normalizedPhysicalPath(directory.path)) {
    throw new Error(`Workspace file transaction directory changed: ${label}`)
  }
  const stat = await fs.stat(resolved, { bigint: true })
  if (!stat.isDirectory() || stat.dev !== directory.dev || stat.ino !== directory.ino) {
    throw new Error(`Workspace file transaction directory changed: ${label}`)
  }
}

async function rejectSymbolicFileTarget(target: string, relativePath: string): Promise<void> {
  try {
    const stat = await fs.lstat(target)
    if (stat.isSymbolicLink()) {
      throw new Error(`Workspace file transaction target is a symbolic link: ${relativePath}`)
    }
    if (!stat.isFile()) throw new Error(`Workspace file transaction target is not a file: ${relativePath}`)
  } catch (error) {
    if (isMissingPathError(error)) return
    throw error
  }
}

async function requireRegularFile(target: string, label: string): Promise<void> {
  const stat = await fs.lstat(target)
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Workspace file transaction file changed: ${label}`)
  }
}

async function optionalRegularFileIdentity(target: string, relativePath: string): Promise<{ dev: bigint; ino: bigint } | undefined> {
  try {
    const stat = await fs.lstat(target, { bigint: true })
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Workspace file transaction target changed during rollback: ${relativePath}`)
    return { dev: stat.dev, ino: stat.ino }
  } catch (error) {
    if (isMissingPathError(error)) return undefined
    throw error
  }
}

async function requireOwnedPublishedTarget(write: StagedWorkspaceWrite): Promise<void> {
  await rejectSymbolicFileTarget(write.target, write.relativePath)
  const [targetIdentity, anchorIdentity] = await Promise.all([
    optionalRegularFileIdentity(write.target, write.relativePath),
    optionalRegularFileIdentity(write.ownershipAnchor, write.relativePath)
  ])
  if (!targetIdentity || !anchorIdentity
    || targetIdentity.dev !== write.stagedDevice || targetIdentity.ino !== write.stagedInode
    || anchorIdentity.dev !== write.stagedDevice || anchorIdentity.ino !== write.stagedInode
    || await regularFileDigest(write.target) !== write.stagedDigest) {
    throw new Error(`Workspace file transaction target changed during rollback: ${write.relativePath}`)
  }
}

async function removeOwnedPublishedTargetForRollback(write: StagedWorkspaceWrite): Promise<void> {
  await requireOwnedPublishedTarget(write)
  try {
    await fs.rm(write.target, { force: true })
  } catch (error) {
    if (await optionalRegularFileIdentity(write.target, write.relativePath)) throw error
  }
}

async function regularFileDigest(target: string): Promise<string> {
  return createHash("sha256").update(await fs.readFile(target)).digest("hex")
}

async function assertMissingPath(target: string, label: string): Promise<void> {
  try {
    await fs.lstat(target)
  } catch (error) {
    if (isMissingPathError(error)) return
    throw error
  }
  throw new Error(`Workspace file transaction target changed while committing: ${label}`)
}

function assertPhysicalContainment(physicalRoot: string, target: string, label: string): void {
  const relative = path.relative(physicalRoot, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Workspace file transaction path escapes the physical workspace root: ${label}`)
  }
}

function normalizedPhysicalPath(value: string): string {
  const resolved = path.resolve(value)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function isMissingPathError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
}

function isAlreadyExistsError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "EEXIST"
}
