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
  if (array) rejectCallableOrAccessorToJson(Array.prototype, path)
  if (prototype === Object.prototype || array) rejectCallableOrAccessorToJson(Object.prototype, path)
}

function rejectCallableOrAccessorToJson(prototype: object, path: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "toJSON")
  if (descriptor === undefined) return
  if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) {
    fail(propertyPath(path, "toJSON"), "inherited accessor toJSON properties are not supported")
  }
  if (typeof ownDataDescriptorValue(descriptor, path) === "function") {
    fail(propertyPath(path, "toJSON"), "inherited callable toJSON properties are not supported")
  }
}

function rejectUnsafeDescriptors(
  descriptors: PropertyDescriptorMap,
  path: string,
  array: boolean
): void {
  const keys = Reflect.ownKeys(descriptors)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key === "symbol") fail(path, "symbol properties are not supported")
    const descriptor = ownPropertyValue<PropertyDescriptor>(descriptors, key)
    if (!descriptor) fail(path, `property ${quoted(key)} has no descriptor`)
    if (Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")) {
      fail(propertyPath(path, key), "accessor properties are not supported")
    }
    if (!array && ownPropertyValue<boolean>(descriptor, "enumerable") === false) {
      fail(propertyPath(path, key), "non-enumerable properties are not supported")
    }
  }
}

function validateCanonicalArray(
  descriptors: PropertyDescriptorMap,
  path: string,
  ancestors: WeakSet<object>
): CanonicalJsonArrayNode {
  const lengthDescriptor = ownPropertyValue<PropertyDescriptor>(descriptors, "length")
  const lengthValue = lengthDescriptor === undefined ? undefined : ownDataDescriptorValue(lengthDescriptor, path)
  if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
    fail(path, "array length is invalid")
  }
  const length = lengthValue

  const keys = Object.keys(descriptors)
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]
    if (key === "length") continue
    const index = canonicalArrayIndex(key)
    if (index === undefined || index >= length) {
      fail(propertyPath(path, key), "non-index array properties are not supported")
    }
  }

  const items: CanonicalJsonNode[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = ownPropertyValue<PropertyDescriptor>(descriptors, String(index))
    if (!descriptor) fail(`${path}[${index}]`, "sparse arrays are not supported")
    const item = ownDataDescriptorValue(descriptor, `${path}[${index}]`)
    if (item === undefined) fail(`${path}[${index}]`, "undefined array entries are not supported")
    appendArrayValue(items, validateCanonicalJson(item, `${path}[${index}]`, ancestors))
  }
  return { kind: "array", items }
}

function validateCanonicalObject(
  descriptors: PropertyDescriptorMap,
  path: string,
  ancestors: WeakSet<object>
): CanonicalJsonObjectNode {
  const keys = Object.keys(descriptors)
  sortStringsByCodeUnit(keys)
  const entries: Array<readonly [string, CanonicalJsonNode]> = []
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    const descriptor = ownPropertyValue<PropertyDescriptor>(descriptors, key)
    if (!descriptor) fail(path, `property ${quoted(key)} has no descriptor`)
    const propertyValue = ownDataDescriptorValue(descriptor, propertyPath(path, key))
    if (propertyValue === undefined) continue
    appendArrayValue(entries, [
      key,
      validateCanonicalJson(propertyValue, propertyPath(path, key), ancestors)
    ])
  }
  return { kind: "object", entries }
}

function sortStringsByCodeUnit(values: string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && values[insertion - 1] > value) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

function serializeCanonicalJson(node: CanonicalJsonNode): string {
  if (node === null || typeof node !== "object") {
    const serialized = JSON.stringify(node)
    if (serialized === undefined) throw new Error("Canonical JSON serialization failed after validation.")
    return serialized
  }
  if (node.kind === "array") {
    let serialized = "["
    for (let index = 0; index < node.items.length; index += 1) {
      if (index > 0) serialized += ","
      serialized += serializeCanonicalJson(node.items[index])
    }
    return `${serialized}]`
  }
  let serialized = "{"
  for (let index = 0; index < node.entries.length; index += 1) {
    if (index > 0) serialized += ","
    const entry = node.entries[index]
    serialized += `${JSON.stringify(entry[0])}:${serializeCanonicalJson(entry[1])}`
  }
  return `${serialized}}`
}

function ownDataDescriptorValue(descriptor: PropertyDescriptor, path: string): unknown {
  if (!Object.hasOwn(descriptor, "value")) fail(path, "property has no data value")
  return ownPropertyValue(descriptor, "value")
}

function ownPropertyValue<T>(record: object, key: PropertyKey): T | undefined {
  if (!Object.hasOwn(record, key)) return undefined
  return (record as Record<PropertyKey, T>)[key]
}

function appendArrayValue<T>(values: T[], value: T): void {
  const descriptor = Object.create(null) as PropertyDescriptor
  descriptor.configurable = true
  descriptor.enumerable = true
  descriptor.value = value
  descriptor.writable = true
  Object.defineProperty(values, String(values.length), descriptor)
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
