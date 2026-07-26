import { executeCompiledWorkflowRun } from "./core/contractV2/compiledRunExecutor"
import { requireActiveWorkflowPlanLeaseHandle } from "./core/contractV2/planLease"
import type { WorkflowRunState } from "./core/model"
import type { ContractV2RunExecutorInput } from "./workflowRuntimeFactory"
import { ContractV2GuardedRunStateStore } from "./workflowContractV2RunStateStore"
import { workflowContractV2CoreMetadata } from "./workflowContractV2View"

const AbortControllerConstructor = AbortController

/**
 * Product composition for fresh Contract v2 runs.
 *
 * The acquired lease is the sole execution authority. The view workflow is used
 * only to verify that the UI/command target still names the exact compiled plan;
 * it is never adapted back into the legacy engine.
 */
export async function executeWorkflowContractV2Run(
  input: ContractV2RunExecutorInput
): Promise<WorkflowRunState> {
  const handle = requireActiveWorkflowPlanLeaseHandle(input.lease)
  const metadata = workflowContractV2CoreMetadata(input.workflow)
  if (
    metadata === undefined
    || metadata.workflowId !== handle.plan.workflowId
    || metadata.planDigest !== handle.planDigest
    || metadata.packageDigest !== handle.plan.packageDigest
  ) {
    throw new Error("Contract v2 execution target no longer matches the acquired compiled plan.")
  }

  const runStore = new ContractV2GuardedRunStateStore({
    workspaceRoot: input.workspaceRoot
  })
  const controller = new AbortControllerConstructor()
  return executeCompiledWorkflowRun({
    lease: input.lease,
    inputs: input.inputs,
    options: input.options,
    workspaceRoot: input.workspaceRoot,
    runStore,
    signal: controller.signal,
    ...(input.agentProvider === undefined ? {} : { agentProvider: input.agentProvider })
  })
}
