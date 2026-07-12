const assert = require("node:assert/strict")
const { test } = require("node:test")

const {
  completeBobReviewTimer,
  completeHumanTriageTimer,
  correctReviewRunMetrics,
  defaultReviewRunMetrics,
  reviewRunMetricsToRecordMetrics,
  startBobReviewTimer,
  startHumanTriageTimer
} = require("../out/reviewRuns/reviewRunMetrics")

test("Review Run metrics accumulate automatic Bob and Human Triage durations", () => {
  let metrics = startBobReviewTimer(defaultReviewRunMetrics(), "2026-07-12T00:00:00.000Z")
  metrics = completeBobReviewTimer(metrics, "2026-07-12T00:02:30.000Z")
  metrics = startHumanTriageTimer(metrics, "2026-07-12T00:03:00.000Z")
  metrics = completeHumanTriageTimer(metrics, "2026-07-12T00:04:12.000Z")

  assert.equal(metrics.bobReviewSeconds, 150)
  assert.equal(metrics.humanTriageSeconds, 72)
  assert.equal(metrics.bobReviewStartedAt, undefined)
  assert.equal(metrics.humanTriageStartedAt, undefined)
  assert.equal(metrics.timingSource, "auto_wall_clock")
  assert.equal(metrics.correctedByUser, false)
})

test("Review Run metrics convert seconds to one-decimal record minutes", () => {
  const recordMetrics = reviewRunMetricsToRecordMetrics(
    {
      baselineReviewMinutes: 15,
      bobReviewSeconds: 150,
      humanTriageSeconds: 72,
      timingSource: "auto_wall_clock",
      correctedByUser: false
    },
    { accepted: 1, rejected: 1, needs_investigation: 0, deferred: 1 },
    3
  )

  assert.deepEqual(recordMetrics, {
    baseline_review_minutes: 15,
    bob_review_minutes: 2.5,
    human_triage_minutes: 1.2,
    findings_total: 3,
    findings_accepted: 1,
    findings_rejected: 1,
    findings_needs_investigation: 0,
    findings_deferred: 1
  })
})

test("Review Run metric correction records user ownership and preserves omitted values", () => {
  const corrected = correctReviewRunMetrics(
    {
      baselineReviewMinutes: 20,
      bobReviewSeconds: 120,
      humanTriageSeconds: 60,
      timingSource: "auto_wall_clock",
      correctedByUser: false
    },
    { baselineReviewMinutes: 30, humanTriageMinutes: 2.5 }
  )

  assert.equal(corrected.baselineReviewMinutes, 30)
  assert.equal(corrected.bobReviewSeconds, 120)
  assert.equal(corrected.humanTriageSeconds, 150)
  assert.equal(corrected.timingSource, "user_corrected")
  assert.equal(corrected.correctedByUser, true)
})

test("Review Run metrics reject invalid and excessive durations", () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY, 30 * 24 * 60 + 0.1]) {
    assert.throws(
      () => correctReviewRunMetrics(defaultReviewRunMetrics(), { bobReviewMinutes: value }),
      /bobReviewMinutes/
    )
  }

  const started = startBobReviewTimer(defaultReviewRunMetrics(), "2026-07-12T00:00:00.000Z")
  assert.throws(
    () => completeBobReviewTimer(started, "2026-08-12T00:00:00.001Z"),
    /30 days/
  )
  assert.throws(
    () => completeHumanTriageTimer(defaultReviewRunMetrics(), "2026-07-12T00:00:01.000Z"),
    /has not started/
  )
})
