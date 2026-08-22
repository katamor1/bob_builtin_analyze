import * as nodeCrypto from "node:crypto"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

const arrayIsArray = Array.isArray
const cloneAndFreezeJsonValueCaptured = cloneAndFreezeJsonValue
const BufferConstructor = Buffer
const bufferFrom = Buffer.from
const createHash = nodeCrypto.createHash
const hashDigest = nodeCrypto.Hash.prototype.digest
const hashUpdate = nodeCrypto.Hash.prototype.update
const jsonStringify = JSON.stringify
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const reflectApply = Reflect.apply

/** Returns compact canonical JSON text with recursively code-unit-sorted keys. */
export function canonicalJsonText(value: unknown): string {
  return serializeJsonValue(cloneAndFreezeJsonValueCaptured(value))
}

/** Returns a fresh UTF-8 buffer containing the canonical JSON text. */
export function canonicalJsonBytes(value: unknown): Buffer {
  return reflectApply(bufferFrom, BufferConstructor, [canonicalJsonText(value), "utf8"]) as Buffer
}

/** Returns the lowercase SHA-256 evidence identifier for the canonical bytes. */
export function canonicalJsonDigest(value: unknown): string {
  const hash = reflectApply(createHash, undefined, ["sha256"]) as nodeCrypto.Hash
  reflectApply(hashUpdate, hash, [canonicalJsonBytes(value)])
  const digest = reflectApply(hashDigest, hash, ["hex"]) as string
  return `sha256:${digest}`
}

function serializeJsonValue(value: JsonValue): string {
  if (value === null) return "null"
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false"
    case "number":
    case "string":
      return stringifyPrimitive(value)
    case "object":
      return arrayIsArray(value)
        ? serializeArray(value as readonly JsonValue[])
        : serializeObject(value as { readonly [key: string]: JsonValue })
  }
}

function serializeArray(value: readonly JsonValue[]): string {
  let serialized = "["
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) serialized += ","
    serialized += serializeJsonValue(readOwnValue<JsonValue>(value, indexAsKey(index)))
  }
  return `${serialized}]`
}

function serializeObject(value: { readonly [key: string]: JsonValue }): string {
  const keys = objectKeys(value)
  sortStringsByCodeUnit(keys)
  let serialized = "{"
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) serialized += ","
    const key = keys[index]
    serialized += `${stringifyPrimitive(key)}:${serializeJsonValue(readOwnValue(value, key))}`
  }
  return `${serialized}}`
}

function readOwnValue<T>(record: object, key: PropertyKey): T {
  const descriptor = objectGetOwnPropertyDescriptor(record, key)
  if (descriptor === undefined || !objectHasOwn(descriptor, "value")) {
    throw new TypeError("Canonical JSON clone contains an invalid property descriptor.")
  }
  return descriptor.value as T
}

function stringifyPrimitive(value: string | number): string {
  const serialized = jsonStringify(value)
  if (serialized === undefined) {
    throw new TypeError("Canonical JSON primitive serialization failed.")
  }
  return serialized
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

function indexAsKey(index: number): string {
  const serialized = jsonStringify(index)
  if (serialized === undefined) throw new TypeError("Canonical JSON array index serialization failed.")
  return serialized
}
