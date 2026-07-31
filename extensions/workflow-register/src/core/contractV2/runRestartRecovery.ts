import { types as utilTypes } from "node:util"

import { canonicalJsonDigest, canonicalJsonText } from "./canonicalJson"
import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlan
} from "./compiledPlan"
import { validateCompiledWorkflowInputs } from "./compiledRunInputs"
import type { CompiledRuntimeContext } from "./compiledRunTypes"
import {
  compiledAttemptId,
  findCompiledProvider,
  findCompiledStepIndex,
  restoreCompiledOutputs
} from "./compiledRunValues"
import { parseStrictJson } from "./packageLoaderInput"
import {
  requireActiveWorkflowPlanLeaseHandle,
  type WorkflowPlanLease
} from "./planLease"
import {
  createCompiledProviderEffectIntent,
  decodeWorkflowProviderEffectIntent,
  encodeWorkflowProviderEffectIntent,
  providerEffectIntentStateKey,
  type WorkflowProviderEffectIntentV1
} from "./providerEffectIntent"
import type {
  WorkflowContractV2AttemptRecoveryClassification
} from "./runAttemptRecovery"
import type { Sha256Digest } from "./providerContract"
import type { WorkflowRunState } from "../model"

export type WorkflowContractV2RestartArtifactStatus =
  | "none"
  | "missing"
  | "staging"
  | "orphaned"

export type WorkflowContractV2RestartDecision =
  | {
      readonly kind: "restart"
      readonly prepared: boolean
      readonly stepId: string
      readonly stepIndex: number
      readonly providerId: string
      readonly previousAttempt: number
      readonly nextAttempt: number
      readonly idempotency: "idempotent" | "key-required"
      readonly artifactStatus: WorkflowContractV2RestartArtifactStatus
      readonly artifactSetDigest?: Sha256Digest
      readonly effectIntentDigest: Sha256Digest
    }
  | { readonly kind: "blocked"; readonly reason: string }

export interface ClassifyWorkflowContractV2RestartInput {
  readonly plan: CompiledWorkflowPlan
  readonly run: WorkflowRunState
  readonly attemptRecovery: WorkflowContractV2AttemptRecoveryClassification
  readonly effectIntent: WorkflowProviderEffectIntentV1
}

const isProxy = utilTypes.isProxy
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const numberIsSafeInteger = Number.isSafeInteger
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const MAX_RESTART_EVIDENCE_BYTES = 2_048
const RESTART_PREFIX = "workflow.contractV2.restart."
const RESTART_SCHEMA_VERSION = "workflow-restart-preparation/v1" as const
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const PREPARATION_REQUIRED_FIELDS = objectFreeze([
  "schemaVersion",
  "stepId",
  "providerId",
  "previousAttempt",
  "nextAttempt",
  "idempotency",
  "artifactStatus",
  "effectIntentDigest"
] as const)
const PREPARATION_OPTIONAL_FIELDS = objectFreeze(["artifactSetDigest"] as const)

export function workflowContractV2RestartStateKey(stepId: string): string {
  if (typeof stepId !== "string" || stepId.length === 0) {
    throw new TypeError("Workflow restart step id is invalid.")
  }
  return `${RESTART_PREFIX}${stepId}`
}

export function expectedWorkflowContractV2RestartEffectIntent(
  lease: WorkflowPlanLease,
  run: WorkflowRunState
): WorkflowProviderEffectIntentV1 {
  const handle = requireActiveWorkflowPlanLeaseHandle(lease)
  const privateState = requireCompiledWorkflowPlanState(handle)
  if (
    privateState.purpose !== "runtime"
    || !privateState.leaseable
    || privateState.publication !== "published"
  ) throw new TypeError("Workflow restart requires a live published runtime lease.")
  if (
    run === null
    || typeof run !== "object"
    || isProxy(run)
    || run.workflowSchemaVersion !== "workflow-register/v2"
    || typeof run.currentStep !== "string"
  ) throw new TypeError("Workflow restart run is invalid.")
  const stepIndex = findCompiledStepIndex(handle.plan.workflow.steps, run.currentStep)
  if (stepIndex < 0) throw new TypeError("Workflow restart step is unavailable in the recorded plan.")
  const step = handle.plan.workflow.steps[stepIndex]
  if (step.type !== "command") {
    throw new TypeError("Workflow restart effect intent requires a command step.")
  }
  const runtimeInputs = validateCompiledWorkflowInputs(handle.plan, privateState, run.inputs)
  const context: CompiledRuntimeContext = objectFreeze({
    input: runtimeInputs,
    outputs: restoreCompiledOutputs(handle.plan, run)
  })
  return createCompiledProviderEffectIntent({
    plan: handle.plan,
    planDigest: handle.planDigest,
    run,
    context,
    step,
    stepIndex
  })
}

export function classifyWorkflowContractV2Restart(
  input: ClassifyWorkflowContractV2RestartInput
): WorkflowContractV2RestartDecision {
  if (
    input === null
    || typeof input !== "object"
    || isProxy(input)
    || objectGetPrototypeOf(input) !== objectPrototype
  ) return blocked("Workflow restart input is invalid.")
  const plan = input.plan
  const run = input.run
  if (
    plan === null
    || typeof plan !== "object"
    || run === null
    || typeof run !== "object"
    || isProxy(plan)
    || isProxy(run)
  ) return blocked("Workflow restart evidence is invalid.")
  if (run.workflowSchemaVersion !== "workflow-register/v2") {
    return blocked("Workflow restart requires a Contract v2 run.")
  }
  if (typeof run.currentStep !== "string") {
    return blocked("Workflow restart requires a durable current step.")
  }

  const stepIndex = findCompiledStepIndex(plan.workflow.steps, run.currentStep)
  if (stepIndex < 0) return blocked("Workflow restart step is unavailable in the recorded plan.")
  const step = plan.workflow.steps[stepIndex]
  const runStep = run.steps[stepIndex]
  if (step.type !== "command" || runStep === undefined || runStep.id !== step.id) {
    return blocked("Workflow restart supports only the exact running command step.")
  }
  const provider = findCompiledProvider(plan.providerBindings, step.provider)
  const policy = plan.workflow.resumePolicy
  if (policy.mode !== "restart-step") {
    return blocked("Workflow restart is blocked by the fail-closed resume policy.")
  }
  if (
    provider.idempotency !== "idempotent"
    && provider.idempotency !== "key-required"
  ) {
    return blocked("A non-idempotent provider outcome remains in doubt and cannot be restarted automatically.")
  }

  const effectIntentDigest = verifiedEffectIntentDigest(run, step.id, input.effectIntent)
  if (effectIntentDigest === undefined) {
    return blocked("Workflow restart effect intent is missing, changed, or inconsistent with the exact retry input.")
  }
  const prepared = preparedDecision(
    run,
    stepIndex,
    provider.id,
    provider.idempotency,
    effectIntentDigest,
    input.effectIntent,
    input.attemptRecovery
  )
  if (prepared !== undefined) return prepared

  if (run.status !== "running" || runStep.status !== "running") {
    return blocked("Workflow restart requires one running in-doubt attempt.")
  }
  if (!numberIsSafeInteger(runStep.attempt) || (runStep.attempt ?? 0) < 1) {
    return blocked("Workflow restart attempt evidence is invalid.")
  }
  const previousAttempt = runStep.attempt!
  if (previousAttempt >= policy.maxAttempts) {
    return blocked("Workflow restart attempt limit is exhausted.")
  }

  const expectedAttemptId = compiledAttemptId(stepIndex, previousAttempt)
  if (input.effectIntent.attemptId !== expectedAttemptId) {
    return blocked("Workflow restart effect intent attempt does not match the running step.")
  }
  let artifactStatus: WorkflowContractV2RestartArtifactStatus = "none"
  let artifactSetDigest: Sha256Digest | undefined
  if (provider.sideEffect === "workspace-write") {
    if (
      input.attemptRecovery.kind !== "in-doubt"
      || input.attemptRecovery.stepId !== step.id
      || input.attemptRecovery.attemptId !== expectedAttemptId
    ) return blocked("Workflow restart artifact attempt evidence does not match the running step.")
    artifactStatus = input.attemptRecovery.artifactStatus
    artifactSetDigest = input.attemptRecovery.artifactSetDigest
    if ((artifactStatus === "orphaned") !== (artifactSetDigest !== undefined)) {
      return blocked("Workflow restart orphaned artifact evidence is incomplete or inconsistent.")
    }
  } else if (input.attemptRecovery.kind !== "clean") {
    return blocked("Workflow restart contains unrelated in-doubt artifact evidence.")
  }

  return objectFreeze({
    kind: "restart" as const,
    prepared: false,
    stepId: step.id,
    stepIndex,
    providerId: provider.id,
    previousAttempt,
    nextAttempt: previousAttempt + 1,
    idempotency: provider.idempotency,
    artifactStatus,
    ...(artifactSetDigest === undefined ? {} : { artifactSetDigest }),
    effectIntentDigest
  })
}

export function prepareWorkflowContractV2Restart(
  run: WorkflowRunState,
  decision: Extract<WorkflowContractV2RestartDecision, { readonly kind: "restart" }>
): WorkflowRunState {
  if (decision.prepared) return run
  if (
    run === null
    || typeof run !== "object"
    || isProxy(run)
    || run.workflowSchemaVersion !== "workflow-register/v2"
    || run.status !== "running"
    || run.currentStep !== decision.stepId
  ) throw new TypeError("Workflow restart run no longer matches its decision.")
  const step = run.steps[decision.stepIndex]
  if (
    step === undefined
    || step.id !== decision.stepId
    || step.status !== "running"
    || step.attempt !== decision.previousAttempt
  ) throw new TypeError("Workflow restart step no longer matches its decision.")

  const evidence = objectFreeze({
    schemaVersion: RESTART_SCHEMA_VERSION,
    stepId: decision.stepId,
    providerId: decision.providerId,
    previousAttempt: decision.previousAttempt,
    nextAttempt: decision.nextAttempt,
    idempotency: decision.idempotency,
    artifactStatus: decision.artifactStatus,
    ...(decision.artifactSetDigest === undefined
      ? {}
      : { artifactSetDigest: decision.artifactSetDigest }),
    effectIntentDigest: decision.effectIntentDigest
  })
  run.state[workflowContractV2RestartStateKey(decision.stepId)] = canonicalJsonText(evidence)
  run.status = "paused"
  delete run.error
  step.status = "failed"
  step.error = "Previous Contract v2 attempt outcome was in doubt; restart is authorized by provider idempotency policy."
  return run
}

export function clearWorkflowContractV2RestartPreparation(
  run: WorkflowRunState,
  stepId: string
): void {
  delete run.state[workflowContractV2RestartStateKey(stepId)]
}

function verifiedEffectIntentDigest(
  run: WorkflowRunState,
  stepId: string,
  expected: WorkflowProviderEffectIntentV1
): Sha256Digest | undefined {
  try {
    const recorded = decodeWorkflowProviderEffectIntent(
      run.state[providerEffectIntentStateKey(stepId)]
    )
    if (encodeWorkflowProviderEffectIntent(recorded) !== encodeWorkflowProviderEffectIntent(expected)) {
      return undefined
    }
    return canonicalJsonDigest(recorded) as Sha256Digest
  } catch {
    return undefined
  }
}

function preparedDecision(
  run: WorkflowRunState,
  stepIndex: number,
  providerId: string,
  idempotency: "idempotent" | "key-required",
  effectIntentDigest: Sha256Digest,
  effectIntent: WorkflowProviderEffectIntentV1,
  attemptRecovery: WorkflowContractV2AttemptRecoveryClassification
): WorkflowContractV2RestartDecision | undefined {
  if (run.status !== "paused") return undefined
  const step = run.steps[stepIndex]
  const previousAttempt = step?.attempt
  if (
    step === undefined
    || step.status !== "failed"
    || typeof previousAttempt !== "number"
    || !numberIsSafeInteger(previousAttempt)
  ) return undefined
  const value = run.state[workflowContractV2RestartStateKey(step.id)]
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new TypeError("Workflow restart preparation evidence is invalid.")
  const bytes = reflectApply(bufferFrom, BufferConstructor, [value, "utf8"]) as Buffer
  if (bytes.byteLength > MAX_RESTART_EVIDENCE_BYTES) {
    throw new TypeError("Workflow restart preparation evidence is too large.")
  }
  const parsed = parseStrictJson(bytes, "Workflow restart preparation evidence")
  if (
    parsed === null
    || typeof parsed !== "object"
    || isProxy(parsed)
    || objectGetPrototypeOf(parsed) !== objectPrototype
    || canonicalJsonText(parsed) !== value
  ) throw new TypeError("Workflow restart preparation evidence is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(parsed)
  const keys = reflectOwnKeys(descriptors)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!contains(PREPARATION_REQUIRED_FIELDS, key)
        && !contains(PREPARATION_OPTIONAL_FIELDS, key))
    ) throw new TypeError("Workflow restart preparation evidence has an invalid shape.")
  }
  for (let index = 0; index < PREPARATION_REQUIRED_FIELDS.length; index += 1) {
    if (!objectHasOwn(descriptors, PREPARATION_REQUIRED_FIELDS[index])) {
      throw new TypeError("Workflow restart preparation evidence is missing a required field.")
    }
  }
  const schemaVersion = dataValue(descriptors.schemaVersion)
  const recordedStepId = dataValue(descriptors.stepId)
  const recordedProviderId = dataValue(descriptors.providerId)
  const recordedPreviousAttempt = dataValue(descriptors.previousAttempt)
  const recordedNextAttempt = dataValue(descriptors.nextAttempt)
  const recordedIdempotency = dataValue(descriptors.idempotency)
  const artifactStatus = dataValue(descriptors.artifactStatus)
  const artifactSetDigest = descriptors.artifactSetDigest === undefined
    ? undefined
    : dataValue(descriptors.artifactSetDigest)
  const recordedEffectIntentDigest = dataValue(descriptors.effectIntentDigest)
  if (
    schemaVersion !== RESTART_SCHEMA_VERSION
    || recordedStepId !== step.id
    || recordedProviderId !== providerId
    || recordedPreviousAttempt !== previousAttempt
    || recordedNextAttempt !== previousAttempt + 1
    || recordedIdempotency !== idempotency
    || !isArtifactStatus(artifactStatus)
    || !isOptionalDigest(artifactSetDigest)
    || (artifactStatus === "orphaned") !== (artifactSetDigest !== undefined)
    || recordedEffectIntentDigest !== effectIntentDigest
  ) throw new TypeError("Workflow restart preparation evidence does not match the run.")
  const expectedAttemptId = compiledAttemptId(stepIndex, previousAttempt)
  if (
    effectIntent.attemptId !== expectedAttemptId
    || !attemptRecoveryMatchesPreparation(
      attemptRecovery,
      step.id,
      expectedAttemptId,
      artifactStatus,
      artifactSetDigest as Sha256Digest | undefined
    )
  ) return blocked("Workflow restart artifact evidence changed after preparation.")
  return objectFreeze({
    kind: "restart" as const,
    prepared: true,
    stepId: step.id,
    stepIndex,
    providerId,
    previousAttempt,
    nextAttempt: previousAttempt + 1,
    idempotency,
    artifactStatus,
    ...(artifactSetDigest === undefined
      ? {}
      : { artifactSetDigest: artifactSetDigest as Sha256Digest }),
    effectIntentDigest
  })
}

function attemptRecoveryMatchesPreparation(
  recovery: WorkflowContractV2AttemptRecoveryClassification,
  stepId: string,
  attemptId: string,
  artifactStatus: WorkflowContractV2RestartArtifactStatus,
  artifactSetDigest: Sha256Digest | undefined
): boolean {
  if (artifactStatus === "none") return recovery.kind === "clean"
  if (
    recovery.kind !== "in-doubt"
    || recovery.stepId !== stepId
    || recovery.attemptId !== attemptId
    || recovery.artifactStatus !== artifactStatus
  ) return false
  return recovery.artifactSetDigest === artifactSetDigest
}

function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Workflow restart preparation field is invalid.")
  return descriptor.value
}

function isArtifactStatus(value: unknown): value is WorkflowContractV2RestartArtifactStatus {
  return value === "none" || value === "missing" || value === "staging" || value === "orphaned"
}

function isOptionalDigest(value: unknown): value is Sha256Digest | undefined {
  return value === undefined || (
    typeof value === "string"
    && reflectApply(regexpExec, DIGEST_PATTERN, [value]) !== null
  )
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

function blocked(reason: string): WorkflowContractV2RestartDecision {
  return objectFreeze({ kind: "blocked" as const, reason })
}
