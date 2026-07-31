import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

import {
  inspectStagedAttemptArtifactWorkspace,
  type StagedAttemptArtifactWorkspaceSnapshot
} from "./attemptArtifactWorkspaceInspection"
import {
  inspectCommittedWorkflowArtifactTransaction,
  type WorkflowArtifactTransactionInspection
} from "./artifactTransaction"
import type { Sha256Digest } from "./providerContract"

export type WorkflowArtifactTransactionRecoveryInspection =
  | { readonly status: "missing" }
  | { readonly status: "staging" }
  | Exclude<WorkflowArtifactTransactionInspection, { readonly status: "missing" }>

const isProxy = utilTypes.isProxy
const nodePathIsAbsolute = nodePath.isAbsolute
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
const stringToUpperCase = String.prototype.toUpperCase
const inspectCommittedCaptured = inspectCommittedWorkflowArtifactTransaction
const inspectStagedCaptured = inspectStagedAttemptArtifactWorkspace
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
 * R6 composes two R3-owned read-only inspections. It owns only the recovery
 * classification and the stable before/after comparison; it performs no
 * filesystem traversal itself.
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

  const stagingInput = objectFreeze({ runRoot, attemptId })
  const before = await inspectStagedCaptured(stagingInput)
  const committed = await inspectCommittedCaptured(objectFreeze({
    runRoot,
    attemptId,
    ...(expected === undefined ? {} : { expectedArtifactSetDigest: expected })
  }))
  const after = await inspectStagedCaptured(stagingInput)
  if (!sameTreeSnapshots(before, after)) {
    throw new Error("Workflow artifact staging identity changed during recovery inspection.")
  }
  if (before !== undefined && committed.status !== "missing") {
    throw new Error("Workflow artifact attempt exists in both staging and committed locations.")
  }
  if (before !== undefined) return objectFreeze({ status: "staging" as const })
  return committed
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

function requireDigest(value: unknown): Sha256Digest {
  if (typeof value !== "string" || !testPattern(DIGEST_PATTERN, value)) {
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

function sameTreeSnapshots(
  left: StagedAttemptArtifactWorkspaceSnapshot | undefined,
  right: StagedAttemptArtifactWorkspaceSnapshot | undefined
): boolean {
  if (left === undefined || right === undefined) return left === right
  if (!sameStringArrays(left.files, right.files) || !sameStringArrays(left.directories, right.directories)) {
    return false
  }
  if (left.chain.length !== right.chain.length) return false
  for (let index = 0; index < left.chain.length; index += 1) {
    const a = left.chain[index]
    const b = right.chain[index]
    if (
      a.path !== b.path
      || a.real !== b.real
      || a.dev !== b.dev
      || a.ino !== b.ino
    ) return false
  }
  return true
}

function sameStringArrays(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function testPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpExec, pattern, [value]) !== null
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
