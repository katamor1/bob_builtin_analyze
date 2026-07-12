import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { resolveWorkspaceRelativePath } from "../records/reviewRecordPaths"
import type { ReviewRecord, ReviewTriage } from "../records/reviewRecordTypes"
import { fromYaml } from "../records/reviewRecordYaml"
import { assertReviewRunPathContained, validateReviewRunSegment } from "../reviewRuns/reviewRunPaths"
import { listReviewRuns } from "../reviewRuns/reviewRunStore"
import {
  buildCampaignDashboard,
  renderCampaignDashboardCsv,
  renderCampaignDashboardMarkdown,
  type CampaignDashboard,
  type DashboardReviewResult
} from "./campaignDashboard"

export interface CampaignDashboardArtifacts {
  dashboard: CampaignDashboard
  jsonPath: string
  markdownPath: string
  csvPath: string
}

export async function generateCampaignDashboardArtifacts(
  workspaceRoot: string,
  campaignId: string,
  now = new Date().toISOString()
): Promise<CampaignDashboardArtifacts> {
  const safeCampaignId = validateReviewRunSegment(campaignId, "campaignId")
  const campaignRoot = path.join(path.resolve(workspaceRoot), ".bob-review-records", "campaigns", safeCampaignId)
  await assertReviewRunPathContained(workspaceRoot, campaignRoot)
  const warnings: string[] = []
  const records: ReviewRecord[] = []
  const triages: Array<{ reviewId: string; value: ReviewTriage }> = []
  const results: Array<{ reviewId: string; value: DashboardReviewResult }> = []
  const recordsRoot = path.join(campaignRoot, "records")

  for (const entry of await readDirectories(recordsRoot)) {
    if (entry.name === "_template" || entry.isSymbolicLink()) continue
    let reviewId: string
    try {
      reviewId = validateReviewRunSegment(entry.name, "reviewId")
    } catch (error) {
      warnings.push(`Skipped unsafe review directory ${entry.name}: ${messageOf(error)}`)
      continue
    }
    const recordRoot = path.join(recordsRoot, reviewId)
    try {
      await assertReviewRunPathContained(workspaceRoot, recordRoot)
    } catch (error) {
      warnings.push(`Skipped unsafe review directory ${reviewId}: ${messageOf(error)}`)
      continue
    }

    const record = await readYamlOptional<ReviewRecord>(path.join(recordRoot, "record.yaml"), `record ${reviewId}`, warnings)
    if (record) {
      if (record.campaign_id !== safeCampaignId || record.review_id !== reviewId) {
        warnings.push(`Record ${reviewId} identity does not match its directory`)
      } else {
        records.push(record)
      }
    }
    const triage = await readYamlOptional<ReviewTriage>(path.join(recordRoot, "triage.yaml"), `triage ${reviewId}`, warnings)
    if (triage) {
      if (triage.review_id !== reviewId) warnings.push(`Triage ${reviewId} identity does not match its directory`)
      else triages.push({ reviewId, value: triage })
    }
    const resultPath = record?.outputs?.review_result_json
    if (resultPath) {
      try {
        const absolute = resolveWorkspaceRelativePath(workspaceRoot, resultPath)
        await assertReviewRunPathContained(workspaceRoot, absolute)
        const value = JSON.parse(await fs.readFile(absolute, "utf8")) as DashboardReviewResult
        results.push({ reviewId, value })
      } catch (error) {
        warnings.push(`Failed to read review-result for ${reviewId}: ${messageOf(error)}`)
      }
    }
  }

  const reviewRuns = (await listReviewRuns(workspaceRoot)).filter((run) => run.campaignId === safeCampaignId)
  const dashboard = buildCampaignDashboard({
    campaignId: safeCampaignId,
    reviewRuns,
    records,
    results,
    triages,
    warnings
  }, now)

  await fs.mkdir(campaignRoot, { recursive: true })
  const jsonPath = path.join(campaignRoot, "dashboard.json")
  const markdownPath = path.join(campaignRoot, "dashboard.md")
  const csvPath = path.join(campaignRoot, "dashboard.csv")
  await Promise.all([
    writeAtomic(jsonPath, `${JSON.stringify(dashboard, null, 2)}\n`),
    writeAtomic(markdownPath, renderCampaignDashboardMarkdown(dashboard)),
    writeAtomic(csvPath, renderCampaignDashboardCsv(dashboard))
  ])
  return { dashboard, jsonPath, markdownPath, csvPath }
}

export async function listCampaignIds(workspaceRoot: string): Promise<string[]> {
  const root = path.join(path.resolve(workspaceRoot), ".bob-review-records", "campaigns")
  await assertReviewRunPathContained(workspaceRoot, root)
  const ids: string[] = []
  for (const entry of await readDirectories(root)) {
    if (entry.name === "_template" || entry.isSymbolicLink()) continue
    try {
      ids.push(validateReviewRunSegment(entry.name, "campaignId"))
    } catch {
      // Unsafe campaign directories are not selectable.
    }
  }
  return ids.sort((a, b) => a.localeCompare(b))
}

async function readYamlOptional<T>(filePath: string, label: string, warnings: string[]): Promise<T | undefined> {
  try {
    const stat = await fs.lstat(filePath)
    if (stat.isSymbolicLink()) {
      warnings.push(`Skipped symlinked ${label}`)
      return undefined
    }
    return fromYaml<T>(await fs.readFile(filePath, "utf8"))
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined
    warnings.push(`Failed to read ${label}: ${messageOf(error)}`)
    return undefined
  }
}

async function readDirectories(directory: string): Promise<Array<import("node:fs").Dirent>> {
  try {
    return (await fs.readdir(directory, { withFileTypes: true })).filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return []
    throw error
  }
}

async function writeAtomic(destination: string, content: string): Promise<void> {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`)
  try {
    await fs.writeFile(temporary, content, "utf8")
    await replaceFile(temporary, destination)
  } catch (error) {
    await fs.rm(temporary, { force: true })
    throw error
  }
}

async function replaceFile(source: string, destination: string): Promise<void> {
  try {
    await fs.rename(source, destination)
  } catch (error) {
    if (!isNodeError(error) || !["EEXIST", "EPERM", "ENOTEMPTY"].includes(error.code ?? "")) throw error
    await fs.rm(destination, { force: true })
    await fs.rename(source, destination)
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
