import * as fs from "node:fs/promises"
import * as path from "node:path"
import { readTriage } from "../records/reviewRecordStore"
import { validateTriage } from "../records/reviewTriage"
import {
  assertReviewRunPathContained,
  reviewRunJsonPath,
  validateReviewRunSegment
} from "./reviewRunPaths"
import {
  advanceReviewRun,
  createReviewRunContext,
  setReviewRunPhaseProgress
} from "./reviewRunState"
import { writeReviewRun } from "./reviewRunStore"
import type {
  ReviewRunArtifacts,
  ReviewRunContext,
  ReviewRunPhase,
  ReviewRunTarget
} from "./reviewRunTypes"

export interface LegacyReviewCandidate {
  workspaceRoot: string
  fileStem: string
  reviewId: string
  resultJsonPath: string
  resultMarkdownPath?: string
  campaignIds: string[]
  issues: string[]
  reviewResult: any
}

export interface LegacyReviewRecoveryPreview {
  workspaceRoot: string
  campaignId?: string
  reviewId: string
  target: ReviewRunTarget
  phase: ReviewRunPhase
  artifacts: ReviewRunArtifacts
  blockingIssues: string[]
  warnings: string[]
  requiresCampaignSelection: boolean
  triageValid: boolean
  reviewResult: any
}

export async function listLegacyReviewCandidates(workspaceRoot: string): Promise<LegacyReviewCandidate[]> {
  const root = path.resolve(workspaceRoot)
  const resultsRoot = path.join(root, ".bob", "review", "results")
  await assertReviewRunPathContained(root, resultsRoot)
  const entries = await readDirectory(resultsRoot)
  const candidates: LegacyReviewCandidate[] = []

  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink()) continue
    if (!entry.name.endsWith(".json") || entry.name.endsWith(".artifact-metadata.json")) continue
    const fileStem = entry.name.slice(0, -".json".length)
    const absoluteJsonPath = path.join(resultsRoot, entry.name)
    let reviewResult: any
    const issues: string[] = []
    try {
      reviewResult = JSON.parse(await fs.readFile(absoluteJsonPath, "utf8"))
    } catch (error) {
      reviewResult = {}
      issues.push(`review-result JSON is unreadable: ${error instanceof Error ? error.message : String(error)}`)
    }
    const reviewId = typeof reviewResult?.review_id === "string" && reviewResult.review_id.trim()
      ? reviewResult.review_id.trim()
      : fileStem
    try {
      validateReviewRunSegment(reviewId, "reviewId")
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error))
    }
    if (fileStem !== reviewId) issues.push(`file name ${fileStem} does not match review_id ${reviewId}`)
    const markdownAbsolute = path.join(resultsRoot, `${fileStem}.md`)
    const resultMarkdownPath = await isRegularFile(markdownAbsolute)
      ? toWorkspaceRelative(root, markdownAbsolute)
      : undefined
    candidates.push({
      workspaceRoot: root,
      fileStem,
      reviewId,
      resultJsonPath: toWorkspaceRelative(root, absoluteJsonPath),
      resultMarkdownPath,
      campaignIds: await findCampaignIds(root, reviewId),
      issues,
      reviewResult
    })
  }

  return candidates.sort((left, right) => left.reviewId.localeCompare(right.reviewId))
}

export async function previewLegacyReviewRecovery(
  workspaceRoot: string,
  candidate: LegacyReviewCandidate,
  selectedCampaignId?: string
): Promise<LegacyReviewRecoveryPreview> {
  const root = path.resolve(workspaceRoot)
  if (root !== path.resolve(candidate.workspaceRoot)) throw new Error("Legacy recovery candidate belongs to a different workspace")
  const blockingIssues = [...candidate.issues]
  const warnings: string[] = []
  const campaignId = resolveCampaignId(candidate.campaignIds, selectedCampaignId, blockingIssues)
  const artifacts: ReviewRunArtifacts = {
    reviewResultJsonPath: candidate.resultJsonPath,
    reviewResultMarkdownPath: candidate.resultMarkdownPath
  }
  let triageValid = false

  if (!candidate.resultMarkdownPath) warnings.push("review-result Markdown is missing")
  if (campaignId) {
    const recordRoot = path.join(root, ".bob-review-records", "campaigns", campaignId, "records", candidate.reviewId)
    await assertReviewRunPathContained(root, recordRoot)
    const packet = path.join(recordRoot, "review-packet.md")
    const triage = path.join(recordRoot, "triage.yaml")
    const record = path.join(recordRoot, "record.yaml")
    if (await isRegularFile(packet)) artifacts.reviewPacketPath = toWorkspaceRelative(root, packet)
    if (await isRegularFile(triage)) {
      artifacts.triageYamlPath = toWorkspaceRelative(root, triage)
      try {
        const triageArtifact = await readTriage(root, campaignId, candidate.reviewId)
        const issues = validateTriage(triageArtifact, candidate.reviewResult)
        triageValid = issues.length === 0
        if (issues.length > 0) warnings.push(...issues.map((issue) => `triage: ${issue}`))
      } catch (error) {
        warnings.push(`triage is unreadable: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (await isRegularFile(record)) artifacts.recordYamlPath = toWorkspaceRelative(root, record)
    const summaryJson = path.join(root, ".bob-review-records", "campaigns", campaignId, "summary.json")
    const summaryMarkdown = path.join(root, ".bob-review-records", "campaigns", campaignId, "summary.md")
    if (await isRegularFile(summaryJson)) artifacts.summaryJsonPath = toWorkspaceRelative(root, summaryJson)
    if (await isRegularFile(summaryMarkdown)) artifacts.summaryMarkdownPath = toWorkspaceRelative(root, summaryMarkdown)
    if (await pathExists(reviewRunJsonPath(root, campaignId, candidate.reviewId))) {
      blockingIssues.push("review-run.json already exists for the selected campaign and review")
    }
  }

  return {
    workspaceRoot: root,
    campaignId,
    reviewId: candidate.reviewId,
    target: inferTarget(root, candidate.reviewResult),
    phase: artifacts.triageYamlPath || artifacts.recordYamlPath ? "triage" : "result",
    artifacts,
    blockingIssues,
    warnings,
    requiresCampaignSelection: !campaignId,
    triageValid,
    reviewResult: candidate.reviewResult
  }
}

export async function recoverLegacyReviewRun(preview: LegacyReviewRecoveryPreview): Promise<ReviewRunContext> {
  if (preview.blockingIssues.length > 0 || !preview.campaignId) {
    throw new Error(`Legacy Review Run cannot be recovered:\n${preview.blockingIssues.join("\n") || "campaign selection is required"}`)
  }
  const runPath = reviewRunJsonPath(preview.workspaceRoot, preview.campaignId, preview.reviewId)
  if (await pathExists(runPath)) throw new Error("Legacy Review Run cannot be recovered: review-run.json already exists")

  let run = createReviewRunContext({
    workspaceRoot: preview.workspaceRoot,
    campaignId: preview.campaignId,
    reviewId: preview.reviewId,
    target: preview.target
  })
  run = preview.artifacts.reviewPacketPath
    ? setReviewRunPhaseProgress(run, {
      trackedPhase: "packet",
      status: "completed",
      phase: "packet",
      artifacts: { reviewPacketPath: preview.artifacts.reviewPacketPath }
    })
    : setReviewRunPhaseProgress(run, {
      trackedPhase: "packet",
      status: "blocked",
      issue: "legacy review packet is missing"
    })

  if (preview.artifacts.reviewResultJsonPath && preview.artifacts.reviewResultMarkdownPath) {
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "result",
      status: "completed",
      phase: "result",
      artifacts: {
        reviewResultJsonPath: preview.artifacts.reviewResultJsonPath,
        reviewResultMarkdownPath: preview.artifacts.reviewResultMarkdownPath
      }
    })
  } else {
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "result",
      status: "blocked",
      phase: "result",
      issue: "legacy review-result JSON or Markdown is missing",
      artifacts: { reviewResultJsonPath: preview.artifacts.reviewResultJsonPath }
    })
  }

  if (preview.artifacts.triageYamlPath) {
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "triage",
      status: preview.triageValid ? "completed" : "in_progress",
      phase: "triage",
      artifacts: { triageYamlPath: preview.artifacts.triageYamlPath }
    })
  }
  if (preview.artifacts.recordYamlPath) {
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "record",
      status: "completed",
      artifacts: { recordYamlPath: preview.artifacts.recordYamlPath }
    })
  }
  if (preview.artifacts.summaryJsonPath && preview.artifacts.summaryMarkdownPath) {
    run = setReviewRunPhaseProgress(run, {
      trackedPhase: "summary",
      status: "completed",
      artifacts: {
        summaryJsonPath: preview.artifacts.summaryJsonPath,
        summaryMarkdownPath: preview.artifacts.summaryMarkdownPath
      }
    })
  }
  if (Object.values(run.phases).every((progress) => progress.status === "completed")) {
    run = advanceReviewRun(run, { phase: "completed" })
  }
  await writeReviewRun(run)
  return run
}

async function findCampaignIds(workspaceRoot: string, reviewId: string): Promise<string[]> {
  const campaignsRoot = path.join(workspaceRoot, ".bob-review-records", "campaigns")
  const campaigns = await readDirectory(campaignsRoot)
  const result: string[] = []
  for (const campaign of campaigns) {
    if (!campaign.isDirectory() || campaign.isSymbolicLink() || campaign.name === "_template") continue
    try {
      validateReviewRunSegment(campaign.name, "campaignId")
      const recordRoot = path.join(campaignsRoot, campaign.name, "records", reviewId)
      if (await isDirectory(recordRoot)) result.push(campaign.name)
    } catch {
      // Unsafe legacy directories are not recovery candidates.
    }
  }
  return result.sort()
}

function resolveCampaignId(campaignIds: string[], selected: string | undefined, issues: string[]): string | undefined {
  if (selected?.trim()) return validateReviewRunSegment(selected, "campaignId")
  if (campaignIds.length === 1) return campaignIds[0]
  if (campaignIds.length > 1) issues.push(`multiple campaign candidates: ${campaignIds.join(", ")}`)
  else issues.push("campaign selection is required because no matching record directory exists")
  return undefined
}

function inferTarget(workspaceRoot: string, reviewResult: any): ReviewRunTarget {
  const vcs = reviewResult?.vcs ?? {}
  const rawMode = vcs.revision_mode
  const mode = rawMode === "revisionRange" || rawMode === "range"
    ? "revisionRange"
    : rawMode === "workingTreeSinceRevision" || rawMode === "workingTree"
      ? "workingTreeSinceRevision"
      : "singleRevision"
  return {
    mode,
    repositoryRoot: typeof vcs.repository === "string" && vcs.repository.trim() ? vcs.repository : workspaceRoot,
    revision: typeof vcs.revision === "string" ? vcs.revision : undefined,
    baseRevision: typeof vcs.base_revision === "string" ? vcs.base_revision : undefined,
    targetRevision: typeof vcs.target_revision === "string" ? vcs.target_revision : undefined
  }
}

async function readDirectory(directory: string): Promise<Array<import("node:fs").Dirent>> {
  try {
    return await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(filePath)
    return stats.isFile() && !stats.isSymbolicLink()
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
}

async function isDirectory(directory: string): Promise<boolean> {
  try {
    const stats = await fs.lstat(directory)
    return stats.isDirectory() && !stats.isSymbolicLink()
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false
    throw error
  }
}

function toWorkspaceRelative(workspaceRoot: string, filePath: string): string {
  const relative = path.relative(path.resolve(workspaceRoot), path.resolve(filePath))
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Legacy artifact is outside workspace: ${filePath}`)
  }
  return relative.split(path.sep).join("/")
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
