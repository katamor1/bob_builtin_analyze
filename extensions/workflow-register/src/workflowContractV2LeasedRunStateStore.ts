import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import { types as utilTypes } from "node:util"
import { FileRunStateStore, type FileRunStateStoreOptions } from "./core/runStateStore"
import type { RunStateLockOptions } from "./core/runtime/runStateStore"
import { readContainedRunFile } from "./core/runtime/runStatePath"
import { readRunDurabilityFile } from "./core/runtime/runDurabilityPath"
import { decodeWorkflowRunState } from "./core/runtime/runStateCodec"
import { cloneAndFreezeJsonValue } from "./core/contractV2/jsonValue"
import { requireActiveWorkflowPlanLease, type WorkflowPlanLease } from "./core/contractV2/planLease"
import { createWorkflowContractV2RunState } from "./core/contractV2/runPlanState"
import {
  adoptWorkflowContractV2RunPlanLease, currentWorkflowContractV2PlanLease,
  prepareWorkflowContractV2RunPlanLeaseForWrite, releaseWorkflowContractV2RunPlanLease,
  requireWorkflowContractV2RunPlanLease, requireWorkflowContractV2RunPlanLeaseForExecution
} from "./core/contractV2/runPlanLeaseContext"
import { assertWorkflowContractV2Shadow } from "./workflowContractV2ExecutionGuard"
import { workflowContractV2CoreBinding } from "./workflowContractV2View"

const isProxy = utilTypes.isProxy

export class ContractV2LeasedRunStateStore extends FileRunStateStore {
  constructor(options: FileRunStateStoreOptions) { super(options) }

  override async createRun(workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    assertWorkflowContractV2Shadow(workflow)
    return super.createRun(workflow, inputs)
  }
  async createRunFromPlanLease(workflow: CoreWorkflowDefinition, value: WorkflowPlanLease, inputs: Record<string, unknown>): Promise<WorkflowRunState> {
    const lease = requireActiveWorkflowPlanLease(value)
    if (currentWorkflowContractV2PlanLease() !== lease) throw new TypeError("Workflow creation requires its exact active lease context.")
    if (isProxy(workflow) || workflowContractV2CoreBinding(workflow)?.handle !== lease.handle) {
      throw new TypeError("Workflow creation requires the exact authentic core view.")
    }
    const detached = cloneAndFreezeJsonValue(inputs)
    if (!detached || typeof detached !== "object" || Array.isArray(detached)) throw new TypeError("Workflow run inputs must be ordinary JSON object data.")
    const shell = await super.createRun(workflow, detached as Record<string, unknown>)
    return createWorkflowContractV2RunState({ shell, workflow, lease })
  }
  override async saveRun(run: WorkflowRunState): Promise<void> {
    if (!marked(run)) { await this.assertStoredRun(run.runId, true); return super.saveRun(run) }
    prepareWorkflowContractV2RunPlanLeaseForWrite(this.workspaceRoot, run)
    try {
      await this.assertStoredRun(run.runId, true)
      await super.saveRun(run)
      adoptWorkflowContractV2RunPlanLease(this.workspaceRoot, run)
    } catch (error) {
      try { releaseWorkflowContractV2RunPlanLease(this.workspaceRoot, run.runId) } catch {}
      throw error
    }
  }
  override async loadRun(runId: string): Promise<WorkflowRunState | undefined> {
    await this.assertStoredRun(runId, true)
    const run = await super.loadRun(runId)
    if (run && marked(run)) requireWorkflowContractV2RunPlanLeaseForExecution(this.workspaceRoot, run)
    return run
  }
  override async withRunLock<T>(runId: string, operation: () => Promise<T>, options: RunStateLockOptions = {}): Promise<T> {
    await this.assertStoredRun(runId, false)
    return super.withRunLock(runId, async () => { await this.assertStoredRun(runId, false); return operation() }, options)
  }
  private async assertStoredRun(runId: string, execution: boolean): Promise<void> {
    const raw = await optional(() => readContainedRunFile(this.workspaceRoot, runId))
    if (raw) this.assertRecord(JSON.parse(raw.bytes.toString("utf8")), runId, execution)
    const journal = await optional(() => readRunDurabilityFile(this.workspaceRoot, runId, "run-state.journal.json"))
    if (journal) this.assertRecord((JSON.parse(journal.bytes.toString("utf8")) as { nextRun?: unknown }).nextRun, runId, execution)
  }
  private assertRecord(value: unknown, runId: string, execution: boolean): void {
    if (!marked(value)) return
    const run = decodeWorkflowRunState(value, runId).run
    if (execution) requireWorkflowContractV2RunPlanLeaseForExecution(this.workspaceRoot, run)
    else requireWorkflowContractV2RunPlanLease(this.workspaceRoot, run)
  }
}

function marked(value: unknown): boolean {
  return !!value && typeof value === "object"
    && ((value as Partial<WorkflowRunState>).workflowSchemaVersion === "workflow-register/v2" || Object.hasOwn(value, "planProvenance"))
}
async function optional<T>(read: () => Promise<T>): Promise<T | undefined> {
  try { return await read() } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined; throw error }
}
