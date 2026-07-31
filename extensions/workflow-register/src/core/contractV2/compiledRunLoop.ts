import type {
  CompiledWorkflowPlan,
  CompiledWorkflowPlanPrivateState,
  CompiledWorkflowStep
} from "./compiledPlan"
import type { WorkflowPlanLease } from "./planLease"
import {
  compiledEntryPredicateAllows,
  evaluateCompiledPredicateRecord
} from "./compiledRunInputs"
import { executeCompiledStep } from "./compiledRunSteps"
import {
  compiledExecutionOrdinalStateKey,
  compiledLogicalEffectOrdinal,
  findCompiledStepIndex
} from "./compiledRunValues"
import type {
  CompiledRuntimeContext,
  CompiledWorkflowExecutionOptions,
  CompiledWorkflowRunStore
} from "./compiledRunTypes"
import { releaseWorkflowContractV2RunPlanLease } from "./runPlanProvenance"
import { clearWorkflowContractV2RestartPreparation } from "./runRestartRecovery"
import type { AgentProvider, WorkflowRunState } from "../model"

interface TransitionResult {
  readonly kind: "next" | "end" | "fail" | "checkpoint"
  readonly index?: number
  readonly message?: string
}

export interface RunCompiledWorkflowStateInput {
  readonly lease: WorkflowPlanLease
  readonly plan: CompiledWorkflowPlan
  readonly privateState: CompiledWorkflowPlanPrivateState
  readonly run: WorkflowRunState
  readonly runStore: CompiledWorkflowRunStore
  readonly workspaceRoot: string
  readonly signal: AbortSignal
  readonly agentProvider?: AgentProvider
  readonly context: CompiledRuntimeContext
  readonly options: Readonly<CompiledWorkflowExecutionOptions>
  readonly startIndex: number
}

const DateConstructor = Date
const dateToISOString = Date.prototype.toISOString
const numberParseInt = Number.parseInt
const StringConstructor = String
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply
const MAX_STEP_DISPATCHES = 4_096

export async function runCompiledWorkflowState(
  input: RunCompiledWorkflowStateInput
): Promise<WorkflowRunState> {
  let index = input.startIndex
  let run = input.run
  let dispatches = 0
  while (index >= 0 && index < input.plan.workflow.steps.length) {
    dispatches += 1
    if (dispatches > MAX_STEP_DISPATCHES) {
      return failRun(input.runStore, run, input.workspaceRoot, "Compiled workflow exceeded its step-dispatch limit.")
    }
    if (input.signal.aborted) {
      return failRun(input.runStore, run, input.workspaceRoot, "Compiled workflow execution was cancelled.")
    }

    const step = input.plan.workflow.steps[index]
    const stepState = run.steps[index]
    if (stepState === undefined || stepState.id !== step.id) {
      return failRun(
        input.runStore,
        run,
        input.workspaceRoot,
        "Compiled workflow run step evidence does not match the plan."
      )
    }

    if (!compiledEntryPredicateAllows(input.plan, step, index, input.context)) {
      run.currentStep = step.id
      run.status = "running"
      stepState.status = "completed"
      stepState.completedAt = now()
      delete stepState.startedAt
      delete stepState.error
      run.state[`workflow.contractV2.skipped.${step.id}`] = "true"
      await input.runStore.saveRun(run)
      if (input.options.executionMode === "singleStep") {
        return pauseSingleStepAt(input.runStore, run, input.workspaceRoot, input.plan, index + 1)
      }
      index += 1
      continue
    }

    const executionOrdinal = compiledLogicalEffectOrdinal(run, step.id)
    run.currentStep = step.id
    run.status = "running"
    clearWorkflowContractV2RestartPreparation(run, step.id)
    stepState.status = "running"
    stepState.attempt = (stepState.attempt ?? 0) + 1
    stepState.startedAt = now()
    delete stepState.completedAt
    delete stepState.error
    await input.runStore.saveRun(run)

    let result
    try {
      result = await executeCompiledStep({
        lease: input.lease,
        plan: input.plan,
        privateState: input.privateState,
        run,
        runStore: input.runStore,
        workspaceRoot: input.workspaceRoot,
        signal: input.signal,
        agentProvider: input.agentProvider,
        context: input.context,
        step,
        stepIndex: index
      })
    } catch {
      const failed = await failStep(
        input.runStore,
        run,
        input.workspaceRoot,
        index,
        "Compiled workflow step execution failed.",
        step.required,
        executionOrdinal
      )
      if (step.required) return failed
      if (input.options.executionMode === "singleStep") {
        return pauseSingleStepAt(input.runStore, run, input.workspaceRoot, input.plan, index + 1)
      }
      index += 1
      continue
    }

    if (result.kind === "held") return run
    if (result.kind === "failed") {
      if (step.required) {
        releaseWorkflowContractV2RunPlanLease(input.workspaceRoot, run.runId)
        return run
      }
      if (input.options.executionMode === "singleStep") {
        return pauseSingleStepAt(input.runStore, run, input.workspaceRoot, input.plan, index + 1)
      }
      index += 1
      continue
    }
    if (result.run !== undefined) run = result.run

    const transition = selectCompiledTransition(input.plan, step, index, input.context, run)
    if (transition.kind === "end") return completeRun(input.runStore, run, input.workspaceRoot)
    if (transition.kind === "fail") {
      return failRun(
        input.runStore,
        run,
        input.workspaceRoot,
        transition.message ?? "Compiled workflow transition selected failure."
      )
    }
    if (transition.kind === "checkpoint") {
      run.status = "held"
      run.error = transition.message
      run.state["workflow.contractV2.checkpoint"] = transition.message
        ?? "Compiled workflow checkpoint requires review."
      await input.runStore.saveRun(run)
      return run
    }
    const nextIndex = transition.index ?? index + 1
    if (input.options.executionMode === "singleStep") {
      return pauseSingleStepAt(input.runStore, run, input.workspaceRoot, input.plan, nextIndex)
    }
    index = nextIndex
  }

  return completeRun(input.runStore, run, input.workspaceRoot)
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
  workspaceRoot: string,
  stepIndex: number,
  message: string,
  required: boolean,
  executionOrdinal: number
): Promise<WorkflowRunState> {
  const step = run.steps[stepIndex]
  step.status = "failed"
  step.error = message
  step.completedAt = now()
  if (required) {
    run.status = "failed"
    run.error = message
  } else {
    run.status = "running"
    delete run.error
    run.state[compiledExecutionOrdinalStateKey(step.id)] = String(executionOrdinal)
  }
  await store.saveRun(run)
  if (required) releaseWorkflowContractV2RunPlanLease(workspaceRoot, run.runId)
  return run
}

async function failRun(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  workspaceRoot: string,
  message: string
): Promise<WorkflowRunState> {
  run.status = "failed"
  run.error = message
  await store.saveRun(run)
  releaseWorkflowContractV2RunPlanLease(workspaceRoot, run.runId)
  return run
}

async function completeRun(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  workspaceRoot: string
): Promise<WorkflowRunState> {
  run.status = "completed"
  delete run.currentStep
  delete run.error
  await store.saveRun(run)
  releaseWorkflowContractV2RunPlanLease(workspaceRoot, run.runId)
  return run
}

async function pauseSingleStepAt(
  store: CompiledWorkflowRunStore,
  run: WorkflowRunState,
  workspaceRoot: string,
  plan: CompiledWorkflowPlan,
  nextIndex: number
): Promise<WorkflowRunState> {
  if (nextIndex < 0 || nextIndex >= plan.workflow.steps.length) {
    return completeRun(store, run, workspaceRoot)
  }
  run.status = "paused"
  run.currentStep = plan.workflow.steps[nextIndex].id
  delete run.error
  run.state["workflow.contractV2.singleStep.nextStepId"] = run.currentStep
  await store.saveRun(run)
  return run
}

function now(): string {
  const value = new DateConstructor()
  return reflectApply(dateToISOString, value, []) as string
}
