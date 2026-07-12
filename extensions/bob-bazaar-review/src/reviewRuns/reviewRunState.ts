import { validateReviewRunSegment } from "./reviewRunPaths"
import {
  REVIEW_RUN_SCHEMA_VERSION,
  type ReviewRunArtifacts,
  type ReviewRunContext,
  type ReviewRunPhase,
  type ReviewRunTarget,
  type ReviewRunTargetMode
} from "./reviewRunTypes"

const PHASE_ORDER: Record<ReviewRunPhase, number> = {
  target: 0,
  packet: 1,
  result: 2,
  triage: 3,
  completed: 4
}

export interface CreateReviewRunContextInput {
  workspaceRoot: string
  campaignId: string
  reviewId: string
  target: ReviewRunTarget
  now?: string
}

export interface AdvanceReviewRunInput {
  phase: ReviewRunPhase
  artifacts?: ReviewRunArtifacts
  now?: string
}

export interface ReviewIdTarget {
  mode: ReviewRunTargetMode
  revision?: string
  baseRevision?: string
  targetRevision?: string
}

export function createReviewRunContext(input: CreateReviewRunContextInput): ReviewRunContext {
  const now = input.now ?? new Date().toISOString()
  const workspaceRoot = input.workspaceRoot.trim()
  const repositoryRoot = input.target.repositoryRoot.trim()
  if (!workspaceRoot) throw new Error("workspaceRoot is required")
  if (!repositoryRoot) throw new Error("target.repositoryRoot is required")
  return {
    schemaVersion: REVIEW_RUN_SCHEMA_VERSION,
    workspaceRoot,
    campaignId: validateReviewRunSegment(input.campaignId, "campaignId"),
    reviewId: validateReviewRunSegment(input.reviewId, "reviewId"),
    phase: "target",
    createdAt: now,
    updatedAt: now,
    target: { ...input.target, repositoryRoot },
    artifacts: {}
  }
}

export function advanceReviewRun(context: ReviewRunContext, input: AdvanceReviewRunInput): ReviewRunContext {
  if (PHASE_ORDER[input.phase] < PHASE_ORDER[context.phase]) {
    throw new Error(`Review Run phase cannot move backwards: ${context.phase} -> ${input.phase}`)
  }
  return {
    ...context,
    phase: input.phase,
    updatedAt: input.now ?? new Date().toISOString(),
    artifacts: {
      ...context.artifacts,
      ...(input.artifacts ?? {})
    }
  }
}

export function buildReviewId(target: ReviewIdTarget): string {
  if (target.mode === "singleRevision") {
    return validateReviewRunSegment(`bazaar-r${slug(target.revision, "revision")}-project-rule-review`, "reviewId")
  }
  if (target.mode === "revisionRange") {
    return validateReviewRunSegment(
      `bazaar-r${slug(target.baseRevision, "baseRevision")}-r${slug(target.targetRevision, "targetRevision")}-project-rule-review`,
      "reviewId"
    )
  }
  const base = target.baseRevision?.trim() ? `r${slug(target.baseRevision, "baseRevision")}` : "top"
  return validateReviewRunSegment(`bazaar-${base}-working-tree-project-rule-review`, "reviewId")
}

function slug(value: string | undefined, fieldName: string): string {
  const normalized = value?.trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  const result = normalized
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  if (!result) throw new Error(`${fieldName} does not contain a safe identifier`)
  return result
}
