import { createHash } from "node:crypto"
import { types as utilTypes } from "node:util"

export const CANONICAL_JSON_V1_VERSION = "workflow-register/canonical-json/v1" as const

type CanonicalJsonNode = null | boolean | number | string | CanonicalJsonArrayNode | CanonicalJsonObjectNode

interface CanonicalJsonArrayNode {
  kind: "array"
  items: CanonicalJsonNode[]
}

interface CanonicalJsonObjectNode {
  kind: "object"
  entries: Array<readonly [string, CanonicalJsonNode]>
}

export function canonicalizeJsonV1(value: unknown): Buffer {
  const node = validateCanonicalJson(value, "$", new WeakSet<object>())
  return Buffer.from(`${serializeCanonicalJson(node)}\n`, "utf8")
}

export function hashCanonicalJsonV1(value: unknown): string {
  const digest = createHash("sha256").update(canonicalizeJsonV1(value)).digest("hex")
  return `sha256:${digest}`
}

function validateCanonicalJson(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>
): CanonicalJsonNode {
  if (utilTypes.isProxy(value)) fail(path, "Proxy values are not supported")
  if (value === null) return null

  switch (typeof value) {
    case "boolean":
    case "string":
      return value
    case "number":
      if (!Number.isFinite(value)) fail(path, "numbers must be finite")
      return value
    case "undefined":
      fail(path, "undefined is supported only as an omitted object property")
    case "bigint":
    case "function":
    case "symbol":
      fail(path, `${typeof value} values are not supported`)
    case "object":
      return validateCanonicalContainer(value, path, ancestors)
  }
  return fail(path, "value type is not supported")
}

function validateCanonicalContainer(
  value: object,
  path: string,
  ancestors: WeakSet<object>
): CanonicalJsonArrayNode | CanonicalJsonObjectNode {
  if (ancestors.has(value)) fail(path, "cyclic values are not supported")

  const array = Array.isArray(value)
  const prototype = Object.getPrototypeOf(value)
  if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) {
    fail(path, "custom prototypes are not supported")
  }
  rejectInheritedToJson(path, array, prototype)

  const descriptors = Object.getOwnPropertyDescriptors(value)
  rejectUnsafeDescriptors(descriptors, path, array)

  ancestors.add(value)
  try {
    return array
      ? validateCanonicalArray(descriptors, path, ancestors)
      : validateCanonicalObject(descriptors, path, ancestors)
  } finally {
    ancestors.delete(value)
  }
}

function rejectInheritedToJson(path: string, array: boolean, prototype: object | null): void {
  const prototypes = array
    ? [Array.prototype, Object.prototype]
    : prototype === Object.prototype ? [Object.prototype] : []
  for (const candidate of prototypes) {
    if (Object.getOwnPropertyDescriptor(candidate, "toJSON") !== undefined) {
      fail(propertyPath(path, "toJSON"), "inherited toJSON properties are not supported")
    }
  }
}

function rejectUnsafeDescriptors(
  descriptors: PropertyDescriptorMap,
  path: string,
  array: boolean
): void {
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key === "symbol") fail(path, "symbol properties are not supported")
    const descriptor = descriptors[key]
    if (!descriptor) fail(path, `property ${quoted(key)} has no descriptor`)
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      fail(propertyPath(path, key), "accessor properties are not supported")
    }
    if (key === "toJSON") fail(propertyPath(path, key), "toJSON properties are not supported")
    if (!array && descriptor.enumerable === false) {
      fail(propertyPath(path, key), "non-enumerable properties are not supported")
    }
  }
}

function validateCanonicalArray(
  descriptors: PropertyDescriptorMap,
  path: string,
  ancestors: WeakSet<object>
): CanonicalJsonArrayNode {
  const lengthDescriptor = descriptors.length
  const length = lengthDescriptor?.value
  if (!Number.isSafeInteger(length) || length < 0) fail(path, "array length is invalid")

  for (const key of Object.keys(descriptors)) {
    if (key === "length") continue
    const index = canonicalArrayIndex(key)
    if (index === undefined || index >= length) {
      fail(propertyPath(path, key), "non-index array properties are not supported")
    }
  }

  const items: CanonicalJsonNode[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (!descriptor) fail(`${path}[${index}]`, "sparse arrays are not supported")
    if (descriptor.value === undefined) fail(`${path}[${index}]`, "undefined array entries are not supported")
    items.push(validateCanonicalJson(descriptor.value, `${path}[${index}]`, ancestors))
  }
  return { kind: "array", items }
}

function validateCanonicalObject(
  descriptors: PropertyDescriptorMap,
  path: string,
  ancestors: WeakSet<object>
): CanonicalJsonObjectNode {
  const keys = Object.keys(descriptors).sort()
  const entries: Array<readonly [string, CanonicalJsonNode]> = []
  for (const key of keys) {
    const descriptor = descriptors[key]
    if (!descriptor) fail(path, `property ${quoted(key)} has no descriptor`)
    if (descriptor.value === undefined) continue
    entries.push([
      key,
      validateCanonicalJson(descriptor.value, propertyPath(path, key), ancestors)
    ])
  }
  return { kind: "object", entries }
}

function serializeCanonicalJson(node: CanonicalJsonNode): string {
  if (node === null || typeof node !== "object") {
    const serialized = JSON.stringify(node)
    if (serialized === undefined) throw new Error("Canonical JSON serialization failed after validation.")
    return serialized
  }
  if (node.kind === "array") {
    return `[${node.items.map(serializeCanonicalJson).join(",")}]`
  }
  return `{${node.entries
    .map(([key, value]) => `${JSON.stringify(key)}:${serializeCanonicalJson(value)}`)
    .join(",")}}`
}

function canonicalArrayIndex(key: string): number | undefined {
  if (!/^(0|[1-9]\d*)$/.test(key)) return undefined
  const index = Number(key)
  return Number.isSafeInteger(index) ? index : undefined
}

function propertyPath(path: string, key: string): string {
  return `${path}[${JSON.stringify(key)}]`
}

function quoted(value: string): string {
  return JSON.stringify(value)
}

function fail(path: string, message: string): never {
  throw new Error(`Value at ${path} is not valid canonical JSON: ${message}.`)
}
