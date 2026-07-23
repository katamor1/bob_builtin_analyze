import { types as utilTypes } from "node:util"
import { canonicalJsonDigest } from "./canonicalJson"
import { cloneAndFreezeJsonValue } from "./jsonValue"

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys

const MAX_PROTOTYPE_DEPTH = 64
const ACTIVATION_NAMES = objectFreeze(["registerSource"] as const)
const SOURCE_NAMES = objectFreeze(["deactivate", "log", "registerWorkflow"] as const)
const TASK_NAMES = objectFreeze([
  "getAllMetadata",
  "getMessages",
  "sendMessage",
  "setStepComplete",
  "startSubagent",
  "toSerializable"
] as const)
const COMPILE_TIME_CAPABILITIES = objectFreeze([
  "source.deactivate",
  "source.log",
  "source.registerWorkflow"
] as const)
const BIND_INPUT_FIELDS = objectFreeze([
  "extensionId",
  "extensionVersion",
  "expectedProfileDigest",
  "liveExport"
] as const)
const PROBE_INPUT_FIELDS = objectFreeze(["expectedProfileDigest", "task"] as const)

export const BOB_2_0_1_PROFILE = cloneAndFreezeJsonValue({
  schemaVersion: "workflow-bob-profile/v1",
  extension: { id: "IBM.bob-code", version: "2.0.1" },
  activationDescriptors: [
    { name: "registerSource", valueKind: "function", callShape: "(id: string, name?: string) => source" }
  ],
  sourceDescriptors: [
    { name: "deactivate", valueKind: "function" },
    { name: "log", valueKind: "function" },
    { name: "registerWorkflow", valueKind: "function" }
  ],
  capabilityNames: [
    "source.deactivate", "source.log", "source.registerWorkflow",
    "task.getAllMetadata", "task.getMessages", "task.sendMessage",
    "task.setStepComplete", "task.startSubagent", "task.toSerializable"
  ],
  taskCapabilityDescriptors: [
    { capability: "task.getAllMetadata", name: "getAllMetadata", valueKind: "function" },
    { capability: "task.getMessages", name: "getMessages", valueKind: "function" },
    { capability: "task.sendMessage", name: "sendMessage", valueKind: "function" },
    { capability: "task.setStepComplete", name: "setStepComplete", valueKind: "function" },
    { capability: "task.startSubagent", name: "startSubagent", valueKind: "function" },
    { capability: "task.toSerializable", name: "toSerializable", valueKind: "function" }
  ]
})

export const BOB_2_0_1_PROFILE_DIGEST =
  "sha256:aea18a3b1d19f2a1231c7d5e6ac7a416f0ace09ffa823fe4ceb0f43733492b73" as const

if (canonicalJsonDigest(BOB_2_0_1_PROFILE) !== BOB_2_0_1_PROFILE_DIGEST) {
  throw new Error("Audited IBM Bob 2.0.1 profile digest drifted.")
}

export { canonicalJsonDigest }

export interface BoundBobSource {
  readonly deactivate: () => unknown
  readonly log: (message: string) => unknown
  readonly registerWorkflow: (workflow: unknown) => unknown
}

export interface BoundBobCapabilities {
  readonly ok: true
  readonly profileDigest: typeof BOB_2_0_1_PROFILE_DIGEST
  readonly registerSource: (id: string, name?: string) => BoundBobSource
}

export interface ProbedBobTaskCapabilities {
  readonly getAllMetadata: () => Record<string, unknown>
  readonly getMessages: () => unknown[]
  readonly sendMessage: (...args: unknown[]) => unknown
  readonly setStepComplete: () => unknown
  readonly startSubagent: (prompt: string, preset?: unknown, mask?: unknown) => unknown
  readonly toSerializable: () => unknown
}

export function snapshotBobContractProfile(liveExport: unknown): Readonly<{
  ok: true
  profile: typeof BOB_2_0_1_PROFILE
  profileDigest: typeof BOB_2_0_1_PROFILE_DIGEST
  compileTimeCapabilities: typeof COMPILE_TIME_CAPABILITIES
}> {
  snapshotOwnRequiredFunctions(liveExport, ACTIVATION_NAMES, "Bob activation export")
  return objectFreeze({
    ok: true as const,
    profile: BOB_2_0_1_PROFILE,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    compileTimeCapabilities: COMPILE_TIME_CAPABILITIES
  })
}

export function bindBobCapabilities(input: {
  readonly extensionId: unknown
  readonly extensionVersion: unknown
  readonly expectedProfileDigest: unknown
  readonly liveExport: unknown
}): BoundBobCapabilities {
  const snapshot = snapshotExactInput(input, BIND_INPUT_FIELDS, "Bob capability binding input")
  assertProfileIdentity(snapshot.extensionId, snapshot.extensionVersion, snapshot.expectedProfileDigest)
  const liveExport = snapshot.liveExport
  const activation = snapshotOwnRequiredFunctions(liveExport, ACTIVATION_NAMES, "Bob activation export")
  const registerSource = activation.registerSource as (id: string, name?: string) => unknown
  return objectFreeze({
    ok: true as const,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    registerSource: freezeFunction((id: string, name?: string) => bindBobSource(
      reflectApply(registerSource, liveExport, name === undefined ? [id] : [id, name])
    ))
  })
}

export function probeBobTaskCapabilities(input: {
  readonly expectedProfileDigest: unknown
  readonly task: unknown
}): ProbedBobTaskCapabilities {
  const snapshot = snapshotExactInput(input, PROBE_INPUT_FIELDS, "Bob task probe input")
  if (snapshot.expectedProfileDigest !== BOB_2_0_1_PROFILE_DIGEST) {
    throw new TypeError("IBM Bob task profile digest does not match the audited 2.0.1 profile.")
  }
  const task = snapshot.task
  const methods = snapshotRequiredFunctions(task, TASK_NAMES, "Bob task")
  return objectFreeze({
    getAllMetadata: bindMethod(task, methods.getAllMetadata),
    getMessages: bindMethod(task, methods.getMessages),
    sendMessage: bindMethod(task, methods.sendMessage),
    setStepComplete: bindMethod(task, methods.setStepComplete),
    startSubagent: bindMethod(task, methods.startSubagent),
    toSerializable: bindMethod(task, methods.toSerializable)
  }) as ProbedBobTaskCapabilities
}

function bindBobSource(source: unknown): BoundBobSource {
  const methods = snapshotRequiredFunctions(source, SOURCE_NAMES, "Bob source")
  return objectFreeze({
    deactivate: bindMethod(source, methods.deactivate),
    log: bindMethod(source, methods.log),
    registerWorkflow: bindMethod(source, methods.registerWorkflow)
  }) as BoundBobSource
}

function assertProfileIdentity(extensionId: unknown, extensionVersion: unknown, digest: unknown): void {
  if (
    extensionId !== "IBM.bob-code"
    || extensionVersion !== "2.0.1"
    || digest !== BOB_2_0_1_PROFILE_DIGEST
  ) {
    throw new TypeError("IBM Bob capability binding requires IBM.bob-code@2.0.1 and the audited profile digest.")
  }
}

function snapshotExactInput<T extends readonly string[]>(
  value: unknown,
  expectedNames: T,
  label: string
): Record<T[number], unknown> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a non-proxy ordinary record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be a non-proxy ordinary record.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== expectedNames.length) throw new TypeError(`${label} fields do not match the audited shape.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index]
    const descriptor = descriptorMapValue(descriptors, name)
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${name} must be an enumerable own data property.`)
    result[name] = descriptor.value
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !includesName(expectedNames, key)) {
      throw new TypeError(`${label} contains an unaudited field.`)
    }
  }
  return result as Record<T[number], unknown>
}

function snapshotOwnRequiredFunctions<T extends readonly string[]>(
  value: unknown,
  expectedNames: T,
  label: string
): Record<T[number], Function> {
  assertInspectableObject(value, label)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const result = objectCreate(null) as Record<string, Function>
  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index]
    const descriptor = descriptorMapValue(descriptors, name)
    if (descriptor === undefined) throw new TypeError(`${label}.${name} must be an own data function.`)
    if (!objectHasOwn(descriptor, "value")) {
      throw new TypeError(`${label}.${name} must be a data function, not an accessor.`)
    }
    const method = descriptor.value
    if (typeof method !== "function" || isProxy(method)) {
      throw new TypeError(`${label}.${name} must be a non-proxy function.`)
    }
    result[name] = method
  }
  return result as Record<T[number], Function>
}

function snapshotRequiredFunctions<T extends readonly string[]>(
  value: unknown,
  expectedNames: T,
  label: string
): Record<T[number], Function> {
  assertInspectableObject(value, label)
  const result = objectCreate(null) as Record<string, Function>
  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index]
    result[name] = findRequiredFunction(value, name, label)
  }
  return result as Record<T[number], Function>
}

function findRequiredFunction(owner: object, name: string, label: string): Function {
  let current: object | null = owner
  let depth = 0
  while (current !== null) {
    if (isProxy(current)) throw new TypeError(`${label} prototype chain must not contain a Proxy.`)
    let descriptors: PropertyDescriptorMap
    try {
      descriptors = objectGetOwnPropertyDescriptors(current)
    } catch {
      throw new TypeError(`${label} descriptors could not be inspected safely.`)
    }
    const descriptor = descriptorMapValue(descriptors, name)
    if (descriptor !== undefined) {
      if (!objectHasOwn(descriptor, "value")) {
        throw new TypeError(`${label}.${name} must be a data function, not an accessor.`)
      }
      const method = descriptor.value
      if (typeof method !== "function" || isProxy(method)) {
        throw new TypeError(`${label}.${name} must be a non-proxy function.`)
      }
      return method
    }
    depth += 1
    if (depth > MAX_PROTOTYPE_DEPTH) throw new TypeError(`${label} prototype chain is too deep.`)
    try {
      current = objectGetPrototypeOf(current)
    } catch {
      throw new TypeError(`${label} prototype chain could not be inspected safely.`)
    }
  }
  throw new TypeError(`${label}.${name} is missing.`)
}

function assertInspectableObject(value: unknown, label: string): asserts value is object {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a non-proxy object.`)
  }
}

function descriptorMapValue(
  descriptors: PropertyDescriptorMap,
  name: string
): PropertyDescriptor | undefined {
  const mapDescriptor = objectGetOwnPropertyDescriptor(descriptors, name)
  if (mapDescriptor === undefined || !objectHasOwn(mapDescriptor, "value")) return undefined
  return mapDescriptor.value as PropertyDescriptor
}

function bindMethod(owner: unknown, method: Function): (...args: unknown[]) => unknown {
  return freezeFunction((...args: unknown[]) => reflectApply(method, owner, args))
}

function freezeFunction<T extends Function>(value: T): T {
  return objectFreeze(value)
}

function includesName(names: readonly string[], expected: string): boolean {
  for (let index = 0; index < names.length; index += 1) if (names[index] === expected) return true
  return false
}
