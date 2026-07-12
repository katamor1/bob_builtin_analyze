import { defaultReviewRunMetrics } from "./reviewRunMetrics"
import { validateReviewRunSegment } from "./reviewRunPaths"
import {
  REVIEW_RUN_SCHEMA_VERSION,
  type ReviewRunArtifacts,
  type ReviewRunContext,
  type ReviewRunIssue,
  type ReviewRunPhase,
  type ReviewRunPhaseMap,
  type ReviewRunPhaseStatus,
  type ReviewRunTarget,
  type ReviewRunTargetMode,
  type ReviewRunTrackedPhase
} from "./reviewRunTypes"

const PHASE_ORDER: Record<ReviewRunPhase, number> = {
  target: 0,
  packet: 1,
  result: 2,
  triage: 3,
  completed: 4
}

const TRACKED_PHASES: ReviewRunTrackedPhase[] = ["target", "packet", "result", "triage", "record", "summary"]

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

export interface SetReviewRunPhaseProgressInput {
  trackedPhase: ReviewRunTrackedPhase
  status: ReviewRunPhaseStatus
  phase?: ReviewRunPhase
  artifacts?: ReviewRunArtifacts
  issue?: string
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
    status: "in_progress",
    createdAt: now,
    updatedAt: now,
    target: { ...input.target, repositoryRoot },
    artifacts: {},
    phases: createInitialPhaseMap(now),
    metrics: defaultReviewRunMetrics(),
    issues: []
  }
}

export function normalizeReviewRunContext(value: any): ReviewRunContext {
  const createdAt = typeof value?.createdAt === "string" ? value.createdAt : new Date(0).toISOString()
  const updatedAt = typeof value?.updatedAt === "string" ? value.updatedAt : createdAt
  const artifacts: ReviewRunArtifacts = value?.artifacts && typeof value.artifacts === "object"
    ? { ...value.artifacts }
    : {}
  const phase = isReviewRunPhase(value?.phase) ? value.phase : "target"
  const inferred = inferLegacyPhaseMap(phase, artifacts, createdAt, updatedAt)
  const providedPhases = value?.phases && typeof value.phases === "object" ? value.phases : {}
  const phases = Object.fromEntries(TRACKED_PHASES.map((trackedPhase) => {
    const provided = providedPhases[trackedPhase]
    return [trackedPhase, normalizePhaseProgress(provided, inferred[trackedPhase])]
  })) as ReviewRunPhaseMap
  const rawMetrics = value?.metrics && typeof value.metrics === "object" ? value.metrics : {}
  const defaults = defaultReviewRunMetrics()
  const status = value?.status === "completed" || phase === "completed" ? "completed" : "in_progress"

  return {
    ...value,
    schemaVersion: REVIEW_RUN_SCHEMA_VERSION,
    phase,
    status,
    createdAt,
    updatedAt,
    artifacts,
    phases,
    metrics: {
      ...defaults,
      ...rawMetrics,
      bobReviewSeconds: finiteNonNegativeOrZero(rawMetrics.bobReviewSeconds),
      humanTriageSeconds: finiteNonNegativeOrZero(rawMetrics.humanTriageSeconds),
      timingSource: rawMetrics.timingSource === "user_corrected" ? "user_corrected" : "auto_wall_clock",
      correctedByUser: rawMetrics.correctedByUser === true
    },
    issues: Array.isArray(value?.issues) ? value.issues.filter(isReviewRunIssue).map((issue: ReviewRunIssue) => ({ ...issue })) : []
  } as ReviewRunContext
}

export function advanceReviewRun(context: ReviewRunContext, input: AdvanceReviewRunInput): ReviewRunContext {
  const normalized = normalizeReviewRunContext(context)
  if (PHASE_ORDER[input.phase] < PHASE_ORDER[normalized.phase]) {
    throw new Error(`Review Run phase cannot move backwards: ${normalized.phase} -> ${input.phase}`)
  }
  if (input.phase === "target") {
    return {
      ...normalized,
      phase: "target",
      updatedAt: input.now ?? new Date().toISOString(),
      artifacts: { ...normalized.artifacts, ...(input.artifacts ?? {}) }
    }
  }
  if (input.phase === "packet") {
    return setReviewRunPhaseProgress(normalized, {
      trackedPhase: "packet",
      status: "completed",
      phase: "packet",
      artifacts: input.artifacts,
      now: input.now
    })
  }
  if (input.phase === "result") {
    return setReviewRunPhaseProgress(normalized, {
      trackedPhase: "result",
      status: "completed",
      phase: "result",
      artifacts: input.artifacts,
      now: input.now
    })
  }
  if (input.phase === "triage") {
    return setReviewRunPhaseProgress(normalized, {
      trackedPhase: "triage",
      status: "in_progress",
      phase: "triage",
      artifacts: input.artifacts,
      now: input.now
    })
  }

  for (const trackedPhase of TRACKED_PHASES) {
    if (normalized.phases[trackedPhase].status !== "completed") {
      throw new Error(`${trackedPhase} phase must be completed before Review Run completion`)
    }
  }
  return {
    ...normalized,
    phase: "completed",
    status: "completed",
    updatedAt: input.now ?? new Date().toISOString(),
    artifacts: { ...normalized.artifacts, ...(input.artifacts ?? {}) }
  }
}

export function setReviewRunPhaseProgress(
  context: ReviewRunContext,
  input: SetReviewRunPhaseProgressInput
): ReviewRunContext {
  const normalized = normalizeReviewRunContext(context)
  const now = input.now ?? new Date().toISOString()
  const artifacts = { ...normalized.artifacts, ...(input.artifacts ?? {}) }
  if (input.status === "completed") validateCompletedPhaseArtifacts(input.trackedPhase, artifacts)
  const previous = normalized.phases[input.trackedPhase]
  const progress = {
    status: input.status,
    startedAt: previous.startedAt,
    completedAt: previous.completedAt,
    issue: input.issue
  }
  if (input.status === "in_progress" && !progress.startedAt) progress.startedAt = now
  if (input.status === "completed") {
    progress.startedAt = progress.startedAt ?? now
    progress.completedAt = now
    progress.issue = undefined
  } else if (input.status === "not_started") {
    progress.startedAt = undefined
    progress.completedAt = undefined
    progress.issue = undefined
  }

  return {
    ...normalized,
    phase: input.phase ?? normalized.phase,
    status: "in_progress",
    updatedAt: now,
    artifacts,
    phases: {
      ...normalized.phases,
      [input.trackedPhase]: progress
    }
  }
}

export function appendReviewRunIssue(
  context: ReviewRunContext,
  issue: Omit<ReviewRunIssue, "recordedAt"> & { recordedAt?: string }
): ReviewRunContext {
  const normalized = normalizeReviewRunContext(context)
  const recordedAt = issue.recordedAt ?? new Date().toISOString()
  return {
    ...normalized,
    updatedAt: recordedAt,
    issues: [...normalized.issues, { ...issue, recordedAt }]
  }
}

export function clearReviewRunIssues(context: ReviewRunContext, phase: ReviewRunTrackedPhase): ReviewRunContext {
  const normalized = normalizeReviewRunContext(context)
  return {
    ...normalized,
    issues: normalized.issues.filter((issue) => issue.phase !== phase)
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

function createInitialPhaseMap(now: string): ReviewRunPhaseMap {
  return {
    target: { status: "completed", startedAt: now, completedAt: now },
    packet: { status: "not_started" },
    result: { status: "not_started" },
    triage: { status: "not_started" },
    record: { status: "not_started" },
    summary: { status: "not_started" }
  }
}

function inferLegacyPhaseMap(
  phase: ReviewRunPhase,
  artifacts: ReviewRunArtifacts,
  createdAt: string,
  updatedAt: string
): ReviewRunPhaseMap {
  const packetCompleted = Boolean(artifacts.reviewPacketPath)
  const resultCompleted = Boolean(artifacts.reviewResultJsonPath && artifacts.reviewResultMarkdownPath)
  const completedRun = phase === "completed"
  return {
    target: { status: "completed", startedAt: createdAt, completedAt: createdAt },
    packet: packetCompleted
      ? { status: "completed", startedAt: createdAt, completedAt: updatedAt }
      : PHASE_ORDER[phase] >= PHASE_ORDER.packet ? { status: "in_progress", startedAt: updatedAt } : { status: "not_started" },
    result: resultCompleted
      ? { status: "completed", startedAt: createdAt, completedAt: updatedAt }
      : PHASE_ORDER[phase] >= PHASE_ORDER.result ? { status: "in_progress", startedAt: updatedAt } : { status: "not_started" },
    triage: completedRun && artifacts.triageYamlPath
      ? { status: "completed", startedAt: createdAt, completedAt: updatedAt }
      : PHASE_ORDER[phase] >= PHASE_ORDER.triage || artifacts.triageYamlPath
        ? { status: "in_progress", startedAt: updatedAt }
        : { status: "not_started" },
    record: artifacts.recordYamlPath
      ? { status: "completed", startedAt: createdAt, completedAt: updatedAt }
      : { status: "not_started" },
    summary: artifacts.summaryJsonPath && artifacts.summaryMarkdownPath
      ? { status: "completed", startedAt: createdAt, completedAt: updatedAt }
      : { status: "not_started" }
  }
}

function normalizePhaseProgress(value: any, fallback: ReviewRunPhaseMap[ReviewRunTrackedPhase]) {
  if (!value || typeof value !== "object" || !isReviewRunPhaseStatus(value.status)) return { ...fallback }
  return {
    status: value.status,
    ...(typeof value.startedAt === "string" ? { startedAt: value.startedAt } : {}),
    ...(typeof value.completedAt === "string" ? { completedAt: value.completedAt } : {}),
    ...(typeof value.issue === "string" ? { issue: value.issue } : {})
  }
}

function validateCompletedPhaseArtifacts(phase: ReviewRunTrackedPhase, artifacts: ReviewRunArtifacts): void {
  if (phase === "packet" && !artifacts.reviewPacketPath) throw new Error("reviewPacketPath is required for completed packet phase")
  if (phase === "result" && !artifacts.reviewResultJsonPath) throw new Error("reviewResultJsonPath is required for completed result phase")
  if (phase === "result" && !artifacts.reviewResultMarkdownPath) throw new Error("reviewResultMarkdownPath is required for completed result phase")
  if (phase === "triage" && !artifacts.triageYamlPath) throw new Error("triageYamlPath is required for completed triage phase")
  if (phase === "record" && !artifacts.recordYamlPath) throw new Error("recordYamlPath is required for completed record phase")
  if (phase === "summary" && !artifacts.summaryJsonPath) throw new Error("summaryJsonPath is required for completed summary phase")
  if (phase === "summary" && !artifacts.summaryMarkdownPath) throw new Error("summaryMarkdownPath is required for completed summary phase")
}

function isReviewRunPhase(value: unknown): value is ReviewRunPhase {
  return value === "target" || value === "packet" || value === "result" || value === "triage" || value === "completed"
}

function isReviewRunPhaseStatus(value: unknown): value is ReviewRunPhaseStatus {
  return value === "not_started" || value === "in_progress" || value === "completed" || value === "blocked" || value === "failed" || value === "skipped"
}

function isReviewRunIssue(value: unknown): value is ReviewRunIssue {
  if (!value || typeof value !== "object") return false
  const issue = value as Partial<ReviewRunIssue>
  return TRACKED_PHASES.includes(issue.phase as ReviewRunTrackedPhase) &&
    typeof issue.message === "string" &&
    typeof issue.retryable === "boolean" &&
    typeof issue.recordedAt === "string"
}

function finiteNonNegativeOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0
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
