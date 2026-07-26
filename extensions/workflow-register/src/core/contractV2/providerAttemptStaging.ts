import { types as utilTypes } from "node:util"

export interface WorkflowAttemptStagedArtifact {
  readonly id: string
  readonly bytes: Uint8Array
}

export interface CreateWorkflowAttemptStagingInput {
  readonly idempotencyKey?: string
  readonly stageArtifact: (
    input: WorkflowAttemptStagedArtifact
  ) => Promise<void> | void
}

declare const workflowAttemptStagingBrand: unique symbol
export interface WorkflowAttemptStaging {
  readonly [workflowAttemptStagingBrand]: true
}

interface WorkflowAttemptStagingState {
  readonly idempotencyKey?: string
  readonly stageArtifact: CreateWorkflowAttemptStagingInput["stageArtifact"]
}

export class WorkflowAttemptStagingError extends Error {
  constructor() {
    super("Workflow provider artifact staging failed.")
    this.name = "WorkflowAttemptStagingError"
  }
}

const isProxy = utilTypes.isProxy
const functionHasInstance = Function.prototype[Symbol.hasInstance]
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpTest = RegExp.prototype.test
const typedArraySet = Uint8Array.prototype.set
const Uint8ArrayConstructor = Uint8Array
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, WorkflowAttemptStagingState>,
  key: object
) => WorkflowAttemptStagingState | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, WorkflowAttemptStagingState>,
  key: object,
  value: WorkflowAttemptStagingState
) => WeakMap<object, WorkflowAttemptStagingState>
const states = new WeakMap<object, WorkflowAttemptStagingState>()
const REQUIRED_FIELDS = objectFreeze(["stageArtifact"] as const)
const OPTIONAL_FIELDS = objectFreeze(["idempotencyKey"] as const)
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const ARTIFACT_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u

export function createWorkflowAttemptStaging(
  input: CreateWorkflowAttemptStagingInput
): WorkflowAttemptStaging {
  const snapshot = snapshotInput(input)
  if (typeof snapshot.stageArtifact !== "function" || isProxy(snapshot.stageArtifact)) {
    throw new TypeError("Workflow attempt staging writer is invalid.")
  }
  const idempotencyKey = snapshot.idempotencyKey
  if (
    idempotencyKey !== undefined
    && (
      typeof idempotencyKey !== "string"
      || idempotencyKey.length < 1
      || idempotencyKey.length > 256
      || (reflectApply(regexpTest, CONTROL_PATTERN, [idempotencyKey]) as boolean)
    )
  ) throw new TypeError("Workflow attempt staging idempotency key is invalid.")

  const attempt = objectFreeze({}) as WorkflowAttemptStaging
  weakMapSet(states, attempt, objectFreeze({
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    stageArtifact: snapshot.stageArtifact as CreateWorkflowAttemptStagingInput["stageArtifact"]
  }))
  return attempt
}

/**
 * Returns a new opaque attempt view with the same runtime-owned staging writer
 * and a stable idempotency key. The original attempt remains immutable.
 */
export function withWorkflowAttemptStagingIdempotencyKey(
  attempt: WorkflowAttemptStaging,
  idempotencyKey: string
): WorkflowAttemptStaging {
  const state = requireState(attempt)
  return createWorkflowAttemptStaging({
    idempotencyKey,
    stageArtifact: state.stageArtifact
  })
}

export function workflowAttemptStagingIdempotencyKey(
  attempt: WorkflowAttemptStaging
): string | undefined {
  return requireState(attempt).idempotencyKey
}

export async function stageWorkflowAttemptArtifact(
  attempt: WorkflowAttemptStaging,
  input: WorkflowAttemptStagedArtifact
): Promise<void> {
  const state = requireState(attempt)
  const snapshot = snapshotArtifact(input)
  try {
    await reflectApply(state.stageArtifact, undefined, [snapshot])
  } catch {
    throw new WorkflowAttemptStagingError()
  }
}

function requireState(value: unknown): WorkflowAttemptStagingState {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError("Workflow attempt staging is invalid.")
  }
  const state = weakMapGet(states, value)
  if (state === undefined) throw new TypeError("Workflow attempt staging is invalid.")
  return state
}

function snapshotInput(value: unknown): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow attempt staging input must be an ordinary record.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const result: Record<string, unknown> = {}
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!contains(REQUIRED_FIELDS, key) && !contains(OPTIONAL_FIELDS, key))
    ) throw new TypeError("Workflow attempt staging input contains an unknown field.")
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError("Workflow attempt staging input fields must be enumerable data properties.")
    result[key] = descriptor.value
  }
  if (!objectHasOwn(result, "stageArtifact")) {
    throw new TypeError("Workflow attempt staging input is missing stageArtifact.")
  }
  return objectFreeze(result)
}

function snapshotArtifact(value: unknown): WorkflowAttemptStagedArtifact {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow staged artifact must be an ordinary record.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== 2 || !objectHasOwn(descriptors, "id") || !objectHasOwn(descriptors, "bytes")) {
    throw new TypeError("Workflow staged artifact has an invalid shape.")
  }
  const id = dataValue(descriptors, "id", "Workflow staged artifact id")
  const bytes = dataValue(descriptors, "bytes", "Workflow staged artifact bytes")
  if (
    typeof id !== "string"
    || !(reflectApply(regexpTest, ARTIFACT_ID_PATTERN, [id]) as boolean)
  ) throw new TypeError("Workflow staged artifact id is invalid.")
  if (
    typeof bytes !== "object"
    || bytes === null
    || isProxy(bytes)
    || !(reflectApply(functionHasInstance, Uint8ArrayConstructor, [bytes]) as boolean)
  ) throw new TypeError("Workflow staged artifact bytes must be a Uint8Array.")
  const source = bytes as Uint8Array
  const copy = new Uint8ArrayConstructor(source.byteLength)
  reflectApply(typedArraySet, copy, [source])
  return objectFreeze({ id, bytes: copy })
}

function dataValue(
  descriptors: PropertyDescriptorMap,
  key: string,
  label: string
): unknown {
  const descriptor = descriptors[key]
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError(`${label} must be an enumerable data property.`)
  return descriptor.value
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
