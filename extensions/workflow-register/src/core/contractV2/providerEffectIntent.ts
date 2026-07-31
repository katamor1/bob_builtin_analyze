import { types as utilTypes } from "node:util"

import { canonicalJsonDigest, canonicalJsonText } from "./canonicalJson"
import type {
  CompiledWorkflowPlan,
  CompiledWorkflowStep
} from "./compiledPlan"
import type { CompiledRuntimeContext } from "./compiledRunTypes"
import {
  compiledAttemptId,
  compiledLogicalEffectOrdinal,
  compiledProviderIdempotencyKey,
  findCompiledProvider,
  resolveCompiledTemplate
} from "./compiledRunValues"
import { parseStrictJson } from "./packageLoaderInput"
import type { Sha256Digest } from "./providerContract"
import type { WorkflowRunState } from "../model"

export const WORKFLOW_PROVIDER_EFFECT_INTENT_SCHEMA_VERSION =
  "workflow-provider-effect-intent/v1" as const

export interface WorkflowProviderEffectIntentV1 {
  readonly schemaVersion: typeof WORKFLOW_PROVIDER_EFFECT_INTENT_SCHEMA_VERSION
  readonly workflowId: string
  readonly runId: string
  readonly stepId: string
  readonly attemptId: string
  readonly logicalEffectOrdinal: number
  readonly inputDigest: Sha256Digest
  readonly planDigest: Sha256Digest
  readonly providerId: string
  readonly providerVersion: string
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly idempotencyKey?: string
}

export interface CreateCompiledProviderEffectIntentInput {
  readonly plan: CompiledWorkflowPlan
  readonly planDigest: Sha256Digest
  readonly run: WorkflowRunState
  readonly context: CompiledRuntimeContext
  readonly step: Extract<CompiledWorkflowStep, { readonly type: "command" }>
  readonly stepIndex: number
}

const isProxy = utilTypes.isProxy
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const numberIsSafeInteger = Number.isSafeInteger
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const REQUIRED_FIELDS = objectFreeze([
  "schemaVersion",
  "workflowId",
  "runId",
  "stepId",
  "attemptId",
  "logicalEffectOrdinal",
  "inputDigest",
  "planDigest",
  "providerId",
  "providerVersion",
  "sideEffect",
  "idempotency"
] as const)
const OPTIONAL_FIELDS = objectFreeze(["idempotencyKey"] as const)
const ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u
const ATTEMPT_PATTERN = /^attempt-[0-9]{4,}-[0-9]{4,}$/u
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const VERSION_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u
const IDEMPOTENCY_KEY_PATTERN = /^wf2:[0-9a-f]{64}$/u
const EFFECT_INTENT_PREFIX = "workflow.contractV2.effectIntent."
const MAX_INTENT_BYTES = 4_096

export function providerEffectIntentStateKey(stepId: string): string {
  return `${EFFECT_INTENT_PREFIX}${requireId(stepId, "step id")}`
}

export function createCompiledProviderEffectIntent(
  input: CreateCompiledProviderEffectIntentInput
): WorkflowProviderEffectIntentV1 {
  if (input === null || typeof input !== "object" || isProxy(input)) {
    throw new TypeError("Compiled provider effect intent input is invalid.")
  }
  if (!numberIsSafeInteger(input.stepIndex) || input.stepIndex < 0) {
    throw new TypeError("Compiled provider effect intent step index is invalid.")
  }
  const plannedStep = input.plan.workflow.steps[input.stepIndex]
  if (plannedStep !== input.step || input.step.type !== "command") {
    throw new TypeError("Compiled provider effect intent step does not match its plan.")
  }
  const runStep = input.run.steps[input.stepIndex]
  if (runStep === undefined || runStep.id !== input.step.id) {
    throw new TypeError("Compiled provider effect intent run step does not match its plan.")
  }
  if (!numberIsSafeInteger(runStep.attempt) || (runStep.attempt ?? 0) < 1) {
    throw new TypeError("Compiled provider effect intent attempt is invalid.")
  }

  const provider = findCompiledProvider(input.plan.providerBindings, input.step.provider)
  const value = resolveCompiledTemplate(input.step.input, input.context)
  const inputDigest = canonicalJsonDigest(value) as Sha256Digest
  const logicalEffectOrdinal = compiledLogicalEffectOrdinal(input.run, input.step.id)
  const idempotencyKey = provider.idempotency === "key-required"
    ? compiledProviderIdempotencyKey({
        runId: input.run.runId,
        stepId: input.step.id,
        logicalEffectOrdinal,
        inputDigest,
        planDigest: input.planDigest,
        provider
      })
    : undefined

  return snapshotIntent({
    schemaVersion: WORKFLOW_PROVIDER_EFFECT_INTENT_SCHEMA_VERSION,
    workflowId: input.plan.workflowId,
    runId: input.run.runId,
    stepId: input.step.id,
    attemptId: compiledAttemptId(input.stepIndex, runStep.attempt!),
    logicalEffectOrdinal,
    inputDigest,
    planDigest: input.planDigest,
    providerId: provider.id,
    providerVersion: provider.exactVersion,
    sideEffect: provider.sideEffect,
    idempotency: provider.idempotency,
    ...(idempotencyKey === undefined ? {} : { idempotencyKey })
  })
}

export function encodeWorkflowProviderEffectIntent(value: unknown): string {
  return canonicalJsonText(snapshotIntent(value))
}

export function decodeWorkflowProviderEffectIntent(value: unknown): WorkflowProviderEffectIntentV1 {
  if (typeof value !== "string") {
    throw new TypeError("Workflow provider effect intent must be a canonical JSON string.")
  }
  const bytes = reflectApply(bufferFrom, BufferConstructor, [value, "utf8"]) as Buffer
  if (bytes.byteLength > MAX_INTENT_BYTES) {
    throw new TypeError("Workflow provider effect intent exceeds its byte limit.")
  }
  const parsed = parseStrictJson(bytes, "Workflow provider effect intent")
  const intent = snapshotIntent(parsed)
  if (canonicalJsonText(intent) !== value) {
    throw new TypeError("Workflow provider effect intent is not canonical.")
  }
  return intent
}

function snapshotIntent(value: unknown): WorkflowProviderEffectIntentV1 {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow provider effect intent is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length < REQUIRED_FIELDS.length || keys.length > REQUIRED_FIELDS.length + OPTIONAL_FIELDS.length) {
    throw new TypeError("Workflow provider effect intent has an invalid shape.")
  }
  const fields = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!contains(REQUIRED_FIELDS, key) && !contains(OPTIONAL_FIELDS, key))
    ) throw new TypeError("Workflow provider effect intent contains an unknown field.")
    fields[key] = dataValue(descriptors[key])
  }
  for (let index = 0; index < REQUIRED_FIELDS.length; index += 1) {
    if (!objectHasOwn(fields, REQUIRED_FIELDS[index])) {
      throw new TypeError("Workflow provider effect intent is missing a required field.")
    }
  }
  if (fields.schemaVersion !== WORKFLOW_PROVIDER_EFFECT_INTENT_SCHEMA_VERSION) {
    throw new TypeError("Workflow provider effect intent schemaVersion is invalid.")
  }
  const workflowId = requireId(fields.workflowId, "workflow id")
  const runId = requirePattern(fields.runId, RUN_ID_PATTERN, "run id")
  const stepId = requireId(fields.stepId, "step id")
  const attemptId = requirePattern(fields.attemptId, ATTEMPT_PATTERN, "attempt id")
  const logicalEffectOrdinal = requirePositiveInteger(fields.logicalEffectOrdinal)
  const inputDigest = requireDigest(fields.inputDigest, "input digest")
  const planDigest = requireDigest(fields.planDigest, "plan digest")
  const providerId = requireId(fields.providerId, "provider id")
  const providerVersion = requirePattern(fields.providerVersion, VERSION_PATTERN, "provider version")
  const sideEffect = requireSideEffect(fields.sideEffect)
  const idempotency = requireIdempotency(fields.idempotency)
  const key = objectHasOwn(fields, "idempotencyKey")
    ? requirePattern(fields.idempotencyKey, IDEMPOTENCY_KEY_PATTERN, "idempotency key")
    : undefined
  if ((idempotency === "key-required") !== (key !== undefined)) {
    throw new TypeError("Workflow provider effect intent idempotency key does not match its contract.")
  }
  return objectFreeze({
    schemaVersion: WORKFLOW_PROVIDER_EFFECT_INTENT_SCHEMA_VERSION,
    workflowId,
    runId,
    stepId,
    attemptId,
    logicalEffectOrdinal,
    inputDigest,
    planDigest,
    providerId,
    providerVersion,
    sideEffect,
    idempotency,
    ...(key === undefined ? {} : { idempotencyKey: key })
  })
}

function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Workflow provider effect intent fields must be enumerable data properties.")
  return descriptor.value
}

function requireId(value: unknown, label: string): string {
  return requirePattern(value, ID_PATTERN, label)
}

function requirePattern(value: unknown, pattern: RegExp, label: string): string {
  if (
    typeof value !== "string"
    || reflectApply(regexpExec, pattern, [value]) === null
  ) throw new TypeError(`Workflow provider effect intent ${label} is invalid.`)
  return value
}

function requireDigest(value: unknown, label: string): Sha256Digest {
  return requirePattern(value, DIGEST_PATTERN, label) as Sha256Digest
}

function requirePositiveInteger(value: unknown): number {
  if (typeof value !== "number" || !numberIsSafeInteger(value) || value < 1) {
    throw new TypeError("Workflow provider effect intent logical ordinal is invalid.")
  }
  return value
}

function requireSideEffect(value: unknown): WorkflowProviderEffectIntentV1["sideEffect"] {
  if (value !== "none" && value !== "workspace-write" && value !== "external") {
    throw new TypeError("Workflow provider effect intent side-effect contract is invalid.")
  }
  return value
}

function requireIdempotency(value: unknown): WorkflowProviderEffectIntentV1["idempotency"] {
  if (value !== "idempotent" && value !== "key-required" && value !== "non-idempotent") {
    throw new TypeError("Workflow provider effect intent idempotency contract is invalid.")
  }
  return value
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
