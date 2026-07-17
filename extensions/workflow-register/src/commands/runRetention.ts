import * as vscode from "vscode"
import type { WorkflowRunCleanupPlan, WorkflowRunRetentionPolicy } from "../core/retention/runRetention"
import { WorkflowRunRetentionService } from "../core/runtime/runRetentionService"
import { fallbackWorkspaceRootCandidates, findWorkflowRootCandidates } from "../core/workspaceRoots"
import { showMarkdownReport } from "../reports"
import { requireTrustedWorkspace } from "../workspaceTrust"

export async function inspectWorkflowRunStorage(input?: unknown): Promise<unknown> {
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "実行履歴の保存状況")
  if (!root) return "ワークフローのワークスペースが選択されていません。対象のフォルダーを開いてから再実行してください。"
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const inspection = await service.inspect()
  const { summary, inventory } = inspection
  const lines = [
    `- ワークスペース: ${root}`,
    `- 実行履歴: ${summary.runCount}件`,
    `- 合計サイズ: ${formatBytes(summary.totalBytes)}`,
    `- 完了または失敗: ${summary.terminalRunCount}件`,
    `- 復旧可能: ${summary.recoverableRunCount}件`,
    `- 保護済み: ${summary.pinnedRunCount}件`,
    `- 他の実行から参照中: ${summary.referencedRunCount}件`,
    `- 読み取り専用: ${summary.readOnlyRunCount}件`,
    `- 状態不明: ${summary.unknownRunCount}件`,
    `- 整理対象外: ${summary.blockedRunCount}件`,
    `- サイズ測定未完了: ${summary.measurementIncompleteRunCount}件`,
    `- 参照関係: ${summary.referenceGraphComplete ? "確認済み" : "未確認あり"}`,
    "",
    "実行履歴:",
    ...inventory.map((item) => `- ${item.runId}: 状態=${item.status}; 確認=${item.inspectionStatus}; サイズ=${formatBytes(item.bytes)}; 測定=${item.measurementComplete ? "完了" : "未完了"}; 更新=${item.updatedAt}; 保護=${item.pinned ? "あり" : "なし"}; 参照元=${item.referencedBy.join(",") || "なし"}; ロック=${item.lockPresent ? "あり" : "なし"}; ジャーナル=${item.journalPending ? "あり" : "なし"}`)
  ]
  await showMarkdownReport("実行履歴の保存状況", `${summary.runCount}件、合計 ${formatBytes(summary.totalBytes)}。`, lines)
  return summary
}

export async function previewWorkflowRunCleanup(input?: unknown): Promise<WorkflowRunCleanupPlan | string> {
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "実行履歴の削除候補")
  if (!root) return "ワークフローのワークスペースが選択されていません。対象のフォルダーを開いてから再実行してください。"
  const plan = await new WorkflowRunRetentionService({ workspaceRoot: root }).preview(defaultPolicy())
  await showCleanupPreview(root, plan)
  return plan
}

export async function cleanupCompletedWorkflowRuns(input?: unknown): Promise<unknown> {
  const trustError = await requireTrustedWorkspace("完了済みの実行履歴を整理")
  if (trustError) return trustError
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "完了済み実行履歴の整理")
  if (!root) return "ワークフローのワークスペースが選択されていません。対象のフォルダーを開いてから再実行してください。"
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  return confirmAndApply(root, service, await service.preview(defaultPolicy()))
}

export async function deleteSelectedWorkflowRuns(input?: unknown): Promise<unknown> {
  const trustError = await requireTrustedWorkspace("選択した実行履歴を削除")
  if (trustError) return trustError
  const root = await selectWorkflowRoot(workspaceRootFromInput(input), "削除する実行履歴を選択")
  if (!root) return "ワークフローのワークスペースが選択されていません。対象のフォルダーを開いてから再実行してください。"
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const inventory = await service.inventory()
  const picked = await vscode.window.showQuickPick(inventory.map((item) => ({
    label: item.runId,
    description: `状態: ${item.status}`,
    detail: `${formatBytes(item.bytes)} / 更新=${item.updatedAt}${item.pinned ? " / 保護済み" : ""}${item.referencedBy.length > 0 ? ` / 参照元: ${item.referencedBy.join(", ")}` : ""}`,
    runId: item.runId
  })), {
    title: "実行履歴の削除候補",
    placeHolder: "保護中または参照中の実行を選んでも、削除対象からは自動的に除外されます。",
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true
  })
  if (!picked || picked.length === 0) return "実行履歴が選択されていません。削除候補から対象を選択してください。"
  const plan = await service.preview({ selectedRunIds: picked.map((item) => item.runId) })
  return confirmAndApply(root, service, plan)
}

export async function pinWorkflowRun(input?: unknown): Promise<unknown> {
  const trustError = await requireTrustedWorkspace("実行履歴を保護")
  if (trustError) return trustError
  return setWorkflowRunPinned(input, true)
}

export async function unpinWorkflowRun(input?: unknown): Promise<unknown> {
  const trustError = await requireTrustedWorkspace("実行履歴の保護を解除")
  if (trustError) return trustError
  return setWorkflowRunPinned(input, false)
}

async function setWorkflowRunPinned(input: unknown, pinned: boolean): Promise<unknown> {
  const parsed = parseRunTarget(input)
  const root = await selectWorkflowRoot(parsed.workspaceRoot, pinned ? "実行履歴を保護" : "実行履歴の保護を解除")
  if (!root) return "ワークフローのワークスペースが選択されていません。対象のフォルダーを開いてから再実行してください。"
  const service = new WorkflowRunRetentionService({ workspaceRoot: root })
  const inventory = await service.inventory()
  const runId = parsed.runId ?? (await vscode.window.showQuickPick(inventory.map((item) => ({
    label: item.runId,
    description: item.status,
    detail: `${formatBytes(item.bytes)}${item.pinned ? " / 保護済み" : ""}`,
    runId: item.runId
  })), { title: pinned ? "実行履歴を保護" : "実行履歴の保護を解除" }))?.runId
  if (!runId) return "実行履歴が選択されていません。対象の実行履歴を選択してください。"
  const note = pinned ? await vscode.window.showInputBox({
    title: "保護する理由（任意）",
    prompt: "この実行履歴を残す理由を入力してください。",
    validateInput: validateNote
  }) : undefined
  if (pinned && note === undefined) return "実行履歴の保護を中止しました。"
  await service.setPinned(runId, pinned, note || undefined)
  await vscode.window.showInformationMessage(`実行履歴 ${runId} の保護を${pinned ? "設定" : "解除"}しました。`)
  return { runId, pinned }
}

async function confirmAndApply(root: string, service: WorkflowRunRetentionService, plan: WorkflowRunCleanupPlan): Promise<unknown> {
  await showCleanupPreview(root, plan)
  if (plan.candidateRunIds.length === 0) {
    await vscode.window.showInformationMessage("削除できる実行履歴はありません。保護状態や参照関係を確認してください。")
    return plan
  }
  const label = "削除"
  const accepted = await vscode.window.showWarningMessage(
    `実行履歴 ${plan.candidateRunIds.length}件を削除し、${formatBytes(plan.reclaimBytes)}を解放します。実行中、復旧可能、参照中、保護済み、読み取り専用、ロック中、書き込み未完了、安全性未確認の実行は除外されています。`,
    { modal: true },
    label
  )
  if (accepted !== label) return "実行履歴の整理を中止しました。"
  const result = await service.apply(plan)
  await vscode.window.showInformationMessage(`実行履歴 ${result.removedRunIds.length}件を削除し、${formatBytes(result.reclaimedBytes)}を解放しました。`)
  return result
}

async function showCleanupPreview(root: string, plan: WorkflowRunCleanupPlan): Promise<void> {
  const lines = [
    `- ワークスペース: ${root}`,
    `- 作成日時: ${plan.createdAt}`,
    `- 削除候補: ${plan.candidateRunIds.length}件`,
    `- 合計サイズ: ${formatBytes(plan.totalBytes)}`,
    `- 解放予定: ${formatBytes(plan.reclaimBytes)}`,
    `- 計画ダイジェスト: ${plan.digest}`,
    "",
    "判定:",
    ...plan.decisions.map((item) => `- ${item.runId}: ${item.action}; 状態=${item.status}; サイズ=${formatBytes(item.bytes)}; 理由=${item.reasons.join(",") || "なし"}; 除外理由=${item.blockers.join(",") || "なし"}`)
  ]
  await showMarkdownReport("実行履歴の削除候補", `${plan.candidateRunIds.length}件を削除可能、${formatBytes(plan.reclaimBytes)}を解放予定。`, lines)
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
  if (value.length > 256) return "保護理由は256文字以内で入力してください。"
  if (/[\u0000-\u001f\u007f]/.test(value)) return "保護理由に制御文字は使用できません。"
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
