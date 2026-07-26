import { types as utilTypes } from "node:util"

import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlanHandle
} from "./compiledPlan"
import type { Sha256Digest } from "./providerContract"

export interface WorkflowPlanLease {
  readonly handle: CompiledWorkflowPlanHandle
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly released: boolean
  release(): void
}

interface WorkflowPlanLeaseState {
  readonly handle: CompiledWorkflowPlanHandle
  readonly onRelease: () => void
  released: boolean
}

export interface CreateWorkflowPlanLeaseInput {
  readonly handle: CompiledWorkflowPlanHandle
  readonly onRelease: () => void
}

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectDefineProperties = Object.defineProperties
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, WorkflowPlanLeaseState>,
  key: object
) => WorkflowPlanLeaseState | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, WorkflowPlanLeaseState>,
  key: object,
  value: WorkflowPlanLeaseState
) => WeakMap<object, WorkflowPlanLeaseState>
const states = new WeakMap<object, WorkflowPlanLeaseState>()
const INPUT_FIELDS = objectFreeze(["handle", "onRelease"] as const)

export function createWorkflowPlanLease(input: CreateWorkflowPlanLeaseInput): WorkflowPlanLease {
  const snapshot = snapshotLeaseInput(input)
  const handle = snapshot.handle as CompiledWorkflowPlanHandle
  const onRelease = snapshot.onRelease
  requireCompiledWorkflowPlanState(handle)
  if (typeof onRelease !== "function" || isProxy(onRelease)) {
    throw new TypeError("Workflow plan lease release callback is invalid.")
  }

  const lease = {} as WorkflowPlanLease
  const state: WorkflowPlanLeaseState = {
    handle,
    onRelease: onRelease as () => void,
    released: false
  }
  weakMapSet(states, lease, state)

  const release = objectFreeze((): void => {
    const current = requireLeaseState(lease)
    if (current.released) return
    current.released = true
    current.onRelease()
  })

  objectDefineProperties(lease, {
    handle: { enumerable: true, get: () => requireActiveLeaseState(lease).handle },
    planDigest: { enumerable: true, get: () => requireActiveLeaseState(lease).handle.planDigest },
    packageDigest: { enumerable: true, get: () => requireActiveLeaseState(lease).handle.plan.packageDigest },
    environmentDigest: { enumerable: true, get: () => requireActiveLeaseState(lease).handle.plan.environmentDigest },
    released: { enumerable: true, get: () => requireLeaseState(lease).released },
    release: { enumerable: true, value: release }
  })
  return objectFreeze(lease)
}

/** Internal runtime boundary; intentionally not re-exported from contractV2/index.ts. */
export function requireActiveWorkflowPlanLeaseHandle(
  lease: unknown
): CompiledWorkflowPlanHandle {
  return requireActiveLeaseState(lease).handle
}

function requireLeaseState(lease: unknown): WorkflowPlanLeaseState {
  if (typeof lease !== "object" || lease === null || isProxy(lease)) {
    throw new TypeError("Workflow plan lease is invalid.")
  }
  const state = weakMapGet(states, lease)
  if (state === undefined) throw new TypeError("Workflow plan lease is invalid.")
  return state
}

function requireActiveLeaseState(lease: unknown): WorkflowPlanLeaseState {
  const state = requireLeaseState(lease)
  if (state.released) throw new TypeError("Workflow plan lease has been released.")
  return state
}

function snapshotLeaseInput(value: unknown): Readonly<Record<"handle" | "onRelease", unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError("Workflow plan lease input is invalid.")
  }
  let prototype: object | null
  let descriptors: PropertyDescriptorMap
  try {
    prototype = objectGetPrototypeOf(value)
    descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  } catch {
    throw new TypeError("Workflow plan lease input is invalid.")
  }
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError("Workflow plan lease input is invalid.")
  }
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== INPUT_FIELDS.length) throw new TypeError("Workflow plan lease input is invalid.")
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== "string" || !includes(INPUT_FIELDS, keys[index] as string)) {
      throw new TypeError("Workflow plan lease input is invalid.")
    }
  }
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < INPUT_FIELDS.length; index += 1) {
    const key = INPUT_FIELDS[index]
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError("Workflow plan lease input is invalid.")
    result[key] = descriptor.value
  }
  return objectFreeze(result) as Readonly<Record<"handle" | "onRelease", unknown>>
}

function includes(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
