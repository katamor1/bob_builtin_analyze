import type * as vscode from "vscode"

import type { WorkflowDefinition, WorkflowStepDefinition } from "./bobWorkflowTypes"
import type { CompiledWorkflowPlanHandle } from "./core/contractV2"
import type { RawWorkflowPackage } from "./core/contractV2/packageLoaderContract"
import type { CoreWorkflowDefinition, EngineStep } from "./core/model"
import type { MarkerRootCandidate } from "./core/workspaceRoots"
import { adaptCoreWorkflowForBob } from "./workflowAdapter"
import type { WorkflowContractV2Slot } from "./workflowContractV2Entrypoint"

export interface WorkflowContractV2CoreMetadata {
  readonly schemaVersion: "workflow-contract-v2-view/v1"
  readonly collectionId: string
  readonly collectionRoot: string
  readonly workflowId: string
  readonly packageDigest: string
  readonly planDigest: string
}

export interface WorkflowContractV2DefinitionBinding {
  readonly schemaVersion: "workflow-contract-v2-binding/v1"
  readonly handle: CompiledWorkflowPlanHandle
  readonly rawPackage: RawWorkflowPackage
  readonly slot: WorkflowContractV2Slot
}

export type ContractV2CoreWorkflowDefinition = CoreWorkflowDefinition & {
  readonly contractV2: WorkflowContractV2CoreMetadata
}

export type ContractV2WorkflowDefinition = WorkflowDefinition & {
  readonly contractV2: WorkflowContractV2DefinitionBinding
}

export function adaptCompiledWorkflowForProduct(input: {
  readonly handle: CompiledWorkflowPlanHandle
  readonly rawPackage: RawWorkflowPackage
  readonly slot: WorkflowContractV2Slot
  readonly root: MarkerRootCandidate
  readonly currentPointer: vscode.Uri
}): {
  readonly workflow: ContractV2WorkflowDefinition
  readonly coreWorkflow: ContractV2CoreWorkflowDefinition
} {
  const plan = input.handle.plan
  const compiled = plan.workflow
  const metadata = Object.freeze({
    schemaVersion: "workflow-contract-v2-view/v1" as const,
    collectionId: input.slot.collectionId,
    collectionRoot: input.slot.collectionRoot,
    workflowId: input.slot.workflowId,
    packageDigest: plan.packageDigest,
    planDigest: input.handle.planDigest
  })
  const engineSteps = compiled.steps.map((step): EngineStep => ({
    id: step.id,
    title: step.title,
    type: "manual",
    required: step.required
  }))
  const coreWorkflow = {
    id: compiled.id,
    logicalWorkflowId: compiled.id,
    name: compiled.name,
    label: compiled.name,
    menuLabel: compiled.name,
    description: compiled.description,
    schemaVersion: "workflow-register/v1",
    definitionHash: input.handle.planDigest,
    filePath: input.root.root,
    workflowRoot: input.root.root,
    workflowFile: input.currentPointer.fsPath,
    workflowFolderName: input.slot.workflowId,
    prompt: plan.prompts[0]?.text ?? "",
    promptWithoutTodo: plan.prompts[0]?.text ?? "",
    commandArgs: [],
    mode: "engine",
    permissions: [],
    autoApprovalEnabled: false,
    workspaceRequired: true,
    hidden: false,
    todoEnabled: false,
    todoRequired: false,
    todoAsSteps: false,
    stepCompletion: "manual",
    stepMessage: "full",
    stepExecution: {
      mode: "engineSteps",
      allowOutOfOrder: false,
      showInBob: true
    },
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
    artifacts: plan.requiredArtifacts.map((artifact) => ({
      id: artifact.id,
      producedBy: artifact.producedBy,
      path: artifact.path,
      schema: artifact.schema
    })),
    completion: {},
    engineSteps,
    contractV2: metadata
  } as ContractV2CoreWorkflowDefinition

  const bobTaskBinding = Object.freeze({
    profileDigest: plan.bobProfileBinding.profileDigest,
    taskCapabilities: plan.bobProfileBinding.taskCapabilities
  })
  const base = adaptCoreWorkflowForBob(coreWorkflow, input.currentPointer, bobTaskBinding)
  const binding = Object.freeze({
    schemaVersion: "workflow-contract-v2-binding/v1" as const,
    handle: input.handle,
    rawPackage: input.rawPackage,
    slot: input.slot
  })
  const workflow = Object.assign(base, { contractV2: binding }) as ContractV2WorkflowDefinition
  workflow.stepsById = Object.fromEntries(
    compiled.steps.map((step) => [step.id, compiledStepView(step.id, step.title, step.required)])
  )
  workflow.todos = compiled.steps.map((step) => ({ id: step.id, text: step.title, raw: `${step.id}: ${step.title}` }))
  return Object.freeze({ workflow, coreWorkflow })
}

export function workflowContractV2Binding(
  workflow: WorkflowDefinition
): WorkflowContractV2DefinitionBinding | undefined {
  const value = (workflow as WorkflowDefinition & { contractV2?: WorkflowContractV2DefinitionBinding }).contractV2
  return value?.schemaVersion === "workflow-contract-v2-binding/v1" ? value : undefined
}

export function workflowContractV2CoreMetadata(
  workflow: CoreWorkflowDefinition
): WorkflowContractV2CoreMetadata | undefined {
  const value = (workflow as CoreWorkflowDefinition & { contractV2?: WorkflowContractV2CoreMetadata }).contractV2
  return value?.schemaVersion === "workflow-contract-v2-view/v1" ? value : undefined
}

function compiledStepView(id: string, title: string, required: boolean): WorkflowStepDefinition {
  return {
    id,
    prompt: title,
    commandArgs: [],
    sendResult: false,
    required,
    completeOnSuccess: false,
    runAgent: false,
    includeState: [],
    maxResultBytes: 20_000,
    stateRequired: true,
    captureResult: false,
    resultCommandArgs: []
  }
}
