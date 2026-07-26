import * as nodePath from "node:path"
import { types as utilTypes } from "node:util"

import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlan,
  type CompiledWorkflowStep
} from "./compiledPlan"
import type { JsonValue } from "./jsonValue"
import { requireActiveWorkflowPlanLeaseHandle, type WorkflowPlanLease } from "./planLease"
import {
  compiledEntryPredicateAllows,
  compiledStartIndex,
  evaluateCompiledPredicateRecord,
  snapshotCompiledExecutionOptions,
  validateCompiledWorkflowInputs
} from "./compiledRunInputs"
import { executeCompiledStep } from "./compiledRunSteps"
import {
  findCompiledStepIndex,
  persistCompiledOutputs
} from "./compiledRunValues"
import type {
  CompiledRuntimeContext,
  CompiledWorkflowRunStore,
  ExecuteCompiledWorkflowRunInput
} from "./compiledRunTypes"
import type { WorkflowRunState } from "../model"

export type {
  CompiledWorkflowExecutionOptions,
  CompiledWorkflowRunStore,
  ExecuteCompiledWorkflowRunInput
} from "./compiledRunTypes"

interface TransitionResult {
  readonly kind: "next" | "end" | "fail" | "checkpoint"
  readonly index?: number
  readonly message?: string
}

const isProxy = utilTypes.isProxy
const AbortSignalConstructor = AbortSignal
const DateConstructor = Date
const dateToISOString = Date.prototype.toISOString
const numberParseInt = Number.parseInt
const StringConstructor = String
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const functionHasInstance = Function.prototype[Symbol.hasInstance]
const INPUT_FIELDS = objectFreeze([
  "lease", "inputs", "options", "workspaceRoot", "runStore", "signal", "agentProvider"
] as const)
const REQUIRED_INPUT_FIELDS = objectFreeze([
  "lease", "inputs", "options", "workspaceRoot", "runStore", "signal"
] as const)
const MAX_STEP_DISPATCHES = 4_096

export async function executeCompiledWorkflowRun(
  input: ExecuteCompiledWorkflowRunInput
): Promise<WorkflowRunState> {
  const snapshot = snapshotExecutionInput(input)
  const lease = snapshot.lease as WorkflowPlanLease
  const handle = requireActiveWorkflowPlanLeaseHandle(lease)
  const privateState = requireCompiledWorkflowPlanState(handle)
  if (privateState.purpose !== "runtime" || !privateState.leaseable || privateState.publication !== "published") {
    throw new TypeError("Compiled workflow execution requires a live published runtime plan lease.")
  }
  const signal = requireAbortSignal(snapshot.signal)
  const runStore = requireRunStore(snapshot.runStore)
  const options = snapshotCompiledExecutionOptions(snapshot.options)
  const runtimeInputs = validateCompiledWorkflowInputs(handle.plan, privateState, snapshot.inputs)
  const outputs = objectCreate(null) as Record<string, JsonValue>
  const context: CompiledRuntimeContext = objectFreeze({ input: runtimeInputs, outputs })

  const run = await runStore.createRunFromPlanLease(lease, runtimeInputs)
  persistCompiledOutputs(run, outputs)
  await runStore.saveRun(run)

  let index = compiledStartIndex(handle.plan, options)
  let dispatches = 0
  while (index >= 0 && index < handle.plan.workflow.steps.length) {
    dispatches += 1
    if (dispatches > MAX_STEP_DISPATCHES) {
      return failRun(runStore, run, "Compiled workflow exceeded its step-dispatch limit.")
    }
    if (signal.aborted) return failRun(runStore, run, "Compiled workflow execution was cancelled.")

    const step = handle.plan.workflow.steps[index]
    const stepState = run.steps[index]
    if (stepState === undefined || stepState.id !== step.id) {
      return failRun(runStore, run, "Compiled workflow run step evidence does not match the plan.")
    }
    run.currentStep = step.id
    run.status = "running"
    stepState.status = "running"
    stepState.attempt = (stepState.attempt ?? 0) + 1
    stepState.startedAt = now()
    delete stepState.completedAt
    delete stepState.error
    await runStore.saveRun(run)

    if (!compiledEntryPredicateAllows(handle.plan, step, index, context)) {
      stepState.status = "completed"
      stepState.completedAt = now()
      run.state[`workflow.contractV2.skipped.${step.id}`] = "true"
      await runStore.saveRun(run)
      if (options.executionMode === "singleStep") return completeRun(runStore, run)
      index += 1
      continue
    }

    let result
    try {
      result = await executeCompiledStep({
        lease,
        plan: handle.plan,
        privateState,
        run,
        runStore,
        workspaceRoot: snapshot.workspaceRoot as string,
        signal,
        agentProvider: snapshot.agentProvider as import("../model").AgentProvider | undefined,
        context,
        step,
        stepIndex: index
      })
    } catch {
      return failStep(runStore, run, index, "Compiled workflow step execution failed.")
    }

    if (result.kind === "held" || result.kind === "failed") return run
    if (options.executionMode === "singleStep") return completeRun(runStore, run)

    const transition = selectCompiledTransition(handle.plan, step, index, context, run)
    if (transition.kind === "end") return completeRun(runStore, run)
    if (transition.kind === "fail") {
      return failRun(runStore, run, transition.message ?? "Compiled workflow transition selected failure.")
    }
    if (transition.kind === "checkpoint") {
      run.status = "checkpoint"
      run.error = transition.message
      await runStore.saveRun(run)
      return run
    }
    index = transition.index ?? index + 1
  }

  return completeRun(runStore, run)
}

function selectCompiledTransition(
  plan: CompiledWorkflowPlan,
  step: CompiledWorkflowStep,
  stepIndex: number,
  context: CompiledRuntimeContext,
  run: WorkflowRunState
): TransitionResult {
  if (step.transition === undefined) return objectFreeze({ kind: "next" as const, index: stepIndex + 1 })
  let selected: typeof step.transition.decisions[number] | undefined
  for (let index = 0; index < step.transition.decisions.length; index += 1) {
    const decision = step.transition.decisions[index]
    if (evaluateCompiledPredicateRecord(
      plan,
      decision.predicate,
      "postCommit",
      "stepTransition",
      stepIndex,
      context
    )) {
      selected = decision
      break
    }
  }
  const goto = selected?.goto ?? step.transition.default.goto
  if (goto === "$end") return objectFreeze({ kind: "end" as const })
  if (goto === "$fail") return objectFreeze({ kind: "fail" as const })
  const target = findCompiledStepIndex(plan.workflow.steps, goto)
  if (target < 0) return objectFreeze({ kind: "fail" as const, message: "Compiled workflow transition target is unavailable." })
  if (target <= stepIndex) {
    const loop = selected?.loop
    if (loop === undefined) return objectFreeze({ kind: "fail" as const, message: "Compiled backward transition lacks loop evidence." })
    const key = `workflow.contractV2.loop.${loop.id}`
    const count = numberParseInt(run.state[key] ?? "0", 10) + 1
    run.state[key] = reflectApply(StringConstructor, undefined, [count]) as string
    if (count > loop.maxIterations) {
      return objectFreeze({ kind: "checkpoint" as const, message: loop.checkpoint.message })
    }
  }
  return objectFreeze({ kind: "next" as const, index: target })
}

async function failStep(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  stepIndex: number,
  message: string
): Promise<WorkflowRunState> {
  const step = run.steps[stepIndex]
  step.status = "failed"
  step.error = message
  step.completedAt = now()
  run.status = "failed"
  run.error = message
  await store.saveRun(run)
  return run
}

async function failRun(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  message: string
): Promise<WorkflowRunState> {
  run.status = "failed"
  run.error = message
  await store.saveRun(run)
  return run
}

async function completeRun(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState
): Promise<WorkflowRunState> {
  run.status = "completed"
  delete run.currentStep
  delete run.error
  await store.saveRun(run)
  return run
}

function snapshotExecutionInput(
  value: unknown
): Readonly<Record<(typeof INPUT_FIELDS)[number], unknown>> {
  if (value === null || typeof value !== "object" || isProxy(value) || objectGetPrototypeOf(value) !== objectPrototype) {
    throw new TypeError("Compiled workflow execution input must be an ordinary non-proxy record.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length < REQUIRED_INPUT_FIELDS.length || keys.length > INPUT_FIELDS.length) {
    throw new TypeError("Compiled workflow execution input has an invalid shape.")
  }
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(INPUT_FIELDS, key)) {
      throw new TypeError("Compiled workflow execution input contains an unknown field.")
    }
    result[key] = dataValue(descriptors[key])
  }
  for (let index = 0; index < REQUIRED_INPUT_FIELDS.length; index += 1) {
    if (!objectHasOwn(result, REQUIRED_INPUT_FIELDS[index])) {
      throw new TypeError("Compiled workflow execution input is missing a required field.")
    }
  }
  if (typeof result.workspaceRoot !== "string" || !nodePath.isAbsolute(result.workspaceRoot)) {
    throw new TypeError("Compiled workflow workspace root must be absolute.")
  }
  return objectFreeze(result) as Readonly<Record<(typeof INPUT_FIELDS)[number], unknown>>
}

function requireRunStore(value: unknown): CompiledWorkflowRunStore {
  if (value === null || typeof value !== "object" || isProxy(value)) {
    throw new TypeError("Compiled workflow run store is invalid.")
  }
  const store = value as Partial<CompiledWorkflowRunStore>
  if (typeof store.createRunFromPlanLease !== "function" || typeof store.saveRun !== "function") {
    throw new TypeError("Compiled workflow run store is invalid.")
  }
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

function now(): string {
  const value = new DateConstructor()
  return reflectApply(dateToISOString, value, []) as string
}
