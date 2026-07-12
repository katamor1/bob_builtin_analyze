import YAML from "yaml"
import type {
  TriageDecisionRecord,
  TriageDecisionsV1,
  TriageDecisionValue,
  TriageFollowUp,
  TriageSourceV1
} from "./triageTypes"

const DECISION_VALUES = new Set<TriageDecisionValue>([
  "accepted",
  "rejected",
  "needs_investigation",
  "deferred",
  "question"
])

const SEVERITY_VALUES = new Set(["critical", "high", "medium", "low", "info"])

export function createEmptyTriageDecisions(input: {
  reviewId: string
  sourceSha256: string
  updatedAt: string
}): TriageDecisionsV1 {
  return {
    schema_version: "triage-decisions/v1",
    review_id: requiredString(input.reviewId, "reviewId"),
    source_sha256: requiredString(input.sourceSha256, "sourceSha256"),
    decision_revision: 0,
    updated_at: requiredString(input.updatedAt, "updatedAt"),
    items: {}
  }
}

export function serializeTriageDecisions(decisions: TriageDecisionsV1): string {
  return YAML.stringify(decisions)
}

export function parseTriageDecisions(text: string): TriageDecisionsV1 {
  const parsed = objectRecord(YAML.parse(text), "triage decisions")
  if (parsed.schema_version !== "triage-decisions/v1") {
    throw new Error(`Unsupported triage decisions schema: ${String(parsed.schema_version ?? "missing")}`)
  }
  if (!Number.isInteger(parsed.decision_revision) || Number(parsed.decision_revision) < 0) {
    throw new Error("triage decisions decision_revision must be a non-negative integer")
  }
  const itemsRecord = objectRecord(parsed.items, "triage decisions items")
  const items: Record<string, TriageDecisionRecord> = {}
  for (const [sourceId, value] of Object.entries(itemsRecord)) {
    if (!sourceId.trim()) throw new Error("triage decisions contains an empty source_id")
    items[sourceId] = normalizeStoredDecision(value, sourceId)
  }
  const triagedBy = optionalString(parsed.triaged_by, "triage decisions triaged_by")
  const triagedAt = optionalString(parsed.triaged_at, "triage decisions triaged_at")
  return {
    schema_version: "triage-decisions/v1",
    review_id: requiredString(parsed.review_id, "triage decisions review_id"),
    source_sha256: requiredString(parsed.source_sha256, "triage decisions source_sha256"),
    decision_revision: Number(parsed.decision_revision),
    updated_at: requiredString(parsed.updated_at, "triage decisions updated_at"),
    ...(triagedBy ? { triaged_by: triagedBy } : {}),
    ...(triagedAt ? { triaged_at: triagedAt } : {}),
    items
  }
}

export function mergeTriageDecisionPatches(input: {
  source: TriageSourceV1
  current: TriageDecisionsV1
  currentSourceSha256: string
  expectedSourceSha256: string
  expectedDecisionRevision: number
  patches: unknown[]
  updatedAt: string
}): TriageDecisionsV1 {
  if (input.expectedSourceSha256 !== input.currentSourceSha256 || input.current.source_sha256 !== input.currentSourceSha256) {
    throw new Error("TRIAGE_SOURCE_CHANGED: triage source changed; reload before saving")
  }
  if (input.expectedDecisionRevision !== input.current.decision_revision) {
    throw new Error(
      `TRIAGE_REVISION_CONFLICT: expected revision ${input.expectedDecisionRevision}, current revision ${input.current.decision_revision}`
    )
  }
  if (input.current.review_id !== input.source.review_id) {
    throw new Error(`TRIAGE_SOURCE_CHANGED: review_id changed from ${input.current.review_id} to ${input.source.review_id}`)
  }
  if (!Array.isArray(input.patches)) throw new Error("triage decision patches must be an array")

  const sourceIds = new Set(input.source.items.map((item) => item.source_id))
  const next = cloneDecisions(input.current)
  const postedIds = new Set<string>()
  for (const rawPatch of input.patches) {
    const patch = objectRecord(rawPatch, "triage decision patch")
    const sourceId = requiredString(patch.source_id, "triage decision patch source_id")
    if (postedIds.has(sourceId)) throw new Error(`TRIAGE_DECISION_INVALID ${sourceId}: duplicate source_id in save payload`)
    postedIds.add(sourceId)
    if (!sourceIds.has(sourceId)) throw new Error(`TRIAGE_DECISION_INVALID ${sourceId}: unknown source_id`)
    const existing = next.items[sourceId] ?? {}
    const merged = applyKnownPatch(existing, patch, sourceId)
    if (hasDecisionContent(merged)) next.items[sourceId] = merged
    else delete next.items[sourceId]
  }

  for (const [sourceId, decision] of Object.entries(next.items)) {
    if (!sourceIds.has(sourceId)) delete next.items[sourceId]
    else validateDecisionRecord(sourceId, decision)
  }

  next.source_sha256 = input.currentSourceSha256
  next.decision_revision = input.current.decision_revision + 1
  next.updated_at = requiredString(input.updatedAt, "updatedAt")
  next.triaged_at = next.updated_at
  return next
}

export function rebaseTriageDecisions(input: {
  source: TriageSourceV1
  current: TriageDecisionsV1
  sourceSha256: string
  updatedAt: string
}): { decisions: TriageDecisionsV1; droppedSourceIds: string[] } {
  if (input.current.review_id !== input.source.review_id) {
    return {
      decisions: createEmptyTriageDecisions({
        reviewId: input.source.review_id,
        sourceSha256: input.sourceSha256,
        updatedAt: input.updatedAt
      }),
      droppedSourceIds: Object.keys(input.current.items)
    }
  }
  const sourceIds = new Set(input.source.items.map((item) => item.source_id))
  const decisions = cloneDecisions(input.current)
  const droppedSourceIds: string[] = []
  for (const sourceId of Object.keys(decisions.items)) {
    if (sourceIds.has(sourceId)) continue
    droppedSourceIds.push(sourceId)
    delete decisions.items[sourceId]
  }
  decisions.source_sha256 = input.sourceSha256
  decisions.updated_at = input.updatedAt
  return { decisions, droppedSourceIds }
}

export function decisionRecordFromLegacy(value: unknown): TriageDecisionRecord {
  const record = objectRecord(value, "legacy triage item")
  const result: TriageDecisionRecord = {}
  copyOptionalKnownString(record, result, "decision")
  copyOptionalKnownString(record, result, "final_severity")
  copyOptionalKnownString(record, result, "owner")
  copyOptionalKnownString(record, result, "reason")
  copyOptionalKnownString(record, result, "review_comment")
  copyOptionalKnownString(record, result, "suggested_recipient")
  if (record.follow_up && typeof record.follow_up === "object" && !Array.isArray(record.follow_up)) {
    result.follow_up = cloneValue(record.follow_up) as TriageFollowUp
  }
  return result
}

export function validateDecisionRecord(sourceId: string, record: TriageDecisionRecord): void {
  const decision = record.decision
  if (!decision) return
  if (!DECISION_VALUES.has(decision)) throw invalid(sourceId, `unknown decision: ${String(decision)}`)
  if (record.final_severity && !SEVERITY_VALUES.has(record.final_severity)) {
    throw invalid(sourceId, `unknown final_severity: ${record.final_severity}`)
  }
  const reason = nonEmpty(record.reason)
  const owner = nonEmpty(record.owner)
  const suggestedRecipient = nonEmpty(record.suggested_recipient)
  const followUpAction = nonEmpty(record.follow_up?.action)
  const followUpDue = nonEmpty(record.follow_up?.due)

  if (decision === "accepted" && (!reason || !owner || !nonEmpty(record.final_severity))) {
    throw invalid(sourceId, "accepted requires reason, owner, and final_severity")
  }
  if (decision === "rejected" && !reason) throw invalid(sourceId, "rejected requires reason")
  if (decision === "needs_investigation" && (!reason || (!owner && !followUpAction))) {
    throw invalid(sourceId, "needs_investigation requires owner or follow_up action; reason is also required")
  }
  if (decision === "deferred" && (!reason || !followUpDue)) {
    throw invalid(sourceId, "deferred requires follow_up due; reason is also required")
  }
  if (decision === "question" && (!reason || (!owner && !suggestedRecipient))) {
    throw invalid(sourceId, "question requires owner or suggested_recipient; reason is also required")
  }
}

function applyKnownPatch(
  existing: TriageDecisionRecord,
  patch: Record<string, unknown>,
  sourceId: string
): TriageDecisionRecord {
  const next = cloneValue(existing) as TriageDecisionRecord
  applyStringField(next, patch, "decision")
  applyStringField(next, patch, "final_severity")
  applyStringField(next, patch, "owner")
  applyStringField(next, patch, "reason")
  applyStringField(next, patch, "review_comment")
  applyStringField(next, patch, "suggested_recipient")

  if (Object.prototype.hasOwnProperty.call(patch, "follow_up")) {
    if (patch.follow_up === undefined || patch.follow_up === null) {
      delete next.follow_up
    } else {
      const rawFollowUp = objectRecord(patch.follow_up, `triage decision patch ${sourceId} follow_up`)
      const followUp = next.follow_up && typeof next.follow_up === "object"
        ? cloneValue(next.follow_up) as TriageFollowUp
        : {}
      if (Object.prototype.hasOwnProperty.call(rawFollowUp, "required")) {
        if (typeof rawFollowUp.required !== "boolean") {
          throw invalid(sourceId, "follow_up.required must be boolean")
        }
        followUp.required = rawFollowUp.required
      }
      applyStringField(followUp, rawFollowUp, "action")
      applyStringField(followUp, rawFollowUp, "due")
      if (followUp.required === false && !nonEmpty(followUp.action) && !nonEmpty(followUp.due)) delete followUp.required
      if (Object.keys(followUp).length > 0) next.follow_up = followUp
      else delete next.follow_up
    }
  }

  if (next.decision && !DECISION_VALUES.has(next.decision)) throw invalid(sourceId, `unknown decision: ${String(next.decision)}`)
  if (next.final_severity && !SEVERITY_VALUES.has(next.final_severity)) {
    throw invalid(sourceId, `unknown final_severity: ${next.final_severity}`)
  }
  return next
}

function normalizeStoredDecision(value: unknown, sourceId: string): TriageDecisionRecord {
  const record = cloneValue(objectRecord(value, `triage decision ${sourceId}`)) as TriageDecisionRecord
  if (record.decision !== undefined && typeof record.decision !== "string") {
    throw new Error(`triage decision ${sourceId} decision must be a string`)
  }
  if (record.follow_up !== undefined) {
    record.follow_up = cloneValue(objectRecord(record.follow_up, `triage decision ${sourceId} follow_up`)) as TriageFollowUp
  }
  return record
}

function copyOptionalKnownString(
  source: Record<string, unknown>,
  target: TriageDecisionRecord,
  key: "decision" | "final_severity" | "owner" | "reason" | "review_comment" | "suggested_recipient"
): void {
  const value = optionalString(source[key], `legacy ${key}`)
  if (value) (target as Record<string, unknown>)[key] = value
}

function applyStringField(target: Record<string, unknown>, source: Record<string, unknown>, key: string): void {
  if (!Object.prototype.hasOwnProperty.call(source, key)) return
  const value = source[key]
  if (value === undefined || value === null || value === "") {
    delete target[key]
    return
  }
  if (typeof value !== "string") throw new Error(`${key} must be a string`)
  const trimmed = value.trim()
  if (trimmed) target[key] = trimmed
  else delete target[key]
}

function hasDecisionContent(record: TriageDecisionRecord): boolean {
  return Object.keys(record).length > 0
}

function invalid(sourceId: string, message: string): Error {
  return new Error(`TRIAGE_DECISION_INVALID ${sourceId}: ${message}`)
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value.trim()
}

function optionalString(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined
  if (typeof value !== "string") throw new Error(`${label} must be a string`)
  return value.trim() || undefined
}

function cloneDecisions(value: TriageDecisionsV1): TriageDecisionsV1 {
  return cloneValue(value) as TriageDecisionsV1
}

function cloneValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(cloneValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, cloneValue(item)]))
  }
  return value
}
