import {
  DEFAULT_MAX_RESULT_BYTES
} from "./bobWorkflowTypes"
import type {
  WorkflowDefinition,
  WorkflowStateEntry,
  WorkflowStepCommandResult,
  WorkflowStepDefinition,
  WorkflowTodoItem
} from "./bobWorkflowTypes"
import { appendWorkflowContext } from "./workflowPromptContext"

export interface WorkflowControlBlockInput {
  runId: string
  stepId?: string
  status?: string
  currentStep?: string
  includeResume?: boolean
}

export function buildWorkflowControlBlock(input: WorkflowControlBlockInput): string {
  const encodedRunId = encodeURIComponent(JSON.stringify([input.runId]))
  const commandLink = (label: string, command: string) => `[${label}](command:${command}?${encodedRunId}) \`${command}\``
  const lines = [
    "Workflow controls:",
    `<workflow_controls runId="${escapeXmlAttribute(input.runId)}"${input.stepId ? ` stepId="${escapeXmlAttribute(input.stepId)}"` : ""}${input.status ? ` status="${escapeXmlAttribute(input.status)}"` : ""}>`,
    `- ${commandLink("Pause after current step", "workflowRegister.pauseAfterCurrentStep")}`,
    `- ${commandLink("Pause before next AI call", "workflowRegister.pauseBeforeNextAiCall")}`,
    `- ${commandLink("Inspect run control", "workflowRegister.inspectRunControl")}`,
    `- ${commandLink("Inspect current step", "workflowRegister.inspectCurrentStep")}`,
    `- ${commandLink("Open current step in Builder", "workflowRegister.openCurrentStepInBuilder")}`
  ]
  if (input.includeResume) lines.push(`- ${commandLink("Resume paused run", "workflowRegister.resumePausedRun")}`)
  lines.push(
    "</workflow_controls>",
    "",
    "Note: pause is graceful. If an AI response or command is already running, it stops after that response/command completes and before the next workflow step starts."
  )
  return lines.join("\n")
}

export function buildStepMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  stepDefinition?: WorkflowStepDefinition,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string | undefined {
  if (index === 0 && !usesEngineStepUi(definition)) {
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

export function buildWorkflowStartMessage(
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
  if (definition.todoEnabled && !usesEngineStepUi(definition)) {
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
    `<workflow_todo index="${index + 1}" id="${todo.id}">`,
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

export function buildCommandResultMessage(
  definition: WorkflowDefinition,
  todo: WorkflowTodoItem,
  index: number,
  commandResult?: WorkflowStepCommandResult,
  stateEntries: WorkflowStateEntry[] = []
): string | undefined {
  const lines = [
    "Workflow step command result:",
    `<workflow_todo index="${index + 1}" id="${todo.id}">`,
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
    `<workflow_step index="${index + 1}" id="${todo.id}">`,
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
    `<workflow_todo index="${index + 1}" id="${todo.id}">`,
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
  lines.push(
    "",
    "Workflow state available to this step:",
    "<workflow_state>",
    ...stateEntries.map((entry) => `- ${entry.key}: ${entry.value}`),
    "</workflow_state>"
  )
}

export function shouldIncludeCommandResult(stepDefinition: WorkflowStepDefinition | undefined, result: WorkflowStepCommandResult | undefined): boolean {
  if (!result) return false
  if (!stepDefinition?.sendResult) return false
  if (result.ok === false) return true
  if (result.value === undefined || result.value === null) return false
  return String(result.value).length > 0
}

function buildCommandResultBlock(result: WorkflowStepCommandResult, maxResultBytes = DEFAULT_MAX_RESULT_BYTES): string {
  const payload = result.ok
    ? { command: result.command, ok: true, value: truncate(String(result.value ?? ""), maxResultBytes) }
    : { command: result.command, ok: false, error: result.error }
  return [
    "<workflow_command_result>",
    JSON.stringify(payload, null, 2),
    "</workflow_command_result>"
  ].join("\n")
}

function truncate(value: string, maxBytes: number): string {
  if (value.length <= maxBytes) return value
  return `${value.slice(0, Math.max(0, maxBytes - 32))}\n... [truncated]`
}

function usesEngineStepUi(definition: WorkflowDefinition): boolean {
  return definition.stepExecution.showInBob !== false && definition.stepExecution.mode === "engineSteps"
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
