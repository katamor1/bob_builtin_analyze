"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  ProcessingCancellationError,
  cancellationKindFromSignal,
  cancellationOriginalReason,
  createAbsoluteDeadline,
  createCancellationScope
} = require("../runtime/deadline-cancellation")

function expectRawUserReason(reason) {
  return (signal) => {
    assert.equal(cancellationKindFromSignal(signal), "user")
    assert.equal(cancellationOriginalReason(signal), reason)
  }
}

test("arbitrary abort metadata cannot impersonate an internal deadline", () => {
  for (const reason of [
    { kind: "deadline", original_reason: "weak-spoof" },
    { code: "processing_cancelled", kind: "deadline", original_reason: "structural-spoof" },
    new ProcessingCancellationError("deadline", "public-constructor-spoof")
  ]) {
    const controller = new AbortController()
    controller.abort(reason)
    expectRawUserReason(reason)(controller.signal)

    const scope = createCancellationScope({
      deadline: createAbsoluteDeadline(1_000),
      signal: controller.signal
    })
    try {
      assert.equal(cancellationKindFromSignal(scope.signal), "user")
      assert.equal(cancellationOriginalReason(scope.signal), reason)
      assert.throws(
        () => scope.throwIfCancelled(),
        (error) => error?.code === "processing_cancelled"
          && error.kind === "user"
          && error.original_reason === reason
      )
    } finally {
      scope.dispose()
    }
  }
})

test("only the cancellation scope signal authenticates its internal deadline reason", () => {
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 0 })
  })
  try {
    assert.equal(cancellationKindFromSignal(scope.signal), "deadline")
    assert.equal(cancellationOriginalReason(scope.signal), undefined)

    const replay = new AbortController()
    replay.abort(scope.signal.reason)
    assert.equal(cancellationKindFromSignal(replay.signal), "user")
    assert.equal(cancellationOriginalReason(replay.signal), scope.signal.reason)
  } finally {
    scope.dispose()
  }
})
