import { types as utilTypes } from "node:util"

import {
  BOB_2_0_1_CAPABILITIES,
  BOB_2_0_1_PROFILE,
  BOB_2_0_1_PROFILE_DIGEST,
  type BobContractProfileResult
} from "./bobProfile"
import {
  bindWorkflowProvider,
  WorkflowProviderRegistry,
  type WorkflowProviderCatalog,
  type WorkflowProviderContractEvidence,
  type WorkflowProviderContractRequirement,
  type WorkflowProviderOutputEvidence,
  type WorkflowProviderRegistration,
  type WorkflowProviderRegistrationInput
} from "./providerRegistry"

export type WorkflowCompilerPurpose = "runtime" | "authoring-validation" | "evidence"

declare const workflowCompilerEnvironmentBrand: unique symbol
export interface WorkflowCompilerEnvironment {
  readonly [workflowCompilerEnvironmentBrand]: true
}

export interface CreateAuditedWorkflowCompilerEnvironmentInput {
  readonly purpose: WorkflowCompilerPurpose
  readonly providerCatalog: WorkflowProviderCatalog
  readonly bobProfile: BobContractProfileResult
}

export interface WorkflowCompilerEnvironmentState {
  readonly identity: object
  readonly purpose: WorkflowCompilerPurpose
  readonly leaseable: boolean
  readonly providerCatalog: WorkflowProviderCatalog
  readonly bobProfile: BobContractProfileResult
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, WorkflowCompilerEnvironmentState>,
  key: object
) => WorkflowCompilerEnvironmentState | undefined
const weakMapHas = Function.prototype.call.bind(WeakMap.prototype.has) as (
  map: WeakMap<object, WorkflowCompilerEnvironmentState>,
  key: object
) => boolean
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, WorkflowCompilerEnvironmentState>,
  key: object,
  value: WorkflowCompilerEnvironmentState
) => WeakMap<object, WorkflowCompilerEnvironmentState>

const registerWorkflowProviderCaptured = Function.prototype.call.bind(WorkflowProviderRegistry.prototype.register) as (
  registry: WorkflowProviderRegistry, input: WorkflowProviderRegistrationInput
) => WorkflowProviderRegistration
const snapshotWorkflowProviderCaptured = Function.prototype.call.bind(WorkflowProviderRegistry.prototype.snapshot) as (
  registry: WorkflowProviderRegistry
) => WorkflowProviderCatalog

const INPUT_FIELDS = objectFreeze(["purpose", "providerCatalog", "bobProfile"] as const)
const BOB_PROFILE_FIELDS = objectFreeze([
  "ok", "profile", "profileDigest", "capabilities", "compileTimeCapabilities"
] as const)
const BOB_COMPILE_TIME_CAPABILITIES = objectFreeze([
  "source.deactivate", "source.log", "source.registerWorkflow"
] as const)
const ZERO_DIGEST = `sha256:${"0".repeat(64)}` as const
const CATALOG_PROBE_REQUIREMENT = objectFreeze({
  id: "workflow.compiler.catalog-probe",
  version: "0.0.0-0",
  inputSchema: objectFreeze({
    id: "schemas/compiler-probe.json",
    bytes: 1,
    digest: ZERO_DIGEST
  }),
  output: objectFreeze({ kind: "unit" as const }),
  errorSchema: objectFreeze({
    id: "schemas/compiler-probe.json",
    bytes: 1,
    digest: ZERO_DIGEST
  }),
  sideEffect: "none" as const,
  idempotency: "idempotent" as const,
  requiredCapabilities: objectFreeze([] as string[])
}) satisfies WorkflowProviderContractRequirement
const CATALOG_PROBE_LOCATION = objectFreeze({ path: "workflow.yaml", pointer: "" })
const environmentStates = new WeakMap<object, WorkflowCompilerEnvironmentState>()

export function createAuditedWorkflowCompilerEnvironment(
  input: CreateAuditedWorkflowCompilerEnvironmentInput
): WorkflowCompilerEnvironment {
  const snapshot = snapshotExactRecord(input, INPUT_FIELDS, "Workflow compiler environment input")
  const purpose = snapshot.purpose
  if (purpose !== "runtime" && purpose !== "authoring-validation" && purpose !== "evidence") {
    throw new TypeError(
      "Workflow compiler environment purpose must be runtime, authoring-validation, or evidence."
    )
  }

  const auditedCatalog = requireProviderCatalog(snapshot.providerCatalog)
  const bobProfile = requireBobProfile(snapshot.bobProfile)
  const providerCatalog = purpose === "runtime"
    ? auditedCatalog
    : createCompileOnlyCatalog(auditedCatalog, purpose)

  const environment = objectFreeze({}) as WorkflowCompilerEnvironment
  weakMapSet(environmentStates, environment, objectFreeze({
    identity: objectFreeze({}),
    purpose,
    leaseable: purpose === "runtime",
    providerCatalog,
    bobProfile
  }))
  return environment
}

export function requireWorkflowCompilerEnvironmentState(
  environment: unknown
): WorkflowCompilerEnvironmentState {
  if (
    typeof environment !== "object"
    || environment === null
    || isProxy(environment)
    || !weakMapHas(environmentStates, environment)
  ) throw new TypeError("Workflow compiler environment is not an audited environment instance.")
  const state = weakMapGet(environmentStates, environment)
  if (state === undefined) throw new TypeError("Workflow compiler environment state is unavailable.")
  return state
}

export function isWorkflowCompilerEnvironment(
  environment: unknown
): environment is WorkflowCompilerEnvironment {
  return typeof environment === "object"
    && environment !== null
    && !isProxy(environment)
    && weakMapHas(environmentStates, environment)
}

function requireProviderCatalog(value: unknown): WorkflowProviderCatalog {
  try {
    bindWorkflowProvider({
      catalog: value as WorkflowProviderCatalog,
      requirement: CATALOG_PROBE_REQUIREMENT,
      location: CATALOG_PROBE_LOCATION
    })
  } catch {
    throw new TypeError("Workflow compiler provider catalog is not a branded audited snapshot.")
  }
  return value as WorkflowProviderCatalog
}

function requireBobProfile(value: unknown): BobContractProfileResult {
  const snapshot = snapshotExactRecord(value, BOB_PROFILE_FIELDS, "Workflow compiler Bob profile")
  if (
    snapshot.ok !== true
    || snapshot.profile !== BOB_2_0_1_PROFILE
    || snapshot.profileDigest !== BOB_2_0_1_PROFILE_DIGEST
    || !sameStringTuple(snapshot.capabilities, BOB_2_0_1_CAPABILITIES)
    || !sameStringTuple(snapshot.compileTimeCapabilities, BOB_COMPILE_TIME_CAPABILITIES)
  ) throw new TypeError("Workflow compiler Bob profile is not audited IBM Bob 2.0.1 evidence.")
  return objectFreeze({
    ok: true as const,
    profile: BOB_2_0_1_PROFILE,
    profileDigest: BOB_2_0_1_PROFILE_DIGEST,
    capabilities: BOB_2_0_1_CAPABILITIES,
    compileTimeCapabilities: BOB_COMPILE_TIME_CAPABILITIES
  })
}

function createCompileOnlyCatalog(
  source: WorkflowProviderCatalog,
  purpose: Exclude<WorkflowCompilerPurpose, "runtime">
): WorkflowProviderCatalog {
  const registry = new WorkflowProviderRegistry()
  const providers = source.evidence.providers
  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    registerWorkflowProviderCaptured(registry, {
      sourceId: `workflow.compiler.${purpose}.${index}`,
      contract: objectFreeze({
        id: provider.id,
        version: provider.version,
        inputSchema: provider.inputSchema,
        output: cloneProviderOutput(provider.output),
        errorSchema: provider.errorSchema,
        sideEffect: provider.sideEffect,
        idempotency: provider.idempotency,
        requiredCapabilities: provider.requiredCapabilities,
        dispatch: compileOnlyDispatch
      })
    })
  }
  return snapshotWorkflowProviderCaptured(registry)
}

function cloneProviderOutput(
  output: WorkflowProviderContractEvidence["output"]
): WorkflowProviderOutputEvidence {
  return output.kind === "unit"
    ? objectFreeze({ kind: "unit" as const })
    : objectFreeze({ kind: "value" as const, schema: output.schema })
}

function compileOnlyDispatch(): never {
  throw new Error("Workflow compiler non-runtime provider dispatch is compile-only.")
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = objectGetPrototypeOf(value)
    descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    throw new TypeError(`${label} must be safely inspectable.`)
  }
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError(`${label} must be an ordinary record.`)
  }
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !includes(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    result[field] = dataValue(descriptors, field, label)
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function dataValue(descriptors: PropertyDescriptorMap, key: string, label: string): unknown {
  const descriptor = descriptors[key]
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError(`${label}.${key} must be an enumerable own data property.`)
  return descriptor.value
}

function sameStringTuple(value: unknown, expected: readonly string[]): boolean {
  if (!arrayIsArray(value) || isProxy(value)) return false
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = objectGetPrototypeOf(value)
    descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    return false
  }
  const lengthDescriptor = descriptors.length
  if (
    prototype !== arrayPrototype
    || lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, "value")
    || lengthDescriptor.value !== expected.length
    || reflectOwnKeys(descriptors).length !== expected.length + 1
  ) return false
  for (let index = 0; index < expected.length; index += 1) {
    const descriptor = descriptors[String(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
      || descriptor.value !== expected[index]
    ) return false
  }
  return true
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
