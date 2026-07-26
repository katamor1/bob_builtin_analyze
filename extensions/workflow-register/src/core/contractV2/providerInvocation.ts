import { types as utilTypes } from "node:util"

import { canonicalJsonBytes } from "./canonicalJson"
import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlan,
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
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"
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

interface ProviderArtifactPolicy {
  readonly id: string
  readonly maxBytes: number
}

interface InvocationBinding {
  readonly step: Extract<CompiledWorkflowStep, { readonly type: "command" }>
  readonly stepIndex: number
  readonly provider: WorkflowProviderLockEvidence
  readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
  readonly inputSchema: CompiledLocalJsonSchemaView
  readonly outputSchema?: CompiledLocalJsonSchemaView
  readonly errorSchema: CompiledLocalJsonSchemaView
  readonly artifacts: readonly ProviderArtifactPolicy[]
}

interface ProviderEffectSession {
  readonly effect: WorkflowProviderEffectInput
  close(): void
}

const isProxy = utilTypes.isProxy
const AbortSignalConstructor = AbortSignal
const Uint8ArrayConstructor = Uint8Array
const WorkflowAttemptStagingErrorConstructor = WorkflowAttemptStagingError
const arrayPush = Array.prototype.push
const canonicalJsonBytesCaptured = canonicalJsonBytes
const createDiagnosticCaptured = createWorkflowContractV2Diagnostic
const functionHasInstance = Function.prototype[Symbol.hasInstance]
const invokeDispatchCaptured = invokeBoundWorkflowProviderDispatch
const numberIsSafeInteger = Number.isSafeInteger
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const promiseAll = Function.prototype.call.bind(Promise.all, Promise) as <T>(
  values: Iterable<T | PromiseLike<T>>
) => Promise<Awaited<T>[]>
const promiseCatch = Function.prototype.call.bind(Promise.prototype.catch) as (
  promise: Promise<unknown>,
  onRejected: (reason: unknown) => unknown
) => Promise<unknown>
const promiseReject = Promise.reject.bind(Promise) as <T = never>(reason?: unknown) => Promise<T>
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const requireLeaseHandleCaptured = requireActiveWorkflowPlanLeaseHandle
const requirePlanStateCaptured = requireCompiledWorkflowPlanState
const snapshotEnvelopeCaptured = snapshotBoundedWorkflowProviderEnvelope
const stageArtifactCaptured = stageWorkflowAttemptArtifact
const stagingKeyCaptured = workflowAttemptStagingIdempotencyKey
const typedArraySet = Uint8Array.prototype.set
const typedArrayPrototype = objectGetPrototypeOf(Uint8ArrayConstructor.prototype)
const typedArrayByteLengthGetter = typedArrayPrototype === null
  ? undefined
  : objectGetOwnPropertyDescriptor(typedArrayPrototype, "byteLength")?.get
const validateSchemaCaptured = validateLocalJsonSchemaViewValue
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []
const INPUT_FIELDS = objectFreeze(["lease", "stepId", "value", "signal", "attempt"] as const)
const ARTIFACT_FIELDS = objectFreeze(["id", "bytes"] as const)
const STEP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const ARTIFACT_ID_PATTERN = STEP_ID_PATTERN
const MAX_VALUE_BYTES = 16_777_216
const MAX_ARTIFACT_WRITES = 128
const MAX_ARTIFACT_TOTAL_BYTES = 67_108_864

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
  const binding = invocationBinding(
    handle.plan.workflow.steps,
    handle.plan.providerBindings,
    handle.plan.requiredArtifacts,
    state,
    stepId
  )
  const inputLocation = location(binding.stepIndex, "input")
  const boundedInput = snapshotBoundedWorkflowProviderEnvelope(snapshot.value, MAX_VALUE_BYTES)
  if (boundedInput === undefined || !withinValueLimit(boundedInput, MAX_VALUE_BYTES)) {
    return validationFailure(singleDiagnostic(
      "WF2_PROVIDER_INPUT_INVALID",
      inputLocation,
      "Workflow provider input exceeds its structural or byte limit."
    ))
  }
  const validatedInput = validateSchemaCaptured({
    compiled: binding.inputSchema,
    value: boundedInput,
    diagnosticCode: "WF2_PROVIDER_INPUT_INVALID",
    location: inputLocation
  })
  if (!validatedInput.ok) return validationFailure(validatedInput.diagnostics)

  const pendingWrites: Promise<void>[] = []
  const idempotency = providerIdempotency(binding.provider, idempotencyKey)
  const effectSession = providerEffect(binding, attempt, pendingWrites)
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
    await promiseAll(pendingWrites)
    const errorLocation = location(binding.stepIndex, "provider")
    const boundedError = snapshotBoundedWorkflowProviderEnvelope(error, MAX_VALUE_BYTES)
    if (boundedError === undefined || !withinValueLimit(boundedError, MAX_VALUE_BYTES)) {
      return validationFailure(singleDiagnostic(
        "WF2_PROVIDER_ERROR_INVALID",
        errorLocation,
        "Workflow provider error exceeds its structural or byte limit."
      ))
    }
    const validatedError = validateSchemaCaptured({
      compiled: binding.errorSchema,
      value: boundedError,
      diagnosticCode: "WF2_PROVIDER_ERROR_INVALID",
      location: errorLocation
    })
    if (!validatedError.ok) return validationFailure(validatedError.diagnostics)
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
  const maximum = binding.step.output.maxBytes < MAX_VALUE_BYTES
    ? binding.step.output.maxBytes
    : MAX_VALUE_BYTES
  const boundedOutput = snapshotBoundedWorkflowProviderEnvelope(returned, maximum)
  if (boundedOutput === undefined || !withinValueLimit(boundedOutput, maximum)) {
    return validationFailure(singleDiagnostic(
      "WF2_PROVIDER_OUTPUT_INVALID",
      outputLocation,
      "Workflow provider output exceeds its structural or byte limit."
    ))
  }
  const validatedOutput = validateSchemaCaptured({
    compiled: binding.outputSchema,
    value: boundedOutput,
    diagnosticCode: "WF2_PROVIDER_OUTPUT_INVALID",
    location: outputLocation
  })
  if (!validatedOutput.ok) return validationFailure(validatedOutput.diagnostics)
  return objectFreeze({
    ok: true as const,
    output: objectFreeze({ kind: "value" as const, value: validatedOutput.value }),
    diagnostics: EMPTY_DIAGNOSTICS
  })
}

function invocationBinding(
  steps: readonly CompiledWorkflowStep[],
  providers: readonly WorkflowProviderLockEvidence[],
  requiredArtifacts: CompiledWorkflowPlan["requiredArtifacts"],
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
    errorSchema,
    artifacts: providerArtifactPolicies(step, requiredArtifacts)
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
  binding: InvocationBinding,
  attempt: WorkflowAttemptStaging,
  pendingWrites: Promise<void>[]
): ProviderEffectSession {
  if (binding.provider.sideEffect === "none") {
    return objectFreeze({ effect: objectFreeze({ kind: "none" as const }), close: objectFreeze(() => {}) })
  }
  if (binding.provider.sideEffect === "external") {
    return objectFreeze({ effect: objectFreeze({ kind: "external" as const }), close: objectFreeze(() => {}) })
  }
  return createArtifactWriterSession(attempt, pendingWrites, binding.artifacts)
}

function createArtifactWriterSession(
  attempt: WorkflowAttemptStaging,
  pendingWrites: Promise<void>[],
  policies: readonly ProviderArtifactPolicy[]
): ProviderEffectSession {
  let open = true
  let writeCount = 0
  let totalBytes = 0
  const writtenIds: string[] = []
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
    const byteLength = typedArrayByteLength(source)
    const policy = findArtifactPolicy(policies, id)
    if (
      policy === undefined
      || contains(writtenIds, id)
      || writeCount >= MAX_ARTIFACT_WRITES
      || byteLength > policy.maxBytes
      || totalBytes + byteLength > MAX_ARTIFACT_TOTAL_BYTES
    ) return rejectArtifactWrite(pendingWrites)

    writeCount += 1
    totalBytes += byteLength
    push(writtenIds, id)
    const copy = new Uint8ArrayConstructor(byteLength)
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

function providerArtifactPolicies(
  step: Extract<CompiledWorkflowStep, { readonly type: "command" }>,
  requiredArtifacts: CompiledWorkflowPlan["requiredArtifacts"]
): readonly ProviderArtifactPolicy[] {
  if (step.artifacts.length > MAX_ARTIFACT_WRITES) {
    throw new TypeError("Compiled workflow provider artifact collection exceeds its limit.")
  }
  const policies: ProviderArtifactPolicy[] = []
  for (let index = 0; index < step.artifacts.length; index += 1) {
    const id = step.artifacts[index]
    for (let artifactIndex = 0; artifactIndex < requiredArtifacts.length; artifactIndex += 1) {
      const artifact = requiredArtifacts[artifactIndex]
      if (
        artifact.id === id
        && artifact.producedBy === step.id
        && artifact.owner === "provider"
      ) {
        push(policies, objectFreeze({ id, maxBytes: artifact.maxBytes }))
        break
      }
    }
  }
  return objectFreeze(policies)
}

function rejectArtifactWrite(pendingWrites: Promise<void>[]): Promise<void> {
  const pending = promiseReject<void>(new WorkflowAttemptStagingErrorConstructor())
  void promiseCatch(pending, () => undefined)
  push(pendingWrites, pending)
  return pending
}

function typedArrayByteLength(value: Uint8Array): number {
  if (typedArrayByteLengthGetter === undefined) {
    throw new TypeError("Workflow provider artifact byte length intrinsic is unavailable.")
  }
  const result = reflectApply(typedArrayByteLengthGetter, value, []) as unknown
  if (typeof result !== "number" || !numberIsSafeInteger(result) || result < 0) {
    throw new TypeError("Workflow provider artifact byte length is invalid.")
  }
  return result
}

function findArtifactPolicy(
  policies: readonly ProviderArtifactPolicy[],
  id: string
): ProviderArtifactPolicy | undefined {
  for (let index = 0; index < policies.length; index += 1) {
    if (policies[index].id === id) return policies[index]
  }
  return undefined
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
