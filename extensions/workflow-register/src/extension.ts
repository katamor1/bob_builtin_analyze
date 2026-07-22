import * as vscode from "vscode"
import type { CoreWorkflowDefinition } from "./core/model"
import { OperationHubProvider } from "./gui/operationHubProvider"
import { WorkflowRegisterService } from "./workflowRegisterService"
import type { StepCompletionOptions } from "./workflowRegisterService"
import type { BobWorkflowGateAcceptance, BobWorkflowGateAcceptResult } from "./bobWorkflowGateRegistry"
import type { ArtifactSourceRunArg, RunCommandArg, WorkflowCommandArg } from "./workflowRunCommands"
import type { ProviderRegistryV1Api } from "./api/providerRegistryApi"
import type { LegacyContributionAdapter } from "./api/legacyContributionAdapter"

/**
 * 他の Bob companion extension へ公開する workflow-register API。
 *
 * provider ID、workflow ID、command ID は WORKFLOW.md と companion extension から参照される互換性契約である。
 */
export interface WorkflowRegisterApi extends ProviderRegistryV1Api {
  /**
   * live Bob execution が待機している review gate を承認する。
   *
   * @param workspaceRoot workflow run を所有する workspace root。
   * @param runId 承認済み run identifier。
   * @param stepId 承認済み step identifier。
   * @returns 今回 accept、accept 済み、abort/dispose 済み、または live gate 不在を表す atomic decision。
   */
  acceptBobWorkflowGate: (workspaceRoot: string, runId: string, stepId: string) => BobWorkflowGateAcceptResult
  /**
   * live gate の承認結果と、その承認を待っていた Bob execution metadata を同時に返す。
   */
  acceptBobWorkflowGateWithMetadata: (workspaceRoot: string, runId: string, stepId: string) => BobWorkflowGateAcceptance
  /**
   * 同じ workspace run に対する重複 review acceptance を、現在の service activation 内で共有する。
   *
   * @param workspaceRoot workflow run を所有する workspace root。
   * @param runId acceptance 対象 run identifier。
   * @param operation durable acceptance と Bob reconciliation を含む owner operation。
   * @returns 同じ root/run で進行中の owner Promise、または新しい owner Promise。
   */
  coordinateReviewAcceptance: <T>(workspaceRoot: string, runId: string, operation: () => Promise<T>) => Promise<T>
  /**
   * Deprecated one-release bridge for complete, owned contribution sets.
   *
   * @deprecated Use registerContributionSet directly. This bridge is removed in workflow-register 0.2.0.
   */
  registerLegacyContributionSet: LegacyContributionAdapter["registerLegacyContributionSet"]
  /**
   * registration service が現在把握している workflow definition を返す。
   *
   * @returns 登録済み core workflow definition。
   */
  listWorkflows: () => CoreWorkflowDefinition[]
  /**
   * 登録済み workflow を実行し、必要に応じて workflow input を渡す。
   *
   * @param workflowId workflow identifier。省略時はユーザー選択になる場合がある。
   * @param inputs input id を key にした workflow input values。
   * @returns runtime が返す workflow execution result。
   */
  runWorkflow: (workflowId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  /**
   * 登録済み workflow の単一 step を実行する。
   *
   * @param workflowId workflow identifier。省略時はユーザー選択になる場合がある。
   * @param stepId step identifier。省略時はユーザー選択になる場合がある。
   * @param inputs input id を key にした workflow input values。
   * @returns runtime が返す step execution result。
   */
  runWorkflowStep: (workflowId?: string, stepId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  /**
   * artifact manifest から前段 state を復元し、指定 step から新しい run を開始する。
   *
   * @param workflowId workflow identifier。省略時はユーザー選択になる場合がある。
   * @param stepId 開始 step identifier。省略時はユーザー選択になる場合がある。
   * @param sourceRunId artifact manifest を持つ reuse 元 run identifier。
   * @param inputs input id を key にした workflow input values。
   * @returns runtime が返す workflow execution result。
   */
  startFromStepWithArtifacts: (workflowId?: string, stepId?: string, sourceRunId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
  /**
   * task snapshot の assistant output / task export を artifact file と manifest に取り込む。
   *
   * @param runId import 対象 run identifier。省略時はユーザー選択。
   * @returns import 結果。
   */
  importArtifactsFromTaskSnapshots: (runId?: string) => Promise<unknown>
  /**
   * workflow run の次に実行可能な step を実行して run を進める。
   *
   * @param runId run identifier。省略時は active または選択可能な run を使う。
   * @returns runtime が返す next-step execution result。
   */
  runNextStep: (runId?: string) => Promise<unknown>
  /**
   * pending branch checkpoint を承認し、loop allowance を延長する。
   *
   * @param runId run identifier。省略時は active または選択可能な run を使う。
   * @returns 更新後の workflow run。
   */
  approveBranchCheckpoint: (runId?: string) => Promise<unknown>
  /**
   * branch checkpoint で待機中の workflow run を中止する。
   *
   * @param runId run identifier。省略時は active または選択可能な run を使う。
   * @returns 更新後の workflow run。
   */
  abortBranchCheckpoint: (runId?: string) => Promise<unknown>
  /**
   * workflow run の branching loop / checkpoint / history diagnostics を表示する。
   *
   * @param runId run identifier。省略時は active または選択可能な run を使う。
   * @returns inspection 対象の workflow run、または説明 message。
   */
  inspectBranching: (runId?: string) => Promise<unknown>
}

/**
 * workflow-register 拡張を有効化し、VS Code command を registration service へ接続する。
 *
 * 公開 API と command ID は companion extension / WORKFLOW.md から参照されるため、この composition root で安定させる。
 *
 * @param context command 登録と disposable を所有する VS Code extension context。
 * @returns workflow-aware companion extension が利用する public API object。
 */
export function activate(context: vscode.ExtensionContext): WorkflowRegisterApi {
  const service = new WorkflowRegisterService({
    id: String(context.extension.id),
    version: String(context.extension.packageJSON.version ?? "unknown")
  })
  const providerRegistryApi = service.providerRegistryApi
  const api: WorkflowRegisterApi = Object.freeze({
    apiVersion: providerRegistryApi.apiVersion,
    negotiateProviderRegistry: providerRegistryApi.negotiateProviderRegistry,
    registerContributionSet: providerRegistryApi.registerContributionSet,
    registerLegacyContributionSet: (manifest, provenance, handlers) => (
      service.registerLegacyContributionSet(manifest, provenance, handlers)
    ),
    acceptBobWorkflowGate: (workspaceRoot, runId, stepId) => service.acceptBobWorkflowGate(workspaceRoot, runId, stepId),
    acceptBobWorkflowGateWithMetadata: (workspaceRoot, runId, stepId) => service.acceptBobWorkflowGateWithMetadata(workspaceRoot, runId, stepId),
    coordinateReviewAcceptance: (workspaceRoot, runId, operation) => service.coordinateReviewAcceptance(workspaceRoot, runId, operation),
    listWorkflows: () => service.listCoreWorkflows(),
    runWorkflow: (workflowId, inputs) => service.runWorkflow(workflowId, inputs),
    runWorkflowStep: (workflowId, stepId, inputs) => service.runWorkflowStep(workflowId, stepId, inputs),
    startFromStepWithArtifacts: (workflowId, stepId, sourceRunId, inputs) => service.startFromStepWithArtifacts(workflowId, stepId, sourceRunId, inputs),
    importArtifactsFromTaskSnapshots: (runId) => service.importArtifactsFromTaskSnapshots(runId),
    runNextStep: (runId) => service.runNextStep(runId),
    approveBranchCheckpoint: (runId) => service.approveBranchCheckpoint(runId),
    abortBranchCheckpoint: (runId) => service.abortBranchCheckpoint(runId),
    inspectBranching: (runId) => service.inspectBranching(runId)
  } satisfies WorkflowRegisterApi)
  const operationHub = new OperationHubProvider({
    api,
    extensionUri: context.extensionUri,
    activeSteps: () => service.listActiveSteps()
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

/**
 * workflow-register 拡張を無効化する。
 *
 * @returns なし。
 */
export function deactivate(): void {
  // context subscriptions 以外に明示破棄する resource はない。
}
