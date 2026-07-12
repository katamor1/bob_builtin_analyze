import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { reviewRunJsonPath, validateReviewRunSegment } from "./reviewRunPaths"
import {
  REVIEW_RUN_SCHEMA_VERSION,
  type ReviewRunContext,
  type ReviewRunPhase,
  type ReviewRunTargetMode
} from "./reviewRunTypes"

const REVIEW_RUN_PHASES = new Set<ReviewRunPhase>(["target", "packet", "result", "triage", "completed"])
const TARGET_MODES = new Set<ReviewRunTargetMode>(["singleRevision", "revisionRange", "workingTreeSinceRevision"])

export async function writeReviewRun(context: ReviewRunContext): Promise<string> {
  assertReviewRunContext(context)
  const filePath = reviewRunJsonPath(context.workspaceRoot, context.campaignId, context.reviewId)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.review-run.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  )
  await fs.writeFile(temporaryPath, `${JSON.stringify(context, null, 2)}\n`, "utf8")
  try {
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
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(filePath, "utf8"))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (isNodeError(error) && error.code === "ENOENT") throw error
    throw new Error(`Failed to parse Review Run JSON: ${message}`)
  }
  assertReviewRunContext(parsed)
  if (path.resolve(parsed.workspaceRoot) !== path.resolve(workspaceRoot)) {
    throw new Error("Review Run workspaceRoot does not match the requested workspace")
  }
  if (parsed.campaignId !== safeCampaignId || parsed.reviewId !== safeReviewId) {
    throw new Error("Review Run identity does not match the requested campaign/review")
  }
  return parsed
}

export function assertReviewRunContext(value: unknown): asserts value is ReviewRunContext {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Review Run must be an object")
  const run = value as Record<string, unknown>
  if (run.schemaVersion !== REVIEW_RUN_SCHEMA_VERSION) {
    throw new Error(`Unsupported Review Run schemaVersion: ${String(run.schemaVersion)}`)
  }
  if (typeof run.workspaceRoot !== "string" || !run.workspaceRoot.trim()) throw new Error("Review Run workspaceRoot is required")
  if (typeof run.campaignId !== "string") throw new Error("Review Run campaignId is required")
  if (typeof run.reviewId !== "string") throw new Error("Review Run reviewId is required")
  validateReviewRunSegment(run.campaignId, "campaignId")
  validateReviewRunSegment(run.reviewId, "reviewId")
  if (typeof run.phase !== "string" || !REVIEW_RUN_PHASES.has(run.phase as ReviewRunPhase)) {
    throw new Error(`Invalid Review Run phase: ${String(run.phase)}`)
  }
  if (typeof run.createdAt !== "string" || typeof run.updatedAt !== "string") {
    throw new Error("Review Run timestamps are required")
  }
  if (!run.target || typeof run.target !== "object" || Array.isArray(run.target)) throw new Error("Review Run target is required")
  const target = run.target as Record<string, unknown>
  if (typeof target.mode !== "string" || !TARGET_MODES.has(target.mode as ReviewRunTargetMode)) {
    throw new Error(`Invalid Review Run target mode: ${String(target.mode)}`)
  }
  if (typeof target.repositoryRoot !== "string" || !target.repositoryRoot.trim()) {
    throw new Error("Review Run target.repositoryRoot is required")
  }
  if (!run.artifacts || typeof run.artifacts !== "object" || Array.isArray(run.artifacts)) {
    throw new Error("Review Run artifacts must be an object")
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
