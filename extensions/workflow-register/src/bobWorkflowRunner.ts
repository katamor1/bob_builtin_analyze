import * as vscode from "vscode"
import { buildWorkflowAgentPrompt, extractSubagentResult } from "./agentStep"
import {
  DEFAULT_MAX_RESULT_BYTES
} from "./bobWorkflowTypes"
import type {
  ActiveStep,
  BobWorkflow,
  BobWorkflowRunnerInputCollector,
  BobWorkflowStep,
  BobWorkflowTask,
  WorkflowDefinition,
  WorkflowStateEntry,
  WorkflowStepCommandResult,
  WorkflowStepDefinition,
  WorkflowTodoItem
} from "./bobWorkflowTypes"
import type { ActionRegistry } from "./core/actionRegistry"
import { WorkflowEngine } from "./core/engine"
import type { WorkflowEngineOptions, WorkflowExecutionHooks } from "./core/engine"
import { validateCommandGuardrails } from "./core/guardrails"
import type {
  AgentProvider,
  CoreWorkflowDefinition,
  EngineStep,
  ResultSinkDefinition,
  WorkflowRunState
} from "./core/model"
import type { ResultSinkRegistry } from "./core/resultSinkRegistry"
import type { RunStateStore } from "./core/runStateStore"
import {
  createBobTaskSnapshotProvider,
  snapshotMatchesRun
} from "./core/taskSnapshots"
import type {
  TaskSnapshotProvider,
  TaskSnapshotReason,
  TaskSnapshotStore
} from "./core/taskSnapshots"
import {
  executeResultHandoff,
  extractLastAssistantText,
  resultSourceForStep
} from "./resultHandoff"
import { appendWorkflowContext } from "./workflowPromptContext"

export class StepRuntime {
  private readonly activeSteps = new Map<string, ActiveStep>()
  private sequence = 0

  hold(
    workflow: WorkflowDefinition,
    step: { id: string; title: string },
    task: BobWorkflowTask,
    context: {
      runId: string
      stepDefinition?: WorkflowStepDefinition
      actionRegistry?: ActionRegistry
      inputs?: Record<string, unknown>
      state?: Record<string, string>
      messageStartIndex?: number
    }
  ): Promise<boolean> {
    const key = `${++this.sequence}:${workflow.id}:${step.id}`
    return new Promise<boolean>((resolve) => {
      this.activeSteps.set(key, {
        key,
        workflowId: workflow.id,
        workflowLabel: workflow.label,
        runId: context.runId,
        stepId: step.id,
        title: step.title,
        task,
        stepDefinition: context.stepDefinition,
        guardrails: workflow.guardrails,
        actionRegistry: context.actionRegistry,
        inputs: context.inputs,
        state: context.state,
        messageStartIndex: context.messageStartIndex ?? getTaskMessageCount(task),
        resolve
      })
    })
  }

  list(): ActiveStep[] {
    return Array.from(this.activeSteps.values())
  }

  async completeCurrentStep(): Promise<string> {
    const active = await this.pickActiveStep()
    if (!active) return "No active Bob workflow step."
    const handoff = await captureHeldStepResult(active)
    if (!handoff.ok) {
      const message = `Could not capture Bob workflow step result: ${handoff.error}`
      await vscode.window.showErrorMessage(message)
      return message
    }
    active.task.setStepComplete?.()
    active.resolve(true)
    this.activeSteps.delete(active.key)
    return `Completed: ${active.workflowLabel} / ${active.title}`
  }

  private async pickActiveStep(): Promise<ActiveStep | undefined> {
    const steps = this.list()
    if (steps.length === 0) return undefined
    if (steps.length === 1) return steps[0]
    const picked = await vscode.window.showQuickPick(
      steps.map((step) => ({
        label: step.title,
        description: step.workflowLabel,
        detail: `${step.workflowId} / ${step.stepId} / ${step.key}`,
        step
      })),
      { placeHolder: "Select the Bob workflow step to complete" }
    )
    return picked?.step
  }
}

async function captureHeldStepResult(active: ActiveStep): Promise<{ ok: boolean; error?: string }> {
  const step = active.stepDefinition
  if (!step?.captureResult) return { ok: true }
  if (step.resultCommand) {
    const guardrail = validateCommandGuardrails({ guardrails: active.guardrails }, step.resultCommand)
    if (guardrail) return { ok: false, error: guardrail }
  }
  const messages = active.task.getMessages?.()
  const resultText = resultSourceForStep(step) === "lastAssistant" && Array.isArray(messages)
    ? extractLastAssistantText(messages, active.messageStartIndex)
    : undefined
  return executeResultHandoff(step, resultText, {
    actions: active.actionRegistry,
    executeCommand: active.actionRegistry
      ? undefined
      : (command, ...args) => vscode.commands.executeCommand(command, ...args),
    inputs: active.inputs,
    state: active.state,
    workflowId: active.workflowId,
    runId: active.runId,
    stepId: active.stepId
  })
}

function getTaskMessageCount(task: BobWorkflowTask): number {
  const messages = task.getMessages?.()
  return Array.isArray(messages) ? messages.length : 0
}

interface BobWorkflowEngineRunnerOptions {
  definition: WorkflowDefinition
  coreWorkflow: CoreWorkflowDefinition
  actionRegistry: ActionRegistry
  resultSinks: (workspaceRoot: string) => ResultSinkRegistry
  runStore: (workspaceRoot: string) => RunStateStore
  taskSnapshotStore: (workspaceRoot: string) => TaskSnapshotStore | undefined
  preflightChecks: (workspaceRoot: string) => NonNullable<WorkflowEngineOptions["preflightChecks"]>
  agentProvider?: AgentProvider
  stepRuntime: StepRuntime
  inputsProvider: BobWorkflowRunnerInputCollector
}

export class BobWorkflowEngineRunner {
  private readonly taskInputs = new WeakMap<object, Record<string, unknown>>()

  constructor(private readonly options: BobWorkflowEngineRunnerOptions) {}

  async runSingleWorkflowStep(task: BobWorkflowTask): Promise<boolean> {
    return this.runEngine(task, { executionMode: "full" })
  }

  async runTodoStep(todo: WorkflowTodoItem, index: number, task: BobWorkflowTask): Promise<boolean> {
    return this.runEngine(task, { executionMode: "singleStep", stepId: todo.id })
  }

  private async runEngine(
    task: BobWorkflowTask,
    request: { executionMode: "full" | "singleStep"; stepId?: string }
  ): Promise<boolean> {
    const workspaceRoot = this.options.definition.workflowRoot
    if (!workspaceRoot) {
      await vscode.window.showErrorMessage("Bob workflow workspace root is not available.")
      return false
    }
    const inputs = await this.inputsForTask(task)
    if (!inputs) {
      await vscode.window.showErrorMessage("Bob workflow input failed: Workflow input was cancelled.")
      return false
    }
    const snapshotStore = this.options.taskSnapshotStore(workspaceRoot)
    const snapshotProvider = createBobTaskSnapshotProvider(task)
    const manuallyCompleted = new Set<string>()
    const messageStartIndexes = new Map<string, number>()
    const engine = new WorkflowEngine({
      actions: this.options.actionRegistry,
      resultSinks: this.options.resultSinks(workspaceRoot),
      runStore: this.options.runStore(workspaceRoot),
      agentProvider: this.createAgentProvider(task),
      preflightChecks: this.options.preflightChecks(workspaceRoot),
      hooks: this.createHooks(
        task,
        snapshotProvider,
        snapshotStore,
        manuallyCompleted,
        messageStartIndexes
      ),
      manualCompletion: async ({ run, step }) => {
        const completed = await this.options.stepRuntime.hold(
          this.options.definition,
          { id: step.id, title: step.title },
          task,
          {
            runId: run.runId,
            stepDefinition: this.options.definition.stepsById[step.id],
            actionRegistry: this.options.actionRegistry,
            inputs: run.inputs,
            state: run.state,
            messageStartIndex: messageStartIndexes.get(stepKey(run.runId, step.id))
          }
        )
        if (completed) manuallyCompleted.add(stepKey(run.runId, step.id))
        return { completed }
      },
      recoverResultText: async ({ workflow, run, step }) => {
        const currentTaskText = extractLastAssistantText(task.getMessages?.() ?? [], 0)
        if (currentTaskText) return currentTaskText
        return snapshotStore
          ? recoverResultTextFromSnapshots(snapshotStore, workflow, run, step)
          : undefined
      }
    })
    try {
      const run = await engine.runWorkflow(this.options.coreWorkflow, inputs, {
        executionMode: request.executionMode,
        stepId: request.stepId
      })
      if (run.status === "failed") {
        await vscode.window.showErrorMessage(`Bob workflow run failed: ${run.error ?? run.runId}`)
      }
      return run.status === "completed" || run.status === "running"
    } catch (error) {
      await vscode.window.showErrorMessage(
        `Bob workflow execution failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  private async inputsForTask(task: BobWorkflowTask): Promise<Record<string, unknown> | undefined> {
    if (isObject(task)) {
      const existing = this.taskInputs.get(task)
      if (existing) return existing
    }
    const resolved = await this.options.inputsProvider(task, {})
    if (resolved && isObject(task)) this.taskInputs.set(task, resolved)
    return resolved
  }

  private createAgentProvider(task: BobWorkflowTask): AgentProvider | undefined {
    return {
      run: async (input) => {
        if (typeof task.startSubagent === "function") {
          const stepDefinition = this.options.definition.stepsById[input.stepId]
          const todoContext = this.todoContext(input.stepId)
          const value = await task.startSubagent(buildWorkflowAgentPrompt({
            workflowId: this.options.definition.id,
            workflowName: this.options.definition.name,
            workflowRoot: input.workflowRoot ?? this.options.definition.workflowRoot,
            workflowFile: input.workflowFile ?? this.options.definition.workflowFile,
            workflowFolderName: input.workflowFolderName ?? this.options.definition.workflowFolderName,
            stepIndex: todoContext.index,
            stepId: input.stepId,
            stepTitle: todoContext.todo?.text ?? stepDefinition?.id ?? input.stepId,
            stepPrompt: stepDefinition?.prompt ?? input.prompt,
            workflowInstructions: this.options.definition.promptWithoutTodo,
            stateEntries: stateEntriesFromRecord(input.state, stepDefinition?.includeState ?? [])
          }))
          const result = extractSubagentResult(value)
          if (!result) throw new Error("Bob subagent returned no result.")
          return result
        }
        if (this.options.agentProvider) return this.options.agentProvider.run(input)
        throw new Error("Bob startSubagent API is not available.")
      }
    }
  }

  private createHooks(
    task: BobWorkflowTask,
    snapshotProvider: TaskSnapshotProvider,
    snapshotStore: TaskSnapshotStore | undefined,
    manuallyCompleted: Set<string>,
    messageStartIndexes: Map<string, number>
  ): WorkflowExecutionHooks {
    const snapshot = async (
      reason: TaskSnapshotReason,
      input: {
        workflow: CoreWorkflowDefinition
        run: WorkflowRunState
        step?: EngineStep
        agentText?: string
        error?: string
      }
    ) => {
      if (!snapshotStore) return
      const payload = await Promise.resolve(snapshotProvider.exportTask({
        reason,
        workflow: input.workflow,
        run: input.run,
        step: input.step,
        lastAssistantText: input.agentText,
        handoff: input.error
          ? { resultCommand: resultCommandForStep(input.step), error: input.error }
          : undefined
      }))
      if (payload) await snapshotStore.saveSnapshot(payload)
    }
    return {
      onWorkflowStart: async ({ workflow, run }) => snapshot("workflow-start", { workflow, run }),
      onStepStart: async ({ workflow, run, step }) => {
        if (!step) return
        messageStartIndexes.set(stepKey(run.runId, step.id), getTaskMessageCount(task))
        const context = this.todoContext(step.id)
        const stepDefinition = this.options.definition.stepsById[step.id]
        const stateEntries = stateEntriesFromRecord(run.state, stepDefinition?.includeState ?? [])
        const message = context.todo
          ? buildStepMessage(
            this.options.definition,
            context.todo,
            context.index,
            stepDefinition,
            undefined,
            stateEntries
          )
          : buildWorkflowStartMessage(
            this.options.definition,
            undefined,
            0,
            stepDefinition,
            undefined,
            stateEntries
          )
        if (message) await task.sendMessage?.(message, "user")
        await snapshot("step-start", { workflow, run, step })
      },
      onCommandResult: async ({ run, step, commandValue }) => {
        if (!step || step.type !== "command") return
        const context = this.todoContext(step.id)
        if (!context.todo) return
        const stepDefinition = this.options.definition.stepsById[step.id]
        const commandResult = { command: step.action.provider, ok: true, value: commandValue }
        const stateEntries = stateEntriesFromRecord(run.state, stepDefinition?.includeState ?? [])
        const message = shouldIncludeCommandResult(stepDefinition, commandResult) || stateEntries.length > 0
          ? buildCommandResultMessage(
            this.options.definition,
            context.todo,
            context.index,
            commandResult,
            stateEntries
          )
          : undefined
        if (message) await task.sendMessage?.(message, "user")
      },
      onAgentOutput: async ({ workflow, run, step, agentText }) => {
        if (agentText) await task.sendMessage?.(agentText, "assistant")
        await snapshot("agent-output", { workflow, run, step, agentText })
      },
      onHandoffFailed: async ({ workflow, run, step, agentText, error }) => {
        await snapshot("handoff-failed", { workflow, run, step, agentText, error })
      },
      onStepHeld: async ({ workflow, run, step, error }) => {
        await snapshot("held", { workflow, run, step, error })
      },
      onStepFailed: async ({ workflow, run, step, error }) => {
        await snapshot("failed", { workflow, run, step, error })
      },
      onStepCompleted: async ({ workflow, run, step }) => {
        if (step && !manuallyCompleted.has(stepKey(run.runId, step.id))) task.setStepComplete?.()
        await snapshot("completed", { workflow, run, step })
      },
      onWorkflowCompleted: async ({ workflow, run }) => snapshot("completed", { workflow, run })
    }
  }

  private todoContext(stepId: string): { todo?: WorkflowTodoItem; index: number } {
    const index = this.options.definition.todos.findIndex((todo) => todo.id === stepId)
    return {
      todo: index >= 0 ? this.options.definition.todos[index] : undefined,
      index: Math.max(0, index)
    }
  }
}

export function createBobWorkflow(
  definition: WorkflowDefinition,
  runner: BobWorkflowEngineRunner
): BobWorkflow {
  const steps = buildWorkflowSteps(definition, runner)
  return {
    hidden: definition.hidden,
    getId: () => definition.id,
    getLabel: () => definition.label,
    getMenuLabel: () => definition.menuLabel,
    getDescription: () => definition.description,
    getMode: () => definition.mode,
    isEnabled: async (env) => !definition.workspaceRequired || Boolean(env?.workspace),
    getSteps: () => steps,
    getApprovalConfig: () => ({
      allowed_permissions: definition.permissions,
      autoApprovalEnabled: definition.autoApprovalEnabled
    })
  }
}

function buildWorkflowSteps(
  definition: WorkflowDefinition,
  runner: BobWorkflowEngineRunner
): BobWorkflowStep[] {
  if (definition.todoEnabled && definition.todoAsSteps && definition.todos.length > 0) {
    return definition.todos.map((todo, index) => ({
      id: todo.id,
      title: todo.text,
      execution: async (task) => runner.runTodoStep(todo, index, task)
    }))
  }
  return [{
    id: "runWorkflow",
    title: definition.label,
    execution: async (task) => runner.runSingleWorkflowStep(task)
  }]
}

export function extractTaskWorkflowInputs(
  definition: WorkflowDefinition,
  task: BobWorkflowTask
): Record<string, unknown> {
  const inputs: Record<string, unknown> = {}
  const metadata = recordValue(task.getAllMetadata?.())
  mergeKnownWorkflowInputs(definition, inputs, metadata)
  mergeKnownWorkflowInputs(definition, inputs, recordValue(metadata.inputs))
  mergeKnownWorkflowInputs(definition, inputs, recordValue(metadata.workflowInputs))
  mergeKnownWorkflowInputs(definition, inputs, recordValue(metadata.meta))
  mergeKnownWorkflowInputs(definition, inputs, recordValue(recordValue(metadata.workflow).meta))
  for (const message of task.getMessages?.() ?? []) {
    const meta = recordValue(recordValue(message)._meta)
    const workflow = recordValue(meta.workflow)
    mergeKnownWorkflowInputs(definition, inputs, recordValue(workflow.meta))
    mergeKnownWorkflowInputs(definition, inputs, recordValue(workflow.inputs))
  }
  return inputs
}

function mergeKnownWorkflowInputs(
  definition: WorkflowDefinition,
  target: Record<string, unknown>,
  source: Record<string, unknown>
): void {
  for (const key of Object.keys(definition.inputs)) {
    if (source[key] !== undefined) target[key] = source[key]
  }
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function isObject(value: unknown): value is object {
  return Boolean(value && typeof value === "object")
}

function stepKey(runId: string, stepId: string): string {
  return `${runId}:${stepId}`
}

function stateEntriesFromRecord(state: Record<string, string>, keys: string[]): WorkflowStateEntry[] {
  return keys.flatMap((key) => state[key] === undefined ? [] : [{ key, value: state[key] }])
}

function resultCommandForStep(step: EngineStep | undefined): string | undefined {
  if (!step || !("result" in step)) return undefined
  return step.result?.sinks.find(
    (sink): sink is Extract<ResultSinkDefinition, { type: "command" }> => sink.type === "command"
  )?.command
}

export async function recoverResultTextFromSnapshots(
  snapshotStore: TaskSnapshotStore,
  workflow: CoreWorkflowDefinition,
  run: WorkflowRunState,
  step: EngineStep
): Promise<string | undefined> {
  const latest = await snapshotStore.loadLatest(run.runId)
  if (latest && snapshotMatchesRun(latest, workflow, run, step) && latest.lastAssistantText?.trim()) {
    return latest.lastAssistantText
  }
  const agentOutput = await snapshotStore.findLatestSnapshot(
    run.runId,
    (snapshot) => snapshot.reason === "agent-output"
      && snapshotMatchesRun(snapshot, workflow, run, step)
      && Boolean(snapshot.lastAssistantText?.trim())
  )
  return agentOutput?.lastAssistantText
}

function buildStepMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string | undefined {
  if (index === 0) {
    return buildWorkflowStartMessage(
      definition,
      todo,
      index,
      stepDefinition,
      commandResult,
      stateEntries
    )
  }
  if (definition.stepMessage === "silent") {
    return shouldIncludeCommandResult(stepDefinition, commandResult) || stateEntries.length > 0
      ? buildCommandResultMessage(definition, todo, index, commandResult, stateEntries)
      : undefined
  }
  if (definition.stepMessage === "full") {
    return buildWorkflowTodoStepMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
  }
  if (definition.stepMessage === "step") {
    return buildStepPromptMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
      ?? buildCurrentTodoMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
  }
  return buildCurrentTodoMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
}

function buildWorkflowStartMessage(
  definition: WorkflowDefinition,
  currentTodo?: WorkflowTodoItem,
  currentIndex = 0,
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string {
  const lines = [
    "You are starting the following Bob workflow.",
    "",
    "Workflow:",
    `- id: ${definition.id}`,
    `- name: ${definition.name}`,
    `- title: ${definition.label}`,
    `- mode: ${definition.mode}`,
    ""
  ]
  appendWorkflowContext(lines, {
    workflowRoot: definition.workflowRoot,
    workflowFile: definition.workflowFile,
    workflowFolderName: definition.workflowFolderName,
    stateEntries
  })
  if (definition.todoEnabled) {
    lines.push(
      "First, create or update your Todo list using exactly the items below.",
      "Do not immediately mark them complete. Work through them one by one and only mark an item complete after the corresponding work is actually done.",
      "",
      "<workflow_todos>",
      ...definition.todos.map((todo) => `- [ ] ${todo.id}: ${todo.text}`),
      "</workflow_todos>",
      ""
    )
  }
  lines.push(
    "Then follow the workflow instructions below.",
    "",
    "<workflow_instructions>",
    definition.promptWithoutTodo,
    "</workflow_instructions>"
  )
  if (definition.stepMessage === "step" && currentTodo) {
    const stepBlock = buildStepPromptBlock(stepDefinition, currentTodo, currentIndex)
    if (stepBlock) lines.push("", "Current workflow step:", stepBlock)
  }
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildCurrentTodoMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string {
  const lines = [
    "Current workflow Todo item:",
    `<workflow_todo index=\"${index + 1}\" id=\"${todo.id}\">`,
    `- [ ] ${todo.id}: ${todo.text}`,
    "</workflow_todo>"
  ]
  appendWorkflowContext(lines, {
    workflowRoot: definition.workflowRoot,
    workflowFile: definition.workflowFile,
    workflowFolderName: definition.workflowFolderName,
    stateEntries
  })
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildCommandResultMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string | undefined {
  const lines = [
    "Workflow step command result:",
    `<workflow_todo index=\"${index + 1}\" id=\"${todo.id}\">`,
    `- [ ] ${todo.id}: ${todo.text}`,
    "</workflow_todo>"
  ]
  appendWorkflowContext(lines, {
    workflowRoot: definition.workflowRoot,
    workflowFile: definition.workflowFile,
    workflowFolderName: definition.workflowFolderName,
    stateEntries
  })
  if (commandResult) lines.push("", buildCommandResultBlock(commandResult))
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildStepPromptMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string | undefined {
  const stepBlock = buildStepPromptBlock(stepDefinition, todo, index)
  if (!stepBlock) return undefined
  const lines = ["Continue the Bob workflow using the current Step instructions.", "", stepBlock]
  appendWorkflowContext(lines, {
    workflowRoot: definition.workflowRoot,
    workflowFile: definition.workflowFile,
    workflowFolderName: definition.workflowFolderName,
    stateEntries
  })
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildStepPromptBlock(
  stepDefinition: WorkflowStepDefinition | undefined,
  todo: WorkflowTodoItem,
  index: number
): string | undefined {
  const prompt = stepDefinition?.prompt.trim()
  if (!prompt) return undefined
  return [
    `<workflow_step index=\"${index + 1}\" id=\"${todo.id}\">`,
    `Title: ${todo.text}`,
    "",
    "<workflow_step_instructions>",
    prompt,
    "</workflow_step_instructions>",
    "</workflow_step>"
  ].join("\n")
}

function buildWorkflowTodoStepMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string {
  const lines = [
    "Continue the Bob workflow Todo list.",
    "",
    "Workflow:",
    `- id: ${definition.id}`,
    `- name: ${definition.name}`,
    `- title: ${definition.label}`,
    `- mode: ${definition.mode}`,
    "",
    "Current Todo item:",
    `<workflow_todo index=\"${index + 1}\" id=\"${todo.id}\">`,
    `- [ ] ${todo.id}: ${todo.text}`,
    "</workflow_todo>",
    "",
    "Work only on this Todo item now. Mark it complete only after the corresponding work is actually done."
  ]
  appendWorkflowContext(lines, {
    workflowRoot: definition.workflowRoot,
    workflowFile: definition.workflowFile,
    workflowFolderName: definition.workflowFolderName,
    stateEntries
  })
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function appendCommandResult(
  lines: string[],
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult
): void {
  if (shouldIncludeCommandResult(stepDefinition, commandResult) && commandResult) {
    lines.push("", buildCommandResultBlock(commandResult, stepDefinition?.maxResultBytes))
  }
}

function appendWorkflowState(lines: string[], stateEntries: WorkflowStateEntry[]): void {
  if (stateEntries.length === 0) return
  lines.push("", "<workflow_state>")
  for (const entry of stateEntries) {
    lines.push(`<state key=\"${escapeXmlAttribute(entry.key)}\">`, entry.value, "</state>", "")
  }
  if (lines[lines.length - 1] === "") lines.pop()
  lines.push("</workflow_state>")
}

function shouldIncludeCommandResult(
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult
): boolean {
  return Boolean(commandResult && (stepDefinition?.sendResult || !commandResult.ok))
}

function buildCommandResultBlock(
  commandResult: WorkflowStepCommandResult,
  maxBytes = DEFAULT_MAX_RESULT_BYTES
): string {
  return [
    `<workflow_step_command_result command=\"${escapeXmlAttribute(commandResult.command)}\" ok=\"${commandResult.ok}\">`,
    commandResult.ok ? formatCommandResult(commandResult.value, maxBytes) : `ERROR: ${commandResult.error}`,
    "</workflow_step_command_result>"
  ].join("\n")
}

function formatCommandResult(value: unknown, maxBytes = DEFAULT_MAX_RESULT_BYTES): string {
  let formatted: string
  if (value === undefined) formatted = "undefined"
  else if (typeof value === "string") formatted = value
  else {
    try {
      formatted = JSON.stringify(value, null, 2)
    } catch {
      formatted = String(value)
    }
  }
  return truncateText(formatted, maxBytes)
}

function truncateText(value: string, maxBytes: number): string {
  if (maxBytes <= 0 || Buffer.byteLength(value, "utf8") <= maxBytes) return value
  let output = value
  while (Buffer.byteLength(output, "utf8") > maxBytes && output.length > 0) {
    output = output.slice(0, Math.max(0, output.length - 512))
  }
  return `${output}\n... [truncated to ${maxBytes} bytes]`
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/\"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
