import { types as utilTypes } from "node:util"

import type {
  CompiledWorkflowPlanHandle,
  WorkflowCompilerEnvironment,
  WorkflowPlanLease
} from "./core/contractV2"
import { createWorkflowContractV2Diagnostic, type WorkflowContractV2Diagnostic } from "./core/contractV2/diagnostics"
import type { RawWorkflowPackage } from "./core/contractV2/packageLoaderContract"
import { WorkflowPlanCompilationError } from "./core/contractV2"
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
const freeze = Object.freeze
const descriptorsOf = Object.getOwnPropertyDescriptors
const prototypeOf = Object.getPrototypeOf
const ownKeys = Reflect.ownKeys
const hasOwn = Object.hasOwn
const create = Object.create
const ordinaryPrototype = Object.prototype
const apply = Reflect.apply
const regexpExec = RegExp.prototype.exec
const consumers = ["validation", "workspace-registration", "run-creation", "bob-adapter", "operation-hub", "command-validation", "resume"]
const EMPTY = freeze([]) as readonly []
const digestPattern = /^sha256:[0-9a-f]{64}$/u
const idPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u

export function createWorkflowContractV2Entrypoint(input: CreateWorkflowContractV2EntrypointInput): WorkflowContractV2Entrypoint {
  const value = record(input, ["environment", "loadCurrent", "loadGeneration", "getOrCompile", "acquire", "invalidate"])
  const environment = value.environment as WorkflowCompilerEnvironment
  for (const key of ["loadCurrent", "loadGeneration", "getOrCompile", "acquire", "invalidate"]) {
    if (typeof value[key] !== "function" || isProxy(value[key])) invalid()
  }
  const callbacks = value as unknown as CreateWorkflowContractV2EntrypointInput
  const storeInput = (slot: WorkflowContractV2Slot, rawPackage: RawWorkflowPackage) => freeze({
    collectionId: slot.collectionId, workflowId: slot.workflowId, rawPackage, environment
  })
  return freeze({
    async compileCurrent(input: CompileCurrentWorkflowContractV2Input): Promise<WorkflowContractV2CompileResult> {
      const request = current(input)
      try {
        const rawPackage = await callbacks.loadCurrent(request.slot)
        const handle = await callbacks.getOrCompile(storeInput(request.slot, rawPackage))
        return freeze({ ok: true, handle, rawPackage, diagnostics: EMPTY })
      } catch (error) { return failure(error) }
    },
    async compileGeneration(input: CompileWorkflowContractV2GenerationInput): Promise<WorkflowContractV2CompileResult> {
      const request = record(input, ["slot", "consumer", "generation"], ["expectedPackageDigest"])
      const slot = snapshotSlot(request.slot)
      consumer(request.consumer)
      const generation = digest(request.generation)
      const expected = hasOwn(request, "expectedPackageDigest") ? digest(request.expectedPackageDigest) : undefined
      try {
        const rawPackage = await callbacks.loadGeneration(freeze({ ...slot, generation,
          ...(expected === undefined ? {} : { expectedPackageDigest: expected }) }))
        const handle = await callbacks.getOrCompile(storeInput(slot, rawPackage))
        return freeze({ ok: true, handle, rawPackage, diagnostics: EMPTY })
      } catch (error) { return failure(error) }
    },
    async acquireCurrent(input: CompileCurrentWorkflowContractV2Input): Promise<WorkflowContractV2AcquireResult> {
      const request = current(input)
      try {
        const rawPackage = await callbacks.loadCurrent(request.slot)
        const lease = await callbacks.acquire(storeInput(request.slot, rawPackage))
        return freeze({ ok: true, lease, rawPackage, diagnostics: EMPTY })
      } catch (error) { return failure(error) }
    },
    invalidateSlot(input: WorkflowContractV2Slot): void {
      const slot = snapshotSlot(input)
      callbacks.invalidate(slot.collectionId, slot.workflowId)
    }
  })
}

function invalid(): never { throw new TypeError("Invalid request.") }
function includes(values: readonly string[], key: string): boolean {
  for (let index = 0; index < values.length; index++) if (values[index] === key) return true
  return false
}
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) invalid()
  const prototype = prototypeOf(value)
  if (prototype !== ordinaryPrototype && prototype !== null) invalid()
  const descriptors = descriptorsOf(value)
  const result = create(null) as Record<string, unknown>
  const keys = ownKeys(descriptors)
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index]
    if (typeof key !== "string" || (!includes(required, key) && !includes(optional, key))) invalid()
    const descriptor = descriptors[key]
    if (!hasOwn(descriptor, "value") || descriptor.enumerable !== true) invalid()
    result[key] = descriptor.value
  }
  for (let index = 0; index < required.length; index++) if (!hasOwn(result, required[index])) invalid()
  return freeze(result)
}
function consumer(value: unknown): void {
  if (typeof value !== "string" || !includes(consumers, value)) invalid()
}
function digest(value: unknown): Sha256Digest {
  if (typeof value !== "string" || apply(regexpExec, digestPattern, [value]) === null) invalid()
  return value as Sha256Digest
}
function snapshotSlot(input: unknown): WorkflowContractV2Slot {
  const value = record(input, ["collectionId", "collectionRoot", "workflowId"])
  if (typeof value.collectionId !== "string" || !value.collectionId.length
    || typeof value.collectionRoot !== "string" || !value.collectionRoot.length
    || typeof value.workflowId !== "string" || value.workflowId.length > 128
    || apply(regexpExec, idPattern, [value.workflowId]) === null) invalid()
  return value as unknown as WorkflowContractV2Slot
}
function current(input: unknown): { slot: WorkflowContractV2Slot } {
  const value = record(input, ["slot", "consumer"])
  consumer(value.consumer)
  return freeze({ slot: snapshotSlot(value.slot) })
}
function failure(error: unknown): { readonly ok: false; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] } {
  const diagnostics = error instanceof WorkflowPlanCompilationError ? error.diagnostics : freeze([
    createWorkflowContractV2Diagnostic({ code: "WF2_PACKAGE_LAYOUT_INVALID", severity: "error",
      message: "Package unavailable.", location: { path: "workflow.yaml", pointer: "" } })
  ])
  return freeze({ ok: false, diagnostics })
}
