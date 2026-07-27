import { types as utilTypes } from "node:util"

import type { CompiledWorkflowPlan, CompiledWorkflowPlanPrivateState, CompiledWorkflowStep } from "./compiledPlan"
import { validateLocalJsonSchemaViewValue } from "./jsonSchemaCatalog"
import type { JsonObject, JsonValue } from "./jsonValue"
import { evaluateWorkflowPredicate, type CompiledWorkflowPredicate } from "./predicate"
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"
import { findCompiledSchema, findCompiledStepIndex } from "./compiledRunValues"
import type { CompiledRuntimeContext, CompiledWorkflowExecutionOptions } from "./compiledRunTypes"

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const STEP_ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const MAX_INPUT_BYTES = 16_777_216

export function validateCompiledWorkflowInputs(
  plan: CompiledWorkflowPlan,
  privateState: CompiledWorkflowPlanPrivateState,
  value: unknown
): Readonly<Record<string, JsonValue>> {
  const bounded = snapshotBoundedWorkflowProviderEnvelope(value, MAX_INPUT_BYTES)
  if (bounded === undefined || bounded === null || typeof bounded !== "object" || arrayIsArray(bounded)) {
    throw new TypeError("Compiled workflow input must be a bounded ordinary JSON object.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(bounded)
  const keys = reflectOwnKeys(descriptors)
  const raw = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") throw new TypeError("Compiled workflow input contains an invalid key.")
    if (!hasInput(plan, key)) throw new TypeError("Compiled workflow input contains an unknown field.")
    raw[key] = descriptorValue(descriptors[key])
  }

  const accepted = objectCreate(null) as Record<string, JsonValue>
  for (let index = 0; index < plan.workflow.inputs.length; index += 1) {
    const definition = plan.workflow.inputs[index]
    let candidate: unknown
    if (objectHasOwn(raw, definition.id)) candidate = raw[definition.id]
    else if (objectHasOwn(definition, "default")) candidate = definition.default
    else continue
    const validated = validateLocalJsonSchemaViewValue({
      compiled: findCompiledSchema(privateState, definition.schema),
      value: candidate,
      diagnosticCode: "WF2_PROVIDER_INPUT_INVALID",
      location: objectFreeze({ path: "workflow.yaml", pointer: `/inputs/${index}` })
    })
    if (!validated.ok) throw new TypeError("Compiled workflow input failed its schema validation.")
    accepted[definition.id] = validated.value
  }

  const frozen = objectFreeze(accepted)
  const emptyOutputs = objectFreeze(objectCreate(null) as JsonObject)
  for (let index = 0; index < plan.workflow.inputs.length; index += 1) {
    const definition = plan.workflow.inputs[index]
    const required = definition.required || (
      definition.requiredWhenPredicate !== undefined
      && evaluateCompiledPredicateRecord(
        plan,
        definition.requiredWhenPredicate,
        "entry",
        "inputRequiredWhen",
        index,
        { input: frozen, outputs: emptyOutputs as Record<string, JsonValue> }
      )
    )
    if (required && !objectHasOwn(frozen, definition.id)) {
      throw new TypeError("Compiled workflow input is required.")
    }
  }
  return frozen
}

export function assertCompiledRequiredArtifactSupport(plan: CompiledWorkflowPlan): void {
  for (let index = 0; index < plan.requiredArtifacts.length; index += 1) {
    const artifact = plan.requiredArtifacts[index]
    if (!artifact.required) continue
    const stepIndex = findCompiledStepIndex(plan.workflow.steps, artifact.producedBy)
    if (stepIndex < 0) throw new TypeError("Compiled workflow required artifact producer is unavailable.")
    const step = plan.workflow.steps[stepIndex]
    if (!contains(step.type === "manual" ? [] : step.artifacts, artifact.id)) {
      throw new TypeError("Compiled workflow required artifact is not declared by its producer step.")
    }
    if (artifact.owner === "runtime") {
      throw new TypeError("Compiled workflow required runtime artifact publication is unsupported in R4.")
    }
    if (step.type !== "command") {
      throw new TypeError("Compiled workflow provider-owned artifact requires a command step.")
    }
    const provider = providerById(plan, step.provider)
    if (provider.sideEffect !== "workspace-write") {
      throw new TypeError("Compiled workflow provider-owned artifact requires workspace-write authority.")
    }
  }
}

export function compiledEntryPredicateAllows(
  plan: CompiledWorkflowPlan,
  step: CompiledWorkflowStep,
  stepIndex: number,
  context: CompiledRuntimeContext
): boolean {
  if (step.entryPredicate === undefined) return true
  return evaluateCompiledPredicateRecord(
    plan,
    step.entryPredicate,
    "entry",
    "stepEntry",
    stepIndex,
    context
  )
}

export function evaluateCompiledPredicateRecord(
  plan: CompiledWorkflowPlan,
  index: number,
  phase: "entry" | "postCommit",
  placementKind: "inputRequiredWhen" | "stepEntry" | "stepTransition",
  placementIndex: number,
  context: CompiledRuntimeContext
): boolean {
  const record = plan.predicates[index]
  if (record === undefined || record.phase !== phase || typeof record.placement !== "object" || record.placement === null) {
    throw new TypeError("Compiled workflow predicate evidence is invalid.")
  }
  const placement = record.placement as Record<string, unknown>
  const actualIndex = placementKind === "inputRequiredWhen" ? placement.inputIndex : placement.stepIndex
  if (placement.kind !== placementKind || actualIndex !== placementIndex) {
    throw new TypeError("Compiled workflow predicate placement is invalid.")
  }
  return evaluateWorkflowPredicate(record.predicate as CompiledWorkflowPredicate, {
    inputs: context.input,
    committedOutputs: context.outputs
  })
}

export function snapshotCompiledExecutionOptions(value: unknown): Readonly<CompiledWorkflowExecutionOptions> {
  if (value === null || typeof value !== "object" || isProxy(value) || objectGetPrototypeOf(value) !== objectPrototype) {
    throw new TypeError("Compiled workflow execution options must be an ordinary record.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const result: { executionMode?: "full" | "singleStep"; stepId?: string; allowOutOfOrder?: boolean } = {}
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (key !== "executionMode" && key !== "stepId" && key !== "allowOutOfOrder") {
      throw new TypeError("Compiled workflow execution options contain an unknown field.")
    }
    const item = descriptorValue(descriptors[key])
    if (key === "executionMode") {
      if (item !== "full" && item !== "singleStep") throw new TypeError("Compiled workflow execution mode is invalid.")
      result.executionMode = item
    } else if (key === "stepId") {
      if (typeof item !== "string") throw new TypeError("Compiled workflow execution step id is invalid.")
      result.stepId = item
    } else {
      if (typeof item !== "boolean") throw new TypeError("Compiled workflow allowOutOfOrder is invalid.")
      result.allowOutOfOrder = item
    }
  }
  return objectFreeze(result)
}

export function compiledStartIndex(
  plan: CompiledWorkflowPlan,
  options: Readonly<CompiledWorkflowExecutionOptions>
): number {
  if (options.executionMode !== "singleStep") return 0
  if (options.stepId === undefined || reflectApply(regexpExec, STEP_ID_PATTERN, [options.stepId]) === null) {
    throw new TypeError("Compiled single-step execution requires a valid step id.")
  }
  const index = findCompiledStepIndex(plan.workflow.steps, options.stepId)
  if (index < 0) throw new TypeError("Compiled single-step target is unavailable.")
  if (index > 0 && options.allowOutOfOrder !== true) {
    throw new TypeError("Compiled single-step execution is blocked by earlier incomplete steps.")
  }
  return index
}

function providerById(plan: CompiledWorkflowPlan, id: string): CompiledWorkflowPlan["providerBindings"][number] {
  for (let index = 0; index < plan.providerBindings.length; index += 1) {
    if (plan.providerBindings[index].id === id) return plan.providerBindings[index]
  }
  throw new TypeError("Compiled workflow artifact provider is unavailable.")
}

function hasInput(plan: CompiledWorkflowPlan, id: string): boolean {
  for (let index = 0; index < plan.workflow.inputs.length; index += 1) {
    if (plan.workflow.inputs[index].id === id) return true
  }
  return false
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function descriptorValue(descriptor: PropertyDescriptor | undefined): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError("Compiled workflow data property is invalid.")
  return descriptor.value
}
