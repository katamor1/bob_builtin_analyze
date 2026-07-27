import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

import { requireCompiledWorkflowPlanState } from "./compiledPlan"
import type { JsonValue } from "./jsonValue"
import { requireActiveWorkflowPlanLeaseHandle, type WorkflowPlanLease } from "./planLease"
import {
  assertCompiledRequiredArtifactSupport,
  compiledStartIndex,
  snapshotCompiledExecutionOptions,
  validateCompiledWorkflowInputs
} from "./compiledRunInputs"
import { runCompiledWorkflowState } from "./compiledRunLoop"
import {
  findCompiledStepIndex,
  persistCompiledOutputs,
  restoreCompiledOutputs
} from "./compiledRunValues"
import type {
  CompiledRuntimeContext,
  CompiledWorkflowRunStore,
  ContinueCompiledWorkflowRunInput,
  ExecuteCompiledWorkflowRunInput
} from "./compiledRunTypes"
import {
  assertWorkflowContractV2RunPlanProvenanceMatchesLease,
  requireWorkflowContractV2RunPlanLeaseForExecution
} from "./runPlanProvenance"
import type { WorkflowRunState } from "../model"

export type {
  CompiledWorkflowExecutionOptions,
  CompiledWorkflowRunStore,
  ContinueCompiledWorkflowRunInput,
  ExecuteCompiledWorkflowRunInput
} from "./compiledRunTypes"

const isProxy = utilTypes.isProxy
const AbortSignalConstructor = AbortSignal
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const functionHasInstance = Function.prototype[Symbol.hasInstance]
const RUN_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u
const regexpTest = RegExp.prototype.test
const FRESH_INPUT_FIELDS = objectFreeze([
  "lease", "inputs", "options", "workspaceRoot", "runStore", "signal", "agentProvider"
] as const)
const FRESH_REQUIRED_FIELDS = objectFreeze([
  "lease", "inputs", "options", "workspaceRoot", "runStore", "signal"
] as const)
const CONTINUATION_INPUT_FIELDS = objectFreeze([
  "lease", "runId", "options", "workspaceRoot", "runStore", "signal", "agentProvider"
] as const)
const CONTINUATION_REQUIRED_FIELDS = objectFreeze([
  "lease", "runId", "options", "workspaceRoot", "runStore", "signal"
] as const)

export async function executeCompiledWorkflowRun(
  input: ExecuteCompiledWorkflowRunInput
): Promise<WorkflowRunState> {
  const snapshot = snapshotExecutionInput(input, FRESH_INPUT_FIELDS, FRESH_REQUIRED_FIELDS)
  const lease = snapshot.lease as WorkflowPlanLease
  const handle = requireRuntimeHandle(lease)
  const signal = requireAbortSignal(snapshot.signal)
  const runStore = requireRunStore(snapshot.runStore)
  const options = snapshotCompiledExecutionOptions(snapshot.options)
  const runtimeInputs = validateCompiledWorkflowInputs(handle.plan, handle.privateState, snapshot.inputs)
  assertCompiledRequiredArtifactSupport(handle.plan)
  const startIndex = compiledStartIndex(handle.plan, options)
  const outputs = objectCreate(null) as Record<string, JsonValue>
  const context: CompiledRuntimeContext = objectFreeze({ input: runtimeInputs, outputs })

  const run = await runStore.createRunFromPlanLease(lease, runtimeInputs)
  persistCompiledOutputs(run, outputs)
  await runStore.saveRun(run)
  return runCompiledWorkflowState({
    lease,
    plan: handle.plan,
    privateState: handle.privateState,
    run,
    runStore,
    workspaceRoot: snapshot.workspaceRoot as string,
    signal,
    agentProvider: snapshot.agentProvider as import("../model").AgentProvider | undefined,
    context,
    options,
    startIndex
  })
}

export async function continueCompiledWorkflowRun(
  input: ContinueCompiledWorkflowRunInput
): Promise<WorkflowRunState> {
  const snapshot = snapshotExecutionInput(
    input,
    CONTINUATION_INPUT_FIELDS,
    CONTINUATION_REQUIRED_FIELDS
  )
  const lease = snapshot.lease as WorkflowPlanLease
  const handle = requireRuntimeHandle(lease)
  const signal = requireAbortSignal(snapshot.signal)
  const runStore = requireRunStore(snapshot.runStore)
  const options = snapshotCompiledExecutionOptions(snapshot.options)
  const runId = requireRunId(snapshot.runId)
  const loaded = await runStore.loadRun(runId)
  if (loaded === undefined) throw new TypeError("Compiled workflow continuation run is unavailable.")
  const run = requireContinuationRun(
    loaded,
    lease,
    snapshot.workspaceRoot as string
  )
  const runtimeInputs = validateCompiledWorkflowInputs(handle.plan, handle.privateState, run.inputs)
  assertCompiledRequiredArtifactSupport(handle.plan)
  const startIndex = compiledContinuationIndex(handle.plan, run, options)
  const context: CompiledRuntimeContext = objectFreeze({
    input: runtimeInputs,
    outputs: restoreCompiledOutputs(handle.plan, run)
  })
  return runCompiledWorkflowState({
    lease,
    plan: handle.plan,
    privateState: handle.privateState,
    run,
    runStore,
    workspaceRoot: snapshot.workspaceRoot as string,
    signal,
    agentProvider: snapshot.agentProvider as import("../model").AgentProvider | undefined,
    context,
    options,
    startIndex
  })
}

function requireRuntimeHandle(lease: WorkflowPlanLease) {
  const handle = requireActiveWorkflowPlanLeaseHandle(lease)
  const privateState = requireCompiledWorkflowPlanState(handle)
  if (privateState.purpose !== "runtime" || !privateState.leaseable || privateState.publication !== "published") {
    throw new TypeError("Compiled workflow execution requires a live published runtime plan lease.")
  }
  return objectFreeze({ handle, plan: handle.plan, privateState })
}

function requireContinuationRun(
  run: WorkflowRunState,
  lease: WorkflowPlanLease,
  workspaceRoot: string
): WorkflowRunState {
  if (
    run === null
    || typeof run !== "object"
    || isProxy(run)
    || objectGetPrototypeOf(run) !== objectPrototype
  ) throw new TypeError("Compiled workflow continuation run is invalid.")
  if (run.workflowSchemaVersion !== "workflow-register/v2" || run.planProvenance === undefined) {
    throw new TypeError("Compiled workflow continuation requires Contract v2 provenance.")
  }
  const retained = requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot, run)
  if (retained !== lease) {
    throw new TypeError("Compiled workflow continuation requires its exact retained live plan lease.")
  }
  assertWorkflowContractV2RunPlanProvenanceMatchesLease(run.planProvenance, lease)
  if (run.workflowId !== lease.handle.plan.workflowId || run.workflowDefinitionHash !== lease.planDigest) {
    throw new TypeError("Compiled workflow continuation run does not match its plan lease.")
  }
  if (run.status !== "paused" && run.status !== "running") {
    throw new TypeError("Compiled workflow continuation requires a paused or running run.")
  }
  return run
}

function compiledContinuationIndex(
  plan: import("./compiledPlan").CompiledWorkflowPlan,
  run: WorkflowRunState,
  options: Readonly<import("./compiledRunTypes").CompiledWorkflowExecutionOptions>
): number {
  if (options.executionMode !== "singleStep" || options.stepId === undefined) {
    throw new TypeError("In-process compiled continuation requires one explicit step.")
  }
  const index = findCompiledStepIndex(plan.workflow.steps, options.stepId)
  if (index < 0 || run.currentStep !== options.stepId) {
    throw new TypeError("Compiled continuation step does not match the recorded next step.")
  }
  if (options.allowOutOfOrder !== true) {
    for (let prior = 0; prior < index; prior += 1) {
      const state = run.steps[prior]
      const definition = plan.workflow.steps[prior]
      if (state?.status === "completed") continue
      if (state?.status === "failed" && definition?.required === false) continue
      throw new TypeError("Compiled continuation is blocked by an earlier incomplete step.")
    }
  }
  return index
}

function snapshotExecutionInput<
  Fields extends readonly string[],
  Required extends readonly Fields[number][]
>(
  value: unknown,
  fields: Fields,
  required: Required
): Readonly<Record<Fields[number], unknown>> {
  if (value === null || typeof value !== "object" || isProxy(value) || objectGetPrototypeOf(value) !== objectPrototype) {
    throw new TypeError("Compiled workflow execution input must be an ordinary non-proxy record.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length < required.length || keys.length > fields.length) {
    throw new TypeError("Compiled workflow execution input has an invalid shape.")
  }
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(fields, key)) {
      throw new TypeError("Compiled workflow execution input contains an unknown field.")
    }
    result[key] = dataValue(descriptors[key])
  }
  for (let index = 0; index < required.length; index += 1) {
    if (!objectHasOwn(result, required[index])) {
      throw new TypeError("Compiled workflow execution input is missing a required field.")
    }
  }
  if (typeof result.workspaceRoot !== "string" || !nodePath.isAbsolute(result.workspaceRoot)) {
    throw new TypeError("Compiled workflow workspace root must be absolute.")
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function requireRunStore(value: unknown): CompiledWorkflowRunStore {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError("Compiled workflow run store is invalid.")
  }
  const store = value as Partial<CompiledWorkflowRunStore>
  if (
    typeof store.createRunFromPlanLease !== "function"
    || typeof store.saveRun !== "function"
    || typeof store.loadRun !== "function"
  ) throw new TypeError("Compiled workflow run store is invalid.")
  return store as CompiledWorkflowRunStore
}

function requireAbortSignal(value: unknown): AbortSignal {
  if (
    value === null
    || typeof value !== "object"
    || isProxy(value)
    || !(reflectApply(functionHasInstance, AbortSignalConstructor, [value]) as boolean)
  ) throw new TypeError("Compiled workflow abort signal is invalid.")
  return value as AbortSignal
}

function requireRunId(value: unknown): string {
  if (
    typeof value !== "string"
    || !(reflectApply(regexpTest, RUN_ID_PATTERN, [value]) as boolean)
  ) throw new TypeError("Compiled workflow continuation run id is invalid.")
  return value
}

function dataValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Compiled workflow execution input fields must be enumerable data properties.")
  return descriptor.value
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
