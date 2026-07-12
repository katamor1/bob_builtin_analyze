export const REVIEW_RUN_SCHEMA_VERSION = "bazaar-review-run/v1" as const

export type ReviewRunPhase = "target" | "packet" | "result" | "triage" | "completed"
export type ReviewRunStatus = "in_progress" | "completed"
export type ReviewRunTrackedPhase = "target" | "packet" | "result" | "triage" | "record" | "summary"
export type ReviewRunPhaseStatus = "not_started" | "in_progress" | "completed" | "blocked" | "failed" | "skipped"

export type ReviewRunTargetMode = "singleRevision" | "revisionRange" | "workingTreeSinceRevision"

export interface ReviewRunTarget {
  mode: ReviewRunTargetMode
  repositoryRoot: string
  revision?: string
  baseRevision?: string
  targetRevision?: string
}

export interface ReviewRunArtifacts {
  reviewPacketPath?: string
  reviewResultJsonPath?: string
  reviewResultMarkdownPath?: string
  reviewResultMetadataPath?: string
  triageYamlPath?: string
  recordYamlPath?: string
  summaryJsonPath?: string
  summaryMarkdownPath?: string
}

export interface ReviewRunPhaseProgress {
  status: ReviewRunPhaseStatus
  startedAt?: string
  completedAt?: string
  issue?: string
}

export type ReviewRunPhaseMap = Record<ReviewRunTrackedPhase, ReviewRunPhaseProgress>

export type ReviewRunTimingSource = "auto_wall_clock" | "user_corrected"

export interface ReviewRunMetrics {
  baselineReviewMinutes?: number
  bobReviewSeconds: number
  humanTriageSeconds: number
  timingSource: ReviewRunTimingSource
  correctedByUser: boolean
  bobReviewStartedAt?: string
  humanTriageStartedAt?: string
}

export interface ReviewRunIssue {
  phase: ReviewRunTrackedPhase
  message: string
  retryable: boolean
  recordedAt: string
}

export interface ReviewRunContext {
  schemaVersion: typeof REVIEW_RUN_SCHEMA_VERSION
  workspaceRoot: string
  campaignId: string
  reviewId: string
  phase: ReviewRunPhase
  status: ReviewRunStatus
  createdAt: string
  updatedAt: string
  target: ReviewRunTarget
  artifacts: ReviewRunArtifacts
  phases: ReviewRunPhaseMap
  metrics: ReviewRunMetrics
  issues: ReviewRunIssue[]
}

export interface ReviewRunCommandInput {
  workspaceRoot: string
  campaignId: string
  reviewId: string
}
