"use strict"

const { performance } = require("node:perf_hooks")

const MAX_TIMER_DELAY_MS = 0x7fffffff

class ProcessingCancellationError extends Error {
  constructor(kind, originalReason) {
    super(kind === "deadline" ? "processing deadline expired" : "processing was cancelled")
    this.name = "ProcessingCancellationError"
    this.code = "processing_cancelled"
    this.kind = kind
    this.original_reason = originalReason
  }
}

function monotonicNowMilliseconds() {
  return performance.now()
}

function createAbsoluteDeadline(timeoutMs, nowMs = monotonicNowMilliseconds()) {
  const timeout = positiveSafeInteger(timeoutMs, "timeoutMs")
  const now = finiteNonNegative(nowMs, "nowMs")
  if (now > Number.MAX_SAFE_INTEGER - timeout) throw new Error("absolute deadline exceeds safe integer range")
  return Object.freeze({ expires_at_monotonic_ms: now + timeout })
}

function constrainAbsoluteDeadline(parent, timeoutMs, nowMs = monotonicNowMilliseconds()) {
  const checkedParent = absoluteDeadline(parent)
  const candidate = createAbsoluteDeadline(timeoutMs, nowMs)
  return Object.freeze({
    expires_at_monotonic_ms: Math.min(
      checkedParent.expires_at_monotonic_ms,
      candidate.expires_at_monotonic_ms
    )
  })
}

function remainingDeadlineMilliseconds(deadline, nowMs = monotonicNowMilliseconds()) {
  const checked = absoluteDeadline(deadline)
  const now = finiteNonNegative(nowMs, "nowMs")
  return Math.max(0, Math.ceil(checked.expires_at_monotonic_ms - now))
}

function createCancellationScope(input) {
  if (typeof input !== "object" || input === null) throw new Error("cancellation scope input must be an object")
  const deadline = absoluteDeadline(input.deadline)
  const sourceSignal = input.signal
  if (sourceSignal !== undefined && (typeof sourceSignal !== "object" || sourceSignal === null)) {
    throw new Error("cancellation signal must be an object")
  }
  const now = typeof input.now === "function" ? input.now : monotonicNowMilliseconds
  const schedule = typeof input.schedule === "function" ? input.schedule : setTimeout
  const cancelSchedule = typeof input.cancelSchedule === "function" ? input.cancelSchedule : clearTimeout
  const controller = new AbortController()
  let timer
  let disposed = false

  const abort = (kind, originalReason) => {
    if (controller.signal.aborted) return
    controller.abort(Object.freeze({
      code: "processing_cancelled",
      kind,
      original_reason: originalReason
    }))
  }
  const onSourceAbort = () => abort("user", sourceSignal?.reason)

  // A cancellation already observed by the caller is authoritative even when
  // the deadline is also expired at scope construction time.
  if (sourceSignal?.aborted) {
    onSourceAbort()
  } else {
    const remaining = remainingDeadlineMilliseconds(deadline, now())
    if (remaining === 0) abort("deadline", undefined)
  }

  if (!controller.signal.aborted && sourceSignal && typeof sourceSignal.addEventListener === "function") {
    sourceSignal.addEventListener("abort", onSourceAbort, { once: true })
  }
  if (!controller.signal.aborted) {
    const remaining = remainingDeadlineMilliseconds(deadline, now())
    const delay = Math.min(remaining, MAX_TIMER_DELAY_MS)
    timer = schedule(() => abort("deadline", undefined), delay)
  }

  return Object.freeze({
    deadline,
    signal: controller.signal,
    remainingMilliseconds: () => remainingDeadlineMilliseconds(deadline, now()),
    throwIfCancelled: () => {
      if (!controller.signal.aborted) return
      const reason = controller.signal.reason
      throw new ProcessingCancellationError(
        reason && reason.kind === "deadline" ? "deadline" : "user",
        reason?.original_reason
      )
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      if (timer !== undefined) cancelSchedule(timer)
      if (sourceSignal && typeof sourceSignal.removeEventListener === "function") {
        sourceSignal.removeEventListener("abort", onSourceAbort)
      }
    }
  })
}

function cancellationKindFromSignal(signal) {
  if (!signal || signal.aborted !== true) return undefined
  return signal.reason && signal.reason.kind === "deadline" ? "deadline" : "user"
}

function cancellationOriginalReason(signal) {
  return signal?.reason?.original_reason
}

function absoluteDeadline(value) {
  if (typeof value !== "object" || value === null) throw new Error("deadline must be an object")
  const expiresAt = value.expires_at_monotonic_ms
  if (!Number.isFinite(expiresAt) || expiresAt < 0 || expiresAt > Number.MAX_SAFE_INTEGER) {
    throw new Error("deadline expires_at_monotonic_ms must be a non-negative finite safe number")
  }
  return Object.freeze({ expires_at_monotonic_ms: expiresAt })
}

function positiveSafeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`)
  return value
}

function finiteNonNegative(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} must be a non-negative finite safe number`)
  }
  return value
}

module.exports = Object.freeze({
  MAX_TIMER_DELAY_MS,
  ProcessingCancellationError,
  cancellationKindFromSignal,
  cancellationOriginalReason,
  constrainAbsoluteDeadline,
  createAbsoluteDeadline,
  createCancellationScope,
  monotonicNowMilliseconds,
  remainingDeadlineMilliseconds
})
