import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import { FileRunStateStore, type FileRunStateStoreOptions } from "./core/runStateStore"
import { assertWorkflowContractV2Shadow } from "./workflowContractV2ExecutionGuard"
export interface ContractV2GuardedRunStateStoreOptions extends FileRunStateStoreOptions {
  readonly beforeCreateRun?: (workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>) => Promise<void> | void
}
export class ContractV2GuardedRunStateStore extends FileRunStateStore {
  constructor(private readonly boundaryOptions: ContractV2GuardedRunStateStoreOptions) { super(boundaryOptions) }
  override async createRun(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    assertWorkflowContractV2Shadow(workflow)
    await this.boundaryOptions.beforeCreateRun?.(workflow, inputs)
    return super.createRun(workflow, inputs)
  }
}
