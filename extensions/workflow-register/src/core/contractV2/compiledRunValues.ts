import { canonicalJsonDigest, canonicalJsonText } from "./canonicalJson"
import type {
  CompiledWorkflowPlan,
  CompiledWorkflowPlanPrivateState,
  CompiledWorkflowStep
} from "./compiledPlan"
import type { CompiledLocalJsonSchemaView } from "./jsonSchemaCatalog"
import type { JsonObject, JsonValue } from "./jsonValue"
import { parseStrictJson } from "./packageLoaderInput"
import type { WorkflowReferenceV2, WorkflowValueTemplateV2 } from "./packageShape"
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"
import type { WorkflowProviderLockEvidence } from "./providerRegistry"
import type { WorkflowRunState } from "../model"
import { COMMITTED_OUTPUTS_KEY, type CompiledRuntimeContext } from "./compiledRunTypes"

const arrayIsArray = Array.isArray
const arrayPush = Array.prototype.push
const bufferByteLength = Buffer.byteLength.bind(Buffer) as (
  value: string,
  encoding?: BufferEncoding
) => number
const bufferFrom = Buffer.from
const BufferConstructor = Buffer
const NumberConstructor = Number
const numberIsSafeInteger = Number.isSafeInteger
const numberParseInt = Number.parseInt
const numberToString = Number.prototype.toString
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const reflectApply = Reflect.apply
const regexpExec = RegExp.prototype.exec
const stringEndsWith = String.prototype.endsWith
const stringReplace = String.prototype.replace
const stringSlice = String.prototype.slice
const stringSplit = String.prototype.split
const stringStartsWith = String.prototype.startsWith
const INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/u
const EXECUTION_ORDINAL_PREFIX = "workflow.contractV2.executionOrdinal."
const MAX_COMMITTED_OUTPUT_BYTES = 16_777_216

export function resolveCompiledTemplate(
  template: WorkflowValueTemplateV2,
  context: CompiledRuntimeContext
): JsonValue {
  if (template.source === "literal") return template.value
  if (template.source === "input" || template.source === "committedOutput") {
    return resolveCompiledReference(template, context)
  }
  if (template.source === "array") {
    const values: JsonValue[] = []
    for (let index = 0; index < template.items.length; index += 1) {
      push(values, resolveCompiledTemplate(template.items[index], context))
    }
    return objectFreeze(values)
  }
  if (template.source === "object") {
    const result = objectCreate(null) as Record<string, JsonValue>
    const keys = objectKeys(template.properties)
    for (let index = 0; index < keys.length; index += 1) {
      result[keys[index]] = resolveCompiledTemplate(template.properties[keys[index]], context)
    }
    return objectFreeze(result)
  }
  throw new TypeError("Compiled workflow value template is invalid.")
}

export function resolveCompiledReference(
  reference: WorkflowReferenceV2,
  context: CompiledRuntimeContext
): JsonValue {
  const root = reference.source === "input" ? context.input[reference.id] : context.outputs[reference.id]
  if (root === undefined) throw new TypeError("Compiled workflow reference is unavailable.")
  return resolvePointer(root, reference.pointer)
}

export function findCompiledPrompt(plan: CompiledWorkflowPlan, path: string): string {
  const id = startsWith(path, "prompts/") && endsWith(path, ".md")
    ? slice(path, "prompts/".length, path.length - ".md".length)
    : path
  for (let index = 0; index < plan.prompts.length; index += 1) {
    if (plan.prompts[index].id === id) return plan.prompts[index].text
  }
  throw new TypeError("Compiled workflow prompt is unavailable.")
}

export function findCompiledSchema(
  state: CompiledWorkflowPlanPrivateState,
  id: string
): CompiledLocalJsonSchemaView {
  for (let index = 0; index < state.schemas.length; index += 1) {
    if (state.schemas[index].id === id) return state.schemas[index].compiled
  }
  throw new TypeError("Compiled workflow schema is unavailable.")
}

export function findCompiledProvider(
  values: readonly WorkflowProviderLockEvidence[],
  id: string
): WorkflowProviderLockEvidence {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index].id === id) return values[index]
  }
  throw new TypeError("Compiled workflow provider evidence is unavailable.")
}

export function findCompiledStepIndex(
  steps: readonly CompiledWorkflowStep[],
  id: string
): number {
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].id === id) return index
  }
  return -1
}

export function persistCompiledOutputs(
  run: WorkflowRunState,
  outputs: Readonly<Record<string, JsonValue>>
): void {
  run.state[COMMITTED_OUTPUTS_KEY] = canonicalJsonText(outputs)
}

export function restoreCompiledOutputs(
  plan: CompiledWorkflowPlan,
  run: WorkflowRunState
): Record<string, JsonValue> {
  const text = run.state[COMMITTED_OUTPUTS_KEY]
  if (text === undefined) return objectCreate(null) as Record<string, JsonValue>
  if (bufferByteLength(text, "utf8") > MAX_COMMITTED_OUTPUT_BYTES) {
    throw new TypeError("Compiled workflow committed output evidence exceeds its byte limit.")
  }
  let parsed: unknown
  try {
    parsed = parseStrictJson(
      reflectApply(bufferFrom, BufferConstructor, [text, "utf8"]) as Buffer,
      "Compiled workflow committed outputs"
    )
  } catch {
    throw new TypeError("Compiled workflow committed output evidence is invalid.")
  }
  const bounded = snapshotBoundedWorkflowProviderEnvelope(parsed, MAX_COMMITTED_OUTPUT_BYTES)
  if (
    bounded === undefined
    || bounded === null
    || typeof bounded !== "object"
    || arrayIsArray(bounded)
    || canonicalJsonText(bounded) !== text
  ) throw new TypeError("Compiled workflow committed output evidence is invalid.")

  const result = objectCreate(null) as Record<string, JsonValue>
  const keys = objectKeys(bounded)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (!isCompiledOutputId(plan, key)) {
      throw new TypeError("Compiled workflow committed output evidence contains an unknown output.")
    }
    result[key] = (bounded as JsonObject)[key]
  }
  return result
}

export function compiledAttemptId(stepIndex: number, attempt: number): string {
  if (!numberIsSafeInteger(stepIndex) || stepIndex < 0 || !numberIsSafeInteger(attempt) || attempt < 1) {
    throw new TypeError("Compiled workflow attempt identity is invalid.")
  }
  return `attempt-${padFour(stepIndex + 1)}-${padFour(attempt)}`
}

export function compiledExecutionOrdinalStateKey(stepId: string): string {
  return `${EXECUTION_ORDINAL_PREFIX}${stepId}`
}

export function compiledLogicalEffectOrdinal(run: WorkflowRunState, stepId: string): number {
  const value = run.state[compiledExecutionOrdinalStateKey(stepId)]
  if (value === undefined) return 1
  if (reflectApply(regexpExec, POSITIVE_INTEGER_PATTERN, [value]) === null) {
    throw new TypeError("Compiled workflow logical effect ordinal evidence is invalid.")
  }
  const completed = reflectApply(numberParseInt, Number, [value, 10]) as number
  if (!numberIsSafeInteger(completed) || completed < 1 || completed >= Number.MAX_SAFE_INTEGER) {
    throw new TypeError("Compiled workflow logical effect ordinal evidence is invalid.")
  }
  return completed + 1
}

export function compiledProviderIdempotencyKey(input: {
  readonly runId: string
  readonly stepId: string
  readonly logicalEffectOrdinal: number
  readonly inputDigest: string
  readonly planDigest: string
  readonly provider: WorkflowProviderLockEvidence
}): string {
  if (!numberIsSafeInteger(input.logicalEffectOrdinal) || input.logicalEffectOrdinal < 1) {
    throw new TypeError("Compiled workflow logical effect ordinal is invalid.")
  }
  const digest = canonicalJsonDigest({
    schemaVersion: "workflow-provider-idempotency/v1",
    runId: input.runId,
    stepId: input.stepId,
    logicalEffectIdentity: `provider:${input.provider.id}`,
    logicalEffectOrdinal: input.logicalEffectOrdinal,
    inputDigest: input.inputDigest,
    planDigest: input.planDigest,
    providerVersion: input.provider.exactVersion
  })
  return `wf2:${slice(digest, "sha256:".length)}`
}

function isCompiledOutputId(plan: CompiledWorkflowPlan, id: string): boolean {
  for (let index = 0; index < plan.workflow.steps.length; index += 1) {
    const step = plan.workflow.steps[index]
    if ((step.type === "command" || step.type === "agent") && step.output.kind === "value" && step.output.id === id) {
      return true
    }
  }
  return false
}

function resolvePointer(root: JsonValue, pointer: string): JsonValue {
  if (pointer === "") return root
  if (typeof pointer !== "string" || !startsWith(pointer, "/")) {
    throw new TypeError("Compiled workflow reference pointer is invalid.")
  }
  const encoded = reflectApply(stringSplit, slice(pointer, 1), ["/"]) as string[]
  let current: JsonValue = root
  for (let index = 0; index < encoded.length; index += 1) {
    const token = replace(replace(encoded[index], /~1/gu, "/"), /~0/gu, "~")
    if (arrayIsArray(current)) {
      if (reflectApply(regexpExec, INDEX_PATTERN, [token]) === null) {
        throw new TypeError("Compiled workflow array pointer is invalid.")
      }
      const itemIndex = reflectApply(NumberConstructor, undefined, [token]) as number
      if (!numberIsSafeInteger(itemIndex)) throw new TypeError("Compiled workflow array pointer is invalid.")
      const item = current[itemIndex]
      if (item === undefined) throw new TypeError("Compiled workflow reference is unavailable.")
      current = item
    } else if (current !== null && typeof current === "object" && objectHasOwn(current, token)) {
      current = (current as JsonObject)[token]
    } else {
      throw new TypeError("Compiled workflow reference is unavailable.")
    }
  }
  return current
}

function padFour(value: number): string {
  const text = reflectApply(numberToString, value, []) as string
  if (text.length >= 4) return text
  return `${slice("0000", text.length)}${text}`
}

function startsWith(value: string, prefix: string): boolean {
  return reflectApply(stringStartsWith, value, [prefix]) as boolean
}

function endsWith(value: string, suffix: string): boolean {
  return reflectApply(stringEndsWith, value, [suffix]) as boolean
}

function slice(value: string, start: number, end?: number): string {
  return reflectApply(stringSlice, value, end === undefined ? [start] : [start, end]) as string
}

function replace(value: string, pattern: RegExp, replacement: string): string {
  return reflectApply(stringReplace, value, [pattern, replacement]) as string
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
