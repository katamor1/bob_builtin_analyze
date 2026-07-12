import { normalizeReviewRunContext } from "./reviewRunState"
import type {
  ReviewRunContext,
  ReviewRunPhaseStatus,
  ReviewRunTrackedPhase
} from "./reviewRunTypes"

export type ReviewRunResumeAction = "review" | "resultCapture" | "humanTriage" | "finalize" | "none"

export interface ReviewRunResumeCandidate {
  workspaceRoot: string
  campaignId: string
  reviewId: string
  label: string
  description: string
  action: ReviewRunResumeAction
  updatedAt: string
  targetLabel: string
  phases: Record<ReviewRunTrackedPhase, ReviewRunPhaseStatus>
  artifacts: ReviewRunContext["artifacts"]
}

export function nextReviewRunAction(context: ReviewRunContext): ReviewRunResumeAction {
  const run = normalizeReviewRunContext(context)
  if (run.status === "completed" || run.phase === "completed") return "none"
  if (run.phases.packet.status !== "completed" || !run.artifacts.reviewPacketPath) return "review"
  if (
    run.phases.result.status !== "completed" ||
    !run.artifacts.reviewResultJsonPath ||
    !run.artifacts.reviewResultMarkdownPath
  ) return "resultCapture"
  if (run.phases.triage.status !== "completed" || !run.artifacts.triageYamlPath) return "humanTriage"
  if (
    run.phases.record.status !== "completed" ||
    run.phases.summary.status !== "completed" ||
    !run.artifacts.recordYamlPath ||
    !run.artifacts.summaryJsonPath ||
    !run.artifacts.summaryMarkdownPath
  ) return "finalize"
  return "none"
}

export function buildReviewRunResumeCandidate(context: ReviewRunContext): ReviewRunResumeCandidate {
  const run = normalizeReviewRunContext(context)
  const action = nextReviewRunAction(run)
  return {
    workspaceRoot: run.workspaceRoot,
    campaignId: run.campaignId,
    reviewId: run.reviewId,
    label: run.reviewId,
    description: `${run.campaignId} · ${action} · ${run.status} · ${run.updatedAt}`,
    action,
    updatedAt: run.updatedAt,
    targetLabel: buildTargetLabel(run),
    phases: {
      target: run.phases.target.status,
      packet: run.phases.packet.status,
      result: run.phases.result.status,
      triage: run.phases.triage.status,
      record: run.phases.record.status,
      summary: run.phases.summary.status
    },
    artifacts: { ...run.artifacts }
  }
}

function buildTargetLabel(context: ReviewRunContext): string {
  if (context.target.mode === "singleRevision") return `revision ${context.target.revision ?? "unknown"}`
  if (context.target.mode === "revisionRange") {
    return `${context.target.baseRevision ?? "unknown"}..${context.target.targetRevision ?? "unknown"}`
  }
  return `${context.target.baseRevision ?? "TOP"}..working tree`
}
