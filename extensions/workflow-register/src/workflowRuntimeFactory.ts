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
import { createCommandAgentProvider, createLiveAgentProvider } from "./core/agentProvider"
import type { ContributionRuntimeResolver } from "./core/contributionRegistry"
import { WorkflowEngine } from "./core/engine"
import type { ManualCompletionInput, ManualCompletionResult } from "./core/engine"
import type { AgentProvider } from "./core/model"
import {
  ResultSinkRegistry,
  type ResultSinkFileTransactionResolver
} from "./core/resultSinkRegistry"
import { FileRunControlStore, RunControlStore } from "./core/runControlStore"
import { FileRunStateStore, RunStateStore } from "./core/runStateStore"
import { FileTaskSnapshotStore, TaskSnapshotStore } from "./core/taskSnapshots"
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
  contributionResolver: ContributionRuntimeResolver
  fileTransactionResolver: ResultSinkFileTransactionResolver
  customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }>
  stepRuntime: StepRuntime
  agentProvider: () => AgentProvider | undefined
  inputsProvider: (workflow: WorkflowDefinition, provided: Record<string, unknown>) => ReturnType<BobWorkflowRunnerInputCollector>
  gateRegistry: BobWorkflowGateRegistry
  onManualStepHeld?: (input: { workflow: import("./core/model").CoreWorkflowDefinition; run: import("./core/model").WorkflowRunState; step: import("./core/model").EngineStep; active: ActiveStep }) => Promise<void> | void
}

export class WorkflowRuntimeFactory {
  constructor(private readonly options: WorkflowRuntimeFactoryOptions) {}

  createEngine(workspaceRoot: string, agentProvider?: AgentProvider): WorkflowEngine {
    const snapshotStore = this.createTaskSnapshotStore(workspaceRoot)
    return new WorkflowEngine({
      actions: this.options.actionRegistry,
      resultSinks: this.createResultSinks(workspaceRoot),
      runStore: this.createRunStore(workspaceRoot),
      runControlStore: this.createRunControlStore(workspaceRoot),
      agentProvider: this.createRuntimeAgentProvider(agentProvider),
      preflightChecks: {},
      preflightCheckResolver: this.options.contributionResolver,
      includeDefaultPreflightChecks: false,
      manualCompletion: (input) => this.holdStandaloneManualStep(input),
      recoverResultText: snapshotStore
        ? (input) => recoverResultTextFromSnapshots(snapshotStore, input.workflow, input.run, input.step)
        : undefined
    })
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
      preflightChecks: () => ({}),
      preflightCheckResolver: this.options.contributionResolver,
      includeDefaultPreflightChecks: false,
      agentProvider: this.createRuntimeAgentProvider(),
      stepRuntime: this.options.stepRuntime,
      gateRegistry: this.options.gateRegistry,
      onManualStepHeld: this.options.onManualStepHeld,
      inputsProvider: (task, provided) => this.options.inputsProvider(workflow, {
        ...extractTaskWorkflowInputs(workflow, task),
        ...provided
      })
    })
  }

  createRunStore(workspaceRoot: string): RunStateStore {
    return new FileRunStateStore({ workspaceRoot, engineVersion: this.options.engineVersion })
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

  private createRuntimeAgentProvider(explicitProvider?: AgentProvider): AgentProvider {
    if (explicitProvider) return explicitProvider
    const configuredProvider = this.createCommandAgentProvider()
    return createLiveAgentProvider(() => (
      this.options.contributionResolver.getAgentProvider()
      ?? this.options.agentProvider()
      ?? configuredProvider
    ))
  }

  private createResultSinks(_workspaceRoot: string): ResultSinkRegistry {
    const registry = new ResultSinkRegistry({
      contributionResolver: this.options.contributionResolver,
      fileTransactionResolver: this.options.fileTransactionResolver
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
