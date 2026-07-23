import type { WorkflowPackageFileSystem } from "./packageFileSystem"
import {
  DIGEST_PATTERN,
  IDENTIFIER_PATTERN,
  STAGING_NAME_PATTERN,
  type WorkflowPackageCandidate
} from "./packageLoaderContract"
import {
  isProxy,
  jsonParse,
  objectCreate,
  objectFreeze,
  objectGetOwnPropertyDescriptor,
  objectGetOwnPropertyDescriptors,
  objectGetPrototypeOf,
  objectHasOwn,
  objectPrototype,
  reflectOwnKeys,
  testPattern,
  textDecoder
} from "./packageLoaderIntrinsics"
import type { Sha256Digest } from "./providerContract"

const REQUIRED_CANDIDATE_FIELDS = objectFreeze(["kind"] as const)
const OPTIONAL_CANDIDATE_FIELDS = objectFreeze(["generation", "name", "ownershipToken"] as const)
const PUBLISHED_CANDIDATE_FIELDS = objectFreeze(["kind", "generation"] as const)
const STAGING_CANDIDATE_FIELDS = objectFreeze(["kind", "name", "ownershipToken"] as const)
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u

export function snapshotCandidate(value: unknown): WorkflowPackageCandidate {
  const base = snapshotRecord(
    value,
    REQUIRED_CANDIDATE_FIELDS,
    OPTIONAL_CANDIDATE_FIELDS,
    "Workflow package candidate"
  )
  if (base.kind === "published") {
    assertExactFields(value, PUBLISHED_CANDIDATE_FIELDS, "Published workflow package candidate")
    return objectFreeze({
      kind: "published" as const,
      generation: stringValue(base.generation, "Published workflow package candidate.generation")
    })
  }
  if (base.kind === "owned-staging") {
    assertExactFields(value, STAGING_CANDIDATE_FIELDS, "Owned staging workflow package candidate")
    return objectFreeze({
      kind: "owned-staging" as const,
      name: stringValue(base.name, "Owned staging workflow package candidate.name"),
      ownershipToken: stringValue(
        base.ownershipToken,
        "Owned staging workflow package candidate.ownershipToken"
      )
    })
  }
  throw new TypeError("Workflow package candidate.kind is invalid.")
}

export function snapshotRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a non-proxy ordinary record.`)
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = objectGetPrototypeOf(value)
    descriptors = objectGetOwnPropertyDescriptors(value)
  } catch {
    throw new TypeError(`${label} must be safely inspectable.`)
  }
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be a non-proxy ordinary record.`)
  }

  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < required.length; index += 1) {
    copyField(descriptors, result, required[index], label, true)
  }
  for (let index = 0; index < optional.length; index += 1) {
    copyField(descriptors, result, optional[index], label, false)
  }
  const keys = reflectOwnKeys(descriptors)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!includes(required, key) && !includes(optional, key))
    ) throw new TypeError(`${label} contains an unknown field.`)
  }
  return result
}

export function fileSystemValue(value: unknown): WorkflowPackageFileSystem<unknown> {
  if (
    (typeof value !== "object" && typeof value !== "function")
    || value === null
    || isProxy(value)
  ) throw new TypeError("Workflow package file system is invalid.")
  return value as WorkflowPackageFileSystem<unknown>
}

export function identifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || !testPattern(IDENTIFIER_PATTERN, value)
  ) throw new TypeError(`${label} is invalid.`)
  return value
}

export function digest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !testPattern(DIGEST_PATTERN, value)) {
    throw new TypeError(`${label} is not a canonical sha256 digest.`)
  }
  return value as Sha256Digest
}

export function stagingName(value: unknown): string {
  if (typeof value !== "string" || !testPattern(STAGING_NAME_PATTERN, value)) {
    throw new TypeError("Workflow package staging name is invalid.")
  }
  return value
}

export function ownershipToken(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 256
    || testPattern(CONTROL_PATTERN, value)
  ) throw new TypeError("Workflow package staging ownership token is invalid.")
  return value
}

export function parseStrictJson(bytes: Uint8Array, label: string): unknown {
  if (
    bytes.byteLength >= 3
    && bytes[0] === 0xef
    && bytes[1] === 0xbb
    && bytes[2] === 0xbf
  ) throw new TypeError(`${label} must not contain a UTF-8 BOM.`)

  let text: string
  try {
    text = textDecoder.decode(bytes)
  } catch {
    throw new TypeError(`${label} must be valid UTF-8 JSON.`)
  }
  try {
    return jsonParse(text)
  } catch {
    throw new TypeError(`${label} must contain exactly one valid JSON value.`)
  }
}

function assertExactFields(value: unknown, fields: readonly string[], label: string): void {
  snapshotRecord(value, fields, [], label)
}

function copyField(
  descriptors: PropertyDescriptorMap,
  result: Record<string, unknown>,
  name: string,
  label: string,
  required: boolean
): void {
  const property = objectGetOwnPropertyDescriptor(descriptors, name)
  const descriptor = property !== undefined && objectHasOwn(property, "value")
    ? property.value as PropertyDescriptor
    : undefined
  if (descriptor === undefined) {
    if (required) throw new TypeError(`${label}.${name} is required.`)
    return
  }
  if (!objectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
    throw new TypeError(`${label}.${name} must be an enumerable own data property.`)
  }
  result[name] = descriptor.value
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string.`)
  return value
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
