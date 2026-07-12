import * as fs from "node:fs/promises"
import * as path from "node:path"
import { writeReviewPacketArtifact } from "../records/reviewRecordStore"
import {
  createReviewRunRecordArtifact,
  createReviewRunSummaryArtifacts
} from "./reviewRunFinalize"
import {
  completeBobReviewTimer,
  completeHumanTriageTimer,
  correctReviewRunMetrics,
  startBobReviewTimer,
  startHumanTriageTimer,
  type ReviewRunMetricCorrection
} from "./reviewRunMetrics"
import {
  assertReviewRunPathContained,
  reviewRunDirectory,
  reviewRunPacketPath,
  validateReviewRunSegment
} from "./reviewRunPaths"
import type { CreateReviewRunContextInput } from "./reviewRunState"
import {
  advanceReviewRun,
  appendReviewRunIssue,
  clearReviewRunIssues,
  createReviewRunContext,
  setReviewRunPhaseProgress
} from "./reviewRunState"
import { readReviewRun, writeReviewRun } from "./reviewRunStore"
import type {
  ReviewRunCommandInput,
  ReviewRunContext,
  ReviewRunTrackedPhase
} from "./reviewRunTypes"

const mutationQueues = new Map<string, Promise<void>>()

export interface ReviewRunCaptureResult {
  status: "ok" | "error"
  valid: boolean
  reviewId?: string
  jsonPath?: string
  markdownPath?: string
  metadataPath?: string
}

export interface ReviewRunFinalizeResult {
  context: ReviewRunContext
  recordPath: string
  summaryJsonPath: string
  summaryMarkdownPath: string
}

export async function startReviewRun(input: CreateReviewRunContextInput): Promise<ReviewRunContext> {
  const reserved = await reserveReviewRunIdentity(
    input.workspaceRoot,
    input.campaignId,
    input.reviewId
  )
  const context = createReviewRunContext({ ...input, reviewId: reserved.reviewId })
  try {
    await writeReviewRun(context)
    return context
  } catch (error) {
    await removeReservedDirectoryIfEmpty(reserved.directory)
    throw error
  }
}

export async function recordReviewPacket(
  context: ReviewRunContext,
  packetText: string,
  now = new Date().toISOString()
): Promise<ReviewRunContext> {
  return mutateReviewRun(context, async (latest) => {
    const expectedPacketPath = reviewRunPacketPath(latest.workspaceRoot, latest.campaignId, latest.reviewId)
    await assertReviewRunPathContained(latest.workspaceRoot, expectedPacketPath)
    const { packetPath } = await writeReviewPacketArtifact(
      latest.workspaceRoot,
      latest.campaignId,
      latest.reviewId,
      packetText,
      { backupExisting: true }
    )
    let next = setReviewRunPhaseProgress(latest, {
      trackedPhase: "packet",
      status: "completed",
      phase: "packet",
      artifacts: { reviewPacketPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, packetPath) },
      now
    })
    next = setReviewRunPhaseProgress(next, {
      trackedPhase: "result",
      status: "in_progress",
      now
    })
    next = clearReviewRunIssues(next, "packet")
    return { ...next, metrics: startBobReviewTimer(next.metrics, now) }
  })
}

export async function recordReviewResult(
  context: ReviewRunContext,
  result: ReviewRunCaptureResult,
  now = new Date().toISOString()
): Promise<ReviewRunContext> {
  if (result.status !== "ok" || result.valid !== true) {
    throw new Error("Cannot attach an invalid review result to a Review Run")
  }
  if (result.reviewId !== context.reviewId) {
    throw new Error(`Captured review_id ${String(result.reviewId)} does not match active Review Run ${context.reviewId}`)
  }
  if (!result.jsonPath || !result.markdownPath) {
    throw new Error("Captured review result paths are required")
  }

  return mutateReviewRun(context, async (latest) => {
    if (result.reviewId !== latest.reviewId) {
      throw new Error(`Captured review_id ${String(result.reviewId)} does not match active Review Run ${latest.reviewId}`)
    }
    let metrics = latest.metrics
    if (!metrics.bobReviewStartedAt) {
      metrics = startBobReviewTimer(metrics, latest.phases.packet.completedAt ?? latest.updatedAt)
    }
    metrics = completeBobReviewTimer(metrics, now)
    metrics = startHumanTriageTimer(metrics, now)

    let next = setReviewRunPhaseProgress(latest, {
      trackedPhase: "result",
      status: "completed",
      phase: "result",
      artifacts: {
        reviewResultJsonPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, result.jsonPath),
        reviewResultMarkdownPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, result.markdownPath),
        reviewResultMetadataPath: result.metadataPath
          ? toWorkspaceRelativeArtifactPath(latest.workspaceRoot, result.metadataPath)
          : undefined
      },
      now
    })
    next = setReviewRunPhaseProgress(next, {
      trackedPhase: "triage",
      status: "in_progress",
      now
    })
    next = clearReviewRunIssues(next, "result")
    return { ...next, metrics }
  })
}

export async function recordTriageDraft(
  context: ReviewRunContext,
  triagePath: string,
  now = new Date().toISOString()
): Promise<ReviewRunContext> {
  return mutateReviewRun(context, async (latest) => {
    let metrics = latest.metrics
    if (!metrics.humanTriageStartedAt) metrics = startHumanTriageTimer(metrics, now)
    const next = setReviewRunPhaseProgress(latest, {
      trackedPhase: "triage",
      status: "in_progress",
      phase: "triage",
      artifacts: { triageYamlPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, triagePath) },
      now
    })
    return { ...clearReviewRunIssues(next, "triage"), metrics }
  })
}

export async function recordTriageCompleted(
  context: ReviewRunContext,
  triagePath: string,
  now = new Date().toISOString()
): Promise<ReviewRunContext> {
  return mutateReviewRun(context, async (latest) => {
    let metrics = latest.metrics
    if (!metrics.humanTriageStartedAt) {
      metrics = startHumanTriageTimer(metrics, latest.phases.triage.startedAt ?? latest.updatedAt)
    }
    metrics = completeHumanTriageTimer(metrics, now)
    let next = setReviewRunPhaseProgress(latest, {
      trackedPhase: "triage",
      status: "completed",
      phase: "triage",
      artifacts: { triageYamlPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, triagePath) },
      now
    })
    next = setReviewRunPhaseProgress(next, {
      trackedPhase: "record",
      status: "in_progress",
      now
    })
    next = clearReviewRunIssues(next, "triage")
    return { ...next, metrics }
  })
}

export async function correctActiveReviewRunMetrics(
  context: ReviewRunContext,
  correction: ReviewRunMetricCorrection,
  now = new Date().toISOString()
): Promise<ReviewRunContext> {
  return mutateReviewRun(context, async (latest) => ({
    ...latest,
    updatedAt: now,
    metrics: correctReviewRunMetrics(latest.metrics, correction)
  }))
}

export async function finalizeReviewRun(
  context: ReviewRunContext,
  now = new Date().toISOString()
): Promise<ReviewRunFinalizeResult> {
  if (context.phases.triage.status !== "completed") {
    throw new Error("triage phase must be completed before Review Run finalization")
  }

  let current = context
  let recordPath = ""
  try {
    current = await mutateReviewRun(current, async (latest) => {
      if (latest.phases.triage.status !== "completed") {
        throw new Error("triage phase must be completed before Review Run finalization")
      }
      const result = await createReviewRunRecordArtifact(latest)
      recordPath = result.recordPath
      let next = setReviewRunPhaseProgress(latest, {
        trackedPhase: "record",
        status: "completed",
        artifacts: { recordYamlPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, result.recordPath) },
        now
      })
      next = setReviewRunPhaseProgress(next, {
        trackedPhase: "summary",
        status: "in_progress",
        now
      })
      return clearReviewRunIssues(next, "record")
    })
  } catch (error) {
    await recordReviewRunPhaseFailure(context, "record", error, now).catch(() => undefined)
    throw error
  }

  let summaryJsonPath = ""
  let summaryMarkdownPath = ""
  try {
    current = await mutateReviewRun(current, async (latest) => {
      const result = await createReviewRunSummaryArtifacts(latest)
      summaryJsonPath = result.summaryJsonPath
      summaryMarkdownPath = result.summaryMarkdownPath
      let next = setReviewRunPhaseProgress(latest, {
        trackedPhase: "summary",
        status: "completed",
        artifacts: {
          summaryJsonPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, result.summaryJsonPath),
          summaryMarkdownPath: toWorkspaceRelativeArtifactPath(latest.workspaceRoot, result.summaryMarkdownPath)
        },
        now
      })
      next = clearReviewRunIssues(next, "summary")
      return advanceReviewRun(next, { phase: "completed", now })
    })
  } catch (error) {
    await recordReviewRunPhaseFailure(current, "summary", error, now).catch(() => undefined)
    throw error
  }

  return { context: current, recordPath, summaryJsonPath, summaryMarkdownPath }
}

export async function loadReviewRun(input: ReviewRunCommandInput): Promise<ReviewRunContext> {
  return readReviewRun(input.workspaceRoot, input.campaignId, input.reviewId)
}

export function reviewRunCommandInput(context: ReviewRunContext): ReviewRunCommandInput {
  return {
    workspaceRoot: context.workspaceRoot,
    campaignId: context.campaignId,
    reviewId: context.reviewId
  }
}

export async function validateReviewRunCommandInput(
  input: ReviewRunCommandInput,
  openWorkspaceRoots: string[]
): Promise<ReviewRunCommandInput> {
  const workspaceRoot = path.resolve(input.workspaceRoot)
  const campaignId = validateReviewRunSegment(input.campaignId, "campaignId")
  const reviewId = validateReviewRunSegment(input.reviewId, "reviewId")
  const candidateRoots = openWorkspaceRoots
    .map((root) => path.resolve(root))
    .filter((root) => isInsideOrSame(root, workspaceRoot))

  let lastBoundaryError: unknown
  for (const root of candidateRoots) {
    try {
      await assertReviewRunPathContained(root, workspaceRoot)
      const stats = await fs.stat(workspaceRoot)
      if (!stats.isDirectory()) throw new Error("workspaceRoot is not a directory")
      return { workspaceRoot, campaignId, reviewId }
    } catch (error) {
      lastBoundaryError = error
    }
  }

  const detail = lastBoundaryError instanceof Error ? `: ${lastBoundaryError.message}` : ""
  throw new Error(`Review Run workspaceRoot must be a safe path inside an open workspace folder: ${input.workspaceRoot}${detail}`)
}

export function buildReviewRunMetadataSection(context: ReviewRunContext): string {
  return [
    "## Review Run",
    "",
    `- campaign_id: ${context.campaignId}`,
    `- review_id: ${context.reviewId}`,
    "- output_contract: Use this exact review_id in the final review-result JSON.",
    ""
  ].join("\n")
}

export function toWorkspaceRelativeArtifactPath(workspaceRoot: string, filePath: string): string {
  const root = path.resolve(workspaceRoot)
  const value = filePath.trim()
  if (!value) throw new Error("Review Run artifact path is required")
  const resolved = isAbsolutePath(value) ? path.resolve(value) : path.resolve(root, value)
  const relative = path.relative(root, resolved)
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Artifact path is outside Review Run workspace: ${filePath}`)
  }
  return relative.split(path.sep).join("/")
}

async function recordReviewRunPhaseFailure(
  context: ReviewRunContext,
  phase: Extract<ReviewRunTrackedPhase, "record" | "summary">,
  error: unknown,
  now: string
): Promise<ReviewRunContext> {
  const message = error instanceof Error ? error.message : String(error)
  return mutateReviewRun(context, async (latest) => {
    let next = setReviewRunPhaseProgress(latest, {
      trackedPhase: phase,
      status: "failed",
      issue: message,
      now
    })
    next = clearReviewRunIssues(next, phase)
    return appendReviewRunIssue(next, {
      phase,
      message,
      retryable: true,
      recordedAt: now
    })
  })
}

async function mutateReviewRun(
  context: ReviewRunContext,
  updater: (latest: ReviewRunContext) => Promise<ReviewRunContext> | ReviewRunContext
): Promise<ReviewRunContext> {
  const key = reviewRunMutationKey(context)
  const previous = mutationQueues.get(key) ?? Promise.resolve()
  let result: ReviewRunContext | undefined
  let failure: unknown
  const current = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        const latest = await readReviewRun(context.workspaceRoot, context.campaignId, context.reviewId)
        if (latest.updatedAt !== context.updatedAt) {
          throw new Error(
            `Review Run changed since it was loaded: expected updatedAt ${context.updatedAt}, got ${latest.updatedAt}`
          )
        }
        result = await updater(latest)
        await writeReviewRun(result, { expectedUpdatedAt: latest.updatedAt })
      } catch (error) {
        failure = error
      }
    })
  mutationQueues.set(key, current)
  await current
  if (mutationQueues.get(key) === current) mutationQueues.delete(key)
  if (failure) throw failure
  if (!result) throw new Error("Review Run update did not produce a result")
  return result
}

function reviewRunMutationKey(context: ReviewRunContext): string {
  return [path.resolve(context.workspaceRoot), context.campaignId, context.reviewId].join("\u0000")
}

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/")
}

async function reserveReviewRunIdentity(
  workspaceRoot: string,
  campaignId: string,
  requestedReviewId: string
): Promise<{ reviewId: string; directory: string }> {
  const safeRequestedReviewId = validateReviewRunSegment(requestedReviewId, "reviewId")
  const firstDirectory = reviewRunDirectory(workspaceRoot, campaignId, safeRequestedReviewId)
  const recordsRoot = path.dirname(firstDirectory)
  await assertReviewRunPathContained(workspaceRoot, recordsRoot)
  await fs.mkdir(recordsRoot, { recursive: true })
  await assertReviewRunPathContained(workspaceRoot, recordsRoot)

  for (let index = 1; index <= 999; index += 1) {
    const reviewId = index === 1
      ? safeRequestedReviewId
      : validateReviewRunSegment(
        `${safeRequestedReviewId}-${String(index).padStart(2, "0")}`,
        "reviewId"
      )
    const directory = reviewRunDirectory(workspaceRoot, campaignId, reviewId)
    await assertReviewRunPathContained(workspaceRoot, directory)
    try {
      await fs.mkdir(directory)
      await assertReviewRunPathContained(workspaceRoot, directory)
      return { reviewId, directory }
    } catch (error) {
      if (isNodeError(error) && error.code === "EEXIST") continue
      throw error
    }
  }

  throw new Error(`Could not allocate a unique Review Run id for ${safeRequestedReviewId}`)
}

async function removeReservedDirectoryIfEmpty(directory: string): Promise<void> {
  try {
    await fs.rmdir(directory)
  } catch (error) {
    if (isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTEMPTY" || error.code === "EEXIST")) return
    throw error
  }
}

function isInsideOrSame(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
