"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")
const {
  cancellationKindFromSignal,
  createCancellationScope
} = require("../runtime/deadline-cancellation")

test("throwIfCancelled observes deadline expiry before the scheduled callback runs", () => {
  let now = 100
  let scheduled
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 200 }),
    now: () => now,
    schedule: (callback) => {
      scheduled = callback
      return 1
    },
    cancelSchedule: () => {}
  })
  try {
    assert.equal(scope.signal.aborted, false)
    now = 201
    assert.throws(
      () => scope.throwIfCancelled(),
      (error) => error?.code === "processing_cancelled" && error.kind === "deadline"
    )
    assert.equal(cancellationKindFromSignal(scope.signal), "deadline")
    assert.equal(typeof scheduled, "function")
  } finally {
    scope.dispose()
  }
})

test("throwIfCancelled preserves an already requested user cancellation when the deadline is also expired", () => {
  let now = 100
  let sourceAborted = false
  const reason = new Error("operator cancelled before the explicit check")
  const sourceSignal = {
    get aborted() { return sourceAborted },
    reason,
    addEventListener() {},
    removeEventListener() {}
  }
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 200 }),
    signal: sourceSignal,
    now: () => now,
    schedule: () => 1,
    cancelSchedule: () => {}
  })
  try {
    sourceAborted = true
    now = 201
    assert.throws(
      () => scope.throwIfCancelled(),
      (error) => error?.code === "processing_cancelled"
        && error.kind === "user"
        && error.original_reason === reason
    )
    assert.equal(cancellationKindFromSignal(scope.signal), "user")
  } finally {
    scope.dispose()
  }
})
