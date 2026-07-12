import type { ReviewRecord, ReviewTriage, TriageDecision } from "../records/reviewRecordTypes"
import type { ReviewRunContext, ReviewRunTrackedPhase } from "../reviewRuns/reviewRunTypes"

export interface DashboardReviewResult {
  review_id?: string
  findings?: Array<{
    id?: string
    rule_id?: string
    severity?: string
    title?: string
  }>
}

export interface CampaignDashboardInput {
  campaignId: string
  reviewRuns: ReviewRunContext[]
  records: ReviewRecord[]
  results: Array<{ reviewId: string; value: DashboardReviewResult }>
  triages: Array<{ reviewId: string; value: ReviewTriage }>
  warnings?: string[]
}

export interface CampaignDashboardRuleRow {
  rule_id: string
  severity: string
  findings: number
  accepted: number
  rejected: number
  needs_investigation: number
  deferred: number
  acceptance_rate_percent: number
}

export interface CampaignDashboardChangeTypeRow {
  records: number
  findings: number
  baseline_review_minutes: number
  bob_review_minutes: number
  human_triage_minutes: number
  estimated_minutes_saved: number
}

export interface CampaignDashboard {
  schema_version: "bazaar-review-dashboard/v1"
  campaign_id: string
  generated_at: string
  review_runs: {
    total: number
    completed: number
    incomplete: number
    by_next_phase: Record<ReviewRunTrackedPhase | "completed", number>
  }
  records: {
    total: number
    schema_valid: number
    schema_invalid: number
    triage_available: number
  }
  coverage: {
    baseline_records: number
    baseline_percent: number
    triage_records: number
    triage_percent: number
    schema_valid_records: number
    schema_valid_percent: number
  }
  timing: {
    baseline_review_minutes: number
    bob_review_minutes: number
    human_triage_minutes: number
    estimated_minutes_saved: number
  }
  decisions: Record<TriageDecision, number>
  change_types: Record<string, CampaignDashboardChangeTypeRow>
  rules: CampaignDashboardRuleRow[]
  warnings: string[]
}

const TRACKED_PHASES: ReviewRunTrackedPhase[] = ["target", "packet", "result", "triage", "record", "summary"]
const DECISIONS: TriageDecision[] = ["accepted", "rejected", "needs_investigation", "deferred"]

export function buildCampaignDashboard(input: CampaignDashboardInput, now = new Date().toISOString()): CampaignDashboard {
  const warnings = [...(input.warnings ?? [])]
  const results = new Map(input.results.map((item) => [item.reviewId, item.value]))
  const triages = new Map(input.triages.map((item) => [item.reviewId, item.value]))
  const byNextPhase = emptyNextPhaseCounts()

  for (const run of input.reviewRuns) {
    if (run.campaignId !== input.campaignId) warnings.push(`Review Run ${run.reviewId} belongs to campaign ${run.campaignId}`)
    byNextPhase[nextPhase(run)] += 1
  }

  const decisions = emptyDecisionCounts()
  const timing = {
    baseline_review_minutes: 0,
    bob_review_minutes: 0,
    human_triage_minutes: 0,
    estimated_minutes_saved: 0
  }
  const changeTypes: Record<string, CampaignDashboardChangeTypeRow> = {}
  let baselineRecords = 0
  let schemaValidRecords = 0
  let triageRecords = 0

  for (const record of input.records) {
    const metrics = record.metrics ?? {}
    const changeType = record.vcs?.revision_mode || "unknown"
    const row = changeTypes[changeType] ?? emptyChangeTypeRow()
    row.records += 1
    row.findings += finiteNumber(metrics.findings_total)
    row.bob_review_minutes += finiteNumber(metrics.bob_review_minutes)
    row.human_triage_minutes += finiteNumber(metrics.human_triage_minutes)
    timing.bob_review_minutes += finiteNumber(metrics.bob_review_minutes)
    timing.human_triage_minutes += finiteNumber(metrics.human_triage_minutes)

    if (typeof metrics.baseline_review_minutes === "number" && Number.isFinite(metrics.baseline_review_minutes)) {
      const baseline = Math.max(0, metrics.baseline_review_minutes)
      baselineRecords += 1
      timing.baseline_review_minutes += baseline
      row.baseline_review_minutes += baseline
      const saved = Math.max(0, baseline - finiteNumber(metrics.bob_review_minutes) - finiteNumber(metrics.human_triage_minutes))
      timing.estimated_minutes_saved += saved
      row.estimated_minutes_saved += saved
    }
    if (record.quality_gate?.schema_valid === true) schemaValidRecords += 1
    if (triages.has(record.review_id)) triageRecords += 1
    changeTypes[changeType] = row
  }

  const ruleRows = new Map<string, CampaignDashboardRuleRow>()
  for (const [reviewId, result] of results) {
    if (result.review_id && result.review_id !== reviewId) warnings.push(`Result ${reviewId} has mismatched review_id ${result.review_id}`)
    const triage = triages.get(reviewId)
    const triageItems = new Map((triage?.items ?? []).map((item) => [item.finding_id, item]))
    const seenFindingIds = new Set<string>()

    for (const finding of result.findings ?? []) {
      const findingId = finding.id?.trim()
      if (!findingId) {
        warnings.push(`Result ${reviewId} contains a finding without id`)
        continue
      }
      seenFindingIds.add(findingId)
      const ruleId = finding.rule_id?.trim()
      if (!ruleId) {
        warnings.push(`Finding ${findingId} in ${reviewId} is missing rule_id`)
        continue
      }
      const row = ruleRows.get(ruleId) ?? emptyRuleRow(ruleId, finding.severity)
      row.findings += 1
      if (severityRank(finding.severity) > severityRank(row.severity)) row.severity = normalizeSeverity(finding.severity)
      const item = triageItems.get(findingId)
      if (item && DECISIONS.includes(item.decision)) {
        row[item.decision] += 1
        decisions[item.decision] += 1
      }
      ruleRows.set(ruleId, row)
    }

    for (const item of triage?.items ?? []) {
      if (!seenFindingIds.has(item.finding_id)) warnings.push(`Triage item ${item.finding_id} in ${reviewId} is orphaned from review-result findings`)
    }
  }

  const rules = [...ruleRows.values()]
    .map((row) => ({
      ...row,
      acceptance_rate_percent: percentage(row.accepted, row.findings)
    }))
    .sort((a, b) => a.rule_id.localeCompare(b.rule_id))

  const recordTotal = input.records.length
  const completedRuns = input.reviewRuns.filter((run) => run.status === "completed").length
  return {
    schema_version: "bazaar-review-dashboard/v1",
    campaign_id: input.campaignId,
    generated_at: now,
    review_runs: {
      total: input.reviewRuns.length,
      completed: completedRuns,
      incomplete: input.reviewRuns.length - completedRuns,
      by_next_phase: byNextPhase
    },
    records: {
      total: recordTotal,
      schema_valid: schemaValidRecords,
      schema_invalid: recordTotal - schemaValidRecords,
      triage_available: triageRecords
    },
    coverage: {
      baseline_records: baselineRecords,
      baseline_percent: percentage(baselineRecords, recordTotal),
      triage_records: triageRecords,
      triage_percent: percentage(triageRecords, recordTotal),
      schema_valid_records: schemaValidRecords,
      schema_valid_percent: percentage(schemaValidRecords, recordTotal)
    },
    timing: roundTiming(timing),
    decisions,
    change_types: Object.fromEntries(Object.entries(changeTypes).map(([key, value]) => [key, roundChangeType(value)])),
    rules,
    warnings: uniqueSorted(warnings)
  }
}

export function renderCampaignDashboardMarkdown(dashboard: CampaignDashboard): string {
  const lines = [
    "# Campaign Dashboard",
    "",
    `- campaign_id: ${dashboard.campaign_id}`,
    `- generated_at: ${dashboard.generated_at}`,
    "",
    "## Scorecard",
    "",
    `- Review Runs: ${dashboard.review_runs.completed}/${dashboard.review_runs.total} completed`,
    `- Records: ${dashboard.records.total}`,
    `- Estimated minutes saved: ${dashboard.timing.estimated_minutes_saved}`,
    "",
    "## Coverage",
    "",
    `- Baseline: ${dashboard.coverage.baseline_records}/${dashboard.records.total} (${dashboard.coverage.baseline_percent}%)`,
    `- Triage: ${dashboard.coverage.triage_records}/${dashboard.records.total} (${dashboard.coverage.triage_percent}%)`,
    `- Schema valid: ${dashboard.coverage.schema_valid_records}/${dashboard.records.total} (${dashboard.coverage.schema_valid_percent}%)`,
    "",
    "## Rule effectiveness",
    "",
    "| Rule | Severity | Findings | Accepted | Rejected | Investigation | Deferred | Acceptance |",
    "|---|---:|---:|---:|---:|---:|---:|---:|",
    ...dashboard.rules.map((row) => `| ${escapeMarkdown(row.rule_id)} | ${row.severity} | ${row.findings} | ${row.accepted} | ${row.rejected} | ${row.needs_investigation} | ${row.deferred} | ${row.acceptance_rate_percent}% |`),
    "",
    "## Warnings",
    "",
    ...(dashboard.warnings.length ? dashboard.warnings.map((warning) => `- ${warning}`) : ["- None"]),
    ""
  ]
  return lines.join("\n")
}

export function renderCampaignDashboardCsv(dashboard: CampaignDashboard): string {
  const header = "campaign_id,rule_id,severity,findings,accepted,rejected,needs_investigation,deferred,acceptance_rate_percent"
  const rows = dashboard.rules.map((row) => [
    dashboard.campaign_id,
    row.rule_id,
    row.severity,
    row.findings,
    row.accepted,
    row.rejected,
    row.needs_investigation,
    row.deferred,
    row.acceptance_rate_percent
  ].map(csvCell).join(","))
  return [header, ...rows, ""].join("\n")
}

function nextPhase(run: ReviewRunContext): ReviewRunTrackedPhase | "completed" {
  if (run.status === "completed") return "completed"
  for (const phase of TRACKED_PHASES) {
    if (run.phases?.[phase]?.status !== "completed") return phase
  }
  return "completed"
}

function emptyNextPhaseCounts(): Record<ReviewRunTrackedPhase | "completed", number> {
  return { target: 0, packet: 0, result: 0, triage: 0, record: 0, summary: 0, completed: 0 }
}

function emptyDecisionCounts(): Record<TriageDecision, number> {
  return { accepted: 0, rejected: 0, needs_investigation: 0, deferred: 0 }
}

function emptyRuleRow(ruleId: string, severity?: string): CampaignDashboardRuleRow {
  return {
    rule_id: ruleId,
    severity: normalizeSeverity(severity),
    findings: 0,
    accepted: 0,
    rejected: 0,
    needs_investigation: 0,
    deferred: 0,
    acceptance_rate_percent: 0
  }
}

function emptyChangeTypeRow(): CampaignDashboardChangeTypeRow {
  return { records: 0, findings: 0, baseline_review_minutes: 0, bob_review_minutes: 0, human_triage_minutes: 0, estimated_minutes_saved: 0 }
}

function roundChangeType(row: CampaignDashboardChangeTypeRow): CampaignDashboardChangeTypeRow {
  return {
    ...row,
    baseline_review_minutes: roundOne(row.baseline_review_minutes),
    bob_review_minutes: roundOne(row.bob_review_minutes),
    human_triage_minutes: roundOne(row.human_triage_minutes),
    estimated_minutes_saved: roundOne(row.estimated_minutes_saved)
  }
}

function roundTiming<T extends Record<string, number>>(value: T): T {
  return Object.fromEntries(Object.entries(value).map(([key, number]) => [key, roundOne(number)])) as T
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

function percentage(numerator: number, denominator: number): number {
  return denominator > 0 ? roundOne((numerator / denominator) * 100) : 0
}

function roundOne(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function normalizeSeverity(value?: string): string {
  const normalized = value?.trim().toLowerCase()
  return normalized === "critical" || normalized === "error" || normalized === "warning" || normalized === "info" ? normalized : "unknown"
}

function severityRank(value?: string): number {
  return ({ unknown: 0, info: 1, warning: 2, error: 3, critical: 4 } as Record<string, number>)[normalizeSeverity(value)]
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function escapeMarkdown(value: string): string {
  return value.replace(/\|/g, "\\|")
}

function csvCell(value: unknown): string {
  let text = String(value ?? "")
  if (/^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}
