import type { AgentProvider, WorkflowRunState } from "../model"
import type { JsonValue } from "./jsonValue"
import type { WorkflowPlanLease } from "./planLease"

export interface CompiledWorkflowRunStore {
  createRunFromPlanLease(
    lease: WorkflowPlanLease,
    inputs: Record<string, unknown>
  ): Promise<WorkflowRunState>
  saveRun(run: WorkflowRunState): Promise<void>
  loadRun(runId: string): Promise<WorkflowRunState | undefined>
}

export interface CompiledWorkflowExecutionOptions {
  readonly executionMode?: "full" | "singleStep"
  readonly stepId?: string
  readonly allowOutOfOrder?: boolean
}

export interface ExecuteCompiledWorkflowRunInput {
  readonly lease: WorkflowPlanLease
  readonly inputs: unknown
  readonly options: CompiledWorkflowExecutionOptions
  readonly workspaceRoot: string
  readonly runStore: CompiledWorkflowRunStore
  readonly signal: AbortSignal
  readonly agentProvider?: AgentProvider
}

export interface CompiledRuntimeContext {
  readonly input: Readonly<Record<string, JsonValue>>
  readonly outputs: Record<string, JsonValue>
}

export type CompiledStepExecutionResult =
  | { readonly kind: "completed"; readonly run?: WorkflowRunState }
  | { readonly kind: "held" }
  | { readonly kind: "failed" }

export const COMMITTED_OUTPUTS_KEY = "workflow.contractV2.committedOutputs"
export const RESULT_KEY = "workflow.contractV2.result"
