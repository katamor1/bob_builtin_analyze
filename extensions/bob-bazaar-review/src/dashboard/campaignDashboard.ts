import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  campaignDirectory,
  recordYamlPath,
  resolveWorkspaceRelativePath,
  triageYamlPath
} from "../records/reviewRecordPaths"
import { readReviewRecord, readTriage } from "../records/reviewRecordStore"
import { validateTriage } from "../records/reviewTriage"
import type { ReviewRecord, ReviewTriage } from "../records/reviewRecordTypes"
import {
  assertReviewRunPathContained,
  validateReviewRunSegment
} from "../reviewRuns/reviewRunPaths"
import { readReviewRun } from "../reviewRuns/reviewRunStore"
import type { ReviewRunContext } from "../reviewRuns/reviewRunTypes"
import { buildCampaignDashboard } from "./campaignDashboardCore"
import type {
  CampaignDashboard,
  CampaignDashboardEvidence,
  CampaignDashboardWarning
} from "./campaignDashboardTypes"

export async function generateCampaignDashboard(
  workspaceRoot: string,
  campaignId: string,
  now = new Date().toISOString()
): Promise<CampaignDashboard> {
  const safeCampaignId = validateReviewRunSegment(campaignId, "campaignId")
  const root = path.resolve(workspaceRoot)
  const campaignRoot = campaignDirectory(root, safeCampaignId)
  const warnings: CampaignDashboardWarning[] = []

  try {
    await assertReviewRunPathContained(root, campaignRoot)
    const campaignStats = await fs.lstat(campaignRoot)
    if (campaignStats.isSymbolicLink()) {
      return emptyDashboard(safeCampaignId, now, {
        code: "campaign_symlink_rejected",
        message: `campaign path is a symbolic link and was not read: ${campaignRoot}`,
        artifact: toWorkspaceRelative(root, campaignRoot)
      })
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return emptyDashboard(safeCampaignId, now, {
        code: "campaign_not_found",
        message: `campaign not found: ${safeCampaignId}`,
        artifact: toWorkspaceRelative(root, campaignRoot)
      })
    }
    throw error
  }

  const recordsRoot = path.join(campaignRoot, "records")
  await assertReviewRunPathContained(root, recordsRoot)
  const entries = await readDirectoryEntries(recordsRoot)
  const evidence: CampaignDashboardEvidence[] = []

  for (const entry of entries) {
    if (entry.name === "_template") continue
    if (entry.isSymbolicLink()) {
      warnings.push({
        code: "record_symlink_rejected",
        review_id: entry.name,
        message: `record directory is a symbolic link and was not read: ${entry.name}`,
        artifact: toWorkspaceRelative(root, path.join(recordsRoot, entry.name))
      })
      continue
    }
    if (!entry.isDirectory()) continue

    let reviewId: string
    try {
      reviewId = validateReviewRunSegment(entry.name, "reviewId")
    } catch (error) {
      warnings.push({
        code: "review_id_invalid",
        message: `unsafe review directory was not read: ${entry.name}: ${errorMessage(error)}`,
        artifact: toWorkspaceRelative(root, path.join(recordsRoot, entry.name))
      })
      continue
    }

    let run: ReviewRunContext
    try {
      run = await readReviewRun(root, safeCampaignId, reviewId)
    } catch (error) {
      warnings.push({
        code: "review_run_unreadable",
        review_id: reviewId,
        message: `review-run.json could not be read for ${reviewId}: ${errorMessage(error)}`,
        artifact: toWorkspaceRelative(root, path.join(recordsRoot, reviewId, "review-run.json"))
      })
      continue
    }

    evidence.push(await loadEvidence(root, safeCampaignId, run))
  }

  return buildCampaignDashboard({
    campaignId: safeCampaignId,
    generatedAt: now,
    evidence,
    warnings
  })
}

export async function listCampaignDashboardCampaigns(workspaceRoot: string): Promise<string[]> {
  const root = path.resolve(workspaceRoot)
  const campaignsRoot = path.join(root, ".bob-review-records", "campaigns")
  await assertReviewRunPathContained(root, campaignsRoot)
  const entries = await readDirectoryEntries(campaignsRoot)
  const campaignIds: string[] = []
  for (const entry of entries) {
    if (entry.name === "_template" || entry.isSymbolicLink() || !entry.isDirectory()) continue
    try {
      campaignIds.push(validateReviewRunSegment(entry.name, "campaignId"))
    } catch {
      // Unsafe directories are excluded from selectable campaign identities.
    }
  }
  return campaignIds.sort((left, right) => left.localeCompare(right))
}

async function loadEvidence(
  workspaceRoot: string,
  campaignId: string,
  run: ReviewRunContext
): Promise<CampaignDashboardEvidence> {
  const warnings: CampaignDashboardWarning[] = []
  const recordPath = recordYamlPath(workspaceRoot, campaignId, run.reviewId)
  const recordStats = await lstatIfExists(recordPath)
  let recordPresent = Boolean(recordStats)
  let record: ReviewRecord | undefined

  if (recordStats?.isSymbolicLink()) {
    warnings.push({
      code: "record_symlink_rejected",
      review_id: run.reviewId,
      message: `record.yaml is a symbolic link and was not read for ${run.reviewId}`,
      artifact: toWorkspaceRelative(workspaceRoot, recordPath)
    })
  } else if (recordStats) {
    try {
      await assertReviewRunPathContained(workspaceRoot, recordPath)
      const candidate = await readReviewRecord(workspaceRoot, campaignId, run.reviewId)
      if (candidate.campaign_id !== campaignId || candidate.review_id !== run.reviewId) {
        warnings.push({
          code: "record_identity_mismatch",
          review_id: run.reviewId,
          message: `record.yaml identity does not match campaign/review ${campaignId}/${run.reviewId}`,
          artifact: toWorkspaceRelative(workspaceRoot, recordPath)
        })
      } else {
        record = candidate
      }
    } catch (error) {
      warnings.push({
        code: "record_unreadable",
        review_id: run.reviewId,
        message: `record.yaml could not be read for ${run.reviewId}: ${errorMessage(error)}`,
        artifact: toWorkspaceRelative(workspaceRoot, recordPath)
      })
    }
  } else if (run.phases.record.status === "completed") {
    warnings.push({
      code: "record_missing",
      review_id: run.reviewId,
      message: `record phase is completed but record.yaml is missing for ${run.reviewId}`,
      artifact: toWorkspaceRelative(workspaceRoot, recordPath)
    })
  }

  const resultLoad = await loadReviewResult(workspaceRoot, run, record)
  warnings.push(...resultLoad.warnings)
  const ruleTitles = resultLoad.result ? collectRuleTitles(resultLoad.result) : {}

  const triageLoad = await loadTriage(
    workspaceRoot,
    campaignId,
    run,
    resultLoad.result,
    resultLoad.identityValid
  )
  warnings.push(...triageLoad.warnings)

  return {
    run,
    record,
    recordPresent,
    triage: triageLoad.triage,
    triageValid: triageLoad.valid,
    ruleTitles,
    warnings
  }
}

async function loadReviewResult(
  workspaceRoot: string,
  run: ReviewRunContext,
  record: ReviewRecord | undefined
): Promise<{ result?: any; identityValid: boolean; warnings: CampaignDashboardWarning[] }> {
  const warnings: CampaignDashboardWarning[] = []
  const relativePath = run.artifacts.reviewResultJsonPath ?? record?.outputs?.review_result_json
  if (!relativePath) {
    if (run.phases.result.status === "completed") {
      warnings.push({
        code: "review_result_path_missing",
        review_id: run.reviewId,
        message: `result phase is completed but no review-result JSON path is recorded for ${run.reviewId}`
      })
      return { identityValid: false, warnings }
    }
    return { identityValid: true, warnings }
  }

  let absolutePath: string
  try {
    absolutePath = resolveWorkspaceRelativePath(workspaceRoot, relativePath)
    await assertReviewRunPathContained(workspaceRoot, absolutePath)
  } catch (error) {
    warnings.push({
      code: "review_result_path_invalid",
      review_id: run.reviewId,
      message: `review-result JSON path is invalid for ${run.reviewId}: ${errorMessage(error)}`,
      artifact: relativePath
    })
    return { identityValid: false, warnings }
  }

  try {
    const result = JSON.parse(await fs.readFile(absolutePath, "utf8"))
    if (result?.review_id !== run.reviewId) {
      warnings.push({
        code: "review_result_identity_mismatch",
        review_id: run.reviewId,
        message: `review-result review_id ${String(result?.review_id)} does not match Review Run ${run.reviewId}`,
        artifact: relativePath
      })
      return { identityValid: false, warnings }
    }
    return { result, identityValid: true, warnings }
  } catch (error) {
    warnings.push({
      code: "review_result_unreadable",
      review_id: run.reviewId,
      message: `review-result JSON could not be read for ${run.reviewId}: ${errorMessage(error)}`,
      artifact: relativePath
    })
    return { identityValid: false, warnings }
  }
}

async function loadTriage(
  workspaceRoot: string,
  campaignId: string,
  run: ReviewRunContext,
  reviewResult: any,
  reviewResultIdentityValid: boolean
): Promise<{ triage?: ReviewTriage; valid: boolean; warnings: CampaignDashboardWarning[] }> {
  const warnings: CampaignDashboardWarning[] = []
  const absolutePath = triageYamlPath(workspaceRoot, campaignId, run.reviewId)
  const relativePath = run.artifacts.triageYamlPath ?? toWorkspaceRelative(workspaceRoot, absolutePath)
  const stats = await lstatIfExists(absolutePath)
  if (!stats) {
    if (run.phases.result.status === "completed") {
      warnings.push({
        code: "triage_missing",
        review_id: run.reviewId,
        message: `triage.yaml is missing for ${run.reviewId}`,
        artifact: relativePath
      })
    }
    return { valid: false, warnings }
  }
  if (stats.isSymbolicLink()) {
    warnings.push({
      code: "triage_symlink_rejected",
      review_id: run.reviewId,
      message: `triage.yaml is a symbolic link and was not read for ${run.reviewId}`,
      artifact: relativePath
    })
    return { valid: false, warnings }
  }

  try {
    await assertReviewRunPathContained(workspaceRoot, absolutePath)
    const triage = await readTriage(workspaceRoot, campaignId, run.reviewId)
    if (triage.review_id !== run.reviewId) {
      warnings.push({
        code: "triage_identity_mismatch",
        review_id: run.reviewId,
        message: `triage review_id ${String(triage.review_id)} does not match Review Run ${run.reviewId}`,
        artifact: relativePath
      })
      return { triage, valid: false, warnings }
    }
    if (!reviewResultIdentityValid) {
      warnings.push({
        code: "triage_result_identity_unverified",
        review_id: run.reviewId,
        message: `triage decisions were excluded because review-result identity is invalid for ${run.reviewId}`,
        artifact: relativePath
      })
      return { triage, valid: false, warnings }
    }
    const issues = validateTriage(triage, reviewResult)
    if (issues.length > 0) {
      warnings.push({
        code: "triage_invalid",
        review_id: run.reviewId,
        message: `triage.yaml is invalid for ${run.reviewId}: ${issues.join("; ")}`,
        artifact: relativePath
      })
      return { triage, valid: false, warnings }
    }
    if (!reviewResult) {
      warnings.push({
        code: "triage_coverage_unverified",
        review_id: run.reviewId,
        message: `triage finding coverage could not be verified because review-result JSON is unavailable for ${run.reviewId}`,
        artifact: relativePath
      })
      return { triage, valid: false, warnings }
    }
    return { triage, valid: true, warnings }
  } catch (error) {
    warnings.push({
      code: "triage_unreadable",
      review_id: run.reviewId,
      message: `triage.yaml could not be read for ${run.reviewId}: ${errorMessage(error)}`,
      artifact: relativePath
    })
    return { valid: false, warnings }
  }
}

function collectRuleTitles(reviewResult: any): Record<string, string> {
  const titles: Record<string, string> = {}
  for (const entry of Array.isArray(reviewResult?.checklist_results) ? reviewResult.checklist_results : []) {
    if (typeof entry?.rule_id === "string" && typeof entry?.title === "string" && !titles[entry.rule_id]) {
      titles[entry.rule_id] = entry.title
    }
  }
  for (const entry of Array.isArray(reviewResult?.findings) ? reviewResult.findings : []) {
    if (typeof entry?.rule_id === "string" && typeof entry?.title === "string" && !titles[entry.rule_id]) {
      titles[entry.rule_id] = entry.title
    }
  }
  return titles
}

function emptyDashboard(
  campaignId: string,
  generatedAt: string,
  warning: CampaignDashboardWarning
): CampaignDashboard {
  return buildCampaignDashboard({ campaignId, generatedAt, evidence: [], warnings: [warning] })
}

async function readDirectoryEntries(directory: string): Promise<Array<import("node:fs").Dirent>> {
  try {
    return await fs.readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }
}

async function lstatIfExists(filePath: string): Promise<import("node:fs").Stats | undefined> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    throw error
  }
}

function toWorkspaceRelative(workspaceRoot: string, filePath: string): string {
  return path.relative(path.resolve(workspaceRoot), path.resolve(filePath)).split(path.sep).join("/")
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
