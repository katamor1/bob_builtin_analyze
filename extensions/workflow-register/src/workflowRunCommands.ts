import * as fs from "fs/promises"
import * as path from "path"
import * as vscode from "vscode"
import type { ActiveStep } from "./bobWorkflowTypes"
import { BobWorkflowGateRegistry, type BobWorkflowGateDecision } from "./bobWorkflowGateRegistry"
import { bobTaskSyncRegistry, type BobTaskSyncReason } from "./bobTaskSync"
import {
  hydrateWorkflowStateFromArtifacts,
  importArtifactsFromTaskSnapshots as importTaskSnapshotArtifacts,
  parseWorkflowArtifactManifest,
  previewArtifactsFromTaskSnapshots,
  seedWorkflowRunFromArtifacts,
  stableJson,
  stateKeysProducedBeforeStep,
  validateWorkflowArtifactManifest,
  type TaskSnapshotArtifactImportIssue,
  type WorkflowArtifactManifest
} from "./core/artifacts"
import {
  buildHeldRunRecoveryPreview,
  classifyHeldRunRecovery,
  createHeldRunRecoveryProvenance,
  HELD_RECOVERY_STATE_KEY,
  type HeldRunRecoveryAssessment
} from "./core/heldRunRecovery"
import type { CoreWorkflowDefinition, WorkflowRunState } from "./core/model"
import { formatBranchingDiagnostics } from "./core/runDiagnostics"
import { assertWorkflowRunStateWritable, isWorkflowRunStateWritable } from "./core/runStateStore"
import { pendingReviewTransitionStepId } from "./core/engine/runState"
import {
  coordinateWorkflowRunExecution,
  workflowRunExecutionActiveForWorkspace
} from "./core/engine/runExecutionCoordinator"
import { FileRunControlStore } from "./core/runControlStore"
import { FileTaskSnapshotStore } from "./core/taskSnapshots"
import { readContainedRunArtifactManifest } from "./core/runtime/runStatePath"
import type { MarkerRootCandidate } from "./core/workspaceRoots"
import {
  assertOperationHubRunRevision,
  canonicalOperationHubWorkspaceRoot,
  isOperationHubRunMutationTarget,
  isOperationHubWorkflowMutationTarget,
  OperationHubRunMutationTarget,
  OperationHubWorkflowMutationTarget,
  validateOperationHubRunMutationTarget
} from "./operationHubMutationTarget"
import { showMarkdownReport } from "./reports"
import { chooseTaskSnapshotImportSelection } from "./taskSnapshotImportReport"
import type { ManualStepPanelInput } from "./webview/manualStepViewModel"
import { writeWorkspaceFilesAtomically } from "./core/runtime/workspaceFileTransaction"
import { requireTrustedWorkspace } from "./workspaceTrust"
import { collectCoreWorkflowInputs } from "./workflowInputPrompt"
import {
  findRunSelection,
  listRunSelections,
  pickRunSelection,
  RunSelection
} from "./workflowRunSelection"
import { WorkflowRuntimeFactory } from "./workflowRuntimeFactory"
import { workflowRunStatusLabel } from "./ui/displayLabels"
import { reviewTaskRegistry } from "./reviewTaskRegistry"
import type { ReviewAcceptanceOperationKind } from "./reviewAcceptanceCoordinator"

export type RunCommandArg = string | OperationHubRunMutationTarget | { runId?: string; run?: { runId?: string } } | undefined
export type WorkflowCommandArg = string | OperationHubWorkflowMutationTarget | undefined
export type ArtifactSourceRunArg = string | OperationHubRunMutationTarget | undefined

interface ArtifactSourceRunSelection {
  root: string
  run: WorkflowRunState
  manifest: WorkflowArtifactManifest
}

export interface WorkflowRunCommandServiceOptions {
  coreWorkflows: Map<string, CoreWorkflowDefinition>
  runtimeFactory: WorkflowRuntimeFactory
  ensureWorkflowsLoaded: () => Promise<void>
  workflowRootCandidates: () => Promise<MarkerRootCandidate[]>
  activeSteps: () => ActiveStep[]
  showManualStepPanel: (input: ManualStepPanelInput) => Promise<void>
  gateRegistry: BobWorkflowGateRegistry
  coordinateGateDecision: <T>(
    workspaceRoot: string,
    runId: string,
    kind: ReviewAcceptanceOperationKind,
    operation: () => Promise<T>
  ) => Promise<T>
}

const CHECKPOINT_ABORT_REASON = "Bob workflow run aborted at branch checkpoint."

export class WorkflowRunCommandService {
  constructor(private readonly options: WorkflowRunCommandServiceOptions) {}

  listCoreWorkflows(): CoreWorkflowDefinition[] {
    return Array.from(this.options.coreWorkflows.values()).sort((a, b) => a.label.localeCompare(b.label))
  }

  async runWorkflow(workflowArg?: WorkflowCommandArg, inputs: Record<string, unknown> = {}): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("ワークフローを実行")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const operationHubTarget = isOperationHubWorkflowMutationTarget(workflowArg) ? workflowArg : undefined
    const workflowId = operationHubTarget?.workflowId ?? (typeof workflowArg === "string" ? workflowArg : undefined)
    const workflow = workflowId
      ? this.options.coreWorkflows.get(workflowId)
      : await this.pickCoreWorkflow()
    if (!workflow) return "ワークフローが選択されていません。一覧から対象を選択してください。"
    const root = operationHubTarget
      ? await this.validateOperationHubWorkflowRoot(operationHubTarget, workflow)
      : workflow.workflowRoot ?? await this.pickWorkflowRoot("ワークフローのワークスペースを選択")
    if (!root) {
      const message = "ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。"
      await vscode.window.showErrorMessage(message)
      return message
    }
    const resolvedInputs = await collectCoreWorkflowInputs(workflow, inputs)
    if (!resolvedInputs) return "ワークフローの入力を中止しました。"
    const engine = this.options.runtimeFactory.createEngine(root)
    const run = await engine.runWorkflow(workflow, resolvedInputs)
    await vscode.window.showInformationMessage(`ワークフロー実行 ${run.runId}: ${workflowRunStatusLabel(run.status)}`)
    return run
  }

  async runWorkflowStep(
    workflowId?: string,
    stepId?: string,
    inputs: Record<string, unknown> = {}
  ): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("ワークフローステップを実行")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const workflow = workflowId
      ? this.options.coreWorkflows.get(workflowId)
      : await this.pickCoreWorkflow()
    if (!workflow) return "ワークフローが選択されていません。一覧から対象を選択してください。"
    const step = stepId
      ? workflow.engineSteps.find((candidate) => candidate.id === stepId)
      : await this.pickWorkflowStep(workflow)
    if (!step) return stepId ? `ステップ ${stepId} が見つかりません。ワークフロー定義を確認してください。` : "ステップが選択されていません。一覧から対象を選択してください。"
    const root = workflow.workflowRoot ?? await this.pickWorkflowRoot("ワークフローのワークスペースを選択")
    if (!root) {
      const message = "ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。"
      await vscode.window.showErrorMessage(message)
      return message
    }
    const resolvedInputs = await collectCoreWorkflowInputs(workflow, inputs)
    if (!resolvedInputs) return "ワークフローの入力を中止しました。"
    const engine = this.options.runtimeFactory.createEngine(root)
    const run = await engine.runWorkflow(workflow, resolvedInputs, {
      executionMode: "singleStep",
      stepId: step.id,
      allowOutOfOrder: workflow.stepExecution.allowOutOfOrder
    })
    await vscode.window.showInformationMessage(`ワークフロー実行 ${run.runId}: ${workflowRunStatusLabel(run.status)}`)
    return run
  }

  async startFromStepWithArtifacts(
    workflowId?: string,
    stepId?: string,
    sourceRunArg?: ArtifactSourceRunArg,
    inputs: Record<string, unknown> = {}
  ): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("成果物からワークフローを開始")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const workflow = workflowId
      ? this.options.coreWorkflows.get(workflowId)
      : await this.pickCoreWorkflow()
    if (!workflow) return "ワークフローが選択されていません。一覧から対象を選択してください。"
    const step = stepId
      ? workflow.engineSteps.find((candidate) => candidate.id === stepId)
      : await this.pickWorkflowStep(workflow)
    if (!step) return stepId ? `ステップ ${stepId} が見つかりません。ワークフロー定義を確認してください。` : "ステップが選択されていません。一覧から対象を選択してください。"
    const sourceTarget = isOperationHubRunMutationTarget(sourceRunArg) ? sourceRunArg : undefined
    const sourceRunId = sourceTarget?.runId ?? (typeof sourceRunArg === "string" ? sourceRunArg : undefined)
    let root = workflow.workflowRoot ?? await this.pickWorkflowRoot("ワークフローのワークスペースを選択")
    if (!root) {
      const message = "ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。"
      await vscode.window.showErrorMessage(message)
      return message
    }
    const resolvedInputs = await collectCoreWorkflowInputs(workflow, inputs)
    if (!resolvedInputs) return "ワークフローの入力を中止しました。"

    if (sourceTarget) {
      const roots = await this.options.workflowRootCandidates()
      const validated = await validateOperationHubRunMutationTarget(
        sourceTarget,
        roots.map((candidate) => candidate.root)
      )
      if (workflow.workflowRoot) {
        await canonicalOperationHubWorkspaceRoot(workflow.workflowRoot, [validated.workspaceRoot])
      }
      root = validated.workspaceRoot
    }

    if (sourceTarget) {
      await assertOperationHubRunRevision(root, sourceTarget.runId, sourceTarget.expectedRevision)
    }

    const source = await this.pickArtifactSourceRun(root, workflow, resolvedInputs, sourceRunId)
    if (!source) {
      const message = sourceRunId
        ? `Workflow artifact source run not found or not compatible: ${sourceRunId}`
        : "No compatible workflow artifact source run selected."
      await vscode.window.showWarningMessage(message)
      return message
    }

    const runStore = this.options.runtimeFactory.createRunStore(root)
    if (!runStore.withRunLock) throw new Error("Workflow run store does not support source-run locking.")
    const prepared = await runStore.withRunLock(source.run.runId, async () => {
      if (sourceTarget) {
        await assertOperationHubRunRevision(root, source.run.runId, sourceTarget.expectedRevision)
      }
      const lockedSourceRun = await runStore.loadRun(source.run.runId)
      if (!lockedSourceRun) throw new Error(`Workflow artifact source run disappeared after selection: ${source.run.runId}`)
      assertWorkflowRunStateWritable(lockedSourceRun)
      assertArtifactSourceRunCompatible(lockedSourceRun, workflow)
      if (stableJson(lockedSourceRun) !== stableJson(source.run)) {
        throw new Error(`Workflow artifact source run changed after selection: ${source.run.runId}`)
      }
      const lockedManifest = await loadArtifactManifest(root, lockedSourceRun)
      if (!lockedManifest) throw new Error(`Workflow artifact source manifest disappeared after selection: ${source.run.runId}`)
      if (lockedManifest.runId !== lockedSourceRun.runId) {
        throw new Error(`Workflow artifact source manifest runId changed after selection: ${lockedManifest.runId}`)
      }
      const manifestIssues = validateWorkflowArtifactManifest({
        manifest: lockedManifest,
        workflow,
        inputs: resolvedInputs
      })
      if (manifestIssues.some((issue) => issue.severity === "error")) {
        throw new Error(`Workflow artifact source manifest is no longer compatible: ${manifestIssues.map((issue) => issue.message).join("; ")}`)
      }
      if (stableJson(lockedManifest) !== stableJson(source.manifest)) {
        throw new Error(`Workflow artifact source manifest changed after selection: ${source.run.runId}`)
      }

      const seeded = await runStore.createRun(workflow, resolvedInputs)
      seeded.currentStep = step.id
      const stateKeys = stateKeysProducedBeforeStep(workflow, step.id)
      const hydration = await hydrateWorkflowStateFromArtifacts({
        workflow,
        run: seeded,
        manifest: lockedManifest,
        stateKeys,
        readFile: (relativePath) => readPhysicallyContainedWorkspaceFile(root, relativePath)
      })
      if (!hydration.ok) {
        return {
          ok: false as const,
          message: `成果物から状態を復元できませんでした。成果物とワークフロー定義を確認してください。詳細: ${hydration.issues.map((issue) => issue.message).join("; ")}`
        }
      }

      const seededRun = seedWorkflowRunFromArtifacts({
        workflow,
        run: seeded,
        manifest: lockedManifest,
        startStepId: step.id,
        hydratedKeys: hydration.hydratedKeys
      })
      if (!seededRun.ok) {
        return { ok: false as const, message: seededRun.error ?? "成果物から実行を開始できませんでした。成果物の互換性を確認してください。" }
      }
      await runStore.saveRun(seeded)
      return {
        ok: true as const,
        seeded,
        reusedStepIds: seededRun.reusedStepIds,
        sourceRunId: lockedSourceRun.runId
      }
    }, { requireExistingRunDirectory: true })
    if (!prepared.ok) {
      await vscode.window.showErrorMessage(prepared.message)
      return prepared.message
    }
    const engine = this.options.runtimeFactory.createEngine(root)
    const result = await engine.resumeRun(prepared.seeded.runId, { workflow })
    await vscode.window.showInformationMessage(
      `ワークフロー実行 ${result.runId}: ${workflowRunStatusLabel(result.status)}。${prepared.sourceRunId} から ${prepared.reusedStepIds.length}ステップを再利用しました。`
    )
    return result
  }

  async importArtifactsFromTaskSnapshots(runId?: string): Promise<unknown> {
  const trustError = await requireTrustedWorkspace("保存済みタスクから成果物を取り込む")
  if (trustError) return trustError
  await this.ensureWorkflowsLoaded()
  const selection = await this.selectRun(runId)
  if (!selection) return runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
  if (workflowRunExecutionActiveForWorkspace(selection.root, selection.runId)) {
    throw new Error(`Cannot import task snapshot artifacts while workflow run is executing: ${selection.runId}`)
  }

  const runStore = this.options.runtimeFactory.createRunStore(selection.root)
  const previewRun = await runStore.loadRun(selection.runId)
  if (!previewRun) throw new Error(`実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
  assertWorkflowRunStateWritable(previewRun)
  const previewWorkflow = this.options.coreWorkflows.get(previewRun.workflowId)
  if (!previewWorkflow) throw new Error(`Workflow definition is not loaded: ${previewRun.workflowId}`)
  const snapshotStore = new FileTaskSnapshotStore({ workspaceRoot: selection.root })
  const preview = await previewArtifactsFromTaskSnapshots({
    workflow: previewWorkflow,
    run: previewRun,
    snapshotStore,
    readFile: (relativePath) => readOptionalPhysicallyContainedWorkspaceFile(selection.root, relativePath)
  })
  const chosen = await chooseTaskSnapshotImportSelection({
    preview,
    run: previewRun,
    workflow: previewWorkflow,
    prompts: {
      showPreview: (lines) => showMarkdownReport(
        "保存済みタスク成果物の取り込みプレビュー",
        "取り込む成果物を選ぶ前に、抽出元、保存先、チェックサム、差分を確認してください。",
        lines
      ),
      pickArtifacts: async (items) => {
        const picked = await vscode.window.showQuickPick(items.map((item) => ({
          label: item.label,
          description: item.description,
          detail: item.detail,
          picked: item.picked,
          item
        })), {
          title: `保存済みタスクから成果物を取り込む: ${previewRun.runId}`,
          placeHolder: "取り込む成果物を選択してください。省略・秘匿・既存内容と異なる候補は既定で未選択です。",
          canPickMany: true,
          matchOnDescription: true,
          matchOnDetail: true
        })
        return picked?.map((item) => item.item.artifactId)
      },
      confirmOverwrite: async (count) => {
        const confirm = "取り込んで上書き"
        const picked = await vscode.window.showWarningMessage(
          `選択した成果物のうち${count}件は既存内容と異なります。プレビューの差分を確認したうえで上書きしてください。`,
          { modal: true },
          confirm
        )
        return picked === confirm
      }
    }
  })
  if (!chosen) return "保存済みタスクからの成果物取り込みを中止しました。"
  if (chosen.selectedArtifactIds.length === 0) {
    const message = "取り込む成果物が選択されていません。プレビューから対象を選択してください。"
    await vscode.window.showInformationMessage(message)
    return { ok: false, importedCount: 0, issues: [{ severity: "info", message }] }
  }

  const imported = await this.options.coordinateGateDecision(
    selection.root,
    selection.runId,
    "artifact-import",
    () => coordinateWorkflowRunExecution(runStore, selection.runId, "importTaskSnapshotArtifacts", async () => {
      const run = await runStore.loadRun(selection.runId)
      if (!run) throw new Error(`実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
      const workflow = this.options.coreWorkflows.get(run.workflowId)
      if (!workflow) throw new Error(`ワークフロー定義 ${run.workflowId} が読み込まれていません。定義を再読み込みしてください。`)
      const result = await importTaskSnapshotArtifacts({
        workflow,
        run,
        snapshotStore: new FileTaskSnapshotStore({ workspaceRoot: selection.root }),
        readFile: (relativePath) => readOptionalPhysicallyContainedWorkspaceFile(selection.root, relativePath),
        selectedArtifactIds: chosen.selectedArtifactIds,
        expectedPreviewDigest: preview.previewDigest,
        overwriteExisting: chosen.overwriteExisting,
        persistStateRollback: () => runStore.saveRun(run),
        writeFiles: (writes, commitState) => writeWorkspaceFilesAtomically(selection.root, writes, async () => {
          await Promise.resolve(commitState())
          await runStore.saveRun(run)
        })
      })
      return { result, run, workflow }
    })
  )
  const { result, run, workflow } = imported
  const lines = [
    `- 実行 ID: ${run.runId}`,
    `- ワークフロー: ${workflow.id}`,
    `- 取り込み件数: ${result.importedCount}`,
    `- 成果物一覧: ${result.manifest ? "更新済み" : "未更新"}`,
    `- プレビューダイジェスト: ${result.previewDigest ?? preview.previewDigest}`,
    "",
    "確認事項:",
    ...formatSnapshotImportIssues(result.issues)
  ]
  await showMarkdownReport("保存済みタスクから成果物を取り込む", result.ok ? "選択した成果物を取り込みました。" : "成果物は取り込まれませんでした。確認事項を修正して再実行してください。", lines)
  return result
}

  async runNextStep(runArg?: RunCommandArg): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("次のワークフローステップを実行")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const roots = await this.options.workflowRootCandidates()
    if (roots.length === 0) {
      const message = "ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。"
      await vscode.window.showErrorMessage(message)
      return message
    }
    const runId = resolveRunId(runArg)
    const selection = await this.selectRunArgument(runArg, roots)
    if (!selection) {
      const message = runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
      if (runId) await vscode.window.showWarningMessage(message)
      return message
    }
    if (workflowRunExecutionActiveForWorkspace(selection.root, selection.runId)) {
      throw new Error(`Cannot run the next step while workflow run is executing: ${selection.runId}`)
    }
    return this.options.coordinateGateDecision(
      selection.root,
      selection.runId,
      "run-next",
      () => this.runNextStepOnce(
        selection.root,
        selection.runId,
        isOperationHubRunMutationTarget(runArg) ? runArg.expectedRevision : undefined
      )
    )
  }

  private async runNextStepOnce(root: string, runId: string, expectedRevision?: string): Promise<unknown> {
    if (expectedRevision) await assertOperationHubRunRevision(root, runId, expectedRevision)
    const runStore = this.options.runtimeFactory.createRunStore(root)
    const run = await runStore.loadRun(runId)
    if (!run) throw new Error(`実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
    if (run.status === "reviewing") {
      return this.warnStepGate("現在のステップは人による確認待ちです。結果を承認するか、現在のステップを再試行してください。")
    }
    if (run.status === "held") {
      return this.warnStepGate("現在のステップは手動操作待ちです。手動ステップを完了してから次へ進んでください。")
    }
    if (run.status === "checkpoint") {
      return this.warnStepGate("現在の実行は分岐確認待ちです。分岐を承認するか中止してから次へ進んでください。")
    }
    if (run.status === "failed") {
      return this.warnStepGate("現在のステップは失敗しています。現在のステップを再試行してください。")
    }
    const workflow = this.options.coreWorkflows.get(run.workflowId)
    if (!workflow) throw new Error(`ワークフロー定義 ${run.workflowId} が読み込まれていません。定義を再読み込みしてください。`)
    const agentProvider = reviewTaskRegistry.agentProviderForRun(root, run.runId, workflow)
    const pendingTransitionStepId = pendingReviewTransitionStepId(run)
    if (pendingTransitionStepId) {
      const engine = this.options.runtimeFactory.createEngine(root, agentProvider)
      const result = await engine.runWorkflow(workflow, run.inputs, {
        executionMode: "singleStep",
        stepId: pendingTransitionStepId,
        allowOutOfOrder: workflow.stepExecution.allowOutOfOrder
      })
      await this.reconcileBobTask(root, result, workflow, "operation-hub-next")
      await vscode.window.showInformationMessage(`ワークフロー実行 ${result.runId}: ${workflowRunStatusLabel(result.status)}`)
      return result
    }
    const next = run.steps.find((step) => step.status === "pending")
    if (!next) {
      if (run.status !== "completed" && run.steps.every((step) => step.status === "completed")) {
        run.status = "completed"
        run.currentStep = undefined
        run.error = undefined
        await this.reconcileBobTask(root, run, workflow, "operation-hub-next")
      } else {
        await runStore.saveRun(run)
      }
      const message = run.status === "completed"
        ? `ワークフロー実行 ${run.runId} が完了しました。`
        : `実行 ${run.runId} に未実行のステップはありません。実行状況を確認してください。`
      await vscode.window.showInformationMessage(message)
      return run
    }
    const engine = this.options.runtimeFactory.createEngine(root, agentProvider)
    const result = await engine.runWorkflow(workflow, run.inputs, {
      executionMode: "singleStep",
      stepId: next.id,
      allowOutOfOrder: workflow.stepExecution.allowOutOfOrder
    })
    await this.reconcileBobTask(root, result, workflow, "operation-hub-next")
    await vscode.window.showInformationMessage(`ワークフロー実行 ${result.runId}: ${workflowRunStatusLabel(result.status)}`)
    return result
  }

  async openManualStepPanel(runArg?: RunCommandArg): Promise<string> {
    const trustError = await requireTrustedWorkspace("手動ステップを開く")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const roots = await this.options.workflowRootCandidates()
    if (roots.length === 0) {
      const message = "ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。"
      await vscode.window.showWarningMessage(message)
      return message
    }
    const runId = resolveRunId(runArg)
    const selection = runId
      ? await findRunSelection(runId, roots, (root) => this.options.runtimeFactory.createRunStore(root))
      : await pickRunSelection(roots, (root) => this.options.runtimeFactory.createRunStore(root))
    if (!selection) {
      const message = runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
      await vscode.window.showWarningMessage(message)
      return message
    }
    const runStore = this.options.runtimeFactory.createRunStore(selection.root)
    const run = selection.run ?? await runStore.loadRun(selection.runId)
    if (!run) {
      const message = `実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`
      await vscode.window.showWarningMessage(message)
      return message
    }
    const workflow = this.options.coreWorkflows.get(run.workflowId)
    if (!workflow) {
      const message = `ワークフロー定義 ${run.workflowId} が読み込まれていません。定義を再読み込みしてください。`
      await vscode.window.showWarningMessage(message)
      return message
    }
    const stepId = run.currentStep ?? run.steps.find((candidate) => candidate.status === "held")?.id
    const step = stepId ? workflow.engineSteps.find((candidate) => candidate.id === stepId) : undefined
    if (!step) {
      const message = `実行 ${run.runId} に現在の手動ステップがありません。実行状況を更新してください。`
      await vscode.window.showWarningMessage(message)
      return message
    }
    const active = this.options.activeSteps().find((candidate) => (
      candidate.runId === run.runId &&
      candidate.workflowId === run.workflowId &&
      candidate.stepId === step.id
    ))
    await this.options.showManualStepPanel({ workflow, run, step, active })
    return `実行 ${run.runId} の手動ステップを開きました。`
  }

  async inspectRuns(): Promise<void> {
    const roots = await this.options.workflowRootCandidates()
    if (roots.length === 0) {
      await vscode.window.showErrorMessage("ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。")
      return
    }
    const runsByRoot = await listRunSelections(roots, (root) => this.options.runtimeFactory.createRunStore(root))
    const lines = runsByRoot.length === 0
      ? ["- ワークフロー実行履歴はありません。"]
      : runsByRoot.map(({ root, run }) => [
        `- ${run?.runId}: ${run ? workflowRunStatusLabel(run.status) : "不明"}`,
        `ワークフロー=${run?.workflowId}`,
        `ワークスペース=${root}`,
        `現在のステップ=${run?.currentStep ?? "なし"}`,
        `Bob タスク同期=${run?.bobTaskSync?.drift?.status ?? "不明"}`,
        `更新日時=${run?.updatedAt}`
      ].join("; "))
    await showMarkdownReport("ワークフロー実行", `${runsByRoot.length}件の実行履歴があります。`, lines)
  }

  async resumeRun(runArg?: RunCommandArg): Promise<unknown> {
    return this.resumeOrRetryRun("resume", runArg)
  }

  async recoverDetachedHeldRun(runArg?: RunCommandArg): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("切断された手動待ち実行を復旧")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const roots = await this.options.workflowRootCandidates()
    const runId = resolveRunId(runArg)
    const selection = await this.selectRunArgument(runArg, roots)
    if (!selection) {
      const message = runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
      await vscode.window.showWarningMessage(message)
      return message
    }
    if (workflowRunExecutionActiveForWorkspace(selection.root, selection.runId)) {
      throw new Error(`ワークフローの実行中は、切断された手動操作待ち実行を復旧できません: ${selection.runId}`)
    }

    const expectedRevision = isOperationHubRunMutationTarget(runArg) ? runArg.expectedRevision : undefined
    if (expectedRevision) await assertOperationHubRunRevision(selection.root, selection.runId, expectedRevision)
    const runStore = this.options.runtimeFactory.createRunStore(selection.root)
    const previewRun = await runStore.loadRun(selection.runId)
    if (!previewRun) throw new Error(`実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
    const previewWorkflow = this.options.coreWorkflows.get(previewRun.workflowId)
    const previewAssessment = await this.assessHeldRunRecovery(selection.root, previewRun, previewWorkflow)
    if (previewAssessment.kind !== "detached-resumable") {
      const message = `復旧方法が「${previewAssessment.kind}」に変わりました。Bob 操作センターを更新し、「${previewAssessment.primaryAction.label}」を使用してください。`
      await vscode.window.showWarningMessage(message)
      return previewAssessment
    }

    await showMarkdownReport(
      "中断した実行の復旧プレビュー",
      "切断された手動ステップを完了する前に、保存済みのメタデータを確認してください。",
      buildHeldRunRecoveryPreview(previewRun, previewAssessment)
    )
    const confirmLabel = "保存済み状態から再開"
    const accepted = await vscode.window.showWarningMessage(
      `手動操作待ちステップ「${previewAssessment.stepId ?? "不明"}」を保存済み状態から完了します。続行しますか？`,
      { modal: true },
      confirmLabel
    )
    if (accepted !== confirmLabel) return "中断した実行の復旧を中止しました。"

    return this.options.coordinateGateDecision(
      selection.root,
      selection.runId,
      "held-recovery",
      async () => {
        if (expectedRevision) await assertOperationHubRunRevision(selection.root, selection.runId, expectedRevision)
        const currentRun = await runStore.loadRun(selection.runId)
        if (!currentRun) throw new Error(`実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
        const workflow = this.options.coreWorkflows.get(currentRun.workflowId)
        if (!workflow) throw new Error(`ワークフロー定義が読み込まれていません: ${currentRun.workflowId}。ワークフロー定義を再読み込みしてから再実行してください。`)
        const agentProvider = reviewTaskRegistry.agentProviderForRun(selection.root, currentRun.runId, workflow)
        const engine = this.options.runtimeFactory.createEngine(selection.root, agentProvider)
        let validatedAssessment: HeldRunRecoveryAssessment | undefined
        const result = await engine.resumeRunGuarded(
          selection.runId,
          { workflow, completeHeldStep: true, executionMode: "singleStep" },
          {
            beforeResume: async (freshRun) => {
              const freshAssessment = await this.assessHeldRunRecovery(selection.root, freshRun, workflow)
              if (freshAssessment.kind !== "detached-resumable") {
                throw new Error(`復旧方法が「${freshAssessment.kind}」に変わりました。Bob 操作センターを更新してから再実行してください。`)
              }
              if (!freshAssessment.stepId) throw new Error("切断された実行に復旧可能な手動操作待ちステップがありません。実行診断を確認してください。")
              validatedAssessment = freshAssessment
            },
            afterResume: (resumedRun) => {
              const assessment = validatedAssessment
              if (!assessment?.stepId) throw new Error("中断した実行の復旧検証結果を保持できませんでした。実行診断を確認して再実行してください。")
              resumedRun.state[HELD_RECOVERY_STATE_KEY] = JSON.stringify(createHeldRunRecoveryProvenance({
                runId: resumedRun.runId,
                stepId: assessment.stepId,
                nextStepId: assessment.nextStepId,
                recoveredAt: new Date().toISOString(),
                source: "operation-hub"
              }))
            }
          }
        )
        await this.reconcileBobTask(selection.root, result, workflow, "operation-hub-resume")
        await vscode.window.showInformationMessage(`中断した実行 ${result.runId} を復旧しました。`)
        return result
      }
    )
  }

  async retryCurrentStep(runArg?: RunCommandArg): Promise<unknown> {
    return this.resumeOrRetryRun("retry", runArg)
  }

  async approveBranchCheckpoint(runId?: string): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("分岐チェックポイントを承認")
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const selection = await this.selectRun(runId)
    if (!selection) return runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
    return this.options.coordinateGateDecision(selection.root, selection.runId, "checkpoint-approve", async () => {
      const runStore = this.options.runtimeFactory.createRunStore(selection.root)
      const run = await runStore.loadRun(selection.runId)
      if (!run) throw new Error(`実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
      const workflow = this.options.coreWorkflows.get(run.workflowId)
      if (!workflow) throw new Error(`ワークフロー定義 ${run.workflowId} が読み込まれていません。定義を再読み込みしてください。`)
      const engine = this.options.runtimeFactory.createEngine(selection.root)
      const result = await engine.approveBranchCheckpoint(selection.runId, workflow)
      if (this.options.gateRegistry.pendingForRun(selection.root, selection.runId)) {
        this.options.gateRegistry.acceptPending(selection.root, selection.runId)
      }
      await vscode.window.showInformationMessage(`実行 ${result.runId} の分岐を承認しました。`)
      return result
    })
  }

  async abortBranchCheckpoint(runId?: string): Promise<unknown> {
    const trustError = await requireTrustedWorkspace("分岐チェックポイントを中止")
    if (trustError) return trustError
    const selection = await this.selectRun(runId)
    if (!selection) return runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
    return this.options.coordinateGateDecision(selection.root, selection.runId, "checkpoint-abort", async () => {
      const engine = this.options.runtimeFactory.createEngine(selection.root)
      const result = await engine.abortBranchCheckpoint(selection.runId, CHECKPOINT_ABORT_REASON)
      this.options.gateRegistry.abortPending(selection.root, selection.runId, CHECKPOINT_ABORT_REASON)
      await vscode.window.showInformationMessage(`実行 ${result.runId} の分岐を中止しました。`)
      return result
    })
  }

  async inspectBranching(runId?: string): Promise<unknown> {
    const selection = await this.selectRun(runId)
    if (!selection) {
      const message = runId ? `実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。` : "実行が選択されていません。実行一覧から対象を選択してください。"
      await vscode.window.showWarningMessage(message)
      return message
    }
    const run = selection.run ?? await this.options.runtimeFactory.createRunStore(selection.root).loadRun(selection.runId)
    if (!run) throw new Error(`実行 ${selection.runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
    const lines = [
      `- 実行 ID: ${run.runId}`,
      `- 状態: ${workflowRunStatusLabel(run.status)}`,
      `- 現在のステップ: ${run.currentStep ?? "なし"}`,
      `- ワークスペース: ${selection.root}`
    ]
    const branchingLines = formatBranchingDiagnostics(run)
    lines.push("", ...(branchingLines.length > 0 ? branchingLines : ["分岐ループ:", "- 記録された分岐ループはありません。"]))
    await showMarkdownReport("ワークフローの分岐", `${run.runId}: ${workflowRunStatusLabel(run.status)}`, lines)
    return run
  }

  private async resumeOrRetryRun(mode: "resume" | "retry", runArg?: RunCommandArg): Promise<unknown> {
    const trustError = await requireTrustedWorkspace(`${mode} workflow run`)
    if (trustError) return trustError
    await this.ensureWorkflowsLoaded()
    const roots = await this.options.workflowRootCandidates()
    const runId = resolveRunId(runArg)
    const selection = await this.selectRunArgument(runArg, roots)
    if (!selection) {
      const message = "ワークスペースフォルダーが開かれていません。フォルダーを開いてからもう一度実行してください。"
      if (!runId) return "実行が選択されていません。実行一覧から対象を選択してください。"
      await vscode.window.showErrorMessage(`実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
      return message
    }
    return this.options.coordinateGateDecision(
      selection.root,
      selection.runId,
      mode === "resume" ? "run-resume" : "run-retry",
      () => (
        this.resumeOrRetryRunOnce(
          mode,
          selection.root,
          selection.runId,
          isOperationHubRunMutationTarget(runArg) ? runArg.expectedRevision : undefined
        )
      )
    )
  }

  private async resumeOrRetryRunOnce(
    mode: "resume" | "retry",
    root: string,
    runId: string,
    expectedRevision?: string
  ): Promise<unknown> {
    if (expectedRevision) await assertOperationHubRunRevision(root, runId, expectedRevision)
    const runStore = this.options.runtimeFactory.createRunStore(root)
    const run = await runStore.loadRun(runId)
    if (!run) throw new Error(`実行 ${runId} が見つかりません。実行一覧を更新してから再度選択してください。`)
    if (mode === "resume" && run.status === "checkpoint") {
      return this.warnStepGate("Current run is waiting at a branch checkpoint. Approve or abort the checkpoint before resuming.")
    }
    const workflow = this.options.coreWorkflows.get(run.workflowId)
    if (!workflow) throw new Error(`ワークフロー定義 ${run.workflowId} が読み込まれていません。定義を再読み込みしてください。`)
    const liveGate = this.options.gateRegistry.pendingForRun(root, runId)
    if (mode === "resume" && run.status === "held") {
      const assessment = await this.assessHeldRunRecovery(root, run, workflow)
      if (assessment.kind === "connected") {
        const step = workflow.engineSteps.find((candidate) => candidate.id === assessment.stepId)
        if (step) {
          const active = this.options.activeSteps().find((candidate) => (
            candidate.runId === run.runId
            && candidate.workflowId === run.workflowId
            && candidate.stepId === step.id
          ))
          await this.options.showManualStepPanel({ workflow, run, step, active })
          return run
        }
      }
      if (!liveGate) {
        const message = assessment.kind === "detached-resumable"
          ? `実行 ${run.runId} は手動ステップから切断されています。復旧プレビューを確認し、「中断した実行を復旧」を実行してください。`
          : `実行 ${run.runId} を再開する前に「${assessment.primaryAction.label}」を実行してください。`
        await vscode.window.showWarningMessage(message)
        return message
      }
    }
    if (mode === "resume" && run.status === "paused" && liveGate?.status === "paused" && ownerStepCompleted(run, liveGate)) {
      await new FileRunControlStore({ workspaceRoot: root }).clearPause(runId)
      run.status = "running"
      run.error = undefined
      await runStore.saveRun(run)
      this.options.gateRegistry.acceptPending(root, runId)
      await vscode.window.showInformationMessage(`ワークフロー実行 ${run.runId}: ${workflowRunStatusLabel(run.status)}`)
      return run
    }

    const agentProvider = reviewTaskRegistry.agentProviderForRun(root, run.runId, workflow)
    const engine = this.options.runtimeFactory.createEngine(root, agentProvider)
    const result = mode === "resume"
      ? await engine.resumeRun(runId, {
        workflow,
        completeHeldStep: true,
        executionMode: liveGate ? "singleStep" : undefined
      })
      : await engine.retryCurrentStep(runId, workflow, {
        executionMode: liveGate ? "singleStep" : undefined
      })
    if (liveGate) {
      this.updateLiveGateAfterCommand(root, result, liveGate)
    } else {
      await this.reconcileBobTask(root, result, workflow, mode === "resume" ? "operation-hub-resume" : "operation-hub-retry")
    }
    await vscode.window.showInformationMessage(`ワークフロー実行 ${result.runId}: ${workflowRunStatusLabel(result.status)}`)
    return result
  }

  private updateLiveGateAfterCommand(
    root: string,
    run: WorkflowRunState,
    gate: BobWorkflowGateDecision & { ownerStepId: string }
  ): void {
    const stepId = run.currentStep ?? gate.stepId
    if (isHumanGateStatus(run.status)) {
      this.options.gateRegistry.rebind(root, run.runId, { stepId, status: run.status })
      return
    }
    if (ownerStepCompleted(run, gate) || run.status === "completed") {
      this.options.gateRegistry.acceptPending(root, run.runId)
      return
    }
    this.options.gateRegistry.rebind(root, run.runId, { stepId, status: run.status })
  }

  private async assessHeldRunRecovery(
    root: string,
    run: WorkflowRunState,
    workflow: CoreWorkflowDefinition | undefined
  ): Promise<HeldRunRecoveryAssessment> {
    const manifest = workflow ? await loadArtifactManifest(root, run).catch(() => undefined) : undefined
    const artifactManifestAvailable = Boolean(
      workflow
      && manifest
      && !validateWorkflowArtifactManifest({ manifest, workflow, inputs: run.inputs })
        .some((issue) => issue.severity === "error")
    )
    const snapshots = run.status === "held"
      ? await new FileTaskSnapshotStore({ workspaceRoot: root }).listSnapshots(run.runId).catch(() => [])
      : []
    const activeManualStepAvailable = this.options.activeSteps().some((candidate) => (
      candidate.runId === run.runId
      && candidate.workflowId === run.workflowId
      && candidate.stepId === run.currentStep
    )) || Boolean(reviewTaskRegistry.taskForStep(root, run.runId, run.currentStep))
    return classifyHeldRunRecovery({
      run,
      workflow,
      liveTaskAvailable: Boolean(reviewTaskRegistry.taskForRun(root, run.runId)),
      activeManualStepAvailable,
      artifactManifestAvailable,
      taskSnapshotAvailable: snapshots.some((snapshot) => (
        snapshot.stepId === run.currentStep
        && snapshot.workflowId === run.workflowId
        && (!snapshot.workflowDefinitionHash || !workflow?.definitionHash || snapshot.workflowDefinitionHash === workflow.definitionHash)
      ))
    })
  }

  private async pickArtifactSourceRun(
    root: string,
    workflow: CoreWorkflowDefinition,
    inputs: Record<string, unknown>,
    sourceRunId?: string
  ): Promise<ArtifactSourceRunSelection | undefined> {
    const runStore = this.options.runtimeFactory.createRunStore(root)
    const runs = await runStore.listRuns()
    const candidates: ArtifactSourceRunSelection[] = []
    for (const run of runs) {
      if (sourceRunId && run.runId !== sourceRunId) continue
      if (!isWorkflowRunStateWritable(run)) {
        if (sourceRunId) assertWorkflowRunStateWritable(run)
        continue
      }
      const manifest = await loadArtifactManifest(root, run)
      if (!manifest) continue
      const issues = validateWorkflowArtifactManifest({ manifest, workflow, inputs })
      if (issues.some((issue) => issue.severity === "error")) continue
      candidates.push({ root, run, manifest })
    }
    if (sourceRunId) return candidates[0]
    if (candidates.length === 0) return undefined
    if (candidates.length === 1) return candidates[0]
    const picked = await vscode.window.showQuickPick(candidates.map((candidate) => ({
      label: candidate.run.runId,
      description: candidate.run.status,
      detail: `${candidate.manifest.artifacts.length}件の成果物; 更新=${candidate.run.updatedAt}`,
      candidate
    })), { title: `成果物の再利用元を選択: ${workflow.label}` })
    return picked?.candidate
  }

  private async reconcileBobTask(root: string, run: WorkflowRunState, workflow: CoreWorkflowDefinition, reason: BobTaskSyncReason): Promise<void> {
    const sync = await bobTaskSyncRegistry.reconcileRun(root, run, workflow, {
      reason,
      task: reviewTaskRegistry.taskForRun(root, run.runId)
    })
    if (sync.status !== "synced") console.warn(sync.message)
    await this.options.runtimeFactory.createRunStore(root).saveRun(run)
  }

  private async ensureWorkflowsLoaded(): Promise<void> {
    if (this.options.coreWorkflows.size === 0) await this.options.ensureWorkflowsLoaded()
  }

  private async selectRunArgument(
    runArg: RunCommandArg,
    roots: MarkerRootCandidate[]
  ): Promise<RunSelection | undefined> {
    if (isOperationHubRunMutationTarget(runArg)) {
      const validated = await validateOperationHubRunMutationTarget(
        runArg,
        roots.map((candidate) => candidate.root)
      )
      return {
        root: validated.workspaceRoot,
        runId: runArg.runId,
        run: validated.snapshot.run
      }
    }
    const runId = resolveRunId(runArg)
    return runId
      ? findRunSelection(runId, roots, (root) => this.options.runtimeFactory.createRunStore(root))
      : pickRunSelection(roots, (root) => this.options.runtimeFactory.createRunStore(root))
  }

  private async validateOperationHubWorkflowRoot(
    target: OperationHubWorkflowMutationTarget,
    workflow: CoreWorkflowDefinition
  ): Promise<string> {
    const roots = await this.options.workflowRootCandidates()
    const workspaceRoot = await canonicalOperationHubWorkspaceRoot(
      target.workspaceRoot,
      roots.map((candidate) => candidate.root)
    )
    if (workflow.workflowRoot) {
      await canonicalOperationHubWorkspaceRoot(workflow.workflowRoot, [workspaceRoot])
    }
    return workspaceRoot
  }

  private async selectRun(runId?: string) {
    const roots = await this.options.workflowRootCandidates()
    if (roots.length === 0) return undefined
    return runId
      ? findRunSelection(runId, roots, (root) => this.options.runtimeFactory.createRunStore(root))
      : pickRunSelection(roots, (root) => this.options.runtimeFactory.createRunStore(root))
  }

  private async pickWorkflowRoot(title: string): Promise<string | undefined> {
    const candidates = await this.options.workflowRootCandidates()
    if (candidates.length === 0) return undefined
    if (candidates.length === 1) return candidates[0].root
    const picked = await vscode.window.showQuickPick(candidates.map((candidate) => ({
      label: candidate.name,
      description: candidate.root,
      detail: `${candidate.marker}; ${candidate.depth}; workspace=${candidate.workspaceFolderName}`,
      candidate
    })), { title })
    return picked?.candidate.root
  }

  private async pickCoreWorkflow(): Promise<CoreWorkflowDefinition | undefined> {
    const workflows = this.listCoreWorkflows()
    if (workflows.length === 0) return undefined
    if (workflows.length === 1) return workflows[0]
    const picked = await vscode.window.showQuickPick(workflows.map((workflow) => ({
      label: workflow.label,
      description: workflow.name,
      detail: workflow.description,
      workflow
    })), { title: "ワークフローを実行" })
    return picked?.workflow
  }

  private async pickWorkflowStep(
    workflow: CoreWorkflowDefinition
  ): Promise<CoreWorkflowDefinition["engineSteps"][number] | undefined> {
    if (workflow.engineSteps.length === 0) return undefined
    if (workflow.engineSteps.length === 1) return workflow.engineSteps[0]
    const picked = await vscode.window.showQuickPick(workflow.engineSteps.map((step, index) => ({
      label: step.title,
      description: step.id,
      detail: `${index + 1}. ${step.type}`,
      step
    })), { title: `ステップを実行: ${workflow.label}` })
    return picked?.step
  }

  private async warnStepGate(message: string): Promise<string> {
    await vscode.window.showWarningMessage(message)
    return message
  }
}

async function loadArtifactManifest(root: string, run: WorkflowRunState): Promise<WorkflowArtifactManifest | undefined> {
  const fromState = parseWorkflowArtifactManifest(run.state["workflow.artifactManifest"])
  if (fromState) return fromState
  try {
    const snapshot = await readContainedRunArtifactManifest(root, run.runId)
    return parseWorkflowArtifactManifest(snapshot.bytes.toString("utf8"))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

function assertArtifactSourceRunCompatible(run: WorkflowRunState, workflow: CoreWorkflowDefinition): void {
  if (run.workflowId !== workflow.id) {
    throw new Error(`Workflow artifact source run '${run.runId}' belongs to workflow '${run.workflowId}', not '${workflow.id}'.`)
  }
  if (
    run.workflowDefinitionHash
    && workflow.definitionHash
    && run.workflowDefinitionHash !== workflow.definitionHash
  ) {
    throw new Error(`Workflow artifact source run '${run.runId}' uses a different workflow definition.`)
  }
}

async function readOptionalPhysicallyContainedWorkspaceFile(root: string, relativePath: string): Promise<string | undefined> {
  try {
    return await readPhysicallyContainedWorkspaceFile(root, relativePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

async function readPhysicallyContainedWorkspaceFile(root: string, relativePath: string): Promise<string> {
  const lexicalRoot = path.resolve(root)
  const lexicalTarget = path.resolve(lexicalRoot, relativePath)
  assertContainedWorkspacePath(lexicalRoot, lexicalTarget, relativePath)
  const [physicalRoot, physicalTarget] = await Promise.all([
    fs.realpath(lexicalRoot),
    fs.realpath(lexicalTarget)
  ])
  assertContainedWorkspacePath(physicalRoot, physicalTarget, relativePath)
  const handle = await fs.open(physicalTarget, "r")
  try {
    const stat = await handle.stat()
    if (!stat.isFile()) throw new Error(`Artifact path is not a regular file: ${relativePath}`)
    return await handle.readFile({ encoding: "utf8" })
  } finally {
    await handle.close()
  }
}

function assertContainedWorkspacePath(root: string, target: string, label: string): void {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Artifact path escapes the physical workspace root: ${label}`)
  }
}

function formatSnapshotImportIssues(issues: TaskSnapshotArtifactImportIssue[]): string[] {
  if (issues.length === 0) return ["- ok: No task snapshot import issues."]
  return issues.map((issue) => `- ${issue.severity}: ${issue.artifactId ? `${issue.artifactId}: ` : ""}${issue.message}`)
}

function resolveRunId(value: RunCommandArg): string | undefined {
  if (typeof value === "string") return value
  if (!value || typeof value !== "object") return undefined
  if (typeof value.runId === "string") return value.runId
  if ("run" in value && value.run && typeof value.run.runId === "string") return value.run.runId
  return undefined
}

function ownerStepCompleted(
  run: WorkflowRunState,
  gate: BobWorkflowGateDecision & { ownerStepId: string }
): boolean {
  return run.steps.find((step) => step.id === gate.ownerStepId)?.status === "completed"
}

function isHumanGateStatus(status: WorkflowRunState["status"]): boolean {
  return status === "reviewing" || status === "held" || status === "checkpoint" || status === "paused"
}
