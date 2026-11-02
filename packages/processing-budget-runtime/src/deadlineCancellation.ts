import { performance } from "node:perf_hooks"

export interface AbsoluteProcessingDeadline {
  readonly expires_at_monotonic_ms: number
}
export type ProcessingCancellationKind = "user" | "deadline"
export interface ProcessingCancellationScope {
  readonly deadline: AbsoluteProcessingDeadline
  readonly signal: AbortSignal
  remainingMilliseconds(): number
  throwIfCancelled(): void
  dispose(): void
}
type ScopeSources = { readonly signal?: AbortSignal; readonly signals?: never } |
  { readonly signal?: never; readonly signals: readonly AbortSignal[] }
export type CreateProcessingCancellationScopeInput = ScopeSources & {
  readonly deadline: AbsoluteProcessingDeadline
  readonly now?: () => number
  readonly schedule?: (callback: () => void, delay: number) => unknown
  readonly cancelSchedule?: (handle: unknown) => void
}
export const MAX_TIMER_DELAY_MS = 0x7fffffff

export class ProcessingCancellationError extends Error {
  readonly code = "processing_cancelled"
  readonly kind: ProcessingCancellationKind
  readonly original_reason?: unknown
  constructor(kind: ProcessingCancellationKind, originalReason?: unknown) {
    super("Processing operation cancelled")
    this.name = "ProcessingCancellationError"
    this.kind = kind
    if (kind === "user") this.original_reason = originalReason
  }
}

function invalid(): never { throw new TypeError("Invalid processing deadline or cancellation scope input") }
function closedData(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) invalid()
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors)
  if (required.some(key => !Object.hasOwn(descriptors, key))) invalid()
  const allowed = new Set([...required, ...optional]), result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const key of keys) {
    if (typeof key !== "string" || !allowed.has(key)) invalid()
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) invalid()
    result[key] = descriptor.value
  }
  return result
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER) invalid()
  return value
}
function duration(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) invalid()
  return value
}
function deadlineSnapshot(value: unknown): AbsoluteProcessingDeadline {
  const data = closedData(value, ["expires_at_monotonic_ms"])
  return Object.freeze({ expires_at_monotonic_ms: timestamp(data.expires_at_monotonic_ms) })
}
export function monotonicNowMilliseconds(): number { return timestamp(performance.now()) }
export function createAbsoluteDeadline(timeoutMs: number, nowMs = monotonicNowMilliseconds()): AbsoluteProcessingDeadline {
  return Object.freeze({ expires_at_monotonic_ms: timestamp(timestamp(nowMs) + duration(timeoutMs)) })
}
export function constrainAbsoluteDeadline(parent: AbsoluteProcessingDeadline, timeoutMs: number, nowMs = monotonicNowMilliseconds()): AbsoluteProcessingDeadline {
  const previous = deadlineSnapshot(parent), candidate = timestamp(nowMs) + duration(timeoutMs)
  return Object.freeze({ expires_at_monotonic_ms: Math.min(previous.expires_at_monotonic_ms, candidate) })
}
export function remainingDeadlineMilliseconds(deadline: AbsoluteProcessingDeadline, nowMs = monotonicNowMilliseconds()): number {
  return Math.max(0, Math.ceil(deadlineSnapshot(deadline).expires_at_monotonic_ms - timestamp(nowMs)))
}

const abortedGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "aborted")!.get!
const reasonGetter = Object.getOwnPropertyDescriptor(AbortSignal.prototype, "reason")!.get!
function nativeSignal(value: unknown): AbortSignal {
  try {
    if (!(value instanceof AbortSignal)) invalid()
    abortedGetter.call(value)
    return value
  } catch { return invalid() }
}
interface AuthenticatedCause {
  kind?: ProcessingCancellationKind
  reason?: ProcessingCancellationError
  original?: unknown
  refresh(): void
}
const authenticated = new WeakMap<AbortSignal, AuthenticatedCause>()
function cause(signal: AbortSignal): AuthenticatedCause | undefined {
  const state = authenticated.get(signal)
  state?.refresh()
  return state?.kind !== undefined && state.reason === reasonGetter.call(signal) ? state : undefined
}
export function cancellationKindFromSignal(value: AbortSignal): ProcessingCancellationKind | undefined {
  const signal = nativeSignal(value), state = cause(signal)
  return state?.kind ?? (abortedGetter.call(signal) ? "user" : undefined)
}
export function cancellationOriginalReason(value: AbortSignal): unknown {
  const signal = nativeSignal(value), state = cause(signal)
  return state ? state.original : abortedGetter.call(signal) ? reasonGetter.call(signal) : undefined
}

export function createCancellationScope(value: CreateProcessingCancellationScopeInput): ProcessingCancellationScope {
  const data = closedData(value, ["deadline"], ["signal", "signals", "now", "schedule", "cancelSchedule"])
  if (Object.hasOwn(data, "signal") && Object.hasOwn(data, "signals")) invalid()
  const deadline = deadlineSnapshot(data.deadline)
  for (const key of ["now", "schedule", "cancelSchedule"]) if (data[key] !== undefined && typeof data[key] !== "function") invalid()
  const now = (data.now as (() => number) | undefined) ?? monotonicNowMilliseconds
  const schedule = (data.schedule as ((callback: () => void, delay: number) => unknown) | undefined) ?? ((callback, delay) => setTimeout(callback, delay))
  const cancelSchedule = (data.cancelSchedule as ((handle: unknown) => void) | undefined) ?? (handle => clearTimeout(handle as NodeJS.Timeout))
  let sources: AbortSignal[]
  if (data.signals !== undefined) {
    if (!Array.isArray(data.signals)) invalid()
    sources = [...new Set(Array.from(data.signals, nativeSignal))]
  } else sources = data.signal === undefined ? [] : [nativeSignal(data.signal)]
  const controller = new AbortController(), listeners: { signal: AbortSignal; listener: () => void }[] = []
  let disposed = false, timer: unknown, timerActive = false, lastNow = -1
  const readNow = (): number => {
    const current = timestamp(now())
    if (current < lastNow) invalid()
    lastNow = current
    return current
  }
  const clearResources = (): void => {
    if (timerActive) { timerActive = false; cancelSchedule(timer) }
    for (const row of listeners.splice(0)) EventTarget.prototype.removeEventListener.call(row.signal, "abort", row.listener)
  }
  const state: AuthenticatedCause = {
    refresh(): void {
      if (state.kind !== undefined) return
      for (const source of sources) {
        const inherited = cause(source)
        if (abortedGetter.call(source)) {
          settle(inherited?.kind ?? "user", inherited ? inherited.original : reasonGetter.call(source), inherited?.reason)
          return
        }
      }
      if (readNow() >= deadline.expires_at_monotonic_ms) settle("deadline")
    }
  }
  const settle = (kind: ProcessingCancellationKind, original?: unknown, inherited?: ProcessingCancellationError): void => {
    if (state.kind !== undefined) return
    state.kind = kind
    state.original = original
    state.reason = inherited ?? new ProcessingCancellationError(kind, original)
    clearResources()
    controller.abort(state.reason)
  }
  const armTimer = (): void => {
    if (disposed || state.kind !== undefined) return
    const remaining = Math.max(0, Math.ceil(deadline.expires_at_monotonic_ms - readNow()))
    if (remaining === 0) { state.refresh(); return }
    timer = schedule(() => { timerActive = false; state.refresh(); armTimer() }, Math.min(remaining, MAX_TIMER_DELAY_MS))
    timerActive = true
    const handle = timer as { unref?: () => void } | undefined
    if (typeof handle?.unref === "function") handle.unref()
  }
  authenticated.set(controller.signal, state)
  try {
    state.refresh()
    for (const source of sources) {
      if (state.kind !== undefined) break
      const listener = (): void => state.refresh()
      listeners.push({ signal: source, listener })
      source.addEventListener("abort", listener, { once: true })
      state.refresh()
    }
    armTimer()
  } catch (error) { disposed = true; clearResources(); throw error }
  return Object.freeze({
    deadline, signal: controller.signal,
    remainingMilliseconds(): number { state.refresh(); return Math.max(0, Math.ceil(deadline.expires_at_monotonic_ms - readNow())) },
    throwIfCancelled(): void { state.refresh(); if (state.kind !== undefined) throw state.reason },
    dispose(): void { if (!disposed) { disposed = true; clearResources() } }
  })
}
