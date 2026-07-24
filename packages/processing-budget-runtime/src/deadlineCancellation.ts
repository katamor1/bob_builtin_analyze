declare const require: (id: string) => unknown

export type ProcessingCancellationKind = "user" | "deadline"

export interface AbsoluteProcessingDeadline {
  readonly expires_at_monotonic_ms: number
}

export interface CancellationSignalLike {
  readonly aborted: boolean
  readonly reason?: unknown
  addEventListener?(type: "abort", listener: () => void, options?: { readonly once?: boolean }): void
  removeEventListener?(type: "abort", listener: () => void): void
}

export interface ProcessingCancellationScope {
  readonly deadline: AbsoluteProcessingDeadline
  readonly signal: CancellationSignalLike
  remainingMilliseconds(): number
  throwIfCancelled(): void
  dispose(): void
}

export interface CreateProcessingCancellationScopeInput {
  readonly deadline: AbsoluteProcessingDeadline
  readonly signal?: CancellationSignalLike
  readonly now?: () => number
  readonly schedule?: (callback: () => void, delayMilliseconds: number) => unknown
  readonly cancelSchedule?: (handle: unknown) => void
}

export interface SharedProcessingCancellationError extends Error {
  readonly code: "processing_cancelled"
  readonly kind: ProcessingCancellationKind
  readonly original_reason?: unknown
}

interface DeadlineCancellationRuntime {
  readonly ProcessingCancellationError: new (
    kind: ProcessingCancellationKind,
    originalReason?: unknown
  ) => SharedProcessingCancellationError
  monotonicNowMilliseconds(): number
  createAbsoluteDeadline(timeoutMs: number, nowMs?: number): AbsoluteProcessingDeadline
  constrainAbsoluteDeadline(
    parent: AbsoluteProcessingDeadline,
    timeoutMs: number,
    nowMs?: number
  ): AbsoluteProcessingDeadline
  remainingDeadlineMilliseconds(deadline: AbsoluteProcessingDeadline, nowMs?: number): number
  createCancellationScope(input: CreateProcessingCancellationScopeInput): ProcessingCancellationScope
  cancellationKindFromSignal(signal: CancellationSignalLike): ProcessingCancellationKind | undefined
  cancellationOriginalReason(signal: CancellationSignalLike): unknown
}

const runtime = require("./deadline-cancellation.js") as DeadlineCancellationRuntime

export const ProcessingCancellationError = runtime.ProcessingCancellationError
export const monotonicNowMilliseconds = runtime.monotonicNowMilliseconds
export const createAbsoluteDeadline = runtime.createAbsoluteDeadline
export const constrainAbsoluteDeadline = runtime.constrainAbsoluteDeadline
export const remainingDeadlineMilliseconds = runtime.remainingDeadlineMilliseconds
export const createCancellationScope = runtime.createCancellationScope
export const cancellationKindFromSignal = runtime.cancellationKindFromSignal
export const cancellationOriginalReason = runtime.cancellationOriginalReason
