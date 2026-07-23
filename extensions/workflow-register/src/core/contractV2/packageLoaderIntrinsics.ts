import { types as utilTypes } from "node:util"

export const isProxy = utilTypes.isProxy
export const arrayIsArray = Array.isArray
export const arrayPrototype = Array.prototype
export const arrayPush = Array.prototype.push
export const arraySort = Array.prototype.sort
export const bufferFrom = Buffer.from
export const bufferByteLength = Buffer.byteLength.bind(Buffer) as (
  value: string,
  encoding?: BufferEncoding
) => number
export const numberIsSafeInteger = Number.isSafeInteger
export const objectCreate = Object.create
export const objectFreeze = Object.freeze
export const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
export const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
export const objectGetPrototypeOf = Object.getPrototypeOf
export const objectHasOwn = Object.hasOwn
export const objectPrototype = Object.prototype
export const reflectApply = Reflect.apply
export const reflectOwnKeys = Reflect.ownKeys
export const regexpTest = RegExp.prototype.test
export const stringEndsWith = String.prototype.endsWith
export const stringIncludes = String.prototype.includes
export const stringNormalize = String.prototype.normalize
export const stringStartsWith = String.prototype.startsWith
export const stringToLowerCase = String.prototype.toLowerCase
export const jsonParse = JSON.parse
export const jsonStringify = JSON.stringify
export const Uint8ArrayConstructor = Uint8Array
export const textDecoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })

export function pushValue<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}

export function sortValues<T>(values: T[], compare: (left: T, right: T) => number): void {
  reflectApply(arraySort, values, [compare])
}

export function testPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpTest, pattern, [value]) as boolean
}

export function reflectBoolean(method: Function, value: string, argument: string): boolean {
  return reflectApply(method, value, [argument]) as boolean
}

export function reflectString(method: Function, value: string, argument?: string): string {
  return reflectApply(method, value, argument === undefined ? [] : [argument]) as string
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

export function normalizeContainmentRoot(value: string): string {
  let result = value
  while (
    result.length > 1
    && (
      reflectBoolean(stringEndsWith, result, "/")
      || reflectBoolean(stringEndsWith, result, "\\")
    )
  ) result = result.slice(0, -1)
  return result
}
