export type WorkflowTemplateKind = "simple-agent" | "command-then-agent"

export interface WorkflowScaffoldInput {
  name: string
  title: string
  description: string
  template: WorkflowTemplateKind
}

export const workflowTemplates = [
  { id: "simple-agent" as const, label: "Simple Agent Workflow", description: "One AI step with a prompt." },
  { id: "command-then-agent" as const, label: "Command then Agent Workflow", description: "One command step followed by one AI step." }
]

export function createWorkflowMarkdown(input: WorkflowScaffoldInput): string {
  const name = normalizeWorkflowName(input.name)
  return input.template === "command-then-agent"
    ? commandThenAgentTemplate(name, input.title, input.description)
    : simpleAgentTemplate(name, input.title, input.description)
}

export function normalizeWorkflowName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "-").replace(/-+/g, "-").replace(/^[._-]+/, "")
  return normalized || "new-workflow"
}

function quote(value: string): string {
  return JSON.stringify(value)
}

function simpleAgentTemplate(name: string, title: string, description: string): string {
  return `---
schemaVersion: workflow-register/v1
name: ${name}
description: ${quote(description)}
title: ${quote(title)}
mode: agent
workspaceRequired: true
steps:
  - id: analyze
    title: Analyze
    type: agent
    prompt: |
      ${description}

      Summarize the result clearly and list any follow-up actions.
---
# ${title}

## Goal

${description}
`
}

function commandThenAgentTemplate(name: string, title: string, description: string): string {
  return `---
schemaVersion: workflow-register/v1
name: ${name}
description: ${quote(description)}
title: ${quote(title)}
mode: agent
workspaceRequired: true
steps:
  - id: collect-context
    title: Collect context
    type: command
    action:
      provider: vscode.executeCommand
      args:
        - example.commandId
    resultKey: collectedContext
    required: true
  - id: analyze
    title: Analyze context
    type: agent
    includeState:
      - collectedContext
    prompt: |
      Analyze the collected context and produce a concise result.
---
# ${title}

## Goal

${description}

## Setup

Replace example.commandId with a real VS Code command before running this workflow.
`
}
