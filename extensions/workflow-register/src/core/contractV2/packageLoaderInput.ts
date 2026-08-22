import type { WorkflowPackageFileSystem } from "./packageFileSystem"
import {
  DIGEST_PATTERN,
  IDENTIFIER_PATTERN,
  STAGING_NAME_PATTERN,
  type WorkflowPackageCandidate
} from "./packageLoaderContract"
import {
  addSetValue,
  hasSetValue,
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
  reflectApply,
  SetConstructor,
  stringSlice,
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
  let parsed: unknown
  try {
    parsed = jsonParse(text)
  } catch {
    throw new TypeError(`${label} must contain exactly one valid JSON value.`)
  }
  assertNoDuplicateJsonObjectKeys(text, label)
  return parsed
}

type JsonScanFrame =
  | {
      readonly kind: "object"
      readonly keys: Set<string>
      state: "keyOrEnd" | "colon" | "value" | "commaOrEnd"
    }
  | {
      readonly kind: "array"
      state: "valueOrEnd" | "commaOrEnd"
    }

function assertNoDuplicateJsonObjectKeys(text: string, label: string): void {
  const stack: JsonScanFrame[] = []
  let index = 0
  let rootComplete = false

  const completeValue = (): void => {
    if (stack.length === 0) {
      rootComplete = true
      return
    }
    const parent = stack[stack.length - 1]
    if (parent.kind === "object") {
      if (parent.state !== "value") failJsonScan(label)
      parent.state = "commaOrEnd"
      return
    }
    if (parent.state !== "valueOrEnd") failJsonScan(label)
    parent.state = "commaOrEnd"
  }

  const scanString = (): string => {
    const start = index
    index += 1
    while (index < text.length) {
      const character = text[index]
      if (character === "\\") {
        index += 2
        continue
      }
      index += 1
      if (character === '"') {
        return reflectApply(stringSlice, text, [start, index]) as string
      }
    }
    failJsonScan(label)
  }

  const scanValue = (): void => {
    const character = text[index]
    if (character === "{") {
      index += 1
      stack[stack.length] = {
        kind: "object",
        keys: new SetConstructor<string>(),
        state: "keyOrEnd"
      }
      return
    }
    if (character === "[") {
      index += 1
      stack[stack.length] = { kind: "array", state: "valueOrEnd" }
      return
    }
    if (character === '"') {
      scanString()
      completeValue()
      return
    }
    while (index < text.length && !isJsonValueDelimiter(text[index])) index += 1
    completeValue()
  }

  while (index < text.length) {
    while (index < text.length && isJsonWhitespace(text[index])) index += 1
    if (index >= text.length) break

    if (stack.length === 0) {
      if (rootComplete) failJsonScan(label)
      scanValue()
      continue
    }

    const frame = stack[stack.length - 1]
    if (frame.kind === "object") {
      if (frame.state === "keyOrEnd") {
        if (text[index] === "}") {
          index += 1
          stack.length -= 1
          completeValue()
          continue
        }
        if (text[index] !== '"') failJsonScan(label)
        const token = scanString()
        const key = jsonParse(token) as string
        if (hasSetValue(frame.keys, key)) {
          throw new TypeError(`${label} contains a duplicate JSON object key.`)
        }
        addSetValue(frame.keys, key)
        frame.state = "colon"
        continue
      }
      if (frame.state === "colon") {
        if (text[index] !== ":") failJsonScan(label)
        index += 1
        frame.state = "value"
        continue
      }
      if (frame.state === "value") {
        scanValue()
        continue
      }
      if (text[index] === ",") {
        index += 1
        frame.state = "keyOrEnd"
        continue
      }
      if (text[index] === "}") {
        index += 1
        stack.length -= 1
        completeValue()
        continue
      }
      failJsonScan(label)
    }

    if (frame.state === "valueOrEnd") {
      if (text[index] === "]") {
        index += 1
        stack.length -= 1
        completeValue()
        continue
      }
      scanValue()
      continue
    }
    if (text[index] === ",") {
      index += 1
      frame.state = "valueOrEnd"
      continue
    }
    if (text[index] === "]") {
      index += 1
      stack.length -= 1
      completeValue()
      continue
    }
    failJsonScan(label)
  }

  if (!rootComplete || stack.length !== 0) failJsonScan(label)
}

function isJsonWhitespace(value: string): boolean {
  return value === " " || value === "\t" || value === "\n" || value === "\r"
}

function isJsonValueDelimiter(value: string): boolean {
  return isJsonWhitespace(value) || value === "," || value === "]" || value === "}"
}

function failJsonScan(label: string): never {
  throw new TypeError(`${label} contains invalid JSON structure.`)
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
