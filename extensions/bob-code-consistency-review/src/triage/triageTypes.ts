export type TriageSourceType = "finding" | "question"

export type TriageDecisionValue =
  | "accepted"
  | "rejected"
  | "needs_investigation"
  | "deferred"
  | "question"

export interface TriageSourceItem extends Record<string, unknown> {
  source_id: string
  source_type: TriageSourceType
}

export interface TriageSourceV1 {
  schema_version: "triage-source/v1"
  review_id: string
  package_id?: string
  bob_output_sha256: string
  generated_at: string
  items: TriageSourceItem[]
}

export interface TriageFollowUp extends Record<string, unknown> {
  required?: boolean
  action?: string
  due?: string
}

export interface TriageDecisionRecord extends Record<string, unknown> {
  decision?: TriageDecisionValue
  final_severity?: string
  owner?: string
  reason?: string
  review_comment?: string
  suggested_recipient?: string
  follow_up?: TriageFollowUp
}

export interface TriageDecisionsV1 {
  schema_version: "triage-decisions/v1"
  review_id: string
  source_sha256: string
  decision_revision: number
  updated_at: string
  triaged_by?: string
  triaged_at?: string
  items: Record<string, TriageDecisionRecord>
}

export interface TriageEvidenceView {
  evidence_id?: string
  type?: string
  ref?: string
}

export interface HumanTriageViewItem {
  source_id: string
  source_type: TriageSourceType
  category?: string
  severity?: string
  confidence?: string
  summary?: string
  source_reason?: string
  impact?: string
  recommended_action?: string
  human_check?: string
  suggested_owner?: string
  suggested_action?: string
  evidence: TriageEvidenceView[]
  decision?: TriageDecisionValue
  final_severity?: string
  owner?: string
  reason?: string
  review_comment?: string
  suggested_recipient?: string
  follow_up?: TriageFollowUp
}

export interface HumanTriageWorkspaceState {
  outDir: string
  sourcePath: string
  decisionsPath: string
  reviewId: string
  sourceSha256: string
  decisionRevision: number
  items: HumanTriageViewItem[]
  issues: string[]
}

export type HumanTriageResult =
  | {
      status: "ok"
      outDir: string
      itemCount: number
      bobOutputPath: string
      sourcePath: string
      decisionsPath: string
      sourceSha256: string
      decisionRevision: number
      warnings: string[]
    }
  | {
      status: "error"
      outDir: string
      itemCount: 0
      message: string
      errors: string[]
    }

export interface TriageProjectionSet {
  items: HumanTriageViewItem[]
  files: Record<string, string>
}
