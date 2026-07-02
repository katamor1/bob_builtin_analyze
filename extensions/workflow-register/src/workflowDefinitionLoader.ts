import { createHash } from "crypto"
import * as path from "path"
import * as vscode from "vscode"
import {
  DEFAULT_MAX_RESULT_BYTES
} from "./bobWorkflowTypes"
import type {
  LoadResult,
  WorkflowDefinition,
  WorkflowStepDefinition
} from "./bobWorkflowTypes"
import type {
  CoreWorkflowDefinition,
  EngineStep,
  ResultSinkDefinition
} from "./core/model"
import { parseWorkflowMarkdown } from "./core/parser"
import {
  fallbackWorkspaceRootCandidates,
  findWorkflowRootCandidates,
  relativePathFromRoot
} from "./core/workspaceRoots"
import type { MarkerRootCandidate } from "./core/workspaceRoots"
import { resultSourceForStep } from "./resultHandoff"

export async function loadWorkspaceWorkflows(sourceId: string): Promise<LoadResult> {
  const diagnostics: string[] = []
  const workflows: WorkflowDefinition[] = []
  const coreWorkflows: CoreWorkflowDefinition[] = []
  const folders = vscode.workspace.workspaceFolders ?? []
  const roots = await findWorkflowRootCandidates(folders)
  const searchRoots = roots.length > 0 ? roots : fallbackWorkspaceRootCandidates(folders)
  for (const root of searchRoots) {
    const files = await vscode.workspace.findFiles(
      new vscode.RelativePattern(root.root, ".bob/workflows/*/WORKFLOW.md")
    )
    diagnostics.push(
      `- workspace: ${root.workspaceFolderName}; workflowRoot=${root.root}; marker=${root.marker}; depth=${root.depth}; workflow files: ${files.length}`
    )
    for (const file of files) {
      const result = await loadWorkflowFile(sourceId, file, root)
      diagnostics.push(...result.diagnostics)
      if (result.workflow) workflows.push(result.workflow)
      if (result.coreWorkflow) coreWorkflows.push(result.coreWorkflow)
    }
  }
  qualifyDuplicateWorkflowIds(workflows, coreWorkflows)
  return { workflows, coreWorkflows, diagnostics }
}

async function loadWorkflowFile(
  sourceId: string,
  file: vscode.Uri,
  root: MarkerRootCandidate
): Promise<{
  workflow?: WorkflowDefinition
  coreWorkflow?: CoreWorkflowDefinition
  diagnostics: string[]
}> {
  const relativePath = relativePathFromRoot(root.root, file.fsPath)
  const diagnostics: string[] = []
  const folderName = path.basename(path.dirname(file.fsPath))
  const text = Buffer.from(await vscode.workspace.fs.readFile(file))
    .toString("utf8")
    .replace(/^\uFEFF/, "")
  const parsed = parseWorkflowMarkdown({ sourceId, filePath: relativePath, text })
  diagnostics.push(...parsed.diagnostics)
  if (!parsed.ok) return { diagnostics }
  const coreWorkflow = {
    ...parsed.workflow,
    logicalWorkflowId: parsed.workflow.id,
    workflowRoot: root.root,
    workflowFile: file.fsPath,
    workflowFolderName: root.name
  }
  const workflow = adaptCoreWorkflowForBob(coreWorkflow, file)
  if (folderName !== parsed.workflow.name) {
    diagnostics.push(
      `- warn: ${relativePath}: folder name '${folderName}' differs from workflow name '${parsed.workflow.name}'.`
    )
  }
  if (workflow.todoRequired && workflow.todos.length === 0) {
    return {
      diagnostics: [`- fail: ${relativePath}: todoRequired is true but no todo items were found.`]
    }
  }
  if (workflow.stepMessage === "step") {
    for (const todo of workflow.todos) {
      if (!workflow.stepsById[todo.id]?.prompt) {
        diagnostics.push(`- warn: ${relativePath}: missing prompt for workflow step '${todo.id}'.`)
      }
    }
  }
  const stepCount = workflow.todoEnabled && workflow.todoAsSteps && workflow.todos.length > 0
    ? workflow.todos.length
    : 1
  const stepPromptCount = Object.values(workflow.stepsById)
    .filter((step) => step.prompt.length > 0)
    .length
  const stepCommandCount = Object.values(workflow.stepsById)
    .filter((step) => step.command)
    .length
  const agentStepCount = Object.values(workflow.stepsById)
    .filter((step) => step.runAgent)
    .length
  const stateKeyCount = Object.values(workflow.stepsById)
    .filter((step) => step.resultKey)
    .length
  const includeStateCount = Object.values(workflow.stepsById)
    .filter((step) => step.includeState.length > 0)
    .length
  const captureResultCount = Object.values(workflow.stepsById)
    .filter((step) => step.captureResult)
    .length
  diagnostics.push([
    `- ok: ${relativePath}: ${workflow.id}`,
    `todos=${workflow.todos.length}`,
    `todo=${workflow.todoEnabled}`,
    `steps=${stepCount}`,
    `stepCompletion=${workflow.stepCompletion}`,
    `stepMessage=${workflow.stepMessage}`,
    `stepPrompts=${stepPromptCount}`,
    `stepCommands=${stepCommandCount}`,
    `agentSteps=${agentStepCount}`,
    `stateKeys=${stateKeyCount}`,
    `includeState=${includeStateCount}`,
    `captureResults=${captureResultCount}`
  ].join("; "))
  for (const step of Object.values(workflow.stepsById).filter((candidate) => candidate.command)) {
    diagnostics.push(
      `- step command: ${step.id} -> ${step.command}; sendResult=${step.sendResult}; required=${step.required}; completeOnSuccess=${step.completeOnSuccess}`
    )
  }
  for (const step of Object.values(workflow.stepsById).filter((candidate) => candidate.runAgent)) {
    diagnostics.push(
      `- agent step: ${step.id}; resultKey=${step.resultKey ?? "none"}; maxResultBytes=${step.maxResultBytes}`
    )
  }
  for (const step of Object.values(workflow.stepsById).filter(
    (candidate) => candidate.resultKey || candidate.includeState.length > 0
  )) {
    const savePart = step.resultKey ? `resultKey=${step.resultKey}` : "resultKey=none"
    const includePart = step.includeState.length > 0
      ? `includeState=${step.includeState.join(",")}`
      : "includeState=none"
    diagnostics.push(
      `- step state: ${step.id}; ${savePart}; ${includePart}; stateRequired=${step.stateRequired}; maxResultBytes=${step.maxResultBytes}`
    )
  }
  for (const step of Object.values(workflow.stepsById).filter((candidate) => candidate.captureResult)) {
    diagnostics.push(
      `- step capture: ${step.id}; resultSource=${resultSourceForStep(step)}; resultCommand=${step.resultCommand ?? "none"}`
    )
  }
  return { workflow, coreWorkflow, diagnostics }
}

function adaptCoreWorkflowForBob(core: CoreWorkflowDefinition, file: vscode.Uri): WorkflowDefinition {
  const todos = core.todos.map((todo, index) => ({
    id: todo.id,
    text: todo.title,
    raw: todo.raw ?? `${todo.id}: ${todo.title || `Step ${index + 1}`}`
  }))
  return {
    id: core.id,
    logicalWorkflowId: core.logicalWorkflowId ?? core.id,
    name: core.name,
    label: core.label,
    menuLabel: core.menuLabel ?? core.label,
    description: core.description,
    prompt: core.prompt,
    promptWithoutTodo: core.promptWithoutTodo,
    command: core.command,
    commandArgs: core.commandArgs,
    mode: core.mode,
    permissions: [...core.permissions],
    autoApprovalEnabled: core.autoApprovalEnabled,
    workspaceRequired: core.workspaceRequired,
    hidden: core.hidden,
    todoEnabled: core.todoEnabled,
    todoRequired: core.todoRequired,
    todoSource: "core",
    todoAsSteps: core.todoAsSteps,
    stepCompletion: core.stepCompletion,
    stepMessage: core.stepMessage,
    stepsById: Object.fromEntries(
      core.engineSteps.map((step) => [step.id, workflowStepDefinitionFromEngineStep(step)])
    ),
    todos,
    inputs: core.inputs,
    guardrails: core.guardrails,
    workflowRoot: core.workflowRoot,
    workflowFile: core.workflowFile,
    workflowFolderName: core.workflowFolderName,
    file,
    core
  }
}

function qualifyDuplicateWorkflowIds(
  workflows: WorkflowDefinition[],
  coreWorkflows: CoreWorkflowDefinition[]
): void {
  const counts = new Map<string, number>()
  for (const workflow of coreWorkflows) counts.set(workflow.id, (counts.get(workflow.id) ?? 0) + 1)
  for (const workflow of coreWorkflows) {
    const logicalId = workflow.logicalWorkflowId ?? workflow.id
    workflow.logicalWorkflowId = logicalId
    if ((counts.get(logicalId) ?? 0) > 1) {
      workflow.id = qualifiedWorkflowId(logicalId, workflow.workflowRoot)
    }
  }
  for (const workflow of workflows) {
    const logicalId = workflow.logicalWorkflowId ?? workflow.id
    workflow.logicalWorkflowId = logicalId
    if ((counts.get(logicalId) ?? 0) > 1) {
      workflow.id = qualifiedWorkflowId(logicalId, workflow.workflowRoot)
    }
  }
}

function qualifiedWorkflowId(logicalId: string, workflowRoot: string | undefined): string {
  const root = workflowRoot ?? "unknown"
  const slug = path.basename(root).replace(/[^A-Za-z0-9_-]+/g, "-") || "workspace"
  const hash = createHash("sha1").update(root).digest("hex").slice(0, 8)
  return `${logicalId}.${slug}-${hash}`
}

function workflowStepDefinitionFromEngineStep(step: EngineStep): WorkflowStepDefinition {
  const commandSink = commandResultSink(step)
  return {
    id: step.id,
    prompt: step.prompt?.trim() ?? "",
    command: step.type === "command" ? step.action.provider : undefined,
    commandArgs: step.type === "command" ? argumentList(step.action.args) : [],
    sendResult: step.sendResult ?? false,
    required: step.required !== false,
    completeOnSuccess: step.completeOnSuccess ?? false,
    runAgent: step.type === "agent",
    resultKey: "resultKey" in step ? step.resultKey : undefined,
    includeState: step.includeState ?? [],
    maxResultBytes: step.maxResultBytes ?? DEFAULT_MAX_RESULT_BYTES,
    stateRequired: step.stateRequired !== false,
    captureResult: Boolean(commandSink),
    resultSource: step.type === "agent" && step.result?.source === "agent" ? "agent" : undefined,
    resultCommand: commandSink?.command,
    resultCommandArgs: commandSink?.args ?? []
  }
}

function commandResultSink(step: EngineStep): Extract<ResultSinkDefinition, { type: "command" }> | undefined {
  const result = "result" in step ? step.result : undefined
  return result?.sinks.find(
    (sink): sink is Extract<ResultSinkDefinition, { type: "command" }> => sink.type === "command"
  )
}

function argumentList(value: unknown): unknown[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}
