"use strict"

const assert = require("node:assert/strict")
const test = require("node:test")

const {
  cancellationKindFromSignal,
  constrainAbsoluteDeadline,
  createAbsoluteDeadline,
  createCancellationScope,
  remainingDeadlineMilliseconds
} = require("../out")

test("nested deadline constraints never refresh the parent timeout", () => {
  const parent = createAbsoluteDeadline(100, 1_000)
  const laterLayer = constrainAbsoluteDeadline(parent, 100, 1_080)
  const shorterLayer = constrainAbsoluteDeadline(parent, 10, 1_080)

  assert.equal(parent.expires_at_monotonic_ms, 1_100)
  assert.equal(laterLayer.expires_at_monotonic_ms, 1_100)
  assert.equal(remainingDeadlineMilliseconds(laterLayer, 1_080), 20)
  assert.equal(shorterLayer.expires_at_monotonic_ms, 1_090)
})

test("pre-expired deadline aborts before work starts", () => {
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 99 }),
    now: () => 100
  })
  try {
    assert.equal(scope.signal.aborted, true)
    assert.equal(cancellationKindFromSignal(scope.signal), "deadline")
    assert.throws(() => scope.throwIfCancelled(), (error) =>
      error?.code === "processing_cancelled" && error.kind === "deadline")
  } finally {
    scope.dispose()
  }
})

test("an already requested user cancellation wins over an expired deadline", () => {
  const controller = new AbortController()
  const reason = new Error("operator cancelled")
  controller.abort(reason)
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 99 }),
    signal: controller.signal,
    now: () => 100
  })
  try {
    assert.equal(cancellationKindFromSignal(scope.signal), "user")
    assert.equal(scope.signal.reason.original_reason, reason)
  } finally {
    scope.dispose()
  }
})

test("the first observed cancellation cause remains authoritative", () => {
  let scheduled
  const controller = new AbortController()
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 200 }),
    signal: controller.signal,
    now: () => 100,
    schedule: (callback, delay) => {
      assert.equal(delay, 100)
      scheduled = callback
      return 1
    },
    cancelSchedule: () => {}
  })
  try {
    const reason = new Error("user first")
    controller.abort(reason)
    scheduled()
    assert.equal(cancellationKindFromSignal(scope.signal), "user")
    assert.equal(scope.signal.reason.original_reason, reason)
  } finally {
    scope.dispose()
  }
})

test("deadline cause remains authoritative when its timer fires first", () => {
  let scheduled
  const controller = new AbortController()
  const scope = createCancellationScope({
    deadline: Object.freeze({ expires_at_monotonic_ms: 200 }),
    signal: controller.signal,
    now: () => 100,
    schedule: (callback) => {
      scheduled = callback
      return 1
    },
    cancelSchedule: () => {}
  })
  try {
    scheduled()
    controller.abort(new Error("too late"))
    assert.equal(cancellationKindFromSignal(scope.signal), "deadline")
  } finally {
    scope.dispose()
  }
})

test("source cancellation cannot slip between preflight and listener registration", () => {
  let reads = 0
  const signal = {
    get aborted() {
      reads += 1
      return reads >= 2
    },
    reason: new Error("raced cancellation"),
    addEventListener() {},
    removeEventListener() {}
  }
  const scope = createCancellationScope({
    deadline: createAbsoluteDeadline(1000),
    signal
  })
  try {
    assert.equal(scope.signal.aborted, true)
    assert.equal(cancellationKindFromSignal(scope.signal), "user")
    assert.ok(reads >= 2)
  } finally {
    scope.dispose()
  }
})
