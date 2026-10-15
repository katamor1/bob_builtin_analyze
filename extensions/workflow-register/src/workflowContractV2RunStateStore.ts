import { readContainedRunFile } from "./core/runtime/runStatePath"
import { readRunDurabilityFile } from "./core/runtime/runDurabilityPath"
import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import { FileRunStateStore, type FileRunStateStoreOptions } from "./core/runStateStore"
import type { RunStateLockOptions } from "./core/runtime/runStateStore"
import { WorkflowContractV2BoundaryError, assertWorkflowContractV2Shadow } from "./workflowContractV2ExecutionGuard"
export interface ContractV2GuardedRunStateStoreOptions extends FileRunStateStoreOptions {
  readonly workflowById?: (id: string) => CoreWorkflowDefinition | undefined
  readonly beforeCreateRun?: (workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>) => Promise<void> | void
}
export class ContractV2GuardedRunStateStore extends FileRunStateStore {
  constructor(private readonly boundaryOptions: ContractV2GuardedRunStateStoreOptions) { super(boundaryOptions) }
  private assertRun(value: unknown): void {
    if (!value || typeof value !== "object") return
    const run = value as Partial<WorkflowRunState>
    if (run.workflowSchemaVersion === "workflow-register/v2" || Object.hasOwn(run, "planProvenance")) {
      throw new WorkflowContractV2BoundaryError("Contract v2は検証のみ・実行不可です。")
    }
    const workflow = typeof run.workflowId === "string" ? this.boundaryOptions.workflowById?.(run.workflowId) : undefined
    if (workflow) assertWorkflowContractV2Shadow(workflow)
    if (typeof run.workflowFile === "string" && /(?:^|[\\/])current\.json$/.test(run.workflowFile)) {
      throw new WorkflowContractV2BoundaryError("Contract v2は検証のみ・実行不可です。")
    }
  }
  private async assertStoredRun(runId: string): Promise<void> {
    // Read only before FileRunStateStore can recover a journal or migrate state.
    const snapshot = await readContainedRunFile(this.workspaceRoot, runId).catch(() => undefined)
    let materialized: unknown
    try { if (snapshot) materialized = JSON.parse(snapshot.bytes.toString("utf8")) } catch {}
    this.assertRun(materialized)
    const journal = await readRunDurabilityFile(this.workspaceRoot, runId, "run-state.journal.json").catch(() => undefined)
    let pending: { nextRun?: unknown } | undefined
    try { if (journal) pending = JSON.parse(journal.bytes.toString("utf8")) } catch {}
    this.assertRun(pending?.nextRun)
  }
  override async withRunLock<T>(runId: string, operation: () => Promise<T>, options: RunStateLockOptions = {}): Promise<T> {
    await this.assertStoredRun(runId)
    return super.withRunLock(runId, async () => {
      await this.assertStoredRun(runId)
      return operation()
    }, options)
  }
  override async loadRun(runId: string): Promise<WorkflowRunState | undefined> {
    await this.assertStoredRun(runId)
    return super.loadRun(runId)
  }
  override async saveRun(run: WorkflowRunState): Promise<void> {
    this.assertRun(run)
    await this.assertStoredRun(run.runId)
    this.assertRun(run)
    return super.saveRun(run, snapshot => this.assertRun(snapshot))
  }
  override async createRun(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    assertWorkflowContractV2Shadow(workflow)
    await this.boundaryOptions.beforeCreateRun?.(workflow, inputs)
    return super.createRun(workflow, inputs)
  }
}
