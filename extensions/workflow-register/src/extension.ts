import * as path from "path"
import * as vscode from "vscode"
import { buildWorkflowAgentPrompt, extractSubagentResult } from "./agentStep"

const BOB_EXTENSION_ID = "IBM.bob-code"
const WORKFLOW_GLOB = "**/.bob/workflows/*/WORKFLOW.md"
const DEFAULT_MAX_RESULT_BYTES = 20_000

type StepCompletionMode = "auto" | "manual"
type StepMessageMode = "full" | "current" | "silent" | "step"

interface BobWorkflowApi {
  registerSource?: (id: string, name?: string) => unknown
}

interface BobWorkflowTask {
  sendMessage?: (...args: unknown[]) => Promise<unknown> | Thenable<unknown> | unknown
  setStepComplete?: () => unknown
  startSubagent?: (prompt: string, preset?: unknown, mask?: unknown) => Promise<unknown> | Thenable<unknown> | unknown
}

interface BobWorkflowStep {
  id: string
  title: string
  execution: (task: BobWorkflowTask) => Promise<boolean>
}

interface BobWorkflow {
  hidden?: boolean
  getId: () => string
  getLabel: () => string
  getMenuLabel: () => string
  getDescription: () => string
  getMode?: () => string
  isEnabled: (env?: { workspace?: string }) => Promise<boolean>
  getSteps: () => BobWorkflowStep[]
  getApprovalConfig: () => { allowed_permissions: string[]; autoApprovalEnabled: boolean }
}

interface BobSourceLike {
  registerWorkflow?: (workflow: BobWorkflow) => unknown
  log?: (message: string) => unknown
}

interface WorkflowTodoItem {
  id: string
  text: string
  raw: string
}

interface WorkflowStepDefinition {
  id: string
  prompt: string
  command?: string
  commandArgs: unknown[]
  sendResult: boolean
  required: boolean
  completeOnSuccess: boolean
  runAgent: boolean
  resultKey?: string
  includeState: string[]
  maxResultBytes: number
  stateRequired: boolean
}

interface WorkflowStepCommandResult {
  command: string
  ok: boolean
  value?: unknown
  error?: string
}

interface WorkflowStateEntry {
  key: string
  value: string
}

interface WorkflowDefinition {
  id: string
  name: string
  label: string
  menuLabel: string
  description: string
  prompt: string
  promptWithoutTodo: string
  command?: string
  commandArgs: unknown[]
  mode: string
  permissions: string[]
  autoApprovalEnabled: boolean
  workspaceRequired: boolean
  hidden: boolean
  todoEnabled: boolean
  todoRequired: boolean
  todoSource: string
  todoAsSteps: boolean
  stepCompletion: StepCompletionMode
  stepMessage: StepMessageMode
  stepsById: Record<string, WorkflowStepDefinition>
  todos: WorkflowTodoItem[]
  file: vscode.Uri
}

interface LoadResult {
  workflows: WorkflowDefinition[]
  diagnostics: string[]
}

interface RegistrationResult {
  summary: string
  lines: string[]
}

interface ActiveStep {
  key: string
  workflowId: string
  workflowLabel: string
  stepId: string
  title: string
  task: BobWorkflowTask
  resolve: (value: boolean) => void
}

interface StepCompletionOptions {
  silent?: boolean
}

export function activate(context: vscode.ExtensionContext): void {
  const service = new WorkflowRegisterService()
  context.subscriptions.push(service)
  context.subscriptions.push(
    vscode.commands.registerCommand("workflowRegister.reload", () => service.reload({ showReport: true })),
    vscode.commands.registerCommand("workflowRegister.inspect", () => service.inspect()),
    vscode.commands.registerCommand("workflowRegister.completeCurrentStep", (options?: StepCompletionOptions) => service.completeCurrentStep(options)),
    vscode.commands.registerCommand("workflowRegister.completeStep", (options?: StepCompletionOptions) => service.completeCurrentStep(options)),
    vscode.commands.registerCommand("workflowRegister.inspectActiveSteps", () => service.inspectActiveSteps())
  )
  service.reload({ showReport: false }).catch((error) => console.warn("Bob workflow registration failed", error))
  const retryDelaysMs = [3000, 10000]
  for (const delayMs of retryDelaysMs) {
    const timer = setTimeout(() => service.reload({ showReport: false }).catch((error) => console.warn("Bob workflow registration retry failed", error)), delayMs)
    context.subscriptions.push({ dispose: () => clearTimeout(timer) })
  }
}

export function deactivate(): void {
  // Nothing to dispose beyond context subscriptions.
}

class StepRuntime {
  private readonly activeSteps = new Map<string, ActiveStep>()
  private readonly workflowState = new Map<string, Map<string, string>>()
  private sequence = 0

  hold(workflow: WorkflowDefinition, step: { id: string; title: string }, task: BobWorkflowTask): Promise<boolean> {
    const key = `${++this.sequence}:${workflow.id}:${step.id}`
    return new Promise<boolean>((resolve) => {
      this.activeSteps.set(key, {
        key,
        workflowId: workflow.id,
        workflowLabel: workflow.label,
        stepId: step.id,
        title: step.title,
        task,
        resolve
      })
    })
  }

  resetState(workflow: WorkflowDefinition): void {
    this.workflowState.delete(workflow.id)
  }

  saveState(workflow: WorkflowDefinition, key: string, value: string): void {
    const state = this.workflowState.get(workflow.id) ?? new Map<string, string>()
    state.set(key, value)
    this.workflowState.set(workflow.id, state)
  }

  stateEntries(workflow: WorkflowDefinition, keys: string[]): WorkflowStateEntry[] {
    const state = this.workflowState.get(workflow.id)
    if (!state) return []
    return keys.flatMap((key) => {
      const value = state.get(key)
      return value === undefined ? [] : [{ key, value }]
    })
  }

  missingStateKeys(workflow: WorkflowDefinition, keys: string[]): string[] {
    const state = this.workflowState.get(workflow.id)
    return keys.filter((key) => !state?.has(key))
  }

  list(): ActiveStep[] {
    return Array.from(this.activeSteps.values())
  }

  async completeCurrentStep(): Promise<string> {
    const active = await this.pickActiveStep()
    if (!active) return "No active Bob workflow step."
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

class WorkflowRegisterService implements vscode.Disposable {
  private readonly registeredIds = new Set<string>()
  private readonly watcher = vscode.workspace.createFileSystemWatcher(WORKFLOW_GLOB)
  private readonly stepRuntime = new StepRuntime()
  private lastResult: RegistrationResult = { summary: "No workflow registration has run yet.", lines: [] }

  constructor() {
    this.watcher.onDidCreate(() => this.reload({ showReport: false }))
    this.watcher.onDidChange(() => this.reload({ showReport: false }))
    this.watcher.onDidDelete(() => this.reload({ showReport: false }))
  }

  dispose(): void {
    this.watcher.dispose()
  }

  async inspect(): Promise<void> {
    await showMarkdownReport("Bob Workflow Register", this.lastResult.summary, this.lastResult.lines)
  }

  async inspectActiveSteps(): Promise<void> {
    const steps = this.stepRuntime.list()
    const lines = steps.length === 0
      ? ["- No active Bob workflow steps."]
      : steps.map((step) => `- key=${step.key}; workflowId=${step.workflowId}; workflowTitle=${step.workflowLabel}; stepId=${step.stepId}; stepTitle=${step.title}`)
    await showMarkdownReport("Active Bob Workflow Steps", `${steps.length} active step(s).`, lines)
  }

  async completeCurrentStep(options: StepCompletionOptions = {}): Promise<string> {
    const message = await this.stepRuntime.completeCurrentStep()
    if (!options.silent) await vscode.window.showInformationMessage(message)
    return message
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
    if (loaded.workflows.length === 0) return { summary: "No .bob workflows were found.", lines }

    const bob = await loadBobApi()
    lines.push(`- Bob extension found: ${bob.found}`)
    lines.push(`- Bob extension active: ${bob.active}`)
    lines.push(`- Bob activation error: ${bob.activationError}`)
    const api = bob.exportsValue as BobWorkflowApi | undefined
    if (typeof api?.registerSource !== "function") {
      lines.push("- fail: IBM Bob registerSource API is not available.")
      return { summary: "Bob workflow registration API is unavailable.", lines }
    }

    const sourceResult = await runAttempt("registerSource(sourceId, sourceName)", () => api.registerSource?.(sourceId, sourceName))
    lines.push(formatAttempt(sourceResult))
    const source = asSource(sourceResult.value)
    lines.push(`- returned source keys: ${source ? Object.keys(source as Record<string, unknown>).join(",") || "none" : "none"}`)
    lines.push(`- typeof source.registerWorkflow: ${typeof source?.registerWorkflow}`)
    if (!source?.registerWorkflow) return { summary: "Bob accepted the source request, but workflows cannot be registered.", lines }

    let registeredCount = 0
    for (const workflow of loaded.workflows) {
      if (this.registeredIds.has(workflow.id)) {
        lines.push(`- skip: ${workflow.id} was already registered in this extension host session.`)
        continue
      }
      const attempt = await runAttempt(`source.registerWorkflow(${workflow.id})`, () => source.registerWorkflow?.(createBobWorkflow(workflow, this.stepRuntime)))
      lines.push(formatAttempt(attempt))
      if (attempt.ok) {
        this.registeredIds.add(workflow.id)
        registeredCount += 1
        source.log?.(`Workflow registered from ${workflow.file.fsPath}: ${workflow.id}`)
      }
    }
    if (registeredCount > 0 || this.registeredIds.size > 0) await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", true)
    return { summary: `Registered ${registeredCount} workflow(s); ${this.registeredIds.size} workflow(s) are registered in this session.`, lines }
  }
}

async function loadWorkspaceWorkflows(sourceId: string): Promise<LoadResult> {
  const diagnostics: string[] = []
  const workflows: WorkflowDefinition[] = []
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, ".bob/workflows/*/WORKFLOW.md"))
    diagnostics.push(`- workspace: ${folder.name}; workflow files: ${files.length}`)
    for (const file of files) {
      const result = await loadWorkflowFile(sourceId, file)
      diagnostics.push(...result.diagnostics)
      if (result.workflow) workflows.push(result.workflow)
    }
  }
  return { workflows, diagnostics }
}

async function loadWorkflowFile(sourceId: string, file: vscode.Uri): Promise<{ workflow?: WorkflowDefinition; diagnostics: string[] }> {
  const relativePath = vscode.workspace.asRelativePath(file, false)
  const diagnostics: string[] = []
  const folderName = path.basename(path.dirname(file.fsPath))
  const text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8").replace(/^\uFEFF/, "")
  const split = splitMarkdownFrontMatter(text)
  if (!split) return { diagnostics: [`- fail: ${relativePath}: missing YAML front matter.`] }
  const fields = parseYamlFrontMatter(split.frontMatter)
  const errors = validateRequiredFrontMatter(fields)
  if (errors.length > 0) return { diagnostics: errors.map((error) => `- fail: ${relativePath}: ${error}`) }

  const name = getString(fields, "name") ?? folderName
  if (folderName !== name) diagnostics.push(`- warn: ${relativePath}: folder name '${folderName}' differs from workflow name '${name}'.`)
  const todoSource = getString(fields, "todoSource") ?? "markdown"
  const markdownTodos = todoSource === "markdown" ? extractMarkdownTodoItems(split.body) : []
  const yamlTodos = getList(fields, "todos").map(parseTodoItemText)
  const todos = markdownTodos.length > 0 ? markdownTodos : yamlTodos
  const todoEnabled = getBoolean(fields, "todo", todos.length > 0)
  const todoRequired = getBoolean(fields, "todoRequired", false)
  const todoAsSteps = getBoolean(fields, "todoAsSteps", todoEnabled && todos.length > 0)
  const stepMessage = getStepMessage(fields, "current")
  const stepsById = extractWorkflowStepDefinitions(split.body)
  const prompt = getString(fields, "prompt") ?? split.body.trim()
  if (todoRequired && todos.length === 0) return { diagnostics: [`- fail: ${relativePath}: todoRequired is true but no todo items were found.`] }
  if (stepMessage === "step") for (const todo of todos) if (!stepsById[todo.id]?.prompt) diagnostics.push(`- warn: ${relativePath}: missing Step section for todo id '${todo.id}'.`)

  const permissions = getList(fields, "permissions", todoEnabled ? ["read", "mcp", "skill", "todo"] : ["read", "mcp", "skill"])
  if (todoEnabled && !permissions.includes("todo")) permissions.push("todo")
  const workflow: WorkflowDefinition = {
    id: getString(fields, "id") ?? `${sourceId}.${name}`,
    name,
    label: getString(fields, "label") ?? getString(fields, "title") ?? name,
    menuLabel: getString(fields, "menuLabel") ?? getString(fields, "label") ?? getString(fields, "title") ?? name,
    description: getString(fields, "description") ?? "",
    prompt,
    promptWithoutTodo: removeMarkdownStepSections(todoEnabled && todoSource === "markdown" ? removeMarkdownSection(prompt, "Todo") : prompt).trim(),
    command: getString(fields, "command"),
    commandArgs: getList(fields, "commandArgs"),
    mode: getString(fields, "mode") ?? "agent",
    permissions,
    autoApprovalEnabled: getBoolean(fields, "autoApproval", true),
    workspaceRequired: getBoolean(fields, "workspaceRequired", true),
    hidden: getBoolean(fields, "hidden", false),
    todoEnabled,
    todoRequired,
    todoSource,
    todoAsSteps,
    stepCompletion: getStepCompletion(fields, todoAsSteps ? "manual" : "auto"),
    stepMessage,
    stepsById,
    todos,
    file
  }

  const stepCount = workflow.todoEnabled && workflow.todoAsSteps && workflow.todos.length > 0 ? workflow.todos.length : 1
  const stepPromptCount = Object.values(workflow.stepsById).filter((step) => step.prompt.length > 0).length
  const stepCommandCount = Object.values(workflow.stepsById).filter((step) => step.command).length
  const agentStepCount = Object.values(workflow.stepsById).filter((step) => step.runAgent).length
  const stateKeyCount = Object.values(workflow.stepsById).filter((step) => step.resultKey).length
  const includeStateCount = Object.values(workflow.stepsById).filter((step) => step.includeState.length > 0).length
  diagnostics.push(`- ok: ${relativePath}: ${workflow.id}; todos=${workflow.todos.length}; todo=${workflow.todoEnabled}; steps=${stepCount}; stepCompletion=${workflow.stepCompletion}; stepMessage=${workflow.stepMessage}; stepPrompts=${stepPromptCount}; stepCommands=${stepCommandCount}; agentSteps=${agentStepCount}; stateKeys=${stateKeyCount}; includeState=${includeStateCount}`)
  for (const step of Object.values(workflow.stepsById).filter((candidate) => candidate.command)) diagnostics.push(`- step command: ${step.id} -> ${step.command}; sendResult=${step.sendResult}; required=${step.required}; completeOnSuccess=${step.completeOnSuccess}`)
  for (const step of Object.values(workflow.stepsById).filter((candidate) => candidate.runAgent)) diagnostics.push(`- agent step: ${step.id}; resultKey=${step.resultKey ?? "none"}; maxResultBytes=${step.maxResultBytes}`)
  for (const step of Object.values(workflow.stepsById).filter((candidate) => candidate.resultKey || candidate.includeState.length > 0)) {
    const savePart = step.resultKey ? `resultKey=${step.resultKey}` : "resultKey=none"
    const includePart = step.includeState.length > 0 ? `includeState=${step.includeState.join(",")}` : "includeState=none"
    diagnostics.push(`- step state: ${step.id}; ${savePart}; ${includePart}; stateRequired=${step.stateRequired}; maxResultBytes=${step.maxResultBytes}`)
  }
  return { workflow, diagnostics }
}

function createBobWorkflow(definition: WorkflowDefinition, stepRuntime: StepRuntime): BobWorkflow {
  const steps = buildWorkflowSteps(definition, stepRuntime)
  return {
    hidden: definition.hidden,
    getId: () => definition.id,
    getLabel: () => definition.label,
    getMenuLabel: () => definition.menuLabel,
    getDescription: () => definition.description,
    getMode: () => definition.mode,
    isEnabled: async (env) => !definition.workspaceRequired || Boolean(env?.workspace),
    getSteps: () => steps,
    getApprovalConfig: () => ({ allowed_permissions: definition.permissions, autoApprovalEnabled: definition.autoApprovalEnabled })
  }
}

function buildWorkflowSteps(definition: WorkflowDefinition, stepRuntime: StepRuntime): BobWorkflowStep[] {
  if (definition.todoEnabled && definition.todoAsSteps && definition.todos.length > 0) {
    return definition.todos.map((todo, index) => ({ id: todo.id, title: todo.text, execution: async (task) => runTodoStep(definition, stepRuntime, todo, index, task) }))
  }
  return [{ id: "runWorkflow", title: definition.label, execution: async (task) => {
    await task.sendMessage?.(buildWorkflowStartMessage(definition, undefined, 0, undefined, undefined, []), "user")
    if (definition.command) await vscode.commands.executeCommand(definition.command, ...definition.commandArgs)
    return completeOrHoldStep(task, definition, stepRuntime, "runWorkflow", definition.label)
  } }]
}

async function runTodoStep(definition: WorkflowDefinition, stepRuntime: StepRuntime, todo: WorkflowTodoItem, index: number, task: BobWorkflowTask): Promise<boolean> {
  if (index === 0) stepRuntime.resetState(definition)
  const stepDefinition = definition.stepsById[todo.id]
  const commandResult = await runWorkflowStepCommand(stepDefinition)
  if (commandResult && !commandResult.ok && stepDefinition?.required !== false) {
    await vscode.window.showErrorMessage(`Bob workflow step command failed: ${commandResult.command}: ${commandResult.error}`)
    return stepRuntime.hold(definition, { id: todo.id, title: todo.text }, task)
  }
  if (commandResult?.ok && stepDefinition?.resultKey) {
    stepRuntime.saveState(definition, stepDefinition.resultKey, formatCommandResult(commandResult.value, stepDefinition.maxResultBytes))
  }
  const missingStateKeys = stepDefinition ? stepRuntime.missingStateKeys(definition, stepDefinition.includeState) : []
  if (missingStateKeys.length > 0 && stepDefinition?.stateRequired !== false) {
    await vscode.window.showErrorMessage(`Bob workflow step state is missing: ${missingStateKeys.join(", ")}`)
    return stepRuntime.hold(definition, { id: todo.id, title: todo.text }, task)
  }
  const stateEntries = stepDefinition ? stepRuntime.stateEntries(definition, stepDefinition.includeState) : []
  const message = buildStepMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
  if (message) await task.sendMessage?.(message, "user")
  if (index === 0 && definition.command && !stepDefinition?.command) await vscode.commands.executeCommand(definition.command, ...definition.commandArgs)
  if (stepDefinition?.runAgent) {
    const agentResult = await runWorkflowStepAgent(definition, todo, index, stepDefinition, stateEntries, task)
    if (!agentResult.ok) {
      await vscode.window.showErrorMessage(`Bob workflow agent step failed: ${todo.id}: ${agentResult.error}`)
      return stepRuntime.hold(definition, { id: todo.id, title: todo.text }, task)
    }
    if (stepDefinition.resultKey) stepRuntime.saveState(definition, stepDefinition.resultKey, formatCommandResult(agentResult.value, stepDefinition.maxResultBytes))
    await task.sendMessage?.(agentResult.value, "assistant")
    task.setStepComplete?.()
    return true
  }
  if (stepDefinition?.completeOnSuccess && commandResult?.ok) {
    task.setStepComplete?.()
    return true
  }
  return completeOrHoldStep(task, definition, stepRuntime, todo.id, todo.text)
}

async function runWorkflowStepAgent(definition: WorkflowDefinition, todo: WorkflowTodoItem, index: number, stepDefinition: WorkflowStepDefinition, stateEntries: WorkflowStateEntry[], task: BobWorkflowTask): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  if (typeof task.startSubagent !== "function") return { ok: false, error: "Bob startSubagent API is not available." }
  try {
    const value = await task.startSubagent(buildWorkflowAgentPrompt({
      workflowId: definition.id,
      workflowName: definition.name,
      stepIndex: index,
      stepId: todo.id,
      stepTitle: todo.text,
      stepPrompt: stepDefinition.prompt,
      workflowInstructions: definition.promptWithoutTodo,
      stateEntries
    }))
    const result = extractSubagentResult(value)
    if (!result) return { ok: false, error: "Bob subagent returned no result." }
    return { ok: true, value: result }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

async function runWorkflowStepCommand(step?: WorkflowStepDefinition): Promise<WorkflowStepCommandResult | undefined> {
  if (!step?.command) return undefined
  try {
    let value: unknown
    if (step.command === "bobBazaar.openReviewGui") value = await vscode.commands.executeCommand("bobBazaar.openReviewGui", ...step.commandArgs)
    else if (step.command === "bobBazaar.collectReviewContext") value = await vscode.commands.executeCommand("bobBazaar.collectReviewContext", ...step.commandArgs)
    else if (step.command === "bobBazaar.loadReviewRules") value = await vscode.commands.executeCommand("bobBazaar.loadReviewRules", ...step.commandArgs)
    else return { command: step.command, ok: false, error: "Unsupported step command. Add it to the workflow-register allowlist before use." }
    return { command: step.command, ok: true, value }
  } catch (error) {
    return { command: step.command, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function buildStepMessage(definition: WorkflowDefinition, todo: WorkflowTodoItem, index: number, stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult, stateEntries: WorkflowStateEntry[] = []): string | undefined {
  if (index === 0) return buildWorkflowStartMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
  if (definition.stepMessage === "silent") return shouldIncludeCommandResult(stepDefinition, commandResult) || stateEntries.length > 0 ? buildCommandResultMessage(todo, index, commandResult, stateEntries) : undefined
  if (definition.stepMessage === "full") return buildWorkflowTodoStepMessage(definition, todo, index, stepDefinition, commandResult, stateEntries)
  if (definition.stepMessage === "step") return buildStepPromptMessage(definition, todo, index, stepDefinition, commandResult, stateEntries) ?? buildCurrentTodoMessage(todo, index, stepDefinition, commandResult, stateEntries)
  return buildCurrentTodoMessage(todo, index, stepDefinition, commandResult, stateEntries)
}

async function completeOrHoldStep(task: BobWorkflowTask, definition: WorkflowDefinition, stepRuntime: StepRuntime, stepId: string, stepTitle: string): Promise<boolean> {
  if (definition.stepCompletion === "auto") { task.setStepComplete?.(); return true }
  return stepRuntime.hold(definition, { id: stepId, title: stepTitle }, task)
}

function buildWorkflowStartMessage(definition: WorkflowDefinition, currentTodo?: WorkflowTodoItem, currentIndex = 0, stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult, stateEntries: WorkflowStateEntry[] = []): string {
  const lines = ["You are starting the following Bob workflow.", "", "Workflow:", `- id: ${definition.id}`, `- name: ${definition.name}`, `- title: ${definition.label}`, `- mode: ${definition.mode}`, ""]
  if (definition.todoEnabled) lines.push("First, create or update your Todo list using exactly the items below.", "Do not immediately mark them complete. Work through them one by one and only mark an item complete after the corresponding work is actually done.", "", "<workflow_todos>", ...definition.todos.map((todo) => `- [ ] ${todo.id}: ${todo.text}`), "</workflow_todos>", "")
  lines.push("Then follow the workflow instructions below.", "", "<workflow_instructions>", definition.promptWithoutTodo, "</workflow_instructions>")
  if (definition.stepMessage === "step" && currentTodo) {
    const stepBlock = buildStepPromptBlock(stepDefinition, currentTodo, currentIndex)
    if (stepBlock) lines.push("", "Current workflow step:", stepBlock)
  }
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildCurrentTodoMessage(todo: WorkflowTodoItem, index: number, stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult, stateEntries: WorkflowStateEntry[] = []): string {
  const lines = ["Current workflow Todo item:", `<workflow_todo index=\"${index + 1}\" id=\"${todo.id}\">`, `- [ ] ${todo.id}: ${todo.text}`, "</workflow_todo>"]
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildCommandResultMessage(todo: WorkflowTodoItem, index: number, commandResult?: WorkflowStepCommandResult, stateEntries: WorkflowStateEntry[] = []): string | undefined {
  const lines = ["Workflow step command result:", `<workflow_todo index=\"${index + 1}\" id=\"${todo.id}\">`, `- [ ] ${todo.id}: ${todo.text}`, "</workflow_todo>"]
  if (commandResult) lines.push("", buildCommandResultBlock(commandResult))
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildStepPromptMessage(definition: WorkflowDefinition, todo: WorkflowTodoItem, index: number, stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult, stateEntries: WorkflowStateEntry[] = []): string | undefined {
  const stepBlock = buildStepPromptBlock(stepDefinition, todo, index)
  if (!stepBlock) return undefined
  const lines = ["Continue the Bob workflow using the current Step instructions.", "", stepBlock]
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function buildStepPromptBlock(stepDefinition: WorkflowStepDefinition | undefined, todo: WorkflowTodoItem, index: number): string | undefined {
  const prompt = stepDefinition?.prompt.trim()
  if (!prompt) return undefined
  return [`<workflow_step index=\"${index + 1}\" id=\"${todo.id}\">`, `Title: ${todo.text}`, "", "<workflow_step_instructions>", prompt, "</workflow_step_instructions>", "</workflow_step>"].join("\n")
}

function buildWorkflowTodoStepMessage(definition: WorkflowDefinition, todo: WorkflowTodoItem, index: number, stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult, stateEntries: WorkflowStateEntry[] = []): string {
  const lines = ["Continue the Bob workflow Todo list.", "", "Workflow:", `- id: ${definition.id}`, `- name: ${definition.name}`, `- title: ${definition.label}`, `- mode: ${definition.mode}`, "", "Current Todo item:", `<workflow_todo index=\"${index + 1}\" id=\"${todo.id}\">`, `- [ ] ${todo.id}: ${todo.text}`, "</workflow_todo>", "", "Work only on this Todo item now. Mark it complete only after the corresponding work is actually done."]
  appendCommandResult(lines, stepDefinition, commandResult)
  appendWorkflowState(lines, stateEntries)
  return lines.join("\n")
}

function appendCommandResult(lines: string[], stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult): void {
  if (shouldIncludeCommandResult(stepDefinition, commandResult) && commandResult) lines.push("", buildCommandResultBlock(commandResult, stepDefinition?.maxResultBytes))
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

function shouldIncludeCommandResult(stepDefinition?: WorkflowStepDefinition, commandResult?: WorkflowStepCommandResult): boolean {
  return Boolean(commandResult && (stepDefinition?.sendResult || !commandResult.ok))
}

function buildCommandResultBlock(commandResult: WorkflowStepCommandResult, maxBytes = DEFAULT_MAX_RESULT_BYTES): string {
  return [`<workflow_step_command_result command=\"${escapeXmlAttribute(commandResult.command)}\" ok=\"${commandResult.ok}\">`, commandResult.ok ? formatCommandResult(commandResult.value, maxBytes) : `ERROR: ${commandResult.error}`, "</workflow_step_command_result>"].join("\n")
}

function formatCommandResult(value: unknown, maxBytes = DEFAULT_MAX_RESULT_BYTES): string {
  let formatted: string
  if (value === undefined) formatted = "undefined"
  else if (typeof value === "string") formatted = value
  else {
    try { formatted = JSON.stringify(value, null, 2) } catch { formatted = String(value) }
  }
  return truncateText(formatted, maxBytes)
}

function truncateText(value: string, maxBytes: number): string {
  if (maxBytes <= 0 || Buffer.byteLength(value, "utf8") <= maxBytes) return value
  let output = value
  while (Buffer.byteLength(output, "utf8") > maxBytes && output.length > 0) output = output.slice(0, Math.max(0, output.length - 512))
  return `${output}\n... [truncated to ${maxBytes} bytes]`
}

function escapeXmlAttribute(value: string): string { return value.replace(/&/g, "&amp;").replace(/\"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;") }

function extractMarkdownTodoItems(markdown: string): WorkflowTodoItem[] {
  const section = extractMarkdownSection(markdown, "Todo")
  if (!section) return []
  const todos: WorkflowTodoItem[] = []
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)$/)
    if (match) todos.push(parseTodoItemText(match[1], todos.length + 1))
  }
  return todos
}

function extractWorkflowStepDefinitions(markdown: string): Record<string, WorkflowStepDefinition> {
  const lines = markdown.split(/\r?\n/)
  const sections: Record<string, WorkflowStepDefinition> = {}
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    const stepId = match ? parseStepHeading(match[2]) : undefined
    if (!match || !stepId) continue
    const level = match[1].length
    const sectionLines: string[] = []
    for (let sectionIndex = index + 1; sectionIndex < lines.length; sectionIndex += 1) {
      const nextHeading = lines[sectionIndex].match(/^(#{1,6})\s+/)
      if (nextHeading && nextHeading[1].length <= level) break
      sectionLines.push(lines[sectionIndex])
    }
    sections[stepId] = parseWorkflowStepDefinition(stepId, sectionLines.join("\n"))
  }
  return sections
}

function parseWorkflowStepDefinition(stepId: string, markdown: string): WorkflowStepDefinition {
  const { config, prompt } = extractWorkflowStepConfig(markdown)
  return {
    id: stepId,
    prompt: prompt.trim(),
    command: getString(config, "command"),
    commandArgs: getList(config, "commandArgs"),
    sendResult: getBoolean(config, "sendResult", false),
    required: getBoolean(config, "required", true),
    completeOnSuccess: getBoolean(config, "completeOnSuccess", false),
    runAgent: getBoolean(config, "runAgent", false),
    resultKey: getString(config, "resultKey"),
    includeState: getList(config, "includeState"),
    maxResultBytes: getNumber(config, "maxResultBytes", DEFAULT_MAX_RESULT_BYTES),
    stateRequired: getBoolean(config, "stateRequired", true)
  }
}

function extractWorkflowStepConfig(markdown: string): { config: Record<string, unknown>; prompt: string } {
  const fence = "`".repeat(3)
  const pattern = new RegExp(`(^|\\r?\\n)${fence}workflow-step\\s*\\r?\\n([\\s\\S]*?)\\r?\\n${fence}\\s*(?:\\r?\\n)?`, "i")
  const match = markdown.match(pattern)
  if (!match) return { config: {}, prompt: markdown }
  return { config: parseYamlFrontMatter(match[2]), prompt: markdown.slice(0, match.index) + markdown.slice((match.index ?? 0) + match[0].length) }
}

function extractMarkdownSection(markdown: string, headingName: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  let start = -1, level = 0
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (match && match[2].trim().toLowerCase() === headingName.toLowerCase()) { start = index + 1; level = match[1].length; break }
  }
  if (start < 0) return undefined
  const sectionLines: string[] = []
  for (let index = start; index < lines.length; index += 1) { const match = lines[index].match(/^(#{1,6})\s+/); if (match && match[1].length <= level) break; sectionLines.push(lines[index]) }
  return sectionLines.join("\n").trim()
}

function removeMarkdownSection(markdown: string, headingName: string): string {
  const lines = markdown.split(/\r?\n/)
  let start = -1, level = 0, end = lines.length
  for (let index = 0; index < lines.length; index += 1) { const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/); if (match && match[2].trim().toLowerCase() === headingName.toLowerCase()) { start = index; level = match[1].length; break } }
  if (start < 0) return markdown
  for (let index = start + 1; index < lines.length; index += 1) { const match = lines[index].match(/^(#{1,6})\s+/); if (match && match[1].length <= level) { end = index; break } }
  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n")
}

function removeMarkdownStepSections(markdown: string): string {
  const lines = markdown.split(/\r?\n/)
  const kept: string[] = []
  for (let index = 0; index < lines.length;) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match || !parseStepHeading(match[2])) { kept.push(lines[index]); index += 1; continue }
    const level = match[1].length
    index += 1
    while (index < lines.length) { const nextHeading = lines[index].match(/^(#{1,6})\s+/); if (nextHeading && nextHeading[1].length <= level) break; index += 1 }
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n")
}

function parseStepHeading(headingText: string): string | undefined { return headingText.trim().match(/^Step(?::|\s+)\s*([A-Za-z0-9_.-]+)\s*$/i)?.[1] }
function parseTodoItemText(value: string, index = 1): WorkflowTodoItem { const raw = value.trim(); const withoutCheckbox = raw.replace(/^[-*]\s+\[[ xX]\]\s+/, ""); const idMatch = withoutCheckbox.match(/^([A-Za-z0-9_.-]+):\s+(.+)$/); return idMatch ? { id: idMatch[1], text: idMatch[2].trim(), raw } : { id: `todo-${index}`, text: withoutCheckbox, raw } }
function splitMarkdownFrontMatter(text: string): { frontMatter: string; body: string } | undefined { const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/); return match ? { frontMatter: match[1], body: match[2] } : undefined }

function parseYamlFrontMatter(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let listKey: string | undefined
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.replace(/\s+#.*$/, "").trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    if (listKey && /^-\s+/.test(trimmed)) {
      const current = Array.isArray(result[listKey]) ? result[listKey] as unknown[] : []
      current.push(parseScalar(trimmed.replace(/^-\s+/, "")))
      result[listKey] = current
      continue
    }
    listKey = undefined
    const match = trimmed.match(/^([A-Za-z0-9_.-]+):(?:\s*(.*))?$/)
    if (!match) continue
    if ((match[2] ?? "") === "") { result[match[1]] = []; listKey = match[1] } else result[match[1]] = parseScalar(match[2])
  }
  return result
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed)
  if (/^\[.*\]$/.test(trimmed)) {
    const content = trimmed.slice(1, -1).trim()
    return content.length === 0 ? [] : content.split(",").map((part) => parseScalar(part.trim()))
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1)
  return trimmed
}

function validateRequiredFrontMatter(fields: Record<string, unknown>): string[] { const errors: string[] = []; const name = getString(fields, "name"); if (!name) errors.push("missing required field 'name'."); if (name && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) errors.push("field 'name' must contain only letters, numbers, dot, underscore, or hyphen and must not start with punctuation."); if (!getString(fields, "description")) errors.push("missing required field 'description'."); return errors }
function getStepCompletion(fields: Record<string, unknown>, fallback: StepCompletionMode): StepCompletionMode { const value = getString(fields, "stepCompletion"); if (value === "auto" || value === "manual") return value; return typeof fields.autoCompleteSteps === "boolean" ? (fields.autoCompleteSteps ? "auto" : "manual") : fallback }
function getStepMessage(fields: Record<string, unknown>, fallback: StepMessageMode): StepMessageMode { const value = getString(fields, "stepMessage"); return value === "full" || value === "current" || value === "silent" || value === "step" ? value : fallback }
function getString(fields: Record<string, unknown>, key: string): string | undefined { const value = fields[key]; return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined }
function getBoolean(fields: Record<string, unknown>, key: string, fallback: boolean): boolean { return typeof fields[key] === "boolean" ? fields[key] as boolean : fallback }
function getNumber(fields: Record<string, unknown>, key: string, fallback: number): number { const value = fields[key]; if (typeof value === "number" && Number.isFinite(value)) return value; if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim()); return fallback }
function getList(fields: Record<string, unknown>, key: string, fallback: string[] = []): string[] { const value = fields[key]; if (Array.isArray(value)) return value.map(String).filter(Boolean); if (typeof value === "string" && value.trim()) return [value.trim()]; return fallback }
async function loadBobApi(): Promise<{ found: boolean; active: boolean; activationError: string; exportsValue: unknown }> { const ext = vscode.extensions.getExtension<unknown>(BOB_EXTENSION_ID); let exportsValue: unknown; let activationError = "none"; if (ext) { try { exportsValue = ext.isActive ? ext.exports : await ext.activate() } catch (error) { activationError = error instanceof Error ? error.message : String(error) } } return { found: Boolean(ext), active: Boolean(ext?.isActive), activationError, exportsValue } }
async function runAttempt(label: string, run: () => unknown): Promise<{ label: string; ok: boolean; message: string; value?: unknown }> { try { const value = await Promise.resolve(run()); return { label, ok: value !== false, message: describeReturn(value), value } } catch (error) { return { label, ok: false, message: error instanceof Error ? error.message : String(error) } } }
function asSource(value: unknown): BobSourceLike | undefined { return typeof value === "object" && value !== null ? value as BobSourceLike : undefined }
function formatAttempt(attempt: { label: string; ok: boolean; message: string }): string { return `- ${attempt.ok ? "ok" : "fail"}: ${attempt.label} -> ${attempt.message}` }
function describeReturn(value: unknown): string { if (value === undefined) return "undefined"; if (value === null) return "null"; if (typeof value === "object") return `object(${Object.keys(value as Record<string, unknown>).slice(0, 20).join(",")})`; return String(value) }
async function showMarkdownReport(title: string, summary: string, lines: string[]): Promise<void> { const report = [`# ${title}`, "", summary, "", ...lines].join("\n"); const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report }); await vscode.window.showTextDocument(doc, { preview: false }) }
