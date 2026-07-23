import { types as utilTypes } from "node:util"
import { canonicalJsonDigest } from "./canonicalJson"
import { cloneAndFreezeJsonValue } from "./jsonValue"

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys

const MAX_PROTOTYPE_DEPTH = 64
export type BobCapabilityName =
  | "source.deactivate" | "source.log" | "source.registerWorkflow"
  | "task.getAllMetadata" | "task.getMessages" | "task.sendMessage"
  | "task.setStepComplete" | "task.startSubagent" | "task.toSerializable"

export type BobTaskCapabilityName = Extract<BobCapabilityName, `task.${string}`>

export const BOB_2_0_1_CAPABILITIES = objectFreeze([
  "source.deactivate",
  "source.log",
  "source.registerWorkflow",
  "task.getAllMetadata",
  "task.getMessages",
  "task.sendMessage",
  "task.setStepComplete",
  "task.startSubagent",
  "task.toSerializable"
] as const)

export const BOB_2_0_1_TASK_CAPABILITIES = objectFreeze([
  "task.getAllMetadata",
  "task.getMessages",
  "task.sendMessage",
  "task.setStepComplete",
  "task.startSubagent",
  "task.toSerializable"
] as const)

const ACTIVATION_NAMES = objectFreeze(["registerSource"] as const)
const SOURCE_NAMES = objectFreeze(["deactivate", "log", "registerWorkflow"] as const)
const COMPILE_TIME_CAPABILITIES = objectFreeze([
  "source.deactivate",
  "source.log",
  "source.registerWorkflow"
] as const)
const BIND_REQUIRED_FIELDS = objectFreeze([
  "extensionId",
  "extensionVersion",
  "expectedProfileDigest",
  "liveExport"
] as const)
const BIND_OPTIONAL_FIELDS = objectFreeze(["requiredCapabilities"] as const)
const PROBE_REQUIRED_FIELDS = objectFreeze(["expectedProfileDigest", "task"] as const)
const PROBE_OPTIONAL_FIELDS = objectFreeze(["requiredCapabilities"] as const)

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
  capabilityNames: BOB_2_0_1_CAPABILITIES,
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

export interface BindBobCapabilitiesInput {
  readonly extensionId: unknown
  readonly extensionVersion: unknown
  readonly expectedProfileDigest: unknown
  readonly liveExport: unknown
  readonly requiredCapabilities?: unknown
}

export interface BoundBobCapabilities {
  readonly ok: true
  readonly profile: "bob/2.0.1"
  readonly extensionId: "IBM.bob-code"
  readonly extensionVersion: "2.0.1"
  readonly profileDigest: typeof BOB_2_0_1_PROFILE_DIGEST
  readonly capabilities: typeof BOB_2_0_1_CAPABILITIES
  readonly requiredCapabilities: readonly BobCapabilityName[]
  readonly taskCapabilities: readonly BobTaskCapabilityName[]
  readonly registerSource: (id: string, name?: string) => BoundBobSource
}

export type BindBobCapabilitiesResult = BoundBobCapabilities

export interface ProbeBobTaskCapabilitiesInput {
  readonly expectedProfileDigest: unknown
  readonly task: unknown
  readonly requiredCapabilities?: unknown
}

export interface ProbedBobTaskCapabilities {
  readonly getAllMetadata?: () => Record<string, unknown>
  readonly getMessages?: () => unknown[]
  readonly sendMessage?: (...args: unknown[]) => unknown
  readonly setStepComplete?: () => unknown
  readonly startSubagent?: (prompt: string, preset?: unknown, mask?: unknown) => unknown
  readonly toSerializable?: () => unknown
}

export type ProbeBobTaskCapabilitiesResult = ProbedBobTaskCapabilities

export type BobContractProfileResult = Readonly<{
  ok: true
  profile: typeof BOB_2_0_1_PROFILE
  profileDigest: typeof BOB_2_0_1_PROFILE_DIGEST
  capabilities: typeof BOB_2_0_1_CAPABILITIES
  compileTimeCapabilities: typeof COMPILE_TIME_CAPABILITIES
}>

export function snapshotBobContractProfile(liveExport: unknown): BobContractProfileResult {
  snapshotOwnRequiredFunctions(liveExport, ACTIVATION_NAMES, "Bob activation export")
  return objectFreeze({
    ok: true as const,
    profile: BOB_2_0_1_PROFILE,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    capabilities: BOB_2_0_1_CAPABILITIES,
    compileTimeCapabilities: COMPILE_TIME_CAPABILITIES
  })
}

export function bindBobCapabilities(input: BindBobCapabilitiesInput): BindBobCapabilitiesResult {
  const snapshot = snapshotInputWithOptionalFields(
    input,
    BIND_REQUIRED_FIELDS,
    BIND_OPTIONAL_FIELDS,
    "Bob capability binding input"
  )
  assertProfileIdentity(snapshot.extensionId, snapshot.extensionVersion, snapshot.expectedProfileDigest)
  const requiredCapabilities = objectHasOwn(snapshot, "requiredCapabilities")
    ? snapshotCapabilitySubset(snapshot.requiredCapabilities, BOB_2_0_1_CAPABILITIES, "Bob required capabilities")
    : BOB_2_0_1_CAPABILITIES
  const taskCapabilities = deriveTaskCapabilities(requiredCapabilities)
  const liveExport = snapshot.liveExport
  const activation = snapshotOwnRequiredFunctions(liveExport, ACTIVATION_NAMES, "Bob activation export")
  const registerSource = activation.registerSource as (id: string, name?: string) => unknown
  return objectFreeze({
    ok: true as const,
    profile: "bob/2.0.1" as const,
    extensionId: "IBM.bob-code" as const,
    extensionVersion: "2.0.1" as const,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    capabilities: BOB_2_0_1_CAPABILITIES,
    requiredCapabilities,
    taskCapabilities,
    registerSource: freezeFunction((id: string, name?: string) => bindBobSource(
      reflectApply(registerSource, liveExport, name === undefined ? [id] : [id, name])
    ))
  })
}

export function probeBobTaskCapabilities(
  input: ProbeBobTaskCapabilitiesInput
): ProbeBobTaskCapabilitiesResult {
  const snapshot = snapshotInputWithOptionalFields(
    input,
    PROBE_REQUIRED_FIELDS,
    PROBE_OPTIONAL_FIELDS,
    "Bob task probe input"
  )
  if (snapshot.expectedProfileDigest !== BOB_2_0_1_PROFILE_DIGEST) {
    throw new TypeError("IBM Bob task profile digest does not match the audited 2.0.1 profile.")
  }
  const requiredCapabilities = objectHasOwn(snapshot, "requiredCapabilities")
    ? snapshotCapabilitySubset(snapshot.requiredCapabilities, BOB_2_0_1_TASK_CAPABILITIES, "Bob task required capabilities")
    : BOB_2_0_1_TASK_CAPABILITIES
  const task = snapshot.task
  assertInspectableObject(task, "Bob task")
  const result = objectCreate(null) as Record<string, (...args: unknown[]) => unknown>
  for (let index = 0; index < requiredCapabilities.length; index += 1) {
    const capability = requiredCapabilities[index]
    const name = taskMethodName(capability)
    result[name] = bindMethod(task, findRequiredFunction(task, name, "Bob task"))
  }
  return objectFreeze(result) as ProbeBobTaskCapabilitiesResult
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

function snapshotInputWithOptionalFields<
  Required extends readonly string[],
  Optional extends readonly string[]
>(
  value: unknown,
  requiredNames: Required,
  optionalNames: Optional,
  label: string
): Record<Required[number] | Optional[number], unknown> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a non-proxy ordinary record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be a non-proxy ordinary record.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < requiredNames.length; index += 1) {
    copyInputField(descriptors, result, requiredNames[index], label, true)
  }
  for (let index = 0; index < optionalNames.length; index += 1) {
    copyInputField(descriptors, result, optionalNames[index], label, false)
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!includesName(requiredNames, key) && !includesName(optionalNames, key))
    ) throw new TypeError(`${label} contains an unaudited field.`)
  }
  return result as Record<Required[number] | Optional[number], unknown>
}

function copyInputField(
  descriptors: PropertyDescriptorMap,
  result: Record<string, unknown>,
  name: string,
  label: string,
  required: boolean
): void {
  const descriptor = descriptorMapValue(descriptors, name)
  if (descriptor === undefined) {
    if (required) throw new TypeError(`${label}.${name} is required.`)
    return
  }
  if (!objectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
    throw new TypeError(`${label}.${name} must be an enumerable own data property.`)
  }
  result[name] = descriptor.value
}

function snapshotCapabilitySubset<Allowed extends readonly string[]>(
  value: unknown,
  allowed: Allowed,
  label: string
): readonly Allowed[number][] {
  if (!arrayIsArray(value) || isProxy(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError(`${label} must be a dense ordinary array.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const lengthDescriptor = descriptorMapValue(descriptors, "length")
  if (
    lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, "value")
    || typeof lengthDescriptor.value !== "number"
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > allowed.length
  ) throw new TypeError(`${label} has an invalid length.`)
  const length = lengthDescriptor.value
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== length + 1) throw new TypeError(`${label} must not be sparse or have extra fields.`)
  const result: string[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptorMapValue(descriptors, numberAsString(index))
    if (descriptor === undefined || !objectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      throw new TypeError(`${label}[${index}] must be an enumerable own data property.`)
    }
    const capability = descriptor.value
    if (typeof capability !== "string" || !includesName(allowed, capability)) {
      throw new TypeError(`${label}[${index}] is not an audited capability.`)
    }
    if (index > 0 && result[index - 1] >= capability) {
      throw new TypeError(`${label} must be code-unit sorted and duplicate-free.`)
    }
    result[index] = capability
  }
  return objectFreeze(result) as readonly Allowed[number][]
}

function deriveTaskCapabilities(
  requiredCapabilities: readonly BobCapabilityName[]
): readonly BobTaskCapabilityName[] {
  const result: BobTaskCapabilityName[] = []
  for (let index = 0; index < requiredCapabilities.length; index += 1) {
    const capability = requiredCapabilities[index]
    if (includesName(BOB_2_0_1_TASK_CAPABILITIES, capability)) {
      result[result.length] = capability as BobTaskCapabilityName
    }
  }
  return objectFreeze(result)
}

function taskMethodName(capability: BobTaskCapabilityName): keyof ProbedBobTaskCapabilities {
  switch (capability) {
    case "task.getAllMetadata": return "getAllMetadata"
    case "task.getMessages": return "getMessages"
    case "task.sendMessage": return "sendMessage"
    case "task.setStepComplete": return "setStepComplete"
    case "task.startSubagent": return "startSubagent"
    case "task.toSerializable": return "toSerializable"
  }
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

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function includesName(names: readonly string[], expected: string): boolean {
  for (let index = 0; index < names.length; index += 1) if (names[index] === expected) return true
  return false
}
