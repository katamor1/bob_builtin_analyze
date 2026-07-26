import type { WorkflowPlanLease } from "./core/contractV2/planLease"
import {
  adoptWorkflowContractV2RunPlanLease,
  bindAvailableWorkflowContractV2RunPlanLease,
  currentWorkflowContractV2PlanLease,
  prepareWorkflowContractV2RunPlanLeaseForWrite,
  releaseWorkflowContractV2RunPlanLease,
  workflowContractV2RunIsTerminal
} from "./core/contractV2/runPlanProvenance"
import { createWorkflowContractV2RunState } from "./core/engine/runState"
import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import {
  FileRunStateStore,
  type FileRunStateStoreOptions
} from "./core/runStateStore"
import { workflowContractV2CoreMetadata } from "./workflowContractV2View"

export type ContractV2GuardedRunStateStoreOptions = FileRunStateStoreOptions

export class ContractV2GuardedRunStateStore extends FileRunStateStore {
  constructor(options: ContractV2GuardedRunStateStoreOptions) {
    super(options)
  }

  override async createRun(
    workflow: CoreWorkflowDefinition,
    inputs: Record<string, unknown>
  ): Promise<WorkflowRunState> {
    const contextualLease = currentWorkflowContractV2PlanLease()
    if (contextualLease !== undefined) {
      return this.createRunFromPlanLease(contextualLease, inputs)
    }
    if (workflowContractV2CoreMetadata(workflow) !== undefined) {
      throw new TypeError("Contract v2 run creation requires an active compiled plan lease.")
    }
    return super.createRun(workflow, inputs)
  }

  async createRunFromPlanLease(
    lease: WorkflowPlanLease,
    inputs: Record<string, unknown>
  ): Promise<WorkflowRunState> {
    const handle = lease.handle
    const shell = await super.createRun(compiledWorkflowShell(handle.plan.workflowId, handle.plan.workflow.name), inputs)
    return createWorkflowContractV2RunState({
      lease,
      runId: shell.runId,
      inputs,
      createdAt: shell.createdAt,
      engineVersion: shell.engineVersion
    })
  }

  override async saveRun(run: WorkflowRunState): Promise<void> {
    const preparedLease = prepareWorkflowContractV2RunPlanLeaseForWrite(this.workspaceRoot, run)
    await super.saveRun(run)
    adoptWorkflowContractV2RunPlanLease(this.workspaceRoot, run, preparedLease)
    if (workflowContractV2RunIsTerminal(run)) {
      releaseWorkflowContractV2RunPlanLease(this.workspaceRoot, run.runId)
    }
  }

  override async loadRun(runId: string): Promise<WorkflowRunState | undefined> {
    const run = await super.loadRun(runId)
    if (run !== undefined) bindAvailableWorkflowContractV2RunPlanLease(this.workspaceRoot, run)
    return run
  }
}

function compiledWorkflowShell(workflowId: string, workflowName: string): CoreWorkflowDefinition {
  return {
    id: workflowId,
    name: workflowName,
    label: workflowName,
    description: workflowName,
    schemaVersion: "workflow-register/v1",
    prompt: "",
    promptWithoutTodo: "",
    commandArgs: [],
    mode: "engine",
    permissions: [],
    autoApprovalEnabled: false,
    workspaceRequired: true,
    hidden: true,
    todoEnabled: false,
    todoRequired: false,
    todoAsSteps: false,
    stepCompletion: "manual",
    stepMessage: "silent",
    stepExecution: { mode: "engineSteps", allowOutOfOrder: false, showInBob: false },
    stepReview: {
      enabled: false,
      pauseAfter: "none",
      requireAcceptBeforeNext: false,
      allowRetry: false,
      allowEditBeforeRetry: false,
      preserveAttempts: false
    },
    todos: [],
    inputs: {},
    requires: { workspace: true },
    preflight: [],
    tools: {},
    guardrails: {},
    artifacts: [],
    completion: {},
    engineSteps: []
  }
}
