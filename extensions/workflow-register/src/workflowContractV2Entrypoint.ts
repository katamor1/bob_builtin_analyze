import { types as utilTypes } from "node:util"

import type {
  CompiledWorkflowPlanHandle,
  WorkflowCompilerEnvironment,
  WorkflowPlanLease
} from "./core/contractV2"
import { createWorkflowContractV2Diagnostic, type WorkflowContractV2Diagnostic } from "./core/contractV2/diagnostics"
import type { RawWorkflowPackage } from "./core/contractV2/packageLoaderContract"
import { WorkflowPlanCompilationError } from "./core/contractV2/planStore"
import type { Sha256Digest } from "./core/contractV2/providerContract"

export type WorkflowContractV2Consumer =
  | "validation"
  | "workspace-registration"
  | "run-creation"
  | "bob-adapter"
  | "operation-hub"
  | "command-validation"
  | "resume"

export interface WorkflowContractV2Slot {
  readonly collectionId: string
  readonly collectionRoot: string
  readonly workflowId: string
}

export interface CompileCurrentWorkflowContractV2Input {
  readonly slot: WorkflowContractV2Slot
  readonly consumer: WorkflowContractV2Consumer
}

export interface CompileWorkflowContractV2GenerationInput extends CompileCurrentWorkflowContractV2Input {
  readonly generation: Sha256Digest
  readonly expectedPackageDigest?: Sha256Digest
}

export type WorkflowContractV2CompileResult =
  | {
      readonly ok: true
      readonly handle: CompiledWorkflowPlanHandle
      readonly rawPackage: RawWorkflowPackage
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

export type WorkflowContractV2AcquireResult =
  | {
      readonly ok: true
      readonly lease: WorkflowPlanLease
      readonly rawPackage: RawWorkflowPackage
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

export interface CreateWorkflowContractV2EntrypointInput {
  readonly environment: WorkflowCompilerEnvironment
  readonly loadCurrent: (input: WorkflowContractV2Slot) => Promise<RawWorkflowPackage>
  readonly loadGeneration: (input: WorkflowContractV2Slot & {
    readonly generation: Sha256Digest
    readonly expectedPackageDigest?: Sha256Digest
  }) => Promise<RawWorkflowPackage>
  readonly getOrCompile: (input: {
    readonly collectionId: string
    readonly workflowId: string
    readonly rawPackage: RawWorkflowPackage
    readonly environment: WorkflowCompilerEnvironment
  }) => Promise<CompiledWorkflowPlanHandle>
  readonly acquire: (input: {
    readonly collectionId: string
    readonly workflowId: string
    readonly rawPackage: RawWorkflowPackage
    readonly environment: WorkflowCompilerEnvironment
  }) => Promise<WorkflowPlanLease>
  readonly invalidate: (collectionId: string, workflowId: string) => void
}

export interface WorkflowContractV2Entrypoint {
  compileCurrent(input: CompileCurrentWorkflowContractV2Input): Promise<WorkflowContractV2CompileResult>
  compileGeneration(input: CompileWorkflowContractV2GenerationInput): Promise<WorkflowContractV2CompileResult>
  acquireCurrent(input: CompileCurrentWorkflowContractV2Input): Promise<WorkflowContractV2AcquireResult>
  invalidateSlot(slot: WorkflowContractV2Slot): void
}

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const CREATE_FIELDS = objectFreeze([
  "environment", "loadCurrent", "loadGeneration", "getOrCompile", "acquire", "invalidate"
] as const)
const CURRENT_FIELDS = objectFreeze(["slot", "consumer"] as const)
const GENERATION_FIELDS = objectFreeze(["slot", "consumer", "generation", "expectedPackageDigest"] as const)
const SLOT_FIELDS = objectFreeze(["collectionId", "collectionRoot", "workflowId"] as const)
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []
const CONSUMERS = objectFreeze([
  "validation",
  "workspace-registration",
  "run-creation",
  "bob-adapter",
  "operation-hub",
  "command-validation",
  "resume"
] as const)
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u

export function createWorkflowContractV2Entrypoint(
  input: CreateWorkflowContractV2EntrypointInput
): WorkflowContractV2Entrypoint {
  const snapshot = snapshotExactRecord(input, CREATE_FIELDS, "Workflow Contract v2 entrypoint input")
  const environment = snapshot.environment as WorkflowCompilerEnvironment
  const loadCurrent = requireFunction(snapshot.loadCurrent, "loadCurrent") as CreateWorkflowContractV2EntrypointInput["loadCurrent"]
  const loadGeneration = requireFunction(snapshot.loadGeneration, "loadGeneration") as CreateWorkflowContractV2EntrypointInput["loadGeneration"]
  const getOrCompile = requireFunction(snapshot.getOrCompile, "getOrCompile") as CreateWorkflowContractV2EntrypointInput["getOrCompile"]
  const acquire = requireFunction(snapshot.acquire, "acquire") as CreateWorkflowContractV2EntrypointInput["acquire"]
  const invalidate = requireFunction(snapshot.invalidate, "invalidate") as CreateWorkflowContractV2EntrypointInput["invalidate"]

  return objectFreeze({
    async compileCurrent(value: CompileCurrentWorkflowContractV2Input): Promise<WorkflowContractV2CompileResult> {
      const request = snapshotCurrent(value)
      try {
        const rawPackage = await loadCurrent(request.slot)
        const handle = await getOrCompile(storeInput(request.slot, rawPackage, environment))
        return objectFreeze({ ok: true as const, handle, rawPackage, diagnostics: EMPTY_DIAGNOSTICS })
      } catch (error) {
        return failure(error)
      }
    },

    async compileGeneration(value: CompileWorkflowContractV2GenerationInput): Promise<WorkflowContractV2CompileResult> {
      const request = snapshotGeneration(value)
      try {
        const rawPackage = await loadGeneration(objectFreeze({
          ...request.slot,
          generation: request.generation,
          ...(request.expectedPackageDigest === undefined
            ? {}
            : { expectedPackageDigest: request.expectedPackageDigest })
        }))
        const handle = await getOrCompile(storeInput(request.slot, rawPackage, environment))
        return objectFreeze({ ok: true as const, handle, rawPackage, diagnostics: EMPTY_DIAGNOSTICS })
      } catch (error) {
        return failure(error)
      }
    },

    async acquireCurrent(value: CompileCurrentWorkflowContractV2Input): Promise<WorkflowContractV2AcquireResult> {
      const request = snapshotCurrent(value)
      try {
        const rawPackage = await loadCurrent(request.slot)
        const lease = await acquire(storeInput(request.slot, rawPackage, environment))
        return objectFreeze({ ok: true as const, lease, rawPackage, diagnostics: EMPTY_DIAGNOSTICS })
      } catch (error) {
        return failure(error)
      }
    },

    invalidateSlot(value: WorkflowContractV2Slot): void {
      const slot = snapshotSlot(value)
      invalidate(slot.collectionId, slot.workflowId)
    }
  })
}

function snapshotCurrent(value: unknown): {
  readonly slot: WorkflowContractV2Slot
  readonly consumer: WorkflowContractV2Consumer
} {
  const snapshot = snapshotExactRecord(value, CURRENT_FIELDS, "Workflow Contract v2 current entrypoint request")
  return objectFreeze({
    slot: snapshotSlot(snapshot.slot),
    consumer: requireConsumer(snapshot.consumer)
  })
}

function snapshotGeneration(value: unknown): {
  readonly slot: WorkflowContractV2Slot
  readonly consumer: WorkflowContractV2Consumer
  readonly generation: Sha256Digest
  readonly expectedPackageDigest?: Sha256Digest
} {
  const snapshot = snapshotRecordWithOptional(
    value,
    ["slot", "consumer", "generation"],
    ["expectedPackageDigest"],
    "Workflow Contract v2 generation entrypoint request"
  )
  const expectedPackageDigest = objectHasOwn(snapshot, "expectedPackageDigest")
    ? requireDigest(snapshot.expectedPackageDigest, "expectedPackageDigest")
    : undefined
  return objectFreeze({
    slot: snapshotSlot(snapshot.slot),
    consumer: requireConsumer(snapshot.consumer),
    generation: requireDigest(snapshot.generation, "generation"),
    ...(expectedPackageDigest === undefined ? {} : { expectedPackageDigest })
  })
}

function snapshotSlot(value: unknown): WorkflowContractV2Slot {
  const snapshot = snapshotExactRecord(value, SLOT_FIELDS, "Workflow Contract v2 slot")
  if (typeof snapshot.collectionId !== "string" || snapshot.collectionId.length === 0) {
    throw new TypeError("Workflow Contract v2 collection id is invalid.")
  }
  if (typeof snapshot.collectionRoot !== "string" || snapshot.collectionRoot.length === 0) {
    throw new TypeError("Workflow Contract v2 collection root is invalid.")
  }
  if (
    typeof snapshot.workflowId !== "string"
    || snapshot.workflowId.length > 128
    || !ID_PATTERN.test(snapshot.workflowId)
  ) throw new TypeError("Workflow Contract v2 workflow id is invalid.")
  return objectFreeze({
    collectionId: snapshot.collectionId,
    collectionRoot: snapshot.collectionRoot,
    workflowId: snapshot.workflowId
  })
}

function storeInput(
  slot: WorkflowContractV2Slot,
  rawPackage: RawWorkflowPackage,
  environment: WorkflowCompilerEnvironment
): {
  readonly collectionId: string
  readonly workflowId: string
  readonly rawPackage: RawWorkflowPackage
  readonly environment: WorkflowCompilerEnvironment
} {
  return objectFreeze({
    collectionId: slot.collectionId,
    workflowId: slot.workflowId,
    rawPackage,
    environment
  })
}

function failure(error: unknown): { readonly ok: false; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] } {
  if (error instanceof WorkflowPlanCompilationError) {
    return objectFreeze({ ok: false as const, diagnostics: error.diagnostics })
  }
  const diagnostic = createWorkflowContractV2Diagnostic({
    code: "WF2_PACKAGE_LAYOUT_INVALID",
    severity: "error",
    message: "Workflow package could not be loaded or compiled.",
    location: objectFreeze({ path: "workflow.yaml", pointer: "" })
  })
  return objectFreeze({ ok: false as const, diagnostics: objectFreeze([diagnostic]) })
}

function requireConsumer(value: unknown): WorkflowContractV2Consumer {
  if (typeof value !== "string" || !includes(CONSUMERS, value)) {
    throw new TypeError("Workflow Contract v2 consumer is invalid.")
  }
  return value as WorkflowContractV2Consumer
}

function requireDigest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`Workflow Contract v2 ${label} is invalid.`)
  }
  return value as Sha256Digest
}

function requireFunction(value: unknown, name: string): Function {
  if (typeof value !== "function" || isProxy(value)) {
    throw new TypeError(`Workflow Contract v2 entrypoint ${name} must be a non-proxy function.`)
  }
  return value
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  return snapshotRecordWithOptional(value, fields, [], label) as Readonly<Record<Fields[number], unknown>>
}

function snapshotRecordWithOptional(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
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
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!includes(required, key) && !includes(optional, key))
    ) throw new TypeError(`${label} contains an unknown field.`)
    copyDataField(descriptors, result, key, label, true)
  }
  for (let index = 0; index < required.length; index += 1) {
    if (!objectHasOwn(result, required[index])) throw new TypeError(`${label}.${required[index]} is required.`)
  }
  return objectFreeze(result)
}

function copyDataField(
  descriptors: PropertyDescriptorMap,
  result: Record<string, unknown>,
  key: string,
  label: string,
  required: boolean
): void {
  const descriptor = descriptors[key]
  if (descriptor === undefined) {
    if (required) throw new TypeError(`${label}.${key} is required.`)
    return
  }
  if (
    !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError(`${label}.${key} must be an enumerable own data property.`)
  result[key] = descriptor.value
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
