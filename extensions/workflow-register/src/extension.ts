import * as vscode from "vscode"
import {
  BobWorkflowEngineRunner,
  createBobWorkflow,
  extractTaskWorkflowInputs,
  recoverResultTextFromSnapshots,
  StepRuntime
} from "./bobWorkflowRunner"
import { asSource, loadBobApi } from "./bobApi"
import type { BobSourceLike, BobWorkflowApi } from "./bobApi"
import type { WorkflowDefinition } from "./bobWorkflowTypes"
import { ActionProvider, ActionRegistry, createDefaultActionRegistry } from "./core/actionRegistry"
import { createCommandAgentProvider } from "./core/agentProvider"
import { WorkflowEngine, WorkflowEngineOptions } from "./core/engine"
import { collectWorkflowInputsWithResolver } from "./core/inputCollector"
import {
  AgentProvider,
  CoreWorkflowDefinition,
  WorkflowInputDefinition
} from "./core/model"
import { createDefaultResultSinkRegistry, ResultSinkRegistry } from "./core/resultSinkRegistry"
import { FileRunStateStore, RunStateStore } from "./core/runStateStore"
import { FileTaskSnapshotStore, TaskSnapshotStore } from "./core/taskSnapshots"
import {
  fallbackWorkspaceRootCandidates,
  findMarkerRoots,
  findWorkflowRootCandidates,
  MarkerRootCandidate,
  rootHasMarker
} from "./core/workspaceRoots"
import { formatAttempt, runAttempt, showMarkdownReport } from "./reports"
import { loadWorkspaceWorkflows } from "./workflowDefinitionLoader"

const BOB_EXTENSION_ID = "IBM.bob-code"
const WORKFLOW_GLOB = "**/.bob/workflows/*/WORKFLOW.md"

interface RunSelection {
  root: string
  runId: string
  run?: Awaited<ReturnType<RunStateStore["loadRun"]>>
}

interface RegistrationResult {
  summary: string
  lines: string[]
}

interface StepCompletionOptions {
  silent?: boolean
}

interface TaskSnapshotSettings {
  enabled: boolean
  maxBytes: number
  maxPerRun: number
  includeMessages: boolean
  pruneOnSave: boolean
}

export interface WorkflowRegisterApi {
  registerActionProvider: (provider: ActionProvider) => void
  registerAgentProvider: (provider: AgentProvider) => void
  registerResultSink: (type: string, handler: Parameters<ResultSinkRegistry["register"]>[1]) => void
  listWorkflows: () => CoreWorkflowDefinition[]
  runWorkflow: (workflowId?: string, inputs?: Record<string, unknown>) => Promise<unknown>
}

export function activate(context: vscode.ExtensionContext): WorkflowRegisterApi {
  const service = new WorkflowRegisterService(String(context.extension.packageJSON.version ?? "unknown"))
  context.subscriptions.push(service)
  context.subscriptions.push(
    vscode.commands.registerCommand("workflowRegister.reload", () => service.reload({ showReport: true })),
    vscode.commands.registerCommand("workflowRegister.inspect", () => service.inspect()),
    vscode.commands.registerCommand("workflowRegister.completeCurrentStep", (options?: StepCompletionOptions) => service.completeCurrentStep(options)),
    vscode.commands.registerCommand("workflowRegister.completeStep", (options?: StepCompletionOptions) => service.completeCurrentStep(options)),
    vscode.commands.registerCommand("workflowRegister.inspectActiveSteps", () => service.inspectActiveSteps()),
    vscode.commands.registerCommand(
      "workflowRegister.runWorkflow",
      (workflowId?: string, inputs?: Record<string, unknown>) => service.runWorkflow(workflowId, inputs)
    ),
    vscode.commands.registerCommand("workflowRegister.inspectRuns", () => service.inspectRuns()),
    vscode.commands.registerCommand("workflowRegister.resumeRun", (runId?: string) => service.resumeRun(runId)),
    vscode.commands.registerCommand("workflowRegister.retryCurrentStep", (runId?: string) => service.retryCurrentStep(runId))
  )
  service.reload({ showReport: false }).catch((error) => console.warn("Bob workflow registration failed", error))
  const retryDelaysMs = [3000, 10000]
  for (const delayMs of retryDelaysMs) {
    const timer = setTimeout(
      () => service.reload({ showReport: false }).catch((error) => {
        console.warn("Bob workflow registration retry failed", error)
      }),
      delayMs
    )
    context.subscriptions.push({ dispose: () => clearTimeout(timer) })
  }
  return {
    registerActionProvider: (provider) => service.registerActionProvider(provider),
    registerAgentProvider: (provider) => service.registerAgentProvider(provider),
    registerResultSink: (type, handler) => service.registerResultSink(type, handler),
    listWorkflows: () => service.listCoreWorkflows(),
    runWorkflow: (workflowId, inputs) => service.runWorkflow(workflowId, inputs)
  }
}

export function deactivate(): void {
  // Nothing to dispose beyond context subscriptions.
}

class WorkflowRegisterService implements vscode.Disposable {
  private readonly registeredIds = new Set<string>()
  private readonly watcher = vscode.workspace.createFileSystemWatcher(WORKFLOW_GLOB)
  private readonly stepRuntime = new StepRuntime()
  private readonly coreWorkflows = new Map<string, CoreWorkflowDefinition>()
  private readonly actionRegistry = createDefaultActionRegistry({
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args)
  })
  private readonly customResultSinks: Array<{ type: string; handler: Parameters<ResultSinkRegistry["register"]>[1] }> = []
  private agentProvider?: AgentProvider
  private registeredSource?: BobSourceLike
  private lastResult: RegistrationResult = { summary: "No workflow registration has run yet.", lines: [] }

  constructor(private readonly engineVersion: string) {
    this.watcher.onDidCreate(() => this.reload({ showReport: false }))
    this.watcher.onDidChange(() => this.reload({ showReport: false }))
    this.watcher.onDidDelete(() => this.reload({ showReport: false }))
  }

  dispose(): void {
    this.watcher.dispose()
    void this.deactivateRegisteredSource()
  }

  async inspect(): Promise<void> {
    await showMarkdownReport("Bob Workflow Register", this.lastResult.summary, this.lastResult.lines)
  }

  async inspectActiveSteps(): Promise<void> {
    const steps = this.stepRuntime.list()
    const lines = steps.length === 0
      ? ["- No active Bob workflow steps."]
      : steps.map((step) => [
        `- key=${step.key}`,
        `workflowId=${step.workflowId}`,
        `workflowTitle=${step.workflowLabel}`,
        `stepId=${step.stepId}`,
        `stepTitle=${step.title}`
      ].join("; "))
    await showMarkdownReport("Active Bob Workflow Steps", `${steps.length} active step(s).`, lines)
  }

  async completeCurrentStep(options: StepCompletionOptions = {}): Promise<string> {
    const message = await this.stepRuntime.completeCurrentStep()
    if (!options.silent) await vscode.window.showInformationMessage(message)
    return message
  }

  registerActionProvider(provider: ActionProvider): void {
    this.actionRegistry.register(provider)
  }

  registerAgentProvider(provider: AgentProvider): void {
    this.agentProvider = provider
  }

  registerResultSink(type: string, handler: Parameters<ResultSinkRegistry["register"]>[1]): void {
    this.customResultSinks.push({ type, handler })
  }

  listCoreWorkflows(): CoreWorkflowDefinition[] {
    return Array.from(this.coreWorkflows.values()).sort((a, b) => a.label.localeCompare(b.label))
  }

  async runWorkflow(workflowId?: string, inputs: Record<string, unknown> = {}): Promise<unknown> {
    if (this.coreWorkflows.size === 0) await this.reload({ showReport: false })
    const workflow = workflowId
      ? this.coreWorkflows.get(workflowId)
      : await this.pickCoreWorkflow()
    if (!workflow) return "No workflow selected."
    const root = workflow.workflowRoot ?? await this.pickWorkflowRoot("Select workflow workspace")
    if (!root) {
      const message = "No workspace folder is open."
      await vscode.window.showErrorMessage(message)
      return message
    }
    const resolvedInputs = await this.collectWorkflowInputs(workflow, inputs)
    if (!resolvedInputs) return "Workflow input was cancelled."
    const engine = this.createEngine(root)
    const run = await engine.runWorkflow(workflow, resolvedInputs)
    await vscode.window.showInformationMessage(`Workflow run ${run.status}: ${run.runId}`)
    return run
  }

  async inspectRuns(): Promise<void> {
    const roots = await this.workflowRootCandidates()
    if (roots.length === 0) {
      await vscode.window.showErrorMessage("No workspace folder is open.")
      return
    }
    const runsByRoot = (await Promise.all(roots.map(async (candidate) => ({
      candidate,
      runs: await this.createRunStore(candidate.root).listRuns()
    })))).flatMap(({ candidate, runs }) => runs.map((run) => ({ candidate, run })))
    const lines = runsByRoot.length === 0
      ? ["- No workflow runs were found."]
      : runsByRoot.map(({ candidate, run }) => [
        `- ${run.runId}: ${run.status}`,
        `workflow=${run.workflowId}`,
        `root=${candidate.root}`,
        `currentStep=${run.currentStep ?? "none"}`,
        `updatedAt=${run.updatedAt}`
      ].join("; "))
    await showMarkdownReport("Workflow Runs", `${runsByRoot.length} run(s).`, lines)
  }

  async resumeRun(runId?: string): Promise<unknown> {
    return this.resumeOrRetryRun("resume", runId)
  }

  async retryCurrentStep(runId?: string): Promise<unknown> {
    return this.resumeOrRetryRun("retry", runId)
  }

  private async resumeOrRetryRun(mode: "resume" | "retry", runId?: string): Promise<unknown> {
    if (this.coreWorkflows.size === 0) await this.reload({ showReport: false })
    const selection = runId ? await this.findRunSelection(runId) : await this.pickRunSelection()
    if (!selection) {
      const message = "No workspace folder is open."
      if (!runId) return "No workflow run selected."
      await vscode.window.showErrorMessage(`Workflow run not found: ${runId}`)
      return message
    }
    const runStore = this.createRunStore(selection.root)
    const targetRunId = selection.runId
    const run = selection.run ?? await runStore.loadRun(targetRunId)
    if (!run) throw new Error(`Workflow run not found: ${targetRunId}`)
    const workflow = this.coreWorkflows.get(run.workflowId)
    if (!workflow) throw new Error(`Workflow definition is not loaded: ${run.workflowId}`)
    const engine = this.createEngine(selection.root)
    const result = mode === "resume"
      ? await engine.resumeRun(targetRunId, { workflow, completeHeldStep: true })
      : await engine.retryCurrentStep(targetRunId, workflow)
    await vscode.window.showInformationMessage(`Workflow run ${result.status}: ${result.runId}`)
    return result
  }

  private createEngine(workspaceRoot: string): WorkflowEngine {
    const snapshotStore = this.createTaskSnapshotStore(workspaceRoot)
    return new WorkflowEngine({
      actions: this.actionRegistry,
      resultSinks: this.createResultSinks(workspaceRoot),
      runStore: this.createRunStore(workspaceRoot),
      agentProvider: this.agentProvider ?? this.createCommandAgentProvider(),
      preflightChecks: this.createPreflightChecks(workspaceRoot),
      recoverResultText: snapshotStore
        ? (input) => recoverResultTextFromSnapshots(snapshotStore, input.workflow, input.run, input.step)
        : undefined
    })
  }

  private createBobWorkflowRunner(workflow: WorkflowDefinition): BobWorkflowEngineRunner {
    return new BobWorkflowEngineRunner({
      definition: workflow,
      coreWorkflow: workflow.core,
      actionRegistry: this.actionRegistry,
      resultSinks: (workspaceRoot) => this.createResultSinks(workspaceRoot),
      runStore: (workspaceRoot) => this.createRunStore(workspaceRoot),
      taskSnapshotStore: (workspaceRoot) => this.createTaskSnapshotStore(workspaceRoot),
      preflightChecks: (workspaceRoot) => this.createPreflightChecks(workspaceRoot),
      agentProvider: this.agentProvider ?? this.createCommandAgentProvider(),
      stepRuntime: this.stepRuntime,
      inputsProvider: (task, provided) => this.collectBobWorkflowInputs(workflow, {
        ...extractTaskWorkflowInputs(workflow, task),
        ...provided
      })
    })
  }

  private createCommandAgentProvider(): AgentProvider | undefined {
    const config = vscode.workspace.getConfiguration("workflowRegister")
    return createCommandAgentProvider({
      command: config.get<string>("agentCommand", ""),
      executeCommand: (command, input) => vscode.commands.executeCommand(command, input)
    })
  }

  private createResultSinks(workspaceRoot: string): ResultSinkRegistry {
    const registry = createDefaultResultSinkRegistry({
      workspaceRoot,
      executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args)
    })
    for (const sink of this.customResultSinks) registry.register(sink.type, sink.handler)
    return registry
  }

  private createRunStore(workspaceRoot: string): RunStateStore {
    return new FileRunStateStore({ workspaceRoot, engineVersion: this.engineVersion })
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

  private taskSnapshotSettings(): TaskSnapshotSettings {
    const config = vscode.workspace.getConfiguration("workflowRegister")
    return {
      enabled: config.get<boolean>("taskSnapshots.enabled", true),
      maxBytes: config.get<number>("taskSnapshots.maxBytes", 262_144),
      maxPerRun: config.get<number>("taskSnapshots.maxPerRun", 50),
      includeMessages: config.get<boolean>("taskSnapshots.includeMessages", true),
      pruneOnSave: config.get<boolean>("taskSnapshots.pruneOnSave", true)
    }
  }

  private async workflowRootCandidates(): Promise<MarkerRootCandidate[]> {
    const folders = vscode.workspace.workspaceFolders ?? []
    if (folders.length === 0) return []
    const markerRoots = await findWorkflowRootCandidates(folders)
    return markerRoots.length > 0 ? markerRoots : fallbackWorkspaceRootCandidates(folders)
  }

  private async pickWorkflowRoot(title: string): Promise<string | undefined> {
    const candidates = await this.workflowRootCandidates()
    if (candidates.length === 0) return undefined
    if (candidates.length === 1) return candidates[0].root
    const picked = await vscode.window.showQuickPick(candidates.map((candidate) => ({
      label: candidate.name,
      description: candidate.root,
      detail: `${candidate.marker}; ${candidate.depth}; workspace=${candidate.workspaceFolderName}`,
      candidate
    })), { title })
    return picked?.candidate.root
  }

  private async pickCoreWorkflow(): Promise<CoreWorkflowDefinition | undefined> {
    const workflows = this.listCoreWorkflows()
    if (workflows.length === 0) return undefined
    if (workflows.length === 1) return workflows[0]
    const picked = await vscode.window.showQuickPick(workflows.map((workflow) => ({
      label: workflow.label,
      description: workflow.name,
      detail: workflow.description,
      workflow
    })), { title: "Run Workflow" })
    return picked?.workflow
  }

  private async pickRunSelection(): Promise<RunSelection | undefined> {
    const selections = await this.listRunSelections()
    if (selections.length === 0) return undefined
    const picked = await vscode.window.showQuickPick(selections.map((selection) => ({
      label: selection.runId,
      description: selection.run?.status,
      detail: `${selection.run?.workflowId}; root=${selection.root}; currentStep=${selection.run?.currentStep ?? "none"}`,
      selection
    })), { title: "Workflow Run" })
    return picked?.selection
  }

  private async findRunSelection(runId: string): Promise<RunSelection | undefined> {
    return (await this.listRunSelections()).find((selection) => selection.runId === runId)
  }

  private async listRunSelections(): Promise<RunSelection[]> {
    const roots = await this.workflowRootCandidates()
    const nested = await Promise.all(roots.map(async (candidate) => {
      const runStore = this.createRunStore(candidate.root)
      const runs = await runStore.listRuns()
      return runs.map((run) => ({ root: candidate.root, runId: run.runId, run }))
    }))
    return nested.flat().sort((a, b) => (b.run?.updatedAt ?? "").localeCompare(a.run?.updatedAt ?? ""))
  }

  private async pickRunId(runStore: RunStateStore): Promise<string | undefined> {
    const runs = await runStore.listRuns()
    if (runs.length === 0) return undefined
    const picked = await vscode.window.showQuickPick(runs.map((run) => ({
      label: run.runId,
      description: run.status,
      detail: `${run.workflowId}; currentStep=${run.currentStep ?? "none"}`,
      runId: run.runId
    })), { title: "Workflow Run" })
    return picked?.runId
  }

  private async collectWorkflowInputs(workflow: CoreWorkflowDefinition, provided: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    return collectWorkflowInputsWithResolver({
      inputs: workflow.inputs,
      provided,
      prompt: (key, definition, required) => this.promptForInput(key, definition, required)
    })
  }

  private async collectBobWorkflowInputs(workflow: WorkflowDefinition, provided: Record<string, unknown>): Promise<Record<string, unknown> | undefined> {
    return collectWorkflowInputsWithResolver({
      inputs: workflow.inputs,
      provided,
      prompt: (key, definition, required) => this.promptForInput(key, definition, required)
    })
  }

  private async promptForInput(key: string, definition: WorkflowInputDefinition, required: boolean): Promise<unknown> {
    const title = definition.title ?? key
    if (definition.type === "boolean") {
      const picked = await vscode.window.showQuickPick(["true", "false"], { title })
      if (picked === undefined && required) return undefined
      return picked === undefined ? undefined : picked === "true"
    }
    if (definition.type === "select") {
      return vscode.window.showQuickPick(definition.options ?? [], { title })
    }
    const value = await vscode.window.showInputBox({ title, value: definition.default === undefined ? undefined : String(definition.default) })
    if (value === undefined) return undefined
    if (definition.type === "number") return Number(value)
    return value
  }

  async reload(options: { showReport: boolean }): Promise<void> {
    const result = await this.registerWorkflows()
    this.lastResult = result
    if (options.showReport) await showMarkdownReport("Bob Workflow Register", result.summary, result.lines)
  }

  private async registerWorkflows(): Promise<RegistrationResult> {
    const config = vscode.workspace.getConfiguration("workflowRegister")
    const sourceId = config.get<string>("sourceId", "workflow-register")
    const sourceName = config.get<string>("sourceName", "Workflow Register")
    const lines: string[] = []
    const loaded = await loadWorkspaceWorkflows(sourceId)
    lines.push(...loaded.diagnostics)
    this.coreWorkflows.clear()
    for (const workflow of loaded.coreWorkflows) this.coreWorkflows.set(workflow.id, workflow)
    if (loaded.workflows.length === 0) {
      await this.deactivateRegisteredSource(lines)
      this.registeredIds.clear()
      await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", false)
      return { summary: "No .bob workflows were found.", lines }
    }

    const bob = await loadBobApi(BOB_EXTENSION_ID)
    lines.push(`- Bob extension found: ${bob.found}`)
    lines.push(`- Bob extension active: ${bob.active}`)
    lines.push(`- Bob activation error: ${bob.activationError}`)
    const api = bob.exportsValue as BobWorkflowApi | undefined
    if (typeof api?.registerSource !== "function") {
      lines.push("- fail: IBM Bob registerSource API is not available.")
      return { summary: "Bob workflow registration API is unavailable.", lines }
    }

    await this.deactivateRegisteredSource(lines)
    const sourceResult = await runAttempt("registerSource(sourceId, sourceName)", () => api.registerSource?.(sourceId, sourceName))
    lines.push(formatAttempt(sourceResult))
    const source = asSource(sourceResult.value)
    lines.push(`- returned source keys: ${source ? Object.keys(source as Record<string, unknown>).join(",") || "none" : "none"}`)
    lines.push(`- typeof source.registerWorkflow: ${typeof source?.registerWorkflow}`)
    if (!source?.registerWorkflow) return { summary: "Bob accepted the source request, but workflows cannot be registered.", lines }
    this.registeredSource = source

    let registeredCount = 0
    const registeredIds = new Set<string>()
    for (const workflow of loaded.workflows) {
      const attempt = await runAttempt(
        `source.registerWorkflow(${workflow.id})`,
        () => source.registerWorkflow?.(createBobWorkflow(workflow, this.createBobWorkflowRunner(workflow)))
      )
      lines.push(formatAttempt(attempt))
      if (attempt.ok) {
        registeredIds.add(workflow.id)
        registeredCount += 1
        source.log?.(`Workflow registered from ${workflow.file.fsPath}: ${workflow.id}`)
      }
    }
    this.registeredIds.clear()
    for (const id of registeredIds) this.registeredIds.add(id)
    await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", this.registeredIds.size > 0)
    return { summary: `Registered ${registeredCount} workflow(s); ${this.registeredIds.size} workflow(s) are registered in this session.`, lines }
  }

  private async deactivateRegisteredSource(lines?: string[]): Promise<void> {
    const source = this.registeredSource
    this.registeredSource = undefined
    if (!source?.deactivate) return
    const attempt = await runAttempt("previousSource.deactivate()", () => source.deactivate?.())
    lines?.push(formatAttempt(attempt))
  }
}
