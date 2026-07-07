import type {
  BobTaskSyncDriftStatus,
  BobTaskSyncState,
  CoreWorkflowDefinition,
  WorkflowRunState
} from "./core/model"

export interface BobTaskSyncTask {
  setStepComplete?: () => unknown
  startSubagent?: (...args: unknown[]) => unknown
}

export type BobTaskSyncReason =
  | "bob-runner-step-completed"
  | "review-accepted"
  | "operation-hub-next"
  | "operation-hub-resume"
  | "operation-hub-retry"
  | "manual-completed"
  | "paused"
  | "inspect"

export interface BobTaskSyncReconcileOptions {
  reason: BobTaskSyncReason
  task?: BobTaskSyncTask
  alreadyApplied?: boolean
  now?: () => string
}

export interface BobTaskSyncReconcileResult {
  status: BobTaskSyncDriftStatus
  targetCompletedThroughIndex: number
  completedThroughIndex: number
  appliedStepCount: number
  taskAvailable: boolean
  message: string
}

export class BobTaskSyncRegistry {
  private readonly tasksByStep = new Map<string, BobTaskSyncTask>()
  private readonly tasksByRun = new Map<string, BobTaskSyncTask>()

  registerTask(runId: string | undefined, stepId: string | undefined, task: BobTaskSyncTask): boolean {
    if (!runId || !stepId) return false
    if (typeof task.setStepComplete !== "function" && typeof task.startSubagent !== "function") return false
    this.tasksByStep.set(syncTaskKey(runId, stepId), task)
    this.tasksByRun.set(runId, task)
    return true
  }

  taskForRun(runId: string | undefined): BobTaskSyncTask | undefined {
    return runId ? this.tasksByRun.get(runId) : undefined
  }

  taskForStep(runId: string | undefined, stepId: string | undefined): BobTaskSyncTask | undefined {
    return runId && stepId ? this.tasksByStep.get(syncTaskKey(runId, stepId)) : undefined
  }

  reconcileRun(
    run: WorkflowRunState,
    workflow: CoreWorkflowDefinition | undefined,
    options: BobTaskSyncReconcileOptions
  ): BobTaskSyncReconcileResult {
    const task = options.task ?? this.taskForRun(run.runId)
    return reconcileBobTaskSync(run, workflow, { ...options, task })
  }
}

export const bobTaskSyncRegistry = new BobTaskSyncRegistry()

export function reconcileBobTaskSync(
  run: WorkflowRunState,
  workflow: CoreWorkflowDefinition | undefined,
  options: BobTaskSyncReconcileOptions
): BobTaskSyncReconcileResult {
  const now = options.now?.() ?? new Date().toISOString()
  const targetCompletedThroughIndex = completedPrefixIndex(run)
  const sync: BobTaskSyncState = run.bobTaskSync ?? {
    schemaVersion: "workflow-register/bob-task-sync/v1",
    projectionVersion: 1,
    completedThroughIndex: -1
  }
  run.bobTaskSync = sync
  sync.projectionVersion = 1
  sync.workflowDefinitionHash = workflow?.definitionHash ?? run.workflowDefinitionHash ?? sync.workflowDefinitionHash
  sync.mode = workflow?.stepExecution?.mode ?? sync.mode
  sync.lastCheckedAt = now

  const previousCompletedThroughIndex = normalizeCompletedIndex(sync.completedThroughIndex)
  const taskAvailable = typeof options.task?.setStepComplete === "function"
  sync.liveTaskAvailable = taskAvailable

  if (previousCompletedThroughIndex > targetCompletedThroughIndex) {
    sync.completedThroughIndex = previousCompletedThroughIndex
    sync.completedThroughStepId = stepIdAt(run, previousCompletedThroughIndex) ?? sync.completedThroughStepId
    sync.drift = {
      status: "requiresNewBobTask",
      reason: options.reason,
      detectedAt: now,
      details: `Bob Todo projection is ahead of run.json (${previousCompletedThroughIndex + 1} > ${targetCompletedThroughIndex + 1}); Bob cannot rewind the task UI.`
    }
    return result(sync.drift.status, targetCompletedThroughIndex, sync.completedThroughIndex, 0, taskAvailable)
  }

  if (previousCompletedThroughIndex === targetCompletedThroughIndex) {
    sync.completedThroughIndex = targetCompletedThroughIndex
    sync.completedThroughStepId = stepIdAt(run, targetCompletedThroughIndex)
    sync.drift = { status: "synced", reason: options.reason, detectedAt: now }
    return result("synced", targetCompletedThroughIndex, sync.completedThroughIndex, 0, taskAvailable)
  }

  if (options.alreadyApplied) {
    sync.completedThroughIndex = targetCompletedThroughIndex
    sync.completedThroughStepId = stepIdAt(run, targetCompletedThroughIndex)
    sync.lastAppliedAt = now
    sync.drift = { status: "synced", reason: options.reason, detectedAt: now }
    return result("synced", targetCompletedThroughIndex, sync.completedThroughIndex, 0, taskAvailable)
  }

  if (!taskAvailable || !options.task?.setStepComplete) {
    sync.completedThroughIndex = previousCompletedThroughIndex
    sync.completedThroughStepId = stepIdAt(run, previousCompletedThroughIndex) ?? sync.completedThroughStepId
    sync.drift = {
      status: "taskUnavailable",
      reason: options.reason,
      detectedAt: now,
      details: `run.json is authoritative through step ${targetCompletedThroughIndex + 1}, but no live Bob task handle can advance the Todo UI.`
    }
    return result("taskUnavailable", targetCompletedThroughIndex, sync.completedThroughIndex, 0, taskAvailable)
  }

  let appliedStepCount = 0
  for (let index = previousCompletedThroughIndex + 1; index <= targetCompletedThroughIndex; index += 1) {
    try {
      options.task.setStepComplete()
      appliedStepCount += 1
      sync.completedThroughIndex = index
      sync.completedThroughStepId = stepIdAt(run, index)
      sync.lastAppliedAt = now
    } catch (error) {
      sync.drift = {
        status: "repairFailed",
        reason: options.reason,
        detectedAt: now,
        details: error instanceof Error ? error.message : String(error)
      }
      return result("repairFailed", targetCompletedThroughIndex, sync.completedThroughIndex, appliedStepCount, taskAvailable)
    }
  }

  sync.drift = { status: "synced", reason: options.reason, detectedAt: now }
  return result("synced", targetCompletedThroughIndex, sync.completedThroughIndex, appliedStepCount, taskAvailable)
}

export function completedPrefixIndex(run: WorkflowRunState): number {
  let completedThrough = -1
  for (const [index, step] of run.steps.entries()) {
    if (step.status !== "completed") break
    completedThrough = index
  }
  return completedThrough
}

function normalizeCompletedIndex(value: number | undefined): number {
  return Number.isFinite(value) ? Math.trunc(value as number) : -1
}

function stepIdAt(run: WorkflowRunState, index: number): string | undefined {
  return index >= 0 ? run.steps[index]?.id : undefined
}

function result(
  status: BobTaskSyncDriftStatus,
  targetCompletedThroughIndex: number,
  completedThroughIndex: number,
  appliedStepCount: number,
  taskAvailable: boolean
): BobTaskSyncReconcileResult {
  return {
    status,
    targetCompletedThroughIndex,
    completedThroughIndex,
    appliedStepCount,
    taskAvailable,
    message: `Bob Todo sync ${status}: applied ${appliedStepCount}; projected=${completedThroughIndex + 1}; target=${targetCompletedThroughIndex + 1}`
  }
}

function syncTaskKey(runId: string, stepId: string): string {
  return `${runId}:${stepId}`
}
