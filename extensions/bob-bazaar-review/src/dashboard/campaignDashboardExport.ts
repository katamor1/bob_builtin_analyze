import { randomBytes } from "node:crypto"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { campaignDirectory } from "../records/reviewRecordPaths"
import { assertReviewRunPathContained, validateReviewRunSegment } from "../reviewRuns/reviewRunPaths"
import type {
  CampaignDashboard,
  CampaignDashboardChangeTypeTrend,
  CampaignDashboardOverview,
  CampaignDashboardRuleTrend,
  CampaignDashboardRun,
  CampaignDashboardWarning
} from "./campaignDashboardTypes"

const CSV_HEADERS = [
  "section",
  "campaign_id",
  "review_id",
  "rule_id",
  "change_type",
  "status",
  "next_action",
  "updated_at",
  "metric",
  "value",
  "accepted",
  "rejected",
  "needs_investigation",
  "deferred",
  "baseline_review_minutes",
  "bob_review_minutes",
  "human_triage_minutes",
  "estimated_minutes_saved",
  "message"
] as const

type CsvHeader = typeof CSV_HEADERS[number]
type CsvRow = Partial<Record<CsvHeader, string | number | boolean | null | undefined>>

export interface CampaignDashboardArtifactPaths {
  jsonPath: string
  markdownPath: string
  csvPath: string
}

export function renderCampaignDashboardMarkdown(dashboard: CampaignDashboard): string {
  const overview = dashboard.overview
  const lines = [
    "# IBM Bob Bazaar Campaign Dashboard",
    "",
    `- campaign_id: ${markdownCell(dashboard.campaign_id)}`,
    `- generated_at: ${markdownCell(dashboard.generated_at)}`,
    "",
    "## Overview",
    "",
    "| Metric | Value |",
    "|---|---:|",
    `| Review Runs | ${overview.review_runs_total} |`,
    `| Completed runs | ${overview.completed_runs} |`,
    `| In-progress runs | ${overview.in_progress_runs} |`,
    `| Failed or blocked runs | ${overview.failed_or_blocked_runs} |`,
    `| Records | ${overview.records_total} |`,
    `| Triage pending | ${overview.triage_pending} |`,
    `| Schema-valid records | ${overview.schema_valid_records} |`,
    `| Schema-invalid records | ${overview.schema_invalid_records} |`,
    `| Schema validation rate | ${formatRate(overview.schema_validation_rate)} |`,
    `| Findings total | ${overview.findings_total} |`,
    `| Findings accepted | ${overview.findings_accepted} |`,
    `| Findings rejected | ${overview.findings_rejected} |`,
    `| Needs investigation | ${overview.findings_needs_investigation} |`,
    `| Deferred | ${overview.findings_deferred} |`,
    `| Finding acceptance rate | ${formatRate(overview.finding_acceptance_rate)} |`,
    `| Finding rejection rate | ${formatRate(overview.finding_rejection_rate)} |`,
    `| Finding resolution rate | ${formatRate(overview.finding_resolution_rate)} |`,
    "",
    "## Human Triage Pending",
    ""
  ]

  if (dashboard.triage_pending.length === 0) {
    lines.push("- none", "")
  } else {
    lines.push(
      "| Review ID | Status | Target mode | Next action | Updated |",
      "|---|---|---|---|---|",
      ...dashboard.triage_pending.map((run) => runMarkdownRow(run)),
      ""
    )
  }

  lines.push(
    "## Review Runs",
    "",
    "| Review ID | Status | Target mode | Triage | Schema valid | Next action | Metrics source | Updated |",
    "|---|---|---|---|---|---|---|---|",
    ...dashboard.runs.map((run) => [
      markdownCell(run.review_id),
      markdownCell(run.status),
      markdownCell(run.target_mode),
      markdownCell(run.triage_status),
      run.schema_valid === null ? "n/a" : String(run.schema_valid),
      markdownCell(run.next_action),
      markdownCell(run.metrics_source),
      markdownCell(run.updated_at)
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |")),
    "",
    "## Rule Trends",
    "",
    "| Rule ID | Title | Detected | Accepted | Rejected | Needs investigation | Deferred | Acceptance rate | Rejection rate |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ...dashboard.rule_trends.map((trend) => ruleMarkdownRow(trend)),
    "",
    "## Change Type Trends",
    "",
    "| Change type | Runs | Completed | Triage pending | Schema valid | Findings | Accepted | Rejected | Needs investigation | Deferred | Acceptance rate | Rejection rate |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...dashboard.change_type_trends.map((trend) => changeTypeMarkdownRow(trend)),
    "",
    "## Time",
    "",
    "| Metric | Minutes |",
    "|---|---:|",
    `| Baseline review | ${overview.baseline_review_minutes_total} |`,
    `| Bob review | ${overview.bob_review_minutes_total} |`,
    `| Human Triage | ${overview.human_triage_minutes_total} |`,
    `| Estimated saved | ${overview.estimated_minutes_saved} |`,
    "",
    "## Warnings",
    ""
  )

  if (dashboard.warnings.length === 0) {
    lines.push("- none")
  } else {
    lines.push(...dashboard.warnings.map((warning) => {
      const identity = warning.review_id ? ` [${markdownCell(warning.review_id)}]` : ""
      const artifact = warning.artifact ? ` (${markdownCell(warning.artifact)})` : ""
      return `- ${markdownCell(warning.code)}${identity}${artifact}: ${markdownCell(warning.message)}`
    }))
  }
  lines.push("")
  return lines.join("\n")
}

export function renderCampaignDashboardCsv(dashboard: CampaignDashboard): string {
  const rows: CsvRow[] = []
  for (const [metric, value] of Object.entries(dashboard.overview)) {
    rows.push({ section: "overview", campaign_id: dashboard.campaign_id, metric, value })
  }
  for (const run of dashboard.runs) rows.push(runCsvRow("run", dashboard.campaign_id, run))
  for (const run of dashboard.triage_pending) rows.push(runCsvRow("triage_pending", dashboard.campaign_id, run))
  for (const trend of dashboard.rule_trends) {
    rows.push({
      section: "rule_trend",
      campaign_id: dashboard.campaign_id,
      rule_id: trend.rule_id,
      metric: trend.title,
      value: trend.detected_count,
      accepted: trend.accepted,
      rejected: trend.rejected,
      needs_investigation: trend.needs_investigation,
      deferred: trend.deferred,
      message: rateMessage(trend.acceptance_rate, trend.rejection_rate)
    })
  }
  for (const trend of dashboard.change_type_trends) {
    rows.push({
      section: "change_type_trend",
      campaign_id: dashboard.campaign_id,
      change_type: trend.change_type,
      status: `${trend.completed_runs}/${trend.review_runs} completed`,
      metric: "findings_total",
      value: trend.findings_total,
      accepted: trend.accepted,
      rejected: trend.rejected,
      needs_investigation: trend.needs_investigation,
      deferred: trend.deferred,
      baseline_review_minutes: trend.baseline_review_minutes,
      bob_review_minutes: trend.bob_review_minutes,
      human_triage_minutes: trend.human_triage_minutes,
      estimated_minutes_saved: trend.estimated_minutes_saved,
      message: rateMessage(trend.acceptance_rate, trend.rejection_rate)
    })
  }
  for (const warning of dashboard.warnings) rows.push(warningCsvRow(dashboard.campaign_id, warning))

  const output = [CSV_HEADERS.join(",")]
  for (const row of rows) output.push(CSV_HEADERS.map((header) => csvCell(row[header])).join(","))
  return `${output.join("\r\n")}\r\n`
}

export async function writeCampaignDashboardArtifacts(
  workspaceRoot: string,
  campaignId: string,
  dashboard: CampaignDashboard
): Promise<CampaignDashboardArtifactPaths> {
  const safeCampaignId = validateReviewRunSegment(campaignId, "campaignId")
  if (dashboard.campaign_id !== safeCampaignId) {
    throw new Error(`Dashboard campaign_id ${dashboard.campaign_id} does not match ${safeCampaignId}`)
  }

  let jsonText: string
  try {
    jsonText = `${JSON.stringify(dashboard, null, 2)}\n`
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Could not serialize Campaign Dashboard JSON: ${message}`)
  }
  const markdownText = renderCampaignDashboardMarkdown(dashboard)
  const csvText = renderCampaignDashboardCsv(dashboard)

  const directory = campaignDirectory(path.resolve(workspaceRoot), safeCampaignId)
  await assertReviewRunPathContained(workspaceRoot, directory)
  await fs.mkdir(directory, { recursive: true })
  await assertReviewRunPathContained(workspaceRoot, directory)

  const paths: CampaignDashboardArtifactPaths = {
    jsonPath: path.join(directory, "dashboard.json"),
    markdownPath: path.join(directory, "dashboard.md"),
    csvPath: path.join(directory, "dashboard.csv")
  }
  const transactionId = `${process.pid}.${randomBytes(6).toString("hex")}`
  const entries = [
    { destination: paths.jsonPath, temporary: path.join(directory, `.dashboard.${transactionId}.json.tmp`), text: jsonText },
    { destination: paths.markdownPath, temporary: path.join(directory, `.dashboard.${transactionId}.md.tmp`), text: markdownText },
    { destination: paths.csvPath, temporary: path.join(directory, `.dashboard.${transactionId}.csv.tmp`), text: csvText }
  ]
  const backups = new Map<string, string>()
  const installed = new Set<string>()

  try {
    for (const entry of entries) {
      await assertReviewRunPathContained(workspaceRoot, entry.temporary)
      await assertDestinationIsReplaceable(entry.destination)
      await fs.writeFile(entry.temporary, entry.text, "utf8")
    }
    for (const entry of entries) {
      if (await exists(entry.destination)) {
        const backup = `${entry.destination}.replace.${transactionId}.bak`
        await fs.rename(entry.destination, backup)
        backups.set(entry.destination, backup)
      }
      await fs.rename(entry.temporary, entry.destination)
      installed.add(entry.destination)
    }
    // Backup cleanup happens after all three new exports are installed. A cleanup
    // failure must not enter rollback: doing so could delete a new export after
    // another backup was already removed, losing both the old and new file.
    for (const backup of backups.values()) {
      await fs.rm(backup, { force: true }).catch(() => undefined)
    }
    return paths
  } catch (error) {
    for (const destination of installed) await fs.rm(destination, { force: true }).catch(() => undefined)
    const rollbackFailures: string[] = []
    for (const [destination, backup] of backups) {
      if (!await exists(backup)) continue
      try {
        await fs.rename(backup, destination)
      } catch (restoreError) {
        rollbackFailures.push(`${destination}: ${errorMessage(restoreError)}; backup retained at ${backup}`)
      }
    }
    if (rollbackFailures.length > 0) {
      throw new Error(`Campaign Dashboard export failed: ${errorMessage(error)}; rollback could not restore ${rollbackFailures.join("; ")}`)
    }
    throw error
  } finally {
    await Promise.all(entries.map((entry) => fs.rm(entry.temporary, { force: true }).catch(() => undefined)))
  }
}

function runMarkdownRow(run: CampaignDashboardRun): string {
  return `| ${markdownCell(run.review_id)} | ${markdownCell(run.status)} | ${markdownCell(run.target_mode)} | ${markdownCell(run.next_action)} | ${markdownCell(run.updated_at)} |`
}

function ruleMarkdownRow(trend: CampaignDashboardRuleTrend): string {
  return [
    markdownCell(trend.rule_id),
    markdownCell(trend.title ?? ""),
    trend.detected_count,
    trend.accepted,
    trend.rejected,
    trend.needs_investigation,
    trend.deferred,
    formatRate(trend.acceptance_rate),
    formatRate(trend.rejection_rate)
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
}

function changeTypeMarkdownRow(trend: CampaignDashboardChangeTypeTrend): string {
  return [
    markdownCell(trend.change_type),
    trend.review_runs,
    trend.completed_runs,
    trend.triage_pending,
    trend.schema_valid_records,
    trend.findings_total,
    trend.accepted,
    trend.rejected,
    trend.needs_investigation,
    trend.deferred,
    formatRate(trend.acceptance_rate),
    formatRate(trend.rejection_rate)
  ].join(" | ").replace(/^/, "| ").replace(/$/, " |")
}

function runCsvRow(section: "run" | "triage_pending", campaignId: string, run: CampaignDashboardRun): CsvRow {
  return {
    section,
    campaign_id: campaignId,
    review_id: run.review_id,
    change_type: run.target_mode,
    status: run.status,
    next_action: run.next_action,
    updated_at: run.updated_at,
    metric: run.metrics_source,
    value: run.schema_valid,
    baseline_review_minutes: run.baseline_review_minutes,
    bob_review_minutes: run.bob_review_minutes,
    human_triage_minutes: run.human_triage_minutes,
    estimated_minutes_saved: run.estimated_minutes_saved,
    message: `triage=${run.triage_status}; issues=${run.issue_count}`
  }
}

function warningCsvRow(campaignId: string, warning: CampaignDashboardWarning): CsvRow {
  return {
    section: "warning",
    campaign_id: campaignId,
    review_id: warning.review_id,
    metric: warning.code,
    value: warning.artifact,
    message: warning.message
  }
}

function rateMessage(acceptance: number | null, rejection: number | null): string {
  return `acceptance_rate=${formatRate(acceptance)}; rejection_rate=${formatRate(rejection)}`
}

function formatRate(value: number | null): string {
  return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`
}

function markdownCell(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, "<br>")
}

function csvCell(value: unknown): string {
  if (value === undefined || value === null) return ""
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

async function assertDestinationIsReplaceable(filePath: string): Promise<void> {
  try {
    const stats = await fs.lstat(filePath)
    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(`Dashboard export destination must be a regular file: ${filePath}`)
    }
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return
    throw error
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}


function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
