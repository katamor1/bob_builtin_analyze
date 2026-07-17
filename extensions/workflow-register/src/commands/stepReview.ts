import * as path from "path"
import * as vscode from "vscode"
import { editWorkflowInBuilder } from "./editWorkflowInBuilder"
import { bobTaskSyncRegistry } from "../bobTaskSync"
import { FileRunStateStore } from "../core/runStateStore"
import { RunStepState, WorkflowRunState } from "../core/model"
import { pendingReviewTransitionStepId } from "../core/engine/runState"
import { coordinateWorkflowRunExecution } from "../core/engine/runExecutionCoordinator"
import { fallbackWorkspaceRootCandidates, findWorkflowRootCandidates, MarkerRootCandidate } from "../core/workspaceRoots"
import { reviewTaskRegistry } from "../reviewTaskRegistry"
import type { BobWorkflowGateAcceptance, BobWorkflowGateAcceptResult } from "../bobWorkflowGateRegistry"
import { workflowRunStatusLabel, workflowStepStatusLabel } from "../ui/displayLabels"
import {
  assertOperationHubRunRevision,
  isOperationHubRunMutationTarget,
  OperationHubRunMutationTarget,
  readOperationHubRunSnapshot,
  validateOperationHubRunMutationTarget
} from "../operationHubMutationTarget"

interface StepReviewCommandOptions {
  showMarkdownReport: (title: string, summary: string, lines: string[]) => Promise<void>
  acceptBobWorkflowGate: (workspaceRoot: string, runId: string, stepId: string) => BobWorkflowGateAcceptResult
  acceptBobWorkflowGateWithMetadata?: (workspaceRoot: string, runId: string, stepId: string) => BobWorkflowGateAcceptance
  coordinateReviewAcceptance: <T>(workspaceRoot: string, runId: string, operation: () => Promise<T>) => Promise<T>
}

export interface StepReviewBuilderCommandOptions extends StepReviewCommandOptions {
  extensionUri: vscode.Uri
  sourceId: string
}

interface RunSelection {
  root: string
  runId: string
  run: WorkflowRunState
}

interface AcceptOptions {
  silent?: boolean
}

interface AcceptedStepResult {
  run: WorkflowRunState
  message: string
  completedViaBobTask: boolean
  continuationOwnedByBob: boolean
  workspaceRoot: string
  revision: string
}

type ReviewRunArg = string | OperationHubRunMutationTarget | undefined

const RUN_NEXT_STEP_LABEL = "次のステップを実行"
const OPEN_OPERATION_HUB_LABEL = "操作センターを開く"

export async function acceptCurrentStep(options: StepReviewCommandOptions, runArg?: ReviewRunArg, acceptOptions: AcceptOptions = {}): Promise<WorkflowRunState | string> {
  const accepted = await acceptReviewedStep(options, runArg)
  if (typeof accepted === "string") return accepted
  if (!acceptOptions.silent) {
    await showAcceptedStepMessage(
      accepted.run,
      accepted.message,
      accepted.completedViaBobTask,
      accepted.continuationOwnedByBob,
      accepted.workspaceRoot,
      accepted.revision
    )
  }
  return accepted.run
}

export async function acceptAndRunNextStep(options: StepReviewCommandOptions, runArg?: ReviewRunArg): Promise<unknown> {
  const accepted = await acceptReviewedStep(options, runArg)
  if (typeof accepted === "string") {
    await vscode.window.showWarningMessage(accepted)
    return accepted
  }
  if (accepted.run.status === "completed") {
    const message = `実行 ${accepted.run.runId} が完了しました。`
    await vscode.window.showInformationMessage(message)
    return accepted.run
  }
  if (accepted.continuationOwnedByBob) return accepted.run
  return vscode.commands.executeCommand("workflowRegister.runNextStep", operationHubTargetForAcceptedStep(accepted))
}

async function acceptReviewedStep(options: StepReviewCommandOptions, runArg?: ReviewRunArg): Promise<AcceptedStepResult | string> {
  const runId = typeof runArg === "string" ? runArg : runArg?.runId
  const selection = isOperationHubRunMutationTarget(runArg)
    ? await validateReviewRunTarget(runArg)
    : runId
      ? await findRunSelection(runId)
      : await pickRunSelection("確認待ちのステップを承認", (run) => run.status === "reviewing")
  if (!selection) return runId ? `実行 ${runId} が見つからないか、確認待ちではありません。実行状況を確認してください。` : "確認待ちの実行が選択されていません。実行状況から対象を選択してください。"
  return options.coordinateReviewAcceptance(
    selection.root,
    selection.runId,
    () => acceptReviewedStepOnce(
      options,
      selection.root,
      selection.runId,
      isOperationHubRunMutationTarget(runArg) ? runArg.expectedRevision : undefined
    )
  )
}

async function acceptReviewedStepOnce(
  options: StepReviewCommandOptions,
  workspaceRoot: string,
  runId: string,
  expectedRevision?: string
): Promise<AcceptedStepResult | string> {
  const runStore = new FileRunStateStore({ workspaceRoot })
  return coordinateWorkflowRunExecution(runStore, runId, "review-accept", async () => {
    if (expectedRevision) await assertOperationHubRunRevision(workspaceRoot, runId, expectedRevision)
    const run = await runStore.loadRun(runId)
    if (!run) return `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。`
    const acceptedStepId = run.currentStep
    const accepted = acceptReviewingStep(run)
    await runStore.saveRun(accepted)
    const gateAcceptance: BobWorkflowGateAcceptance = acceptedStepId
      ? options.acceptBobWorkflowGateWithMetadata?.(workspaceRoot, accepted.runId, acceptedStepId)
        ?? { result: options.acceptBobWorkflowGate(workspaceRoot, accepted.runId, acceptedStepId) }
      : { result: "missing" }
    const gateDecision = gateAcceptance.result
    const acceptedViaLiveGate = gateDecision === "accepted" || gateDecision === "alreadyAccepted"
    const continuationOwnedByBob = acceptedViaLiveGate && gateAcceptance.gate?.executionMode === "full"
    let completedViaBobTask = acceptedViaLiveGate
    if (gateDecision === "missing" || gateDecision === "aborted") {
      const sync = await bobTaskSyncRegistry.reconcileRun(workspaceRoot, accepted, undefined, {
        reason: "review-accepted",
        task: reviewTaskRegistry.taskForStep(workspaceRoot, accepted.runId, acceptedStepId)
          ?? reviewTaskRegistry.taskForRun(workspaceRoot, accepted.runId)
      })
      await runStore.saveRun(accepted)
      completedViaBobTask = sync.status === "synced" && sync.appliedStepCount > 0
    }
    const message = pendingReviewTransitionStepId(accepted)
      ? `ステップを承認しました。保留中の遷移を ${accepted.currentStep} から実行します: ${accepted.runId}`
      : accepted.status === "completed"
      ? `最後のステップを承認し、ワークフロー実行を完了しました: ${accepted.runId}`
      : `ステップを承認しました。次のステップは ${accepted.currentStep} です: ${accepted.runId}`
    const snapshot = await readOperationHubRunSnapshot(workspaceRoot, accepted.runId)
    return { run: accepted, message, completedViaBobTask, continuationOwnedByBob, workspaceRoot, revision: snapshot.revision }
  })
}

async function showAcceptedStepMessage(
  accepted: WorkflowRunState,
  message: string,
  completedViaBobTask: boolean,
  continuationOwnedByBob: boolean,
  workspaceRoot: string,
  revision: string
): Promise<void> {
  if (accepted.status !== "running" || !accepted.currentStep) {
    await vscode.window.showInformationMessage(message)
    return
  }
  if (continuationOwnedByBob) {
    await vscode.window.showInformationMessage(`${message} Bob ワークフローが同じ実行を続行します。`)
    return
  }
  if (completedViaBobTask) {
    await vscode.window.showInformationMessage(`${message} Bob 側のステップ完了へ反映しました。`)
    return
  }
  const selected = await vscode.window.showInformationMessage(
    `${message} 次のステップはまだ開始されていません。`,
    RUN_NEXT_STEP_LABEL,
    OPEN_OPERATION_HUB_LABEL
  )
  if (selected === RUN_NEXT_STEP_LABEL) {
    await vscode.commands.executeCommand("workflowRegister.runNextStep", {
      source: "operationHub",
      workspaceRoot,
      runId: accepted.runId,
      expectedRevision: revision
    } satisfies OperationHubRunMutationTarget)
  } else if (selected === OPEN_OPERATION_HUB_LABEL) {
    await vscode.commands.executeCommand("workflowRegister.openOperationHub", {
      workspaceRoot,
      runId: accepted.runId,
      stepId: accepted.currentStep,
      reason: "stepGate"
    })
  }
}

function operationHubTargetForAcceptedStep(accepted: AcceptedStepResult): OperationHubRunMutationTarget {
  return {
    source: "operationHub",
    workspaceRoot: accepted.workspaceRoot,
    runId: accepted.run.runId,
    expectedRevision: accepted.revision
  }
}

export async function inspectCurrentStep(options: StepReviewCommandOptions, runId?: string): Promise<void> {
  const selection = runId ? await findRunSelection(runId) : await pickRunSelection("ワークフローステップを確認")
  if (!selection) {
    await vscode.window.showWarningMessage(runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。")
    return
  }
  const run = selection.run
  const index = run.currentStep ? run.steps.findIndex((step) => step.id === run.currentStep) : -1
  const current = index >= 0 ? run.steps[index] : undefined
  linesForRun(run)
  const lines = [
    `- 実行 ID（runId）: ${run.runId}`,
    `- ワークフロー（workflow）: ${run.workflowId}`,
    `- 状態（status）: ${workflowRunStatusLabel(run.status)}`,
    `- 現在のステップ（currentStep）: ${run.currentStep ?? "なし"}`,
    `- ワークスペース（root）: ${selection.root}`,
    `- ワークフロー定義（workflowFile）: ${run.workflowFile ?? "なし"}`,
    `- ワークフロー定義ハッシュ（workflowDefinitionHash）: ${run.workflowDefinitionHash ?? "なし"}`,
    `- ワークフロー定義の差異（workflowDefinitionMismatch）: ${run.state["workflow.definitionMismatch"] ?? "なし"}`,
    `- Bob タスク同期（bobTaskSync）: ${run.bobTaskSync?.drift?.status ?? "不明"}; 完了済みステップ（completedThrough）=${run.bobTaskSync?.completedThroughStepId ?? "なし"}`
  ]
  if (current) {
    lines.push(
      `- 現在のステップ状態（currentStepStatus）: ${workflowStepStatusLabel(current.status)}`,
      `- 現在のステップ名（currentStepTitle）: ${current.title}`,
      `- 現在の試行番号（currentAttempt）: ${current.attempt ?? 1}`,
      `- 保存済みの試行数（archivedAttempts）: ${current.attempts?.length ?? 0}`
    )
  }
  lines.push("", "## 現在のステップの試行履歴")
  appendAttemptLines(lines, current)
  lines.push("", "## ステップ")
  for (const [stepIndex, step] of run.steps.entries()) {
    lines.push(`- ${stepIndex + 1}. ${step.id}: 状態=${workflowStepStatusLabel(step.status)}; ステップ名（title）=${step.title}; 試行番号（attempt）=${step.attempt ?? 1}; 保存済みの試行数（archivedAttempts）=${step.attempts?.length ?? 0}; 開始日時（startedAt）=${step.startedAt ?? "なし"}; 確認開始日時（reviewStartedAt）=${step.reviewStartedAt ?? "なし"}; 承認日時（acceptedAt）=${step.acceptedAt ?? "なし"}; 完了日時（completedAt）=${step.completedAt ?? "なし"}; エラー（error）=${step.error ?? "なし"}`)
  }
  await options.showMarkdownReport("ワークフローステップ", `${run.runId}: ${workflowRunStatusLabel(run.status)}`, lines)
}

export async function openCurrentStepInBuilder(options: StepReviewBuilderCommandOptions, runId?: string): Promise<void> {
  const selection = runId ? await findRunSelection(runId) : await pickRunSelection("現在のステップをワークフロー作成・編集で開く", (run) => Boolean(run.currentStep && run.workflowFile))
  if (!selection) {
    await vscode.window.showWarningMessage(runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。")
    return
  }
  const run = selection.run
  if (!run.workflowFile) {
    await vscode.window.showWarningMessage(`実行 ${run.runId} にはワークフロー定義ファイルが記録されていません。実行診断を確認してください。`)
    return
  }
  await editWorkflowInBuilder({ sourceId: options.sourceId, extensionUri: options.extensionUri }, { uri: workflowFileUri(selection), focusStepId: run.currentStep })
}

function acceptReviewingStep(run: WorkflowRunState): WorkflowRunState {
  if (run.status !== "reviewing") throw new Error(`実行は確認待ちではありません: ${workflowRunStatusLabel(run.status)}`)
  const currentIndex = run.currentStep ? run.steps.findIndex((step) => step.id === run.currentStep) : -1
  if (currentIndex < 0) throw new Error(`現在のステップが見つかりません: ${run.currentStep ?? "なし"}`)
  const current = run.steps[currentIndex]
  if (current.status !== "reviewing") throw new Error(`現在のステップは確認待ちではありません: ${workflowStepStatusLabel(current.status)}`)
  const now = new Date().toISOString()
  current.status = "completed"
  current.acceptedAt = now
  current.completedAt = now
  current.error = undefined

  if (pendingReviewTransitionStepId(run) === current.id) {
    run.status = "running"
    run.currentStep = current.id
    run.error = undefined
    return run
  }

  const nextIndex = run.steps.findIndex((step, index) => index > currentIndex && (step.status === "pending" || step.status === "held" || step.status === "failed" || step.status === "reviewing"))
  if (nextIndex < 0) {
    run.status = "completed"
    run.currentStep = undefined
    run.error = undefined
  } else {
    run.status = "running"
    run.currentStep = run.steps[nextIndex].id
    run.error = undefined
  }
  return run
}

function appendAttemptLines(lines: string[], step: RunStepState | undefined): void {
  if (!step) {
    lines.push("- 現在のステップはありません。")
    return
  }
  const attempts = step.attempts ?? []
  if (attempts.length === 0) {
    lines.push("- 保存済みの試行履歴はありません。")
    return
  }
  for (const attempt of attempts) {
    const stateKeys = Object.keys(attempt.stateSnapshot ?? {}).sort()
    lines.push(`- 試行 ${attempt.attempt}: 状態=${workflowStepStatusLabel(attempt.status)}; 作成日時（createdAt）=${attempt.createdAt}; 開始日時（startedAt）=${attempt.startedAt ?? "なし"}; 確認開始日時（reviewStartedAt）=${attempt.reviewStartedAt ?? "なし"}; 完了日時（completedAt）=${attempt.completedAt ?? "なし"}; 状態キー（stateKeys）=${stateKeys.length === 0 ? "なし" : stateKeys.join(",")}; エラー（error）=${attempt.error ?? "なし"}`)
  }
}

function workflowFileUri(selection: RunSelection): vscode.Uri {
  const file = selection.run.workflowFile ?? ""
  return vscode.Uri.file(path.isAbsolute(file) ? file : path.join(selection.root, file))
}

async function pickRunSelection(title: string, predicate: (run: WorkflowRunState) => boolean = () => true): Promise<RunSelection | undefined> {
  const selections = (await listRunSelections()).filter((selection) => predicate(selection.run))
  if (selections.length === 0) return undefined
  const picked = await vscode.window.showQuickPick(selections.map((selection) => ({
    label: selection.runId,
    description: workflowRunStatusLabel(selection.run.status),
    detail: `${selection.run.workflowId}; ワークスペース=${selection.root}; 現在のステップ=${selection.run.currentStep ?? "なし"}`,
    selection
  })), { title })
  return picked?.selection
}

async function findRunSelection(runId: string): Promise<RunSelection | undefined> {
  return (await listRunSelections()).find((selection) => selection.runId === runId)
}

async function validateReviewRunTarget(target: OperationHubRunMutationTarget): Promise<RunSelection> {
  const roots = await workflowRootCandidates()
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

async function listRunSelections(): Promise<RunSelection[]> {
  const roots = await workflowRootCandidates()
  const nested = await Promise.all(roots.map(async (candidate) => {
    const runStore = new FileRunStateStore({ workspaceRoot: candidate.root })
    const runs = await runStore.listRuns()
    return runs.map((run) => ({ root: candidate.root, runId: run.runId, run }))
  }))
  return nested.flat().sort((a, b) => b.run.updatedAt.localeCompare(a.run.updatedAt))
}

async function workflowRootCandidates(): Promise<MarkerRootCandidate[]> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) return []
  const markerRoots = await findWorkflowRootCandidates(folders)
  return markerRoots.length > 0 ? markerRoots : fallbackWorkspaceRootCandidates(folders)
}

function linesForRun(_run: WorkflowRunState): void {
  // Reserved for future run diagnostics injected by this command.
}
