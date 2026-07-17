import type { RunStepState, WorkflowRunState } from "./model"
import { projectWorkflowRunProvenance, type WorkflowRunProvenanceProjection } from "./runProvenance"
import type { RunControlState } from "./runControlStore"
import { CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION } from "./runtime/runStateCodec"
import type { RunStateLoadDiagnostic } from "./runtime/runStateCodec"
import type { TaskSnapshotSummary } from "./taskSnapshots"

export interface WorkflowRunDiagnosticReport {
  title: string
  summary: string
  lines: string[]
}

export interface WorkflowRunDurabilitySummary {
  eventCount: number
  eventHeadHash?: string
  journalPending: boolean
  lockPresent: boolean
}

export interface WorkflowRunDiagnosticOptions {
  snapshotsByRunId?: Record<string, TaskSnapshotSummary[]>
  runDocumentDiagnostics?: RunStateLoadDiagnostic[]
  durabilityByRunId?: Record<string, WorkflowRunDurabilitySummary>
  controlsByRunId?: Record<string, RunControlState | undefined>
}

export function buildWorkflowRunDiagnosticReport(runs: WorkflowRunState[], options: WorkflowRunDiagnosticOptions = {}): WorkflowRunDiagnosticReport {
  const lines = runs.length === 0 ? ["- ワークフロー実行履歴はありません。"] : runs.flatMap((run) => [
    ...formatWorkflowRunDiagnostics(run, {
      snapshots: options.snapshotsByRunId?.[run.runId] ?? [],
      durability: options.durabilityByRunId?.[run.runId],
      control: options.controlsByRunId?.[run.runId]
    }),
    ""
  ])
  if (lines[lines.length - 1] === "") lines.pop()
  const documentDiagnostics = options.runDocumentDiagnostics ?? []
  if (documentDiagnostics.length > 0) {
    if (lines.length > 0) lines.push("")
    lines.push("実行状態ファイルの診断:")
    for (const diagnostic of documentDiagnostics) {
      lines.push(`- ${diagnostic.runId} [${diagnostic.severity}/${diagnostic.code}]: ${diagnostic.message}`)
    }
  }
  const failed = runs.filter((run) => run.status === "failed").length
  const paused = runs.filter((run) => run.status === "paused").length
  const reviewing = runs.filter((run) => run.status === "reviewing").length
  const held = runs.filter((run) => run.status === "held").length
  const attempts = runs.reduce((sum, run) => sum + run.steps.reduce((stepSum, step) => stepSum + (step.attempts?.length ?? 0), 0), 0)
  const pausedPart = paused > 0 ? ` 一時停止 ${paused}件;` : ""
  const documentPart = documentDiagnostics.length > 0 ? `; 実行状態ファイルの診断 ${documentDiagnostics.length}件` : ""
  const durabilityCount = Object.keys(options.durabilityByRunId ?? {}).length
  const durabilityPart = durabilityCount > 0 ? `; 耐久性情報 ${durabilityCount}件` : ""
  return {
    title: "ワークフロー実行診断",
    summary: `${runs.length}件; 失敗 ${failed}件;${pausedPart} 確認待ち ${reviewing}件; 手動操作待ち ${held}件; 保存済み試行 ${attempts}件${documentPart}${durabilityPart}。`,
    lines
  }
}

export function formatWorkflowRunDiagnostics(
  run: WorkflowRunState,
  options: { snapshots?: TaskSnapshotSummary[]; durability?: WorkflowRunDurabilitySummary; control?: RunControlState } = {}
): string[] {
  const schemaVersion = run.schemaVersion ?? "未設定"
  const lines = [
    `## ${run.runId}`,
    "",
    `- 状態: ${runStatusLabel(run.status)}`,
    `- ワークフロー: ${run.workflowId}`,
    `- ワークフロー名: ${run.workflowName}`,
    `- 実行状態スキーマ: ${schemaVersion}`,
    `- 現在のステップ: ${run.currentStep ?? "なし"}`,
    `- 更新日時: ${run.updatedAt}`
  ]
  if (run.schemaVersion && run.schemaVersion !== CURRENT_WORKFLOW_RUN_STATE_SCHEMA_VERSION) {
    lines.push("- 実行状態へのアクセス: 読み取り専用")
  }
  if (options.durability) {
    lines.push(
      "",
      "実行データの耐久性:",
      `- 不変イベント: ${options.durability.eventCount}`,
      `- イベント先頭: ${options.durability.eventHeadHash ?? "なし"}`,
      `- ジャーナル: ${options.durability.journalPending ? "保留中" : "なし"}`,
      `- 実行ロック: ${options.durability.lockPresent ? "あり" : "なし"}`
    )
  }
  if (run.error) {
    lines.push(`- エラー: ${run.error}`)
    const hint = workflowRunFailureHint(run.error)
    if (hint) lines.push(`- 推奨対応: ${hint}`)
  }
  if (run.state["workflow.definitionMismatch"]) lines.push(`- ワークフロー定義の不一致: ${run.state["workflow.definitionMismatch"]}`)
  appendPauseDiagnostics(lines, run.state["workflow.pause"], options.control)
  const provenanceLines = formatWorkflowProvenanceDiagnostics(projectWorkflowRunProvenance(run))
  if (provenanceLines.length > 0) lines.push("", ...provenanceLines)
  const problemStep = currentProblemStep(run)
  if (problemStep) {
    lines.push("", "現在対応が必要なステップ:", `- ID: ${problemStep.id}`, `- 表示名: ${problemStep.title}`, `- 種別: ${problemStep.type}`, `- 状態: ${stepStatusLabel(problemStep.status)}`, `- 現在の試行: ${problemStep.attempt ?? 1}`, `- 保存済み試行: ${problemStep.attempts?.length ?? 0}`)
    if (problemStep.reviewStartedAt) lines.push(`- 確認開始日時: ${problemStep.reviewStartedAt}`)
    if (problemStep.acceptedAt) lines.push(`- 承認日時: ${problemStep.acceptedAt}`)
    if (problemStep.error) {
      lines.push(`- ステップエラー: ${problemStep.error}`)
      const hint = workflowRunFailureHint(problemStep.error)
      if (hint) lines.push(`- ステップの推奨対応: ${hint}`)
    }
  }
  const branchingLines = formatBranchingDiagnostics(run)
  if (branchingLines.length > 0) lines.push("", ...branchingLines)
  const stateKeys = Object.keys(run.state).sort()
  lines.push("", "状態キー:", stateKeys.length === 0 ? "- 状態キーはありません" : `- キー: ${stateKeys.join(", ")}`)
  if (run.state["workflow.preflightWarnings"]) lines.push(`- 事前確認の警告: ${run.state["workflow.preflightWarnings"]}`)
  lines.push("", "ステップ:")
  for (const step of run.steps) {
    lines.push(`- ${step.id}: ${stepStatusLabel(step.status)}; 試行=${step.attempt ?? 1}; 保存済み試行=${step.attempts?.length ?? 0}${step.reviewStartedAt ? `; 確認開始日時=${step.reviewStartedAt}` : ""}${step.acceptedAt ? `; 承認日時=${step.acceptedAt}` : ""}${step.error ? `; エラー=${step.error}` : ""}`)
    appendAttemptSummaries(lines, step)
  }
  appendTaskSnapshots(lines, run, options.snapshots ?? [])
  return lines
}

export function formatWorkflowProvenanceDiagnostics(provenance: WorkflowRunProvenanceProjection): string[] {
  const verifiedArtifacts = Array.from(new Set(provenance.steps
    .filter((step) => step.artifactVerified)
    .flatMap((step) => step.artifactIds)))
  const hasProvenance = Boolean(
    provenance.sourceRunId
    || provenance.startStepId
    || provenance.reusedStepIds.length > 0
    || provenance.hydratedStateKeys.length > 0
    || provenance.artifactIds.length > 0
    || provenance.taskSnapshotImportCount > 0
    || provenance.heldRecovery
    || provenance.definitionMismatchAllowed
  )
  if (!hasProvenance) return []

  const lines = ["ワークフローの来歴:"]
  if (provenance.sourceRunId) lines.push(`- 再利用元の実行: ${provenance.sourceRunId}`)
  if (provenance.startStepId) lines.push(`- 開始ステップ: ${provenance.startStepId}`)
  if (provenance.reusedStepIds.length > 0) lines.push(`- 再利用したステップ: ${provenance.reusedStepIds.join(", ")}`)
  if (provenance.hydratedStateKeys.length > 0) lines.push(`- 復元した状態キー: ${provenance.hydratedStateKeys.join(", ")}`)
  if (verifiedArtifacts.length > 0) lines.push(`- 確認済みの成果物: ${verifiedArtifacts.join(", ")}`)
  if (provenance.taskSnapshotImportCount > 0) {
    lines.push(`- 保存済みタスクから取り込み: ${provenance.taskSnapshotImportCount}件${provenance.taskSnapshotImportedAt ? `（${provenance.taskSnapshotImportedAt}）` : ""}`)
  }
  if (provenance.heldRecovery) {
    lines.push(
      "",
      "中断した実行の復旧:",
      `- 種別: ${provenance.heldRecovery.kind}`,
      `- ステップ: ${provenance.heldRecovery.stepId}`,
      `- 次のステップ: ${provenance.heldRecovery.nextStepId ?? "ワークフロー完了"}`,
      `- 復旧日時: ${provenance.heldRecovery.recoveredAt}`,
      `- 復旧元: ${provenance.heldRecovery.source}`
    )
  }
  lines.push(`- 定義の差異を許可: ${provenance.definitionMismatchAllowed ? "はい" : "いいえ"}`)
  lines.push("- ステップの完了元:")
  for (const step of provenance.steps) {
    const fields = [
      `${step.stepId}: ${stepStatusLabel(step.runStatus)}`,
      `完了元（completionSource）=${completionSourceLabel(step.completion)}`,
      `成果物再利用による省略=${step.skippedByArtifactReuse ? "はい" : "いいえ"}`,
      step.artifactIds.length > 0 ? `成果物=${step.artifactIds.join(",")}` : undefined,
      step.hydratedStateKeys.length > 0 ? `復元した状態キー=${step.hydratedStateKeys.join(",")}` : undefined,
      step.sourceRunId ? `再利用元の実行=${step.sourceRunId}` : undefined,
      step.importedFromTaskSnapshot ? "保存済みタスクから取り込み=はい" : undefined
    ].filter((value): value is string => Boolean(value))
    lines.push(`  - ${fields.join("; ")}`)
  }
  return lines
}

export function formatBranchingDiagnostics(run: WorkflowRunState): string[] {
  if (!run.branching) return []
  const lines: string[] = ["分岐ループ:"]
  const loops = Object.values(run.branching.loops ?? {})
  if (loops.length === 0) {
    lines.push("- 分岐ループの記録はありません。")
  } else {
    for (const loop of loops) {
      lines.push(`- ${loop.loopId}: count=${loop.count}; allowed=${loop.allowed}; maxIterations=${loop.maxIterations}; extensionSize=${loop.extensionSize}; checkpoints=${loop.checkpointCount}; lastTransitionAt=${loop.lastTransitionAt ?? "none"}`)
    }
  }
  lines.push("", "分岐チェックポイント:")
  const checkpoint = run.branching.checkpoint
  if (!checkpoint) {
    lines.push("- なし")
  } else {
    lines.push(
      `- id: ${checkpoint.id}`,
      `- loopId: ${checkpoint.loopId}`,
      `- 遷移: ${checkpoint.fromStepId} -> ${checkpoint.toStepId}`,
      `- decisionId: ${checkpoint.decisionId}`,
      `- count: ${checkpoint.count}/${checkpoint.allowed}`,
      `- extensionSize: ${checkpoint.extensionSize}`,
      `- メッセージ: ${checkpoint.message}`
    )
  }
  lines.push("", "分岐履歴:")
  const history = run.branching.history ?? []
  if (history.length === 0) {
    lines.push("- 分岐遷移の記録はありません。")
  } else {
    for (const item of history) {
      lines.push(`- ${item.createdAt} ${item.action}: ${item.decisionId}; ${item.fromStepId} -> ${item.toStepId ?? "none"}; loop=${item.loopId ?? "none"}; count=${item.loopCount ?? "none"}`)
    }
  }
  return lines
}

export function workflowRunFailureHint(error: string): string | undefined {
  if (error.includes("Unsupported action provider")) return "このプロバイダー ID の ActionProvider を登録するか、コマンドステップを vscode.executeCommand に変更してください。"
  if (error.includes("vscode.executeCommand requires the command id")) return "VS Code コマンド ID を action.args の先頭に指定してください。"
  if (error.includes("Command is denied by workflow guardrails")) return "コマンドを deniedCommands から外すか、より安全なコマンドへ変更してください。"
  if (error.includes("Command is not allowed by workflow guardrails")) return "プロバイダー ID を allowedCommands に追加するか、許可リストを解除してください。"
  if (error.includes("Agent provider is required")) return "workflowRegister.agentCommand を設定するか、拡張 API から AgentProvider を登録してください。"
  if (error.includes("Workflow preflight failed")) return "不足している必須ファイルまたは失敗した事前確認を修正してから、ワークフローを再実行してください。"
  if (error.includes("Required workflow file is missing")) return "不足しているファイルを作成するか、requires.files／preflight.files から指定を外してください。"
  if (error.includes("Workflow state is missing")) return "resultKey／stateKey の記述と、生成側ステップが参照側より先に実行されることを確認してください。"
  if (error.includes("Result file path escapes the workspace")) return "ワークスペース内の相対パスを成果物または結果の保存先に指定してください。"
  if (error.includes("Unsupported result sink")) return "この種別の保存先を登録するか、組み込みのファイル保存先を使用してください。"
  if (error.includes("Unsupported result command")) return "コマンド結果の保存先を許可または変更してください。生成成果物には通常、ファイル保存先の方が安全です。"
  if (error.includes("waiting for step review")) return "現在のステップを承認するか、ワークフロー定義を調整してから再試行してください。"
  if (error.includes("Workflow definition changed")) return "stepReview.allowEditBeforeRetry を有効にするか、元のワークフロー定義で再試行してください。"
  if (error.includes("Workflow step order/id changed")) return "再試行時は、完了済みステップの ID と順序を変更しないでください。"
  if (error.includes("stale revision") || error.includes("changed since it was loaded")) return "実行状況を更新し、最新の保存版に対して操作を再実行してください。"
  if (error.includes("busy or locked")) return "実行中のワークフロー操作が完了するまで待ち、更新してから再試行してください。"
  if (error.includes("journal")) return "再試行前にジャーナルとイベントログを確認してください。競合している耐久性ファイルを削除しないでください。"
  return undefined
}

function runStatusLabel(value: string): string {
  return {
    running: "実行中",
    paused: "一時停止",
    checkpoint: "分岐確認待ち",
    reviewing: "人による確認待ち",
    held: "手動操作待ち",
    completed: "完了",
    failed: "失敗"
  }[value] ?? `不明（${value}）`
}

function stepStatusLabel(value: string): string {
  return {
    pending: "未開始",
    running: "実行中",
    reviewing: "人による確認待ち",
    held: "手動操作待ち",
    completed: "完了",
    failed: "失敗",
    skipped: "省略"
  }[value] ?? `不明（${value}）`
}

function completionSourceLabel(value: string): string {
  if (value === "normal") return "通常完了"
  if (value === "reused") return "再利用"
  return "未完了"
}

function currentProblemStep(run: WorkflowRunState): RunStepState | undefined {
  return run.steps.find((step) => step.id === run.currentStep && (step.status === "failed" || step.status === "held" || step.status === "reviewing"))
    ?? run.steps.find((step) => step.status === "failed" || step.status === "held" || step.status === "reviewing")
}

function appendPauseDiagnostics(
  lines: string[],
  value: string | undefined,
  control: RunControlState | undefined
): void {
  if (value) {
    const parsed = parseJsonRecord(value)
    if (parsed?.schemaVersion === "workflow-register/automatic-pause/v1") {
      lines.push(
        "",
        "自動一時停止:",
        `- 種別: ${String(parsed.kind ?? "不明")}`,
        `- 設定元: ${String(parsed.source ?? "不明")}`,
        `- 区切り: ${String(parsed.checkpoint ?? "不明")}`,
        `- 次のステップ: ${String(parsed.nextStepId ?? "なし")}`,
        `- 検出日時: ${String(parsed.detectedAt ?? "不明")}`
      )
      appendRecordFields(lines, "上限", parsed.limit)
      appendRecordFields(lines, "検出値", parsed.observed)
    } else {
      lines.push("", "一時停止:", ...formatJsonState(value))
    }
  }

  const override = control?.automaticPauseOverride
  if (!override) return
  lines.push(
    "",
    "自動一時停止の一時解除:",
    `- スキーマ: ${override.schemaVersion}`,
    `- 依頼者: ${override.requestedBy}`,
    `- 作成日時: ${override.createdAt}`,
    `- 有効期限: ${override.expiresAt}`,
    `- 理由: ${override.reason}`
  )
}

function appendRecordFields(lines: string[], prefix: string, value: unknown): void {
  if (!isRecord(value)) return
  for (const key of Object.keys(value).sort()) {
    lines.push(`- ${prefix}.${key}: ${formatDiagnosticValue(value[key])}`)
  }
}

function parseJsonRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(value)
    return isRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function formatDiagnosticValue(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (value === null) return "null"
  return JSON.stringify(value) ?? String(value)
}

function formatJsonState(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return Object.entries(parsed).map(([key, entry]) => `- ${key}: ${String(entry)}`)
  } catch {
    return [`- ${value}`]
  }
}

function appendAttemptSummaries(lines: string[], step: RunStepState): void {
  const attempts = step.attempts ?? []
  if (attempts.length === 0) return
  for (const attempt of attempts) {
    const stateKeys = Object.keys(attempt.stateSnapshot ?? {}).sort()
    lines.push(`  - 試行 ${attempt.attempt}: ${stepStatusLabel(attempt.status)}; 作成日時=${attempt.createdAt}; 状態キー=${stateKeys.length === 0 ? "なし" : stateKeys.join(",")}${attempt.error ? `; エラー=${attempt.error}` : ""}`)
  }
}

function appendTaskSnapshots(lines: string[], run: WorkflowRunState, snapshots: TaskSnapshotSummary[]): void {
  if (snapshots.length === 0) return
  lines.push("", "保存済みタスク:")
  for (const snapshot of snapshots) {
    const notes: string[] = []
    if (snapshot.workflowDefinitionHash && run.workflowDefinitionHash && snapshot.workflowDefinitionHash !== run.workflowDefinitionHash) notes.push("ワークフローハッシュ不一致")
    if (run.currentStep && snapshot.stepId !== run.currentStep) notes.push("ステップ不一致")
    if (snapshot.truncated) notes.push("一部省略")
    if (snapshot.handoffError) notes.push(`引き渡しエラー=${snapshot.handoffError}`)
    const suffix = notes.length > 0 ? `; ${notes.join("; ")}` : ""
    lines.push(`- ${snapshot.createdAt}: ${snapshot.reason}; ステップ=${snapshot.stepId}; 最終アシスタント本文=${snapshot.hasLastAssistantText ? "あり" : "なし"}${suffix}`)
  }
}
