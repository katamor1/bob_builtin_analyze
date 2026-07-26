import * as path from "path"
import * as vscode from "vscode"
import {
  BobWorkflowGateRegistry,
  type BobWorkflowGateAcceptance,
  type BobWorkflowGateAcceptResult
} from "./bobWorkflowGateRegistry"
import { StepRuntime, type StepCompletionExpectation } from "./bobStepRuntime"
import type { BobSourceLike } from "./bobApi"
import { createDefaultActionRegistry } from "./core/actionRegistry"
import type {
  ActionProvider,
  ActionProviderRegistration,
  WorkflowProviderRegistration,
  WorkflowProviderRegistrationInput
} from "./core/actionRegistry"
import { ActionProviderRegistrationStore } from "./core/actionProviderRegistrationStore"
import type { AgentProvider, CoreWorkflowDefinition } from "./core/model"
import type { ResultSinkRegistry } from "./core/resultSinkRegistry"
import {
  fallbackWorkspaceRootCandidates,
  findWorkflowRootCandidates,
  MarkerRootCandidate,
  relativePathFromRoot,
  workspaceRootFromFile
} from "./core/workspaceRoots"
import { isOperationHubWorkflowMutationTarget } from "./operationHubMutationTarget"
import { showMarkdownReport } from "./reports"
import { ManualStepPanelController } from "./webview/manualStepPanel"
import {
  deactivateRegisteredSource,
  registerWorkflows as registerWorkflowDefinitions,
  type RegistrationResult
} from "./workflowRegistrationService"
import type {
  CompileCurrentWorkflowContractV2Input,
  CompileWorkflowContractV2GenerationInput,
  WorkflowContractV2AcquireResult,
  WorkflowContractV2CompileResult,
  WorkflowContractV2Slot
} from "./workflowContractV2Entrypoint"
import {
  acquireWorkflowContractV2RunLease,
  verifyWorkflowContractV2CurrentPlan,
  WorkflowContractV2BoundaryError
} from "./workflowContractV2ExecutionGuard"
import { createWorkflowContractV2ProductEntrypoint } from "./workflowContractV2Product"
import { WorkflowContractV2ProviderLifecycle } from "./workflowContractV2ProviderLifecycle"
import { workflowContractV2CoreMetadata } from "./workflowContractV2View"
import { WorkflowRuntimeFactory } from "./workflowRuntimeFactory"
import { collectBobWorkflowInputs } from "./workflowInputPrompt"
import { WorkflowRunCommandService } from "./workflowRunCommands"
import type { ArtifactSourceRunArg, RunCommandArg, WorkflowCommandArg } from "./workflowRunCommands"
import { requireTrustedWorkspace } from "./workspaceTrust"
import { ReviewAcceptanceCoordinator } from "./reviewAcceptanceCoordinator"

const LEGACY_WORKFLOW_GLOB = "**/.bob/workflows/*/WORKFLOW.md"
const CONTRACT_V2_POINTER_GLOB = "**/.bob/workflows/*/current.json"

export interface StepCompletionOptions extends StepCompletionExpectation {
  silent?: boolean
}

export class WorkflowRegisterService implements vscode.Disposable {
  private readonly registeredIds = new Set<string>()
  private readonly legacyWatcher = vscode.workspace.createFileSystemWatcher(LEGACY_WORKFLOW_GLOB)
  private readonly contractV2Watcher = vscode.workspace.createFileSystemWatcher(CONTRACT_V2_POINTER_GLOB)
  private readonly bobWorkflowGates = new BobWorkflowGateRegistry()
  private readonly reviewAcceptances = new ReviewAcceptanceCoordinator()
  private readonly stepRuntime = new StepRuntime()
  private readonly coreWorkflows = new Map<string, CoreWorkflowDefinition>()
  private readonly actionRegistry = createDefaultActionRegistry({
    isWorkspaceTrusted: () => vscode.workspace.isTrusted,
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args)
  })
  private readonly customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }> = []
  private readonly actionProviderRegistrations = new ActionProviderRegistrationStore()
  private readonly manualStepPanel: ManualStepPanelController
  private readonly runtimeFactory: WorkflowRuntimeFactory
  private readonly contractV2Providers: WorkflowContractV2ProviderLifecycle
  private readonly runCommands: WorkflowRunCommandService
  private agentProvider?: AgentProvider
  private registeredSource?: BobSourceLike
  private lastResult: RegistrationResult = { summary: "ワークフロー定義はまだ読み込まれていません。", lines: [] }

  constructor(private readonly engineVersion: string) {
    this.manualStepPanel = new ManualStepPanelController({
      host: {
        createWebviewPanel: (viewType, title, showOptions, options) => vscode.window.createWebviewPanel(
          viewType,
          title,
          showOptions as vscode.ViewColumn,
          options
        ),
        showWarningMessage: (message, options, ...items) => Promise.resolve(vscode.window.showWarningMessage(message, options, ...items)),
        showInformationMessage: (message) => Promise.resolve(vscode.window.showInformationMessage(message)),
        activeViewColumn: vscode.ViewColumn.Active
      },
      completeStep: ({ activeKey, expectedRunId, expectedStepId }) => this.stepRuntime.completeStepByKeyResult(activeKey, {
        expectedRunId,
        expectedStepId
      })
    })
    this.runtimeFactory = new WorkflowRuntimeFactory({
      engineVersion,
      actionRegistry: this.actionRegistry,
      customResultSinks: this.customResultSinks,
      stepRuntime: this.stepRuntime,
      gateRegistry: this.bobWorkflowGates,
      agentProvider: () => this.agentProvider,
      inputsProvider: (workflow, provided) => collectBobWorkflowInputs(workflow, provided),
      contractV2AcquireRunLease: (workflow) => this.acquireContractV2RunLease(workflow),
      contractV2RunExecutor: () => this.failContractV2CompiledRuntime(),
      contractV2BeforeContinuation: (workflow) => this.assertContractV2ContinuationReady(workflow),
      onManualStepHeld: (input) => this.manualStepPanel.show(input)
    })
    this.contractV2Providers = new WorkflowContractV2ProviderLifecycle({
      actionRegistry: this.actionRegistry,
      createEntrypoint: () => createWorkflowContractV2ProductEntrypoint({
        actionRegistry: this.actionRegistry,
        planStore: {
          getOrCompile: (input) => this.runtimeFactory.getOrCompileWorkflowPlan(input),
          acquire: (input) => this.runtimeFactory.acquireWorkflowPlan(input),
          invalidate: (collectionId, workflowId) => this.runtimeFactory.invalidateWorkflowPlanSlot(collectionId, workflowId)
        }
      }),
      onChanged: () => {
        void this.reload({ showReport: false })
      }
    })
    this.runCommands = new WorkflowRunCommandService({
      coreWorkflows: this.coreWorkflows,
      runtimeFactory: this.runtimeFactory,
      ensureWorkflowsLoaded: () => this.reload({ showReport: false }),
      workflowRootCandidates: () => this.workflowRootCandidates(),
      activeSteps: () => this.stepRuntime.list(),
      showManualStepPanel: (input) => this.manualStepPanel.show(input),
      gateRegistry: this.bobWorkflowGates,
      coordinateGateDecision: (workspaceRoot, runId, kind, operation) => (
        this.reviewAcceptances.coordinate(workspaceRoot, runId, kind, operation)
      )
    })
    this.legacyWatcher.onDidCreate(() => this.reload({ showReport: false }))
    this.legacyWatcher.onDidChange(() => this.reload({ showReport: false }))
    this.legacyWatcher.onDidDelete(() => this.reload({ showReport: false }))
    this.contractV2Watcher.onDidCreate((uri) => this.onContractV2PointerChanged(uri))
    this.contractV2Watcher.onDidChange((uri) => this.onContractV2PointerChanged(uri))
    this.contractV2Watcher.onDidDelete((uri) => this.onContractV2PointerChanged(uri))
  }

  dispose(): void {
    this.legacyWatcher.dispose()
    this.contractV2Watcher.dispose()
    this.contractV2Providers.dispose()
    this.manualStepPanel.dispose()
    this.bobWorkflowGates.dispose()
    try {
      this.actionProviderRegistrations.dispose()
    } catch (error) {
      console.warn("Failed to dispose one or more workflow action providers", error)
    }
    const source = this.registeredSource
    this.registeredSource = undefined
    void deactivateRegisteredSource(source)
  }

  async inspect(): Promise<void> {
    await showMarkdownReport("Bob ワークフロー登録", this.lastResult.summary, this.lastResult.lines)
  }

  listActiveSteps() {
    return this.stepRuntime.list()
  }

  async inspectActiveSteps(): Promise<void> {
    const steps = this.stepRuntime.list()
    const lines = steps.length === 0
      ? ["- 実行中の Bob ワークフローステップはありません。"]
      : steps.map((step) => [
        `- 実行キー（key）=${step.key}`,
        `ワークフロー ID=${step.workflowId}`,
        `ワークフロー名=${step.workflowLabel}`,
        `ステップ ID=${step.stepId}`,
        `ステップ名=${step.title}`
      ].join("; "))
    await showMarkdownReport("実行中の Bob ワークフローステップ", `${steps.length}件のステップが実行中です。`, lines)
  }

  async completeCurrentStep(options: StepCompletionOptions = {}): Promise<string> {
    const trustError = await requireTrustedWorkspace("ワークフローステップを完了", { showWarning: !options.silent })
    if (trustError) return trustError
    const message = await this.stepRuntime.completeCurrentStep({
      expectedRunId: options.expectedRunId,
      expectedStepId: options.expectedStepId,
      stateUpdates: options.stateUpdates
    })
    if (!options.silent) await vscode.window.showInformationMessage(message)
    return message
  }

  async openManualStepPanel(runArg?: RunCommandArg): Promise<string> {
    return this.runCommands.openManualStepPanel(runArg)
  }

  acceptBobWorkflowGate(workspaceRoot: string, runId: string, stepId: string): BobWorkflowGateAcceptResult {
    return this.bobWorkflowGates.accept(workspaceRoot, runId, stepId)
  }

  acceptBobWorkflowGateWithMetadata(workspaceRoot: string, runId: string, stepId: string): BobWorkflowGateAcceptance {
    return this.bobWorkflowGates.acceptWithMetadata(workspaceRoot, runId, stepId)
  }

  coordinateReviewAcceptance<T>(workspaceRoot: string, runId: string, operation: () => Promise<T>): Promise<T> {
    return this.reviewAcceptances.coordinate(workspaceRoot, runId, "review-accept", operation)
  }

  registerActionProvider(provider: ActionProvider): ActionProviderRegistration {
    return this.actionProviderRegistrations.track(this.actionRegistry.register(provider))
  }

  registerWorkflowProviderContract(
    input: WorkflowProviderRegistrationInput
  ): WorkflowProviderRegistration {
    return this.contractV2Providers.register(input)
  }

  registerAgentProvider(provider: AgentProvider): void {
    this.agentProvider = provider
  }

  registerResultSink(type: string, handler: Parameters<ResultSinkRegistry["register"]>[1]): void {
    this.customResultSinks.push({ type, handler })
  }

  listCoreWorkflows(): CoreWorkflowDefinition[] {
    return this.runCommands.listCoreWorkflows()
  }

  compileCurrentWorkflowPackage(
    input: CompileCurrentWorkflowContractV2Input
  ): Promise<WorkflowContractV2CompileResult> {
    return this.contractV2Providers.current().compileCurrent(input)
  }

  compileWorkflowPackageGeneration(
    input: CompileWorkflowContractV2GenerationInput
  ): Promise<WorkflowContractV2CompileResult> {
    return this.contractV2Providers.current().compileGeneration(input)
  }

  acquireCurrentWorkflowPackage(
    input: CompileCurrentWorkflowContractV2Input
  ): Promise<WorkflowContractV2AcquireResult> {
    return this.contractV2Providers.current().acquireCurrent(input)
  }

  invalidateWorkflowPackageSlot(slot: WorkflowContractV2Slot): void {
    this.contractV2Providers.current().invalidateSlot(slot)
  }

  async runWorkflow(workflowArg?: WorkflowCommandArg, inputs: Record<string, unknown> = {}): Promise<unknown> {
    if (isOperationHubWorkflowMutationTarget(workflowArg)) {
      const workflow = this.coreWorkflows.get(workflowArg.workflowId)
      if (workflow === undefined) {
        throw new WorkflowContractV2BoundaryError(
          "The selected workflow is no longer registered; refresh Operation Hub before running it."
        )
      }
      await verifyWorkflowContractV2CurrentPlan({
        workflow,
        compileCurrent: (input) => this.compileCurrentWorkflowPackage(input)
      })
    }
    return this.runCommands.runWorkflow(workflowArg, inputs)
  }

  async runWorkflowStep(
    workflowId?: string,
    stepId?: string,
    inputs: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.runCommands.runWorkflowStep(workflowId, stepId, inputs)
  }

  async startFromStepWithArtifacts(
    workflowId?: string,
    stepId?: string,
    sourceRunArg?: ArtifactSourceRunArg,
    inputs: Record<string, unknown> = {}
  ): Promise<unknown> {
    return this.runCommands.startFromStepWithArtifacts(workflowId, stepId, sourceRunArg, inputs)
  }

  async importArtifactsFromTaskSnapshots(runId?: string): Promise<unknown> {
    return this.runCommands.importArtifactsFromTaskSnapshots(runId)
  }

  async runNextStep(runArg?: RunCommandArg): Promise<unknown> {
    return this.runCommands.runNextStep(runArg)
  }

  async inspectRuns(): Promise<void> {
    return this.runCommands.inspectRuns()
  }

  async resumeRun(runArg?: RunCommandArg): Promise<unknown> {
    return this.runCommands.resumeRun(runArg)
  }

  async recoverDetachedHeldRun(runArg?: RunCommandArg): Promise<unknown> {
    return this.runCommands.recoverDetachedHeldRun(runArg)
  }

  async retryCurrentStep(runArg?: RunCommandArg): Promise<unknown> {
    return this.runCommands.retryCurrentStep(runArg)
  }

  async approveBranchCheckpoint(runId?: string): Promise<unknown> {
    return this.runCommands.approveBranchCheckpoint(runId)
  }

  async abortBranchCheckpoint(runId?: string): Promise<unknown> {
    return this.runCommands.abortBranchCheckpoint(runId)
  }

  async inspectBranching(runId?: string): Promise<unknown> {
    return this.runCommands.inspectBranching(runId)
  }

  private acquireContractV2RunLease(workflow: CoreWorkflowDefinition) {
    return acquireWorkflowContractV2RunLease({
      workflow,
      acquireCurrent: (input) => this.acquireCurrentWorkflowPackage(input)
    })
  }

  private failContractV2CompiledRuntime(): never {
    throw new WorkflowContractV2BoundaryError(
      "Contract v2 runtime execution is not enabled before R4; no run was created."
    )
  }

  private assertContractV2ContinuationReady(workflow: CoreWorkflowDefinition): void {
    if (workflowContractV2CoreMetadata(workflow) === undefined) return
    throw new WorkflowContractV2BoundaryError(
      "Contract v2 resume and continuation require R6 recorded-generation recovery."
    )
  }

  private onContractV2PointerChanged(uri: vscode.Uri): void {
    const workspaceRoot = workspaceRootFromFile(uri.fsPath, ".bob")
    if (workspaceRoot !== undefined) {
      const slotRoot = path.dirname(uri.fsPath)
      const collectionRoot = path.dirname(slotRoot)
      try {
        this.invalidateWorkflowPackageSlot({
          collectionId: relativePathFromRoot(workspaceRoot, collectionRoot),
          collectionRoot,
          workflowId: path.basename(slotRoot)
        })
      } catch (error) {
        console.warn("Failed to invalidate Contract v2 workflow slot", error)
      }
    }
    void this.reload({ showReport: false })
  }

  private async workflowRootCandidates(): Promise<MarkerRootCandidate[]> {
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length === 0) return []
    const markerRoots = await findWorkflowRootCandidates(folders)
    return markerRoots.length > 0 ? markerRoots : fallbackWorkspaceRootCandidates(folders)
  }

  async reload(options: { showReport: boolean }): Promise<void> {
    const trustError = await requireTrustedWorkspace("ワークフロー登録を再読み込み", { showWarning: options.showReport })
    if (trustError) {
      this.lastResult = { summary: "ワークスペースが信頼されていません。", lines: [`- 失敗: ${trustError}`] }
      if (options.showReport) await showMarkdownReport("Bob ワークフロー登録", this.lastResult.summary, this.lastResult.lines)
      return
    }
    const result = await this.registerWorkflows()
    this.lastResult = result
    if (options.showReport) await showMarkdownReport("Bob ワークフロー登録", result.summary, result.lines)
  }

  private async registerWorkflows(): Promise<RegistrationResult> {
    const update = await registerWorkflowDefinitions({
      previousSource: this.registeredSource,
      createRunner: (workflow) => this.runtimeFactory.createBobWorkflowRunner(workflow),
      contractV2: this.contractV2Providers.current()
    })
    this.coreWorkflows.clear()
    for (const workflow of update.coreWorkflows) this.coreWorkflows.set(workflow.id, workflow)
    if (update.sourceChanged) this.registeredSource = update.registeredSource
    if (update.idsChanged) {
      this.registeredIds.clear()
      for (const id of update.registeredIds ?? []) this.registeredIds.add(id)
    }
    return update.result
  }
}
