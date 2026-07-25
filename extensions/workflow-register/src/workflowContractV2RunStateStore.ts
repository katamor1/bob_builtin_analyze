import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import {
  FileRunStateStore,
  type FileRunStateStoreOptions
} from "./core/runStateStore"

export interface ContractV2GuardedRunStateStoreOptions extends FileRunStateStoreOptions {
  readonly beforeCreateRun?: (
    workflow: CoreWorkflowDefinition,
    inputs: Record<string, unknown>
  ) => Promise<void> | void
}

export class ContractV2GuardedRunStateStore extends FileRunStateStore {
  private readonly beforeCreateRun?: ContractV2GuardedRunStateStoreOptions["beforeCreateRun"]

  constructor(options: ContractV2GuardedRunStateStoreOptions) {
    super(options)
    this.beforeCreateRun = options.beforeCreateRun
  }

  override async createRun(
    workflow: CoreWorkflowDefinition,
    inputs: Record<string, unknown>
  ): Promise<WorkflowRunState> {
    await this.beforeCreateRun?.(workflow, inputs)
    return super.createRun(workflow, inputs)
  }
}
