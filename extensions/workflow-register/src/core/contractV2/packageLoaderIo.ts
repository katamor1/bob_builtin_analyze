import type {
  WorkflowPackageFileKind,
  WorkflowPackageOpenFile,
  WorkflowPackageFileStat,
  WorkflowPackageFileSystem
} from "./packageFileSystem"
import type { DirectorySnapshot } from "./packageLoaderContract"
import {
  arrayIsArray,
  arrayPrototype,
  includes,
  isProxy,
  normalizeContainmentRoot,
  numberIsSafeInteger,
  objectFreeze,
  objectGetOwnPropertyDescriptor,
  objectGetOwnPropertyDescriptors,
  objectGetPrototypeOf,
  objectHasOwn,
  pushValue,
  sortValues,
  Uint8ArrayConstructor
} from "./packageLoaderIntrinsics"

const ALLOWED_KINDS = objectFreeze(["file", "directory", "symbolic-link", "other"] as const)

export interface StableControlFileSnapshot {
  readonly bytes: Uint8Array
  readonly identity: string
  readonly physical: string
}

export async function assertDirectoryChain(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  paths: readonly (readonly string[])[]
): Promise<string> {
  const collectionStat = await safeLstat(fileSystem, hostRoot, [], "collection root")
  assertDirectoryKind(collectionStat.kind, "collection root")
  const collectionPhysical = normalizeContainmentRoot(
    await safeRealpath(fileSystem, hostRoot, [], "collection root")
  )
  let parentPhysical = collectionPhysical
  for (let index = 0; index < paths.length; index += 1) {
    const stat = await safeLstat(fileSystem, hostRoot, paths[index], "workflow package directory")
    assertDirectoryKind(stat.kind, paths[index].join("/"))
    const physical = normalizeContainmentRoot(
      await safeRealpath(fileSystem, hostRoot, paths[index], "workflow package directory")
    )
    if (
      !safeIsWithin(fileSystem, collectionPhysical, physical)
      || !safeIsWithin(fileSystem, parentPhysical, physical)
    ) throw new Error("Workflow package directory escapes physical containment.")
    parentPhysical = physical
  }
  return parentPhysical
}

export async function readStableControlFile(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  segments: readonly string[],
  maximumBytes: number,
  label: string,
  containmentRootPhysical: string
): Promise<StableControlFileSnapshot> {
  let before: WorkflowPackageFileStat
  try {
    before = await safeLstat(fileSystem, hostRoot, segments, label)
  } catch {
    throw new Error(`Workflow package ${label} is missing or unavailable.`)
  }
  if (before.kind === "symbolic-link") {
    throw new Error(`Workflow package ${label} must not be a symbolic link.`)
  }
  if (before.kind !== "file") throw new Error(`Workflow package ${label} must be a regular file.`)
  if (!numberIsSafeInteger(before.size) || before.size < 1 || before.size > maximumBytes) {
    throw new Error(`Workflow package ${label} has an invalid byte size.`)
  }
  const physical = normalizeContainmentRoot(
    await safeRealpath(fileSystem, hostRoot, segments, label)
  )
  if (!safeIsWithin(fileSystem, containmentRootPhysical, physical)) {
    throw new Error(`Workflow package ${label} escapes physical containment.`)
  }

  return readStableOpenedFile(
    fileSystem,
    hostRoot,
    segments,
    before,
    physical,
    label,
    containmentRootPhysical
  )
}

export async function readStableOpenedFile(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  segments: readonly string[],
  before: WorkflowPackageFileStat,
  physical: string,
  label: string,
  containmentRootPhysical: string
): Promise<StableControlFileSnapshot> {
  let opened: WorkflowPackageOpenFile
  try {
    opened = await fileSystem.openFile(hostRoot, segments)
  } catch {
    throw new Error(`Workflow package ${label} could not be opened safely.`)
  }
  if (
    typeof opened !== "object"
    || opened === null
    || typeof opened.read !== "function"
    || typeof opened.stat !== "function"
    || typeof opened.close !== "function"
  ) throw new Error(`Workflow package ${label} open handle is invalid.`)

  let bytes: Uint8Array
  try {
    const openedBefore = snapshotStat(opened.initialStat, `${label} open handle`)
    if (!sameFileStat(openedBefore, before)) {
      throw new Error(`Workflow package ${label} changed before its stable handle opened.`)
    }

    let bytesValue: Uint8Array
    try {
      bytesValue = await opened.read()
    } catch {
      throw new Error(`Workflow package ${label} could not be read safely.`)
    }
    if (!(bytesValue instanceof Uint8ArrayConstructor)) {
      throw new Error(`Workflow package ${label} bytes are invalid.`)
    }
    bytes = new Uint8ArrayConstructor(bytesValue)
    const openedAfter = snapshotStat(await opened.stat(), `${label} open handle`)
    if (!sameFileStat(openedAfter, openedBefore) || bytes.byteLength !== openedBefore.size) {
      throw new Error(`Workflow package ${label} changed while its stable handle was read.`)
    }
  } finally {
    try {
      await opened.close()
    } catch {
      throw new Error(`Workflow package ${label} open handle could not be closed safely.`)
    }
  }

  const after = await safeLstat(fileSystem, hostRoot, segments, label)
  if (!sameFileStat(after, before)) {
    throw new Error(`Workflow package ${label} changed during snapshot read.`)
  }
  const afterPhysical = normalizeContainmentRoot(
    await safeRealpath(fileSystem, hostRoot, segments, label)
  )
  if (afterPhysical !== physical) {
    throw new Error(`Workflow package ${label} physical identity changed during snapshot read.`)
  }
  if (!safeIsWithin(fileSystem, containmentRootPhysical, afterPhysical)) {
    throw new Error(`Workflow package ${label} escapes physical containment.`)
  }
  return objectFreeze({ bytes, identity: before.identity, physical })
}

export async function assertDirectorySnapshotsUnchanged(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  snapshots: readonly DirectorySnapshot[]
): Promise<void> {
  for (let index = 0; index < snapshots.length; index += 1) {
    const snapshot = snapshots[index]
    const stat = await safeLstat(fileSystem, hostRoot, snapshot.segments, "workflow package directory")
    if (stat.kind !== "directory" || stat.identity !== snapshot.identity) {
      throw new Error("Workflow package directory changed during snapshot read.")
    }
    const physical = normalizeContainmentRoot(
      await safeRealpath(fileSystem, hostRoot, snapshot.segments, "workflow package directory")
    )
    if (physical !== snapshot.physical) {
      throw new Error("Workflow package directory physical identity changed during snapshot read.")
    }
    const names = snapshotDirectoryNames(
      await safeReadDirectory(fileSystem, hostRoot, snapshot.segments),
      "workflow package directory",
      snapshot.names.length
    )
    if (names.length !== snapshot.names.length) {
      throw new Error("Workflow package directory changed during snapshot read.")
    }
    for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
      if (names[nameIndex] !== snapshot.names[nameIndex]) {
        throw new Error("Workflow package directory changed during snapshot read.")
      }
    }
  }
}

export function assertDirectoryKind(actual: WorkflowPackageFileKind, label: string): void {
  if (actual === "symbolic-link") {
    throw new Error(`Workflow package path ${label} must not be a symbolic link.`)
  }
  if (actual !== "directory") {
    throw new Error(`Workflow package path ${label} must be a directory.`)
  }
}

export async function safeLstat(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  segments: readonly string[],
  label: string
): Promise<WorkflowPackageFileStat> {
  try {
    return snapshotStat(await fileSystem.lstat(hostRoot, segments), label)
  } catch (error) {
    if (
      error instanceof Error
      && /symbolic|directory|regular|snapshot|invalid stat/i.test(error.message)
    ) throw error
    throw new Error(`Workflow package ${label} is missing or unavailable.`)
  }
}

function snapshotStat(value: unknown, label: string): WorkflowPackageFileStat {
  if (
    typeof value !== "object"
    || value === null
    || !includes(ALLOWED_KINDS, (value as { kind?: string }).kind ?? "")
    || typeof (value as { identity?: unknown }).identity !== "string"
    || typeof (value as { size?: unknown }).size !== "number"
  ) throw new Error(`invalid stat for ${label}`)
  const stat = value as WorkflowPackageFileStat
  return objectFreeze({ kind: stat.kind, size: stat.size, identity: stat.identity })
}

function sameFileStat(left: WorkflowPackageFileStat, right: WorkflowPackageFileStat): boolean {
  return left.kind === right.kind && left.size === right.size && left.identity === right.identity
}

export async function safeReadDirectory(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  segments: readonly string[]
): Promise<readonly string[]> {
  try {
    return await fileSystem.readDirectory(hostRoot, segments)
  } catch {
    throw new Error("Workflow package directory could not be enumerated.")
  }
}

export async function safeRealpath(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  hostRoot: unknown,
  segments: readonly string[],
  label: string
): Promise<string> {
  try {
    const value = await fileSystem.realpath(hostRoot, segments)
    if (typeof value !== "string" || value.length === 0) throw new Error("invalid realpath")
    return value
  } catch {
    throw new Error(`Workflow package ${label} physical path is unavailable.`)
  }
}

export function safeIsWithin(
  fileSystem: WorkflowPackageFileSystem<unknown>,
  rootPhysical: string,
  candidatePhysical: string
): boolean {
  try {
    return fileSystem.isWithin(rootPhysical, candidatePhysical) === true
  } catch {
    throw new Error("Workflow package physical containment could not be verified.")
  }
}

export function snapshotDirectoryNames(
  value: readonly string[],
  label: string,
  maximumEntries: number
): readonly string[] {
  if (
    !arrayIsArray(value)
    || isProxy(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
  ) throw new Error(`${label} enumeration is invalid.`)

  const ownLengthDescriptor = objectGetOwnPropertyDescriptor(value, "length")
  const length = ownLengthDescriptor?.value
  if (typeof length !== "number" || !numberIsSafeInteger(length) || length < 0) {
    throw new Error(`${label} enumeration length is invalid.`)
  }
  if (length > maximumEntries) {
    throw new Error(`${label} file count or directory entry budget exceeds the 512-file limit.`)
  }

  const descriptors = objectGetOwnPropertyDescriptors(value)

  const result: string[] = []
  const seen = new Set<string>()
  for (let index = 0; index < length; index += 1) {
    const property = objectGetOwnPropertyDescriptor(descriptors, String(index))?.value as
      | PropertyDescriptor
      | undefined
    if (
      property === undefined
      || !objectHasOwn(property, "value")
      || property.enumerable !== true
      || typeof property.value !== "string"
    ) throw new Error(`${label} enumeration must be dense string data.`)
    if (seen.has(property.value)) {
      throw new Error(`${label} enumeration contains a duplicate name.`)
    }
    seen.add(property.value)
    pushValue(result, property.value)
  }
  sortValues(result, compareText)
  return objectFreeze(result)
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
