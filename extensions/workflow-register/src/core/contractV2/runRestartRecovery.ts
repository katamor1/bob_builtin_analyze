import { types as utilTypes } from "node:util"

import { canonicalJsonText } from "./canonicalJson"
import type { CompiledWorkflowPlan } from "./compiledPlan"
import { compiledAttemptId, findCompiledProvider, findCompiledStepIndex } from "./compiledRunValues"
import { parseStrictJson } from "./packageLoaderInput"
import type {
  WorkflowContractV2AttemptRecoveryClassification
} from "./runAttemptRecovery"
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
    }
  | { readonly kind: "blocked"; readonly reason: string }

export interface ClassifyWorkflowContractV2RestartInput {
  readonly plan: CompiledWorkflowPlan
  readonly run: WorkflowRunState
  readonly attemptRecovery: WorkflowContractV2AttemptRecoveryClassification
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
const MAX_RESTART_EVIDENCE_BYTES = 2_048
const RESTART_PREFIX = "workflow.contractV2.restart."
const RESTART_SCHEMA_VERSION = "workflow-restart-preparation/v1" as const

export function workflowContractV2RestartStateKey(stepId: string): string {
  if (typeof stepId !== "string" || stepId.length === 0) {
    throw new TypeError("Workflow restart step id is invalid.")
  }
  return `${RESTART_PREFIX}${stepId}`
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

  const prepared = preparedDecision(run, stepIndex, provider.id, provider.idempotency)
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
  let artifactStatus: WorkflowContractV2RestartArtifactStatus = "none"
  if (provider.sideEffect === "workspace-write") {
    if (
      input.attemptRecovery.kind !== "in-doubt"
      || input.attemptRecovery.stepId !== step.id
      || input.attemptRecovery.attemptId !== expectedAttemptId
    ) return blocked("Workflow restart artifact attempt evidence does not match the running step.")
    artifactStatus = input.attemptRecovery.artifactStatus
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
    artifactStatus
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
    artifactStatus: decision.artifactStatus
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

function preparedDecision(
  run: WorkflowRunState,
  stepIndex: number,
  providerId: string,
  idempotency: "idempotent" | "key-required"
): Extract<WorkflowContractV2RestartDecision, { readonly kind: "restart" }> | undefined {
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
  if (keys.length !== 7) throw new TypeError("Workflow restart preparation evidence has an invalid shape.")
  const schemaVersion = dataValue(descriptors.schemaVersion)
  const recordedStepId = dataValue(descriptors.stepId)
  const recordedProviderId = dataValue(descriptors.providerId)
  const recordedPreviousAttempt = dataValue(descriptors.previousAttempt)
  const recordedNextAttempt = dataValue(descriptors.nextAttempt)
  const recordedIdempotency = dataValue(descriptors.idempotency)
  const artifactStatus = dataValue(descriptors.artifactStatus)
  if (
    schemaVersion !== RESTART_SCHEMA_VERSION
    || recordedStepId !== step.id
    || recordedProviderId !== providerId
    || recordedPreviousAttempt !== previousAttempt
    || recordedNextAttempt !== previousAttempt + 1
    || recordedIdempotency !== idempotency
    || !isArtifactStatus(artifactStatus)
  ) throw new TypeError("Workflow restart preparation evidence does not match the run.")
  return objectFreeze({
    kind: "restart" as const,
    prepared: true,
    stepId: step.id,
    stepIndex,
    providerId,
    previousAttempt,
    nextAttempt: previousAttempt + 1,
    idempotency,
    artifactStatus
  })
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

function blocked(reason: string): WorkflowContractV2RestartDecision {
  return objectFreeze({ kind: "blocked" as const, reason })
}
