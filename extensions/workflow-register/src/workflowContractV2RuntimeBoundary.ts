import type { WorkflowPlanLease } from "./core/contractV2"
import { runWithWorkflowContractV2PlanLease } from "./core/contractV2/runPlanProvenance"

export interface ExecuteWorkflowContractV2RuntimeBoundaryInput<T> {
  readonly acquireLease: () => Promise<WorkflowPlanLease | undefined> | WorkflowPlanLease | undefined
  readonly legacyOperation: () => Promise<T> | T
  readonly compiledOperation?: (lease: WorkflowPlanLease) => Promise<T> | T
}

/**
 * Selects one execution ownership model before the run can be created.
 *
 * Legacy workflows execute without a Contract v2 lease. A Contract v2 workflow
 * executes only inside the exact acquired lease context; an unavailable compiled
 * executor fails closed and never falls back to the legacy engine.
 */
export async function executeWorkflowContractV2RuntimeBoundary<T>(
  input: ExecuteWorkflowContractV2RuntimeBoundaryInput<T>
): Promise<T> {
  const lease = await input.acquireLease()
  if (lease === undefined) return input.legacyOperation()

  return runWithWorkflowContractV2PlanLease(lease, () => {
    if (input.compiledOperation === undefined) {
      throw new Error(
        "Contract v2 compiled runtime execution is not enabled before R4; no legacy runtime fallback was used."
      )
    }
    return input.compiledOperation(lease)
  })
}
