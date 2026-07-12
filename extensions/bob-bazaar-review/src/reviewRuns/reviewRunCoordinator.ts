import * as path from "node:path"
import { writeReviewPacketArtifact } from "../records/reviewRecordStore"
import type { CreateReviewRunContextInput } from "./reviewRunState"
import { advanceReviewRun, createReviewRunContext } from "./reviewRunState"
import { readReviewRun, writeReviewRun } from "./reviewRunStore"
import type { ReviewRunCommandInput, ReviewRunContext } from "./reviewRunTypes"

export interface ReviewRunCaptureResult {
  status: "ok" | "error"
  valid: boolean
  reviewId?: string
  jsonPath?: string
  markdownPath?: string
  metadataPath?: string
}

export async function startReviewRun(input: CreateReviewRunContextInput): Promise<ReviewRunContext> {
  const context = createReviewRunContext(input)
  await writeReviewRun(context)
  return context
}

export async function recordReviewPacket(context: ReviewRunContext, packetText: string): Promise<ReviewRunContext> {
  const { packetPath } = await writeReviewPacketArtifact(
    context.workspaceRoot,
    context.campaignId,
    context.reviewId,
    packetText,
    { backupExisting: true }
  )
  const next = advanceReviewRun(context, {
    phase: "packet",
    artifacts: { reviewPacketPath: toWorkspaceRelativeArtifactPath(context.workspaceRoot, packetPath) }
  })
  await writeReviewRun(next)
  return next
}

export async function recordReviewResult(
  context: ReviewRunContext,
  result: ReviewRunCaptureResult
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
  const next = advanceReviewRun(context, {
    phase: "result",
    artifacts: {
      reviewResultJsonPath: toWorkspaceRelativeArtifactPath(context.workspaceRoot, result.jsonPath),
      reviewResultMarkdownPath: toWorkspaceRelativeArtifactPath(context.workspaceRoot, result.markdownPath),
      reviewResultMetadataPath: result.metadataPath
        ? toWorkspaceRelativeArtifactPath(context.workspaceRoot, result.metadataPath)
        : undefined
    }
  })
  await writeReviewRun(next)
  return next
}

export async function recordTriageDraft(context: ReviewRunContext, triagePath: string): Promise<ReviewRunContext> {
  const next = advanceReviewRun(context, {
    phase: "triage",
    artifacts: { triageYamlPath: toWorkspaceRelativeArtifactPath(context.workspaceRoot, triagePath) }
  })
  await writeReviewRun(next)
  return next
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

function isAbsolutePath(value: string): boolean {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("/")
}
