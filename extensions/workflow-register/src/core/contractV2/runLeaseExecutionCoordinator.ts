import type { WorkflowRunState } from "../model"
import type { RunStateStore } from "../runStateStore"
import { assertWorkflowRunStateWritable } from "../runtime/runStateCodec"
import { coordinateWorkflowRunExecution } from "../engine/runExecutionCoordinator"
import {
  requireWorkflowContractV2RunPlanLease, requireWorkflowContractV2RunPlanLeaseForExecution,
  releaseWorkflowContractV2RunPlanLease, runWithWorkflowContractV2PlanLease
} from "./runPlanLeaseContext"

export function coordinateWorkflowContractV2LeasedRunExecution<T>(
  store: RunStateStore, run: WorkflowRunState, operationKey: string, operation: () => Promise<T>
): Promise<T> {
  const workspaceRoot = store.workspaceRoot
  if (!workspaceRoot || !store.withRunLock) return Promise.reject(new TypeError("Workflow leased execution requires the existing durable run lock owner."))
  let lease: ReturnType<typeof requireWorkflowContractV2RunPlanLease>
  try { lease = requireWorkflowContractV2RunPlanLease(workspaceRoot, run) } catch (error) { return Promise.reject(error) }
  // The current coordinator still owns single-flight and the current store owns
  // its lock. The lease scope is opened inside that lock, before its initial load.
  const scopedStore: RunStateStore = {
    workspaceRoot, createRun: (workflow, inputs) => store.createRun(workflow, inputs),
    saveRun: value => store.saveRun(value), loadRun: id => store.loadRun(id), listRuns: () => store.listRuns(),
    withRunLock: (id, execute, options) => store.withRunLock!(id, () => runWithWorkflowContractV2PlanLease(lease, execute), options)
  }
  return coordinateWorkflowRunExecution(scopedStore, run.runId, operationKey, async () => {
    requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot, run)
    const result = await operation()
    const durable = await store.loadRun(run.runId)
    if (!durable) throw new TypeError("Workflow leased execution has no durable final state.")
    assertWorkflowRunStateWritable(durable)
    requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot, durable)
    if (durable.status === "completed" || durable.status === "failed") releaseWorkflowContractV2RunPlanLease(workspaceRoot, durable.runId)
    return result
  })
}
