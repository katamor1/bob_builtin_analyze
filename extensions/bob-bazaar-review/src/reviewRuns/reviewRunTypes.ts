export const REVIEW_RUN_SCHEMA_VERSION = "bazaar-review-run/v1" as const

export type ReviewRunPhase = "target" | "packet" | "result" | "triage" | "completed"

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

export interface ReviewRunContext {
  schemaVersion: typeof REVIEW_RUN_SCHEMA_VERSION
  workspaceRoot: string
  campaignId: string
  reviewId: string
  phase: ReviewRunPhase
  createdAt: string
  updatedAt: string
  target: ReviewRunTarget
  artifacts: ReviewRunArtifacts
}

export interface ReviewRunCommandInput {
  workspaceRoot: string
  campaignId: string
  reviewId: string
}
