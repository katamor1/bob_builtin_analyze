"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  MAX_TIMER_DELAY_MS,
  cancellationKindFromSignal,
  createCancellationScope
} = require("../out")

test("deadlines beyond the platform timer maximum reschedule without expiring early", () => {
  let now = 0
  const scheduled = []
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: MAX_TIMER_DELAY_MS + 100 }),
    now: () => now,
    schedule: (callback, delay) => {
      scheduled.push({ callback, delay })
      return scheduled.length
    },
    cancelSchedule: () => {}
  })
  try {
    assert.equal(scheduled.length, 1)
    assert.equal(scheduled[0].delay, MAX_TIMER_DELAY_MS)

    now = MAX_TIMER_DELAY_MS
    scheduled[0].callback()
    assert.equal(scope.signal.aborted, false)
    assert.equal(scheduled.length, 2)
    assert.equal(scheduled[1].delay, 100)

    now += 100
    scheduled[1].callback()
    assert.equal(scope.signal.aborted, true)
    assert.equal(cancellationKindFromSignal(scope.signal), "deadline")
  } finally {
    scope.dispose()
  }
})
