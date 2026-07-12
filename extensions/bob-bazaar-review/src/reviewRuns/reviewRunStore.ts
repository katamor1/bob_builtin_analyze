import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  assertReviewRunPathContained,
  reviewRunJsonPath,
  validateReviewRunSegment
} from "./reviewRunPaths"
import { normalizeReviewRunContext } from "./reviewRunState"
import {
  REVIEW_RUN_SCHEMA_VERSION,
  type ReviewRunContext,
  type ReviewRunPhase,
  type ReviewRunPhaseStatus,
  type ReviewRunTargetMode,
  type ReviewRunTrackedPhase
} from "./reviewRunTypes"

const REVIEW_RUN_PHASES = new Set<ReviewRunPhase>(["target", "packet", "result", "triage", "completed"])
const TARGET_MODES = new Set<ReviewRunTargetMode>(["singleRevision", "revisionRange", "workingTreeSinceRevision"])
const TRACKED_PHASES: ReviewRunTrackedPhase[] = ["target", "packet", "result", "triage", "record", "summary"]
const PHASE_STATUSES = new Set<ReviewRunPhaseStatus>(["not_started", "in_progress", "completed", "blocked", "failed", "skipped"])

export interface WriteReviewRunOptions {
  expectedUpdatedAt?: string
}

export async function writeReviewRun(
  context: ReviewRunContext,
  options: WriteReviewRunOptions = {}
): Promise<string> {
  const normalized = normalizeReviewRunContext(context)
  assertReviewRunContext(normalized)
  const filePath = reviewRunJsonPath(normalized.workspaceRoot, normalized.campaignId, normalized.reviewId)
  const directory = path.dirname(filePath)
  await assertReviewRunPathContained(normalized.workspaceRoot, directory)
  await fs.mkdir(directory, { recursive: true })
  await assertReviewRunPathContained(normalized.workspaceRoot, directory)

  if (options.expectedUpdatedAt !== undefined) {
    let current: ReviewRunContext
    try {
      current = await readReviewRun(normalized.workspaceRoot, normalized.campaignId, normalized.reviewId)
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error("Review Run changed since it was loaded: persisted state is missing")
      }
      throw error
    }
    if (current.updatedAt !== options.expectedUpdatedAt) {
      throw new Error(
        `Review Run changed since it was loaded: expected updatedAt ${options.expectedUpdatedAt}, got ${current.updatedAt}`
      )
    }
  }

  const temporaryPath = path.join(
    directory,
    `.review-run.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  )
  try {
    await fs.writeFile(temporaryPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8")
    await replaceFile(temporaryPath, filePath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true })
    throw error
  }
  return filePath
}

export async function readReviewRun(workspaceRoot: string, campaignId: string, reviewId: string): Promise<ReviewRunContext> {
  const safeCampaignId = validateReviewRunSegment(campaignId, "campaignId")
  const safeReviewId = validateReviewRunSegment(reviewId, "reviewId")
  const filePath = reviewRunJsonPath(workspaceRoot, safeCampaignId, safeReviewId)
  await assertReviewRunPathContained(workspaceRoot, filePath)
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isNodeError(error) && error.code === "ENOENT") throw error
    throw new Error(`Failed to parse Review Run JSON: ${message}`)
  }
  assertReviewRunSchemaAndIdentity(parsed)
  const normalized = normalizeReviewRunContext(parsed)
  assertReviewRunContext(normalized)
  if (path.resolve(normalized.workspaceRoot) !== path.resolve(workspaceRoot)) {
    throw new Error("Review Run workspaceRoot does not match the requested workspace")
  }
  if (normalized.campaignId !== safeCampaignId || normalized.reviewId !== safeReviewId) {
    throw new Error("Review Run identity does not match the requested campaign/review")
  }
  return normalized
}

export async function listReviewRuns(workspaceRoot: string): Promise<ReviewRunContext[]> {
  const campaignsRoot = path.join(path.resolve(workspaceRoot), ".bob-review-records", "campaigns")
  await assertReviewRunPathContained(workspaceRoot, campaignsRoot)
  const campaigns = await readDirectories(campaignsRoot)
  const runs: ReviewRunContext[] = []

  for (const campaign of campaigns) {
    if (campaign.name === "_template" || campaign.isSymbolicLink()) continue
    let campaignId: string
    try {
      campaignId = validateReviewRunSegment(campaign.name, "campaignId")
    } catch {
      continue
    }
    const recordsRoot = path.join(campaignsRoot, campaign.name, "records")
    await assertReviewRunPathContained(workspaceRoot, recordsRoot)
    const records = await readDirectories(recordsRoot)
    for (const record of records) {
      if (record.name === "_template" || record.isSymbolicLink()) continue
      let reviewId: string
      try {
        reviewId = validateReviewRunSegment(record.name, "reviewId")
      } catch {
        continue
      }
      try {
        runs.push(await readReviewRun(workspaceRoot, campaignId, reviewId))
      } catch {
        // Malformed or legacy-only directories are handled by the explicit recovery flow.
      }
    }
  }

  return runs.sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
}

export function assertReviewRunContext(value: unknown): asserts value is ReviewRunContext {
  assertReviewRunSchemaAndIdentity(value)
  const run = value as ReviewRunContext
  if (typeof run.workspaceRoot !== "string" || !run.workspaceRoot.trim()) throw new Error("Review Run workspaceRoot is required")
  if (!REVIEW_RUN_PHASES.has(run.phase)) throw new Error(`Invalid Review Run phase: ${String(run.phase)}`)
  if (run.status !== "in_progress" && run.status !== "completed") throw new Error(`Invalid Review Run status: ${String(run.status)}`)
  if (typeof run.createdAt !== "string" || typeof run.updatedAt !== "string") throw new Error("Review Run timestamps are required")
  if (!run.target || typeof run.target !== "object" || Array.isArray(run.target)) throw new Error("Review Run target is required")
  if (!TARGET_MODES.has(run.target.mode)) throw new Error(`Invalid Review Run target mode: ${String(run.target.mode)}`)
  if (typeof run.target.repositoryRoot !== "string" || !run.target.repositoryRoot.trim()) {
    throw new Error("Review Run target.repositoryRoot is required")
  }
  if (!run.artifacts || typeof run.artifacts !== "object" || Array.isArray(run.artifacts)) {
    throw new Error("Review Run artifacts must be an object")
  }
  if (!run.phases || typeof run.phases !== "object" || Array.isArray(run.phases)) {
    throw new Error("Review Run phases must be an object")
  }
  for (const phase of TRACKED_PHASES) {
    if (!run.phases[phase] || !PHASE_STATUSES.has(run.phases[phase].status)) {
      throw new Error(`Invalid Review Run phase status: ${phase}`)
    }
  }
  if (!run.metrics || typeof run.metrics !== "object" || Array.isArray(run.metrics)) {
    throw new Error("Review Run metrics must be an object")
  }
  if (!Number.isFinite(run.metrics.bobReviewSeconds) || run.metrics.bobReviewSeconds < 0) {
    throw new Error("Review Run metrics.bobReviewSeconds must be non-negative")
  }
  if (!Number.isFinite(run.metrics.humanTriageSeconds) || run.metrics.humanTriageSeconds < 0) {
    throw new Error("Review Run metrics.humanTriageSeconds must be non-negative")
  }
  if (!Array.isArray(run.issues)) throw new Error("Review Run issues must be an array")
}

function assertReviewRunSchemaAndIdentity(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Review Run must be an object")
  const run = value as Record<string, unknown>
  if (run.schemaVersion !== REVIEW_RUN_SCHEMA_VERSION) {
    throw new Error(`Unsupported Review Run schemaVersion: ${String(run.schemaVersion)}`)
  }
  if (typeof run.campaignId !== "string") throw new Error("Review Run campaignId is required")
  if (typeof run.reviewId !== "string") throw new Error("Review Run reviewId is required")
  validateReviewRunSegment(run.campaignId, "campaignId")
  validateReviewRunSegment(run.reviewId, "reviewId")
}

async function readDirectories(directory: string): Promise<Array<import("node:fs").Dirent>> {
  try {
    return (await fs.readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await fs.rename(source, destination)
  } catch (error) {
    if (!isNodeError(error) || (error.code !== "EEXIST" && error.code !== "EPERM" && error.code !== "ENOTEMPTY")) {
      throw error
    }
    await fs.rm(destination, { force: true })
    await fs.rename(source, destination)
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
