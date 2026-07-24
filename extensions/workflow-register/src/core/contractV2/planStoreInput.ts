import { types as utilTypes } from "node:util"

import {
  requireWorkflowCompilerEnvironmentState,
  type WorkflowCompilerEnvironment
} from "./compilerEnvironment"
import type { RawWorkflowPackage } from "./packageLoaderContract"
import type { Sha256Digest } from "./providerContract"
import { snapshotWorkflowLockGenerationRawPackage } from "./workflowLockSnapshot"

export interface SnapshotWorkflowPlanRequest {
  readonly collectionId: string
  readonly workflowId: string
  readonly slotKey: string
  readonly epoch: number
  readonly publication: "published" | "staging"
  readonly generation: string
  readonly packageDigest: Sha256Digest
  readonly rawPackage: RawWorkflowPackage
  readonly environment: WorkflowCompilerEnvironment
}

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const mapGet = Function.prototype.call.bind(Map.prototype.get) as (
  map: ReadonlyMap<unknown, unknown>, key: unknown
) => unknown
const mapSet = Function.prototype.call.bind(Map.prototype.set) as (
  map: Map<unknown, unknown>, key: unknown, value: unknown
) => Map<unknown, unknown>
const MapConstructor = Map
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const regexpTest = RegExp.prototype.test
const reflectApply = Reflect.apply
const stringIncludes = String.prototype.includes
const stringSplit = String.prototype.split
const INPUT_FIELDS = objectFreeze(["collectionId", "workflowId", "rawPackage", "environment"] as const)
const RAW_PACKAGE_FIELDS = objectFreeze([
  "publication", "workflowId", "generation", "packageDigest", "files"
] as const)
const WORKFLOW_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const COLLECTION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/u
const slotEpochs = new MapConstructor<string, number>()

export function snapshotWorkflowPlanRequest(input: unknown): SnapshotWorkflowPlanRequest {
  const record = snapshotExactRecord(input, INPUT_FIELDS, "Workflow plan store request")
  const collectionId = requireCollectionId(record.collectionId)
  const workflowId = requireWorkflowId(record.workflowId)
  const environment = record.environment as WorkflowCompilerEnvironment
  requireWorkflowCompilerEnvironmentState(environment)

  const raw = snapshotExactRecord(record.rawPackage, RAW_PACKAGE_FIELDS, "Workflow plan raw package")
  const publication = raw.publication
  const generation = raw.generation
  if ((publication !== "published" && publication !== "staging") || typeof generation !== "string") {
    throw new TypeError("Workflow plan raw package identity is invalid.")
  }
  const normalized = snapshotWorkflowLockGenerationRawPackage(raw)
  if (normalized.workflowId !== workflowId) {
    throw new TypeError("Workflow plan slot id does not match the raw package workflow id.")
  }
  const stableRawPackage = objectFreeze({
    publication,
    workflowId: normalized.workflowId,
    generation,
    packageDigest: normalized.packageDigest,
    files: normalized.files
  }) as unknown as RawWorkflowPackage
  const slotKey = createSlotKey(collectionId, workflowId)
  return objectFreeze({
    collectionId,
    workflowId,
    slotKey,
    epoch: currentWorkflowPlanSlotEpoch(slotKey),
    publication,
    generation,
    packageDigest: normalized.packageDigest,
    rawPackage: stableRawPackage,
    environment
  })
}

export function invalidateWorkflowPlanSlot(collectionId: string, workflowId: string): void {
  const slotKey = createSlotKey(requireCollectionId(collectionId), requireWorkflowId(workflowId))
  mapSet(slotEpochs, slotKey, currentWorkflowPlanSlotEpoch(slotKey) + 1)
}

export function currentWorkflowPlanSlotEpoch(slotKey: string): number {
  return (mapGet(slotEpochs, slotKey) as number | undefined) ?? 0
}

export function isWorkflowPlanRequestCurrent(request: SnapshotWorkflowPlanRequest): boolean {
  return currentWorkflowPlanSlotEpoch(request.slotKey) === request.epoch
}

function createSlotKey(collectionId: string, workflowId: string): string {
  return `${collectionId.length}:${collectionId}${workflowId.length}:${workflowId}`
}

function requireCollectionId(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || utf8ByteLength(value) > 240
    || !testPattern(COLLECTION_PATTERN, value)
    || includesText(value, "//")
    || hasDotSegment(value)
  ) throw new TypeError("Workflow plan collection id is invalid.")
  return value
}

function requireWorkflowId(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || !testPattern(WORKFLOW_ID_PATTERN, value)
  ) throw new TypeError("Workflow plan workflow id is invalid.")
  return value
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = objectGetPrototypeOf(value)
    descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    throw new TypeError(`${label} must be safely inspectable.`)
  }
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be an ordinary record.`)
  }
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !includes(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const descriptor = descriptors[field]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${field} must be an enumerable own data property.`)
    result[field] = descriptor.value
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function utf8ByteLength(value: string): number {
  return (reflectApply(bufferFrom, BufferConstructor, [value, "utf8"]) as Buffer).byteLength
}

function hasDotSegment(value: string): boolean {
  const parts = reflectApply(stringSplit, value, ["/"]) as string[]
  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index] === "." || parts[index] === "..") return true
  }
  return false
}

function includesText(value: string, expected: string): boolean {
  return reflectApply(stringIncludes, value, [expected]) as boolean
}

function testPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpTest, pattern, [value]) as boolean
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
