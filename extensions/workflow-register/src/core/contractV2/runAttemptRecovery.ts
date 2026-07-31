import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

import type { WorkflowRunState } from "../model"
import {
  inspectWorkflowArtifactTransactionRecovery,
  type WorkflowArtifactTransactionRecoveryInspection
} from "./artifactTransactionRecovery"
import { canonicalJsonText } from "./canonicalJson"
import type { CompiledWorkflowPlan } from "./compiledPlan"
import { compiledAttemptId, findCompiledProvider } from "./compiledRunValues"
import { parseStrictJson } from "./packageLoaderInput"
import type { Sha256Digest } from "./providerContract"

export interface WorkflowContractV2CommittedArtifactRecoveryEvidence {
  readonly stepId: string
  readonly attemptId: string
  readonly artifactSetDigest: Sha256Digest
}

export type WorkflowContractV2AttemptRecoveryClassification =
  | {
      readonly kind: "clean"
      readonly committed: readonly WorkflowContractV2CommittedArtifactRecoveryEvidence[]
    }
  | {
      readonly kind: "in-doubt"
      readonly stepId: string
      readonly attemptId: string
      readonly artifactStatus: "missing" | "staging" | "orphaned"
      readonly artifactSetDigest?: Sha256Digest
      readonly committed: readonly WorkflowContractV2CommittedArtifactRecoveryEvidence[]
    }
  | { readonly kind: "invalid"; readonly reason: string }

export interface ClassifyWorkflowContractV2AttemptRecoveryInput {
  readonly plan: CompiledWorkflowPlan
  readonly run: WorkflowRunState
  readonly runRoot: string
}

export type InspectWorkflowArtifactTransactionRecovery = (input: {
  readonly runRoot: string
  readonly attemptId: string
  readonly expectedArtifactSetDigest?: Sha256Digest
}) => Promise<WorkflowArtifactTransactionRecoveryInspection>

interface RunStepRecoveryEvidence {
  readonly id: string
  readonly status: string
  readonly attempt?: number
}

interface RunRecoveryEvidence {
  readonly workflowSchemaVersion: string | undefined
  readonly status: string
  readonly currentStep: string | undefined
  readonly state: Readonly<Record<string, unknown>>
  readonly steps: readonly RunStepRecoveryEvidence[]
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const numberIsSafeInteger = Number.isSafeInteger
const nodePathIsAbsolute = nodePath.isAbsolute
const nodePathResolve = nodePath.resolve
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const ATTEMPT_PATTERN = /^attempt-[0-9]{4,}-[0-9]{4,}$/u
const VISIBILITY_PREFIX = "workflow.contractV2.artifactSet."
const MAX_VISIBILITY_BYTES = 1_024
const MAX_STATE_FIELDS = 4_096
const MAX_RUN_STEPS = 512
const INPUT_FIELDS = objectFreeze(["plan", "run", "runRoot"] as const)
const inspectArtifactTransactionCaptured = inspectWorkflowArtifactTransactionRecovery

export const classifyWorkflowContractV2AttemptRecovery =
  createWorkflowContractV2AttemptRecoveryClassifier(inspectArtifactTransactionCaptured)

export function createWorkflowContractV2AttemptRecoveryClassifier(
  inspectTransaction: InspectWorkflowArtifactTransactionRecovery
): (input: ClassifyWorkflowContractV2AttemptRecoveryInput) => Promise<WorkflowContractV2AttemptRecoveryClassification> {
  if (typeof inspectTransaction !== "function" || isProxy(inspectTransaction)) {
    throw new TypeError("Workflow attempt recovery inspector is invalid.")
  }
  return async (input) => classifyAttemptRecovery(input, inspectTransaction)
}

async function classifyAttemptRecovery(
  input: ClassifyWorkflowContractV2AttemptRecoveryInput,
  inspectTransaction: InspectWorkflowArtifactTransactionRecovery
): Promise<WorkflowContractV2AttemptRecoveryClassification> {
  let snapshot: Readonly<ClassifyWorkflowContractV2AttemptRecoveryInput>
  let run: RunRecoveryEvidence
  try {
    snapshot = snapshotInput(input)
    run = snapshotRunEvidence(snapshot.run)
  } catch {
    return invalid("Workflow attempt recovery input is invalid.")
  }
  const plan = snapshot.plan
  if (run.workflowSchemaVersion !== "workflow-register/v2") {
    return invalid("Workflow attempt recovery requires a Contract v2 run.")
  }
  if (!validCompiledPlanCollections(plan)) {
    return invalid("Workflow attempt recovery plan evidence is structurally invalid.")
  }

  const committed: WorkflowContractV2CommittedArtifactRecoveryEvidence[] = []
  try {
    for (let index = 0; index < plan.workflow.steps.length; index += 1) {
      const step = plan.workflow.steps[index]
      if (step.type !== "command") continue
      const provider = findCompiledProvider(plan.providerBindings, step.provider)
      if (provider.sideEffect !== "workspace-write") continue
      const runStep = run.steps[index]
      if (runStep === undefined || runStep.id !== step.id) {
        return invalid("Workflow attempt recovery step evidence does not match its plan.")
      }

      const visibility = visibilityEvidence(run.state[`${VISIBILITY_PREFIX}${step.id}`])
      if (visibility !== undefined) {
        const inspection = await inspectTransaction(objectFreeze({
          runRoot: snapshot.runRoot,
          attemptId: visibility.attemptId,
          expectedArtifactSetDigest: visibility.artifactSetDigest
        }))
        if (
          inspection.status !== "committed"
          || inspection.artifactSetDigest !== visibility.artifactSetDigest
        ) return invalid("Committed workflow artifact evidence is unavailable or inconsistent.")
        committed[committed.length] = objectFreeze({
          stepId: step.id,
          attemptId: visibility.attemptId,
          artifactSetDigest: visibility.artifactSetDigest
        })
      } else if (runStep.status === "completed") {
        return invalid("Completed workspace-write step lacks committed artifact visibility evidence.")
      }

      if (run.status !== "running" || run.currentStep !== step.id) continue
      if (!numberIsSafeInteger(runStep.attempt) || (runStep.attempt ?? 0) < 1) {
        return invalid("Running workspace-write attempt identity is invalid.")
      }
      const attemptId = compiledAttemptId(index, runStep.attempt!)
      if (visibility?.attemptId === attemptId) {
        return invalid("Running workspace-write attempt already claims committed visibility.")
      }
      const inspection = await inspectTransaction(objectFreeze({
        runRoot: snapshot.runRoot,
        attemptId
      }))
      if (inspection.status === "committed") {
        return invalid("Unreferenced workflow artifact inspection returned committed visibility.")
      }
      if (inspection.status === "orphaned") {
        return objectFreeze({
          kind: "in-doubt" as const,
          stepId: step.id,
          attemptId,
          artifactStatus: "orphaned" as const,
          artifactSetDigest: inspection.artifactSetDigest,
          committed: objectFreeze(committed)
        })
      }
      return objectFreeze({
        kind: "in-doubt" as const,
        stepId: step.id,
        attemptId,
        artifactStatus: inspection.status,
        committed: objectFreeze(committed)
      })
    }
  } catch {
    return invalid("Workflow attempt artifact evidence could not be verified.")
  }

  return objectFreeze({ kind: "clean" as const, committed: objectFreeze(committed) })
}

function visibilityEvidence(value: unknown): {
  readonly attemptId: string
  readonly artifactSetDigest: Sha256Digest
} | undefined {
  if (value === undefined) return undefined
  if (typeof value !== "string") {
    throw new TypeError("Workflow artifact visibility evidence must be a string.")
  }
  const bytes = reflectApply(bufferFrom, BufferConstructor, [value, "utf8"]) as Buffer
  if (bytes.byteLength > MAX_VISIBILITY_BYTES) {
    throw new TypeError("Workflow artifact visibility evidence is too large.")
  }
  const parsed = parseStrictJson(bytes, "Workflow artifact visibility evidence")
  if (
    parsed === null
    || typeof parsed !== "object"
    || isProxy(parsed)
    || objectGetPrototypeOf(parsed) !== objectPrototype
    || canonicalJsonText(parsed) !== value
  ) throw new TypeError("Workflow artifact visibility evidence is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(parsed)
  const keys = reflectOwnKeys(descriptors)
  if (
    keys.length !== 2
    || !objectHasOwn(descriptors, "attemptId")
    || !objectHasOwn(descriptors, "artifactSetDigest")
  ) throw new TypeError("Workflow artifact visibility evidence has an invalid shape.")
  const attemptId = dataValue(descriptors.attemptId)
  const artifactSetDigest = dataValue(descriptors.artifactSetDigest)
  if (
    typeof attemptId !== "string"
    || reflectApply(regexpExec, ATTEMPT_PATTERN, [attemptId]) === null
    || typeof artifactSetDigest !== "string"
    || reflectApply(regexpExec, DIGEST_PATTERN, [artifactSetDigest]) === null
  ) throw new TypeError("Workflow artifact visibility evidence is invalid.")
  return objectFreeze({
    attemptId,
    artifactSetDigest: artifactSetDigest as Sha256Digest
  })
}

function snapshotInput(
  value: unknown
): Readonly<ClassifyWorkflowContractV2AttemptRecoveryInput> {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow attempt recovery input is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== INPUT_FIELDS.length) {
    throw new TypeError("Workflow attempt recovery input has an invalid shape.")
  }
  const values = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(INPUT_FIELDS, key)) {
      throw new TypeError("Workflow attempt recovery input contains an unknown field.")
    }
    values[key] = dataValue(descriptors[key])
  }
  for (let index = 0; index < INPUT_FIELDS.length; index += 1) {
    if (!objectHasOwn(values, INPUT_FIELDS[index])) {
      throw new TypeError("Workflow attempt recovery input is missing a field.")
    }
  }
  if (values.plan === null || typeof values.plan !== "object" || isProxy(values.plan)) {
    throw new TypeError("Workflow recovery plan is invalid.")
  }
  if (values.run === null || typeof values.run !== "object" || isProxy(values.run)) {
    throw new TypeError("Workflow recovery run is invalid.")
  }
  if (typeof values.runRoot !== "string" || !nodePathIsAbsolute(values.runRoot)) {
    throw new TypeError("Workflow recovery run root is invalid.")
  }
  return objectFreeze({
    plan: values.plan as CompiledWorkflowPlan,
    run: values.run as WorkflowRunState,
    runRoot: nodePathResolve(values.runRoot)
  })
}

function snapshotRunEvidence(value: unknown): RunRecoveryEvidence {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow attempt recovery run is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const workflowSchemaVersion = optionalString(descriptors.workflowSchemaVersion)
  const status = requiredString(descriptors.status)
  const currentStep = optionalString(descriptors.currentStep)
  const state = snapshotState(dataValue(descriptors.state))
  const steps = snapshotSteps(dataValue(descriptors.steps))
  return objectFreeze({ workflowSchemaVersion, status, currentStep, state, steps })
}

function snapshotState(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError("Workflow attempt recovery state is invalid.")
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) {
    throw new TypeError("Workflow attempt recovery state is invalid.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length > MAX_STATE_FIELDS) throw new TypeError("Workflow attempt recovery state is too large.")
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") throw new TypeError("Workflow attempt recovery state key is invalid.")
    result[key] = dataValue(descriptors[key])
  }
  return objectFreeze(result)
}

function snapshotSteps(value: unknown): readonly RunStepRecoveryEvidence[] {
  if (
    !arrayIsArray(value)
    || isProxy(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
  ) throw new TypeError("Workflow attempt recovery steps are invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const lengthDescriptor = descriptors.length
  if (
    lengthDescriptor === undefined
    || !objectHasOwn(lengthDescriptor, "value")
    || typeof lengthDescriptor.value !== "number"
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || lengthDescriptor.value > MAX_RUN_STEPS
  ) throw new TypeError("Workflow attempt recovery steps have an invalid length.")
  const length = lengthDescriptor.value
  if (reflectOwnKeys(descriptors).length !== length + 1) {
    throw new TypeError("Workflow attempt recovery steps must be dense.")
  }
  const result: RunStepRecoveryEvidence[] = []
  for (let index = 0; index < length; index += 1) {
    result[index] = snapshotStep(dataValue(descriptors[String(index)]))
  }
  return objectFreeze(result)
}

function snapshotStep(value: unknown): RunStepRecoveryEvidence {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError("Workflow attempt recovery step is invalid.")
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const id = requiredString(descriptors.id)
  const status = requiredString(descriptors.status)
  const attemptValue = descriptors.attempt === undefined ? undefined : dataValue(descriptors.attempt)
  if (attemptValue !== undefined && typeof attemptValue !== "number") {
    throw new TypeError("Workflow attempt recovery step attempt is invalid.")
  }
  return objectFreeze({
    id,
    status,
    ...(attemptValue === undefined ? {} : { attempt: attemptValue })
  })
}

function validCompiledPlanCollections(plan: CompiledWorkflowPlan): boolean {
  if (
    plan.workflow === null
    || typeof plan.workflow !== "object"
    || isProxy(plan.workflow)
    || !arrayIsArray(plan.workflow.steps)
    || isProxy(plan.workflow.steps)
    || objectGetPrototypeOf(plan.workflow.steps) !== arrayPrototype
    || !arrayIsArray(plan.providerBindings)
    || isProxy(plan.providerBindings)
    || objectGetPrototypeOf(plan.providerBindings) !== arrayPrototype
  ) return false
  return plan.workflow.steps.length <= MAX_RUN_STEPS
}

function optionalString(descriptor: PropertyDescriptor | undefined): string | undefined {
  if (descriptor === undefined) return undefined
  const value = dataValue(descriptor)
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new TypeError("Workflow attempt recovery string evidence is invalid.")
  return value
}

function requiredString(descriptor: PropertyDescriptor | undefined): string {
  const value = dataValue(descriptor)
  if (typeof value !== "string") throw new TypeError("Workflow attempt recovery string evidence is invalid.")
  return value
}

function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Workflow attempt recovery data field is invalid.")
  return descriptor.value
}

function invalid(reason: string): WorkflowContractV2AttemptRecoveryClassification {
  return objectFreeze({ kind: "invalid" as const, reason })
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}
