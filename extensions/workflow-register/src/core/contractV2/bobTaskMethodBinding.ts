import { types as utilTypes } from "node:util"

import type { BobTaskCapabilityName } from "./bobProfile"

declare const auditedBobTaskBindingBrand: unique symbol
export interface AuditedBobTaskBinding {
  readonly [auditedBobTaskBindingBrand]: true
}

interface AuditedBobTaskBindingState {
  readonly identity: object
  readonly methods: Readonly<Partial<Record<BobTaskCapabilityName, (...args: unknown[]) => unknown>>>
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const numberIsSafeInteger = Number.isSafeInteger
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, AuditedBobTaskBindingState>, key: object
) => AuditedBobTaskBindingState | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, AuditedBobTaskBindingState>, key: object, value: AuditedBobTaskBindingState
) => WeakMap<object, AuditedBobTaskBindingState>
const WeakMapConstructor = WeakMap
const MAX_PROTOTYPE_DEPTH = 64
const MAX_TASK_CAPABILITIES = 6
const states = new WeakMapConstructor<object, AuditedBobTaskBindingState>()

/**
 * Captures every task method selected by the successful F7 probe before the
 * caller can cross an asynchronous boundary. The returned object is opaque;
 * later product code can use only the captured receiver-bound functions.
 */
export function captureAuditedBobTaskBinding(
  task: unknown,
  capabilities: readonly BobTaskCapabilityName[]
): AuditedBobTaskBinding {
  const identity = requireTaskIdentity(task)
  const selected = snapshotCapabilities(capabilities)
  const methods = objectCreate(null) as Partial<Record<BobTaskCapabilityName, (...args: unknown[]) => unknown>>
  for (let index = 0; index < selected.length; index += 1) {
    const capability = selected[index]
    methods[capability] = bindAuditedBobTaskMethod(identity, capability)
  }
  const binding = objectFreeze({}) as AuditedBobTaskBinding
  weakMapSet(states, binding, objectFreeze({
    identity,
    methods: objectFreeze(methods)
  }))
  return binding
}

export function auditedBobTaskIdentity(binding: AuditedBobTaskBinding): object {
  return requireBindingState(binding).identity
}

export function auditedBobTaskMethod(
  binding: AuditedBobTaskBinding,
  capability: BobTaskCapabilityName
): (...args: unknown[]) => unknown {
  const method = requireBindingState(binding).methods[capability]
  if (method === undefined) {
    throw new TypeError(`Audited Bob task capability was not captured: ${capability}`)
  }
  return method
}

/**
 * Captures one Bob task method by descriptor. No later property lookup is
 * performed by the returned receiver-safe function.
 */
export function bindAuditedBobTaskMethod(
  task: unknown,
  capability: BobTaskCapabilityName
): (...args: unknown[]) => unknown {
  const identity = requireTaskIdentity(task)
  const method = findDataMethod(identity, methodName(capability))
  return objectFreeze((...args: unknown[]) => {
    const snapshot: unknown[] = []
    for (let index = 0; index < args.length; index += 1) {
      reflectApply(arrayPush, snapshot, [args[index]])
    }
    return reflectApply(method, identity, snapshot)
  })
}

function requireBindingState(value: unknown): AuditedBobTaskBindingState {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError("Audited Bob task binding is invalid.")
  }
  const state = weakMapGet(states, value)
  if (state === undefined) throw new TypeError("Audited Bob task binding is invalid.")
  return state
}

function requireTaskIdentity(value: unknown): object {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError("Audited Bob task must be a non-proxy object.")
  }
  return value
}

function snapshotCapabilities(value: unknown): readonly BobTaskCapabilityName[] {
  if (
    !arrayIsArray(value)
    || isProxy(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
  ) throw new TypeError("Audited Bob task capabilities must be a dense ordinary array.")
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const lengthDescriptor = descriptors.length
  if (
    lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, "value")
    || typeof lengthDescriptor.value !== "number"
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > MAX_TASK_CAPABILITIES
  ) throw new TypeError("Audited Bob task capabilities have an invalid length.")
  const length = lengthDescriptor.value
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== length + 1) {
    throw new TypeError("Audited Bob task capabilities must not be sparse or have extra fields.")
  }
  const result: BobTaskCapabilityName[] = []
  const seen = objectCreate(null) as Record<string, true>
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true
      || typeof descriptor.value !== "string"
    ) throw new TypeError("Audited Bob task capabilities contain an invalid item.")
    const capability = descriptor.value as BobTaskCapabilityName
    methodName(capability)
    if (objectHasOwn(seen, capability)) {
      throw new TypeError("Audited Bob task capabilities contain a duplicate.")
    }
    seen[capability] = true
    result[index] = capability
  }
  return objectFreeze(result)
}

function findDataMethod(owner: object, name: string): Function {
  let current: object | null = owner
  let depth = 0
  while (current !== null) {
    if (isProxy(current)) throw new TypeError("Bob task prototype chain contains a Proxy.")
    let descriptors: PropertyDescriptorMap
    try {
      descriptors = objectGetOwnPropertyDescriptors(current)
    } catch {
      throw new TypeError("Bob task descriptors could not be inspected safely.")
    }
    const mapDescriptor = objectGetOwnPropertyDescriptor(descriptors, name)
    if (mapDescriptor !== undefined && objectHasOwn(mapDescriptor, "value")) {
      const descriptor = mapDescriptor.value as PropertyDescriptor
      if (!objectHasOwn(descriptor, "value")) {
        throw new TypeError(`Bob task.${name} is an accessor rather than a data method.`)
      }
      const method = descriptor.value
      if (typeof method !== "function" || isProxy(method)) {
        throw new TypeError(`Bob task.${name} is not an audited function.`)
      }
      return method
    }
    depth += 1
    if (depth > MAX_PROTOTYPE_DEPTH) throw new TypeError("Bob task prototype chain is too deep.")
    try {
      current = objectGetPrototypeOf(current)
    } catch {
      throw new TypeError("Bob task prototype chain could not be inspected safely.")
    }
  }
  throw new TypeError(`Bob task.${name} is unavailable after the audited capability probe.`)
}

function methodName(capability: BobTaskCapabilityName): string {
  switch (capability) {
    case "task.getAllMetadata": return "getAllMetadata"
    case "task.getMessages": return "getMessages"
    case "task.sendMessage": return "sendMessage"
    case "task.setStepComplete": return "setStepComplete"
    case "task.startSubagent": return "startSubagent"
    case "task.toSerializable": return "toSerializable"
    default: throw new TypeError("Audited Bob task capability is invalid.")
  }
}
