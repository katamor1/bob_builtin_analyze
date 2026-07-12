import type { ReviewRecord, TriageSummary } from "../records/reviewRecordTypes"
import type { ReviewRunMetrics } from "./reviewRunTypes"

const MAX_REVIEW_RUN_SECONDS = 30 * 24 * 60 * 60

export interface ReviewRunMetricCorrection {
  baselineReviewMinutes?: number
  bobReviewMinutes?: number
  humanTriageMinutes?: number
}

export function defaultReviewRunMetrics(): ReviewRunMetrics {
  return {
    bobReviewSeconds: 0,
    humanTriageSeconds: 0,
    timingSource: "auto_wall_clock",
    correctedByUser: false
  }
}

export function startBobReviewTimer(metrics: ReviewRunMetrics, now = new Date().toISOString()): ReviewRunMetrics {
  validateTimestamp(now, "bobReviewStartedAt")
  if (metrics.bobReviewStartedAt) return { ...metrics }
  return { ...metrics, bobReviewStartedAt: now }
}

export function completeBobReviewTimer(metrics: ReviewRunMetrics, now = new Date().toISOString()): ReviewRunMetrics {
  if (!metrics.bobReviewStartedAt) throw new Error("Bob review timer has not started")
  const elapsed = elapsedSeconds(metrics.bobReviewStartedAt, now, "Bob review")
  return {
    ...metrics,
    bobReviewSeconds: validateSeconds(metrics.bobReviewSeconds + elapsed, "bobReviewSeconds"),
    bobReviewStartedAt: undefined
  }
}

export function startHumanTriageTimer(metrics: ReviewRunMetrics, now = new Date().toISOString()): ReviewRunMetrics {
  validateTimestamp(now, "humanTriageStartedAt")
  if (metrics.humanTriageStartedAt) return { ...metrics }
  return { ...metrics, humanTriageStartedAt: now }
}

export function completeHumanTriageTimer(metrics: ReviewRunMetrics, now = new Date().toISOString()): ReviewRunMetrics {
  if (!metrics.humanTriageStartedAt) throw new Error("Human Triage timer has not started")
  const elapsed = elapsedSeconds(metrics.humanTriageStartedAt, now, "Human Triage")
  return {
    ...metrics,
    humanTriageSeconds: validateSeconds(metrics.humanTriageSeconds + elapsed, "humanTriageSeconds"),
    humanTriageStartedAt: undefined
  }
}

export function correctReviewRunMetrics(
  metrics: ReviewRunMetrics,
  correction: ReviewRunMetricCorrection
): ReviewRunMetrics {
  const next: ReviewRunMetrics = { ...metrics }
  let changed = false

  if (correction.baselineReviewMinutes !== undefined) {
    next.baselineReviewMinutes = validateMinutes(correction.baselineReviewMinutes, "baselineReviewMinutes")
    changed = true
  }
  if (correction.bobReviewMinutes !== undefined) {
    next.bobReviewSeconds = validateSeconds(
      validateMinutes(correction.bobReviewMinutes, "bobReviewMinutes") * 60,
      "bobReviewSeconds"
    )
    next.bobReviewStartedAt = undefined
    changed = true
  }
  if (correction.humanTriageMinutes !== undefined) {
    next.humanTriageSeconds = validateSeconds(
      validateMinutes(correction.humanTriageMinutes, "humanTriageMinutes") * 60,
      "humanTriageSeconds"
    )
    next.humanTriageStartedAt = undefined
    changed = true
  }

  return changed
    ? { ...next, timingSource: "user_corrected", correctedByUser: true }
    : next
}

export function reviewRunMetricsToRecordMetrics(
  metrics: ReviewRunMetrics,
  triageSummary: TriageSummary,
  findingsTotal: number
): NonNullable<ReviewRecord["metrics"]> {
  const baseline = metrics.baselineReviewMinutes
  return {
    ...(baseline === undefined ? {} : { baseline_review_minutes: roundOneDecimal(baseline) }),
    bob_review_minutes: secondsToMinutes(metrics.bobReviewSeconds),
    human_triage_minutes: secondsToMinutes(metrics.humanTriageSeconds),
    findings_total: validateCount(findingsTotal, "findingsTotal"),
    findings_accepted: validateCount(triageSummary.accepted, "triageSummary.accepted"),
    findings_rejected: validateCount(triageSummary.rejected, "triageSummary.rejected"),
    findings_needs_investigation: validateCount(triageSummary.needs_investigation, "triageSummary.needs_investigation"),
    findings_deferred: validateCount(triageSummary.deferred, "triageSummary.deferred")
  }
}

export function secondsToMinutes(seconds: number): number {
  return roundOneDecimal(validateSeconds(seconds, "seconds") / 60)
}

function elapsedSeconds(start: string, end: string, label: string): number {
  const startMs = validateTimestamp(start, `${label} start`)
  const endMs = validateTimestamp(end, `${label} end`)
  const elapsed = (endMs - startMs) / 1000
  if (elapsed < 0) throw new Error(`${label} end must not be before start`)
  if (elapsed > MAX_REVIEW_RUN_SECONDS) throw new Error(`${label} duration must not exceed 30 days`)
  return elapsed
}

function validateTimestamp(value: string, fieldName: string): number {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${fieldName} must be a valid timestamp`)
  return timestamp
}

function validateMinutes(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0 || value * 60 > MAX_REVIEW_RUN_SECONDS) {
    throw new Error(`${fieldName} must be a finite value between 0 and 43200 minutes`)
  }
  return value
}

function validateSeconds(value: number, fieldName: string): number {
  if (!Number.isFinite(value) || value < 0 || value > MAX_REVIEW_RUN_SECONDS) {
    throw new Error(`${fieldName} must be a finite value between 0 and ${MAX_REVIEW_RUN_SECONDS} seconds`)
  }
  return value
}

function validateCount(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${fieldName} must be a non-negative integer`)
  return value
}

function roundOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}
