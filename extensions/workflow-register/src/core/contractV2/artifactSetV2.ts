import { types as utilTypes } from "node:util"

import { canonicalJsonBytes, canonicalJsonDigest } from "./canonicalJson"
import { cloneAndFreezeJsonValue } from "./jsonValue"
import type { Sha256Digest } from "./providerContract"

export const WORKFLOW_ARTIFACT_SET_V2_SCHEMA_VERSION = "workflow-artifact-set/v2" as const

export interface WorkflowArtifactSetEntryV2 {
  readonly id: string
  readonly path: string
  readonly schema: string
  readonly sha256: Sha256Digest
  readonly bytes: number
  readonly mediaType: string
  readonly producer: string
  readonly producerAttempt: string
  readonly source: "runtime-staged"
  readonly inputDigest: Sha256Digest
  readonly planDigest: Sha256Digest
  readonly verification: "verified"
}

export interface WorkflowArtifactSetV2 {
  readonly schemaVersion: typeof WORKFLOW_ARTIFACT_SET_V2_SCHEMA_VERSION
  readonly workflowId: string
  readonly stepId: string
  readonly attemptId: string
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly inputDigest: Sha256Digest
  readonly entries: readonly WorkflowArtifactSetEntryV2[]
}

export interface WorkflowArtifactSetEvidenceV2 {
  readonly artifactSet: WorkflowArtifactSetV2
  readonly artifactSetDigest: Sha256Digest
  readonly bytes: Uint8Array
}

export interface BuildWorkflowArtifactSetV2Input {
  readonly workflowId: string
  readonly stepId: string
  readonly attemptId: string
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly inputDigest: Sha256Digest
  readonly entries: readonly WorkflowArtifactSetEntryV2[]
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const ATTEMPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const PORTABLE_PATH_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*[:\\])[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u
const MEDIA_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u
const INPUT_FIELDS = objectFreeze([
  "workflowId", "stepId", "attemptId", "planDigest", "packageDigest", "inputDigest", "entries"
] as const)
const ENTRY_FIELDS = objectFreeze([
  "id", "path", "schema", "sha256", "bytes", "mediaType", "producer",
  "producerAttempt", "source", "inputDigest", "planDigest", "verification"
] as const)
const SET_FIELDS = objectFreeze([
  "schemaVersion", "workflowId", "stepId", "attemptId", "planDigest",
  "packageDigest", "inputDigest", "entries"
] as const)

export function buildWorkflowArtifactSetV2(
  input: BuildWorkflowArtifactSetV2Input
): WorkflowArtifactSetEvidenceV2 {
  const snapshot = snapshotExactRecord(input, INPUT_FIELDS, "Workflow artifact-set input")
  const entries = snapshotEntries(snapshot.entries)
  const artifactSet = objectFreeze({
    schemaVersion: WORKFLOW_ARTIFACT_SET_V2_SCHEMA_VERSION,
    workflowId: identifier(snapshot.workflowId, "Workflow artifact-set workflowId"),
    stepId: identifier(snapshot.stepId, "Workflow artifact-set stepId"),
    attemptId: attemptId(snapshot.attemptId),
    planDigest: digest(snapshot.planDigest, "Workflow artifact-set planDigest"),
    packageDigest: digest(snapshot.packageDigest, "Workflow artifact-set packageDigest"),
    inputDigest: digest(snapshot.inputDigest, "Workflow artifact-set inputDigest"),
    entries
  })
  const bytes = canonicalJsonBytes(artifactSet)
  return objectFreeze({
    artifactSet,
    artifactSetDigest: canonicalJsonDigest(artifactSet) as Sha256Digest,
    bytes: new Uint8Array(bytes)
  })
}

export function decodeWorkflowArtifactSetV2(value: unknown): WorkflowArtifactSetV2 {
  const cloned = cloneAndFreezeJsonValue(value)
  const snapshot = snapshotExactRecord(cloned, SET_FIELDS, "Workflow artifact-set")
  if (snapshot.schemaVersion !== WORKFLOW_ARTIFACT_SET_V2_SCHEMA_VERSION) {
    throw new TypeError("Workflow artifact-set schemaVersion is invalid.")
  }
  return buildWorkflowArtifactSetV2({
    workflowId: snapshot.workflowId as string,
    stepId: snapshot.stepId as string,
    attemptId: snapshot.attemptId as string,
    planDigest: snapshot.planDigest as Sha256Digest,
    packageDigest: snapshot.packageDigest as Sha256Digest,
    inputDigest: snapshot.inputDigest as Sha256Digest,
    entries: snapshot.entries as readonly WorkflowArtifactSetEntryV2[]
  }).artifactSet
}

export function workflowArtifactSetV2Digest(value: WorkflowArtifactSetV2): Sha256Digest {
  return canonicalJsonDigest(value) as Sha256Digest
}

function snapshotEntries(value: unknown): readonly WorkflowArtifactSetEntryV2[] {
  if (
    isProxy(value)
    || !arrayIsArray(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
  ) throw new TypeError("Workflow artifact-set entries must be a dense ordinary array.")
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const length = dataValue(descriptors.length, "Workflow artifact-set entries length")
  if (
    typeof length !== "number"
    || !Number.isSafeInteger(length)
    || length < 0
    || length > 128
    || reflectOwnKeys(descriptors).length !== length + 1
  ) throw new TypeError("Workflow artifact-set entries length is invalid.")
  const entries: WorkflowArtifactSetEntryV2[] = []
  let previous = ""
  for (let index = 0; index < length; index += 1) {
    const raw = dataValue(descriptors[String(index)], `Workflow artifact-set entry ${index}`)
    const snapshot = snapshotExactRecord(raw, ENTRY_FIELDS, `Workflow artifact-set entry ${index}`)
    const entry = objectFreeze({
      id: identifier(snapshot.id, `Workflow artifact-set entry ${index}.id`),
      path: portablePath(snapshot.path),
      schema: portablePath(snapshot.schema),
      sha256: digest(snapshot.sha256, `Workflow artifact-set entry ${index}.sha256`),
      bytes: positiveSafeInteger(snapshot.bytes, `Workflow artifact-set entry ${index}.bytes`, 67_108_864),
      mediaType: mediaType(snapshot.mediaType),
      producer: identifier(snapshot.producer, `Workflow artifact-set entry ${index}.producer`),
      producerAttempt: attemptId(snapshot.producerAttempt),
      source: requireLiteral(snapshot.source, "runtime-staged", `Workflow artifact-set entry ${index}.source`),
      inputDigest: digest(snapshot.inputDigest, `Workflow artifact-set entry ${index}.inputDigest`),
      planDigest: digest(snapshot.planDigest, `Workflow artifact-set entry ${index}.planDigest`),
      verification: requireLiteral(snapshot.verification, "verified", `Workflow artifact-set entry ${index}.verification`)
    })
    const key = `${entry.path}\u0000${entry.id}`
    if (index > 0 && previous >= key) {
      throw new TypeError("Workflow artifact-set entries must be sorted and duplicate-free.")
    }
    previous = key
    entries.push(entry)
  }
  return objectFreeze(entries)
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || (objectGetPrototypeOf(value) !== objectPrototype && objectGetPrototypeOf(value) !== null)
  ) throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} has an invalid shape.`)
  const result = Object.create(null) as Record<string, unknown>
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const descriptor = descriptors[field]
    result[field] = dataValue(descriptor, `${label}.${field}`)
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function dataValue(descriptor: PropertyDescriptor | undefined, label: string): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
  ) throw new TypeError(`${label} must be an own data property.`)
  return descriptor.value
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !IDENTIFIER_PATTERN.test(value)) throw new TypeError(`${label} is invalid.`)
  return value
}

function attemptId(value: unknown): string {
  if (
    typeof value !== "string"
    || !ATTEMPT_PATTERN.test(value)
    || /[. ]$/u.test(value)
  ) throw new TypeError("Workflow artifact-set attemptId is invalid.")
  return value
}

function portablePath(value: unknown): string {
  if (typeof value !== "string" || !PORTABLE_PATH_PATTERN.test(value)) {
    throw new TypeError("Workflow artifact-set path is invalid.")
  }
  return value
}

function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) throw new TypeError(`${label} is invalid.`)
  return value as Sha256Digest
}

function mediaType(value: unknown): string {
  if (typeof value !== "string" || !MEDIA_TYPE_PATTERN.test(value)) {
    throw new TypeError("Workflow artifact-set mediaType is invalid.")
  }
  return value
}

function positiveSafeInteger(value: unknown, label: string, maximum: number): number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
    || value > maximum
  ) throw new TypeError(`${label} is invalid.`)
  return value
}

function requireLiteral<const Value extends string>(
  value: unknown,
  expected: Value,
  label: string
): Value {
  if (value !== expected) throw new TypeError(`${label} is invalid.`)
  return expected
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
