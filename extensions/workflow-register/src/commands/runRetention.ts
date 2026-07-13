import * as vscode from "vscode"
import type { WorkflowRunCleanupPlan, WorkflowRunRetentionPolicy } from "../core/retention/runRetention"
import { WorkflowRunRetentionService } from "../core/runtime/runRetentionService"
import { fallbackWorkspaceRootCandidates, findWorkflowRootCandidates } from "../core/workspaceRoots"
import { showMarkdownReport } from "../reports"

export async function inspectWorkflowRunStorage(input?: unknown): Promise<unknown> {
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "Workflow Run Storage")
  if (!root) return "No workflow workspace selected."
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const inspection = await service.inspect()
  const { summary, inventory } = inspection
  const lines = [
    `- workspace: ${root}`,
    `- runs: ${summary.runCount}`,
    `- total bytes: ${formatBytes(summary.totalBytes)}`,
    `- terminal: ${summary.terminalRunCount}`,
    `- recoverable: ${summary.recoverableRunCount}`,
    `- pinned: ${summary.pinnedRunCount}`,
    `- referenced sources: ${summary.referencedRunCount}`,
    `- read-only: ${summary.readOnlyRunCount}`,
    `- unknown: ${summary.unknownRunCount}`,
    `- blocked: ${summary.blockedRunCount}`,
    `- incomplete measurements: ${summary.measurementIncompleteRunCount}`,
    `- reference graph: ${summary.referenceGraphComplete ? "complete" : "incomplete"}`,
    "",
    "Runs:",
    ...inventory.map((item) => `- ${item.runId}: ${item.status}; inspection=${item.inspectionStatus}; ${formatBytes(item.bytes)}; measurement=${item.measurementComplete ? "complete" : "incomplete"}; updated=${item.updatedAt}; pinned=${item.pinned ? "yes" : "no"}; referencedBy=${item.referencedBy.join(",") || "none"}; lock=${item.lockPresent ? "yes" : "no"}; journal=${item.journalPending ? "yes" : "no"}`)
  ]
  await showMarkdownReport("Workflow Run Storage", `${summary.runCount} run(s); ${formatBytes(summary.totalBytes)}.`, lines)
  return summary
}

export async function previewWorkflowRunCleanup(input?: unknown): Promise<WorkflowRunCleanupPlan | string> {
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "Preview Workflow Run Cleanup")
  if (!root) return "No workflow workspace selected."
  const plan = await new WorkflowRunRetentionService({ workspaceRoot: root }).preview(defaultPolicy())
  await showCleanupPreview(root, plan)
  return plan
}

export async function cleanupCompletedWorkflowRuns(input?: unknown): Promise<unknown> {
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "Apply Workflow Run Cleanup")
  if (!root) return "No workflow workspace selected."
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  return confirmAndApply(root, service, await service.preview(defaultPolicy()))
}

export async function deleteSelectedWorkflowRuns(input?: unknown): Promise<unknown> {
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "Delete Selected Workflow Runs")
  if (!root) return "No workflow workspace selected."
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const inventory = await service.inventory()
  const picked = await vscode.window.showQuickPick(inventory.map((item) => ({
    label: item.runId,
    description: item.status,
    detail: `${formatBytes(item.bytes)} / updated=${item.updatedAt}${item.pinned ? " / pinned" : ""}${item.referencedBy.length > 0 ? ` / referenced by ${item.referencedBy.join(", ")}` : ""}`,
    runId: item.runId
  })), {
    title: "Select workflow runs for cleanup preview",
    placeHolder: "Protected runs may be selected but remain excluded by the planner.",
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true
  })
  if (!picked || picked.length === 0) return "No workflow runs selected."
  const plan = await service.preview({ selectedRunIds: picked.map((item) => item.runId) })
  return confirmAndApply(root, service, plan)
}

export async function pinWorkflowRun(input?: unknown): Promise<unknown> {
  return setWorkflowRunPinned(input, true)
}

export async function unpinWorkflowRun(input?: unknown): Promise<unknown> {
  return setWorkflowRunPinned(input, false)
}

async function setWorkflowRunPinned(input: unknown, pinned: boolean): Promise<unknown> {
  const parsed = parseRunTarget(input)
  const root = await selectWorkflowRoot(parsed.workspaceRoot, pinned ? "Pin Workflow Run" : "Unpin Workflow Run")
  if (!root) return "No workflow workspace selected."
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const inventory = await service.inventory()
  const runId = parsed.runId ?? (await vscode.window.showQuickPick(inventory.map((item) => ({
    label: item.runId,
    description: item.status,
    detail: `${formatBytes(item.bytes)}${item.pinned ? " / pinned" : ""}`,
    runId: item.runId
  })), { title: pinned ? "Pin Workflow Run" : "Unpin Workflow Run" }))?.runId
  if (!runId) return "No workflow run selected."
  const note = pinned ? await vscode.window.showInputBox({
    title: "Pin note (optional)",
    prompt: "Why should this run be retained?",
    validateInput: validateNote
  }) : undefined
  if (pinned && note === undefined) return "Workflow run pin was cancelled."
  await service.setPinned(runId, pinned, note || undefined)
  await vscode.window.showInformationMessage(`Workflow run ${pinned ? "pinned" : "unpinned"}: ${runId}`)
  return { runId, pinned }
}

async function confirmAndApply(root: string, service: WorkflowRunRetentionService, plan: WorkflowRunCleanupPlan): Promise<unknown> {
  await showCleanupPreview(root, plan)
  if (plan.candidateRunIds.length === 0) {
    await vscode.window.showInformationMessage("Workflow run cleanup: no eligible runs.")
    return plan
  }
  const label = "削除"
  const accepted = await vscode.window.showWarningMessage(
    `Delete ${plan.candidateRunIds.length} workflow run(s) and reclaim ${formatBytes(plan.reclaimBytes)}? Active, recoverable, referenced, pinned, read-only, locked, journaled and unsafe runs are excluded.`,
    { modal: true },
    label
  )
  if (accepted !== label) return "Workflow run cleanup cancelled."
  const result = await service.apply(plan)
  await vscode.window.showInformationMessage(`Workflow run cleanup removed ${result.removedRunIds.length} run(s); reclaimed ${formatBytes(result.reclaimedBytes)}.`)
  return result
}

async function showCleanupPreview(root: string, plan: WorkflowRunCleanupPlan): Promise<void> {
  const lines = [
    `- workspace: ${root}`,
    `- created: ${plan.createdAt}`,
    `- candidates: ${plan.candidateRunIds.length}`,
    `- total bytes: ${formatBytes(plan.totalBytes)}`,
    `- reclaim bytes: ${formatBytes(plan.reclaimBytes)}`,
    `- digest: ${plan.digest}`,
    "",
    "Decisions:",
    ...plan.decisions.map((item) => `- ${item.runId}: ${item.action}; status=${item.status}; bytes=${formatBytes(item.bytes)}; reasons=${item.reasons.join(",") || "none"}; blockers=${item.blockers.join(",") || "none"}`)
  ]
  await showMarkdownReport("Workflow Run Cleanup Preview", `${plan.candidateRunIds.length} eligible run(s); reclaim ${formatBytes(plan.reclaimBytes)}.`, lines)
}

function defaultPolicy(): Omit<WorkflowRunRetentionPolicy, "now"> {
  const config = vscode.workspace.getConfiguration("workflowRegister.runs.retention")
  return {
    completedDays: nonNegative(config.get<number>("completedDays", 30), 30),
    maxCompletedRuns: nonNegativeInteger(config.get<number>("maxCompletedRuns", 100), 100),
    maxTotalBytes: nonNegativeInteger(config.get<number>("maxTotalBytes", 524_288_000), 524_288_000)
  }
}

async function selectWorkflowRoot(requested: string | undefined, title: string): Promise<string | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return undefined
  const markerRoots = await findWorkflowRootCandidates(folders)
  const candidates = markerRoots.length > 0 ? markerRoots : fallbackWorkspaceRootCandidates(folders)
  if (requested) return candidates.find((candidate) => candidate.root === requested)?.root
  if (candidates.length === 1) return candidates[0].root
  return (await vscode.window.showQuickPick(candidates.map((candidate) => ({
    label: candidate.name,
    description: candidate.root,
    root: candidate.root
  })), { title }))?.root
}

function parseRunTarget(value: unknown): { runId?: string; workspaceRoot?: string } {
  if (typeof value === "string") return { runId: value }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  return {
    runId: typeof record.runId === "string" ? record.runId : undefined,
    workspaceRoot: typeof record.workspaceRoot === "string" ? record.workspaceRoot : undefined
  }
}

function workspaceRootFromInput(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const root = (value as Record<string, unknown>).workspaceRoot
  return typeof root === "string" ? root : undefined
}

function validateNote(value: string): string | undefined {
  if (value.length > 256) return "Pin note must be at most 256 characters."
  if (/[\u0000-\u001f\u007f]/.test(value)) return "Pin note cannot contain control characters."
  return undefined
}

function nonNegative(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback
}

function nonNegativeInteger(value: number, fallback: number): number {
  return Number.isInteger(value) && value >= 0 ? value : fallback
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GiB`
}
