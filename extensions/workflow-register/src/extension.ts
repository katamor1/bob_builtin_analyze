import * as vscode from "vscode"
import type { ActionProvider, ActionProviderRegistration } from "./core/actionRegistry"
import type { AgentProvider, CoreWorkflowDefinition } from "./core/model"
import type { ResultSinkRegistry } from "./core/resultSinkRegistry"
import { OperationHubProvider } from "./gui/operationHubProvider"
import { WorkflowRegisterService } from "./workflowRegisterService"
import type { StepCompletionOptions } from "./workflowRegisterService"
import type { BobWorkflowGateAcceptance, BobWorkflowGateAcceptResult } from "./bobWorkflowGateRegistry"
import type { ArtifactSourceRunArg, RunCommandArg, WorkflowCommandArg } from "./workflowRunCommands"
import type {
  CompileCurrentWorkflowContractV2Input,
  CompileWorkflowContractV2GenerationInput,
  WorkflowContractV2AcquireResult,
  WorkflowContractV2CompileResult,
  WorkflowContractV2Slot
} from "./workflowContractV2Entrypoint"

/**
 * 他の Bob companion extension へ公開する workflow-register API。
 *
 * provider ID、workflow ID、command ID は WORKFLOW.md と companion extension から参照される互換性契約である。
 */
export interface WorkflowRegisterApi {
  acceptBobWorkflowGate: (workspaceRoot: string, runId: string, stepId: string) => BobWorkflowGateAcceptResult
  acceptBobWorkflowGateWithMetadata: (workspaceRoot: string, runId: string, stepId: string) => BobWorkflowGateAcceptance
  coordinateReviewAcceptance: <T>(workspaceRoot: string, runId: string, operation: () => Promise<T>) => Promise<T>
  registerActionProvider: (provider: ActionProvider) => ActionProviderRegistration
  registerAgentProvider: (provider: AgentProvider) => void
  registerResultSink: (type: string, handler: Parameters<ResultSinkRegistry["register"]>[1]) => void
  listWorkflows: () => CoreWorkflowDefinition[]
  compileCurrentWorkflowPackage: (
    input: CompileCurrentWorkflowContractV2Input
  ) => Promise<WorkflowContractV2CompileResult>
  compileWorkflowPackageGeneration: (
    input: CompileWorkflowContractV2GenerationInput
  ) => Promise<WorkflowContractV2CompileResult>
  acquireCurrentWorkflowPackage: (
    input: CompileCurrentWorkflowContractV2Input
  ) => Promise<WorkflowContractV2AcquireResult>
  invalidateWorkflowPackageSlot: (slot: WorkflowContractV2Slot) => void
  runWorkflow: (workflowId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  runWorkflowStep: (workflowId?: string, stepId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  startFromStepWithArtifacts: (workflowId?: string, stepId?: string, sourceRunId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  importArtifactsFromTaskSnapshots: (runId?: string) => Promise<unknown>
  runNextStep: (runId?: string) => Promise<unknown>
  approveBranchCheckpoint: (runId?: string) => Promise<unknown>
  abortBranchCheckpoint: (runId?: string) => Promise<unknown>
  inspectBranching: (runId?: string) => Promise<unknown>
}

export function activate(context: vscode.ExtensionContext): WorkflowRegisterApi {
  const service = new WorkflowRegisterService(String(context.extension.packageJSON.version ?? "unknown"))
  const api: WorkflowRegisterApi = {
    acceptBobWorkflowGate: (workspaceRoot, runId, stepId) => service.acceptBobWorkflowGate(workspaceRoot, runId, stepId),
    acceptBobWorkflowGateWithMetadata: (workspaceRoot, runId, stepId) => service.acceptBobWorkflowGateWithMetadata(workspaceRoot, runId, stepId),
    coordinateReviewAcceptance: (workspaceRoot, runId, operation) => service.coordinateReviewAcceptance(workspaceRoot, runId, operation),
    registerActionProvider: (provider) => service.registerActionProvider(provider),
    registerAgentProvider: (provider) => service.registerAgentProvider(provider),
    registerResultSink: (type, handler) => service.registerResultSink(type, handler),
    listWorkflows: () => service.listCoreWorkflows(),
    compileCurrentWorkflowPackage: (input) => service.compileCurrentWorkflowPackage(input),
    compileWorkflowPackageGeneration: (input) => service.compileWorkflowPackageGeneration(input),
    acquireCurrentWorkflowPackage: (input) => service.acquireCurrentWorkflowPackage(input),
    invalidateWorkflowPackageSlot: (slot) => service.invalidateWorkflowPackageSlot(slot),
    runWorkflow: (workflowId, inputs) => service.runWorkflow(workflowId, inputs),
    runWorkflowStep: (workflowId, stepId, inputs) => service.runWorkflowStep(workflowId, stepId, inputs),
    startFromStepWithArtifacts: (workflowId, stepId, sourceRunId, inputs) => service.startFromStepWithArtifacts(workflowId, stepId, sourceRunId, inputs),
    importArtifactsFromTaskSnapshots: (runId) => service.importArtifactsFromTaskSnapshots(runId),
    runNextStep: (runId) => service.runNextStep(runId),
    approveBranchCheckpoint: (runId) => service.approveBranchCheckpoint(runId),
    abortBranchCheckpoint: (runId) => service.abortBranchCheckpoint(runId),
    inspectBranching: (runId) => service.inspectBranching(runId)
  }
  const operationHub = new OperationHubProvider({
    api,
    extensionUri: context.extensionUri,
    activeSteps: () => service.listActiveSteps(),
    compileCurrentWorkflowPackage: (input) => service.compileCurrentWorkflowPackage(input)
  })
  context.subscriptions.push(
    service,
    operationHub,
    vscode.window.registerWebviewViewProvider("workflowRegister.operationHub", operationHub),
    vscode.commands.registerCommand("workflowRegister.openOperationHub", (input?: unknown) => operationHub.open(input)),
    vscode.commands.registerCommand("workflowRegister.refreshOperationHub", () => operationHub.refreshFromCommand()),
    vscode.commands.registerCommand("workflowRegister.openOperationHubPanel", (input?: unknown) => operationHub.openPanel(input)),
    vscode.commands.registerCommand("workflowRegister.reload", () => service.reload({ showReport: true })),
    vscode.commands.registerCommand("workflowRegister.inspect", () => service.inspect()),
    vscode.commands.registerCommand("workflowRegister.completeCurrentStep", (options?: StepCompletionOptions) => service.completeCurrentStep(options)),
    vscode.commands.registerCommand("workflowRegister.completeStep", (options?: StepCompletionOptions) => service.completeCurrentStep(options)),
    vscode.commands.registerCommand("workflowRegister.inspectActiveSteps", () => service.inspectActiveSteps()),
    vscode.commands.registerCommand(
      "workflowRegister.runWorkflow",
      (workflowArg?: WorkflowCommandArg, inputs?: Record<string, unknown>) => service.runWorkflow(workflowArg, inputs)
    ),
    vscode.commands.registerCommand(
      "workflowRegister.runWorkflowStep",
      (workflowId?: string, stepId?: string, inputs?: Record<string, unknown>) => {
        return service.runWorkflowStep(workflowId, stepId, inputs)
      }
    ),
    vscode.commands.registerCommand(
      "workflowRegister.startFromStepWithArtifacts",
      (workflowId?: string, stepId?: string, sourceRunArg?: ArtifactSourceRunArg, inputs?: Record<string, unknown>) => service.startFromStepWithArtifacts(workflowId, stepId, sourceRunArg, inputs)
    ),
    vscode.commands.registerCommand("workflowRegister.importArtifactsFromTaskSnapshots", (runId?: string) => service.importArtifactsFromTaskSnapshots(runId)),
    vscode.commands.registerCommand("workflowRegister.runNextStep", (runArg?: RunCommandArg) => service.runNextStep(runArg)),
    vscode.commands.registerCommand("workflowRegister.openManualStepPanel", (runArg?: unknown) => service.openManualStepPanel(runArg as Parameters<WorkflowRegisterService["openManualStepPanel"]>[0])),
    vscode.commands.registerCommand("workflowRegister.inspectRuns", () => service.inspectRuns()),
    vscode.commands.registerCommand("workflowRegister.resumeRun", (runArg?: RunCommandArg) => service.resumeRun(runArg)),
    vscode.commands.registerCommand("workflowRegister.recoverDetachedHeldRun", (runArg?: RunCommandArg) => service.recoverDetachedHeldRun(runArg)),
    vscode.commands.registerCommand("workflowRegister.retryCurrentStep", (runArg?: RunCommandArg) => service.retryCurrentStep(runArg)),
    vscode.commands.registerCommand("workflowRegister.approveBranchCheckpoint", (runId?: string) => service.approveBranchCheckpoint(runId)),
    vscode.commands.registerCommand("workflowRegister.abortBranchCheckpoint", (runId?: string) => service.abortBranchCheckpoint(runId)),
    vscode.commands.registerCommand("workflowRegister.inspectBranching", (runId?: string) => service.inspectBranching(runId))
  )
  service.reload({ showReport: false }).catch((error) => console.warn("Bob workflow registration failed", error))
  const retryDelaysMs = [3000, 10000, 30000, 60000, 120000]
  for (const delayMs of retryDelaysMs) {
    const timer = setTimeout(
      () => service.reload({ showReport: false }).catch((error) => {
        console.warn("Bob workflow registration retry failed", error)
      }),
      delayMs
    )
    context.subscriptions.push({ dispose: () => clearTimeout(timer) })
  }
  return api
}

export function deactivate(): void {
  // context subscriptions 以外に明示破棄する resource はない。
}
