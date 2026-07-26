import { constants } from "node:fs"
import * as fs from "node:fs/promises"
import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

const ATTEMPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const PORTABLE_PATH_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*[:\\])[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u
const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
])
const ARTIFACT_SET_FILE = "artifact-set.json"
const MAX_ENTRIES = 256

export interface AttemptArtifactWorkspace {
  readonly __attemptArtifactWorkspaceBrand?: never
}

interface DirectoryIdentity {
  readonly path: string
  readonly real: string
  readonly dev: number | bigint
  readonly ino: number | bigint
}

interface WorkspaceState {
  readonly runRoot: string
  readonly runRootReal: string
  readonly stagingParent: string
  readonly committedParent: string
  readonly stagingPath: string
  readonly committedPath: string
  readonly attemptId: string
  status: "open" | "promoted" | "aborted"
}

interface AnchoredArtifactFile {
  readonly file: Awaited<ReturnType<typeof fs.open>>
  readonly parent: Awaited<ReturnType<typeof fs.open>>
  readonly parentIdentity: DirectoryIdentity
  readonly targetPath: string
}

export interface VerifiedAttemptArtifactFile {
  readonly relativePath: string
  readonly bytes: Uint8Array
}

export interface AttemptArtifactWorkspaceTree {
  readonly files: readonly string[]
  readonly directories: readonly string[]
}

const isProxy = utilTypes.isProxy
const functionHasInstance = Function.prototype[Symbol.hasInstance]
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply
const typedArraySet = Uint8Array.prototype.set
const Uint8ArrayConstructor = Uint8Array
const typedArrayPrototype = Object.getPrototypeOf(Uint8ArrayConstructor.prototype)
const typedArrayByteLengthGetter = typedArrayPrototype === null
  ? undefined
  : Object.getOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get
const states = new WeakMap<object, WorkspaceState>()
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, WorkspaceState>, key: object
) => WorkspaceState | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, WorkspaceState>, key: object, value: WorkspaceState
) => WeakMap<object, WorkspaceState>
const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0
const directoryFlag = typeof constants.O_DIRECTORY === "number" ? constants.O_DIRECTORY : 0

export async function allocateAttemptArtifactWorkspace(
  runRoot: string,
  attemptId: string
): Promise<AttemptArtifactWorkspace> {
  const safeAttemptId = requireAttemptId(attemptId)
  const root = await requireDirectRoot(runRoot)
  const attempts = await ensureDirectDirectory(root.path, "attempts", root.real)
  const stagingParent = await ensureDirectDirectory(attempts.path, "staging", root.real)
  const committedParent = await ensureDirectDirectory(attempts.path, "committed", root.real)
  const stagingPath = nodePath.join(stagingParent.path, safeAttemptId)
  const committedPath = nodePath.join(committedParent.path, safeAttemptId)
  await assertMissingDirectPath(committedPath)
  try {
    await fs.mkdir(stagingPath, { recursive: false, mode: 0o700 })
  } catch (error) {
    if (isExistsError(error)) throw new Error("Workflow artifact attempt workspace is already allocated.")
    throw error
  }
  await syncDirectory(stagingParent.path)
  await requireDirectDirectory(stagingPath, root.real)

  const workspace = objectFreeze({}) as AttemptArtifactWorkspace
  weakMapSet(states, workspace, {
    runRoot: root.path,
    runRootReal: root.real,
    stagingParent: stagingParent.path,
    committedParent: committedParent.path,
    stagingPath,
    committedPath,
    attemptId: safeAttemptId,
    status: "open"
  })
  return workspace
}

export async function writeAttemptArtifactWorkspaceFile(
  workspace: AttemptArtifactWorkspace,
  relativePath: string,
  bytes: Uint8Array
): Promise<void> {
  const state = requireOpenState(workspace)
  const safePath = requireArtifactPath(relativePath)
  if (safePath === ARTIFACT_SET_FILE) throw new TypeError("Workflow artifact path is reserved.")
  const copy = copyBytes(bytes)
  const segments = safePath.split("/")
  let parent = state.stagingPath
  for (let index = 0; index < segments.length - 1; index += 1) {
    parent = (await ensureDirectDirectory(parent, segments[index], state.runRootReal)).path
  }
  const target = nodePath.join(parent, segments[segments.length - 1])
  assertContained(state.stagingPath, target)
  await writeExclusiveFile(target, copy, state.runRootReal)
}

export async function listAttemptArtifactWorkspaceFiles(
  workspace: AttemptArtifactWorkspace
): Promise<readonly string[]> {
  return (await inspectAttemptArtifactWorkspaceTree(workspace)).files
}

export async function inspectAttemptArtifactWorkspaceTree(
  workspace: AttemptArtifactWorkspace
): Promise<AttemptArtifactWorkspaceTree> {
  const state = requireOpenOrPromotedState(workspace)
  const root = state.status === "open" ? state.stagingPath : state.committedPath
  return inspectDirectTree(root, state.runRootReal)
}

export async function inspectCommittedAttemptArtifactWorkspaceTree(input: {
  readonly runRoot: string
  readonly attemptId: string
}): Promise<AttemptArtifactWorkspaceTree | undefined> {
  const root = await requireDirectRoot(input.runRoot)
  const attemptId = requireAttemptId(input.attemptId)
  const committed = nodePath.join(root.path, "attempts", "committed", attemptId)
  try {
    await requireDirectDirectory(committed, root.real)
  } catch (error) {
    if (isMissingError(error)) return undefined
    throw error
  }
  return inspectDirectTree(committed, root.real)
}

export async function readVerifiedAttemptArtifactWorkspaceFile(
  workspace: AttemptArtifactWorkspace,
  relativePath: string,
  maximumBytes: number
): Promise<VerifiedAttemptArtifactFile> {
  const state = requireOpenOrPromotedState(workspace)
  assertMaximumBytes(maximumBytes)
  const safePath = requireArtifactPath(relativePath)
  const root = state.status === "open" ? state.stagingPath : state.committedPath
  const target = nodePath.join(root, ...safePath.split("/"))
  assertContained(root, target)
  const bytes = await readStableRegularFile(target, root, state.runRootReal, maximumBytes)
  return objectFreeze({ relativePath: safePath, bytes })
}

export async function writeAttemptArtifactSetFile(
  workspace: AttemptArtifactWorkspace,
  bytes: Uint8Array
): Promise<void> {
  const state = requireOpenState(workspace)
  const target = nodePath.join(state.stagingPath, ARTIFACT_SET_FILE)
  await writeExclusiveFile(target, copyBytes(bytes), state.runRootReal)
  await syncDirectory(state.stagingPath)
}

export async function promoteAttemptArtifactWorkspace(
  workspace: AttemptArtifactWorkspace
): Promise<string> {
  const state = requireOpenState(workspace)
  await assertMissingDirectPath(state.committedPath)
  try {
    await fs.rename(state.stagingPath, state.committedPath)
  } catch (error) {
    if (isCrossDeviceError(error)) throw new Error("Workflow artifact promotion must remain on one filesystem.")
    if (isExistsError(error)) throw new Error("Workflow artifact committed attempt already exists.")
    throw error
  }
  state.status = "promoted"
  await requireDirectDirectory(state.committedPath, state.runRootReal)
  await syncDirectory(state.committedParent)
  return state.committedPath
}

export async function abortAttemptArtifactWorkspace(
  workspace: AttemptArtifactWorkspace
): Promise<void> {
  const state = requireState(workspace)
  if (state.status !== "open") return
  state.status = "aborted"
  await fs.rm(state.stagingPath, { recursive: true, force: true })
  await syncDirectory(state.stagingParent)
}

export async function readCommittedAttemptArtifactSetBytes(input: {
  readonly runRoot: string
  readonly attemptId: string
}): Promise<Uint8Array | undefined> {
  const root = await requireDirectRoot(input.runRoot)
  const attemptId = requireAttemptId(input.attemptId)
  const committed = nodePath.join(root.path, "attempts", "committed", attemptId)
  try {
    await requireDirectDirectory(committed, root.real)
  } catch (error) {
    if (isMissingError(error)) return undefined
    throw error
  }
  return readStableRegularFile(nodePath.join(committed, ARTIFACT_SET_FILE), committed, root.real, 4_194_304)
}

export async function readCommittedAttemptArtifactFile(input: {
  readonly runRoot: string
  readonly attemptId: string
  readonly relativePath: string
  readonly maximumBytes: number
}): Promise<Uint8Array> {
  const root = await requireDirectRoot(input.runRoot)
  const attemptId = requireAttemptId(input.attemptId)
  const safePath = requireArtifactPath(input.relativePath)
  assertMaximumBytes(input.maximumBytes)
  const committed = nodePath.join(root.path, "attempts", "committed", attemptId)
  await requireDirectDirectory(committed, root.real)
  return readStableRegularFile(
    nodePath.join(committed, ...safePath.split("/")),
    committed,
    root.real,
    input.maximumBytes
  )
}

function requireState(value: unknown): WorkspaceState {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError("Workflow artifact workspace is invalid.")
  }
  const state = weakMapGet(states, value)
  if (state === undefined) throw new TypeError("Workflow artifact workspace is invalid.")
  return state
}

function requireOpenState(value: unknown): WorkspaceState {
  const state = requireState(value)
  if (state.status !== "open") throw new Error("Workflow artifact workspace is no longer open.")
  return state
}

function requireOpenOrPromotedState(value: unknown): WorkspaceState {
  const state = requireState(value)
  if (state.status === "aborted") throw new Error("Workflow artifact workspace is aborted.")
  return state
}

function requireAttemptId(value: unknown): string {
  if (
    typeof value !== "string"
    || !ATTEMPT_PATTERN.test(value)
    || /[. ]$/u.test(value)
    || WINDOWS_RESERVED.has(value.split(".")[0].toUpperCase())
  ) throw new TypeError("Workflow artifact attempt id is invalid.")
  return value
}

function requireArtifactPath(value: unknown): string {
  if (typeof value !== "string" || !PORTABLE_PATH_PATTERN.test(value)) {
    throw new TypeError("Workflow artifact relative path is invalid.")
  }
  const segments = value.split("/")
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    if (/[. ]$/u.test(segment) || WINDOWS_RESERVED.has(segment.split(".")[0].toUpperCase())) {
      throw new TypeError("Workflow artifact relative path is invalid.")
    }
  }
  return value
}

async function requireDirectRoot(runRoot: unknown): Promise<DirectoryIdentity> {
  if (typeof runRoot !== "string" || runRoot.length === 0 || !nodePath.isAbsolute(runRoot)) {
    throw new TypeError("Workflow artifact run root must be an absolute path.")
  }
  const resolved = nodePath.resolve(runRoot)
  const identity = await requireDirectDirectory(resolved, resolved)
  if (identity.real !== resolved) throw new Error("Workflow artifact run root must not traverse a link.")
  return identity
}

async function ensureDirectDirectory(
  parent: string,
  segment: string,
  containmentRoot: string
): Promise<DirectoryIdentity> {
  if (!segment || segment === "." || segment === ".." || /[\\/]/u.test(segment)) {
    throw new TypeError("Workflow artifact directory segment is invalid.")
  }
  const target = nodePath.join(parent, segment)
  let created = false
  try {
    await fs.mkdir(target, { recursive: false, mode: 0o700 })
    created = true
  } catch (error) {
    if (!isExistsError(error)) throw error
  }
  if (created) await syncDirectory(parent)
  return requireDirectDirectory(target, containmentRoot)
}

async function requireDirectDirectory(target: string, containmentRoot: string): Promise<DirectoryIdentity> {
  const stat = await fs.lstat(target)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Workflow artifact path contains a symlink or non-directory component.")
  }
  const real = await fs.realpath(target)
  assertContained(containmentRoot, real)
  if (nodePath.resolve(real) !== nodePath.resolve(target)) {
    throw new Error("Workflow artifact directory changed or traverses a link.")
  }
  return { path: target, real, dev: stat.dev, ino: stat.ino }
}

async function writeExclusiveFile(target: string, bytes: Uint8Array, containmentRoot: string): Promise<void> {
  const opened = await openArtifactFileAnchored(target, containmentRoot)
  try {
    await verifyOpenedArtifactFileContainment(opened, containmentRoot)
    await opened.file.writeFile(bytes)
    await opened.file.sync()
    await verifyOpenedArtifactFileContainment(opened, containmentRoot, bytes.byteLength)
  } finally {
    await opened.file.close().catch(() => undefined)
    await opened.parent.close().catch(() => undefined)
  }
  await syncDirectory(nodePath.dirname(target))
}

async function openArtifactFileAnchored(target: string, containmentRoot: string): Promise<AnchoredArtifactFile> {
  const parentPath = nodePath.dirname(target)
  const parentIdentity = await requireDirectDirectory(parentPath, containmentRoot)
  const parent = await fs.open(parentPath, constants.O_RDONLY | directoryFlag)
  try {
    const parentStat = await parent.stat()
    if (!sameDirectoryIdentity(parentIdentity, parentStat)) {
      throw new Error("Workflow artifact parent changed before file creation.")
    }
    const anchoredTarget = process.platform === "linux"
      ? `/proc/self/fd/${parent.fd}/${nodePath.basename(target)}`
      : target
    const file = await fs.open(
      anchoredTarget,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
      0o600
    )
    return { file, parent, parentIdentity, targetPath: target }
  } catch (error) {
    await parent.close().catch(() => undefined)
    throw error
  }
}

async function verifyOpenedArtifactFileContainment(
  opened: AnchoredArtifactFile,
  containmentRoot: string,
  expectedBytes?: number
): Promise<void> {
  const parentStat = await opened.parent.stat()
  if (!sameDirectoryIdentity(opened.parentIdentity, parentStat)) {
    throw new Error("Workflow artifact parent changed during file creation.")
  }
  const parentPathIdentity = await requireDirectDirectory(opened.parentIdentity.path, containmentRoot)
  if (!sameDirectoryIdentity(opened.parentIdentity, parentPathIdentity)) {
    throw new Error("Workflow artifact parent path was replaced during file creation.")
  }
  const fileStat = await opened.file.stat()
  if (!fileStat.isFile() || fileStat.nlink !== 1 || (expectedBytes !== undefined && fileStat.size !== expectedBytes)) {
    throw new Error("Workflow artifact staged path is not a stable single-linked regular file.")
  }

  if (process.platform === "linux") {
    const actual = await fs.realpath(`/proc/self/fd/${opened.file.fd}`)
    assertContained(containmentRoot, actual)
    if (nodePath.resolve(actual) !== nodePath.resolve(opened.targetPath)) {
      throw new Error("Workflow artifact opened file is outside its pinned parent.")
    }
    return
  }

  const targetStat = await fs.lstat(opened.targetPath)
  if (!sameFileIdentity(fileStat, targetStat) || targetStat.isSymbolicLink()) {
    throw new Error("Workflow artifact target changed during file creation.")
  }
  const real = await fs.realpath(opened.targetPath)
  assertContained(containmentRoot, real)
  if (nodePath.resolve(real) !== nodePath.resolve(opened.targetPath)) {
    throw new Error("Workflow artifact target traverses a link.")
  }
}

async function readStableRegularFile(
  target: string,
  workspaceRoot: string,
  containmentRoot: string,
  maximumBytes: number
): Promise<Uint8Array> {
  assertContained(workspaceRoot, target)
  const pre = await fs.lstat(target)
  if (!pre.isFile() || pre.isSymbolicLink() || pre.nlink !== 1 || pre.size > maximumBytes) {
    throw new Error("Workflow artifact verification requires a bounded direct regular file.")
  }
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(target, constants.O_RDONLY | noFollow)
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink !== 1 || opened.size > maximumBytes || !sameFileIdentity(pre, opened)) {
      throw new Error("Workflow artifact changed during verification.")
    }
    const bytes = await handle.readFile()
    const afterRead = await handle.stat()
    const post = await fs.lstat(target)
    if (!sameFileIdentity(opened, afterRead) || !sameFileIdentity(afterRead, post) || afterRead.size !== bytes.byteLength) {
      throw new Error("Workflow artifact changed during verification.")
    }
    const actual = process.platform === "linux"
      ? await fs.realpath(`/proc/self/fd/${handle.fd}`)
      : await fs.realpath(target)
    assertContained(containmentRoot, actual)
    if (nodePath.resolve(actual) !== nodePath.resolve(target)) {
      throw new Error("Workflow artifact verification encountered a symlink or changed path.")
    }
    return new Uint8Array(bytes)
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

async function inspectDirectTree(root: string, containmentRoot: string): Promise<AttemptArtifactWorkspaceTree> {
  const files: string[] = []
  const directories: string[] = []
  const pending: { path: string; relative: string }[] = [{ path: root, relative: "" }]
  let entries = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    const directory = await fs.opendir(current.path)
    try {
      for await (const entry of directory) {
        entries += 1
        if (entries > MAX_ENTRIES) throw new Error("Workflow artifact workspace exceeds its entry budget.")
        const absolute = nodePath.join(current.path, entry.name)
        const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name
        const stat = await fs.lstat(absolute)
        if (stat.isSymbolicLink()) throw new Error("Workflow artifact workspace contains a symlink.")
        if (stat.isDirectory()) {
          const real = await fs.realpath(absolute)
          assertContained(containmentRoot, real)
          directories.push(`${relative.replace(/\\/gu, "/")}/`)
          pending.push({ path: absolute, relative })
        } else if (stat.isFile() && stat.nlink === 1) {
          files.push(relative.replace(/\\/gu, "/"))
        } else {
          throw new Error("Workflow artifact workspace contains a non-regular entry.")
        }
      }
    } finally {
      await directory.close().catch(() => undefined)
    }
  }
  files.sort()
  directories.sort()
  return objectFreeze({ files: objectFreeze(files), directories: objectFreeze(directories) })
}

function copyBytes(value: unknown): Uint8Array {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || !(reflectApply(functionHasInstance, Uint8ArrayConstructor, [value]) as boolean)
  ) throw new TypeError("Workflow artifact bytes must be a Uint8Array.")
  if (typedArrayByteLengthGetter === undefined) throw new TypeError("Workflow artifact byte length intrinsic is unavailable.")
  const length = reflectApply(typedArrayByteLengthGetter, value, []) as number
  const copy = new Uint8ArrayConstructor(length)
  reflectApply(typedArraySet, copy, [value])
  return copy
}

function sameDirectoryIdentity(
  left: { dev: number | bigint; ino: number | bigint },
  right: { dev: number | bigint; ino: number | bigint }
): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function sameFileIdentity(
  left: { dev: number | bigint; ino: number | bigint; size: number | bigint },
  right: { dev: number | bigint; ino: number | bigint; size: number | bigint }
): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
}

function assertMaximumBytes(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 67_108_864) {
    throw new TypeError("Workflow artifact maximum byte size is invalid.")
  }
}

function assertContained(root: string, candidate: string): void {
  const relative = nodePath.relative(nodePath.resolve(root), nodePath.resolve(candidate))
  if (relative === "" || (!relative.startsWith("..") && !nodePath.isAbsolute(relative))) return
  throw new Error("Workflow artifact path escapes its runtime-owned root.")
}

async function assertMissingDirectPath(target: string): Promise<void> {
  try {
    await fs.lstat(target)
    throw new Error("Workflow artifact attempt destination already exists.")
  } catch (error) {
    if (isMissingError(error)) return
    throw error
  }
}

async function syncDirectory(directoryPath: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(directoryPath, constants.O_RDONLY | directoryFlag)
    await handle.sync()
  } catch (error) {
    if (!isUnsupportedDirectorySyncError(error)) throw error
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

function isMissingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ((error as { code?: unknown }).code === "ENOENT" || (error as { code?: unknown }).code === "ENOTDIR")
}

function isExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "EEXIST"
}

function isCrossDeviceError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && (error as { code?: unknown }).code === "EXDEV"
}

function isUnsupportedDirectorySyncError(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  const code = (error as { code?: unknown }).code
  return code === "EINVAL" || code === "EISDIR" || code === "EPERM" || code === "EACCES"
}
