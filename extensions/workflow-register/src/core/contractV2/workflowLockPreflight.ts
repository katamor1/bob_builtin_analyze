import { types as utilTypes } from "node:util"

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const numberIsSafeInteger = Number.isSafeInteger
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype

export function preflightWorkflowLockCollectionLimits(input: unknown): void {
  if (typeof input !== "object" || input === null || isProxy(input)) {
    throw new TypeError("Workflow package lock must be an ordinary non-proxy record.")
  }
  let prototype: object | null
  try {
    prototype = objectGetPrototypeOf(input)
  } catch {
    throw new TypeError("Workflow package lock must be inspectable.")
  }
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError("Workflow package lock must be an ordinary non-proxy record.")
  }

  const prompts = collectionLength(input, "prompts", 510)
  const schemas = collectionLength(input, "schemas", 510)
  if (prompts + schemas > 510) {
    throw new TypeError("Workflow package lock prompts and schemas exceed the combined length limit.")
  }
  collectionLength(input, "providers", 256)
}

function collectionLength(owner: object, name: string, maximum: number): number {
  let descriptor: PropertyDescriptor | undefined
  try {
    descriptor = objectGetOwnPropertyDescriptor(owner, name)
  } catch {
    throw new TypeError(`Workflow package lock.${name} must be inspectable.`)
  }
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true
  ) {
    throw new TypeError(`Workflow package lock.${name} must be an enumerable own data property.`)
  }
  const value = descriptor.value
  if (!arrayIsArray(value) || isProxy(value)) {
    throw new TypeError(`Workflow package lock.${name} must be a dense ordinary array.`)
  }
  let prototype: object | null
  let lengthDescriptor: PropertyDescriptor | undefined
  try {
    prototype = objectGetPrototypeOf(value)
    lengthDescriptor = objectGetOwnPropertyDescriptor(value, "length")
  } catch {
    throw new TypeError(`Workflow package lock.${name} must be inspectable.`)
  }
  if (
    prototype !== arrayPrototype
    || lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, "value")
    || typeof lengthDescriptor.value !== "number"
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum
  ) {
    throw new TypeError(`Workflow package lock.${name} has an invalid length.`)
  }
  return lengthDescriptor.value
}
