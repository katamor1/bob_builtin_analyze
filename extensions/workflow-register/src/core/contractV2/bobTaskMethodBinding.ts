import { types as utilTypes } from "node:util"

import type { BobTaskCapabilityName } from "./bobProfile"

const isProxy = utilTypes.isProxy
const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const reflectApply = Reflect.apply
const MAX_PROTOTYPE_DEPTH = 64

/**
 * Captures one Bob task method by descriptor after the caller's immediate F7
 * capability probe. No later property lookup is performed by the returned
 * receiver-safe function.
 */
export function bindAuditedBobTaskMethod(
  task: unknown,
  capability: BobTaskCapabilityName
): (...args: unknown[]) => unknown {
  if (task === null || typeof task !== "object" || isProxy(task)) {
    throw new TypeError("Audited Bob task must be a non-proxy object.")
  }
  const method = findDataMethod(task, methodName(capability))
  return objectFreeze((...args: unknown[]) => {
    const snapshot: unknown[] = []
    for (let index = 0; index < args.length; index += 1) {
      reflectApply(arrayPush, snapshot, [args[index]])
    }
    return reflectApply(method, task, snapshot)
  })
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
  }
}
