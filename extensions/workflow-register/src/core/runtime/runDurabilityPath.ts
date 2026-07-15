import { randomUUID } from "crypto"
import { constants } from "fs"
import * as fs from "fs/promises"
import * as path from "path"
import { assertSafeWorkflowRunId } from "./runStatePath"
import {
  resolveWorkflowRunWorkspaceRoot,
  workflowRunWorkspaceRootBinding
} from "./workflowRunWorkspaceRootBinding"

export type RunDurabilityFileName = "events.ndjson" | "run-state.journal.json" | "run.lock.json"
export type RunMaterializedFileName = "run.json" | "control.json"

export interface RunDurabilityFileSnapshot {
  bytes: Buffer
  filePath: string
  mtimeMs: number
}

export interface CreateRunDurabilityFileOptions {
  createRunDirectory?: boolean
}

export class RunDurabilityDirectoryMissingError extends Error {
  readonly code = "ENOENT"

  constructor(runId: string) {
    super(`Workflow run '${runId}' directory disappeared before durability file creation.`)
    this.name = "RunDurabilityDirectoryMissingError"
  }
}

type FileIdentity = {
  dev: bigint
  ino: bigint
}

type DirectoryIdentity = FileIdentity & {
  path: string
}

type DirectDirectory = FileIdentity & {
  chain: readonly DirectoryIdentity[]
  path: string
  workspaceRoot: DirectoryIdentity
}

type StableFileState = FileIdentity & {
  ctimeNs: bigint
  mtimeNs: bigint
  nlink: bigint
  size: bigint
}

type DirectFileSnapshot = RunDurabilityFileSnapshot & {
  identity: FileIdentity
  stable: StableFileState
}

const RUNS_ROOT_SEGMENTS = [".bob", "workflows", "runs"] as const
const DURABILITY_FILE_NAMES = new Set<RunDurabilityFileName>([
  "events.ndjson",
  "run-state.journal.json",
  "run.lock.json"
])

export async function readRunDurabilityFile(
  workspaceRoot: string,
  runId: string,
  fileName: RunDurabilityFileName
): Promise<RunDurabilityFileSnapshot | undefined> {
  assertRunDurabilityFileName(fileName)
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  let runDirectory: DirectDirectory
  try {
    runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], false)
  } catch (error) {
    if (isMissingPathError(error)) return undefined
    throw error
  }
  const filePath = path.join(runDirectory.path, fileName)
  const snapshot = await readDirectRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
  if (!snapshot) return undefined
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  return { bytes: snapshot.bytes, filePath: snapshot.filePath, mtimeMs: snapshot.mtimeMs }
}

export async function touchRunDurabilityFileMtime(
  workspaceRoot: string,
  runId: string,
  fileName: Extract<RunDurabilityFileName, "run.lock.json">,
  expectedBytes: Buffer,
  now: () => Date = () => new Date()
): Promise<number> {
  assertRunDurabilityFileName(fileName)
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  let runDirectory: DirectDirectory
  try {
    runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], false)
  } catch (error) {
    if (isMissingPathError(error)) throw new Error(`${durabilityLabel(runId, fileName)} disappeared before its heartbeat touch.`)
    throw error
  }
  const label = durabilityLabel(runId, fileName)
  const filePath = path.join(runDirectory.path, fileName)
  const before = await readDirectRegularFile(filePath, runDirectory, label)
  if (!before || !before.bytes.equals(expectedBytes)) {
    throw new Error(`${label} ownership changed before its heartbeat touch.`)
  }

  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  const handle = await fs.open(filePath, constants.O_RDWR | noFollow)
  try {
    const opened = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(opened, label)
    const openedTarget = await directRegularFile(filePath, runDirectory, label)
    if (!sameIdentity(before.identity, opened) || !sameIdentity(opened, openedTarget)) {
      throw new Error(`${label} ownership changed while it was opened for heartbeat touch.`)
    }
    const openedStable = stableFileState(opened)
    const openedBytes = await readHandleBytes(handle, opened.size)
    const read = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(read, label)
    const readTarget = await directRegularFile(filePath, runDirectory, label)
    if (
      !openedBytes.equals(expectedBytes)
      || !sameIdentity(opened, read)
      || !sameIdentity(read, readTarget)
      || !sameStableFileState(openedStable, stableFileState(read))
    ) {
      throw new Error(`${label} ownership changed while it was verified for heartbeat touch.`)
    }

    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    const touchedAt = now()
    if (!(touchedAt instanceof Date) || !Number.isFinite(touchedAt.getTime())) {
      throw new Error("Workflow run lock heartbeat time must be a valid Date.")
    }
    await handle.utimes(touchedAt, touchedAt)
    await handle.sync()

    const touched = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(touched, label)
    const touchedBytes = await readHandleBytes(handle, touched.size)
    const touchedTarget = await directRegularFile(filePath, runDirectory, label)
    if (
      !sameIdentity(opened, touched)
      || !sameIdentity(touched, touchedTarget)
      || touched.size !== opened.size
      || !touchedBytes.equals(expectedBytes)
    ) {
      throw new Error(`${label} ownership changed during heartbeat touch.`)
    }
    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    return Number(touched.mtimeNs) / 1_000_000
  } finally {
    await handle.close()
  }
}

export async function replaceRunDurabilityFile(
  workspaceRoot: string,
  runId: string,
  fileName: RunDurabilityFileName,
  content: string,
  expectedBytes?: Buffer
): Promise<void> {
  assertRunDurabilityFileName(fileName)
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  let runDirectory: DirectDirectory
  try {
    runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], !expectedBytes)
  } catch (error) {
    if (expectedBytes && isMissingPathError(error)) {
      throw new Error(`${durabilityLabel(runId, fileName)} changed before replacement.`)
    }
    throw error
  }
  const filePath = path.join(runDirectory.path, fileName)
  let original: FileIdentity | undefined
  if (expectedBytes) {
    const expectedSnapshot = await readDirectRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
    if (!expectedSnapshot || !expectedSnapshot.bytes.equals(expectedBytes)) {
      throw new Error(`${durabilityLabel(runId, fileName)} changed before replacement.`)
    }
    original = expectedSnapshot.identity
  } else {
    original = await optionalDirectRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
  }
  const tempPath = path.join(runDirectory.path, `.${fileName}.${process.pid}.${randomUUID()}.tmp`)
  let tempIdentity: FileIdentity | undefined
  try {
    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    const handle = await fs.open(tempPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600)
    try {
      assertSingleLinkedRegularFile(await handle.stat({ bigint: true }), `${durabilityLabel(runId, fileName)} temporary file`)
      await handle.writeFile(content, { encoding: "utf8" })
      await handle.sync()
      const stat = await handle.stat({ bigint: true })
      assertSingleLinkedRegularFile(stat, `${durabilityLabel(runId, fileName)} temporary file`)
      tempIdentity = { dev: stat.dev, ino: stat.ino }
    } finally {
      await handle.close()
    }
    await renameWithRetry(tempPath, filePath, async () => {
      await assertTargetUnchanged(runDirectory, filePath, original, expectedBytes, runId, fileName)
      const currentTemp = await directRegularFile(tempPath, runDirectory, `${durabilityLabel(runId, fileName)} temporary file`)
      if (!sameIdentity(tempIdentity!, currentTemp)) {
        throw new Error(`${durabilityLabel(runId, fileName)} temporary file changed before rename.`)
      }
    })
    const written = await directRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
    if (!sameIdentity(tempIdentity, written)) throw new Error(`${durabilityLabel(runId, fileName)} changed during atomic replacement.`)
    await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
    await syncDirectFile(filePath, runDirectory, durabilityLabel(runId, fileName))
    await syncDirectory(runDirectory, `Workflow run '${runId}' directory`)
  } finally {
    if (await directoryStillMatches(runDirectory)) await fs.rm(tempPath, { force: true }).catch(() => undefined)
  }
}

export async function createRunDurabilityFile(
  workspaceRoot: string,
  runId: string,
  fileName: RunDurabilityFileName,
  content: string,
  options: CreateRunDurabilityFileOptions = {}
): Promise<boolean> {
  assertRunDurabilityFileName(fileName)
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  const createRunDirectory = options.createRunDirectory !== false
  let runDirectory: DirectDirectory
  try {
    runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], createRunDirectory)
  } catch (error) {
    if (!createRunDirectory && isMissingPathError(error)) throw new RunDurabilityDirectoryMissingError(runId)
    throw error
  }
  const filePath = path.join(runDirectory.path, fileName)
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  let handle: Awaited<ReturnType<typeof fs.open>>
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  try {
    handle = await fs.open(filePath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow, 0o600)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      await directRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
      return false
    }
    if (!createRunDirectory && isMissingPathError(error)) throw new RunDurabilityDirectoryMissingError(runId)
    throw error
  }
  try {
    assertSingleLinkedRegularFile(await handle.stat({ bigint: true }), durabilityLabel(runId, fileName))
    await handle.writeFile(content, { encoding: "utf8" })
    await handle.sync()
    const handleStat = await handle.stat({ bigint: true })
    const target = await directRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
    assertSingleLinkedRegularFile(handleStat, durabilityLabel(runId, fileName))
    if (!sameIdentity(handleStat, target)) {
      throw new Error(`${durabilityLabel(runId, fileName)} changed during exclusive creation.`)
    }
  } finally {
    await handle.close()
  }
  await syncDirectory(runDirectory, `Workflow run '${runId}' directory`)
  return true
}

export async function runDurabilityDirectoryPresent(workspaceRoot: string, runId: string): Promise<boolean> {
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  try {
    await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], false)
    return true
  } catch (error) {
    if (isMissingPathError(error)) return false
    throw error
  }
}

export async function appendRunDurabilityFile(
  workspaceRoot: string,
  runId: string,
  fileName: Extract<RunDurabilityFileName, "events.ndjson">,
  content: string
): Promise<void> {
  if (!content.endsWith("\n")) throw new Error("Workflow run event append must end with a newline.")
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  const runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], true)
  const filePath = path.join(runDirectory.path, fileName)
  const existing = await optionalDirectRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  const handle = await fs.open(filePath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollow, 0o600)
  try {
    const handleStat = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(handleStat, durabilityLabel(runId, fileName))
    const target = await directRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
    if (!sameIdentity(handleStat, target)) {
      throw new Error(`${durabilityLabel(runId, fileName)} changed while it was opened for append.`)
    }
    if (existing && !sameIdentity(existing, target)) {
      throw new Error(`${durabilityLabel(runId, fileName)} changed before append.`)
    }
    await handle.write(content, undefined, "utf8")
    await handle.sync()
    const appendedHandleStat = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(appendedHandleStat, durabilityLabel(runId, fileName))
    const appendedTarget = await directRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
    if (!sameIdentity(handleStat, appendedHandleStat) || !sameIdentity(appendedHandleStat, appendedTarget)) {
      throw new Error(`${durabilityLabel(runId, fileName)} changed during append.`)
    }
  } finally {
    await handle.close()
  }
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  await syncDirectory(runDirectory, `Workflow run '${runId}' directory`)
}

export async function removeRunDurabilityFile(
  workspaceRoot: string,
  runId: string,
  fileName: RunDurabilityFileName,
  expectedBytes?: Buffer
): Promise<boolean> {
  assertRunDurabilityFileName(fileName)
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  let runDirectory: DirectDirectory
  try {
    runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], false)
  } catch (error) {
    if (isMissingPathError(error)) return false
    throw error
  }
  const filePath = path.join(runDirectory.path, fileName)
  const before = await readDirectRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
  if (!before) return false
  if (expectedBytes && !before.bytes.equals(expectedBytes)) return false
  const reread = await readDirectRegularFile(filePath, runDirectory, durabilityLabel(runId, fileName))
  if (!reread) return false
  if (expectedBytes && !reread.bytes.equals(expectedBytes)) return false
  if (!expectedBytes && !reread.bytes.equals(before.bytes)) return false
  if (!sameIdentity(before.identity, reread.identity)) return false
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  await fs.rm(filePath)
  await assertDirectoryIdentity(runDirectory, `Workflow run '${runId}' directory`)
  await syncDirectory(runDirectory, `Workflow run '${runId}' directory`)
  return true
}

export async function syncRunMaterializedFile(
  workspaceRoot: string,
  runId: string,
  fileName: RunMaterializedFileName = "run.json"
): Promise<void> {
  assertSafeWorkflowRunId(runId)
  const root = await canonicalWorkspaceRoot(workspaceRoot)
  const runDirectory = await directDirectoryChain(root, [...RUNS_ROOT_SEGMENTS, runId], false)
  const filePath = path.join(runDirectory.path, fileName)
  await syncDirectFile(filePath, runDirectory, `Workflow run '${runId}' ${fileName}`)
  await syncDirectory(runDirectory, `Workflow run '${runId}' directory`)
}

function assertRunDurabilityFileName(fileName: string): asserts fileName is RunDurabilityFileName {
  if (!DURABILITY_FILE_NAMES.has(fileName as RunDurabilityFileName)) {
    throw new Error(`Workflow run durability file name is not supported: ${fileName}`)
  }
}

async function canonicalWorkspaceRoot(workspaceRoot: string): Promise<DirectDirectory> {
  if (!workspaceRoot.trim()) throw new Error("Workflow workspace root is empty.")
  const lexicalPath = path.resolve(workspaceRoot)
  const boundRoot = workflowRunWorkspaceRootBinding(lexicalPath)
  const verificationPath = boundRoot ?? lexicalPath
  const before = await fs.stat(verificationPath, { bigint: true })
  if (!before.isDirectory()) throw new Error("Workflow workspace root must be a directory.")
  const physicalPath = await resolveWorkflowRunWorkspaceRoot(lexicalPath)
  const physical = await fs.lstat(physicalPath, { bigint: true })
  if (physical.isSymbolicLink() || !physical.isDirectory() || !sameIdentity(before, physical)) {
    throw new Error("Workflow workspace root physical identity does not match its requested path.")
  }
  const after = await fs.stat(verificationPath, { bigint: true })
  if (!after.isDirectory() || !sameIdentity(before, after)) {
    throw new Error("Workflow workspace root changed while its physical identity was being verified.")
  }
  const entry = { path: physicalPath, dev: physical.dev, ino: physical.ino }
  const workspaceBinding = { path: verificationPath, dev: physical.dev, ino: physical.ino }
  const root = { ...entry, chain: [entry], workspaceRoot: workspaceBinding }
  return root
}

async function directDirectoryChain(root: DirectDirectory, segments: readonly string[], create: boolean): Promise<DirectDirectory> {
  let identity = root
  for (const segment of segments) {
    const current = path.join(identity.path, segment)
    if (create) {
      await assertDirectoryEntryIdentity(identity, `Workflow run directory parent for '${segment}'`)
      try {
        await fs.mkdir(current)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      }
    }
    identity = await directDirectory(current, identity, `Workflow run directory '${segment}'`)
  }
  await assertDirectoryIdentity(identity, "Workflow run directory chain")
  return identity
}

async function directDirectory(filePath: string, parent: DirectDirectory, label: string): Promise<DirectDirectory> {
  const before = await fs.lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isDirectory()) {
    throw new Error(`${label} must be a direct directory and not a symlink or junction.`)
  }
  const physical = await fs.realpath(filePath)
  const physicalStat = await fs.lstat(physical, { bigint: true })
  if (physicalStat.isSymbolicLink() || !physicalStat.isDirectory() || !sameIdentity(before, physicalStat)) {
    throw new Error(`${label} physical identity does not match its direct directory path.`)
  }
  const physicalParent = await fs.lstat(path.dirname(physical), { bigint: true })
  if (!physicalParent.isDirectory() || !sameIdentity(parent, physicalParent)) {
    throw new Error(`${label} physical parent identity does not match the verified workflow directory chain.`)
  }
  const after = await fs.lstat(filePath, { bigint: true })
  if (!after.isDirectory() || !sameIdentity(before, after)) throw new Error(`${label} changed while its path was being verified.`)
  const entry = { path: filePath, dev: after.dev, ino: after.ino }
  return { ...entry, chain: [...parent.chain, entry], workspaceRoot: parent.workspaceRoot }
}

async function directRegularFile(filePath: string, directory: DirectDirectory, label: string): Promise<FileIdentity> {
  await assertDirectoryEntryIdentity(directory, `${label} parent directory`)
  const before = await fs.lstat(filePath, { bigint: true })
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`${label} must be a direct regular file and not a symlink.`)
  assertSingleLinkedRegularFile(before, label)
  try {
    const physical = await fs.realpath(filePath)
    const physicalStat = await fs.lstat(physical, { bigint: true })
    if (physicalStat.isSymbolicLink() || !physicalStat.isFile() || !sameIdentity(before, physicalStat)) {
      throw new Error(`${label} physical identity does not match its direct file path.`)
    }
    assertSingleLinkedRegularFile(physicalStat, label)
    const physicalParent = await fs.lstat(path.dirname(physical), { bigint: true })
    if (!physicalParent.isDirectory() || !sameIdentity(directory, physicalParent)) {
      throw new Error(`${label} physical parent identity does not match the verified run directory.`)
    }
  } catch (error) {
    if (await directRegularFilePathChanged(filePath, before)) {
      throw new Error(`${label} changed while its path was being verified.`)
    }
    throw error
  }
  const after = await fs.lstat(filePath, { bigint: true })
  if (!after.isFile() || !sameIdentity(before, after)) throw new Error(`${label} changed while its path was being verified.`)
  assertSingleLinkedRegularFile(after, label)
  await assertDirectoryEntryIdentity(directory, `${label} parent directory`)
  return { dev: after.dev, ino: after.ino }
}

async function directRegularFilePathChanged(filePath: string, expected: FileIdentity): Promise<boolean> {
  try {
    const current = await fs.lstat(filePath, { bigint: true })
    return current.isSymbolicLink() || !current.isFile() || !sameIdentity(current, expected)
  } catch (error) {
    if (isMissingPathError(error)) return true
    throw error
  }
}

async function optionalDirectRegularFile(filePath: string, directory: DirectDirectory, label: string): Promise<FileIdentity | undefined> {
  try {
    return await directRegularFile(filePath, directory, label)
  } catch (error) {
    if (isMissingPathError(error)) return undefined
    throw error
  }
}

async function readDirectRegularFile(
  filePath: string,
  directory: DirectDirectory,
  label: string
): Promise<DirectFileSnapshot | undefined> {
  const identity = await optionalDirectRegularFile(filePath, directory, label)
  if (!identity) return undefined
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  const handle = await fs.open(filePath, constants.O_RDONLY | noFollow)
  let snapshot: DirectFileSnapshot
  try {
    const opened = await handle.stat({ bigint: true })
    if (opened.nlink === 0n) throw new Error(`${label} changed while it was being read.`)
    assertSingleLinkedRegularFile(opened, label)
    const current = await directRegularFile(filePath, directory, label)
    if (!sameIdentity(identity, opened) || !sameIdentity(opened, current)) {
      throw new Error(`${label} changed while it was being read.`)
    }
    const openedStable = stableFileState(opened)
    const bytes = await handle.readFile()
    const read = await handle.stat({ bigint: true })
    if (read.nlink === 0n) throw new Error(`${label} changed while it was being read.`)
    assertSingleLinkedRegularFile(read, label)
    const readTarget = await directRegularFile(filePath, directory, label)
    const readStable = stableFileState(read)
    if (
      !sameIdentity(opened, read)
      || !sameIdentity(read, readTarget)
      || !sameStableFileState(openedStable, readStable)
      || BigInt(bytes.byteLength) !== read.size
    ) {
      throw new Error(`${label} changed while it was being read.`)
    }
    snapshot = {
      bytes,
      filePath,
      identity: { dev: read.dev, ino: read.ino },
      mtimeMs: Number(read.mtimeNs) / 1_000_000,
      stable: readStable
    }
  } finally {
    await handle.close()
  }
  return snapshot
}

async function readHandleBytes(
  handle: Awaited<ReturnType<typeof fs.open>>,
  size: bigint
): Promise<Buffer> {
  if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Workflow run durability file is too large to verify safely.")
  const bytes = Buffer.alloc(Number(size))
  let offset = 0
  while (offset < bytes.length) {
    const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset)
    if (bytesRead === 0) break
    offset += bytesRead
  }
  if (offset !== bytes.length) throw new Error("Workflow run durability file changed size while it was being verified.")
  return bytes
}

async function assertDirectoryEntryIdentity(directory: DirectDirectory, label: string): Promise<void> {
  const current = await fs.lstat(directory.path, { bigint: true })
  if (current.isSymbolicLink() || !current.isDirectory() || !sameIdentity(directory, current)) {
    throw new Error(`${label} changed identity in the verified workflow directory chain.`)
  }
}

async function assertDirectoryIdentity(directory: DirectDirectory, label: string): Promise<void> {
  const workspaceBefore = await fs.stat(directory.workspaceRoot.path, { bigint: true })
  if (!workspaceBefore.isDirectory() || !sameIdentity(directory.workspaceRoot, workspaceBefore)) {
    throw new Error(`${label} workspace root binding changed identity during workflow durability I/O.`)
  }
  for (let index = 0; index < directory.chain.length; index += 1) {
    const expected = directory.chain[index]
    const before = await fs.lstat(expected.path, { bigint: true })
    if (before.isSymbolicLink() || !before.isDirectory() || !sameIdentity(expected, before)) {
      throw new Error(`${label} changed identity in the verified workflow directory chain.`)
    }
    const physical = await fs.realpath(expected.path)
    const physicalStat = await fs.lstat(physical, { bigint: true })
    if (physicalStat.isSymbolicLink() || !physicalStat.isDirectory() || !sameIdentity(expected, physicalStat)) {
      throw new Error(`${label} physical identity changed in the verified workflow directory chain.`)
    }
    if (index > 0) {
      const parent = directory.chain[index - 1]
      const physicalParent = await fs.lstat(path.dirname(physical), { bigint: true })
      if (!physicalParent.isDirectory() || !sameIdentity(parent, physicalParent)) {
        throw new Error(`${label} physical parent changed in the verified workflow directory chain.`)
      }
    }
    const after = await fs.lstat(expected.path, { bigint: true })
    if (!after.isDirectory() || !sameIdentity(before, after) || !sameIdentity(expected, after)) {
      throw new Error(`${label} changed while the verified workflow directory chain was being checked.`)
    }
  }
  const workspaceAfter = await fs.stat(directory.workspaceRoot.path, { bigint: true })
  if (!workspaceAfter.isDirectory() || !sameIdentity(workspaceBefore, workspaceAfter) || !sameIdentity(directory.workspaceRoot, workspaceAfter)) {
    throw new Error(`${label} workspace root binding changed while it was being verified.`)
  }
}

async function assertTargetUnchanged(
  directory: DirectDirectory,
  filePath: string,
  original: FileIdentity | undefined,
  expectedBytes: Buffer | undefined,
  runId: string,
  fileName: string
): Promise<void> {
  await assertDirectoryIdentity(directory, `Workflow run '${runId}' directory`)
  const label = durabilityLabel(runId, fileName)
  if (expectedBytes) {
    const current = await readDirectRegularFile(filePath, directory, label)
    if (!original || !current || !sameIdentity(original, current.identity) || !current.bytes.equals(expectedBytes)) {
      throw new Error(`${label} target changed before rename.`)
    }
    return
  }
  const current = await optionalDirectRegularFile(filePath, directory, label)
  if (Boolean(original) !== Boolean(current)) throw new Error(`${label} target changed before rename.`)
  if (original && current && !sameIdentity(original, current)) throw new Error(`${label} target changed before rename.`)
}

async function syncDirectFile(filePath: string, directory: DirectDirectory, label: string): Promise<void> {
  const expected = await directRegularFile(filePath, directory, label)
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  const handle = await fs.open(filePath, constants.O_RDWR | noFollow)
  try {
    const opened = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(opened, label)
    const current = await directRegularFile(filePath, directory, label)
    if (!sameIdentity(expected, opened) || !sameIdentity(opened, current)) {
      throw new Error(`${label} changed while it was opened for durability sync.`)
    }
    await handle.sync()
    const synced = await handle.stat({ bigint: true })
    assertSingleLinkedRegularFile(synced, label)
    const after = await directRegularFile(filePath, directory, label)
    if (!sameIdentity(opened, synced) || !sameIdentity(synced, after)) {
      throw new Error(`${label} changed during durability sync.`)
    }
  } finally {
    await handle.close()
  }
}

async function syncDirectory(directory: DirectDirectory, label: string): Promise<void> {
  const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(directory.path, constants.O_RDONLY | noFollow)
  } catch (error) {
    if (!isUnsupportedDirectorySyncError(error)) throw error
    await assertDirectoryIdentity(directory, label)
    return
  }
  try {
    const opened = await handle.stat({ bigint: true })
    if (!opened.isDirectory() || !sameIdentity(directory, opened)) {
      throw new Error(`${label} changed while it was opened for directory durability sync.`)
    }
    await assertDirectoryIdentity(directory, label)
    try {
      await handle.sync()
    } catch (error) {
      if (!isUnsupportedDirectorySyncError(error)) throw error
    }
    const synced = await handle.stat({ bigint: true })
    if (!synced.isDirectory() || !sameIdentity(opened, synced) || !sameIdentity(directory, synced)) {
      throw new Error(`${label} changed during directory durability sync.`)
    }
    await assertDirectoryIdentity(directory, label)
  } finally {
    await handle.close()
  }
}

async function renameWithRetry(source: string, target: string, beforeRename: () => Promise<void>): Promise<void> {
  const delays = [10, 50, 100]
  for (let attempt = 0; ; attempt += 1) {
    await beforeRename()
    try {
      await fs.rename(source, target)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!code || !["EPERM", "EACCES", "EBUSY"].includes(code) || attempt >= delays.length) throw error
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]))
    }
  }
}

async function directoryStillMatches(directory: DirectDirectory): Promise<boolean> {
  try {
    await assertDirectoryIdentity(directory, "Workflow run directory")
    return true
  } catch {
    return false
  }
}

function durabilityLabel(runId: string, fileName: string): string {
  return `Workflow run '${runId}' durability file '${fileName}'`
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function stableFileState(stat: StableFileState): StableFileState {
  return {
    ctimeNs: stat.ctimeNs,
    dev: stat.dev,
    ino: stat.ino,
    mtimeNs: stat.mtimeNs,
    nlink: stat.nlink,
    size: stat.size
  }
}

function sameStableFileState(left: StableFileState, right: StableFileState): boolean {
  return sameIdentity(left, right)
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs
    && left.nlink === right.nlink
}

function assertSingleLinkedRegularFile(
  stat: { isFile(): boolean; nlink: bigint },
  label: string
): void {
  if (!stat.isFile()) throw new Error(`${label} must be a regular file.`)
  if (stat.nlink !== 1n) throw new Error(`${label} must have a single link and must not be hard-linked.`)
}

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return Boolean(code && ["EINVAL", "EPERM", "EISDIR", "ENOTSUP"].includes(code))
}

function isMissingPathError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code
  return code === "ENOENT" || code === "ENOTDIR"
}
