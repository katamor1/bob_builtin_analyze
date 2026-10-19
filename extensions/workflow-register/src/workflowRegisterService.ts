import { assertWorkflowContractV2Shadow, verifyWorkflowContractV2CurrentPlan } from "./workflowContractV2ExecutionGuard"
import { workflowContractV2CoreBinding } from "./workflowContractV2View"
import { isOperationHubWorkflowMutationTarget } from "./operationHubMutationTarget"
import * as path from "path"
import * as vscode from "vscode"
import {
  BobWorkflowGateRegistry,
  type BobWorkflowGateAcceptance,
  type BobWorkflowGateAcceptResult
} from "./bobWorkflowGateRegistry"
import { StepRuntime, type StepCompletionExpectation } from "./bobStepRuntime"
import type { BobSourceLike } from "./bobApi"
import { ActionRegistry } from "./core/actionRegistry"
import type { ActionProvider, ActionProviderRegistration, WorkflowProviderRegistration, WorkflowProviderRegistrationInput } from "./core/actionRegistry"
import { ProviderRegistryHost, type ProviderRegistryV1Api } from "./api/providerRegistryApi"
import { registerWorkflowRegisterBuiltInContributions } from "./builtInContributions"
import { disposeResourcesInOrder, type DisposalResult } from "./core/disposeResources"
import { rejectContribution, type InstalledContributionOwner } from "./core/contributionManifest"
import type { AgentProvider, CoreWorkflowDefinition } from "./core/model"
import type { ResultSinkRegistry } from "./core/resultSinkRegistry"
import {
  fallbackWorkspaceRootCandidates,
  findWorkflowRootCandidates,
  MarkerRootCandidate
} from "./core/workspaceRoots"
import { showMarkdownReport } from "./reports"
import { ManualStepPanelController } from "./webview/manualStepPanel"
import {
  registerWorkflows as registerWorkflowDefinitions,
  type RegistrationResult
} from "./workflowRegistrationService"
import type { CompileCurrentWorkflowContractV2Input, CompileWorkflowContractV2GenerationInput, WorkflowContractV2Slot } from "./workflowContractV2Entrypoint"
import { workflowContractV2CollectionId } from "./workflowDiscovery"
import { createWorkflowContractV2ProductEntrypoint } from "./workflowContractV2Product"
import { WorkflowContractV2ProviderLifecycle } from "./workflowContractV2ProviderLifecycle"
import { WorkflowCatalogReloadCoordinator } from "./workflowCatalogReloadCoordinator"
import { WorkflowRuntimeFactory } from "./workflowRuntimeFactory"
import { collectBobWorkflowInputs } from "./workflowInputPrompt"
import { WorkflowRunCommandService } from "./workflowRunCommands"
import type { ArtifactSourceRunArg, RunCommandArg, WorkflowCommandArg } from "./workflowRunCommands"
import { requireTrustedWorkspace } from "./workspaceTrust"
import { ReviewAcceptanceCoordinator } from "./reviewAcceptanceCoordinator"

const WORKFLOW_GLOB = "**/.bob/workflows/*/WORKFLOW.md"

export interface StepCompletionOptions extends StepCompletionExpectation {
  silent?: boolean
}

export class WorkflowRegisterService implements vscode.Disposable {
  private readonly registeredIds = new Set<string>()
  private readonly watcher: vscode.FileSystemWatcher
  private readonly contractV2Watcher: vscode.FileSystemWatcher
  private legacyRegistrationFingerprint?: string
  private readonly bobWorkflowGates = new BobWorkflowGateRegistry()
  private readonly reviewAcceptances = new ReviewAcceptanceCoordinator()
  private readonly stepRuntime = new StepRuntime()
  private readonly coreWorkflows = new Map<string, CoreWorkflowDefinition>()
  private readonly actionRegistry = new ActionRegistry()
  private readonly providerRegistryHost: ProviderRegistryHost
  private disposalCompletion?: Promise<DisposalResult>
  private readonly manualStepPanel: ManualStepPanelController
  private readonly runtimeFactory: WorkflowRuntimeFactory
  private readonly contractV2Providers: WorkflowContractV2ProviderLifecycle
  private readonly catalogReloads = new WorkflowCatalogReloadCoordinator()
  private readonly runCommands: WorkflowRunCommandService
  private registeredSource?: BobSourceLike
  private lastResult: RegistrationResult = { summary: "ワークフロー定義はまだ読み込まれていません。", lines: [] }

  constructor(private readonly engineVersion: string, installedOwner?: InstalledContributionOwner) {
    const installed = installedOwner ?? resolveInstalledContributionOwner("local.workflow-register")
    if (!installed) rejectContribution("contribution.provenance.invalid")
    this.providerRegistryHost = new ProviderRegistryHost({ actionRegistry: this.actionRegistry, resolveInstalledExtension: resolveInstalledContributionOwner })
    registerWorkflowRegisterBuiltInContributions(this.providerRegistryHost, {
      installed,
      isWorkspaceTrusted: () => vscode.workspace.isTrusted,
      executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
      workspaceFolders: () => vscode.workspace.workspaceFolders ?? []
    })
    this.watcher = vscode.workspace.createFileSystemWatcher(WORKFLOW_GLOB)
    this.contractV2Watcher = vscode.workspace.createFileSystemWatcher("**/.bob/workflows/*/current.json")
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
      ownedBuiltIns: true,
      stepRuntime: this.stepRuntime,
      gateRegistry: this.bobWorkflowGates,
      inputsProvider: (workflow, provided) => collectBobWorkflowInputs(workflow, provided),
      workflowById: (id) => this.coreWorkflows.get(id),
      contractV2BeforeRun: (workflow) => this.assertContractV2RunCreationReady(workflow),
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
      onChanged: () => { void this.reload({ showReport: false }).catch(console.warn) }
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
    const pointerChanged = (uri: vscode.Uri) => {
      const slotRoot = path.dirname(uri.fsPath), collectionRoot = path.dirname(slotRoot)
      try { this.invalidateWorkflowPackageSlot({ collectionId: workflowContractV2CollectionId(collectionRoot), collectionRoot, workflowId: path.basename(slotRoot) }) }
      catch (error) { console.warn(error) }
      void this.reload({ showReport: false }).catch(console.warn)
    }
    this.contractV2Watcher.onDidCreate(pointerChanged)
    this.contractV2Watcher.onDidChange(pointerChanged)
    this.contractV2Watcher.onDidDelete(pointerChanged)
    this.watcher.onDidCreate(() => this.reload({ showReport: false }))
    this.watcher.onDidChange(() => this.reload({ showReport: false }))
    this.watcher.onDidDelete(() => this.reload({ showReport: false }))
  }

  dispose(): void {
    if (this.disposalCompletion) return
    let finish!: (result: DisposalResult) => void
    this.disposalCompletion = new Promise(resolve => { finish = resolve })
    const source = this.registeredSource
    this.registeredSource = undefined
    void disposeResourcesInOrder([
      { name: "catalogReloads", dispose: () => this.catalogReloads.dispose() },
      { name: "contractV2Providers", dispose: () => this.contractV2Providers.dispose() },
      { name: "contributions", dispose: () => this.providerRegistryHost.dispose() },
      { name: "legacyCompatibility", dispose: () => this.actionRegistry.disposeLegacyCompatibility() },
      { name: "contractV2Watcher", dispose: () => this.contractV2Watcher.dispose() },
      { name: "watcher", dispose: () => this.watcher.dispose() },
      { name: "manualStepPanel", dispose: () => this.manualStepPanel.dispose() },
      { name: "bobWorkflowGates", dispose: () => this.bobWorkflowGates.dispose() },
      { name: "registeredSource", dispose: async () => { await source?.deactivate() } }
    ]).then(result => {
      finish(result)
      if (result.failures.length) {
        try { console.warn("Workflow resource cleanup failed:", result.failures.map(failure => failure.name).join(", ")) } catch { /* Reporting cannot undo cleanup. */ }
      }
    })
  }

  whenDisposed(): Promise<DisposalResult> {
    if (!this.disposalCompletion) throw new Error("Workflow disposal has not started.")
    return this.disposalCompletion
  }

  providerRegistryApi(): ProviderRegistryV1Api { return this.providerRegistryHost.api }

  private assertRegistrationActive(): void {
    if (this.disposalCompletion) throw new Error("Workflow registration service is disposed.")
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
    this.assertRegistrationActive()
    return this.actionRegistry.register(provider)
  }

  registerWorkflowProviderContract(input: WorkflowProviderRegistrationInput): WorkflowProviderRegistration {
    return this.contractV2Providers.register(input)
  }

  registerAgentProvider(provider: AgentProvider): void {
    this.assertRegistrationActive()
    this.actionRegistry.setLegacyAgent(provider)
  }

  registerResultSink(type: string, handler: Parameters<ResultSinkRegistry["register"]>[1]): void {
    this.assertRegistrationActive()
    this.actionRegistry.registerLegacyResultSink(type, handler)
  }

  listCoreWorkflows(): CoreWorkflowDefinition[] {
    return this.runCommands.listCoreWorkflows()
  }

  compileCurrentWorkflowPackage(input: CompileCurrentWorkflowContractV2Input) {
    return this.contractV2Providers.current().compileCurrent(input)
  }

  compileWorkflowPackageGeneration(input: CompileWorkflowContractV2GenerationInput) {
    return this.contractV2Providers.current().compileGeneration(input)
  }

  acquireCurrentWorkflowPackage(input: CompileCurrentWorkflowContractV2Input) {
    return this.contractV2Providers.current().acquireCurrent(input)
  }

  invalidateWorkflowPackageSlot(slot: WorkflowContractV2Slot): void {
    this.contractV2Providers.current().invalidateSlot(slot)
  }

  async runWorkflow(workflowArg?: WorkflowCommandArg, inputs: Record<string, unknown> = {}): Promise<unknown> {
    const guardedArg = await this.guardWorkflowCommand(workflowArg)
    if (guardedArg === null) return "ワークフローが選択されていません。一覧から対象を選択してください。"
    return this.runCommands.runWorkflow(guardedArg, inputs)
  }

  async runWorkflowStep(
    workflowId?: string,
    stepId?: string,
    inputs: Record<string, unknown> = {}
  ): Promise<unknown> {
    const guardedId = await this.guardWorkflowCommand(workflowId)
    if (guardedId === null) return "ワークフローが選択されていません。一覧から対象を選択してください。"
    workflowId = guardedId as string | undefined
    return this.runCommands.runWorkflowStep(workflowId, stepId, inputs)
  }

  async startFromStepWithArtifacts(
    workflowId?: string,
    stepId?: string,
    sourceRunArg?: ArtifactSourceRunArg,
    inputs: Record<string, unknown> = {}
  ): Promise<unknown> {
    const guardedId = await this.guardWorkflowCommand(workflowId)
    if (guardedId === null) return "ワークフローが選択されていません。一覧から対象を選択してください。"
    workflowId = guardedId as string | undefined
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

  private async assertContractV2RunCreationReady(workflow: CoreWorkflowDefinition): Promise<void> {
    await verifyWorkflowContractV2CurrentPlan({ workflow, compileCurrent: input => this.compileCurrentWorkflowPackage(input) })
    assertWorkflowContractV2Shadow(workflow)
  }

  private async guardWorkflowCommand(arg: WorkflowCommandArg): Promise<WorkflowCommandArg | null> {
    if (this.coreWorkflows.size === 0) await this.reload({ showReport: false })
    const target = isOperationHubWorkflowMutationTarget(arg) ? arg : undefined
    let id = target?.workflowId ?? (typeof arg === "string" ? arg : undefined)
    if (id === undefined && Array.from(this.coreWorkflows.values()).some(workflow => workflowContractV2CoreBinding(workflow))) {
      const trustError = await requireTrustedWorkspace("ワークフローを実行")
      if (trustError) return arg
      const workflows = this.listCoreWorkflows()
      const selected = workflows.length === 1 ? workflows[0] : (await vscode.window.showQuickPick(
        workflows.map(workflow => ({ label: workflow.label, description: workflow.name, detail: workflow.description, workflow })),
        { title: "ワークフローを実行" }
      ))?.workflow
      id = selected?.id
      if (!id) return null
      arg = id
    }
    const workflow = id ? this.coreWorkflows.get(id) : undefined
    if (workflow) await this.assertContractV2RunCreationReady(workflow)
    return arg
  }

  private async workflowRootCandidates(): Promise<MarkerRootCandidate[]> {
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length === 0) return []
    const markerRoots = await findWorkflowRootCandidates(folders)
    return markerRoots.length > 0 ? markerRoots : fallbackWorkspaceRootCandidates(folders)
  }

  async reload(options: { showReport: boolean }): Promise<void> {
    return this.catalogReloads.run(() => this.reloadCatalog(options))
  }

  private async reloadCatalog(options: { showReport: boolean }): Promise<void> {
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
      previousLegacyFingerprint: this.legacyRegistrationFingerprint,
      contractV2: this.contractV2Providers.current(),
      createRunner: (workflow) => this.runtimeFactory.createBobWorkflowRunner(workflow)
    })
    this.legacyRegistrationFingerprint = update.legacyFingerprint
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

function resolveInstalledContributionOwner(id: string): InstalledContributionOwner | undefined {
  try {
    const extension = vscode.extensions?.getExtension(id)
    if (!extension || extension.id !== id || typeof extension.extensionPath !== "string") return undefined
    const metadata = extension.packageJSON
    if (!metadata || typeof metadata.publisher !== "string" || typeof metadata.name !== "string" || typeof metadata.version !== "string"
      || `${metadata.publisher}.${metadata.name}` !== id) return undefined
    return { id, version: metadata.version, extensionRoot: extension.extensionPath }
  } catch { return undefined }
}
