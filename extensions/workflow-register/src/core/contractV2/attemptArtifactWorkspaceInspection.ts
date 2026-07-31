import * as fs from "node:fs/promises"
import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

export interface StagedAttemptArtifactWorkspaceSnapshot {
  readonly chain: readonly AttemptArtifactDirectoryIdentity[]
  readonly files: readonly string[]
  readonly directories: readonly string[]
}

interface AttemptArtifactDirectoryIdentity {
  readonly path: string
  readonly real: string
  readonly dev: number | bigint
  readonly ino: number | bigint
}

const isProxy = utilTypes.isProxy
const lstat = fs.lstat
const opendir = fs.opendir
const realpath = fs.realpath
const nodePathIsAbsolute = nodePath.isAbsolute
const nodePathJoin = nodePath.join
const nodePathRelative = nodePath.relative
const nodePathResolve = nodePath.resolve
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const stringReplace = String.prototype.replace
const stringSplit = String.prototype.split
const stringStartsWith = String.prototype.startsWith
const stringToUpperCase = String.prototype.toUpperCase
const ATTEMPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const TRAILING_DOT_OR_SPACE_PATTERN = /[. ]$/u
const BACKSLASH_PATTERN = /\\/gu
const WINDOWS_RESERVED = objectFreeze([
  "AUX", "CON", "NUL", "PRN",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
] as const)
const INPUT_FIELDS = objectFreeze(["runRoot", "attemptId"] as const)
const MAX_ENTRIES = 256

/**
 * R3-owned read-only staging inspection. It never promotes, removes, or
 * reuses staging data; it returns a stable identity/tree snapshot for R6 to
 * classify. Missing staging is an ordinary undefined result.
 */
export async function inspectStagedAttemptArtifactWorkspace(input: {
  readonly runRoot: string
  readonly attemptId: string
}): Promise<StagedAttemptArtifactWorkspaceSnapshot | undefined> {
  const snapshot = snapshotInput(input)
  const runRoot = requireRunRoot(snapshot.runRoot)
  const attemptId = requireAttemptId(snapshot.attemptId)
  const before = await stagingChain(runRoot, attemptId)
  if (before === undefined) return undefined
  const tree = await inspectDirectTree(before[before.length - 1].path, before[0].real)
  const after = await stagingChain(runRoot, attemptId)
  if (after === undefined || !sameChain(before, after)) {
    throw new Error("Workflow artifact staging identity changed during tree inspection.")
  }
  return objectFreeze({
    chain: after,
    files: tree.files,
    directories: tree.directories
  })
}

async function stagingChain(
  runRoot: string,
  attemptId: string
): Promise<readonly AttemptArtifactDirectoryIdentity[] | undefined> {
  const root = await requireDirectDirectory(runRoot, runRoot)
  const identities: AttemptArtifactDirectoryIdentity[] = [root]
  let current = root.path
  const segments = objectFreeze(["attempts", "staging", attemptId] as const)
  for (let index = 0; index < segments.length; index += 1) {
    current = nodePathJoin(current, segments[index])
    let identity: AttemptArtifactDirectoryIdentity
    try {
      identity = await requireDirectDirectory(current, root.real)
    } catch (error) {
      if (isMissingError(error)) return undefined
      throw error
    }
    identities[identities.length] = identity
  }
  return objectFreeze(identities)
}

async function inspectDirectTree(
  root: string,
  containmentRoot: string
): Promise<{ readonly files: readonly string[]; readonly directories: readonly string[] }> {
  const files: string[] = []
  const directories: string[] = []
  const pending: { path: string; relative: string }[] = [{ path: root, relative: "" }]
  let entries = 0
  while (pending.length > 0) {
    const current = pending.pop()!
    const before = await requireDirectDirectory(current.path, containmentRoot)
    const directory = await opendir(current.path)
    try {
      for await (const entry of directory) {
        entries += 1
        if (entries > MAX_ENTRIES) {
          throw new Error("Workflow artifact staging exceeds its recovery entry budget.")
        }
        const absolute = nodePathJoin(current.path, entry.name)
        const relative = current.relative ? `${current.relative}/${entry.name}` : entry.name
        const stat = await lstat(absolute)
        if (stat.isSymbolicLink()) throw new Error("Workflow artifact staging contains a symlink.")
        if (stat.isDirectory()) {
          const identity = await requireDirectDirectory(absolute, containmentRoot)
          directories[directories.length] = `${portablePath(relative)}/`
          pending[pending.length] = { path: identity.path, relative }
        } else if (stat.isFile() && stat.nlink === 1) {
          files[files.length] = portablePath(relative)
        } else {
          throw new Error("Workflow artifact staging contains a non-regular entry.")
        }
      }
    } finally {
      await directory.close().catch(() => undefined)
    }
    const after = await requireDirectDirectory(current.path, containmentRoot)
    if (!sameIdentity(before, after)) {
      throw new Error("Workflow artifact staging directory changed during inspection.")
    }
  }
  files.sort()
  directories.sort()
  return objectFreeze({ files: objectFreeze(files), directories: objectFreeze(directories) })
}

async function requireDirectDirectory(
  target: string,
  containmentRoot: string
): Promise<AttemptArtifactDirectoryIdentity> {
  const stat = await lstat(target)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Workflow artifact staging path contains a link or non-directory component.")
  }
  const real = await realpath(target)
  assertContained(containmentRoot, real)
  if (nodePathResolve(real) !== nodePathResolve(target)) {
    throw new Error("Workflow artifact staging path is indirect or changed.")
  }
  return objectFreeze({ path: target, real, dev: stat.dev, ino: stat.ino })
}

function snapshotInput(value: unknown): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow artifact staging inspection input is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== INPUT_FIELDS.length) {
    throw new TypeError("Workflow artifact staging inspection input has an invalid shape.")
  }
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(INPUT_FIELDS, key)) {
      throw new TypeError("Workflow artifact staging inspection input contains an unknown field.")
    }
    result[key] = dataValue(descriptors[key])
  }
  for (let index = 0; index < INPUT_FIELDS.length; index += 1) {
    if (!objectHasOwn(result, INPUT_FIELDS[index])) {
      throw new TypeError("Workflow artifact staging inspection input is missing a required field.")
    }
  }
  return objectFreeze(result)
}

function requireRunRoot(value: unknown): string {
  if (typeof value !== "string" || !nodePathIsAbsolute(value)) {
    throw new TypeError("Workflow artifact staging run root must be absolute.")
  }
  return nodePathResolve(value)
}

function requireAttemptId(value: unknown): string {
  if (
    typeof value !== "string"
    || !testPattern(ATTEMPT_PATTERN, value)
    || testPattern(TRAILING_DOT_OR_SPACE_PATTERN, value)
  ) throw new TypeError("Workflow artifact recovery attempt id is invalid.")
  const first = reflectApply(stringSplit, value, [".", 1]) as string[]
  const device = first[0] === undefined
    ? ""
    : reflectApply(stringToUpperCase, first[0], []) as string
  if (contains(WINDOWS_RESERVED, device)) {
    throw new TypeError("Workflow artifact recovery attempt id is invalid.")
  }
  return value
}

function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Workflow artifact staging inspection fields must be enumerable data properties.")
  return descriptor.value
}

function sameChain(
  left: readonly AttemptArtifactDirectoryIdentity[],
  right: readonly AttemptArtifactDirectoryIdentity[]
): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (!sameIdentity(left[index], right[index])) return false
  }
  return true
}

function sameIdentity(
  left: AttemptArtifactDirectoryIdentity,
  right: AttemptArtifactDirectoryIdentity
): boolean {
  return left.path === right.path
    && left.real === right.real
    && left.dev === right.dev
    && left.ino === right.ino
}

function portablePath(value: string): string {
  return reflectApply(stringReplace, value, [BACKSLASH_PATTERN, "/"]) as string
}

function assertContained(root: string, target: string): void {
  const relative = nodePathRelative(nodePathResolve(root), nodePathResolve(target))
  if (relative === "") return
  if (!startsWith(relative, "..") && !nodePathIsAbsolute(relative)) return
  throw new Error("Workflow artifact staging path escapes its run root.")
}

function isMissingError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error
    && ((error as { code?: unknown }).code === "ENOENT" || (error as { code?: unknown }).code === "ENOTDIR")
}

function testPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpExec, pattern, [value]) !== null
}

function startsWith(value: string, prefix: string): boolean {
  return reflectApply(stringStartsWith, value, [prefix]) as boolean
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
