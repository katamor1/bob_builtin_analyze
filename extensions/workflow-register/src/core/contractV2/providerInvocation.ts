import { types as utilTypes } from "node:util"
import { requireCompiledWorkflowPlanState } from "./compiledPlan"
import { createWorkflowContractV2Diagnostic, type WorkflowContractV2Diagnostic, type WorkflowContractV2DiagnosticCode } from "./diagnostics"
import { validateLocalJsonSchemaViewValue } from "./jsonSchemaCatalog"
import type { JsonValue } from "./jsonValue"
import { requireActiveWorkflowPlanLease, type WorkflowPlanLease } from "./planLease"
import { assertWorkflowAttemptStagingAuthority, beginWorkflowAttemptInvocation, rejectWorkflowAttemptBeforeDispatch, type WorkflowAttemptStaging } from "./providerAttemptStaging"
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"
import { invokeBoundWorkflowProviderDispatch } from "./providerRegistry"

export type CompiledProviderInvocationResult =
  | { readonly ok: true; readonly output: { readonly kind: "unit" } | { readonly kind: "value"; readonly value: JsonValue }; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly failure: "provider-error"; readonly error: JsonValue; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly failure: "validation"; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] }
const freeze = Object.freeze
const descriptorsOf = Object.getOwnPropertyDescriptors
const prototypeOf = Object.getPrototypeOf
const ownKeys = Reflect.ownKeys
const hasOwn = Object.hasOwn
const isProxy = utilTypes.isProxy
const isPromise = utilTypes.isPromise
const apply = Reflect.apply
const NativePromise = Promise
const nativeThen = Promise.prototype.then
const empty = freeze([]) as readonly []
const fields = ["lease", "stepId", "value", "signal", "attempt"] as const
const invalid = (): TypeError => new TypeError("Workflow compiled provider invocation is invalid.")

const descriptorOf = Object.getOwnPropertyDescriptor
const defineProperty = Object.defineProperty
const deleteProperty = Reflect.deleteProperty
const isExtensible = Object.isExtensible
const speciesKey = Symbol.species
const nativeSpeciesGetter = descriptorOf(NativePromise, speciesKey)?.get
function inheritedDescriptor(value: object, key: PropertyKey): PropertyDescriptor | null | undefined {
  let current: object | null = value
  for (let depth = 0; depth < 64 && current !== null; depth++) {
    if (isProxy(current)) return null
    const descriptor = descriptorOf(current, key)
    if (descriptor) return descriptor
    current = prototypeOf(current)
  }
  return current === null ? undefined : null
}
function safeImmutablePromise(promise: object): boolean {
  const constructor = inheritedDescriptor(promise, "constructor")
  if (constructor === null) return false
  if (constructor && !hasOwn(constructor, "value")) return constructor.get === undefined
  const value = constructor?.value
  if (value === undefined) return true
  if (value === null || (typeof value !== "object" && typeof value !== "function") || isProxy(value)) return false
  const species = inheritedDescriptor(value, speciesKey)
  if (species === null) return false
  if (!species) return true
  if (hasOwn(species, "value")) return species.value === undefined || species.value === null || species.value === NativePromise
  return species.get === undefined || (value === NativePromise && species.get === nativeSpeciesGetter)
}
function observeNativePromise(promise: object, fulfilled: (value: unknown) => void, rejected: (error: unknown) => void): boolean {
  if (isProxy(promise)) return false
  const original = descriptorOf(promise, "constructor")
  const shadow = original ? original.configurable || (hasOwn(original, "value") && original.writable) : isExtensible(promise)
  try {
    if (!shadow) {
      if (!safeImmutablePromise(promise)) return false
      apply(nativeThen, promise, [fulfilled, rejected]); return true
    }
    // No source callbacks can run in this synchronous native-only section.
    // Bypass SpeciesConstructor without permanently changing the source object.
    defineProperty(promise, "constructor", original ? { value: undefined } : { value: undefined, configurable: true })
    try { apply(nativeThen, promise, [fulfilled, rejected]) }
    finally { if (original) defineProperty(promise, "constructor", original); else deleteProperty(promise, "constructor") }
    return true
  } catch { return false }
}

export async function invokeCompiledWorkflowProvider(input: {
  readonly lease: WorkflowPlanLease; readonly stepId: string; readonly value: unknown; readonly signal: AbortSignal; readonly attempt: WorkflowAttemptStaging
}): Promise<CompiledProviderInvocationResult> {
  if (typeof input !== "object" || input === null || isProxy(input)) throw invalid()
  const prototype = prototypeOf(input)
  if (prototype !== Object.prototype && prototype !== null) throw invalid()
  const descriptors = descriptorsOf(input), keys = ownKeys(descriptors), wrapper = Object.create(null) as typeof input
  if (keys.length !== fields.length) throw invalid()
  for (const key of keys) {
    if (typeof key !== "string" || !(fields as readonly string[]).includes(key)) throw invalid()
    const field = descriptors[key]
    if (!hasOwn(field, "value") || field.enumerable !== true) throw invalid()
    Object.defineProperty(wrapper, key, { value: field.value, enumerable: true })
  }
  const lease = requireActiveWorkflowPlanLease(wrapper.lease), authority = { attempt: wrapper.attempt, lease, stepId: wrapper.stepId, signal: wrapper.signal }
  assertWorkflowAttemptStagingAuthority(authority)
  const plan = lease.handle.plan, state = requireCompiledWorkflowPlanState(lease.handle)
  const steps = plan.workflow.steps.filter(step => step.id === wrapper.stepId)
  if (steps.length !== 1 || steps[0].type !== "command") throw invalid()
  const step = steps[0], index = plan.workflow.steps.indexOf(step)
  const bindings = plan.providerBindings.filter(binding => binding.id === step.provider), providers = state.providers.filter(provider => provider.id === step.provider)
  if (bindings.length !== 1 || providers.length !== 1) throw invalid()
  const binding = bindings[0]
  const schema = (evidence: { readonly id: string; readonly digest: string }) => {
    const publicRows = plan.schemas.filter(row => row.id === evidence.id && row.digest === evidence.digest), privateRows = state.schemas.filter(row => row.id === evidence.id)
    if (publicRows.length !== 1 || privateRows.length !== 1) throw invalid()
    return privateRows[0].compiled
  }
  const inputSchema = schema(binding.inputSchema), errorSchema = schema(binding.errorSchema)
  if (step.output.kind !== binding.output.kind || (step.output.kind === "value" && binding.output.kind === "value" && step.output.schema !== binding.output.schema.id)) throw invalid()
  const outputSchema = binding.output.kind === "value" ? schema(binding.output.schema) : undefined
  const location = (part: string) => ({ path: "workflow.yaml", pointer: `/steps/${index}/${part}` })
  const failure = (code: WorkflowContractV2DiagnosticCode, part: string): CompiledProviderInvocationResult => freeze({ ok: false, failure: "validation", diagnostics: freeze([
    createWorkflowContractV2Diagnostic({ code, severity: "error", message: "Workflow provider value or staged artifacts failed the bound contract.", location: location(part) })
  ]) })
  const value = snapshotBoundedWorkflowProviderEnvelope(wrapper.value, 16_777_216)
  const validated = value === undefined ? undefined : validateLocalJsonSchemaViewValue({ compiled: inputSchema, value, diagnosticCode: "WF2_PROVIDER_INPUT_INVALID", location: location("input") })
  if (!validated?.ok) { rejectWorkflowAttemptBeforeDispatch(authority); return failure("WF2_PROVIDER_INPUT_INVALID", "input") }
  const session = beginWorkflowAttemptInvocation({ ...authority, validatedInput: validated.value })
  let finished = false
  try {
    session.assertActive()
    const abi = freeze({ value: validated.value, signal: wrapper.signal, idempotency: session.idempotency, effect: session.effect })
    let result: unknown, threw = false
    try { result = invokeBoundWorkflowProviderDispatch(providers[0].dispatchHandle, abi) } catch (error) { threw = true; result = error }
    if (!threw && isPromise(result)) {
      const promise = result
      // Capture raw fulfillment/rejection into locals; never resolve a promise with provider data.
      await new NativePromise<void>(resolve => { if (!observeNativePromise(promise, value => { result = value; session.sealWriter(); resolve() }, error => { threw = true; result = error; session.sealWriter(); resolve() })) { session.sealWriter(); resolve() } })
      session.assertActive()
    } else session.sealWriter()
    session.assertActive()
    try { await session.sealWrites() } catch {
      session.assertActive()
      return failure("WF2_ARTIFACT_SCHEMA_INVALID", "artifacts")
    }
    session.assertActive()
    if (!threw && step.output.kind === "unit") {
      if (result !== undefined) return failure("WF2_PROVIDER_OUTPUT_INVALID", "output")
      session.finish("accepted"); finished = true
      return freeze({ ok: true, output: freeze({ kind: "unit" }), diagnostics: empty })
    }
    const code = threw ? "WF2_PROVIDER_ERROR_INVALID" : "WF2_PROVIDER_OUTPUT_INVALID", part = threw ? "provider" : "output"
    const detached = snapshotBoundedWorkflowProviderEnvelope(result, threw || step.output.kind !== "value" ? 16_777_216 : step.output.maxBytes)
    const compiled = threw ? errorSchema : outputSchema
    const output = detached === undefined || compiled === undefined ? undefined : validateLocalJsonSchemaViewValue({ compiled, value: detached, diagnosticCode: code, location: location(part) })
    session.assertActive()
    if (!output?.ok) return failure(code, part)
    session.finish(threw ? "provider_failed" : "accepted"); finished = true
    return threw ? freeze({ ok: false, failure: "provider-error", error: output.value, diagnostics: empty })
      : freeze({ ok: true, output: freeze({ kind: "value", value: output.value }), diagnostics: empty })
  } finally { if (!finished) session.finish("rejected") }
}
