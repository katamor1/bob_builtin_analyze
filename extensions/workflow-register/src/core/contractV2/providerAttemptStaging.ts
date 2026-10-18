import { types as utilTypes } from "node:util"
import type { WorkflowRunState } from "../modelRuntime"
import { normalizeWorkspaceRootIdentity } from "../../workspaceRootIdentity"
import { canonicalJsonDigest } from "./canonicalJson"
import type { JsonValue } from "./jsonValue"
import { requireActiveWorkflowPlanLease, type WorkflowPlanLease } from "./planLease"
import type { WorkflowProviderEffectInput, WorkflowProviderIdempotencyInput } from "./providerContract"
import { requireWorkflowContractV2RunPlanLeaseForExecution } from "./runPlanLeaseContext"

declare const attemptBrand: unique symbol
export interface WorkflowAttemptStaging { readonly [attemptBrand]: true }
export interface WorkflowAttemptStagedArtifact { readonly id: string; readonly bytes: Uint8Array }
export interface WorkflowAttemptInvocationSession {
  readonly idempotency: WorkflowProviderIdempotencyInput
  readonly effect: WorkflowProviderEffectInput
  assertActive(): void
  sealWrites(): Promise<void>
  finish(outcome: "accepted" | "provider_failed" | "rejected"): void
}
type AuthorityInput = { readonly attempt: WorkflowAttemptStaging; readonly lease: WorkflowPlanLease; readonly stepId: string; readonly signal: AbortSignal }
type Outcome = "fresh" | "in_flight" | "accepted" | "provider_failed" | "rejected"
interface Writes { sealed: boolean; failed: boolean; count: number; total: number; rows: WorkflowAttemptStagedArtifact[]; pending: Promise<void>[] }
interface AttemptState {
  readonly workspaceRoot: string; readonly run: WorkflowRunState; readonly runId: string
  readonly lease: WorkflowPlanLease; readonly stepId: string; readonly attemptId: string
  status: Outcome; calls: number; inputDigest?: string; signal?: AbortSignal; writes?: Writes
  rows: readonly WorkflowAttemptStagedArtifact[]
}
const attempts = new WeakMap<object, AttemptState>()
const identities = new WeakMap<WorkflowPlanLease, Set<string>>()
const isProxy = utilTypes.isProxy
const isUint8Array = utilTypes.isUint8Array
const isShared = utilTypes.isSharedArrayBuffer
const freeze = Object.freeze
const descriptorsOf = Object.getOwnPropertyDescriptors
const prototypeOf = Object.getPrototypeOf
const descriptorOf = Object.getOwnPropertyDescriptor
const hasOwn = Object.hasOwn
const ownKeys = Reflect.ownKeys
const apply = Reflect.apply
const ordinary = Object.prototype
const Uint8ArrayConstructor = Uint8Array
const typedArrayPrototype = prototypeOf(Uint8Array.prototype)
const bufferGetter = descriptorOf(typedArrayPrototype, "buffer")!.get!
const lengthGetter = descriptorOf(typedArrayPrototype, "byteLength")!.get!
const offsetGetter = descriptorOf(typedArrayPrototype, "byteOffset")!.get!
const setBytes = Uint8Array.prototype.set
const abortedGetter = descriptorOf(AbortSignal.prototype, "aborted")!.get!
const NativePromise = Promise
const nativeThen = Promise.prototype.then
const idPattern = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const invalid = (): TypeError => new TypeError("Workflow provider attempt authority or state is invalid.")

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || isProxy(value)) throw invalid()
  const prototype = prototypeOf(value)
  if (prototype !== ordinary && prototype !== null) throw invalid()
  const fields = descriptorsOf(value), actual = ownKeys(fields), copy = Object.create(null) as Record<string, unknown>
  if (actual.length !== keys.length) throw invalid()
  for (const key of actual) {
    if (typeof key !== "string" || !keys.includes(key)) throw invalid()
    const field = fields[key]
    if (!hasOwn(field, "value") || field.enumerable !== true) throw invalid()
    copy[key] = field.value
  }
  return copy
}
function id(value: unknown): value is string { return typeof value === "string" && value.length <= 128 && idPattern.test(value) }
function requireState(value: unknown): AttemptState {
  if (typeof value !== "object" || value === null || isProxy(value)) throw invalid()
  const state = attempts.get(value)
  if (!state) throw invalid()
  return state
}
function discard(state: AttemptState): void {
  state.status = "rejected"; state.rows = []
  if (state.writes) { state.writes.sealed = true; state.writes.rows = [] }
}
function authority(state: AttemptState, signal?: AbortSignal): void {
  try {
    if (requireActiveWorkflowPlanLease(state.lease) !== state.lease
      || requireWorkflowContractV2RunPlanLeaseForExecution(state.workspaceRoot, state.run) !== state.lease || state.run.runId !== state.runId) throw invalid()
  } catch { discard(state); throw invalid() }
  if (signal !== undefined) {
    if (typeof signal !== "object" || signal === null || isProxy(signal)) throw invalid()
    let aborted: boolean
    try { aborted = apply(abortedGetter, signal, []) as boolean } catch { throw invalid() }
    if (aborted) { discard(state); const error = new Error("Workflow provider invocation was aborted."); error.name = "AbortError"; throw error }
  }
}
function owned(input: AuthorityInput): AttemptState {
  const wrapper = record(input, ["attempt", "lease", "stepId", "signal"]), state = requireState(wrapper.attempt)
  if (wrapper.lease !== state.lease || wrapper.stepId !== state.stepId) throw invalid()
  if (typeof wrapper.signal !== "object" || wrapper.signal === null || isProxy(wrapper.signal)) throw invalid()
  authority(state, wrapper.signal as AbortSignal)
  return state
}
export function createWorkflowAttemptStaging(input: {
  readonly workspaceRoot: string; readonly run: WorkflowRunState; readonly stepId: string; readonly attemptId: string
}): WorkflowAttemptStaging {
  const wrapper = record(input, ["workspaceRoot", "run", "stepId", "attemptId"])
  if (typeof wrapper.workspaceRoot !== "string" || wrapper.workspaceRoot.length === 0 || !id(wrapper.stepId) || !id(wrapper.attemptId)) throw invalid()
  const workspaceRoot = normalizeWorkspaceRootIdentity(wrapper.workspaceRoot), run = wrapper.run as WorkflowRunState
  let lease: WorkflowPlanLease
  try { lease = requireWorkflowContractV2RunPlanLeaseForExecution(workspaceRoot, run) } catch { throw invalid() }
  const steps = lease.handle.plan.workflow.steps.filter(step => step.id === wrapper.stepId)
  if (steps.length !== 1 || steps[0].type !== "command") throw invalid()
  const identity = JSON.stringify([run.runId, wrapper.stepId, wrapper.attemptId]), existing = identities.get(lease) ?? new Set<string>()
  if (existing.has(identity)) throw invalid()
  const attempt = freeze({}) as WorkflowAttemptStaging
  attempts.set(attempt, { workspaceRoot, run, runId: run.runId, lease, stepId: wrapper.stepId, attemptId: wrapper.attemptId, status: "fresh", calls: 0, rows: [] })
  existing.add(identity); identities.set(lease, existing)
  return attempt
}
export function assertWorkflowAttemptStagingAuthority(input: AuthorityInput): void {
  const state = owned(input)
  if (state.status !== "fresh" && state.status !== "provider_failed") throw invalid()
}
export function rejectWorkflowAttemptBeforeDispatch(input: AuthorityInput): void {
  const state = owned(input)
  if (state.status !== "fresh" && state.status !== "provider_failed") throw invalid()
  discard(state)
}
export function beginWorkflowAttemptInvocation(input: AuthorityInput & { readonly validatedInput: JsonValue }): WorkflowAttemptInvocationSession {
  const wrapper = record(input, ["attempt", "lease", "stepId", "signal", "validatedInput"])
  const state = owned({ attempt: wrapper.attempt as WorkflowAttemptStaging, lease: wrapper.lease as WorkflowPlanLease, stepId: wrapper.stepId as string, signal: wrapper.signal as AbortSignal })
  if (state.status !== "fresh" && state.status !== "provider_failed") throw invalid()
  const plan = state.lease.handle.plan, step = plan.workflow.steps.find(s => s.id === state.stepId)
  if (!step || step.type !== "command") throw invalid()
  const bindings = plan.providerBindings.filter(b => b.id === step.provider)
  if (bindings.length !== 1) throw invalid()
  const binding = bindings[0], inputDigest = canonicalJsonDigest(wrapper.validatedInput)
  if (state.status === "provider_failed" && (binding.idempotency === "non-idempotent" || inputDigest !== state.inputDigest
    || plan.workflow.resumePolicy.mode !== "restart-step" || state.calls >= plan.workflow.resumePolicy.maxAttempts)) { discard(state); throw invalid() }
  const capability = binding.sideEffect === "none" ? undefined : `workflow.effect.${binding.sideEffect}`
  if (capability && !binding.requiredCapabilities.includes(capability)) throw invalid()
  state.status = "in_flight"; state.calls++; state.inputDigest = inputDigest; state.signal = wrapper.signal as AbortSignal; state.rows = []
  const writes: Writes = { sealed: false, failed: false, count: 0, total: 0, rows: [], pending: [] }; state.writes = writes
  let finished = false
  const assertActive = (): void => { authority(state, state.signal); if (finished || state.status !== "in_flight" || state.writes !== writes) throw invalid() }
  const writeArtifact = (input: { readonly id: string; readonly bytes: Uint8Array }): Promise<void> => {
    let failure: unknown
    try {
      if (writes.sealed) throw invalid()
      assertActive()
      if (++writes.count > 128) throw invalid()
      const fields = record(input, ["id", "bytes"]), bytes = fields.bytes
      const declarations = plan.requiredArtifacts.filter(a => a.id === fields.id && a.producedBy === state.stepId && a.owner === "provider" && step.artifacts.includes(a.id))
      if (declarations.length !== 1 || !isUint8Array(bytes) || isProxy(bytes)) throw invalid()
      const buffer = apply(bufferGetter, bytes, []) as ArrayBuffer
      const length = apply(lengthGetter, bytes, []) as number, offset = apply(offsetGetter, bytes, []) as number
      if (isShared(buffer) || length > declarations[0].maxBytes || writes.rows.length >= 128 || writes.total + length > 67_108_864 || writes.rows.some(row => row.id === fields.id)) throw invalid()
      // Constructing this native view also rejects a detached zero-length source.
      new Uint8ArrayConstructor(buffer, offset, length)
      const copy = new Uint8ArrayConstructor(length); apply(setBytes, copy, [bytes])
      writes.rows.push(freeze({ id: declarations[0].id, bytes: copy })); writes.total += length
    } catch (error) { failure = error; if (!writes.sealed) writes.failed = true }
    const pending = failure === undefined ? new NativePromise<void>(resolve => resolve()) : new NativePromise<void>((_, reject) => reject(failure))
    // Observe every rejection even if the provider deliberately ignores its write.
    apply(nativeThen, pending, [undefined, () => {}])
    if (!writes.sealed && writes.count <= 128) writes.pending.push(pending)
    return pending
  }
  const idempotency: WorkflowProviderIdempotencyInput = binding.idempotency === "key-required"
    ? freeze({ mode: "key-required", key: canonicalJsonDigest({ workspaceRoot: state.workspaceRoot, runId: state.runId, planDigest: state.lease.planDigest, provider: binding, stepId: state.stepId, attemptId: state.attemptId, inputDigest }) })
    : freeze({ mode: binding.idempotency })
  const effect: WorkflowProviderEffectInput = binding.sideEffect === "workspace-write"
    ? freeze({ kind: "workspace-write", artifacts: freeze({ writeArtifact }) }) : freeze({ kind: binding.sideEffect })
  return freeze({ idempotency, effect, assertActive,
    async sealWrites(): Promise<void> {
      writes.sealed = true; assertActive()
      for (const pending of writes.pending) {
        await new NativePromise<void>(resolve => { apply(nativeThen, pending, [() => resolve(), () => resolve()]) })
        assertActive()
      }
      if (writes.failed) throw new TypeError("Workflow provider artifact staging failed.")
    },
    finish(outcome: "accepted" | "provider_failed" | "rejected"): void {
      writes.sealed = true
      if (finished) return
      if (outcome !== "rejected") assertActive()
      finished = true
      state.status = outcome
      state.rows = outcome === "accepted" ? freeze(writes.rows.slice()) : []
      if (outcome !== "accepted") writes.rows = []
    }
  })
}
export function readWorkflowAttemptStagedArtifacts(attempt: WorkflowAttemptStaging): readonly WorkflowAttemptStagedArtifact[] {
  const state = requireState(attempt)
  authority(state, state.signal)
  if (state.status !== "accepted") throw invalid()
  return freeze(state.rows.map(row => { const bytes = new Uint8ArrayConstructor(row.bytes.length); apply(setBytes, bytes, [row.bytes]); return freeze({ id: row.id, bytes }) }))
}
