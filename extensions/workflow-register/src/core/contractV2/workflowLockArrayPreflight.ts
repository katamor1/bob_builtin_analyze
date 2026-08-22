import { types as utilTypes } from "node:util"

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const numberIsSafeInteger = Number.isSafeInteger
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn

export function preflightDenseWorkflowLockArrayLength(
  value: unknown,
  maximum: number,
  label: string
): number {
  if (!arrayIsArray(value) || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a dense ordinary array.`)
  }
  let prototype: object | null
  let lengthDescriptor: PropertyDescriptor | undefined
  try {
    prototype = objectGetPrototypeOf(value)
    lengthDescriptor = objectGetOwnPropertyDescriptor(value, "length")
  } catch {
    throw new TypeError(`${label} must be safely inspectable.`)
  }
  if (
    prototype !== arrayPrototype
    || lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, "value")
    || lengthDescriptor.enumerable === true
    || typeof lengthDescriptor.value !== "number"
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
  ) throw new TypeError(`${label} has an invalid length.`)
  if (lengthDescriptor.value > maximum) {
    throw new TypeError(`${label} exceeds the ${maximum}-item length limit.`)
  }
  return lengthDescriptor.value
}
