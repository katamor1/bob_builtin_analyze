import { randomUUID } from "crypto"
import { constants } from "fs"
import * as fs from "fs/promises"
import * as path from "path"
import { assertSafeWorkflowRunId } from "./runStatePath"
import type { ContainedRunFileSnapshot } from "./runStatePath"
import { resolveWorkflowRunWorkspaceRoot } from "./workflowRunWorkspaceRootBinding"

export const RUN_STATE_V0_BACKUP_FILE_NAME = "run-state-v0.backup.json" as const

const RUNS_ROOT_SEGMENTS = [".bob", "workflows", "runs"] as const
const migrationBackupQueues = new Map<string, Promise<void>>()

type FileIdentity = {
  dev: bigint
  ino: bigint
}

type CapturedFailure =
  | { failed: false }
  | { failed: true; error: unknown }

type CapturedResult<T> =
  | { failed: false; value: T }
  | { failed: true; error: unknown }

interface SettledHandleOperation<T> {
  operation: CapturedResult<T>
  closeFailure: CapturedFailure
}

interface CleanupPathSettlement {
  closeFailure: CapturedFailure
}

interface LinkedPublicationRead {
  filePath: string
  root: string
  expected: FileIdentity & { nlink: bigint }
  label: string
}

type DirectDirectory = FileIdentity & {
  path: string
}

export async function readContainedRunStateMigrationBackup(
  workspaceRoot: string,
  runId: string
): Promise<ContainedRunFileSnapshot> {
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  const runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId])
  const filePath = path.join(runDirectory.path, RUN_STATE_V0_BACKUP_FILE_NAME)
  const bytes = await readDirectRegularFile(
    root,
    filePath,
    `Workflow run '${runId}' migration backup`
  )
  return { bytes, filePath }
}

export async function ensureContainedRunStateMigrationBackup(
  workspaceRoot: string,
  runId: string,
  content: string
): Promise<void> {
  assertSafeWorkflowRunId(runId)
  const physicalRoot = await canonicalWorkspaceRoot(workspaceRoot)
  const rootIdentity = await directDirectoryChain(physicalRoot, [])
  return withSerializedMigrationBackup(workspaceRoot, physicalRoot, rootIdentity, runId, () => (
    ensureContainedRunStateMigrationBackupUnlocked(physicalRoot, runId, content)
  ))
}

async function ensureContainedRunStateMigrationBackupUnlocked(
  workspaceRoot: string,
  runId: string,
  content: string
): Promise<void> {
  await assertNoInterruptedRunStateMigrationPublication(workspaceRoot, runId, content)
  const existing = await optionalReadContainedRunStateMigrationBackup(workspaceRoot, runId)
  if (existing) {
    assertMatchingBackup(runId, existing.bytes, content)
    return
  }

  const root = await canonicalWorkspaceRoot(workspaceRoot)
  const runsRoot = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS])
  const runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId])
  const backupPath = path.join(runDirectory.path, RUN_STATE_V0_BACKUP_FILE_NAME)
  const tempPath = path.join(runsRoot.path, `.${runId}.${process.pid}.${randomUUID()}.tmp`)
  let tempHandle: Awaited<ReturnType<typeof fs.open>> | undefined
  let tempIdentity: FileIdentity | undefined
  let publicationLinkCreated = false
  let publicationSucceeded = false
  let operationFailure: CapturedFailure = { failed: false }
  let verificationCloseFailure: CapturedFailure = { failed: false }
  const captureVerificationCloseFailure = (error: unknown): void => {
    verificationCloseFailure = { failed: true, error }
  }

  try {
    await assertDirectoryIdentity(runsRoot, "Workflow runs directory")
    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    tempHandle = await fs.open(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
    assertSingleLinkedRegularFile(await tempHandle.stat({ bigint: true }), `Workflow run '${runId}' migration backup temporary file`)
    await tempHandle.writeFile(content, { encoding: "utf8" })
    await tempHandle.sync()
    const written = await tempHandle.stat({ bigint: true })
    assertSingleLinkedRegularFile(written, `Workflow run '${runId}' migration backup temporary file`)
    tempIdentity = { dev: written.dev, ino: written.ino }
    const verifiedTempIdentity = await directRegularFile(
      tempPath,
      root,
      `Workflow run '${runId}' migration backup temporary file`
    )
    if (!sameIdentity(tempIdentity, verifiedTempIdentity)) {
      throw new Error(`Workflow run '${runId}' migration backup temporary file changed after it was written.`)
    }
    tempIdentity = verifiedTempIdentity

    const raced = await optionalDirectRegularFile(
      backupPath,
      root,
      `Workflow run '${runId}' migration backup`
    )
    if (raced) {
      const snapshot = await readContainedRunStateMigrationBackup(workspaceRoot, runId)
      assertMatchingBackup(runId, snapshot.bytes, content)
      return
    }

    await assertDirectoryIdentity(runsRoot, "Workflow runs directory")
    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    try {
      await fs.link(tempPath, backupPath)
      publicationLinkCreated = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      const snapshot = await readContainedRunStateMigrationBackup(workspaceRoot, runId)
      assertMatchingBackup(runId, snapshot.bytes, content)
      return
    }

    const [linkedTemp, linkedTarget] = await Promise.all([
      linkedPublicationFile(tempPath, root, `Workflow run '${runId}' migration backup temporary file`),
      linkedPublicationFile(backupPath, root, `Workflow run '${runId}' migration backup`)
    ])
    if (linkedTemp.nlink !== 2n || linkedTarget.nlink !== 2n) {
      throw new Error(`Workflow run '${runId}' migration backup must have exactly two links during create-once publication.`)
    }
    if (!sameIdentity(tempIdentity, linkedTemp) || !sameIdentity(linkedTemp, linkedTarget)) {
      throw new Error(`Workflow run '${runId}' migration backup changed during create-once publication.`)
    }
    const expectedBytes = Buffer.from(content, "utf8")
    await readAndValidateLinkedPublicationFiles(
      [
        {
          filePath: tempPath,
          root,
          expected: linkedTemp,
          label: `Workflow run '${runId}' migration backup temporary file`
        },
        {
          filePath: backupPath,
          root,
          expected: linkedTarget,
          label: `Workflow run '${runId}' migration backup`
        }
      ],
      ([linkedTempBytes, linkedTargetBytes]) => {
        if (!linkedTempBytes.equals(expectedBytes) || !linkedTargetBytes.equals(expectedBytes)) {
          throw new Error(`Workflow run '${runId}' migration backup publication bytes changed before create-once publication was finalized.`)
        }
      },
      captureVerificationCloseFailure
    )
    await fs.rm(tempPath)
    await readAndValidateLinkedPublicationFiles(
      [
        {
          filePath: backupPath,
          root,
          expected: { dev: linkedTemp.dev, ino: linkedTemp.ino, nlink: 1n },
          label: `Workflow run '${runId}' migration backup`
        }
      ],
      ([finalizedBytes]) => {
        if (!finalizedBytes.equals(expectedBytes)) {
          throw new Error(`Workflow run '${runId}' migration backup publication bytes changed while finalizing create-once publication.`)
        }
      },
      captureVerificationCloseFailure
    )
    await assertDirectoryIdentity(runsRoot, "Workflow runs directory")
    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    publicationSucceeded = true
  } catch (error) {
    if (!verificationCloseFailure.failed) operationFailure = { failed: true, error }
    throw error
  } finally {
    let cleanupFailure: CapturedFailure = { failed: false }
    let cleanupPathCloseFailure: CapturedFailure = { failed: false }
    let closeFailure: CapturedFailure = { failed: false }
    try {
      if (tempHandle && await directoryStillMatches(runsRoot)) {
        if (publicationLinkCreated && !publicationSucceeded && await directoryStillMatches(runDirectory)) {
          const backupCleanup = await removeDirectFileOwnedByHandle(backupPath, root, tempHandle)
          if (!cleanupPathCloseFailure.failed && backupCleanup.closeFailure.failed) {
            cleanupPathCloseFailure = backupCleanup.closeFailure
          }
        }
        const tempCleanup = await removeDirectFileOwnedByHandle(tempPath, root, tempHandle)
        if (!cleanupPathCloseFailure.failed && tempCleanup.closeFailure.failed) {
          cleanupPathCloseFailure = tempCleanup.closeFailure
        }
      }
    } catch (error) {
      cleanupFailure = { failed: true, error }
    }
    try {
      if (tempHandle) await tempHandle.close()
    } catch (error) {
      closeFailure = { failed: true, error }
    }
    if (!operationFailure.failed) {
      if (cleanupFailure.failed) throw cleanupFailure.error
      throwIfCapturedFailure(verificationCloseFailure)
      throwIfCapturedFailure(cleanupPathCloseFailure)
      if (closeFailure.failed) throw closeFailure.error
    }
  }
}

async function assertNoInterruptedRunStateMigrationPublication(
  workspaceRoot: string,
  runId: string,
  content: string
): Promise<boolean> {
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  const runsRoot = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS])
  const runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId])
  const backupPath = path.join(runDirectory.path, RUN_STATE_V0_BACKUP_FILE_NAME)
  let initialBackup: Awaited<ReturnType<typeof fs.lstat>>
  try {
    initialBackup = await fs.lstat(backupPath, { bigint: true })
  } catch (error) {
    if (isMissingPathError(error)) return false
    throw error
  }
  if (initialBackup.isSymbolicLink() || !initialBackup.isFile() || initialBackup.nlink === 1n) return false
  if (initialBackup.nlink !== 2n) {
    throw new Error(`Workflow run '${runId}' migration backup has extra links and cannot be recovered safely.`)
  }

  await assertDirectoryIdentity(runsRoot, "Workflow runs directory")
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  const candidateNames = (await fs.readdir(runsRoot.path, { withFileTypes: true }))
    .map((entry) => parseOwnedMigrationTempName(runId, entry.name))
    .filter((candidate): candidate is OwnedMigrationTemp => candidate !== undefined)
  if (candidateNames.length !== 1) {
    throw new Error(
      `Workflow run '${runId}' hard-linked migration backup requires exactly one owned temporary file for safe recovery.`
    )
  }
  const [candidateName] = candidateNames
  const tempPath = path.join(runsRoot.path, candidateName.name)
  const [candidate, backup] = await Promise.all([
    linkedPublicationFile(tempPath, root, `Workflow run '${runId}' recovery temporary file`),
    linkedPublicationFile(backupPath, root, `Workflow run '${runId}' migration backup`)
  ])
  if (candidate.nlink !== 2n || backup.nlink !== 2n || !sameIdentity(candidate, backup)) {
    throw new Error(`Workflow run '${runId}' interrupted migration publication is ambiguous and was preserved.`)
  }

  const expectedBytes = Buffer.from(content, "utf8")
  return await readAndValidateLinkedPublicationFiles(
    [
      {
        filePath: tempPath,
        root,
        expected: candidate,
        label: `Workflow run '${runId}' recovery temporary file`
      },
      {
        filePath: backupPath,
        root,
        expected: backup,
        label: `Workflow run '${runId}' migration backup`
      }
    ],
    ([candidateBytes, backupBytes]) => {
      if (!candidateBytes.equals(expectedBytes) || !backupBytes.equals(expectedBytes)) {
        throw new Error(`Workflow run '${runId}' interrupted migration publication does not match the expected historical bytes.`)
      }
      throw new Error(
        `Workflow run '${runId}' interrupted migration publication owner pid ${candidateName.pid} cannot be proven stopped across process visibility domains; automatic recovery is disabled and both links were preserved.`
      )
    }
  )
}

async function optionalReadContainedRunStateMigrationBackup(
  workspaceRoot: string,
  runId: string
): Promise<ContainedRunFileSnapshot | undefined> {
  try {
    return await readContainedRunStateMigrationBackup(workspaceRoot, runId)
  } catch (error) {
    if (isMissingPathError(error)) return undefined
    throw error
  }
}

function assertMatchingBackup(runId: string, bytes: Buffer, content: string): void {
  if (bytes.toString("utf8") !== content) {
    throw new Error(`Workflow run '${runId}' migration backup conflicts with the current unversioned run.`)
  }
}

async function readDirectRegularFile(root: string, filePath: string, label: string): Promise<Buffer> {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  const before = await directRegularFile(filePath, root, label)
  const handle = await fs.open(filePath, constants.O_RDONLY | noFollow)
  return withHandleClosePrecedence(handle, async () => {
    const handleStat = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(handleStat, label)
    const after = await directRegularFile(filePath, root, label)
    if (!sameIdentity(before, handleStat) || !sameIdentity(handleStat, after)) {
      throw new Error(`${label} changed while it was being read.`)
    }
    const bytes = await handle.readFile()
    const readStat = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(readStat, label)
    const readTarget = await directRegularFile(filePath, root, label)
    if (!sameIdentity(handleStat, readStat) || !sameIdentity(readStat, readTarget)) {
      throw new Error(`${label} changed while it was being read.`)
    }
    return bytes
  })
}

async function directDirectoryChain(root: string, segments: readonly string[]): Promise<DirectDirectory> {
  let current = root
  let identity = await directDirectory(current, root, "Workflow workspace root")
  for (const segment of segments) {
    current = path.join(current, segment)
    identity = await directDirectory(current, root, `Workflow run directory '${segment}'`)
  }
  return identity
}

async function directDirectory(filePath: string, root: string, label: string): Promise<DirectDirectory> {
  const before = await fs.lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new Error(`${label} must be a direct directory and not a symlink or junction.`)
  }
  const physicalPath = await fs.realpath(filePath)
  assertPhysicalContainment(root, physicalPath, label)
  if (!sameCanonicalPath(filePath, physicalPath)) {
    throw new Error(`${label} must not use an alias or junction.`)
  }
  const after = await fs.lstat(filePath, { bigint: true })
  if (!after.isDirectory() || !sameIdentity(before, after)) {
    throw new Error(`${label} changed while its path was being verified.`)
  }
  return { path: filePath, dev: after.dev, ino: after.ino }
}

async function directRegularFile(filePath: string, root: string, label: string): Promise<FileIdentity> {
  const before = await fs.lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a direct regular file and not a symlink.`)
  }
  assertSingleLinkedRegularFile(before, label)
  const physicalPath = await fs.realpath(filePath)
  assertPhysicalContainment(root, physicalPath, label)
  if (!sameCanonicalPath(filePath, physicalPath)) {
    throw new Error(`${label} must not use a file alias.`)
  }
  const after = await fs.lstat(filePath, { bigint: true })
  if (!after.isFile() || !sameIdentity(before, after)) {
    throw new Error(`${label} changed while its path was being verified.`)
  }
  assertSingleLinkedRegularFile(after, label)
  return { dev: after.dev, ino: after.ino }
}

async function linkedPublicationFile(
  filePath: string,
  root: string,
  label: string
): Promise<FileIdentity & { nlink: bigint }> {
  const before = await fs.lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile()) {
    throw new Error(`${label} must be a direct regular file during create-once publication.`)
  }
  const physicalPath = await fs.realpath(filePath)
  assertPhysicalContainment(root, physicalPath, label)
  if (!sameCanonicalPath(filePath, physicalPath)) throw new Error(`${label} must not use a file alias.`)
  const after = await fs.lstat(filePath, { bigint: true })
  if (after.isSymbolicLink() || !after.isFile() || !sameIdentity(before, after) || before.nlink !== after.nlink) {
    throw new Error(`${label} changed while create-once publication was being verified.`)
  }
  return { dev: after.dev, ino: after.ino, nlink: after.nlink }
}

async function readAndValidateLinkedPublicationFiles<T>(
  reads: readonly LinkedPublicationRead[],
  validate: (bytes: readonly Buffer[]) => T,
  captureCloseFailure?: (error: unknown) => void
): Promise<T> {
  const outcomes = await Promise.all(reads.map((read) => settleLinkedPublicationFileRead(read)))
  const bytes: Buffer[] = []
  for (const outcome of outcomes) {
    if (outcome.operation.failed) throw outcome.operation.error
    bytes.push(outcome.operation.value)
  }
  const result = validate(bytes)
  for (const outcome of outcomes) {
    if (outcome.closeFailure.failed) {
      captureCloseFailure?.(outcome.closeFailure.error)
      throw outcome.closeFailure.error
    }
  }
  return result
}

async function settleLinkedPublicationFileRead(
  read: LinkedPublicationRead
): Promise<SettledHandleOperation<Buffer>> {
  const { filePath, root, expected, label } = read
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  try {
    const before = await linkedPublicationFile(filePath, root, label)
    if (!sameIdentity(before, expected) || before.nlink !== expected.nlink) {
      throw new Error(`${label} changed before publication content verification.`)
    }
    const handle = await fs.open(filePath, constants.O_RDONLY | noFollow)
    return await settleHandleOperation(handle, async () => {
      const opened = await handle.stat({ bigint: true })
      if (!opened.isFile() || !sameIdentity(opened, expected) || opened.nlink !== expected.nlink) {
        throw new Error(`${label} changed while publication content verification opened it.`)
      }
      const bytes = await handle.readFile()
      const readStat = await handle.stat({ bigint: true })
      const after = await linkedPublicationFile(filePath, root, label)
      if (
        !readStat.isFile()
        || !sameIdentity(readStat, expected)
        || readStat.nlink !== expected.nlink
        || !sameIdentity(after, expected)
        || after.nlink !== expected.nlink
      ) {
        throw new Error(`${label} changed while publication content verification read it.`)
      }
      return bytes
    })
  } catch (error) {
    return {
      operation: { failed: true, error },
      closeFailure: { failed: false }
    }
  }
}

async function withHandleClosePrecedence<T>(
  handle: Awaited<ReturnType<typeof fs.open>>,
  operation: () => Promise<T>
): Promise<T> {
  const outcome = await settleHandleOperation(handle, operation)
  if (outcome.operation.failed) throw outcome.operation.error
  if (outcome.closeFailure.failed) throw outcome.closeFailure.error
  return outcome.operation.value
}

function throwIfCapturedFailure(failure: CapturedFailure): void {
  if (failure.failed) throw failure.error
}

async function settleHandleOperation<T>(
  handle: Awaited<ReturnType<typeof fs.open>>,
  operation: () => Promise<T>
): Promise<SettledHandleOperation<T>> {
  let operationResult: CapturedResult<T>
  let closeFailure: CapturedFailure = { failed: false }
  try {
    operationResult = { failed: false, value: await operation() }
  } catch (error) {
    operationResult = { failed: true, error }
  }
  try {
    await handle.close()
  } catch (error) {
    closeFailure = { failed: true, error }
  }
  return { operation: operationResult, closeFailure }
}

async function optionalDirectRegularFile(
  filePath: string,
  root: string,
  label: string
): Promise<FileIdentity | undefined> {
  try {
    return await directRegularFile(filePath, root, label)
  } catch (error) {
    if (isMissingPathError(error)) return undefined
    throw error
  }
}

async function assertDirectoryIdentity(directory: DirectDirectory, label: string): Promise<void> {
  const current = await fs.lstat(directory.path, { bigint: true })
  if (current.isSymbolicLink() || !current.isDirectory() || !sameIdentity(directory, current)) {
    throw new Error(`${label} changed identity during workflow run migration I/O.`)
  }
  const physicalPath = await fs.realpath(directory.path)
  if (!sameCanonicalPath(directory.path, physicalPath)) {
    throw new Error(`${label} changed to an alias or junction during workflow run migration I/O.`)
  }
}

async function directoryStillMatches(directory: DirectDirectory): Promise<boolean> {
  try {
    await assertDirectoryIdentity(directory, "Workflow runs directory")
    return true
  } catch {
    return false
  }
}

async function removeDirectFileOwnedByHandle(
  filePath: string,
  root: string,
  ownerHandle: Awaited<ReturnType<typeof fs.open>>
): Promise<CleanupPathSettlement> {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  let pathHandle: Awaited<ReturnType<typeof fs.open>> | undefined
  const removeOwnedPath = async (): Promise<void> => {
    try {
      const ownerBefore = await ownerHandle.stat({ bigint: true })
      if (!ownerBefore.isFile()) return
      const before = await fs.lstat(filePath, { bigint: true })
      if (
        before.isSymbolicLink()
        || !before.isFile()
        || !sameIdentity(before, ownerBefore)
        || before.nlink !== ownerBefore.nlink
      ) return
      const physicalBefore = await fs.realpath(filePath)
      assertPhysicalContainment(root, physicalBefore, filePath)
      if (!sameCanonicalPath(filePath, physicalBefore)) return

      pathHandle = await fs.open(filePath, constants.O_RDONLY | noFollow)
      const opened = await pathHandle.stat({ bigint: true })
      const ownerOpened = await ownerHandle.stat({ bigint: true })
      if (
        !opened.isFile()
        || !ownerOpened.isFile()
        || !sameIdentity(ownerBefore, ownerOpened)
        || !sameIdentity(ownerOpened, opened)
        || ownerOpened.nlink !== opened.nlink
      ) return

      const after = await fs.lstat(filePath, { bigint: true })
      if (
        after.isSymbolicLink()
        || !after.isFile()
        || !sameIdentity(before, after)
        || !sameIdentity(after, opened)
        || after.nlink !== opened.nlink
      ) return
      const physicalAfter = await fs.realpath(filePath)
      assertPhysicalContainment(root, physicalAfter, filePath)
      if (!sameCanonicalPath(filePath, physicalAfter)) return
      const ownerAfter = await ownerHandle.stat({ bigint: true })
      if (
        !ownerAfter.isFile()
        || !sameIdentity(ownerOpened, ownerAfter)
        || !sameIdentity(ownerAfter, after)
        || ownerAfter.nlink !== after.nlink
      ) return
    } catch {
      return
    }

    try {
      await fs.rm(filePath)
    } catch (error) {
      if (isMissingPathError(error)) return
      throw error
    }
  }

  let removalFailure: CapturedFailure = { failed: false }
  try {
    await removeOwnedPath()
  } catch (error) {
    removalFailure = { failed: true, error }
  }
  let closeFailure: CapturedFailure = { failed: false }
  try {
    if (pathHandle) await pathHandle.close()
  } catch (error) {
    closeFailure = { failed: true, error }
  }
  throwIfCapturedFailure(removalFailure)
  return { closeFailure }
}

interface OwnedMigrationTemp {
  name: string
  pid: number
}

function parseOwnedMigrationTempName(runId: string, name: string): OwnedMigrationTemp | undefined {
  const prefix = `.${runId}.`
  const suffix = ".tmp"
  if (!name.startsWith(prefix) || !name.endsWith(suffix)) return undefined
  const owner = name.slice(prefix.length, -suffix.length)
  const separator = owner.indexOf(".")
  if (separator < 1 || separator === owner.length - 1) return undefined
  const pidText = owner.slice(0, separator)
  const token = owner.slice(separator + 1)
  const pid = Number(pidText)
  if (
    !/^[1-9]\d*$/.test(pidText)
    || !Number.isSafeInteger(pid)
    || pid < 1
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)
  ) return undefined
  return { name, pid }
}

async function withSerializedMigrationBackup<T>(
  requestedWorkspaceRoot: string,
  physicalRoot: string,
  expectedRoot: FileIdentity,
  runId: string,
  operation: () => Promise<T>
): Promise<T> {
  const keyRoot = process.platform === "win32"
    ? path.resolve(physicalRoot).toLowerCase()
    : path.resolve(physicalRoot)
  const key = JSON.stringify([keyRoot, runId])
  const previous = migrationBackupQueues.get(key)
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  migrationBackupQueues.set(key, current)
  if (previous) await previous
  try {
    const reboundRoot = await canonicalWorkspaceRoot(requestedWorkspaceRoot)
    if (!sameCanonicalPath(reboundRoot, physicalRoot)) {
      throw new Error(`Workflow run '${runId}' workspace root binding changed while migration backup waited for serialization.`)
    }
    const currentRoot = await directDirectoryChain(physicalRoot, [])
    if (!sameIdentity(currentRoot, expectedRoot)) {
      throw new Error(`Workflow run '${runId}' workspace root identity changed while migration backup waited for serialization.`)
    }
    return await operation()
  } finally {
    release()
    if (migrationBackupQueues.get(key) === current) migrationBackupQueues.delete(key)
  }
}

async function canonicalWorkspaceRoot(workspaceRoot: string): Promise<string> {
  return resolveWorkflowRunWorkspaceRoot(workspaceRoot)
}

function assertPhysicalContainment(root: string, target: string, label: string): void {
  const relative = path.relative(root, target)
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the workflow workspace.`)
  }
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function assertSingleLinkedRegularFile(
  stat: { isFile(): boolean; nlink: bigint },
  label: string
): void {
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`)
  if (stat.nlink !== 1n) throw new Error(`${label} must have a single link and must not be hard-linked.`)
}

function sameCanonicalPath(left: string, right: string): boolean {
  const resolvedLeft = path.resolve(left)
  const resolvedRight = path.resolve(right)
  return process.platform === "win32"
    ? resolvedLeft.toLocaleLowerCase() === resolvedRight.toLocaleLowerCase()
    : resolvedLeft === resolvedRight
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}
