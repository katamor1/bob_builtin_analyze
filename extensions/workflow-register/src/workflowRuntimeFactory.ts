import * as vscode from "vscode"
import {
  BobWorkflowEngineRunner,
  extractTaskWorkflowInputs,
  recoverResultTextFromSnapshots
} from "./bobWorkflowRunner"
import { StepRuntime } from "./bobStepRuntime"
import type { BobWorkflowGateRegistry } from "./bobWorkflowGateRegistry"
import type {
  ActiveStep,
  BobWorkflowRunnerInputCollector,
  WorkflowDefinition
} from "./bobWorkflowTypes"
import type { ActionRegistry } from "./core/actionRegistry"
import { normalizeAutomaticPauseSettings } from "./core/automaticPauseSettings"
import { createCommandAgentProvider } from "./core/agentProvider"
import {
  WorkflowPlanStore,
  type AcquireWorkflowPlanInput,
  type CompiledWorkflowPlanHandle,
  type GetOrCompileWorkflowPlanInput,
  type WorkflowPlanLease
} from "./core/contractV2"
import {
  WorkflowEngine,
  type ManualCompletionInput,
  type ManualCompletionResult,
  type ResumeRunOptions,
  type RetryRunOptions,
  type RunWorkflowOptions,
  type WorkflowEngineOptions
} from "./core/engine"
import type { AgentProvider, CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import { createDefaultResultSinkRegistry, ResultSinkRegistry } from "./core/resultSinkRegistry"
import { FileRunControlStore, RunControlStore } from "./core/runControlStore"
import type { RunStateStore } from "./core/runStateStore"
import { FileTaskSnapshotStore, TaskSnapshotStore } from "./core/taskSnapshots"
import { findMarkerRoots, rootHasMarker } from "./core/workspaceRoots"
import { executeWorkflowContractV2RuntimeBoundary } from "./workflowContractV2RuntimeBoundary"
import { ContractV2GuardedRunStateStore } from "./workflowContractV2RunStateStore"
import { requireTrustedCommandExecution } from "./workspaceTrust"

export interface TaskSnapshotSettings {
  enabled: boolean
  maxBytes: number
  maxPerRun: number
  includeMessages: boolean
  pruneOnSave: boolean
}

type ContractV2AcquireRunLease = (
  workflow: CoreWorkflowDefinition
) => Promise<WorkflowPlanLease | undefined> | WorkflowPlanLease | undefined

type ContractV2BeforeContinuation = (
  workflow: CoreWorkflowDefinition
) => Promise<void> | void

export interface ContractV2RunExecutorInput {
  readonly lease: WorkflowPlanLease
  readonly workflow: CoreWorkflowDefinition
  readonly inputs: Record<string, unknown>
  readonly options: RunWorkflowOptions
  readonly workspaceRoot: string
  readonly agentProvider?: AgentProvider
}

type ContractV2RunExecutor = (
  input: ContractV2RunExecutorInput
) => Promise<WorkflowRunState> | WorkflowRunState

export interface WorkflowRuntimeFactoryOptions {
  engineVersion: string
  actionRegistry: ActionRegistry
  customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }>
  stepRuntime: StepRuntime
  agentProvider: () => AgentProvider | undefined
  inputsProvider: (workflow: WorkflowDefinition, provided: Record<string, unknown>) => ReturnType<BobWorkflowRunnerInputCollector>
  gateRegistry: BobWorkflowGateRegistry
  contractV2AcquireRunLease?: ContractV2AcquireRunLease
  contractV2RunExecutor?: ContractV2RunExecutor
  contractV2BeforeContinuation?: ContractV2BeforeContinuation
  /** Transitional continuation alias retained while later runtime phases replace legacy continuation. */
  contractV2BeforeRun?: ContractV2BeforeContinuation
  /** Transitional continuation alias retained for pre-R1 callers. */
  beforeCreateRun?: ContractV2BeforeContinuation
  onManualStepHeld?: (input: { workflow: import("./core/model").CoreWorkflowDefinition; run: import("./core/model").WorkflowRunState; step: import("./core/model").EngineStep; active: ActiveStep }) => Promise<void> | void
}

class ContractV2BoundaryWorkflowEngine extends WorkflowEngine {
  constructor(
    options: WorkflowEngineOptions,
    private readonly workspaceRoot: string,
    private readonly acquireRunLease?: ContractV2AcquireRunLease,
    private readonly runExecutor?: ContractV2RunExecutor,
    private readonly beforeContinuation?: ContractV2BeforeContinuation,
    private readonly runtimeAgentProvider?: AgentProvider
  ) {
    super(options)
  }

  override async runWorkflow(
    workflow: CoreWorkflowDefinition,
    inputs: Record<string, unknown>,
    options: RunWorkflowOptions = {}
  ): Promise<WorkflowRunState> {
    return executeWorkflowContractV2RuntimeBoundary({
      acquireLease: () => this.acquireRunLease?.(workflow),
      legacyOperation: () => super.runWorkflow(workflow, inputs, options),
      compiledOperation: this.runExecutor === undefined
        ? undefined
        : (lease) => this.runExecutor!({
          lease,
          workflow,
          inputs,
          options,
          workspaceRoot: this.workspaceRoot,
          agentProvider: this.runtimeAgentProvider
        })
    })
  }

  override async resumeRun(
    runId: string,
    options: ResumeRunOptions
  ): Promise<WorkflowRunState> {
    await this.beforeContinuation?.(options.workflow)
    return super.resumeRun(runId, options)
  }

  override async resumeRunGuarded(
    runId: string,
    options: ResumeRunOptions,
    hooks: {
      beforeResume: (run: WorkflowRunState) => Promise<void> | void
      afterResume?: (run: WorkflowRunState) => Promise<void> | void
    }
  ): Promise<WorkflowRunState> {
    await this.beforeContinuation?.(options.workflow)
    return super.resumeRunGuarded(runId, options, hooks)
  }

  override async retryCurrentStep(
    runId: string,
    workflow: CoreWorkflowDefinition,
    options: RetryRunOptions = {}
  ): Promise<WorkflowRunState> {
    await this.beforeContinuation?.(workflow)
    return super.retryCurrentStep(runId, workflow, options)
  }

  override async approveBranchCheckpoint(
    runId: string,
    workflow: CoreWorkflowDefinition
  ): Promise<WorkflowRunState> {
    await this.beforeContinuation?.(workflow)
    return super.approveBranchCheckpoint(runId, workflow)
  }
}

const processWorkflowPlanStore = new WorkflowPlanStore()

export class WorkflowRuntimeFactory {
  private readonly workflowPlanStore = processWorkflowPlanStore

  constructor(private readonly options: WorkflowRuntimeFactoryOptions) {}

  getOrCompileWorkflowPlan(input: GetOrCompileWorkflowPlanInput): Promise<CompiledWorkflowPlanHandle> {
    return this.workflowPlanStore.getOrCompile(input)
  }

  acquireWorkflowPlan(input: AcquireWorkflowPlanInput): Promise<WorkflowPlanLease> {
    return this.workflowPlanStore.acquire(input)
  }

  invalidateWorkflowPlanSlot(collectionId: string, workflowId: string): void {
    this.workflowPlanStore.invalidateSlot(collectionId, workflowId)
  }

  createEngine(workspaceRoot: string, agentProvider?: AgentProvider): WorkflowEngine {
    const snapshotStore = this.createTaskSnapshotStore(workspaceRoot)
    const runtimeAgentProvider = agentProvider ?? this.options.agentProvider() ?? this.createCommandAgentProvider()
    const engineOptions: WorkflowEngineOptions = {
      actions: this.options.actionRegistry,
      resultSinks: this.createResultSinks(workspaceRoot),
      runStore: this.createRunStore(workspaceRoot),
      runControlStore: this.createRunControlStore(workspaceRoot),
      agentProvider: runtimeAgentProvider,
      preflightChecks: this.createPreflightChecks(workspaceRoot),
      manualCompletion: (input) => this.holdStandaloneManualStep(input),
      recoverResultText: snapshotStore
        ? (input) => recoverResultTextFromSnapshots(snapshotStore, input.workflow, input.run, input.step)
        : undefined
    }
    const beforeContinuation = this.options.contractV2BeforeContinuation
      ?? this.options.contractV2BeforeRun
      ?? this.options.beforeCreateRun
    return new ContractV2BoundaryWorkflowEngine(
      engineOptions,
      workspaceRoot,
      this.options.contractV2AcquireRunLease,
      this.options.contractV2RunExecutor,
      beforeContinuation,
      runtimeAgentProvider
    )
  }

  createBobWorkflowRunner(workflow: WorkflowDefinition): BobWorkflowEngineRunner {
    return new BobWorkflowEngineRunner({
      definition: workflow,
      coreWorkflow: workflow.core,
      actionRegistry: this.options.actionRegistry,
      resultSinks: (workspaceRoot) => this.createResultSinks(workspaceRoot),
      runStore: (workspaceRoot) => this.createRunStore(workspaceRoot),
      runControlStore: (workspaceRoot) => this.createRunControlStore(workspaceRoot),
      taskSnapshotStore: (workspaceRoot) => this.createTaskSnapshotStore(workspaceRoot),
      preflightChecks: (workspaceRoot) => this.createPreflightChecks(workspaceRoot),
      agentProvider: this.options.agentProvider() ?? this.createCommandAgentProvider(),
      stepRuntime: this.options.stepRuntime,
      gateRegistry: this.options.gateRegistry,
      onManualStepHeld: this.options.onManualStepHeld,
      inputsProvider: async (task, provided) => this.options.inputsProvider(workflow, {
        ...extractTaskWorkflowInputs(workflow, task),
        ...provided
      })
    })
  }

  createRunStore(workspaceRoot: string): RunStateStore {
    return new ContractV2GuardedRunStateStore({
      workspaceRoot,
      engineVersion: this.options.engineVersion
    })
  }

  createRunControlStore(workspaceRoot: string): RunControlStore {
    const settings = this.automaticPauseSettings()
    for (const diagnostic of settings.diagnostics) console.warn(`[workflow-register] ${diagnostic}`)
    return new FileRunControlStore({
      workspaceRoot,
      workspaceAutomaticPauseLimits: settings.limits
    })
  }

  private async holdStandaloneManualStep(input: ManualCompletionInput): Promise<ManualCompletionResult> {
    return this.options.stepRuntime.hold(
      {
        id: input.workflow.id,
        label: input.workflow.label,
        guardrails: input.workflow.guardrails
      },
      { id: input.step.id, title: input.step.title },
      {},
      {
        runId: input.run.runId,
        coreStep: input.step,
        inputs: input.run.inputs,
        state: input.run.state,
        onHeldStep: (active) => this.options.onManualStepHeld?.({
          workflow: input.workflow,
          run: input.run,
          step: input.step,
          active
        })
      }
    )
  }

  private createCommandAgentProvider(): AgentProvider | undefined {
    const config = vscode.workspace.getConfiguration("workflowRegister")
    return createCommandAgentProvider({
      command: config.get<string>("agentCommand", ""),
      executeCommand: (command, input) => {
        requireTrustedCommandExecution("run configured agent command")
        return vscode.commands.executeCommand(command, input)
      }
    })
  }

  private createResultSinks(workspaceRoot: string): ResultSinkRegistry {
    const registry = createDefaultResultSinkRegistry({
      workspaceRoot,
      isWorkspaceTrusted: () => vscode.workspace.isTrusted,
      executeCommand: (command, ...args) => {
        requireTrustedCommandExecution("write command result sink")
        return vscode.commands.executeCommand(command, ...args)
      }
    })
    for (const sink of this.options.customResultSinks) registry.register(sink.type, sink.handler)
    return registry
  }

  private createTaskSnapshotStore(workspaceRoot: string): TaskSnapshotStore | undefined {
    const settings = this.taskSnapshotSettings()
    if (!settings.enabled) return undefined
    return new FileTaskSnapshotStore({
      workspaceRoot,
      maxBytes: settings.maxBytes,
      maxPerRun: settings.maxPerRun,
      includeMessages: settings.includeMessages,
      pruneOnSave: settings.pruneOnSave
    })
  }

  private createPreflightChecks(workspaceRoot: string): NonNullable<WorkflowEngineOptions["preflightChecks"]> {
    return {
      bazaarRepository: () => this.bazaarRepositoryAvailable(workspaceRoot)
    }
  }

  private async bazaarRepositoryAvailable(workspaceRoot: string): Promise<boolean> {
    if (await rootHasMarker(workspaceRoot, ".bzr")) return true
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length === 0) return false
    const candidates = await findMarkerRoots(folders, ".bzr")
    return candidates.length > 0
  }

  private automaticPauseSettings(): ReturnType<typeof normalizeAutomaticPauseSettings> {
    const config = vscode.workspace.getConfiguration("workflowRegister")
    return normalizeAutomaticPauseSettings({
      maxRunMinutes: config.get<number>("runControl.maxRunMinutes", 0),
      maxAgentStepsPerRun: config.get<number>("runControl.maxAgentStepsPerRun", 0),
      pauseAtLocalTime: config.get<string>("runControl.pauseAtLocalTime", ""),
      timezone: config.get<string>("runControl.timezone", "Asia/Tokyo")
    })
  }

  private taskSnapshotSettings(): TaskSnapshotSettings {
    const config = vscode.workspace.getConfiguration("workflowRegister")
    return {
      enabled: config.get<boolean>("taskSnapshots.enabled", true),
      maxBytes: config.get<number>("taskSnapshots.maxBytes", 262_144),
      maxPerRun: config.get<number>("taskSnapshots.maxPerRun", 50),
      includeMessages: config.get<boolean>("taskSnapshots.includeMessages", false),
      pruneOnSave: config.get<boolean>("taskSnapshots.pruneOnSave", true)
    }
  }
}
