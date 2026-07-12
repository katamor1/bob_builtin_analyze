import * as fs from "node:fs/promises"
import { buildReviewRecordQualityGate } from "../records/reviewRecordCommandCore"
import { resolveWorkspaceRelativePath } from "../records/reviewRecordPaths"
import {
  REVIEW_RECORD_SCHEMA_VERSION,
  type ReviewRecord,
  type ReviewTriage
} from "../records/reviewRecordTypes"
import {
  generateCampaignSummary,
  readTriage,
  validateReviewRecord,
  writeCampaignSummaryArtifacts,
  writeReviewRecord
} from "../records/reviewRecordStore"
import { validateTriage } from "../records/reviewTriage"
import { reviewRunMetricsToRecordMetrics } from "./reviewRunMetrics"
import type { ReviewRunContext } from "./reviewRunTypes"

export interface ReviewRunRecordArtifactResult {
  record: ReviewRecord
  recordPath: string
}

export interface ReviewRunSummaryArtifactResult {
  summaryJsonPath: string
  summaryMarkdownPath: string
}

export async function createReviewRunRecordArtifact(
  context: ReviewRunContext
): Promise<ReviewRunRecordArtifactResult> {
  const packetPath = requireArtifact(context.artifacts.reviewPacketPath, "reviewPacketPath")
  const reviewResultJsonPath = requireArtifact(context.artifacts.reviewResultJsonPath, "reviewResultJsonPath")
  const reviewResultMarkdownPath = requireArtifact(context.artifacts.reviewResultMarkdownPath, "reviewResultMarkdownPath")
  const triageYamlPath = requireArtifact(context.artifacts.triageYamlPath, "triageYamlPath")
  const reviewResult = JSON.parse(
    await fs.readFile(resolveWorkspaceRelativePath(context.workspaceRoot, reviewResultJsonPath), "utf8")
  )
  const triage = await readTriage(context.workspaceRoot, context.campaignId, context.reviewId)
  const triageIssues = validateTriage(triage, reviewResult)
  if (triageIssues.length > 0) {
    throw new Error(`Review Run triage is invalid:\n${triageIssues.join("\n")}`)
  }

  const record = buildReviewRunRecord(
    context,
    reviewResult,
    triage,
    packetPath,
    reviewResultJsonPath,
    reviewResultMarkdownPath,
    triageYamlPath
  )
  const recordPath = await writeReviewRecord(context.workspaceRoot, record)
  const recordIssues = await validateReviewRecord(context.workspaceRoot, record)
  if (recordIssues.length > 0) {
    throw new Error(`Review Run record is invalid:\n${recordIssues.join("\n")}`)
  }
  return { record, recordPath }
}

export async function createReviewRunSummaryArtifacts(
  context: ReviewRunContext
): Promise<ReviewRunSummaryArtifactResult> {
  const summary = await generateCampaignSummary(context.workspaceRoot, context.campaignId)
  const paths = await writeCampaignSummaryArtifacts(context.workspaceRoot, context.campaignId, summary)
  return {
    summaryJsonPath: paths.jsonPath,
    summaryMarkdownPath: paths.markdownPath
  }
}

function buildReviewRunRecord(
  context: ReviewRunContext,
  reviewResult: any,
  triage: ReviewTriage,
  reviewPacketPath: string,
  reviewResultJsonPath: string,
  reviewResultMarkdownPath: string,
  triageYamlPath: string
): ReviewRecord {
  return {
    schema_version: REVIEW_RECORD_SCHEMA_VERSION,
    campaign_id: context.campaignId,
    record_id: `${context.reviewId}-run-001`,
    review_id: context.reviewId,
    target_id: buildTargetId(context),
    workflow: {
      workflow_id: "bazaar-project-rule-review",
      unavailable: true,
      status: "completed"
    },
    vcs: {
      type: "bazaar",
      repository: context.target.repositoryRoot,
      revision_mode: context.target.mode,
      revision: context.target.revision,
      base_revision: context.target.baseRevision,
      target_revision: context.target.targetRevision
    },
    inputs: {
      review_packet_path: reviewPacketPath,
      checklist_path: ".bob/review/checklist.json"
    },
    outputs: {
      review_result_json: reviewResultJsonPath,
      review_result_markdown: reviewResultMarkdownPath,
      triage_yaml: triageYamlPath
    },
    quality_gate: buildReviewRecordQualityGate(reviewResult, true),
    metrics: reviewRunMetricsToRecordMetrics(context.metrics, triage.summary, triage.items.length),
    notes: "notes.md"
  }
}

function buildTargetId(context: ReviewRunContext): string {
  if (context.target.mode === "singleRevision") {
    return `bzr-r${context.target.revision ?? "unknown"}-single`
  }
  if (context.target.mode === "revisionRange") {
    return `bzr-r${context.target.baseRevision ?? "unknown"}-r${context.target.targetRevision ?? "unknown"}-range`
  }
  return `bzr-r${context.target.baseRevision ?? "top"}-working-tree`
}

function requireArtifact(value: string | undefined, fieldName: string): string {
  if (!value?.trim()) throw new Error(`${fieldName} is required to finalize a Review Run`)
  return value
}
