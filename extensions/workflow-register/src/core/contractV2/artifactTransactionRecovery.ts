import * as fs from "node:fs/promises"
import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

import {
  inspectCommittedWorkflowArtifactTransaction,
  type WorkflowArtifactTransactionInspection
} from "./artifactTransaction"
import type { Sha256Digest } from "./providerContract"

export type WorkflowArtifactTransactionRecoveryInspection =
  | { readonly status: "missing" }
  | { readonly status: "staging" }
  | Exclude<WorkflowArtifactTransactionInspection, { readonly status: "missing" }>

interface DirectoryIdentity {
  readonly path: string
  readonly real: string
  readonly dev: number | bigint
  readonly ino: number | bigint
}

const isProxy = utilTypes.isProxy
const lstat = fs.lstat
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
const stringSplit = String.prototype.split
const stringStartsWith = String.prototype.startsWith
const stringToUpperCase = String.prototype.toUpperCase
const inspectCommittedCaptured = inspectCommittedWorkflowArtifactTransaction
const ATTEMPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const TRAILING_DOT_OR_SPACE_PATTERN = /[. ]$/u
const WINDOWS_RESERVED = objectFreeze([
  "AUX", "CON", "NUL", "PRN",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"
] as const)
const INPUT_REQUIRED = objectFreeze(["runRoot", "attemptId"] as const)
const INPUT_OPTIONAL = objectFreeze(["expectedArtifactSetDigest"] as const)

/**
 * Read-only R6 inspection over the R3 attempt layout. Committed content remains
 * owned and validated by artifactTransaction.ts. This module adds only a
 * stable, direct-directory snapshot for the uncommitted staging location.
 */
export async function inspectWorkflowArtifactTransactionRecovery(input: {
  readonly runRoot: string
  readonly attemptId: string
  readonly expectedArtifactSetDigest?: Sha256Digest
}): Promise<WorkflowArtifactTransactionRecoveryInspection> {
  const snapshot = snapshotInput(input)
  const runRoot = requireRunRoot(snapshot.runRoot)
  const attemptId = requireAttemptId(snapshot.attemptId)
  const expected = snapshot.expectedArtifactSetDigest === undefined
    ? undefined
    : requireDigest(snapshot.expectedArtifactSetDigest)

  const before = await snapshotStagingDirectories(runRoot, attemptId)
  const committed = await inspectCommittedCaptured(objectFreeze({
    runRoot,
    attemptId,
    ...(expected === undefined ? {} : { expectedArtifactSetDigest: expected })
  }))
  const after = await snapshotStagingDirectories(runRoot, attemptId)
  if (!sameDirectorySnapshots(before, after)) {
    throw new Error("Workflow artifact staging identity changed during recovery inspection.")
  }
  if (before !== undefined && committed.status !== "missing") {
    throw new Error("Workflow artifact attempt exists in both staging and committed locations.")
  }
  if (before !== undefined) return objectFreeze({ status: "staging" as const })
  return committed
}

async function snapshotStagingDirectories(
  runRoot: string,
  attemptId: string
): Promise<readonly DirectoryIdentity[] | undefined> {
  const root = await requireDirectDirectory(runRoot, runRoot)
  const identities: DirectoryIdentity[] = [root]
  let current = root.path
  const segments = objectFreeze(["attempts", "staging", attemptId] as const)
  for (let index = 0; index < segments.length; index += 1) {
    current = nodePathJoin(current, segments[index])
    let identity: DirectoryIdentity
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

async function requireDirectDirectory(
  target: string,
  containmentRoot: string
): Promise<DirectoryIdentity> {
  const stat = await lstat(target)
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("Workflow artifact recovery path contains a link or non-directory component.")
  }
  const real = await realpath(target)
  assertContained(containmentRoot, real)
  if (nodePathResolve(real) !== nodePathResolve(target)) {
    throw new Error("Workflow artifact recovery path is indirect or changed.")
  }
  return objectFreeze({ path: target, real, dev: stat.dev, ino: stat.ino })
}

function snapshotInput(value: unknown): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow artifact recovery inspection input is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!contains(INPUT_REQUIRED, key) && !contains(INPUT_OPTIONAL, key))
    ) throw new TypeError("Workflow artifact recovery inspection input contains an unknown field.")
    result[key] = dataValue(descriptors[key])
  }
  for (let index = 0; index < INPUT_REQUIRED.length; index += 1) {
    if (!objectHasOwn(result, INPUT_REQUIRED[index])) {
      throw new TypeError("Workflow artifact recovery inspection input is missing a required field.")
    }
  }
  return objectFreeze(result)
}

function requireRunRoot(value: unknown): string {
  if (typeof value !== "string" || !nodePathIsAbsolute(value)) {
    throw new TypeError("Workflow artifact recovery run root must be absolute.")
  }
  return nodePathResolve(value)
}

function requireAttemptId(value: unknown): string {
  if (
    typeof value !== "string"
    || testPattern(ATTEMPT_PATTERN, value) === false
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

function requireDigest(value: unknown): Sha256Digest {
  if (typeof value !== "string" || testPattern(DIGEST_PATTERN, value) === false) {
    throw new TypeError("Workflow artifact recovery expected digest is invalid.")
  }
  return value as Sha256Digest
}

function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Workflow artifact recovery inspection fields must be enumerable data properties.")
  return descriptor.value
}

function sameDirectorySnapshots(
  left: readonly DirectoryIdentity[] | undefined,
  right: readonly DirectoryIdentity[] | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (
      left[index].path !== right[index].path
      || left[index].real !== right[index].real
      || left[index].dev !== right[index].dev
      || left[index].ino !== right[index].ino
    ) return false
  }
  return true
}

function assertContained(root: string, target: string): void {
  const relative = nodePathRelative(nodePathResolve(root), nodePathResolve(target))
  if (startsWith(relative, "..") || nodePathIsAbsolute(relative)) {
    throw new Error("Workflow artifact recovery path escapes its run root.")
  }
}

function isMissingError(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT"
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
