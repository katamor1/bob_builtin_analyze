import { types as utilTypes } from "node:util"

import { canonicalJsonBytes } from "./canonicalJson"
import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlanPrivateState,
  type CompiledWorkflowStep
} from "./compiledPlan"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic,
  type WorkflowContractV2DiagnosticCode,
  type WorkflowContractV2DiagnosticLocation
} from "./diagnostics"
import {
  validateLocalJsonSchemaViewValue,
  type CompiledLocalJsonSchemaView
} from "./jsonSchemaCatalog"
import type { JsonValue } from "./jsonValue"
import { requireActiveWorkflowPlanLeaseHandle, type WorkflowPlanLease } from "./planLease"
import {
  stageWorkflowAttemptArtifact,
  workflowAttemptStagingIdempotencyKey,
  WorkflowAttemptStagingError,
  type WorkflowAttemptStaging
} from "./providerAttemptStaging"
import type {
  WorkflowProviderArtifactWriter,
  WorkflowProviderDispatchInput,
  WorkflowProviderEffectInput,
  WorkflowProviderIdempotencyInput
} from "./providerContract"
import {
  invokeBoundWorkflowProviderDispatch,
  type BoundWorkflowProviderDispatchHandle,
  type WorkflowProviderLockEvidence
} from "./providerRegistry"

export interface InvokeCompiledWorkflowProviderInput {
  readonly lease: WorkflowPlanLease
  readonly stepId: string
  readonly value: unknown
  readonly signal: AbortSignal
  readonly attempt: WorkflowAttemptStaging
}

export type CompiledProviderInvocationOutput =
  | { readonly kind: "unit" }
  | { readonly kind: "value"; readonly value: JsonValue }

export type CompiledProviderInvocationResult =
  | {
      readonly ok: true
      readonly output: CompiledProviderInvocationOutput
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly failure: "provider-error"
      readonly error: JsonValue
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly failure: "validation"
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

interface InvocationBinding {
  readonly step: Extract<CompiledWorkflowStep, { readonly type: "command" }>
  readonly stepIndex: number
  readonly provider: WorkflowProviderLockEvidence
  readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
  readonly inputSchema: CompiledLocalJsonSchemaView
  readonly outputSchema?: CompiledLocalJsonSchemaView
  readonly errorSchema: CompiledLocalJsonSchemaView
}

interface ProviderEffectSession {
  readonly effect: WorkflowProviderEffectInput
  close(): void
}

const isProxy = utilTypes.isProxy
const AbortSignalConstructor = AbortSignal
const Uint8ArrayConstructor = Uint8Array
const arrayPush = Array.prototype.push
const canonicalJsonBytesCaptured = canonicalJsonBytes
const createDiagnosticCaptured = createWorkflowContractV2Diagnostic
const functionHasInstance = Function.prototype[Symbol.hasInstance]
const invokeDispatchCaptured = invokeBoundWorkflowProviderDispatch
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const promiseAll = Function.prototype.call.bind(Promise.all, Promise) as <T>(
  values: Iterable<T | PromiseLike<T>>
) => Promise<Awaited<T>[]>
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const requireLeaseHandleCaptured = requireActiveWorkflowPlanLeaseHandle
const requirePlanStateCaptured = requireCompiledWorkflowPlanState
const stageArtifactCaptured = stageWorkflowAttemptArtifact
const stagingKeyCaptured = workflowAttemptStagingIdempotencyKey
const typedArraySet = Uint8Array.prototype.set
const validateSchemaCaptured = validateLocalJsonSchemaViewValue
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []
const INPUT_FIELDS = objectFreeze(["lease", "stepId", "value", "signal", "attempt"] as const)
const ARTIFACT_FIELDS = objectFreeze(["id", "bytes"] as const)
const STEP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const ARTIFACT_ID_PATTERN = STEP_ID_PATTERN
const MAX_VALUE_BYTES = 16_777_216

export async function invokeCompiledWorkflowProvider(
  input: InvokeCompiledWorkflowProviderInput
): Promise<CompiledProviderInvocationResult> {
  const snapshot = snapshotExactRecord(
    input,
    INPUT_FIELDS,
    "Compiled workflow provider invocation"
  )
  const handle = requireLeaseHandleCaptured(snapshot.lease)
  const state = requirePlanStateCaptured(handle)
  if (state.purpose !== "runtime" || !state.leaseable || state.publication !== "published") {
    throw new TypeError("Compiled workflow provider invocation requires a live runtime plan lease.")
  }
  const stepId = requireStepId(snapshot.stepId)
  requireSignal(snapshot.signal)
  const attempt = snapshot.attempt as WorkflowAttemptStaging
  const idempotencyKey = stagingKeyCaptured(attempt)
  const binding = invocationBinding(handle.plan.workflow.steps, handle.plan.providerBindings, state, stepId)
  const inputLocation = location(binding.stepIndex, "input")
  const validatedInput = validateSchemaCaptured({
    compiled: binding.inputSchema,
    value: snapshot.value,
    diagnosticCode: "WF2_PROVIDER_INPUT_INVALID",
    location: inputLocation
  })
  if (!validatedInput.ok) return validationFailure(validatedInput.diagnostics)
  if (!withinValueLimit(validatedInput.value, MAX_VALUE_BYTES)) {
    return validationFailure(singleDiagnostic(
      "WF2_PROVIDER_INPUT_INVALID",
      inputLocation,
      "Workflow provider input exceeds the allowed byte limit."
    ))
  }

  const pendingWrites: Promise<void>[] = []
  const idempotency = providerIdempotency(binding.provider, idempotencyKey)
  const effectSession = providerEffect(binding.provider, attempt, pendingWrites)
  const dispatchInput = objectFreeze({
    value: validatedInput.value,
    signal: snapshot.signal as AbortSignal,
    idempotency,
    effect: effectSession.effect
  }) as WorkflowProviderDispatchInput

  let returned: unknown
  try {
    returned = await invokeDispatchCaptured(binding.dispatchHandle, dispatchInput)
  } catch (error) {
    effectSession.close()
    if (isInstance(WorkflowAttemptStagingError, error)) throw error
    const errorLocation = location(binding.stepIndex, "provider")
    const validatedError = validateSchemaCaptured({
      compiled: binding.errorSchema,
      value: error,
      diagnosticCode: "WF2_PROVIDER_ERROR_INVALID",
      location: errorLocation
    })
    if (!validatedError.ok) return validationFailure(validatedError.diagnostics)
    if (!withinValueLimit(validatedError.value, MAX_VALUE_BYTES)) {
      return validationFailure(singleDiagnostic(
        "WF2_PROVIDER_ERROR_INVALID",
        errorLocation,
        "Workflow provider error exceeds the allowed byte limit."
      ))
    }
    return objectFreeze({
      ok: false as const,
      failure: "provider-error" as const,
      error: validatedError.value,
      diagnostics: EMPTY_DIAGNOSTICS
    })
  }

  effectSession.close()
  await promiseAll(pendingWrites)
  if (binding.provider.output.kind === "unit") {
    if (returned !== undefined) {
      return validationFailure(singleDiagnostic(
        "WF2_PROVIDER_OUTPUT_INVALID",
        location(binding.stepIndex, "output"),
        "Workflow unit provider returned a value."
      ))
    }
    return objectFreeze({
      ok: true as const,
      output: objectFreeze({ kind: "unit" as const }),
      diagnostics: EMPTY_DIAGNOSTICS
    })
  }

  if (binding.outputSchema === undefined || binding.step.output.kind !== "value") {
    throw new TypeError("Compiled workflow provider output schema is unavailable.")
  }
  const outputLocation = location(binding.stepIndex, "output")
  const validatedOutput = validateSchemaCaptured({
    compiled: binding.outputSchema,
    value: returned,
    diagnosticCode: "WF2_PROVIDER_OUTPUT_INVALID",
    location: outputLocation
  })
  if (!validatedOutput.ok) return validationFailure(validatedOutput.diagnostics)
  const maximum = binding.step.output.maxBytes < MAX_VALUE_BYTES
    ? binding.step.output.maxBytes
    : MAX_VALUE_BYTES
  if (!withinValueLimit(validatedOutput.value, maximum)) {
    return validationFailure(singleDiagnostic(
      "WF2_PROVIDER_OUTPUT_INVALID",
      outputLocation,
      "Workflow provider output exceeds the allowed byte limit."
    ))
  }
  return objectFreeze({
    ok: true as const,
    output: objectFreeze({ kind: "value" as const, value: validatedOutput.value }),
    diagnostics: EMPTY_DIAGNOSTICS
  })
}

function invocationBinding(
  steps: readonly CompiledWorkflowStep[],
  providers: readonly WorkflowProviderLockEvidence[],
  state: CompiledWorkflowPlanPrivateState,
  stepId: string
): InvocationBinding {
  let stepIndex = -1
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].id === stepId) {
      stepIndex = index
      break
    }
  }
  if (stepIndex < 0) throw new TypeError("Compiled workflow provider step is unavailable.")
  const step = steps[stepIndex]
  if (step.type !== "command") {
    throw new TypeError("Compiled workflow provider step is not a command step.")
  }
  const provider = findProviderEvidence(providers, step.provider)
  const privateProvider = findPrivateProvider(state, step.provider)
  const inputSchema = findSchema(state, provider.inputSchema.id)
  const errorSchema = findSchema(state, provider.errorSchema.id)
  const outputSchema = provider.output.kind === "value"
    ? findSchema(state, provider.output.schema.id)
    : undefined
  return objectFreeze({
    step,
    stepIndex,
    provider,
    dispatchHandle: privateProvider.dispatchHandle,
    inputSchema,
    ...(outputSchema === undefined ? {} : { outputSchema }),
    errorSchema
  })
}

function providerIdempotency(
  provider: WorkflowProviderLockEvidence,
  key: string | undefined
): WorkflowProviderIdempotencyInput {
  if (provider.idempotency === "idempotent") {
    return objectFreeze({ mode: "idempotent" as const })
  }
  if (provider.idempotency === "non-idempotent") {
    return objectFreeze({ mode: "non-idempotent" as const })
  }
  if (key === undefined) {
    throw new TypeError("Key-required workflow provider invocation is missing its stable idempotency key.")
  }
  return objectFreeze({ mode: "key-required" as const, key })
}

function providerEffect(
  provider: WorkflowProviderLockEvidence,
  attempt: WorkflowAttemptStaging,
  pendingWrites: Promise<void>[]
): ProviderEffectSession {
  if (provider.sideEffect === "none") {
    return objectFreeze({ effect: objectFreeze({ kind: "none" as const }), close: objectFreeze(() => {}) })
  }
  if (provider.sideEffect === "external") {
    return objectFreeze({ effect: objectFreeze({ kind: "external" as const }), close: objectFreeze(() => {}) })
  }
  return createArtifactWriterSession(attempt, pendingWrites)
}

function createArtifactWriterSession(
  attempt: WorkflowAttemptStaging,
  pendingWrites: Promise<void>[]
): ProviderEffectSession {
  let open = true
  const writeArtifact = objectFreeze((input: { readonly id: string; readonly bytes: Uint8Array }): Promise<void> => {
    if (!open) throw new TypeError("Workflow provider artifact writer is closed.")
    const snapshot = snapshotExactRecord(input, ARTIFACT_FIELDS, "Workflow provider artifact write")
    const id = snapshot.id
    const bytes = snapshot.bytes
    if (
      typeof id !== "string"
      || reflectApply(regexpExec, ARTIFACT_ID_PATTERN, [id]) === null
    ) throw new TypeError("Workflow provider artifact id is invalid.")
    if (
      typeof bytes !== "object"
      || bytes === null
      || isProxy(bytes)
      || !isInstance(Uint8ArrayConstructor, bytes)
    ) throw new TypeError("Workflow provider artifact bytes must be a Uint8Array.")
    const source = bytes as Uint8Array
    const copy = new Uint8ArrayConstructor(source.byteLength)
    reflectApply(typedArraySet, copy, [source])
    const pending = stageArtifactCaptured(attempt, objectFreeze({ id, bytes: copy }))
    push(pendingWrites, pending)
    return pending
  })
  const writer = objectFreeze({ writeArtifact }) as WorkflowProviderArtifactWriter
  const close = objectFreeze((): void => { open = false })
  return objectFreeze({
    effect: objectFreeze({ kind: "workspace-write" as const, artifacts: writer }),
    close
  })
}

function findProviderEvidence(
  values: readonly WorkflowProviderLockEvidence[],
  id: string
): WorkflowProviderLockEvidence {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].id === id) return values[index]
  }
  throw new TypeError("Compiled workflow provider evidence is unavailable.")
}

function findPrivateProvider(
  state: CompiledWorkflowPlanPrivateState,
  id: string
): CompiledWorkflowPlanPrivateState["providers"][number] {
  for (let index = 0; index < state.providers.length; index += 1) {
    if (state.providers[index].id === id) return state.providers[index]
  }
  throw new TypeError("Compiled workflow provider dispatch handle is unavailable.")
}

function findSchema(
  state: CompiledWorkflowPlanPrivateState,
  id: string
): CompiledLocalJsonSchemaView {
  for (let index = 0; index < state.schemas.length; index += 1) {
    if (state.schemas[index].id === id) return state.schemas[index].compiled
  }
  throw new TypeError("Compiled workflow provider schema is unavailable.")
}

function validationFailure(
  diagnostics: readonly WorkflowContractV2Diagnostic[]
): CompiledProviderInvocationResult {
  return objectFreeze({
    ok: false as const,
    failure: "validation" as const,
    diagnostics
  })
}

function singleDiagnostic(
  code: WorkflowContractV2DiagnosticCode,
  locationValue: WorkflowContractV2DiagnosticLocation,
  message: string
): readonly WorkflowContractV2Diagnostic[] {
  return objectFreeze([createDiagnosticCaptured({
    code,
    severity: "error",
    message,
    location: locationValue
  })])
}

function location(
  stepIndex: number,
  field: "input" | "output" | "provider"
): WorkflowContractV2DiagnosticLocation {
  return objectFreeze({ path: "workflow.yaml", pointer: `/steps/${stepIndex}/${field}` })
}

function withinValueLimit(value: JsonValue, maximum: number): boolean {
  return canonicalJsonBytesCaptured(value).byteLength <= maximum
}

function requireStepId(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < 1
    || value.length > 128
    || reflectApply(regexpExec, STEP_ID_PATTERN, [value]) === null
  ) throw new TypeError("Compiled workflow provider step id is invalid.")
  return value
}

function requireSignal(value: unknown): asserts value is AbortSignal {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || !isInstance(AbortSignalConstructor, value)
  ) throw new TypeError("Compiled workflow provider abort signal is invalid.")
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(fields, key)) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const descriptor = descriptors[field]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${field} must be an enumerable own data property.`)
    result[field] = descriptor.value
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

function isInstance(constructor: Function, value: unknown): boolean {
  return reflectApply(functionHasInstance, constructor, [value]) as boolean
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
