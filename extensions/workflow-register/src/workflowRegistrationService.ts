import * as vscode from "vscode"
import { loadBobApi } from "./bobApi"
import type { BobSourceLike } from "./bobApi"
import { BOB_2_0_1_PROFILE_DIGEST } from "./core/contractV2/bobProfile"
import { createBobWorkflow } from "./bobWorkflowFactory"
import type { WorkflowDefinition } from "./bobWorkflowTypes"
import type { CoreWorkflowDefinition } from "./core/model"
import { formatAttempt, runAttempt } from "./reports"
import { loadWorkspaceWorkflows } from "./workflowDefinitionLoader"

const BOB_EXTENSION_ID = "IBM.bob-code"

export interface RegistrationResult {
  summary: string
  lines: string[]
}

export interface WorkflowRegistrationUpdate {
  result: RegistrationResult
  coreWorkflows: CoreWorkflowDefinition[]
  registeredIds?: Set<string>
  registeredSource?: BobSourceLike
  sourceChanged: boolean
  idsChanged: boolean
}

export interface RegisterWorkflowsInput {
  previousSource?: BobSourceLike
  createRunner: (workflow: WorkflowDefinition) => Parameters<typeof createBobWorkflow>[1]
}

export async function registerWorkflows(input: RegisterWorkflowsInput): Promise<WorkflowRegistrationUpdate> {
  const config = vscode.workspace.getConfiguration("workflowRegister")
  const sourceId = config.get<string>("sourceId", "workflow-register")
  const sourceName = config.get<string>("sourceName", "Workflow Register")
  const lines: string[] = []
  const loaded = await loadWorkspaceWorkflows(sourceId)
  lines.push(...loaded.diagnostics)
  const coreWorkflows = loaded.coreWorkflows

  if (loaded.workflows.length === 0) {
    await deactivateRegisteredSource(input.previousSource, lines)
    await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", false)
    return {
      result: { summary: "No .bob workflows were found.", lines },
      coreWorkflows,
      registeredSource: undefined,
      registeredIds: new Set(),
      sourceChanged: true,
      idsChanged: true
    }
  }

  const bob = await loadBobApi(BOB_EXTENSION_ID)
  lines.push(`- Bob extension found: ${bob.found}`)
  lines.push(`- Bob extension active: ${bob.active}`)
  lines.push(`- Bob activation error: ${bob.activationError}`)
  lines.push(`- Bob audited profile: ${BOB_2_0_1_PROFILE_DIGEST}`)
  const api = bob.api
  if (!api) {
    lines.push("- fail: IBM Bob 2.0.1 audited registerSource API is not available.")
    return {
      result: { summary: "Bob workflow registration API is unavailable or incompatible.", lines },
      coreWorkflows,
      sourceChanged: false,
      idsChanged: false
    }
  }

  await deactivateRegisteredSource(input.previousSource, lines)
  let source: BobSourceLike | undefined
  const sourceResult = await runAttempt(
    "registerSource(sourceId, sourceName)",
    () => {
      source = api.registerSource(sourceId, sourceName)
      return source
    }
  )
  lines.push(formatAttempt(sourceResult))
  if (!source) {
    return {
      result: { summary: "Bob accepted the source request, but an audited source was not returned.", lines },
      coreWorkflows,
      registeredSource: undefined,
      sourceChanged: true,
      idsChanged: false
    }
  }
  const auditedSource = source
  lines.push("- audited source capabilities: deactivate, log, registerWorkflow")

  let registeredCount = 0
  const registeredIds = new Set<string>()
  for (const workflow of loaded.workflows) {
    const attempt = await runAttempt(
      `source.registerWorkflow(${workflow.id})`,
      () => auditedSource.registerWorkflow(createBobWorkflow(workflow, input.createRunner(workflow)))
    )
    lines.push(formatAttempt(attempt))
    if (attempt.ok) {
      registeredIds.add(workflow.id)
      registeredCount += 1
      auditedSource.log(`Workflow registered from ${workflow.file.fsPath}: ${workflow.id}`)
    }
  }
  await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", registeredIds.size > 0)
  return {
    result: { summary: `Registered ${registeredCount} workflow(s); ${registeredIds.size} workflow(s) are registered in this session.`, lines },
    coreWorkflows,
    registeredSource: auditedSource,
    registeredIds,
    sourceChanged: true,
    idsChanged: true
  }
}

export async function deactivateRegisteredSource(source: BobSourceLike | undefined, lines?: string[]): Promise<void> {
  if (!source) return
  const attempt = await runAttempt("previousSource.deactivate()", () => source.deactivate())
  lines?.push(formatAttempt(attempt))
}
