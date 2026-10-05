import { assertWorkflowContractV2Shadow, assertWorkflowContractV2DefinitionShadow } from "./workflowContractV2ExecutionGuard"
import { ContractV2GuardedRunStateStore } from "./workflowContractV2RunStateStore"
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
import { WorkflowEngine } from "./core/engine"
import type { ManualCompletionInput, ManualCompletionResult, WorkflowEngineOptions } from "./core/engine"
import type { CoreWorkflowDefinition, AgentProvider } from "./core/model"
import { createDefaultResultSinkRegistry, ResultSinkRegistry } from "./core/resultSinkRegistry"
import { FileRunControlStore, RunControlStore } from "./core/runControlStore"
import { RunStateStore } from "./core/runStateStore"
import { FileTaskSnapshotStore, TaskSnapshotStore } from "./core/taskSnapshots"
import { findMarkerRoots, rootHasMarker } from "./core/workspaceRoots"
import { requireTrustedCommandExecution } from "./workspaceTrust"

export interface TaskSnapshotSettings {
  enabled: boolean
  maxBytes: number
  maxPerRun: number
  includeMessages: boolean
  pruneOnSave: boolean
}

export interface WorkflowRuntimeFactoryOptions {
  engineVersion: string
  actionRegistry: ActionRegistry
  customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }>
  stepRuntime: StepRuntime
  agentProvider: () => AgentProvider | undefined
  inputsProvider: (workflow: WorkflowDefinition, provided: Record<string, unknown>) => ReturnType<BobWorkflowRunnerInputCollector>
  gateRegistry: BobWorkflowGateRegistry
  workflowById?: (id: string) => CoreWorkflowDefinition | undefined
  contractV2BeforeRun?: (workflow: CoreWorkflowDefinition) => Promise<void> | void
  beforeCreateRun?: (workflow: CoreWorkflowDefinition, inputs: Record<string, unknown>) => Promise<void> | void
  onManualStepHeld?: (input: { workflow: import("./core/model").CoreWorkflowDefinition; run: import("./core/model").WorkflowRunState; step: import("./core/model").EngineStep; active: ActiveStep }) => Promise<void> | void
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
    return new ContractV2BoundaryWorkflowEngine({
      actions: this.options.actionRegistry,
      resultSinks: this.createResultSinks(workspaceRoot),
      runStore: this.createRunStore(workspaceRoot),
      runControlStore: this.createRunControlStore(workspaceRoot),
      agentProvider: agentProvider ?? this.options.agentProvider() ?? this.createCommandAgentProvider(),
      preflightChecks: this.createPreflightChecks(workspaceRoot),
      manualCompletion: (input) => this.holdStandaloneManualStep(input),
      recoverResultText: snapshotStore
        ? (input) => recoverResultTextFromSnapshots(snapshotStore, input.workflow, input.run, input.step)
        : undefined
    }, workflow => this.beforeRun(workflow))
  }

  createBobWorkflowRunner(workflow: WorkflowDefinition): BobWorkflowEngineRunner {
    const beforeRun = async () => {
      await this.options.contractV2BeforeRun?.(workflow.core)
      assertWorkflowContractV2DefinitionShadow(workflow)
    }
    return new ContractV2BoundaryBobRunner({
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
      inputsProvider: (task, provided) => this.options.inputsProvider(workflow, {
        ...extractTaskWorkflowInputs(workflow, task),
        ...provided
      })
    }, beforeRun)
  }

  private async beforeRun(workflow: CoreWorkflowDefinition): Promise<void> {
    await this.options.contractV2BeforeRun?.(workflow)
    assertWorkflowContractV2Shadow(workflow)
  }

  createRunStore(workspaceRoot: string): RunStateStore {
    return new ContractV2GuardedRunStateStore({ workspaceRoot, engineVersion: this.options.engineVersion, beforeCreateRun: this.options.beforeCreateRun, workflowById: this.options.workflowById })
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

class ContractV2BoundaryWorkflowEngine extends WorkflowEngine {
  constructor(options: WorkflowEngineOptions, private readonly beforeRun: (workflow: CoreWorkflowDefinition) => Promise<void>) { super(options) }
  override async runWorkflow(...args: Parameters<WorkflowEngine["runWorkflow"]>): ReturnType<WorkflowEngine["runWorkflow"]> { await this.beforeRun(args[0]); return super.runWorkflow(...args) }
  override async resumeRun(...args: Parameters<WorkflowEngine["resumeRun"]>): ReturnType<WorkflowEngine["resumeRun"]> { await this.beforeRun(args[1].workflow); return super.resumeRun(...args) }
  override async resumeRunGuarded(...args: Parameters<WorkflowEngine["resumeRunGuarded"]>): ReturnType<WorkflowEngine["resumeRunGuarded"]> { await this.beforeRun(args[1].workflow); return super.resumeRunGuarded(...args) }
  override async retryCurrentStep(...args: Parameters<WorkflowEngine["retryCurrentStep"]>): ReturnType<WorkflowEngine["retryCurrentStep"]> { await this.beforeRun(args[1]); return super.retryCurrentStep(...args) }
  override async approveBranchCheckpoint(...args: Parameters<WorkflowEngine["approveBranchCheckpoint"]>): ReturnType<WorkflowEngine["approveBranchCheckpoint"]> { await this.beforeRun(args[1]); return super.approveBranchCheckpoint(...args) }
}
class ContractV2BoundaryBobRunner extends BobWorkflowEngineRunner {
  constructor(options: ConstructorParameters<typeof BobWorkflowEngineRunner>[0], private readonly beforeRun: () => Promise<void>) { super(options) }
  override async runSingleWorkflowStep(...args: Parameters<BobWorkflowEngineRunner["runSingleWorkflowStep"]>): Promise<boolean> { await this.beforeRun(); return super.runSingleWorkflowStep(...args) }
  override async runTodoStep(...args: Parameters<BobWorkflowEngineRunner["runTodoStep"]>): Promise<boolean> { await this.beforeRun(); return super.runTodoStep(...args) }
  override async runEngineStep(...args: Parameters<BobWorkflowEngineRunner["runEngineStep"]>): Promise<boolean> { await this.beforeRun(); return super.runEngineStep(...args) }
}
