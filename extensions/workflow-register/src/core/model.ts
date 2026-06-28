export type WorkflowSchemaVersion = "legacy" | "workflow-register/v1"
export type WorkflowStepType = "command" | "agent" | "manual" | "result"
export type RunStatus = "running" | "held" | "completed" | "failed"
export type StepRunStatus = "pending" | "running" | "held" | "completed" | "failed"
export type WorkflowFailurePolicy = "stop" | "continue" | "warn"

export interface WorkflowInputDefinition {
  type: "string" | "number" | "boolean" | "select"
  title?: string
  required?: boolean
  requiredWhen?: string
  default?: unknown
  options?: string[]
}

export interface WorkflowRequiresDefinition {
  workspace?: boolean
  bob?: {
    minVersion?: string
  }
  files?: string[]
}

export interface WorkflowPreflightDefinition {
  id: string
  title?: string
  required?: boolean
  checks?: string[]
  files?: string[]
  failurePolicy?: WorkflowFailurePolicy
}

export interface WorkflowToolDefinition {
  purpose?: string
  required?: boolean
  outputKey?: string
  inputSource?: string
  failurePolicy?: WorkflowFailurePolicy
}

export interface WorkflowApprovalRuleDefinition {
  id?: string
  when?: string
  message?: string
}

export interface WorkflowGuardrailsDefinition {
  allowedCommands?: string[]
  deniedCommands?: string[]
  requireApproval?: WorkflowApprovalRuleDefinition[]
}

export interface WorkflowArtifactDefinition {
  id: string
  producedBy?: string
  path: string
  schema?: string
}

export interface WorkflowCompletionDefinition {
  summary?: string
  includeArtifacts?: boolean
  validateResult?: boolean
  visualization?: {
    type?: string
    enabled?: boolean
  }
}

export interface WorkflowActionDefinition {
  provider: string
  args?: unknown
}

export type ResultSourceDefinition =
  | { source: "state"; stateKey: string; sinks: ResultSinkDefinition[] }
  | { source: "literal"; text: string; sinks: ResultSinkDefinition[] }
  | { source: "agent"; sinks: ResultSinkDefinition[] }

export type ResultSinkDefinition =
  | { type: "command"; command: string; args?: unknown[] }
  | { type: "file"; path: string; encoding?: BufferEncoding }

export interface BaseEngineStep {
  id: string
  title: string
  type: WorkflowStepType
  required?: boolean
}

export interface CommandEngineStep extends BaseEngineStep {
  type: "command"
  action: WorkflowActionDefinition
  resultKey?: string
}

export interface AgentEngineStep extends BaseEngineStep {
  type: "agent"
  prompt?: string
  resultKey?: string
  result?: ResultSourceDefinition
}

export interface ManualEngineStep extends BaseEngineStep {
  type: "manual"
}

export interface ResultEngineStep extends BaseEngineStep {
  type: "result"
  result: ResultSourceDefinition
}

export type EngineStep = CommandEngineStep | AgentEngineStep | ManualEngineStep | ResultEngineStep

export interface CoreWorkflowDefinition {
  id: string
  name: string
  label: string
  description: string
  schemaVersion: WorkflowSchemaVersion
  mode?: string
  category?: string
  permissions: string[]
  inputs: Record<string, WorkflowInputDefinition>
  requires: WorkflowRequiresDefinition
  preflight: WorkflowPreflightDefinition[]
  tools: Record<string, WorkflowToolDefinition>
  guardrails: WorkflowGuardrailsDefinition
  artifacts: WorkflowArtifactDefinition[]
  completion: WorkflowCompletionDefinition
  engineSteps: EngineStep[]
}

export interface ParseWorkflowRequest {
  sourceId: string
  filePath: string
  text: string
}

export type ParseWorkflowResult =
  | { ok: true; workflow: CoreWorkflowDefinition; diagnostics: string[] }
  | { ok: false; diagnostics: string[] }

export interface ActionExecutionInput {
  args: unknown
  inputs: Record<string, unknown>
  state?: Record<string, string>
  workflowId?: string
  runId?: string
  stepId?: string
}

export interface ActionExecutionResult {
  ok: boolean
  value?: unknown
  error?: string
}

export interface ResultSinkWriteInput {
  workflowId: string
  runId: string
  stepId: string
  text: string
}

export interface ResultSinkWriteResult {
  ok: boolean
  value?: unknown
  path?: string
  error?: string
}

export interface RunStepState {
  id: string
  title: string
  type: WorkflowStepType
  status: StepRunStatus
  startedAt?: string
  completedAt?: string
  error?: string
}

export interface WorkflowRunState {
  runId: string
  workflowId: string
  workflowName: string
  status: RunStatus
  currentStep?: string
  inputs: Record<string, unknown>
  state: Record<string, string>
  steps: RunStepState[]
  createdAt: string
  updatedAt: string
  error?: string
}
