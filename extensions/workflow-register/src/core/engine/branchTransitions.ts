import { randomUUID } from "crypto"
import type {
  CoreWorkflowDefinition,
  EngineStep,
  WorkflowBranchLoopState,
  WorkflowRunBranchingState,
  WorkflowRunState
} from "../model"
import { resolveStepTransition } from "../branching/transitionResolver"
import { archiveAttempt } from "./runState"

type WorkflowExecutionMode = "full" | "singleStep"

export type AppliedBranchTransition =
  | { action: "next"; nextIndex: number }
  | { action: "goto"; nextIndex: number; stop: boolean }
  | { action: "checkpoint"; nextIndex: number; stop: true }
  | { action: "end"; stop: true }
  | { action: "fail"; stop: true; error: string }

export function applyStepTransition(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  step: EngineStep
  stepIndex: number
  mode: WorkflowExecutionMode
}): AppliedBranchTransition {
  const { workflow, run, step, stepIndex, mode } = input
  const resolved = resolveStepTransition(step, run)
  if (resolved.action === "next") return { action: "next", nextIndex: stepIndex + 1 }
  if (resolved.action === "end") {
    run.status = "completed"
    run.currentStep = undefined
    run.error = undefined
    recordTransition(workflow, run, step, resolved.decisionId, "end", undefined, resolved.loopId, undefined, resolved.conditionSnapshot)
    return { action: "end", stop: true }
  }
  if (resolved.action === "fail") {
    const error = `Workflow transition '${resolved.decisionId}' failed the run at step '${step.id}'.`
    run.status = "failed"
    run.currentStep = step.id
    run.error = error
    recordTransition(workflow, run, step, resolved.decisionId, "fail", undefined, resolved.loopId, undefined, resolved.conditionSnapshot)
    return { action: "fail", stop: true, error }
  }
  const targetStepId = resolved.toStepId
  if (!targetStepId) {
    const error = `Workflow transition '${resolved.decisionId}' did not resolve a target step.`
    run.status = "failed"
    run.currentStep = step.id
    run.error = error
    return { action: "fail", stop: true, error }
  }
  const targetIndex = workflow.engineSteps.findIndex((candidate) => candidate.id === targetStepId)
  if (targetIndex < 0) {
    const error = `Workflow transition '${resolved.decisionId}' references unknown step '${targetStepId}'.`
    run.status = "failed"
    run.currentStep = step.id
    run.error = error
    return { action: "fail", stop: true, error }
  }

  const branching = ensureRunBranching(workflow, run)
  let loopCount: number | undefined
  if (targetIndex <= stepIndex) {
    const loopState = resolved.loopId && branching ? branching.loops[resolved.loopId] : undefined
    if (loopState && loopState.count >= loopState.allowed) {
      const loopDefinition = workflow.branching?.loops.find((loop) => loop.id === loopState.loopId)
      const message = loopDefinition?.checkpoint?.message
        ?? `Branch loop '${loopState.loopId}' reached its limit (${loopState.count}/${loopState.allowed}).`
      loopState.checkpointCount += 1
      run.status = "checkpoint"
      run.currentStep = targetStepId
      run.error = undefined
      if (branching) {
        branching.checkpoint = {
          id: randomUUID(),
          loopId: loopState.loopId,
          fromStepId: step.id,
          toStepId: targetStepId,
          decisionId: resolved.decisionId,
          count: loopState.count,
          allowed: loopState.allowed,
          extensionSize: loopState.extensionSize,
          message,
          createdAt: new Date().toISOString()
        }
      }
      recordTransition(workflow, run, step, resolved.decisionId, "checkpoint", targetStepId, resolved.loopId, loopState.count, resolved.conditionSnapshot)
      return { action: "checkpoint", nextIndex: targetIndex, stop: true }
    }
    if (loopState) {
      loopState.count += 1
      loopState.lastTransitionAt = new Date().toISOString()
      loopCount = loopState.count
    }
    resetStepRangeForBranch(workflow, run, targetIndex, stepIndex, {
      decisionId: resolved.decisionId,
      loopId: resolved.loopId,
      fromStepId: step.id,
      toStepId: targetStepId,
      loopCount
    })
  }

  run.status = "running"
  run.currentStep = targetStepId
  run.error = undefined
  recordTransition(workflow, run, step, resolved.decisionId, "goto", targetStepId, resolved.loopId, loopCount, resolved.conditionSnapshot)
  return {
    action: "goto",
    nextIndex: targetIndex,
    stop: mode === "singleStep"
  }
}

export function approveBranchCheckpointTransition(workflow: CoreWorkflowDefinition, run: WorkflowRunState): { ok: true } | { ok: false; error: string } {
  const branching = run.branching
  const checkpoint = branching?.checkpoint
  if (run.status !== "checkpoint" || !checkpoint) return { ok: false, error: `Workflow run is not waiting at a branch checkpoint: ${run.status}` }
  const loopState = branching?.loops[checkpoint.loopId]
  if (!loopState) return { ok: false, error: `Branch checkpoint loop is not available: ${checkpoint.loopId}` }
  const targetIndex = workflow.engineSteps.findIndex((step) => step.id === checkpoint.toStepId)
  const currentIndex = workflow.engineSteps.findIndex((step) => step.id === checkpoint.fromStepId)
  if (targetIndex < 0) return { ok: false, error: `Branch checkpoint target step is not available: ${checkpoint.toStepId}` }
  if (currentIndex < 0) return { ok: false, error: `Branch checkpoint source step is not available: ${checkpoint.fromStepId}` }

  loopState.allowed += checkpoint.extensionSize
  loopState.count += 1
  loopState.lastTransitionAt = new Date().toISOString()
  resetStepRangeForBranch(workflow, run, targetIndex, currentIndex, {
    decisionId: checkpoint.decisionId,
    loopId: checkpoint.loopId,
    fromStepId: checkpoint.fromStepId,
    toStepId: checkpoint.toStepId,
    loopCount: loopState.count
  })
  const fromStep = workflow.engineSteps[currentIndex]
  run.status = "running"
  run.currentStep = checkpoint.toStepId
  run.error = undefined
  delete branching.checkpoint
  recordTransition(workflow, run, fromStep, checkpoint.decisionId, "goto", checkpoint.toStepId, checkpoint.loopId, loopState.count, undefined)
  return { ok: true }
}

export function abortBranchCheckpointTransition(run: WorkflowRunState, reason?: string): { ok: true } | { ok: false; error: string } {
  if (run.status !== "checkpoint" || !run.branching?.checkpoint) {
    return { ok: false, error: `Workflow run is not waiting at a branch checkpoint: ${run.status}` }
  }
  run.status = "failed"
  run.error = reason ?? `Workflow run aborted at branch checkpoint: ${run.branching.checkpoint.loopId}`
  delete run.branching.checkpoint
  return { ok: true }
}

function ensureRunBranching(workflow: CoreWorkflowDefinition, run: WorkflowRunState): WorkflowRunBranchingState | undefined {
  if (!workflow.branching) return undefined
  if (!run.branching) run.branching = { loops: {}, history: [] }
  for (const loop of workflow.branching.loops) {
    const existing = run.branching.loops[loop.id]
    run.branching.loops[loop.id] = {
      loopId: loop.id,
      count: existing?.count ?? 0,
      allowed: existing?.allowed ?? loop.maxIterations,
      maxIterations: loop.maxIterations,
      extensionSize: loop.extensionSize,
      checkpointCount: existing?.checkpointCount ?? 0,
      lastTransitionAt: existing?.lastTransitionAt
    }
  }
  return run.branching
}

function resetStepRangeForBranch(
  workflow: CoreWorkflowDefinition,
  run: WorkflowRunState,
  targetIndex: number,
  currentIndex: number,
  branch: {
    decisionId: string
    loopId?: string
    fromStepId: string
    toStepId: string
    loopCount?: number
  }
): void {
  for (let index = targetIndex; index <= currentIndex; index += 1) {
    const stepState = run.steps[index]
    if (!stepState) continue
    archiveAttempt(stepState, run.state)
    const archived = stepState.attempts?.[stepState.attempts.length - 1]
    if (archived) {
      archived.branchDecisionId = branch.decisionId
      archived.branchLoopId = branch.loopId
      archived.branchFromStepId = branch.fromStepId
      archived.branchToStepId = branch.toStepId
      archived.branchLoopCount = branch.loopCount
    }
  }
  for (let index = targetIndex; index <= currentIndex; index += 1) {
    const step = workflow.engineSteps[index]
    const stepState = run.steps[index]
    if (!step || !stepState) continue
    for (const key of producedStateKeys(step)) {
      const value = run.state[key]
      if (value !== undefined) run.state[`workflow.branching.lastValues.${step.id}.${key}`] = value
      delete run.state[key]
    }
    stepState.status = "pending"
    stepState.startedAt = undefined
    stepState.completedAt = undefined
    stepState.reviewStartedAt = undefined
    stepState.acceptedAt = undefined
    stepState.error = undefined
    stepState.attempt = (stepState.attempts?.length ?? 0) + 1
  }
}

function producedStateKeys(step: EngineStep): string[] {
  const keys: string[] = []
  if ("resultKey" in step && step.resultKey) keys.push(step.resultKey)
  if (step.type === "manual") {
    if (step.form?.resultKey) keys.push(step.form.resultKey)
    if (step.approval?.resultKey) keys.push(step.approval.resultKey)
  }
  return keys
}

function recordTransition(
  workflow: CoreWorkflowDefinition,
  run: WorkflowRunState,
  step: EngineStep,
  decisionId: string,
  action: "goto" | "end" | "fail" | "checkpoint",
  toStepId: string | undefined,
  loopId: string | undefined,
  loopCount: number | undefined,
  conditionSnapshot: unknown
): void {
  const branching = ensureRunBranching(workflow, run)
  if (!branching) return
  branching.history.push({
    id: randomUUID(),
    loopId,
    decisionId,
    fromStepId: step.id,
    toStepId,
    action,
    loopCount,
    createdAt: new Date().toISOString(),
    conditionSnapshot
  })
}
