import type { ReviewRecord, ReviewTriage, TriageDecision } from "../records/reviewRecordTypes"
import type { ReviewRunResumeAction } from "../reviewRuns/reviewRunResume"
import type {
  ReviewRunArtifacts,
  ReviewRunContext,
  ReviewRunPhaseStatus,
  ReviewRunStatus,
  ReviewRunTargetMode,
  ReviewRunTrackedPhase
} from "../reviewRuns/reviewRunTypes"

export const CAMPAIGN_DASHBOARD_SCHEMA_VERSION = "bazaar-campaign-dashboard/v1" as const

export type CampaignDashboardRate = number | null
export type CampaignDashboardMetricsSource = "record" | "review_run"

export interface CampaignDashboardWarning {
  code: string
  message: string
  review_id?: string
  artifact?: string
}

export interface CampaignDashboardRun {
  review_id: string
  status: ReviewRunStatus
  target_mode: ReviewRunTargetMode
  next_action: ReviewRunResumeAction
  updated_at: string
  triage_status: ReviewRunPhaseStatus
  schema_valid: boolean | null
  issue_count: number
  metrics_source: CampaignDashboardMetricsSource
  baseline_review_minutes: number | null
  bob_review_minutes: number
  human_triage_minutes: number
  estimated_minutes_saved: number | null
  phases: Record<ReviewRunTrackedPhase, ReviewRunPhaseStatus>
  artifacts: ReviewRunArtifacts
}

export interface CampaignDashboardRuleTrend {
  rule_id: string
  title?: string
  detected_count: number
  accepted: number
  rejected: number
  needs_investigation: number
  deferred: number
  acceptance_rate: CampaignDashboardRate
  rejection_rate: CampaignDashboardRate
}

export interface CampaignDashboardChangeTypeTrend {
  change_type: ReviewRunTargetMode
  review_runs: number
  completed_runs: number
  triage_pending: number
  schema_valid_records: number
  findings_total: number
  accepted: number
  rejected: number
  needs_investigation: number
  deferred: number
  acceptance_rate: CampaignDashboardRate
  rejection_rate: CampaignDashboardRate
  baseline_review_minutes: number
  bob_review_minutes: number
  human_triage_minutes: number
  estimated_minutes_saved: number
}

export interface CampaignDashboardOverview {
  review_runs_total: number
  completed_runs: number
  in_progress_runs: number
  failed_or_blocked_runs: number
  records_total: number
  triage_pending: number
  schema_valid_records: number
  schema_invalid_records: number
  schema_validation_rate: CampaignDashboardRate
  findings_total: number
  findings_accepted: number
  findings_rejected: number
  findings_needs_investigation: number
  findings_deferred: number
  finding_acceptance_rate: CampaignDashboardRate
  finding_rejection_rate: CampaignDashboardRate
  finding_resolution_rate: CampaignDashboardRate
  baseline_review_minutes_total: number
  bob_review_minutes_total: number
  human_triage_minutes_total: number
  estimated_minutes_saved: number
}

export interface CampaignDashboard {
  schema_version: typeof CAMPAIGN_DASHBOARD_SCHEMA_VERSION
  campaign_id: string
  generated_at: string
  overview: CampaignDashboardOverview
  runs: CampaignDashboardRun[]
  triage_pending: CampaignDashboardRun[]
  rule_trends: CampaignDashboardRuleTrend[]
  change_type_trends: CampaignDashboardChangeTypeTrend[]
  warnings: CampaignDashboardWarning[]
}

export interface CampaignDashboardEvidence {
  run: ReviewRunContext
  record?: ReviewRecord
  recordPresent: boolean
  triage?: ReviewTriage
  triageValid: boolean
  ruleTitles: Record<string, string>
  warnings: CampaignDashboardWarning[]
}

export interface CampaignDashboardBuildInput {
  campaignId: string
  generatedAt: string
  evidence: CampaignDashboardEvidence[]
  warnings: CampaignDashboardWarning[]
}

export type CampaignDashboardDecisionCounts = Record<TriageDecision, number>
