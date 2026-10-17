import type { WorkflowPlanLease } from "./core/contractV2/planLease"
import { runWithWorkflowContractV2PlanLease } from "./core/contractV2/runPlanLeaseContext"
import { WorkflowContractV2BoundaryError } from "./workflowContractV2ExecutionGuard"

export async function executeWorkflowContractV2RuntimeBoundary<T>(input: {
  readonly acquireLease: () => Promise<WorkflowPlanLease | undefined>
  readonly executeCompiled?: (lease: WorkflowPlanLease) => Promise<T>
  readonly executeLegacy: () => Promise<T>
}): Promise<T> {
  const lease = await input.acquireLease()
  if (lease === undefined) return input.executeLegacy()
  return runWithWorkflowContractV2PlanLease(lease, () => {
    if (!input.executeCompiled) throw new WorkflowContractV2BoundaryError("Contract v2 compiled executor is unavailable.")
    return input.executeCompiled(lease)
  })
}
