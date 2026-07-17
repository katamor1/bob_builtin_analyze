import type { WorkflowRunState } from "../core/model"
import type { RunControlState } from "../core/runControlStore"
import { parseAutomaticPauseState } from "./automaticPauseResume"

export interface RunControlReportInput {
  runId: string
  root: string
  run?: WorkflowRunState
  control?: RunControlState
}

export function buildRunControlReportLines(input: RunControlReportInput): string[] {
  const { runId, root, run, control } = input
  const automaticPause = parseAutomaticPauseState(run?.state["workflow.pause"])
  const override = control?.automaticPauseOverride
  return [
    `- 実行 ID（runId）: ${runId}`,
    `- ワークスペース（root）: ${root}`,
    `- 状態（runStatus）: ${run?.status ?? "unknown"}`,
    `- 現在のステップ（currentStep）: ${run?.currentStep ?? "none"}`,
    `- 一時停止の依頼日時（pauseRequestedAt）: ${control?.pauseRequestedAt ?? "none"}`,
    `- 一時停止理由（pauseReason）: ${control?.pauseReason ?? "none"}`,
    `- 依頼元（requestedBy）: ${control?.requestedBy ?? "none"}`,
    `- 一時停止方式（mode）: ${control?.mode ?? "none"}`,
    `- 一時停止解除日時（clearedAt）: ${control?.clearedAt ?? "none"}`,
    `- 自動一時停止種別（automaticPauseKind）: ${automaticPause?.kind ?? "none"}`,
    `- 自動一時停止の設定元（automaticPauseSource）: ${automaticPause?.source ?? "none"}`,
    `- 自動一時停止の区切り（automaticPauseCheckpoint）: ${automaticPause?.checkpoint ?? "none"}`,
    `- 自動一時停止後の次ステップ（automaticPauseNextStep）: ${automaticPause?.nextStepId ?? "none"}`,
    `- 自動一時停止の検出日時（automaticPauseDetectedAt）: ${automaticPause?.detectedAt ?? "none"}`,
    `- 自動一時停止の上限（automaticPauseLimit）: ${automaticPause ? JSON.stringify(automaticPause.limit) : "none"}`,
    `- 自動一時停止の観測値（automaticPauseObserved）: ${automaticPause ? JSON.stringify(automaticPause.observed) : "none"}`,
    `- 自動停止上書きスキーマ（automaticOverrideSchema）: ${override?.schemaVersion ?? "none"}`,
    `- 自動停止上書きの依頼元（automaticOverrideRequestedBy）: ${override?.requestedBy ?? "none"}`,
    `- 自動停止上書きの作成日時（automaticOverrideCreatedAt）: ${override?.createdAt ?? "none"}`,
    `- 自動停止上書きの有効期限（automaticOverrideExpiresAt）: ${override?.expiresAt ?? "none"}`,
    `- 自動停止上書きの理由（automaticOverrideReason）: ${override?.reason ?? "none"}`,
    `- 一時停止の保存値（workflow.pause）: ${run?.state["workflow.pause"] ?? "none"}`
  ]
}
