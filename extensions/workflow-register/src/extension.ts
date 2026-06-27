import * as path from "path"
import * as vscode from "vscode"

const BOB_EXTENSION_ID = "IBM.bob-code"
const WORKFLOW_GLOB = "**/.bob/workflows/*/WORKFLOW.md"

type StepCompletionMode = "auto" | "manual"

interface BobWorkflowApi {
  registerSource?: (id: string, name?: string) => unknown
}

interface BobWorkflowTask {
  sendMessage?: (...args: unknown[]) => Promise<unknown> | Thenable<unknown> | unknown
  setStepComplete?: () => unknown
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

export function activate(context: vscode.ExtensionContext): void {
  const service = new WorkflowRegisterService(context)
  context.subscriptions.push(service)
  context.subscriptions.push(
    vscode.commands.registerCommand("workflowRegister.reload", () => service.reload({ showReport: true })),
    vscode.commands.registerCommand("workflowRegister.inspect", () => service.inspect()),
    vscode.commands.registerCommand("workflowRegister.completeCurrentStep", () => service.completeCurrentStep()),
    vscode.commands.registerCommand("workflowRegister.inspectActiveSteps", () => service.inspectActiveSteps())
  )
  service.reload({ showReport: false }).catch((error) => console.warn("Bob workflow registration failed", error))
}

export function deactivate(): void {
  // Nothing to dispose beyond context subscriptions.
}

class StepRuntime {
  private readonly activeSteps = new Map<string, ActiveStep>()
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
        detail: `${step.workflowId} / ${step.stepId}`,
        step
      })),
      { placeHolder: "Select the Bob workflow step to complete" }
    )
    return picked?.step
  }
}

class WorkflowRegisterService implements vscode.Disposable {
  private readonly registeredIds = new Set<string>()
  private readonly watcher: vscode.FileSystemWatcher
  private readonly stepRuntime = new StepRuntime()
  private lastResult: RegistrationResult = { summary: "No workflow registration has run yet.", lines: [] }

  constructor(private readonly context: vscode.ExtensionContext) {
    this.watcher = vscode.workspace.createFileSystemWatcher(WORKFLOW_GLOB)
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
      : steps.map((step) => `- ${step.workflowLabel}: ${step.title} (${step.stepId})`)
    await showMarkdownReport("Active Bob Workflow Steps", `${steps.length} active step(s).`, lines)
  }

  async completeCurrentStep(): Promise<void> {
    const message = await this.stepRuntime.completeCurrentStep()
    await vscode.window.showInformationMessage(message)
  }

  async reload(options: { showReport: boolean }): Promise<void> {
    const result = await this.registerWorkflows()
    this.lastResult = result
    if (options.showReport) {
      await showMarkdownReport("Bob Workflow Register", result.summary, result.lines)
    }
  }

  private async registerWorkflows(): Promise<RegistrationResult> {
    const lines: string[] = []
    const config = vscode.workspace.getConfiguration("workflowRegister")
    const sourceId = config.get<string>("sourceId", "workflow-register")
    const sourceName = config.get<string>("sourceName", "Workflow Register")

    const loaded = await loadWorkspaceWorkflows(sourceId)
    lines.push(...loaded.diagnostics)

    if (loaded.workflows.length === 0) {
      return { summary: "No .bob workflows were found.", lines }
    }

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

    if (!source || typeof source.registerWorkflow !== "function") {
      return { summary: "Bob accepted the source request, but workflows cannot be registered.", lines }
    }

    let registeredCount = 0
    for (const workflow of loaded.workflows) {
      if (this.registeredIds.has(workflow.id)) {
        lines.push(`- skip: ${workflow.id} was already registered in this extension host session.`)
        continue
      }

      const bobWorkflow = createBobWorkflow(workflow, this.stepRuntime)
      const attempt = await runAttempt(`source.registerWorkflow(${workflow.id})`, () => source.registerWorkflow?.(bobWorkflow))
      lines.push(formatAttempt(attempt))
      if (attempt.ok) {
        this.registeredIds.add(workflow.id)
        registeredCount += 1
        source.log?.(`Workflow registered from ${workflow.file.fsPath}: ${workflow.id}`)
      }
    }

    if (registeredCount > 0 || this.registeredIds.size > 0) {
      await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", true)
    }

    return {
      summary: `Registered ${registeredCount} workflow(s); ${this.registeredIds.size} workflow(s) are registered in this session.`,
      lines
    }
  }
}

async function loadWorkspaceWorkflows(sourceId: string): Promise<LoadResult> {
  const diagnostics: string[] = []
  const workflows: WorkflowDefinition[] = []
  const folders = vscode.workspace.workspaceFolders ?? []

  for (const folder of folders) {
    const pattern = new vscode.RelativePattern(folder, ".bob/workflows/*/WORKFLOW.md")
    const files = await vscode.workspace.findFiles(pattern)
    diagnostics.push(`- workspace: ${folder.name}; workflow files: ${files.length}`)

    for (const file of files) {
      const result = await loadWorkflowFile(sourceId, file)
      diagnostics.push(...result.diagnostics)
      if (result.workflow) workflows.push(result.workflow)
    }
  }

  return { workflows, diagnostics }
}

async function loadWorkflowFile(
  sourceId: string,
  file: vscode.Uri
): Promise<{ workflow?: WorkflowDefinition; diagnostics: string[] }> {
  const diagnostics: string[] = []
  const relativePath = vscode.workspace.asRelativePath(file, false)
  const folderName = path.basename(path.dirname(file.fsPath))
  const bytes = await vscode.workspace.fs.readFile(file)
  const text = Buffer.from(bytes).toString("utf8").replace(/^\uFEFF/, "")
  const split = splitMarkdownFrontMatter(text)

  if (!split) {
    return { diagnostics: [`- fail: ${relativePath}: missing YAML front matter.`] }
  }

  const fields = parseYamlFrontMatter(split.frontMatter)
  const errors = validateRequiredFrontMatter(fields)
  if (errors.length > 0) {
    return { diagnostics: errors.map((error) => `- fail: ${relativePath}: ${error}`) }
  }

  const name = getString(fields, "name") ?? folderName
  const description = getString(fields, "description") ?? ""
  if (folderName !== name) {
    diagnostics.push(`- warn: ${relativePath}: folder name '${folderName}' differs from workflow name '${name}'.`)
  }

  const id = getString(fields, "id") ?? `${sourceId}.${name}`
  const label = getString(fields, "label") ?? getString(fields, "title") ?? name
  const menuLabel = getString(fields, "menuLabel") ?? label
  const mode = getString(fields, "mode") ?? "agent"
  const command = getString(fields, "command")
  const todoSource = getString(fields, "todoSource") ?? "markdown"
  const markdownTodos = todoSource === "markdown" ? extractMarkdownTodoItems(split.body) : []
  const yamlTodos = getList(fields, "todos").map(parseTodoItemText)
  const todos = markdownTodos.length > 0 ? markdownTodos : yamlTodos
  const todoEnabled = getBoolean(fields, "todo", todos.length > 0)
  const todoRequired = getBoolean(fields, "todoRequired", false)
  const todoAsSteps = getBoolean(fields, "todoAsSteps", todoEnabled && todos.length > 0)
  const stepCompletion = getStepCompletion(fields, todoAsSteps ? "manual" : "auto")
  const prompt = getString(fields, "prompt") ?? split.body.trim()
  const promptWithoutTodo = todoEnabled && todoSource === "markdown" ? removeMarkdownSection(prompt, "Todo").trim() : prompt

  if (todoRequired && todos.length === 0) {
    return { diagnostics: [`- fail: ${relativePath}: todoRequired is true but no todo items were found.`] }
  }

  const permissions = getList(fields, "permissions", todoEnabled ? ["read", "mcp", "skill", "todo"] : ["read", "mcp", "skill"])
  if (todoEnabled && !permissions.includes("todo")) {
    permissions.push("todo")
  }

  const workflow: WorkflowDefinition = {
    id,
    name,
    label,
    menuLabel,
    description,
    prompt,
    promptWithoutTodo,
    command,
    commandArgs: getList(fields, "commandArgs"),
    mode,
    permissions,
    autoApprovalEnabled: getBoolean(fields, "autoApproval", true),
    workspaceRequired: getBoolean(fields, "workspaceRequired", true),
    hidden: getBoolean(fields, "hidden", false),
    todoEnabled,
    todoRequired,
    todoSource,
    todoAsSteps,
    stepCompletion,
    todos,
    file
  }

  const stepCount = workflow.todoEnabled && workflow.todoAsSteps && workflow.todos.length > 0 ? workflow.todos.length : 1
  diagnostics.push(`- ok: ${relativePath}: ${workflow.id}; todos=${workflow.todos.length}; todo=${workflow.todoEnabled}; steps=${stepCount}; stepCompletion=${workflow.stepCompletion}`)
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
    getApprovalConfig: () => ({
      allowed_permissions: definition.permissions,
      autoApprovalEnabled: definition.autoApprovalEnabled
    })
  }
}

function buildWorkflowSteps(definition: WorkflowDefinition, stepRuntime: StepRuntime): BobWorkflowStep[] {
  if (definition.todoEnabled && definition.todoAsSteps && definition.todos.length > 0) {
    return definition.todos.map((todo, index) => ({
      id: todo.id,
      title: todo.text,
      execution: async (task) => {
        const message = index === 0 ? buildWorkflowStartMessage(definition) : buildWorkflowTodoStepMessage(definition, todo, index)
        await task.sendMessage?.(message, "user")
        if (index === 0 && definition.command) {
          await vscode.commands.executeCommand(definition.command, ...definition.commandArgs)
        }
        return completeOrHoldStep(task, definition, stepRuntime, todo.id, todo.text)
      }
    }))
  }

  return [
    {
      id: "runWorkflow",
      title: definition.label,
      execution: async (task) => {
        await task.sendMessage?.(buildWorkflowStartMessage(definition), "user")
        if (definition.command) {
          await vscode.commands.executeCommand(definition.command, ...definition.commandArgs)
        }
        return completeOrHoldStep(task, definition, stepRuntime, "runWorkflow", definition.label)
      }
    }
  ]
}

async function completeOrHoldStep(
  task: BobWorkflowTask,
  definition: WorkflowDefinition,
  stepRuntime: StepRuntime,
  stepId: string,
  stepTitle: string
): Promise<boolean> {
  if (definition.stepCompletion === "auto") {
    task.setStepComplete?.()
    return true
  }
  return stepRuntime.hold(definition, { id: stepId, title: stepTitle }, task)
}

function buildWorkflowStartMessage(definition: WorkflowDefinition): string {
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

  return lines.join("\n")
}

function buildWorkflowTodoStepMessage(definition: WorkflowDefinition, todo: WorkflowTodoItem, index: number): string {
  return [
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
  ].join("\n")
}

function extractMarkdownTodoItems(markdown: string): WorkflowTodoItem[] {
  const section = extractMarkdownSection(markdown, "Todo")
  if (!section) return []

  const todos: WorkflowTodoItem[] = []
  for (const line of section.split(/\r?\n/)) {
    const match = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.+)$/)
    if (!match) continue
    todos.push(parseTodoItemText(match[1], todos.length + 1))
  }
  return todos
}

function extractMarkdownSection(markdown: string, headingName: string): string | undefined {
  const lines = markdown.split(/\r?\n/)
  let start = -1
  let level = 0

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match) continue
    if (match[2].trim().toLowerCase() === headingName.toLowerCase()) {
      start = index + 1
      level = match[1].length
      break
    }
  }

  if (start < 0) return undefined

  const sectionLines: string[] = []
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= level) break
    sectionLines.push(lines[index])
  }
  return sectionLines.join("\n").trim()
}

function removeMarkdownSection(markdown: string, headingName: string): string {
  const lines = markdown.split(/\r?\n/)
  let start = -1
  let end = -1
  let level = 0

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!match) continue
    if (match[2].trim().toLowerCase() === headingName.toLowerCase()) {
      start = index
      level = match[1].length
      break
    }
  }

  if (start < 0) return markdown

  end = lines.length
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/)
    if (match && match[1].length <= level) {
      end = index
      break
    }
  }

  return [...lines.slice(0, start), ...lines.slice(end)].join("\n").replace(/\n{3,}/g, "\n\n")
}

function parseTodoItemText(value: string, index = 1): WorkflowTodoItem {
  const raw = value.trim()
  const withoutCheckbox = raw.replace(/^[-*]\s+\[[ xX]\]\s+/, "")
  const idMatch = withoutCheckbox.match(/^([A-Za-z0-9_.-]+):\s+(.+)$/)
  if (idMatch) {
    return { id: idMatch[1], text: idMatch[2].trim(), raw }
  }
  return { id: `todo-${index}`, text: withoutCheckbox, raw }
}

function splitMarkdownFrontMatter(text: string): { frontMatter: string; body: string } | undefined {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return undefined
  return { frontMatter: match[1], body: match[2] }
}

function parseYamlFrontMatter(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let listKey: string | undefined

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/\s+#.*$/, "")
    const trimmed = line.trim()
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

    const key = match[1]
    const value = match[2] ?? ""
    if (value === "") {
      result[key] = []
      listKey = key
    } else {
      result[key] = parseScalar(value)
    }
  }

  return result
}

function parseScalar(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === "true") return true
  if (trimmed === "false") return false
  if (/^\[.*\]$/.test(trimmed)) {
    const content = trimmed.slice(1, -1).trim()
    return content.length === 0 ? [] : content.split(",").map((part) => parseScalar(part.trim()))
  }
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function validateRequiredFrontMatter(fields: Record<string, unknown>): string[] {
  const errors: string[] = []
  const name = getString(fields, "name")
  const description = getString(fields, "description")

  if (!name) errors.push("missing required field 'name'.")
  if (name && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) {
    errors.push("field 'name' must contain only letters, numbers, dot, underscore, or hyphen and must not start with punctuation.")
  }
  if (!description) errors.push("missing required field 'description'.")

  return errors
}

function getStepCompletion(fields: Record<string, unknown>, fallback: StepCompletionMode): StepCompletionMode {
  const value = getString(fields, "stepCompletion")
  if (value === "auto" || value === "manual") return value

  const autoCompleteSteps = fields.autoCompleteSteps
  if (typeof autoCompleteSteps === "boolean") {
    return autoCompleteSteps ? "auto" : "manual"
  }

  return fallback
}

function getString(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key]
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined
}

function getBoolean(fields: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = fields[key]
  return typeof value === "boolean" ? value : fallback
}

function getList(fields: Record<string, unknown>, key: string, fallback: string[] = []): string[] {
  const value = fields[key]
  if (Array.isArray(value)) return value.map(String).filter((item) => item.length > 0)
  if (typeof value === "string" && value.trim().length > 0) return [value.trim()]
  return fallback
}

async function loadBobApi(): Promise<{ found: boolean; active: boolean; activationError: string; exportsValue: unknown }> {
  const ext = vscode.extensions.getExtension<unknown>(BOB_EXTENSION_ID)
  let exportsValue: unknown
  let activationError = "none"

  if (ext) {
    try {
      exportsValue = ext.isActive ? ext.exports : await ext.activate()
    } catch (error) {
      activationError = error instanceof Error ? error.message : String(error)
    }
  }

  return {
    found: Boolean(ext),
    active: Boolean(ext?.isActive),
    activationError,
    exportsValue
  }
}

async function runAttempt(label: string, run: () => unknown): Promise<{ label: string; ok: boolean; message: string; value?: unknown }> {
  try {
    const value = await Promise.resolve(run())
    return { label, ok: value !== false, message: describeReturn(value), value }
  } catch (error) {
    return { label, ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

function asSource(value: unknown): BobSourceLike | undefined {
  return typeof value === "object" && value !== null ? value as BobSourceLike : undefined
}

function formatAttempt(attempt: { label: string; ok: boolean; message: string }): string {
  return `- ${attempt.ok ? "ok" : "fail"}: ${attempt.label} -> ${attempt.message}`
}

function describeReturn(value: unknown): string {
  if (value === undefined) return "undefined"
  if (value === null) return "null"
  if (typeof value === "object") return `object(${Object.keys(value as Record<string, unknown>).slice(0, 20).join(",")})`
  return String(value)
}

async function showMarkdownReport(title: string, summary: string, lines: string[]): Promise<void> {
  const report = [`# ${title}`, "", summary, "", ...lines].join("\n")
  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}
