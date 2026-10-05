import * as vscode from "vscode"
import type { LoadResult, WorkflowDefinition } from "./bobWorkflowTypes"
import type { WorkflowContractV2Diagnostic } from "./core/contractV2/diagnostics"
import type { CoreWorkflowDefinition } from "./core/model"
import {
  compileWorkflowDocument,
  formatWorkflowDiagnostics
} from "./core/workflowCompiler"
import {
  adaptCoreWorkflowForBob,
  qualifyDuplicateWorkflowIds
} from "./workflowAdapter"
import { LEGACY_BOB_TASK_BINDING } from "./workflowBobTaskBinding"
import type { WorkflowContractV2Entrypoint } from "./workflowContractV2Entrypoint"
import { adaptCompiledWorkflowForProduct, freezeWorkflowContractV2View } from "./workflowContractV2View"
import {
  discoverWorkspaceWorkflowFiles,
  type WorkflowFileCandidate,
  type WorkflowPackageSlotCandidate
} from "./workflowDiscovery"
import { validateAndDescribeWorkflow } from "./workflowDiagnostics"

export async function loadWorkspaceWorkflows(
  sourceId: string,
  contractV2?: WorkflowContractV2Entrypoint
): Promise<LoadResult & { contractV2SlotCount: number }> {
  const diagnostics: string[] = []
  const workflows: WorkflowDefinition[] = []
  const coreWorkflows: CoreWorkflowDefinition[] = []
  const discovered = await discoverWorkspaceWorkflowFiles()
  diagnostics.push(...discovered.diagnostics)

  const v2Slots = new Set(discovered.packages.map((candidate) => slotKey(candidate)))
  if (contractV2 !== undefined) {
    for (const candidate of discovered.packages) {
      try {
        const result = await loadWorkflowPackage(contractV2, candidate)
        diagnostics.push(...result.diagnostics)
        if (result.workflow) workflows.push(result.workflow)
        if (result.coreWorkflow) coreWorkflows.push(result.coreWorkflow)
      } catch {
        diagnostics.push("- error: [WF2_PACKAGE_LAYOUT_INVALID] " + candidate.relativePath + ": Contract v2 slot could not be validated.")
      }
    }
  }

  if (contractV2 === undefined && discovered.packages.length) diagnostics.push("- WF2_PACKAGE_LAYOUT_INVALID: Contract v2 gateway is unavailable.")

  for (const candidate of discovered.files) {
    if (v2Slots.has(slotKey(candidate))) {
      diagnostics.push(`- skipped legacy WORKFLOW.md because Contract v2 current.json owns slot: ${candidate.relativePath}`)
      continue
    }
    const result = await loadWorkflowFile(sourceId, candidate)
    diagnostics.push(...result.diagnostics)
    if (result.workflow) workflows.push(result.workflow)
    if (result.coreWorkflow) coreWorkflows.push(result.coreWorkflow)
  }
  qualifyDuplicateWorkflowIds(workflows, coreWorkflows)
  for (const workflow of workflows) freezeWorkflowContractV2View(workflow)
  return { workflows, coreWorkflows, diagnostics, contractV2SlotCount: discovered.packages.length }
}

async function loadWorkflowPackage(
  entrypoint: WorkflowContractV2Entrypoint,
  candidate: WorkflowPackageSlotCandidate
): Promise<{
  workflow?: WorkflowDefinition
  coreWorkflow?: CoreWorkflowDefinition
  diagnostics: string[]
}> {
  const slot = Object.freeze({
    collectionId: candidate.collectionId,
    collectionRoot: candidate.collectionRoot,
    workflowId: candidate.workflowId
  })
  const result = await entrypoint.compileCurrent({
    slot,
    consumer: "workspace-registration"
  })
  if (!result.ok) {
    return { diagnostics: formatContractV2Diagnostics(result.diagnostics) }
  }
  const adapted = adaptCompiledWorkflowForProduct({
    handle: result.handle,
    rawPackage: result.rawPackage,
    slot,
    root: candidate.root,
    currentPointer: candidate.currentPointer
  })
  return {
    workflow: adapted.workflow,
    coreWorkflow: adapted.coreWorkflow,
    diagnostics: [
      `- Contract v2 compiled: ${candidate.relativePath}`,
      `- planDigest: ${result.handle.planDigest}`,
      `- packageDigest: ${result.handle.plan.packageDigest}`
    ]
  }
}

async function loadWorkflowFile(
  sourceId: string,
  candidate: WorkflowFileCandidate
): Promise<{
  workflow?: WorkflowDefinition
  coreWorkflow?: CoreWorkflowDefinition
  diagnostics: string[]
}> {
  const diagnostics: string[] = []
  const text = Buffer.from(await vscode.workspace.fs.readFile(candidate.file))
    .toString("utf8")
  const compiled = compileWorkflowDocument({ sourceId, filePath: candidate.relativePath, text, strict: true })
  diagnostics.push(...formatWorkflowDiagnostics(compiled))
  if (!compiled.ok || !compiled.workflow) return { diagnostics }
  const coreWorkflow: CoreWorkflowDefinition = {
    ...compiled.workflow,
    logicalWorkflowId: compiled.workflow.id,
    workflowRoot: candidate.root.root,
    workflowFile: candidate.file.fsPath,
    workflowFolderName: candidate.root.name
  }
  const workflow = adaptCoreWorkflowForBob(
    coreWorkflow,
    candidate.file,
    LEGACY_BOB_TASK_BINDING
  )
  const workflowDiagnostics = validateAndDescribeWorkflow({
    relativePath: candidate.relativePath,
    folderName: candidate.folderName,
    parsedWorkflowName: compiled.workflow.name,
    workflow
  })
  diagnostics.push(...workflowDiagnostics.diagnostics)
  if (!workflowDiagnostics.ok) return { diagnostics }
  return { workflow, coreWorkflow, diagnostics }
}

function formatContractV2Diagnostics(
  diagnostics: readonly WorkflowContractV2Diagnostic[]
): string[] {
  return diagnostics.map((diagnostic) => {
    const pointer = diagnostic.location.pointer || ""
    return `- ${diagnostic.severity}: [${diagnostic.code}] ${diagnostic.location.path}${pointer}: ${diagnostic.message}`
  })
}

function slotKey(candidate: WorkflowFileCandidate | WorkflowPackageSlotCandidate): string {
  return `${candidate.root.root}\u0000${candidate.folderName}`
}
