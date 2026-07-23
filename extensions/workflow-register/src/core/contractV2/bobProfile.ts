import { types as utilTypes } from "node:util"
import { canonicalJsonDigest } from "./canonicalJson"
import { cloneAndFreezeJsonValue } from "./jsonValue"

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectKeys = Object.keys
const reflectApply = Reflect.apply

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
  compileTimeCapabilities: readonly ["source.deactivate", "source.log", "source.registerWorkflow"]
}> {
  snapshotExactFunctions(liveExport, ACTIVATION_NAMES, "Bob activation export")
  return objectFreeze({
    ok: true as const,
    profile: BOB_2_0_1_PROFILE,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    compileTimeCapabilities: objectFreeze([
      "source.deactivate",
      "source.log",
      "source.registerWorkflow"
    ] as const)
  })
}

export function bindBobCapabilities(input: {
  readonly extensionId: unknown
  readonly extensionVersion: unknown
  readonly expectedProfileDigest: unknown
  readonly liveExport: unknown
}): BoundBobCapabilities {
  assertProfileIdentity(input.extensionId, input.extensionVersion, input.expectedProfileDigest)
  const activation = snapshotExactFunctions(input.liveExport, ACTIVATION_NAMES, "Bob activation export")
  const registerSource = activation.registerSource as (id: string, name?: string) => unknown
  return objectFreeze({
    ok: true as const,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    registerSource: (id: string, name?: string) => bindBobSource(
      reflectApply(registerSource, input.liveExport, [id, name])
    )
  })
}

export function probeBobTaskCapabilities(input: {
  readonly expectedProfileDigest: unknown
  readonly task: unknown
}): ProbedBobTaskCapabilities {
  if (input.expectedProfileDigest !== BOB_2_0_1_PROFILE_DIGEST) {
    throw new TypeError("IBM Bob task profile digest does not match the audited 2.0.1 profile.")
  }
  const methods = snapshotExactFunctions(input.task, TASK_NAMES, "Bob task")
  return objectFreeze({
    getAllMetadata: bindMethod(input.task, methods.getAllMetadata),
    getMessages: bindMethod(input.task, methods.getMessages),
    sendMessage: bindMethod(input.task, methods.sendMessage),
    setStepComplete: bindMethod(input.task, methods.setStepComplete),
    startSubagent: bindMethod(input.task, methods.startSubagent),
    toSerializable: bindMethod(input.task, methods.toSerializable)
  }) as ProbedBobTaskCapabilities
}

function bindBobSource(source: unknown): BoundBobSource {
  const methods = snapshotExactFunctions(source, SOURCE_NAMES, "Bob source")
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

function snapshotExactFunctions<T extends readonly string[]>(
  value: unknown,
  expectedNames: T,
  label: string
): Record<T[number], Function> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be a non-proxy object.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== null && prototype !== Object.prototype) {
    throw new TypeError(`${label} must have an ordinary or null prototype.`)
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const names = objectKeys(descriptors)
  if (names.length !== expectedNames.length) {
    throw new TypeError(`${label} has missing or extra capabilities.`)
  }
  const result = objectCreate(null) as Record<string, Function>
  for (let index = 0; index < expectedNames.length; index += 1) {
    const name = expectedNames[index]
    const descriptor = descriptors[name]
    if (descriptor === undefined || !("value" in descriptor) || typeof descriptor.value !== "function" || isProxy(descriptor.value)) {
      throw new TypeError(`${label}.${name} must be a non-proxy own data function.`)
    }
    result[name] = descriptor.value
  }
  for (let index = 0; index < names.length; index += 1) {
    if (!includesName(expectedNames, names[index])) throw new TypeError(`${label}.${names[index]} is not audited.`)
  }
  return result as Record<T[number], Function>
}

function bindMethod(owner: unknown, method: Function): (...args: unknown[]) => unknown {
  return (...args: unknown[]) => reflectApply(method, owner, args)
}

function includesName(names: readonly string[], expected: string): boolean {
  for (let index = 0; index < names.length; index += 1) if (names[index] === expected) return true
  return false
}
