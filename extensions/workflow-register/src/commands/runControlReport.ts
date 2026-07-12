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
    `- runId: ${runId}`,
    `- root: ${root}`,
    `- runStatus: ${run?.status ?? "unknown"}`,
    `- currentStep: ${run?.currentStep ?? "none"}`,
    `- pauseRequestedAt: ${control?.pauseRequestedAt ?? "none"}`,
    `- pauseReason: ${control?.pauseReason ?? "none"}`,
    `- requestedBy: ${control?.requestedBy ?? "none"}`,
    `- mode: ${control?.mode ?? "none"}`,
    `- clearedAt: ${control?.clearedAt ?? "none"}`,
    `- automaticPauseKind: ${automaticPause?.kind ?? "none"}`,
    `- automaticPauseSource: ${automaticPause?.source ?? "none"}`,
    `- automaticPauseCheckpoint: ${automaticPause?.checkpoint ?? "none"}`,
    `- automaticPauseNextStep: ${automaticPause?.nextStepId ?? "none"}`,
    `- automaticPauseDetectedAt: ${automaticPause?.detectedAt ?? "none"}`,
    `- automaticPauseLimit: ${automaticPause ? JSON.stringify(automaticPause.limit) : "none"}`,
    `- automaticPauseObserved: ${automaticPause ? JSON.stringify(automaticPause.observed) : "none"}`,
    `- automaticOverrideSchema: ${override?.schemaVersion ?? "none"}`,
    `- automaticOverrideRequestedBy: ${override?.requestedBy ?? "none"}`,
    `- automaticOverrideCreatedAt: ${override?.createdAt ?? "none"}`,
    `- automaticOverrideExpiresAt: ${override?.expiresAt ?? "none"}`,
    `- automaticOverrideReason: ${override?.reason ?? "none"}`,
    `- workflow.pause: ${run?.state["workflow.pause"] ?? "none"}`
  ]
}
