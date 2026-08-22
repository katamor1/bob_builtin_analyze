import { types as utilTypes } from "node:util"

export type JsonPrimitive = null | boolean | number | string

export interface JsonObject {
  readonly [key: string]: JsonValue
}

export type JsonValue = JsonPrimitive | readonly JsonValue[] | JsonObject

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const objectCreate = Object.create
const objectDefineProperty = Object.defineProperty
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectIs = Object.is
const numberIsFinite = Number.isFinite
const numberIsSafeInteger = Number.isSafeInteger
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const stringCharCodeAt = String.prototype.charCodeAt
const stringFromCharCode = String.fromCharCode
const numberToString = Number.prototype.toString
const weakSetAdd = WeakSet.prototype.add
const weakSetDelete = WeakSet.prototype.delete
const weakSetHas = WeakSet.prototype.has
const WeakSetConstructor = WeakSet
const ordinaryObjectPrototype = Object.prototype
const ordinaryArrayPrototype = Array.prototype

/**
 * Validates an unknown value as strict, unambiguous JSON and returns a detached,
 * recursively frozen clone. Validation reads containers only through one native
 * descriptor snapshot, so getters and subsequent live reads cannot affect the
 * accepted value.
 */
export function cloneAndFreezeJsonValue(value: unknown): JsonValue {
  return cloneJsonValue(value, "$", new WeakSetConstructor<object>())
}

function cloneJsonValue(value: unknown, path: string, ancestors: WeakSet<object>): JsonValue {
  if (isProxy(value)) fail(path, "Proxy values are not supported")
  if (value === null) return null

  switch (typeof value) {
    case "boolean":
      return value
    case "string":
      assertWellFormedUnicode(value, path)
      return value
    case "number":
      if (!numberIsFinite(value)) fail(path, "numbers must be finite")
      if (objectIs(value, -0)) fail(path, "negative zero is not supported")
      return value
    case "undefined":
      return fail(path, "undefined values are not supported")
    case "bigint":
    case "function":
    case "symbol":
      return fail(path, `${typeof value} values are not supported`)
    case "object":
      return cloneContainer(value, path, ancestors)
  }

  return fail(path, "the value type is not supported")
}

function cloneContainer(value: object, path: string, ancestors: WeakSet<object>): JsonValue {
  if (callWeakSetHas(ancestors, value)) fail(path, "cyclic values are not supported")

  const array = arrayIsArray(value)
  const prototype = objectGetPrototypeOf(value)
  if (array) {
    if (prototype !== ordinaryArrayPrototype) {
      fail(path, "arrays must use the ordinary Array prototype")
    }
  } else if (prototype !== ordinaryObjectPrototype && prototype !== null) {
    fail(path, "objects must use Object.prototype or a null prototype")
  }

  const descriptors = objectGetOwnPropertyDescriptors(value)
  callWeakSetAdd(ancestors, value)
  try {
    return array
      ? cloneArray(descriptors, path, ancestors)
      : cloneObject(descriptors, path, ancestors)
  } finally {
    callWeakSetDelete(ancestors, value)
  }
}

function cloneObject(
  descriptors: PropertyDescriptorMap,
  path: string,
  ancestors: WeakSet<object>
): JsonObject {
  const ownKeys = reflectOwnKeys(descriptors)
  const keys: string[] = []

  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index]
    if (typeof key === "symbol") fail(path, "symbol properties are not supported")
    const keyPath = propertyPath(path, key)
    assertWellFormedUnicode(key, keyPath)
    const descriptor = descriptorMapValue(descriptors, key, path)
    assertDataDescriptor(descriptor, keyPath)
    if (descriptorField<boolean>(descriptor, "enumerable", keyPath) !== true) {
      fail(keyPath, "non-enumerable properties are not supported")
    }
    defineArrayItem(keys, keys.length, key)
  }

  sortStringsByCodeUnit(keys)
  const clone = objectCreate(null) as Record<string, JsonValue>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    const keyPath = propertyPath(path, key)
    const descriptor = descriptorMapValue(descriptors, key, path)
    const propertyValue = descriptorDataValue(descriptor, keyPath)
    objectDefineProperty(clone, key, {
      configurable: false,
      enumerable: true,
      value: cloneJsonValue(propertyValue, keyPath, ancestors),
      writable: false
    })
  }
  return objectFreeze(clone)
}

function cloneArray(
  descriptors: PropertyDescriptorMap,
  path: string,
  ancestors: WeakSet<object>
): readonly JsonValue[] {
  const lengthDescriptor = descriptorMapValue(descriptors, "length", path)
  assertDataDescriptor(lengthDescriptor, path)
  const lengthValue = descriptorDataValue(lengthDescriptor, path)
  if (typeof lengthValue !== "number" || !numberIsSafeInteger(lengthValue) || lengthValue < 0) {
    fail(path, "array length is invalid")
  }
  const length = lengthValue
  const ownKeys = reflectOwnKeys(descriptors)
  let indexPropertyCount = 0

  for (let keyIndex = 0; keyIndex < ownKeys.length; keyIndex += 1) {
    const key = ownKeys[keyIndex]
    if (typeof key === "symbol") fail(path, "symbol properties are not supported")
    if (key === "length") continue
    const keyPath = propertyPath(path, key)
    assertWellFormedUnicode(key, keyPath)
    const arrayIndex = canonicalArrayIndex(key)
    if (arrayIndex === undefined || arrayIndex >= length) {
      fail(keyPath, "non-index array properties are not supported")
    }
    const descriptor = descriptorMapValue(descriptors, key, path)
    assertDataDescriptor(descriptor, keyPath)
    if (descriptorField<boolean>(descriptor, "enumerable", keyPath) !== true) {
      fail(keyPath, "non-enumerable properties are not supported")
    }
    indexPropertyCount += 1
  }

  if (indexPropertyCount !== length) fail(path, "sparse arrays are not supported")

  const clone: JsonValue[] = []
  for (let index = 0; index < length; index += 1) {
    const key = numberAsString(index)
    const itemPath = `${path}[${key}]`
    const descriptor = descriptorMapValueOrUndefined(descriptors, key)
    if (descriptor === undefined) fail(itemPath, "sparse arrays are not supported")
    const itemValue = descriptorDataValue(descriptor, itemPath)
    defineArrayItem(clone, index, cloneJsonValue(itemValue, itemPath, ancestors))
  }
  return objectFreeze(clone)
}

function descriptorMapValue(
  descriptors: PropertyDescriptorMap,
  key: PropertyKey,
  path: string
): PropertyDescriptor {
  const descriptor = descriptorMapValueOrUndefined(descriptors, key)
  if (descriptor === undefined) fail(path, "a property descriptor is missing")
  return descriptor
}

function descriptorMapValueOrUndefined(
  descriptors: PropertyDescriptorMap,
  key: PropertyKey
): PropertyDescriptor | undefined {
  const mapProperty = objectGetOwnPropertyDescriptor(descriptors, key)
  if (mapProperty === undefined || !objectHasOwn(mapProperty, "value")) return undefined
  return descriptorField<PropertyDescriptor>(mapProperty, "value", "$")
}

function assertDataDescriptor(descriptor: PropertyDescriptor, path: string): void {
  if (objectHasOwn(descriptor, "get") || objectHasOwn(descriptor, "set")) {
    fail(path, "accessor properties are not supported")
  }
  if (!objectHasOwn(descriptor, "value")) fail(path, "properties must have data values")
}

function descriptorDataValue(descriptor: PropertyDescriptor, path: string): unknown {
  if (!objectHasOwn(descriptor, "value")) fail(path, "properties must have data values")
  return descriptorField<unknown>(descriptor, "value", path)
}

function descriptorField<T>(descriptor: object, key: PropertyKey, path: string): T {
  const fieldDescriptor = objectGetOwnPropertyDescriptor(descriptor, key)
  if (fieldDescriptor === undefined || !objectHasOwn(fieldDescriptor, "value")) {
    fail(path, "a descriptor field is missing")
  }
  return fieldDescriptor.value as T
}

function defineArrayItem<T>(array: T[], index: number, value: T): void {
  objectDefineProperty(array, numberAsString(index), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function canonicalArrayIndex(key: string): number | undefined {
  if (key.length === 0) return undefined
  if (key === "0") return 0
  const first = callCharCodeAt(key, 0)
  if (first < 0x31 || first > 0x39) return undefined
  let value = first - 0x30
  for (let index = 1; index < key.length; index += 1) {
    const digit = callCharCodeAt(key, index)
    if (digit < 0x30 || digit > 0x39) return undefined
    value = value * 10 + digit - 0x30
    if (value > 0xffff_fffe) return undefined
  }
  return value
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

function assertWellFormedUnicode(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = callCharCodeAt(value, index)
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) fail(path, "strings must not contain lone UTF-16 surrogates")
      const next = callCharCodeAt(value, index + 1)
      if (next < 0xdc00 || next > 0xdfff) {
        fail(path, "strings must not contain lone UTF-16 surrogates")
      }
      index += 1
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      fail(path, "strings must not contain lone UTF-16 surrogates")
    }
  }
}

function propertyPath(path: string, key: string): string {
  return `${path}["${escapePathString(key)}"]`
}

function escapePathString(value: string): string {
  let escaped = ""
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = callCharCodeAt(value, index)
    switch (codeUnit) {
      case 0x08:
        escaped += "\\b"
        continue
      case 0x09:
        escaped += "\\t"
        continue
      case 0x0a:
        escaped += "\\n"
        continue
      case 0x0c:
        escaped += "\\f"
        continue
      case 0x0d:
        escaped += "\\r"
        continue
      case 0x22:
        escaped += '\\"'
        continue
      case 0x5c:
        escaped += "\\\\"
        continue
    }

    if (codeUnit < 0x20 || codeUnit === 0x7f) {
      escaped += unicodeEscape(codeUnit)
      continue
    }
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 < value.length) {
        const next = callCharCodeAt(value, index + 1)
        if (next >= 0xdc00 && next <= 0xdfff) {
          escaped += stringFromCharCode(codeUnit, next)
          index += 1
          continue
        }
      }
      escaped += unicodeEscape(codeUnit)
      continue
    }
    if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      escaped += unicodeEscape(codeUnit)
      continue
    }
    escaped += stringFromCharCode(codeUnit)
  }
  return escaped
}

function unicodeEscape(codeUnit: number): string {
  let hexadecimal = numberAsBase16(codeUnit)
  while (hexadecimal.length < 4) hexadecimal = `0${hexadecimal}`
  return `\\u${hexadecimal}`
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function numberAsBase16(value: number): string {
  return reflectApply(numberToString, value, [16]) as string
}

function callCharCodeAt(value: string, index: number): number {
  return reflectApply(stringCharCodeAt, value, [index]) as number
}

function callWeakSetAdd(set: WeakSet<object>, value: object): void {
  reflectApply(weakSetAdd, set, [value])
}

function callWeakSetDelete(set: WeakSet<object>, value: object): void {
  reflectApply(weakSetDelete, set, [value])
}

function callWeakSetHas(set: WeakSet<object>, value: object): boolean {
  return reflectApply(weakSetHas, set, [value]) as boolean
}

function fail(path: string, message: string): never {
  throw new TypeError(`Value at ${path} is not valid unambiguous JSON: ${message}.`)
}
