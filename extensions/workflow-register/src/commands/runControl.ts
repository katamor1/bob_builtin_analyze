import * as vscode from "vscode"
import { FileRunControlStore, RunPauseMode } from "../core/runControlStore"
import { FileRunStateStore } from "../core/runStateStore"
import { fallbackWorkspaceRootCandidates, findWorkflowRootCandidates, MarkerRootCandidate } from "../core/workspaceRoots"
import { findRunSelection, listRunSelections, pickRunSelection, RunSelection } from "../workflowRunSelection"
import {
  assertOperationHubRunRevision,
  isOperationHubRunMutationTarget,
  OperationHubRunMutationTarget,
  validateOperationHubRunMutationTarget
} from "../operationHubMutationTarget"
import { prepareAutomaticPauseResume } from "./automaticPauseResumeUi"
import { buildRunControlReportLines } from "./runControlReport"
import { workflowRunStatusLabel } from "../ui/displayLabels"

interface RunControlCommandOptions {
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
}

type RunCommandArg = string | OperationHubRunMutationTarget | RunSelection | { runId?: string; run?: { runId?: string } } | undefined

export async function pauseCurrentRun(_options: RunControlCommandOptions, runArg?: RunCommandArg): Promise<unknown> {
  return requestPause(runArg, "afterCurrentStep", "manual")
}

export async function pauseAfterCurrentStep(_options: RunControlCommandOptions, runArg?: RunCommandArg): Promise<unknown> {
  return requestPause(runArg, "afterCurrentStep", "manual")
}

export async function pauseBeforeNextAiCall(_options: RunControlCommandOptions, runArg?: RunCommandArg): Promise<unknown> {
  return requestPause(runArg, "beforeNextAiCall", "manual-before-next-ai-call")
}

export async function resumePausedRun(_options: RunControlCommandOptions, runArg?: RunCommandArg): Promise<unknown> {
  const runId = resolveRunId(runArg)
  const roots = await workflowRootCandidates()
  const selection = isOperationHubRunMutationTarget(runArg)
    ? await validateStructuredRunSelection(runArg, roots)
    : runId
      ? await findRunSelection(runId, roots, createRunStore)
      : await pickRunSelection(roots, createRunStore)
  if (!selection) {
    const message = runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
    await vscode.window.showWarningMessage(message)
    return message
  }
  const run = selection.run ?? await createRunStore(selection.root).loadRun(selection.runId)
  if (!run) {
    const message = `実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`
    await vscode.window.showWarningMessage(message)
    return message
  }
  if (run.status !== "paused") {
    const message = `実行 ${run.runId} は一時停止中ではありません（状態: ${workflowRunStatusLabel(run.status)}）。実行の詳細を確認してください。`
    await vscode.window.showWarningMessage(message)
    return message
  }
  const prepared = await prepareAutomaticPauseResume({
    workspaceRoot: selection.root,
    run,
    expectedRevision: isOperationHubRunMutationTarget(runArg) ? runArg.expectedRevision : undefined
  })
  if (!prepared) return "一時停止した実行の再開を中止しました。"
  return vscode.commands.executeCommand(
    "workflowRegister.resumeRun",
    isOperationHubRunMutationTarget(runArg)
      ? { ...runArg, workspaceRoot: selection.root }
      : selection.runId
  )
}

export async function inspectRunControl(options: RunControlCommandOptions, runArg?: RunCommandArg): Promise<void> {
  const runId = resolveRunId(runArg)
  const roots = await workflowRootCandidates()
  const selections = await listRunSelections(roots, createRunStore)
  const selection = runId
    ? selections.find((item) => item.runId === runId)
    : await pickRunSelection(roots, createRunStore)
  if (!selection) {
    await vscode.window.showWarningMessage(runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。")
    return
  }
  const control = await createControlStore(selection.root).loadControl(selection.runId)
  const run = selection.run ?? await createRunStore(selection.root).loadRun(selection.runId)
  const lines = buildRunControlReportLines({
    runId: selection.runId,
    root: selection.root,
    run,
    control
  })
  await options.showMarkdownReport("ワークフロー実行制御", `${selection.runId}: ${run ? workflowRunStatusLabel(run.status) : "不明"}`, lines)
}

async function requestPause(runArg: RunCommandArg, mode: RunPauseMode, reason: string): Promise<unknown> {
  const runId = resolveRunId(runArg)
  const roots = await workflowRootCandidates()
  const selection = isOperationHubRunMutationTarget(runArg)
    ? await validateStructuredRunSelection(runArg, roots)
    : runId
      ? await findRunSelection(runId, roots, createRunStore)
      : await pickInterruptibleRun(roots)
  if (!selection) {
    const message = runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "一時停止する実行が選択されていません。実行一覧から対象を選択してください。"
    await vscode.window.showWarningMessage(message)
    return message
  }
  const run = selection.run ?? await createRunStore(selection.root).loadRun(selection.runId)
  if (!run) {
    const message = `実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`
    await vscode.window.showWarningMessage(message)
    return message
  }
  if (run.status === "completed" || run.status === "failed") {
    const message = `実行 ${run.runId} は状態が ${workflowRunStatusLabel(run.status)} のため一時停止できません。別の実行を選択してください。`
    await vscode.window.showWarningMessage(message)
    return message
  }
  if (isOperationHubRunMutationTarget(runArg)) {
    await assertOperationHubRunRevision(selection.root, selection.runId, runArg.expectedRevision)
  }
  const control = await createControlStore(selection.root).requestPause({
    runId: selection.runId,
    mode,
    reason,
    requestedBy: "user"
  })
  const message = run.status === "paused"
    ? `実行 ${selection.runId} は既に一時停止しています。`
    : `実行 ${selection.runId} の一時停止を予約しました。次の安全な区切りで停止します。`
  await vscode.window.showInformationMessage(message)
  return control
}

async function pickInterruptibleRun(roots: MarkerRootCandidate[]): Promise<RunSelection | undefined> {
  const selections = (await listRunSelections(roots, createRunStore))
    .filter((selection) => selection.run && selection.run.status !== "completed" && selection.run.status !== "failed")
  if (selections.length === 0) return undefined
  const picked = await vscode.window.showQuickPick(selections.map((selection) => ({
    label: selection.runId,
    description: selection.run ? workflowRunStatusLabel(selection.run.status) : undefined,
    detail: `${selection.run?.workflowId}; ワークスペース=${selection.root}; 現在のステップ=${selection.run?.currentStep ?? "なし"}`,
    selection
  })), { title: "実行を一時停止" })
  return picked?.selection
}

function resolveRunId(value: RunCommandArg): string | undefined {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  if (typeof value.runId === "string") return value.runId
  if ("run" in value && value.run && typeof value.run.runId === "string") return value.run.runId
  return undefined
}

function createRunStore(workspaceRoot: string): FileRunStateStore {
  return new FileRunStateStore({ workspaceRoot })
}

function createControlStore(workspaceRoot: string): FileRunControlStore {
  return new FileRunControlStore({ workspaceRoot })
}

async function validateStructuredRunSelection(
  target: OperationHubRunMutationTarget,
  roots: MarkerRootCandidate[]
): Promise<RunSelection> {
  const validated = await validateOperationHubRunMutationTarget(
    target,
    roots.map((candidate) => candidate.root)
  )
  return {
    root: validated.workspaceRoot,
    runId: target.runId,
    run: validated.snapshot.run
  }
}

async function workflowRootCandidates(): Promise<MarkerRootCandidate[]> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return []
  const markerRoots = await findWorkflowRootCandidates(folders)
  return markerRoots.length > 0 ? markerRoots : fallbackWorkspaceRootCandidates(folders)
}
