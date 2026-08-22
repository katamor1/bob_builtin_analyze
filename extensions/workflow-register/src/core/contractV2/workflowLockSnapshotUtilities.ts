import * as nodeCrypto from "node:crypto"
import { types as utilTypes } from "node:util"

import type { JsonObject, JsonValue } from "./jsonValue"
import type { Sha256Digest } from "./providerContract"

export class WorkflowLockRawPackageEvidenceError extends Error {
  constructor() {
    super("Workflow package raw evidence is inconsistent.")
    this.name = "WorkflowLockRawPackageEvidenceError"
  }
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const arraySort = Array.prototype.sort
const createHash = nodeCrypto.createHash
const hashDigest = nodeCrypto.Hash.prototype.digest
const hashUpdate = nodeCrypto.Hash.prototype.update
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectCreate = Object.create
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpTest = RegExp.prototype.test
const stringSlice = String.prototype.slice
const typedArrayPrototype = objectGetPrototypeOf(Uint8Array.prototype)
const typedArrayByteLength = objectGetOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get as (
  this: ArrayBufferView
) => number
const typedArrayName = objectGetOwnPropertyDescriptor(typedArrayPrototype, Symbol.toStringTag)?.get as (
  this: ArrayBufferView
) => string
const typedArraySet = Uint8Array.prototype.set
const Uint8ArrayConstructor = Uint8Array

export const freezeWorkflowLockEvidence = Object.freeze
export const workflowLockNumberIsSafeInteger = numberIsSafeInteger
export const workflowLockBufferByteLength = Buffer.byteLength.bind(Buffer) as (
  value: string,
  encoding?: BufferEncoding
) => number

export function snapshotExactWorkflowLockRecord(
  value: unknown,
  fields: readonly string[],
  label: string
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
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
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !workflowLockIncludes(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = descriptors[fields[index]]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${fields[index]} must be an enumerable own data property.`)
    result[fields[index]] = descriptor.value
  }
  return result
}

export function snapshotDenseWorkflowLockArray(
  value: unknown,
  maximum: number,
  label: string
): unknown[] {
  if (!arrayIsArray(value) || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a dense ordinary array.`)
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = objectGetPrototypeOf(value)
    descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    throw new TypeError(`${label} must be safely inspectable.`)
  }
  const length = descriptors.length?.value
  if (
    prototype !== arrayPrototype
    || typeof length !== "number"
    || !numberIsSafeInteger(length)
    || length < 0
    || length > maximum
  ) throw new TypeError(`${label} has an invalid length.`)
  if (reflectOwnKeys(descriptors).length !== length + 1) {
    throw new TypeError(`${label} must be dense and contain no extra properties.`)
  }
  const result: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[workflowLockIndexKey(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label} must be dense and contain only data items.`)
    workflowLockPush(result, descriptor.value)
  }
  return result
}

export function exactWorkflowLockJsonRecord(
  value: JsonValue,
  fields: readonly string[],
  label: string
): JsonObject {
  if (value === null || typeof value !== "object" || arrayIsArray(value)) {
    throw new TypeError(`${label} must be a record.`)
  }
  const keys = objectKeys(value)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  for (let index = 0; index < keys.length; index += 1) {
    if (!workflowLockIncludes(fields, keys[index])) throw new TypeError(`${label} contains an unknown field.`)
  }
  return value as JsonObject
}

export function normalizeWorkflowLockStringArray(
  value: JsonValue,
  maximum: number,
  label: string
): readonly string[] {
  if (!arrayIsArray(value) || value.length > maximum) throw new TypeError(`${label} is invalid.`)
  const result: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    if (typeof value[index] !== "string") throw new TypeError(`${label} contains a non-string value.`)
    workflowLockPush(result, value[index] as string)
  }
  workflowLockSort(result, compareWorkflowLockText)
  for (let index = 1; index < result.length; index += 1) {
    if (result[index - 1] === result[index]) throw new TypeError(`${label} contains a duplicate value.`)
  }
  return freezeWorkflowLockEvidence(result)
}

export function snapshotWorkflowLockBytes(value: unknown, maximum: number): Uint8Array {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError("Workflow raw package file bytes must be a Uint8Array.")
  }
  let length: number
  let name: string
  try {
    length = reflectApply(typedArrayByteLength, value, []) as number
    name = reflectApply(typedArrayName, value, []) as string
  } catch {
    throw new TypeError("Workflow raw package file bytes must be a Uint8Array.")
  }
  if (name !== "Uint8Array" || length < 1 || length > maximum) {
    throw new WorkflowLockRawPackageEvidenceError()
  }
  const copy = new Uint8ArrayConstructor(length)
  try {
    reflectApply(typedArraySet, copy, [value])
  } catch {
    throw new WorkflowLockRawPackageEvidenceError()
  }
  return copy
}

export function workflowLockDigestBytes(bytes: Uint8Array): Sha256Digest {
  const hash = reflectApply(createHash, undefined, ["sha256"]) as nodeCrypto.Hash
  reflectApply(hashUpdate, hash, [bytes])
  const value = reflectApply(hashDigest, hash, ["hex"]) as string
  return `sha256:${value}` as Sha256Digest
}

export function workflowLockPush<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}

export function workflowLockSort<T>(
  values: T[],
  compare: (left: T, right: T) => number
): void {
  reflectApply(arraySort, values, [compare])
}

export function workflowLockStringSlice(value: string, start: number, end?: number): string {
  return reflectApply(stringSlice, value, end === undefined ? [start] : [start, end]) as string
}

function workflowLockIndexKey(index: number): string {
  return reflectApply(numberToString, index, []) as string
}

export function compareWorkflowLockText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function workflowLockIncludes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

export function testWorkflowLockPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpTest, pattern, [value]) as boolean
}
