import YAML from "yaml"
import type {
  HumanTriageViewItem,
  TriageDecisionRecord,
  TriageDecisionsV1,
  TriageEvidenceView,
  TriageProjectionSet,
  TriageSourceItem,
  TriageSourceV1
} from "./triageTypes"

export function buildTriageProjections(source: TriageSourceV1, decisions: TriageDecisionsV1): TriageProjectionSet {
  if (source.review_id !== decisions.review_id) {
    throw new Error(`Triage review_id mismatch: source=${source.review_id}, decisions=${decisions.review_id}`)
  }
  const items = source.items.map((item) => toViewItem(item, decisions.items[item.source_id]))
  const accepted = items.filter((item) => item.source_type === "finding" && item.decision === "accepted")
  const rejected = items.filter((item) => item.source_type === "finding" && item.decision === "rejected")
  const investigation = items.filter((item) => item.decision === "needs_investigation" || item.decision === "deferred")
  const questions = items.filter((item) => item.source_type === "question" || item.decision === "question")
  const followUps = items.filter((item) => item.follow_up?.required === true)
  return {
    items,
    files: {
      "triage-result.yaml": renderCompatibilityYaml(source, decisions, items),
      "accepted-findings.md": renderDecisionItems("採用したプレレビュー指摘", accepted),
      "rejected-findings.md": renderDecisionItems("棄却したプレレビュー指摘", rejected),
      "investigation-items.md": renderDecisionItems("追加調査・保留項目", investigation),
      "questions-to-author.md": renderQuestionItems(questions),
      "follow-up-actions.md": renderFollowUps(followUps)
    }
  }
}

function toViewItem(sourceItem: TriageSourceItem, decision?: TriageDecisionRecord): HumanTriageViewItem {
  const evidence = evidenceViews(sourceItem.evidence)
  const followUp = decision?.follow_up && typeof decision.follow_up === "object"
    ? cloneValue(decision.follow_up) as HumanTriageViewItem["follow_up"]
    : undefined
  return {
    source_id: sourceItem.source_id,
    source_type: sourceItem.source_type,
    category: optionalText(sourceItem.category),
    severity: optionalText(sourceItem.severity),
    confidence: optionalText(sourceItem.confidence),
    summary: optionalText(sourceItem.summary),
    source_reason: optionalText(sourceItem.reason),
    impact: optionalText(sourceItem.impact),
    recommended_action: optionalText(sourceItem.recommended_action),
    human_check: optionalText(sourceItem.human_check),
    suggested_owner: optionalText(sourceItem.suggested_owner),
    suggested_action: optionalText(sourceItem.suggested_action),
    evidence,
    decision: decision?.decision,
    final_severity: optionalText(decision?.final_severity),
    owner: optionalText(decision?.owner),
    reason: optionalText(decision?.reason),
    review_comment: optionalText(decision?.review_comment),
    suggested_recipient: optionalText(decision?.suggested_recipient),
    ...(followUp ? { follow_up: followUp } : {})
  }
}

function renderCompatibilityYaml(
  source: TriageSourceV1,
  decisions: TriageDecisionsV1,
  items: HumanTriageViewItem[]
): string {
  return YAML.stringify({
    schema_version: 1,
    review_id: source.review_id,
    triaged_by: decisions.triaged_by ?? "",
    triaged_at: decisions.triaged_at ?? "",
    decision_revision: decisions.decision_revision,
    source_sha256: decisions.source_sha256,
    items: items.map((item) => ({
      source_id: item.source_id,
      source_type: item.source_type,
      decision: item.decision ?? "",
      final_severity: item.final_severity ?? "",
      owner: item.owner ?? "",
      reason: item.reason ?? "",
      review_comment: item.review_comment ?? "",
      question: item.source_type === "question" ? item.summary ?? "" : "",
      follow_up: {
        required: item.follow_up?.required === true,
        action: item.follow_up?.action ?? "",
        due: item.follow_up?.due ?? ""
      }
    }))
  })
}

function renderDecisionItems(title: string, items: HumanTriageViewItem[]): string {
  const lines = [`# ${title}`, ""]
  if (items.length === 0) return `${lines.join("\n")}\n対象項目はありません。\n`
  for (const item of items) {
    lines.push(`## ${item.source_id}`, "", item.summary ?? "", "")
    pushMetadata(lines, item)
    if (item.source_reason) lines.push("### Bob reason", "", item.source_reason, "")
    if (item.impact) lines.push("### Impact", "", item.impact, "")
    if (item.recommended_action) lines.push(`- recommended_action: ${item.recommended_action}`)
    if (item.human_check) lines.push(`- human_check: ${item.human_check}`)
    if (item.reason) lines.push(`- human_reason: ${item.reason}`)
    if (item.review_comment) lines.push(`- review_comment: ${item.review_comment}`)
    if (item.follow_up?.required) {
      lines.push(`- follow_up_action: ${item.follow_up.action ?? ""}`)
      if (item.follow_up.due) lines.push(`- follow_up_due: ${item.follow_up.due}`)
    }
    lines.push("")
    pushEvidence(lines, item.evidence)
  }
  return `${lines.join("\n")}\n`
}

function renderQuestionItems(items: HumanTriageViewItem[]): string {
  const lines = ["# 作成者・担当者への確認事項", ""]
  if (items.length === 0) return `${lines.join("\n")}\n対象項目はありません。\n`
  for (const item of items) {
    lines.push(`## ${item.source_id}`, "", item.summary ?? "", "")
    pushMetadata(lines, item)
    if (item.source_reason) lines.push(`- Bob reason: ${item.source_reason}`)
    if (item.suggested_owner) lines.push(`- suggested_owner: ${item.suggested_owner}`)
    if (item.suggested_action) lines.push(`- suggested_action: ${item.suggested_action}`)
    if (item.reason) lines.push(`- human_reason: ${item.reason}`)
    if (item.suggested_recipient) lines.push(`- suggested_recipient: ${item.suggested_recipient}`)
    lines.push("")
    pushEvidence(lines, item.evidence)
  }
  return `${lines.join("\n")}\n`
}

function renderFollowUps(items: HumanTriageViewItem[]): string {
  const lines = ["# 後続対応", ""]
  if (items.length === 0) return `${lines.join("\n")}\n対象項目はありません。\n`
  for (const item of items) {
    lines.push(`## ${item.source_id}`, "")
    if (item.summary) lines.push(item.summary, "")
    if (item.owner) lines.push(`- owner: ${item.owner}`)
    lines.push(`- action: ${item.follow_up?.action ?? ""}`)
    if (item.follow_up?.due) lines.push(`- due: ${item.follow_up.due}`)
    if (item.reason) lines.push(`- reason: ${item.reason}`)
    lines.push("")
  }
  return `${lines.join("\n")}\n`
}

function pushMetadata(lines: string[], item: HumanTriageViewItem): void {
  if (item.category) lines.push(`- category: ${item.category}`)
  if (item.severity) lines.push(`- original_severity: ${item.severity}`)
  if (item.confidence) lines.push(`- confidence: ${item.confidence}`)
  if (item.decision) lines.push(`- decision: ${item.decision}`)
  if (item.final_severity) lines.push(`- final_severity: ${item.final_severity}`)
  if (item.owner) lines.push(`- owner: ${item.owner}`)
  if (lines[lines.length - 1] !== "") lines.push("")
}

function pushEvidence(lines: string[], evidence: TriageEvidenceView[]): void {
  if (evidence.length === 0) return
  lines.push("### Evidence", "")
  for (const item of evidence) {
    lines.push(`- ${item.evidence_id ?? "(no id)"} ${item.type ?? ""} ${item.ref ?? ""}`.trimEnd())
  }
  lines.push("")
}

function evidenceViews(value: unknown): TriageEvidenceView[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      evidence_id: optionalText(item.evidence_id),
      type: optionalText(item.type),
      ref: optionalText(item.ref)
    }))
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}
