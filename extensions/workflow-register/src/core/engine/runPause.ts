import type {
  CoreWorkflowDefinition,
  EngineStep,
  WorkflowRunControlLimitsDefinition,
  WorkflowRunState
} from "../model"
import type { RunControlState, RunControlStore } from "../runControlStore"
import type { RunStateStore } from "../runStateStore"
import type { WorkflowEngineEventInput } from "../engineTypes"
import { evaluateAutomaticPause, type AutomaticPausePolicySource } from "./automaticPause"

type RunPauseEmitter = (input: WorkflowEngineEventInput) => Promise<void>

export async function pauseRunIfRequested(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  nextStep: EngineStep | undefined
  checkpoint: string
  runStore: RunStateStore
  runControlStore?: RunControlStore
  emitRunPaused: RunPauseEmitter
}): Promise<boolean> {
  const { workflow, run, nextStep, checkpoint, runStore, runControlStore, emitRunPaused } = input
  const now = runControlStore?.currentDate?.() ?? new Date()
  const control = await runControlStore?.loadControl(run.runId)
  if (control?.pauseRequestedAt && !control.clearedAt) {
    return persistManualPause({ workflow, run, nextStep, checkpoint, runStore, emitRunPaused, control, now })
  }

  const policies: AutomaticPausePolicySource[] = []
  if (hasLimits(workflow.runControl?.limits)) policies.push({ source: "workflow", limits: workflow.runControl.limits })
  const workspaceLimits = runControlStore?.workspaceAutomaticPauseLimits
  if (hasLimits(workspaceLimits)) policies.push({ source: "workspace", limits: workspaceLimits })

  const decision = evaluateAutomaticPause({
    run,
    nextStep,
    now,
    policies,
    override: control?.automaticPauseOverride
  })
  if (!decision) return false

  const detectedAt = now.toISOString()
  run.status = "paused"
  run.error = undefined
  if (nextStep) run.currentStep = nextStep.id
  run.state["workflow.pause"] = JSON.stringify({
    schemaVersion: "workflow-register/automatic-pause/v1",
    kind: decision.kind,
    source: decision.source,
    checkpoint,
    nextStepId: nextStep?.id,
    limit: decision.limit,
    observed: decision.observed,
    detectedAt
  })
  const pause: RunControlState = {
    schemaVersion: "workflow-register/run-control/v1",
    runId: run.runId,
    pauseRequestedAt: detectedAt,
    pauseReason: `automatic:${decision.kind}`,
    requestedBy: "system",
    mode: "afterCurrentStep"
  }
  await runStore.saveRun(run)
  await emitRunPaused({ workflow, run, step: nextStep, pause })
  return true
}

async function persistManualPause(input: {
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  nextStep: EngineStep | undefined
  checkpoint: string
  runStore: RunStateStore
  emitRunPaused: RunPauseEmitter
  control: RunControlState
  now: Date
}): Promise<boolean> {
  const { workflow, run, nextStep, checkpoint, runStore, emitRunPaused, control, now } = input
  run.status = "paused"
  run.error = undefined
  if (nextStep) run.currentStep = nextStep.id
  run.state["workflow.pause"] = JSON.stringify({
    pauseRequestedAt: control.pauseRequestedAt,
    pauseReason: control.pauseReason ?? "manual",
    requestedBy: control.requestedBy ?? "user",
    mode: control.mode ?? "afterCurrentStep",
    checkpoint,
    detectedAt: now.toISOString()
  })
  await runStore.saveRun(run)
  await emitRunPaused({ workflow, run, step: nextStep, pause: control })
  return true
}

function hasLimits(limits: WorkflowRunControlLimitsDefinition | undefined): limits is WorkflowRunControlLimitsDefinition {
  return Boolean(limits && Object.values(limits).some((value) => value !== undefined))
}
