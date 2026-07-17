import type { CoreWorkflowDefinition, EngineStep, WorkflowRunState } from "./model"

export type HeldRunRecoveryKind =
  | "not-held"
  | "connected"
  | "detached-resumable"
  | "detached-artifact-recoverable"
  | "blocked"

export type HeldRunRecoveryActionId =
  | "none"
  | "open-manual-step"
  | "resume-saved-state"
  | "review-artifacts"
  | "review-task-snapshot"
  | "open-diagnostics"

export interface HeldRunRecoveryAction {
  id: HeldRunRecoveryActionId
  label: string
}

export interface HeldRunRecoveryEvidence {
  liveTaskAvailable: boolean
  activeManualStepAvailable: boolean
  workflowLoaded: boolean
  definitionCompatible: boolean
  artifactManifestAvailable: boolean
  taskSnapshotAvailable: boolean
  missingRequiredStateKeys: string[]
}

export interface HeldRunRecoveryAssessment {
  kind: HeldRunRecoveryKind
  runId: string
  stepId?: string
  nextStepId?: string
  title: string
  explanation: string
  primaryAction: HeldRunRecoveryAction
  blockers: string[]
  evidence: HeldRunRecoveryEvidence
}

export interface ClassifyHeldRunRecoveryInput {
  run: WorkflowRunState
  workflow?: CoreWorkflowDefinition
  liveTaskAvailable: boolean
  activeManualStepAvailable: boolean
  artifactManifestAvailable: boolean
  taskSnapshotAvailable: boolean
}

export const HELD_RECOVERY_STATE_KEY = "workflow.heldRecovery"

export interface HeldRunRecoveryProvenanceV1 {
  schemaVersion: "workflow-register/held-recovery/v1"
  kind: "saved-state"
  runId: string
  stepId: string
  nextStepId?: string
  recoveredAt: string
  source: "operation-hub"
}

export interface CreateHeldRunRecoveryProvenanceInput {
  runId: string
  stepId: string
  nextStepId?: string
  recoveredAt: string
  source: "operation-hub"
}

export function createHeldRunRecoveryProvenance(input: CreateHeldRunRecoveryProvenanceInput): HeldRunRecoveryProvenanceV1 {
  return {
    schemaVersion: "workflow-register/held-recovery/v1",
    kind: "saved-state",
    runId: input.runId,
    stepId: input.stepId,
    nextStepId: input.nextStepId,
    recoveredAt: input.recoveredAt,
    source: input.source
  }
}

export function buildHeldRunRecoveryPreview(
  run: WorkflowRunState,
  assessment: HeldRunRecoveryAssessment
): string[] {
  const stateKeys = Object.keys(run.state).sort()
  return [
    `- 実行 ID（runId）: ${run.runId}`,
    `- ワークフロー: ${run.workflowId}`,
    `- 現在の状態: ${run.status}`,
    `- 完了対象の手動待ちステップ: ${assessment.stepId ?? "なし"}`,
    `- 次のステップ: ${assessment.nextStepId ?? "ワークフロー完了"}`,
    `- 保存済み状態キー: ${stateKeys.length > 0 ? stateKeys.join(", ") : "なし"}`,
    "- 状態値、フォーム入力値、保存済みタスクの本文、成果物本文は表示しません。"
  ]
}

const ACTIONS: Record<HeldRunRecoveryActionId, HeldRunRecoveryAction> = {
  none: { id: "none", label: "復旧操作はありません" },
  "open-manual-step": { id: "open-manual-step", label: "手動ステップを開く" },
  "resume-saved-state": { id: "resume-saved-state", label: "保存済み状態から再開" },
  "review-artifacts": { id: "review-artifacts", label: "再利用できる成果物を確認" },
  "review-task-snapshot": { id: "review-task-snapshot", label: "保存済みタスクを確認" },
  "open-diagnostics": { id: "open-diagnostics", label: "実行診断を開く" }
}

export function classifyHeldRunRecovery(input: ClassifyHeldRunRecoveryInput): HeldRunRecoveryAssessment {
  const { run, workflow } = input
  const runStep = run.currentStep
    ? run.steps.find((step) => step.id === run.currentStep && step.status === "held")
    : undefined
  const workflowStep = run.currentStep
    ? workflow?.engineSteps.find((step) => step.id === run.currentStep)
    : undefined
  const workflowCurrentIndex = workflowStep
    ? workflow?.engineSteps.findIndex((step) => step.id === workflowStep.id) ?? -1
    : -1
  const nextWorkflowStep = workflowCurrentIndex >= 0
    ? workflow?.engineSteps[workflowCurrentIndex + 1]
    : undefined
  const missingRequiredStateKeys = uniqueStrings([
    ...(workflowStep ? requiredStateKeysMissing(workflowStep, run.state) : []),
    ...(nextWorkflowStep ? requiredStateKeysMissing(nextWorkflowStep, run.state) : [])
  ])
  const definitionCompatible = Boolean(workflow && definitionMatches(run, workflow) && stepOrderMatches(run, workflow))
  const evidence: HeldRunRecoveryEvidence = {
    liveTaskAvailable: input.liveTaskAvailable,
    activeManualStepAvailable: input.activeManualStepAvailable,
    workflowLoaded: Boolean(workflow),
    definitionCompatible,
    artifactManifestAvailable: input.artifactManifestAvailable,
    taskSnapshotAvailable: input.taskSnapshotAvailable,
    missingRequiredStateKeys
  }

  if (run.status !== "held") {
    return assessment({
      kind: "not-held",
      run,
      evidence,
      title: "この実行は手動操作待ちではありません",
      explanation: "切断された手動ステップの復旧は、保存済みの実行状態が手動操作待ちの場合だけ利用できます。",
      primaryAction: ACTIONS.none
    })
  }

  if (runStep && (input.liveTaskAvailable || input.activeManualStepAvailable)) {
    return assessment({
      kind: "connected",
      run,
      stepId: runStep.id,
      evidence,
      title: "手動ステップに接続済みです",
      explanation: "利用中の Bob タスクまたは手動ステップに接続できます。既存の手動ステップ画面から続行してください。",
      primaryAction: ACTIONS["open-manual-step"]
    })
  }

  const blockers: string[] = []
  if (!workflow) blockers.push(`ワークフロー定義が読み込まれていません: ${run.workflowId}`)
  if (!runStep) blockers.push(`現在の手動操作待ちステップが保存済み実行にありません: ${run.currentStep ?? "なし"}`)
  if (workflow && !workflowStep) blockers.push(`現在の手動操作待ちステップがワークフロー定義にありません: ${run.currentStep ?? "なし"}`)
  if (workflow && !definitionMatches(run, workflow)) blockers.push("現在のワークフロー定義が、この実行で使用した定義と一致しません。")
  if (workflow && !stepOrderMatches(run, workflow)) blockers.push("ワークフローのステップ順または識別子が、保存済み実行と一致しません。")
  if (missingRequiredStateKeys.length > 0) {
    blockers.push(`必要なワークフロー状態がありません: ${missingRequiredStateKeys.join(", ")}`)
  }
  if (workflowStep?.type === "manual") blockers.push(...manualCompletionBlockers(workflowStep, run.state))

  if (blockers.length > 0) {
    if (input.artifactManifestAvailable) {
      return assessment({
        kind: "detached-artifact-recoverable",
        run,
        stepId: runStep?.id,
        evidence,
        blockers,
        title: "成果物を使った復旧が必要です",
        explanation: "保存済み状態から直接再開できませんが、再利用できる成果物があります。内容を確認して復旧してください。",
        primaryAction: ACTIONS["review-artifacts"]
      })
    }
    if (input.taskSnapshotAvailable) {
      return assessment({
        kind: "detached-artifact-recoverable",
        run,
        stepId: runStep?.id,
        evidence,
        blockers,
        title: "保存済みタスクからの復旧が必要です",
        explanation: "保存済み状態から直接再開できませんが、保存済みタスクを確認して必要な成果物だけ取り込めます。",
        primaryAction: ACTIONS["review-task-snapshot"]
      })
    }
    return assessment({
      kind: "blocked",
      run,
      stepId: runStep?.id,
      evidence,
      blockers,
      title: "中断した実行を安全に復旧できません",
      explanation: "診断結果を解消するか、互換性のある復旧根拠を用意するまで安全に再開できません。",
      primaryAction: ACTIONS["open-diagnostics"]
    })
  }

  const currentIndex = workflow?.engineSteps.findIndex((step) => step.id === runStep?.id) ?? -1
  const nextStepId = currentIndex >= 0 ? workflow?.engineSteps[currentIndex + 1]?.id : undefined
  return assessment({
    kind: "detached-resumable",
    run,
    stepId: runStep?.id,
    nextStepId,
    evidence,
    title: "保存済み状態から再開できます",
    explanation: "保存済みの定義、ステップ順、必要な状態に互換性があります。切断された手動ステップを完了する前に確認が必要です。",
    primaryAction: ACTIONS["resume-saved-state"]
  })
}

function assessment(input: Omit<HeldRunRecoveryAssessment, "runId" | "blockers"> & {
  run: WorkflowRunState
  blockers?: string[]
}): HeldRunRecoveryAssessment {
  return {
    kind: input.kind,
    runId: input.run.runId,
    stepId: input.stepId,
    nextStepId: input.nextStepId,
    title: input.title,
    explanation: input.explanation,
    primaryAction: { ...input.primaryAction },
    blockers: [...(input.blockers ?? [])],
    evidence: {
      ...input.evidence,
      missingRequiredStateKeys: [...input.evidence.missingRequiredStateKeys]
    }
  }
}

function definitionMatches(run: WorkflowRunState, workflow: CoreWorkflowDefinition): boolean {
  if (!run.workflowDefinitionHash || !workflow.definitionHash) return true
  return run.workflowDefinitionHash === workflow.definitionHash
}

function stepOrderMatches(run: WorkflowRunState, workflow: CoreWorkflowDefinition): boolean {
  const currentIndex = run.currentStep ? run.steps.findIndex((step) => step.id === run.currentStep) : -1
  if (currentIndex < 0) return false
  for (let index = 0; index <= currentIndex; index += 1) {
    if (run.steps[index]?.id !== workflow.engineSteps[index]?.id) return false
  }
  return true
}

function manualCompletionBlockers(
  step: Extract<EngineStep, { type: "manual" }>,
  state: Record<string, string>
): string[] {
  const blockers: string[] = []
  if (step.form?.resultKey) {
    const raw = state[step.form.resultKey]
    const value = raw === undefined ? undefined : parseStateValue(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      blockers.push(`保存済みの手動フォーム結果がありません: ${step.form.resultKey}`)
    } else {
      const record = value as Record<string, unknown>
      for (const field of step.form.fields.filter((candidate) => candidate.required)) {
        if (!manualFieldValuePresent(record[field.id])) {
          blockers.push(`必須の手動フォーム項目がありません: ${field.id}（${step.form.resultKey}）`)
        }
      }
    }
  }
  if (step.approval?.resultKey) {
    const raw = state[step.approval.resultKey]
    const value = raw === undefined ? undefined : parseStateValue(raw)
    const decision = value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).decision
      : undefined
    if (decision !== "approved" && decision !== "rejected") {
      blockers.push(`保存済みの手動承認結果がありません: ${step.approval.resultKey}`)
    }
  }
  return blockers
}

function parseStateValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function manualFieldValuePresent(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "string") return value.trim().length > 0
  return true
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)))
}

function requiredStateKeysMissing(step: EngineStep, state: Record<string, string>): string[] {
  if (!step.stateRequired) return []
  const seen = new Set<string>()
  const missing: string[] = []
  for (const key of step.includeState ?? []) {
    if (!key || seen.has(key)) continue
    seen.add(key)
    const value = state[key]
    if (value === undefined || value.trim().length === 0) missing.push(key)
  }
  return missing
}
