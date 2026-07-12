import type { ReviewRecord, TriageDecision, TriageItem } from "../records/reviewRecordTypes"
import { secondsToMinutes } from "../reviewRuns/reviewRunMetrics"
import { nextReviewRunAction } from "../reviewRuns/reviewRunResume"
import type { ReviewRunContext, ReviewRunTargetMode } from "../reviewRuns/reviewRunTypes"
import {
  CAMPAIGN_DASHBOARD_SCHEMA_VERSION,
  type CampaignDashboard,
  type CampaignDashboardBuildInput,
  type CampaignDashboardChangeTypeTrend,
  type CampaignDashboardDecisionCounts,
  type CampaignDashboardEvidence,
  type CampaignDashboardRate,
  type CampaignDashboardRuleTrend,
  type CampaignDashboardRun,
  type CampaignDashboardWarning
} from "./campaignDashboardTypes"

export { CAMPAIGN_DASHBOARD_SCHEMA_VERSION } from "./campaignDashboardTypes"
export type {
  CampaignDashboard,
  CampaignDashboardBuildInput,
  CampaignDashboardEvidence
} from "./campaignDashboardTypes"

const CHANGE_TYPE_ORDER: ReviewRunTargetMode[] = [
  "singleRevision",
  "revisionRange",
  "workingTreeSinceRevision"
]

export function buildCampaignDashboard(input: CampaignDashboardBuildInput): CampaignDashboard {
  const warnings: CampaignDashboardWarning[] = [...input.warnings]
  const runs = input.evidence
    .map((evidence) => buildRunRow(evidence))
    .sort((left, right) => Date.parse(right.updated_at) - Date.parse(left.updated_at))
  const pendingIds = new Set(
    input.evidence
      .filter((evidence) => !hasValidTriage(evidence))
      .map((evidence) => evidence.run.reviewId)
  )
  const triagePending = runs.filter((run) => pendingIds.has(run.review_id))

  const decisionTotals = emptyDecisionCounts()
  const ruleMap = new Map<string, MutableRuleTrend>()
  const changeTypeMap = new Map<ReviewRunTargetMode, CampaignDashboardChangeTypeTrend>(
    CHANGE_TYPE_ORDER.map((changeType) => [changeType, emptyChangeTypeTrend(changeType)])
  )

  let recordsTotal = 0
  let schemaValidRecords = 0
  let baselineMinutes = 0
  let bobMinutes = 0
  let triageMinutes = 0
  let failedOrBlockedRuns = 0

  for (const evidence of input.evidence) {
    warnings.push(...evidence.warnings)
    if (evidence.recordPresent) recordsTotal += 1
    if (evidence.record?.quality_gate?.schema_valid === true) schemaValidRecords += 1
    if (hasFailedOrBlockedPhase(evidence.run)) failedOrBlockedRuns += 1

    const finalized = recordMetrics(evidence.record)
    baselineMinutes += finalized.baseline
    bobMinutes += finalized.bob
    triageMinutes += finalized.triage

    const changeTrend = changeTypeMap.get(evidence.run.target.mode)
    if (changeTrend) {
      changeTrend.review_runs += 1
      if (evidence.run.status === "completed") changeTrend.completed_runs += 1
      if (!hasValidTriage(evidence)) changeTrend.triage_pending += 1
      if (evidence.record?.quality_gate?.schema_valid === true) changeTrend.schema_valid_records += 1
      changeTrend.baseline_review_minutes += finalized.baseline
      changeTrend.bob_review_minutes += finalized.bob
      changeTrend.human_triage_minutes += finalized.triage
      changeTrend.estimated_minutes_saved += finalized.baseline - finalized.bob - finalized.triage
    }

    if (!hasValidTriage(evidence)) continue
    const triage = evidence.triage
    if (!triage) continue
    for (const item of triage.items) {
      incrementDecision(decisionTotals, item.decision)
      if (changeTrend) {
        changeTrend.findings_total += 1
        incrementChangeTypeDecision(changeTrend, item.decision)
      }
      addRuleTrend(ruleMap, item, evidence, warnings)
    }
  }

  const findingsTotal = totalDecisions(decisionTotals)
  const schemaInvalidRecords = recordsTotal - schemaValidRecords
  const completedRuns = runs.filter((run) => run.status === "completed").length

  const ruleTrends = Array.from(ruleMap.values())
    .map(finalizeRuleTrend)
    .sort((left, right) => right.detected_count - left.detected_count || left.rule_id.localeCompare(right.rule_id))

  const changeTypeTrends = CHANGE_TYPE_ORDER.map((changeType) => {
    const trend = changeTypeMap.get(changeType) ?? emptyChangeTypeTrend(changeType)
    trend.acceptance_rate = safeRate(trend.accepted, trend.findings_total)
    trend.rejection_rate = safeRate(trend.rejected, trend.findings_total)
    trend.baseline_review_minutes = roundOneDecimal(trend.baseline_review_minutes)
    trend.bob_review_minutes = roundOneDecimal(trend.bob_review_minutes)
    trend.human_triage_minutes = roundOneDecimal(trend.human_triage_minutes)
    trend.estimated_minutes_saved = roundOneDecimal(trend.estimated_minutes_saved)
    return trend
  })

  return {
    schema_version: CAMPAIGN_DASHBOARD_SCHEMA_VERSION,
    campaign_id: input.campaignId,
    generated_at: input.generatedAt,
    overview: {
      review_runs_total: runs.length,
      completed_runs: completedRuns,
      in_progress_runs: runs.length - completedRuns,
      failed_or_blocked_runs: failedOrBlockedRuns,
      records_total: recordsTotal,
      triage_pending: triagePending.length,
      schema_valid_records: schemaValidRecords,
      schema_invalid_records: schemaInvalidRecords,
      schema_validation_rate: safeRate(schemaValidRecords, recordsTotal),
      findings_total: findingsTotal,
      findings_accepted: decisionTotals.accepted,
      findings_rejected: decisionTotals.rejected,
      findings_needs_investigation: decisionTotals.needs_investigation,
      findings_deferred: decisionTotals.deferred,
      finding_acceptance_rate: safeRate(decisionTotals.accepted, findingsTotal),
      finding_rejection_rate: safeRate(decisionTotals.rejected, findingsTotal),
      finding_resolution_rate: safeRate(decisionTotals.accepted + decisionTotals.rejected, findingsTotal),
      baseline_review_minutes_total: roundOneDecimal(baselineMinutes),
      bob_review_minutes_total: roundOneDecimal(bobMinutes),
      human_triage_minutes_total: roundOneDecimal(triageMinutes),
      estimated_minutes_saved: roundOneDecimal(baselineMinutes - bobMinutes - triageMinutes)
    },
    runs,
    triage_pending: triagePending,
    rule_trends: ruleTrends,
    change_type_trends: changeTypeTrends,
    warnings
  }
}

function buildRunRow(evidence: CampaignDashboardEvidence): CampaignDashboardRun {
  const finalized = evidence.record ? recordMetrics(evidence.record) : undefined
  const baseline = finalized
    ? nullableFinite(evidence.record?.metrics?.baseline_review_minutes)
    : nullableFinite(evidence.run.metrics.baselineReviewMinutes)
  const bob = finalized ? finalized.bob : secondsToMinutes(evidence.run.metrics.bobReviewSeconds)
  const triage = finalized ? finalized.triage : secondsToMinutes(evidence.run.metrics.humanTriageSeconds)
  return {
    review_id: evidence.run.reviewId,
    status: evidence.run.status,
    target_mode: evidence.run.target.mode,
    next_action: nextReviewRunAction(evidence.run),
    updated_at: evidence.run.updatedAt,
    triage_status: evidence.run.phases.triage.status,
    schema_valid: evidence.record ? evidence.record.quality_gate?.schema_valid === true : null,
    issue_count: evidence.run.issues.length,
    metrics_source: evidence.record ? "record" : "review_run",
    baseline_review_minutes: baseline,
    bob_review_minutes: roundOneDecimal(bob),
    human_triage_minutes: roundOneDecimal(triage),
    estimated_minutes_saved: baseline === null ? null : roundOneDecimal(baseline - bob - triage),
    phases: {
      target: evidence.run.phases.target.status,
      packet: evidence.run.phases.packet.status,
      result: evidence.run.phases.result.status,
      triage: evidence.run.phases.triage.status,
      record: evidence.run.phases.record.status,
      summary: evidence.run.phases.summary.status
    },
    artifacts: { ...evidence.run.artifacts }
  }
}

function recordMetrics(record: ReviewRecord | undefined): { baseline: number; bob: number; triage: number } {
  return {
    baseline: finiteOrZero(record?.metrics?.baseline_review_minutes),
    bob: finiteOrZero(record?.metrics?.bob_review_minutes),
    triage: finiteOrZero(record?.metrics?.human_triage_minutes)
  }
}

function hasValidTriage(evidence: CampaignDashboardEvidence): boolean {
  return evidence.triageValid === true && Boolean(evidence.triage)
}

function hasFailedOrBlockedPhase(run: ReviewRunContext): boolean {
  return Object.values(run.phases).some((phase) => phase.status === "failed" || phase.status === "blocked")
}

function addRuleTrend(
  ruleMap: Map<string, MutableRuleTrend>,
  item: TriageItem,
  evidence: CampaignDashboardEvidence,
  warnings: CampaignDashboardWarning[]
): void {
  const ruleId = item.rule_id?.trim()
  if (!ruleId) {
    warnings.push({
      code: "triage_rule_id_missing",
      review_id: evidence.run.reviewId,
      message: `triage item ${item.finding_id} has no rule_id and was excluded from rule trends`
    })
    return
  }
  const current = ruleMap.get(ruleId) ?? {
    rule_id: ruleId,
    title: evidence.ruleTitles[ruleId],
    detected_count: 0,
    ...emptyDecisionCounts()
  }
  if (!current.title && evidence.ruleTitles[ruleId]) current.title = evidence.ruleTitles[ruleId]
  current.detected_count += 1
  incrementDecision(current, item.decision)
  ruleMap.set(ruleId, current)
}

function finalizeRuleTrend(trend: MutableRuleTrend): CampaignDashboardRuleTrend {
  return {
    rule_id: trend.rule_id,
    ...(trend.title ? { title: trend.title } : {}),
    detected_count: trend.detected_count,
    accepted: trend.accepted,
    rejected: trend.rejected,
    needs_investigation: trend.needs_investigation,
    deferred: trend.deferred,
    acceptance_rate: safeRate(trend.accepted, trend.detected_count),
    rejection_rate: safeRate(trend.rejected, trend.detected_count)
  }
}

function emptyChangeTypeTrend(changeType: ReviewRunTargetMode): CampaignDashboardChangeTypeTrend {
  return {
    change_type: changeType,
    review_runs: 0,
    completed_runs: 0,
    triage_pending: 0,
    schema_valid_records: 0,
    findings_total: 0,
    accepted: 0,
    rejected: 0,
    needs_investigation: 0,
    deferred: 0,
    acceptance_rate: null,
    rejection_rate: null,
    baseline_review_minutes: 0,
    bob_review_minutes: 0,
    human_triage_minutes: 0,
    estimated_minutes_saved: 0
  }
}

function incrementChangeTypeDecision(trend: CampaignDashboardChangeTypeTrend, decision: TriageDecision): void {
  trend[decision] += 1
}

function emptyDecisionCounts(): CampaignDashboardDecisionCounts {
  return { accepted: 0, rejected: 0, needs_investigation: 0, deferred: 0 }
}

function incrementDecision(target: CampaignDashboardDecisionCounts, decision: TriageDecision): void {
  target[decision] += 1
}

function totalDecisions(counts: CampaignDashboardDecisionCounts): number {
  return counts.accepted + counts.rejected + counts.needs_investigation + counts.deferred
}

function safeRate(numerator: number, denominator: number): CampaignDashboardRate {
  if (denominator === 0) return null
  return Math.round((numerator / denominator + Number.EPSILON) * 10000) / 10000
}

function finiteOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function nullableFinite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function roundOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

interface MutableRuleTrend extends CampaignDashboardDecisionCounts {
  rule_id: string
  title?: string
  detected_count: number
}
