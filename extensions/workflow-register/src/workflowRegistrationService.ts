import { createHash } from "crypto"
import * as vscode from "vscode"
import { loadBobApi } from "./bobApi"
import type { BobSourceLike } from "./bobApi"
import { AUDITED_BOB_PROFILE_DIGEST, BOB_SUPPORTED_VERSION_RANGE } from "./workflowBobTaskBinding"
import type { WorkflowContractV2Entrypoint } from "./workflowContractV2Entrypoint"
import { workflowContractV2Binding } from "./workflowContractV2View"
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
  legacyFingerprint?: string
}

export interface RegisterWorkflowsInput {
  previousSource?: BobSourceLike
  previousLegacyFingerprint?: string
  contractV2?: WorkflowContractV2Entrypoint
  createRunner: (workflow: WorkflowDefinition) => Parameters<typeof createBobWorkflow>[1]
}

export async function registerWorkflows(input: RegisterWorkflowsInput): Promise<WorkflowRegistrationUpdate> {
  const config = vscode.workspace.getConfiguration("workflowRegister")
  const sourceId = config.get<string>("sourceId", "workflow-register")
  const sourceName = config.get<string>("sourceName", "Workflow Register")
  const lines: string[] = []
  const loaded = await loadWorkspaceWorkflows(sourceId, input.contractV2)
  lines.push(...loaded.diagnostics)
  const coreWorkflows = loaded.coreWorkflows

  // Bob registration accepts only legacy executable definitions.
  loaded.workflows = loaded.workflows.filter(workflow => !workflowContractV2Binding(workflow))
  const executable = loaded.workflows
  const legacyFingerprint = createHash("sha256").update(JSON.stringify({ sourceId, sourceName,
    workflows: executable.map(workflow => [workflow.id, workflow.workflowFile, workflow.core.definitionHash]) })).digest("hex")
  if ((loaded.contractV2SlotCount > 0 && input.previousLegacyFingerprint === legacyFingerprint)
    || (executable.length === 0 && loaded.contractV2SlotCount > 0 && input.previousLegacyFingerprint === undefined)) {
    return { result: { summary: executable.length ? "V1の登録に変更はありません。Contract v2は検証のみ・実行不可です。" : "Contract v2は検証のみ・実行不可です。", lines }, coreWorkflows,
      sourceChanged: false, idsChanged: false, legacyFingerprint }
  }

  if (loaded.workflows.length === 0) {
    const validationFailed = loaded.diagnostics.some(line => /^- (?:error|fail):/.test(line))
    if (validationFailed) {
      lines.unshift("- Bob registration API was not called: no workflows passed strict validation.")
    }
    await deactivateRegisteredSource(input.previousSource, lines)
    await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", false)
    return {
      result: { summary: validationFailed
        ? "ワークフローは検証で除外されました。理由とファイル位置を診断で確認してください。"
        : "No .bob workflows were found.", lines },
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
  lines.push(`- Bob extension version: ${bob.extensionVersion ?? "unknown"}`)
  lines.push(`- Bob supported versions: ${BOB_SUPPORTED_VERSION_RANGE} (stable releases only)`)
  lines.push(`- Bob activation error: ${bob.activationError}`)
  lines.push(`- Bob compatibility baseline: bob/2.0.1; ${AUDITED_BOB_PROFILE_DIGEST}`)
  const api = bob.api
  if (!api) {
    lines.push("- fail: Compatible IBM Bob 2.x registerSource API is not available.")
    await deactivateRegisteredSource(input.previousSource, lines)
    await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", false)
    return {
      result: { summary: "Bob workflow registration API is unavailable or incompatible.", lines },
      coreWorkflows,
      registeredSource: undefined,
      registeredIds: new Set(),
      sourceChanged: true,
      idsChanged: true
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
    await vscode.commands.executeCommand("setContext", "bob-code.hasWorkflows", false)
    return {
      result: { summary: "Bob accepted the source request, but an audited source was not returned.", lines },
      coreWorkflows,
      registeredSource: undefined,
      registeredIds: new Set(),
      sourceChanged: true,
      idsChanged: true
    }
  }
  const auditedSource = source
  lines.push("- audited source capabilities: deactivate, log, registerWorkflow")

  let registeredCount = 0
  const registeredIds = new Set<string>()
  for (const workflow of executable) {
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
    legacyFingerprint: registeredCount === executable.length ? legacyFingerprint : undefined,
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
