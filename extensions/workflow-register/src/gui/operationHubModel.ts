import * as path from "path"
import {
  ARTIFACT_MANIFEST_STATE_KEY,
  ARTIFACT_REUSE_STATE_KEY,
  TASK_SNAPSHOT_IMPORT_STATE_KEY,
  parseWorkflowArtifactManifest,
  type WorkflowArtifactManifest
} from "../core/artifacts"
import type { HeldRunRecoveryAssessment } from "../core/heldRunRecovery"
import type { CoreWorkflowDefinition, WorkflowRunState } from "../core/model"
import { projectWorkflowRunProvenance, type WorkflowStepProvenanceProjection } from "../core/runProvenance"
import { isWorkflowRunStateWritable } from "../core/runStateStore"
import { workflowRunStatusLabel, workflowStepCompletionLabel } from "../ui/displayLabels"

export const OPERATION_HUB_ALLOWED_ACTIONS = [
  "refresh",
  "openWorkflowBuilder",
  "validateWorkspaceWorkflows",
  "openRunControl",
  "openBazaarReview",
  "openConsistencyWizard",
  "runWorkflow",
  "startFromArtifacts",
  "recoverDetachedHeldRun",
  "importTaskSnapshotArtifacts",
  "resumeRun",
  "retryCurrentStep",
  "acceptCurrentStep",
  "acceptAndRunNextStep",
  "runNextStep",
  "openManualStepPanel",
  "pauseCurrentRun",
  "inspectRunControl",
  "openArtifact"
] as const

export type OperationHubActionId = typeof OPERATION_HUB_ALLOWED_ACTIONS[number]
export type OperationHubStatus = "ok" | "warning" | "error" | "info"

export interface OperationHubAction {
  id: OperationHubActionId
  label: string
  commandId?: string
  workflowId?: string
  runId?: string
  workspaceRoot?: string
  expectedRevision?: string
  artifactPath?: string
  variant?: "primary" | "secondary" | "danger"
  disabled?: boolean
  unavailableReason?: string
}

export interface OperationHubExtensionStatus {
  id: string
  label: string
  available: boolean
  unavailableReason?: string
}

export interface OperationHubSetupState {
  bobRootPresent: boolean
  workflowsPresent: boolean
  runStatePresent: boolean
  mcpConfigPresent: boolean
  traceabilityPresent: boolean
}

export interface OperationHubModelInput {
  workspaceName: string
  workspaceRoots: string[]
  extensionStatus: OperationHubExtensionStatus[]
  setup: OperationHubSetupState
  workflows: OperationHubWorkflowInput[]
  runs: OperationHubRunInput[]
  focusedRunId?: string
  focusedWorkspaceRoot?: string
}

export type OperationHubWorkflowInput = Pick<
  CoreWorkflowDefinition,
  "id" | "label" | "description" | "hidden" | "inputs" | "artifacts" | "category" | "workflowRoot"
>

export interface OperationHubRunInput {
  root: string
  run: WorkflowRunState
  revision?: string
  heldRecovery?: HeldRunRecoveryAssessment
}

export interface OperationHubHomeModel {
  workspaceName: string
  workspaceRoots: string[]
  activeRunCount: number
  workflowCount: number
  recommendedActions: OperationHubAction[]
}

export interface OperationHubSetupItem {
  id: string
  label: string
  status: OperationHubStatus
  message: string
  action?: OperationHubAction
}

export interface OperationHubWorkflowSummary {
  id: string
  label: string
  description: string
  category: string
  requiredInputCount: number
  artifactCount: number
  primaryActions: OperationHubAction[]
}

export interface OperationHubArtifactSummary {
  label: string
  displayPath: string
  workspacePath: string
  action: OperationHubAction
}

export interface OperationHubStepProvenanceSummary {
  stepId: string
  title: string
  status: string
  completionLabel: string
  detail: string
  reused: boolean
}


export interface OperationHubRunSummary {
  runId: string
  workflowId: string
  workflowName: string
  status: WorkflowRunState["status"]
  statusLabel: string
  currentStepLabel: string
  bobTaskSyncLabel: string
  bobTaskSyncStatus: OperationHubStatus
  artifactManifestLabel?: string
  artifactManifestStatus?: OperationHubStatus
  artifactReuseLabel?: string
  artifactReuseStatus?: OperationHubStatus
  taskSnapshotImportLabel?: string
  taskSnapshotImportStatus?: OperationHubStatus
  heldRecoveryKind?: HeldRunRecoveryAssessment["kind"]
  heldRecoveryTitle?: string
  heldRecoveryExplanation?: string
  heldRecoveryBlockers: string[]
  stepProvenance?: OperationHubStepProvenanceSummary[]
  stepProvenanceOmittedCount: number
  completedStepCount: number
  totalStepCount: number
  updatedAt: string
  root: string
  focused: boolean
  primaryActions: OperationHubAction[]
  artifacts: OperationHubArtifactSummary[]
}

export interface OperationHubModel {
  home: OperationHubHomeModel
  setupChecklist: OperationHubSetupItem[]
  workflowCatalog: OperationHubWorkflowSummary[]
  runMonitor: OperationHubRunSummary[]
}

interface ArtifactReuseState {
  sourceRunId?: string
  startStepId?: string
  reusedStepIds?: unknown[]
  hydratedKeys?: unknown[]
}

interface TaskSnapshotImportState {
  importedAt?: string
  imported?: unknown[]
}

export function buildOperationHubModel(input: OperationHubModelInput): OperationHubModel {
  const workflowCatalog = buildWorkflowCatalog(input.workflows)
  const runMonitor = input.runs
    .map((item) => summarizeRunForHub(
      item.root,
      item.run,
      input.focusedRunId,
      item.revision,
      input.focusedWorkspaceRoot,
      item.heldRecovery
    ))
    .sort((a, b) => Number(b.focused) - Number(a.focused) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 20)
  const activeRunCount = runMonitor.filter((run) => !["completed", "failed"].includes(run.status)).length
  return {
    home: {
      workspaceName: input.workspaceName,
      workspaceRoots: input.workspaceRoots,
      activeRunCount,
      workflowCount: workflowCatalog.length,
      recommendedActions: buildRecommendedActions(activeRunCount, input.extensionStatus)
    },
    setupChecklist: buildSetupChecklist(input.setup, input.extensionStatus),
    workflowCatalog,
    runMonitor
  }
}

export function summarizeRunForHub(
  root: string,
  run: WorkflowRunState,
  focusedRunId?: string,
  revision?: string,
  focusedWorkspaceRoot?: string,
  heldRecovery?: HeldRunRecoveryAssessment
): OperationHubRunSummary {
  const currentStep = run.steps.find((step) => step.id === run.currentStep)
  const completedStepCount = run.steps.filter((step) => step.status === "completed").length
  const bobTaskSync = summarizeBobTaskSync(run)
  const manifest = artifactManifestForRun(run)
  const artifactReuse = summarizeArtifactReuse(run)
  const taskSnapshotImport = summarizeTaskSnapshotImport(run)
  const provenance = projectWorkflowRunProvenance(run)
  const stepProvenance = provenance.steps.slice(0, 8).map(toOperationHubStepProvenance)
  return {
    runId: run.runId,
    workflowId: run.workflowId,
    workflowName: run.workflowName || run.workflowId,
    status: run.status,
    statusLabel: statusLabel(run),
    currentStepLabel: currentStep ? `${currentStep.id}: ${currentStep.title}` : run.currentStep ?? "未選択",
    bobTaskSyncLabel: bobTaskSync.label,
    bobTaskSyncStatus: bobTaskSync.status,
    artifactManifestLabel: manifest ? `再利用できる成果物: ${manifest.artifacts.length}件` : undefined,
    artifactManifestStatus: manifest ? "ok" : undefined,
    artifactReuseLabel: artifactReuse?.label,
    artifactReuseStatus: artifactReuse?.status,
    taskSnapshotImportLabel: taskSnapshotImport?.label,
    taskSnapshotImportStatus: taskSnapshotImport?.status,
    heldRecoveryKind: heldRecovery?.kind,
    heldRecoveryTitle: heldRecovery?.title,
    heldRecoveryExplanation: heldRecovery?.explanation,
    heldRecoveryBlockers: heldRecovery?.blockers.slice(0, 5) ?? [],
    stepProvenance,
    stepProvenanceOmittedCount: Math.max(0, provenance.steps.length - stepProvenance.length),
    completedStepCount,
    totalStepCount: run.steps.length,
    updatedAt: run.updatedAt,
    root,
    focused: run.runId === focusedRunId && (
      !focusedWorkspaceRoot || sameWorkspaceRoot(root, focusedWorkspaceRoot)
    ),
    primaryActions: actionsForRun(root, run, Boolean(manifest?.artifacts.length), revision, heldRecovery),
    artifacts: artifactsForRun(root, run, manifest)
  }
}

function sameWorkspaceRoot(left: string, right: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value)
    return process.platform === "win32" ? resolved.toLowerCase() : resolved
  }
  return normalize(left) === normalize(right)
}

function buildRecommendedActions(activeRunCount: number, extensions: readonly OperationHubExtensionStatus[]): OperationHubAction[] {
  const actions: OperationHubAction[] = [
    integrationAction(extensions, "local.bob-bazaar-review", "openBazaarReview", "Bazaar レビューを開始", "bobBazaar.openReviewGui"),
    integrationAction(extensions, "local.bob-code-consistency-review", "openConsistencyWizard", "整合プレレビューを開始", "bobCodeConsistency.openReviewWizard"),
    { id: "openWorkflowBuilder", label: "ワークフローを作る", commandId: "workflowRegister.openWorkflowBuilder" },
    { id: "validateWorkspaceWorkflows", label: "セットアップを再確認", commandId: "workflowRegister.validateWorkspaceWorkflows" }
  ]
  if (activeRunCount > 0) {
    actions.splice(2, 0, { id: "openRunControl", label: "前回の続きを確認", commandId: "workflowRegister.inspectRunControl", variant: "primary" })
  }
  return actions
}

function buildSetupChecklist(setup: OperationHubSetupState, extensions: OperationHubExtensionStatus[]): OperationHubSetupItem[] {
  const items: OperationHubSetupItem[] = extensions.map((extension) => ({
    id: `extension:${extension.id}`,
    label: extension.label,
    status: extension.available ? "ok" : "warning",
    message: extension.available ? "有効化済みです。" : "未検出です。標準導線は表示しますが、実行時に拡張の導入が必要です。"
  }))
  items.push(
    {
      id: "bobRoot",
      label: ".bob",
      status: setup.bobRootPresent ? "ok" : "warning",
      message: setup.bobRootPresent ? ".bob が見つかりました。" : ".bob が未作成です。初期化またはテンプレート作成を実行してください。",
      action: setup.bobRootPresent ? undefined : { id: "openWorkflowBuilder", label: "ワークフローを作る", commandId: "workflowRegister.openWorkflowBuilder" }
    },
    {
      id: "workflows",
      label: ".bob/workflows",
      status: setup.workflowsPresent ? "ok" : "warning",
      message: setup.workflowsPresent ? "ワークフロー定義を検出しました。" : "ワークフロー定義が未検出です。",
      action: setup.workflowsPresent ? undefined : { id: "openWorkflowBuilder", label: "作成する", commandId: "workflowRegister.openWorkflowBuilder" }
    },
    {
      id: "runState",
      label: "実行状態",
      status: setup.runStatePresent ? "ok" : "info",
      message: setup.runStatePresent ? "実行履歴を検出しました。" : "まだ実行履歴はありません。"
    },
    {
      id: "mcpConfig",
      label: "Bazaar MCP",
      status: setup.mcpConfigPresent ? "ok" : "warning",
      message: setup.mcpConfigPresent ? ".bob/mcp.json を検出しました。" : "Bazaar 連携が必要な場合は MCP 設定を作成してください。",
      action: setup.mcpConfigPresent ? undefined : integrationAction(extensions, "local.bob-bazaar-review", "openBazaarReview", "Bazaar レビューを開く", "bobBazaar.openReviewGui")
    },
    {
      id: "traceability",
      label: "トレーサビリティ",
      status: setup.traceabilityPresent ? "ok" : "info",
      message: setup.traceabilityPresent ? "トレーサビリティ補助台帳を検出しました。" : "整合プレレビュー時に必要に応じて作成します。"
    }
  )
  return items
}

function integrationAction(
  extensions: readonly OperationHubExtensionStatus[],
  extensionId: string,
  id: "openBazaarReview" | "openConsistencyWizard",
  label: string,
  commandId: string
): OperationHubAction {
  const extension = extensions.find((candidate) => candidate.id === extensionId)
  const unavailableReason = extension && !extension.available
    ? extension.unavailableReason || `${extension.label} 拡張がインストールされていません。`
    : undefined
  return {
    id,
    label,
    commandId,
    variant: "primary",
    disabled: Boolean(unavailableReason),
    unavailableReason
  }
}

function buildWorkflowCatalog(workflows: OperationHubWorkflowInput[]): OperationHubWorkflowSummary[] {
  return workflows
    .filter((workflow) => !workflow.hidden)
    .map((workflow) => ({
      id: workflow.id,
      label: workflow.label || workflow.id,
      description: workflow.description || "",
      category: workflow.category || "未分類",
      requiredInputCount: Object.values(workflow.inputs || {}).filter((input) => Boolean(input.required)).length,
      artifactCount: workflow.artifacts?.length ?? 0,
      primaryActions: [
        {
          id: "runWorkflow",
          label: "開始",
          commandId: "workflowRegister.runWorkflow",
          workflowId: workflow.id,
          workspaceRoot: workflow.workflowRoot,
          variant: "primary"
        } satisfies OperationHubAction
      ]
    }))
    .sort((a, b) => `${a.category}:${a.label}`.localeCompare(`${b.category}:${b.label}`, "ja"))
}

function actionsForRun(root: string, run: WorkflowRunState, hasReusableArtifacts: boolean, revision?: string, heldRecovery?: HeldRunRecoveryAssessment): OperationHubAction[] {
  const target = { runId: run.runId, workspaceRoot: root, expectedRevision: revision }
  const inspect = { id: "inspectRunControl", label: "詳細", commandId: "workflowRegister.inspectRunControl", ...target } as const
  if (!isWorkflowRunStateWritable(run)) return [inspect]
  const startFromArtifacts = hasReusableArtifacts
    ? {
      id: "startFromArtifacts",
      label: "成果物から開始",
      commandId: "workflowRegister.startFromStepWithArtifacts",
      workflowId: run.workflowId,
      ...target,
      variant: run.status === "completed" ? "primary" : "secondary"
    } satisfies OperationHubAction
    : undefined
  const withReuse = (actions: OperationHubAction[]) => startFromArtifacts ? [startFromArtifacts, ...actions] : actions
  const current = run.currentStep ? run.steps.find((step) => step.id === run.currentStep) : undefined
  switch (run.status) {
    case "reviewing":
      return withReuse([
        { id: "acceptAndRunNextStep", label: "承認して次へ", commandId: "workflowRegister.acceptAndRunNextStep", ...target, variant: "primary" },
        { id: "retryCurrentStep", label: "再試行", commandId: "workflowRegister.retryCurrentStep", ...target },
        inspect
      ])
    case "held":
      return actionsForHeldRun(run, target, inspect, startFromArtifacts, heldRecovery)
    case "paused":
      return withReuse([
        { id: "resumeRun", label: "再開", commandId: "workflowRegister.resumePausedRun", ...target, variant: "primary" },
        inspect
      ])
    case "failed":
      return withReuse([
        { id: "retryCurrentStep", label: "再試行", commandId: "workflowRegister.retryCurrentStep", ...target, variant: "primary" },
        inspect
      ])
    case "running":
      if (current?.status === "pending") {
        return withReuse([
          { id: "runNextStep", label: "次へ", commandId: "workflowRegister.runNextStep", ...target, variant: "primary" },
          inspect
        ])
      }
      return withReuse([
        { id: "pauseCurrentRun", label: "一時停止", commandId: "workflowRegister.pauseCurrentRun", ...target },
        inspect
      ])
    default:
      return withReuse([inspect])
  }
}

function actionsForHeldRun(
  run: WorkflowRunState,
  target: { runId: string; workspaceRoot: string; expectedRevision?: string },
  inspect: OperationHubAction,
  startFromArtifacts: OperationHubAction | undefined,
  heldRecovery: HeldRunRecoveryAssessment | undefined
): OperationHubAction[] {
  let primary: OperationHubAction
  switch (heldRecovery?.primaryAction.id) {
    case "open-manual-step":
      primary = { id: "openManualStepPanel", label: "手動ステップを完了", commandId: "workflowRegister.openManualStepPanel", ...target, variant: "primary" }
      break
    case "resume-saved-state":
      primary = { id: "recoverDetachedHeldRun", label: "保存済み状態から再開", commandId: "workflowRegister.recoverDetachedHeldRun", ...target, variant: "primary" }
      break
    case "review-artifacts":
      primary = startFromArtifacts
        ? { ...startFromArtifacts, label: "成果物を確認して途中再開", variant: "primary" }
        : { ...inspect, label: "復旧診断を開く", variant: "primary" }
      break
    case "review-task-snapshot":
      primary = { id: "importTaskSnapshotArtifacts", label: "保存済みタスクを確認", commandId: "workflowRegister.importArtifactsFromTaskSnapshots", ...target, variant: "primary" }
      break
    default:
      primary = { ...inspect, label: "復旧診断を開く", variant: "primary" }
      break
  }
  return primary.id === "inspectRunControl" ? [primary] : [primary, inspect]
}

function artifactsForRun(root: string, run: WorkflowRunState, manifest?: WorkflowArtifactManifest): OperationHubArtifactSummary[] {
  const manifestArtifacts = (manifest?.artifacts ?? []).map((artifact) => artifactSummary(root, artifact.stateKey || artifact.id, artifact.path))
  const stateArtifacts = Object.entries(run.state)
    .filter(([, value]) => typeof value === "string")
    .map(([key, rawValue]) => ({ key, rawValue: String(rawValue) }))
    .filter((item) => item.key !== ARTIFACT_MANIFEST_STATE_KEY && looksLikeArtifactPath(item.rawValue))
    .map((item) => artifactSummary(root, item.key, item.rawValue))
  return uniqueArtifacts([...manifestArtifacts, ...stateArtifacts]).slice(0, 8)
}

function artifactSummary(root: string, label: string, rawPath: string): OperationHubArtifactSummary {
  const workspacePath = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(root, rawPath)
  return {
    label,
    displayPath: path.relative(root, workspacePath).replace(/\\/g, "/") || rawPath,
    workspacePath,
    action: {
      id: "openArtifact",
      label: "成果物を開く",
      commandId: "vscode.open",
      artifactPath: workspacePath
    } satisfies OperationHubAction
  }
}

function uniqueArtifacts(values: OperationHubArtifactSummary[]): OperationHubArtifactSummary[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = value.workspacePath
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function looksLikeArtifactPath(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.includes("\n") || trimmed.includes("\0")) return false
  if (trimmed.startsWith("..")) return false
  return /^\.bob[/-]/i.test(trimmed) || /^\.bob-/i.test(trimmed) || /\.(md|json|ya?ml|txt|csv|html)$/i.test(trimmed) || path.isAbsolute(trimmed)
}

function toOperationHubStepProvenance(step: WorkflowStepProvenanceProjection): OperationHubStepProvenanceSummary {
  const completionLabel = workflowStepCompletionLabel(step.completion, step.runStatus)
  const detail = [
    step.skippedByArtifactReuse ? "成果物を再利用したため省略" : undefined,
    step.sourceRunId ? `再利用元: ${step.sourceRunId}` : undefined,
    step.artifactVerified ? "成果物を確認済み" : undefined,
    step.importedFromTaskSnapshot ? "保存済みタスクから取り込み" : undefined,
    step.artifactIds.length > 0 ? `成果物: ${step.artifactIds.join(", ")}` : undefined,
    step.hydratedStateKeys.length > 0 ? `復元した状態キー: ${step.hydratedStateKeys.join(", ")}` : undefined
  ].filter((value): value is string => Boolean(value)).join(" · ")
  return {
    stepId: step.stepId,
    title: step.title,
    status: step.runStatus,
    completionLabel,
    detail,
    reused: step.completion === "reused"
  }
}

function summarizeBobTaskSync(run: WorkflowRunState): { label: string; status: OperationHubStatus } {
  const sync = run.bobTaskSync
  const status = sync?.drift?.status ?? "unknown"
  const through = sync?.completedThroughStepId ? ` / 完了済み: ${sync.completedThroughStepId}` : ""
  if (status === "synced" && sync?.liveTaskAvailable === false) {
    return { label: `Bob Todo: 保存済みの進捗のみ（現在のタスクには接続できません）${through}`, status: "warning" }
  }
  switch (status) {
    case "synced":
      return { label: `Bob Todo: 同期済み${through}`, status: "ok" }
    case "taskUnavailable":
      return { label: "Bob Todo: 修復待ち（run.json を基準にします）", status: "warning" }
    case "requiresNewBobTask":
      return { label: "Bob Todo: 巻き戻せません。run.json から新しいタスクを開始してください", status: "error" }
    case "repairFailed":
      return { label: "Bob Todo: 修復に失敗しました（run.json を基準にします）", status: "error" }
    case "repairPending":
      return { label: "Bob Todo: 修復待ち", status: "warning" }
    default:
      return { label: "Bob Todo: まだ関連付けられていません", status: "info" }
  }
}

function summarizeArtifactReuse(run: WorkflowRunState): { label: string; status: OperationHubStatus } | undefined {
  const value = run.state[ARTIFACT_REUSE_STATE_KEY]
  if (typeof value !== "string") return undefined
  const parsed = parseJsonObject(value) as ArtifactReuseState | undefined
  if (!parsed) return undefined
  const reused = Array.isArray(parsed.reusedStepIds) ? parsed.reusedStepIds.length : 0
  const hydrated = Array.isArray(parsed.hydratedKeys) ? parsed.hydratedKeys.length : 0
  const source = parsed.sourceRunId ? ` / 再利用元: ${parsed.sourceRunId}` : ""
  const start = parsed.startStepId ? ` / 開始ステップ: ${parsed.startStepId}` : ""
  return { label: `成果物を再利用: ${reused}ステップ、状態キー ${hydrated}件${source}${start}`, status: "ok" }
}

function summarizeTaskSnapshotImport(run: WorkflowRunState): { label: string; status: OperationHubStatus } | undefined {
  const value = run.state[TASK_SNAPSHOT_IMPORT_STATE_KEY]
  if (typeof value !== "string") return undefined
  const parsed = parseJsonObject(value) as TaskSnapshotImportState | undefined
  if (!parsed) return undefined
  const count = Array.isArray(parsed.imported) ? parsed.imported.length : 0
  const at = parsed.importedAt ? ` / ${parsed.importedAt}` : ""
  return { label: `保存済みタスクから取り込み: 成果物 ${count}件${at}`, status: "ok" }
}

function artifactManifestForRun(run: WorkflowRunState): WorkflowArtifactManifest | undefined {
  return parseWorkflowArtifactManifest(run.state[ARTIFACT_MANIFEST_STATE_KEY])
}

function parseJsonObject(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

function statusLabel(run: WorkflowRunState): string {
  const current = run.currentStep ? run.steps.find((step) => step.id === run.currentStep) : undefined
  if (run.status === "running" && current?.status === "pending") return "次のステップを実行できます"
  return workflowRunStatusLabel(run.status)
}
