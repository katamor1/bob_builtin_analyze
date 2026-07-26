import { types as utilTypes } from "node:util"

import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

interface PreflightEntry {
  readonly value: unknown
  readonly depth: number
  readonly leave: boolean
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const bufferByteLength = Buffer.byteLength.bind(Buffer) as (
  value: string,
  encoding?: BufferEncoding
) => number
const cloneJsonValue = cloneAndFreezeJsonValue
const numberIsFinite = Number.isFinite
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectDefineProperty = Object.defineProperty
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectIs = Object.is
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const weakSetAdd = WeakSet.prototype.add
const weakSetDelete = WeakSet.prototype.delete
const weakSetHas = WeakSet.prototype.has
const WeakSetConstructor = WeakSet

const MAX_ENVELOPE_NODES = 65_536
const MAX_ENVELOPE_DEPTH = 64
const MAX_ENVELOPE_ARRAY_ITEMS = 65_536
const MAX_ENVELOPE_OBJECT_PROPERTIES = 1_024

export function snapshotBoundedWorkflowProviderEnvelope(
  value: unknown,
  maximumTextBytes: number
): JsonValue | undefined {
  if (
    typeof maximumTextBytes !== "number"
    || !numberIsSafeInteger(maximumTextBytes)
    || maximumTextBytes < 1
  ) return undefined

  try {
    preflightEnvelopeBounds(value, maximumTextBytes)
    return cloneJsonValue(value)
  } catch {
    return undefined
  }
}

function preflightEnvelopeBounds(root: unknown, maximumTextBytes: number): void {
  const stack: PreflightEntry[] = []
  const active = new WeakSetConstructor<object>()
  defineArrayItem(stack, 0, objectFreeze({ value: root, depth: 1, leave: false }))
  let nodes = 0
  let textBytes = 0

  while (stack.length > 0) {
    const entry = stack[stack.length - 1]
    stack.length -= 1
    if (entry.leave) {
      if (entry.value !== null && typeof entry.value === "object") {
        reflectApply(weakSetDelete, active, [entry.value])
      }
      continue
    }

    nodes += 1
    if (nodes > MAX_ENVELOPE_NODES || entry.depth > MAX_ENVELOPE_DEPTH) fail()
    const value = entry.value
    if (value === null || typeof value === "boolean") continue
    if (typeof value === "string") {
      textBytes += bufferByteLength(value, "utf8")
      if (textBytes > maximumTextBytes) fail()
      continue
    }
    if (typeof value === "number") {
      if (!numberIsFinite(value) || objectIs(value, -0)) fail()
      continue
    }
    if (typeof value !== "object" || isProxy(value)) fail()
    if (reflectApply(weakSetHas, active, [value]) as boolean) fail()

    const array = arrayIsArray(value)
    const prototype = objectGetPrototypeOf(value)
    if (
      (array && prototype !== arrayPrototype)
      || (!array && prototype !== objectPrototype && prototype !== null)
    ) fail()

    let expectedEntries: number
    if (array) {
      const lengthDescriptor = objectGetOwnPropertyDescriptor(value, "length")
      const length = descriptorDataValue(lengthDescriptor)
      if (
        typeof length !== "number"
        || !numberIsSafeInteger(length)
        || length < 0
        || length > MAX_ENVELOPE_ARRAY_ITEMS
        || nodes + length > MAX_ENVELOPE_NODES
      ) fail()
      expectedEntries = length + 1
    } else {
      expectedEntries = -1
    }

    const sourceKeys = reflectOwnKeys(value)
    if (
      (array && sourceKeys.length !== expectedEntries)
      || (!array && sourceKeys.length > MAX_ENVELOPE_OBJECT_PROPERTIES)
      || (!array && nodes + sourceKeys.length > MAX_ENVELOPE_NODES)
    ) fail()
    if (!array) {
      for (let index = 0; index < sourceKeys.length; index += 1) {
        const key = sourceKeys[index]
        if (typeof key !== "string") fail()
        textBytes += bufferByteLength(key, "utf8")
        if (textBytes > maximumTextBytes) fail()
      }
    }

    const descriptors = objectGetOwnPropertyDescriptors(value)
    const keys = reflectOwnKeys(descriptors)
    if (keys.length !== sourceKeys.length) fail()
    reflectApply(weakSetAdd, active, [value])
    defineArrayItem(stack, stack.length, objectFreeze({
      value,
      depth: entry.depth,
      leave: true
    }))

    if (array) {
      const length = descriptorDataValue(descriptorSnapshotValue(descriptors, "length")) as number
      for (let index = length - 1; index >= 0; index -= 1) {
        const descriptor = descriptorSnapshotValue(descriptors, numberAsString(index))
        if (descriptor.enumerable !== true) fail()
        defineArrayItem(stack, stack.length, objectFreeze({
          value: descriptorDataValue(descriptor),
          depth: entry.depth + 1,
          leave: false
        }))
      }
      continue
    }

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]
      if (typeof key !== "string") fail()
      const descriptor = descriptorSnapshotValue(descriptors, key)
      if (descriptor.enumerable !== true) fail()
      defineArrayItem(stack, stack.length, objectFreeze({
        value: descriptorDataValue(descriptor),
        depth: entry.depth + 1,
        leave: false
      }))
    }
  }
}

function descriptorSnapshotValue(
  descriptors: PropertyDescriptorMap,
  key: PropertyKey
): PropertyDescriptor {
  const mapDescriptor = objectGetOwnPropertyDescriptor(descriptors, key)
  if (mapDescriptor === undefined || !objectHasOwn(mapDescriptor, "value")) fail()
  return mapDescriptor.value as PropertyDescriptor
}

function descriptorDataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
  ) fail()
  return descriptor.value
}

function defineArrayItem<T>(array: T[], index: number, value: T): void {
  objectDefineProperty(array, numberAsString(index), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function fail(): never {
  throw new TypeError("Workflow provider envelope exceeds its structural budget.")
}
