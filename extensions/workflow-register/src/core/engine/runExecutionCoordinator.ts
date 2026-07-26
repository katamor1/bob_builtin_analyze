import { AsyncLocalStorage } from "async_hooks"
import {
  releaseWorkflowContractV2RunPlanLease,
  requireWorkflowContractV2RunPlanLeaseForExecution,
  workflowContractV2RunIsTerminal
} from "../contractV2/runPlanProvenance"
import type { WorkflowRunState } from "../model"
import { assertWorkflowRunStateWritable } from "../runStateStore"
import type { RunStateStore } from "../runStateStore"
import { normalizeWorkspaceRootIdentity } from "../../workspaceRootIdentity"

interface InFlightRunExecution {
  operationKey: string
  promise: Promise<unknown>
}

export class WorkflowRunExecutionCoordinator {
  private readonly inFlight = new Map<string, InFlightRunExecution>()
  private readonly activeRuns = new AsyncLocalStorage<ReadonlySet<string>>()

  coordinate<T>(
    workspaceScope: string,
    runId: string,
    operationKey: string,
    operation: () => Promise<T>
  ): Promise<T> {
    const key = runExecutionKey(workspaceScope, runId)
    const activeRuns = this.activeRuns.getStore()
    if (activeRuns?.has(key)) {
      return Promise.reject(new Error(`Workflow run execution cannot re-enter the same run: ${runId}`))
    }
    const existing = this.inFlight.get(key)
    if (existing?.operationKey === operationKey) return existing.promise as Promise<T>
    if (existing) {
      const retry = () => this.coordinate(workspaceScope, runId, operationKey, operation)
      return existing.promise.then(retry, retry)
    }

    const executionChain = new Set(activeRuns)
    executionChain.add(key)
    const owner = Promise.resolve().then(() => this.activeRuns.run(executionChain, operation))
    let coordinated!: Promise<T>
    coordinated = owner.finally(() => {
      if (this.inFlight.get(key)?.promise === coordinated) this.inFlight.delete(key)
    })
    this.inFlight.set(key, { operationKey, promise: coordinated })
    return coordinated
  }

  isActive(workspaceScope: string, runId: string): boolean {
    return this.inFlight.has(runExecutionKey(workspaceScope, runId))
  }
}

const coordinator = new WorkflowRunExecutionCoordinator()
const anonymousStoreScopes = new WeakMap<object, string>()
let anonymousStoreSequence = 0

export function coordinateWorkflowRunExecution<T>(
  runStore: RunStateStore,
  runId: string,
  operationKey: string,
  operation: () => Promise<T>
): Promise<T> {
  const workspaceScope = runStoreScope(runStore)
  return coordinator.coordinate(workspaceScope, runId, operationKey, () => {
    const execute = async () => {
      let run: WorkflowRunState | undefined
      try {
        run = await runStore.loadRun(runId)
        if (run) {
          assertWorkflowRunStateWritable(run)
          requireWorkflowContractV2RunPlanLeaseForExecution(workspaceScope, run)
        }
        const result = await operation()
        const returnedRun = workflowRunStateFromResult(result, runId)
        run = returnedRun ?? await runStore.loadRun(runId) ?? run
        if (run?.planProvenance !== undefined) {
          if (workflowContractV2RunIsTerminal(run)) {
            releaseWorkflowContractV2RunPlanLease(workspaceScope, runId)
          } else {
            requireWorkflowContractV2RunPlanLeaseForExecution(workspaceScope, run)
          }
        }
        return result
      } catch (error) {
        releaseWorkflowContractV2RunPlanLease(workspaceScope, runId)
        throw error
      }
    }
    return runStore.withRunLock ? runStore.withRunLock(runId, execute) : execute()
  })
}

export function workflowRunExecutionActive(runStore: RunStateStore, runId: string): boolean {
  return coordinator.isActive(runStoreScope(runStore), runId)
}

export function workflowRunExecutionActiveForWorkspace(workspaceRoot: string, runId: string): boolean {
  return coordinator.isActive(workspaceRoot, runId)
}

function runStoreScope(runStore: RunStateStore): string {
  if (runStore.workspaceRoot) return normalizeWorkspaceRoot(runStore.workspaceRoot)
  const store = runStore as object
  const existing = anonymousStoreScopes.get(store)
  if (existing) return existing
  const created = `anonymous-run-store:${++anonymousStoreSequence}`
  anonymousStoreScopes.set(store, created)
  return created
}

function runExecutionKey(workspaceScope: string, runId: string): string {
  return JSON.stringify([normalizeWorkspaceRoot(workspaceScope), runId])
}

function normalizeWorkspaceRoot(workspaceRoot: string): string {
  if (workspaceRoot.startsWith("anonymous-run-store:")) return workspaceRoot
  return normalizeWorkspaceRootIdentity(workspaceRoot)
}

function workflowRunStateFromResult(value: unknown, runId: string): WorkflowRunState | undefined {
  if (typeof value !== "object" || value === null) return undefined
  const candidate = value as Partial<WorkflowRunState>
  return candidate.runId === runId && typeof candidate.status === "string"
    ? value as WorkflowRunState
    : undefined
}
