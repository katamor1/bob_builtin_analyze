import { types as utilTypes } from "node:util"

import { canonicalJsonBytes, canonicalJsonText } from "./canonicalJson"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic,
  type WorkflowContractV2DiagnosticLocation
} from "./diagnostics"
import {
  inspectLocalJsonSchemaInstancePointer,
  type CompiledLocalJsonSchema,
  type LocalJsonSchemaInstanceKind
} from "./jsonSchema"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

export type CompiledWorkflowValueReference =
  | { readonly source: "input"; readonly id: string; readonly pointer: string }
  | { readonly source: "committedOutput"; readonly id: string; readonly pointer: string }

export type CompiledWorkflowPredicate =
  | {
      readonly kind:
        | "equals"
        | "notEquals"
        | "greaterThan"
        | "greaterThanOrEqual"
        | "lessThan"
        | "lessThanOrEqual"
      readonly left: CompiledWorkflowValueReference
      readonly right: JsonValue
    }
  | {
      readonly kind: "in"
      readonly left: CompiledWorkflowValueReference
      readonly right: readonly JsonValue[]
    }
  | { readonly kind: "exists"; readonly left: CompiledWorkflowValueReference }
  | { readonly kind: "all"; readonly predicates: readonly CompiledWorkflowPredicate[] }
  | { readonly kind: "any"; readonly predicates: readonly CompiledWorkflowPredicate[] }
  | { readonly kind: "not"; readonly predicate: CompiledWorkflowPredicate }

export type WorkflowPredicatePlacement =
  | { readonly kind: "inputRequiredWhen"; readonly inputIndex: number }
  | { readonly kind: "stepEntry"; readonly stepIndex: number }
  | { readonly kind: "stepTransition"; readonly stepIndex: number }

export interface WorkflowPredicateInputSchemaBinding {
  readonly id: string
  readonly schemaId: string
  readonly schema: CompiledLocalJsonSchema
}

export type WorkflowPredicateStepSchemaBinding =
  | { readonly kind: "noValue" }
  | {
      readonly kind: "value"
      readonly id: string
      readonly schemaId: string
      readonly schema: CompiledLocalJsonSchema
    }

export interface WorkflowPredicateSchemaEnvironment {
  readonly inputs: readonly WorkflowPredicateInputSchemaBinding[]
  readonly steps: readonly WorkflowPredicateStepSchemaBinding[]
}

export interface CompileWorkflowPredicateInput {
  readonly predicate: unknown
  readonly placement: WorkflowPredicatePlacement
  readonly schemas: WorkflowPredicateSchemaEnvironment
  readonly location: WorkflowContractV2DiagnosticLocation
}

export type CompileWorkflowPredicateResult =
  | {
      readonly ok: true
      readonly predicate: CompiledWorkflowPredicate
      readonly diagnostics: readonly []
    }
  | { readonly ok: false; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] }

type UnknownRecord = Readonly<Record<string, unknown>>

interface EnvironmentState {
  readonly inputs: ReadonlyMap<string, CompiledLocalJsonSchema>
  readonly outputs: ReadonlyMap<string, {
    readonly stepIndex: number
    readonly schema: CompiledLocalJsonSchema
  }>
  readonly inputCount: number
  readonly stepCount: number
}

interface PredicateStackEntry {
  readonly value: unknown
  readonly pointer: string
  readonly depth: number
  readonly leave: boolean
}

interface JsonStackEntry {
  readonly value: unknown
  readonly depth: number
  readonly leave: boolean
}

class PredicateFailure extends Error {
  constructor(readonly pointer: string) {
    super("Workflow predicate is invalid.")
  }
}

const isProxy = utilTypes.isProxy
const canonicalJsonBytesCaptured = canonicalJsonBytes
const canonicalJsonTextCaptured = canonicalJsonText
const cloneAndFreezeJsonValueCaptured = cloneAndFreezeJsonValue
const createDiagnostic = createWorkflowContractV2Diagnostic
const inspectSchemaPointer = inspectLocalJsonSchemaInstancePointer
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const mapGet = Map.prototype.get
const mapHas = Map.prototype.has
const mapSet = Map.prototype.set
const MapConstructor = Map
const numberIsFinite = Number.isFinite
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectDefineProperty = Object.defineProperty
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectIs = Object.is
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const stringCharCodeAt = String.prototype.charCodeAt
const stringFromCharCode = String.fromCharCode
const stringSlice = String.prototype.slice
const weakSetAdd = WeakSet.prototype.add
const weakSetDelete = WeakSet.prototype.delete
const weakSetHas = WeakSet.prototype.has
const WeakSetConstructor = WeakSet
const TypeErrorConstructor = TypeError

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const COMPILE_FIELDS = objectFreeze(["predicate", "placement", "schemas", "location"] as const)
const ENVIRONMENT_FIELDS = objectFreeze(["inputs", "steps"] as const)
const INPUT_BINDING_FIELDS = objectFreeze(["id", "schemaId", "schema"] as const)
const NO_VALUE_BINDING_FIELDS = objectFreeze(["kind"] as const)
const VALUE_BINDING_FIELDS = objectFreeze(["kind", "id", "schemaId", "schema"] as const)
const INPUT_PLACEMENT_FIELDS = objectFreeze(["kind", "inputIndex"] as const)
const STEP_PLACEMENT_FIELDS = objectFreeze(["kind", "stepIndex"] as const)
const REFERENCE_FIELDS = objectFreeze(["source", "id", "pointer"] as const)
const BINARY_FIELDS = objectFreeze(["kind", "left", "right"] as const)
const EXISTS_FIELDS = objectFreeze(["kind", "left"] as const)
const BOOLEAN_FIELDS = objectFreeze(["kind", "predicates"] as const)
const NOT_FIELDS = objectFreeze(["kind", "predicate"] as const)
const CONTEXT_FIELDS = objectFreeze(["inputs", "committedOutputs"] as const)
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []
const FALLBACK_LOCATION = objectFreeze({ path: "workflow.yaml", pointer: "" })
const MAX_PREDICATE_DEPTH = 32
const MAX_PREDICATE_NODES = 1_024
const MAX_BOOLEAN_CHILDREN = 128
const MAX_IN_MEMBERS = 256
const MAX_LITERAL_BYTES = 262_144
const MAX_LITERAL_DEPTH = 64
const MAX_LITERAL_NODES = 65_536

export function compileWorkflowPredicate(
  input: CompileWorkflowPredicateInput
): CompileWorkflowPredicateResult {
  let baseLocation: WorkflowContractV2DiagnosticLocation = FALLBACK_LOCATION
  try {
    const outer = snapshotExactRecord(input, COMPILE_FIELDS, "")
    baseLocation = snapshotBaseLocation(outer.location)
    let environment: EnvironmentState
    try {
      environment = snapshotEnvironment(outer.schemas)
    } catch {
      predicateFail("")
    }
    let placement: WorkflowPredicatePlacement
    try {
      placement = snapshotPlacement(outer.placement, environment)
    } catch {
      predicateFail("")
    }
    preflightPredicate(outer.predicate)
    const predicate = cloneAndFreezeJsonValueCaptured(outer.predicate)
    validatePredicateNode(predicate, "", placement, environment)
    return objectFreeze({
      ok: true,
      predicate: predicate as CompiledWorkflowPredicate,
      diagnostics: EMPTY_DIAGNOSTICS
    })
  } catch (error) {
    const pointer = error instanceof PredicateFailure ? error.pointer : ""
    return predicateFailure(baseLocation, pointer)
  }
}

export function evaluateWorkflowPredicate(
  predicate: CompiledWorkflowPredicate,
  context: {
    readonly inputs: Readonly<Record<string, JsonValue>>
    readonly committedOutputs: Readonly<Record<string, JsonValue>>
  }
): boolean {
  try {
    if (predicate === null || typeof predicate !== "object" || isProxy(predicate)) {
      throw new TypeErrorConstructor("Compiled workflow predicate is invalid.")
    }
    const snapshot = snapshotExactRecord(context, CONTEXT_FIELDS, "")
    const raw = objectCreate(null) as Record<string, unknown>
    defineRecordItem(raw, "inputs", snapshot.inputs)
    defineRecordItem(raw, "committedOutputs", snapshot.committedOutputs)
    const cloned = cloneAndFreezeJsonValueCaptured(raw)
    if (!isJsonRecord(cloned) || !isJsonRecord(cloned.inputs) || !isJsonRecord(cloned.committedOutputs)) {
      throw new TypeErrorConstructor("Workflow predicate evaluation context is invalid.")
    }
    return evaluatePredicateNode(predicate, {
      inputs: cloned.inputs,
      committedOutputs: cloned.committedOutputs
    })
  } catch {
    throw new TypeErrorConstructor("Workflow predicate evaluation context is invalid.")
  }
}

function evaluatePredicateNode(
  predicate: CompiledWorkflowPredicate,
  context: {
    readonly inputs: Readonly<Record<string, JsonValue>>
    readonly committedOutputs: Readonly<Record<string, JsonValue>>
  }
): boolean {
  if (predicate.kind === "all") {
    for (let index = 0; index < predicate.predicates.length; index += 1) {
      if (!evaluatePredicateNode(predicate.predicates[index], context)) return false
    }
    return true
  }
  if (predicate.kind === "any") {
    for (let index = 0; index < predicate.predicates.length; index += 1) {
      if (evaluatePredicateNode(predicate.predicates[index], context)) return true
    }
    return false
  }
  if (predicate.kind === "not") return !evaluatePredicateNode(predicate.predicate, context)

  const resolved = resolveValue(predicate.left, context)
  if (predicate.kind === "exists") return resolved.found
  if (!resolved.found) return false
  if (predicate.kind === "equals" || predicate.kind === "notEquals") {
    const equal = canonicalJsonTextCaptured(resolved.value) === canonicalJsonTextCaptured(predicate.right)
    return predicate.kind === "equals" ? equal : !equal
  }
  if (predicate.kind === "in") {
    const actual = canonicalJsonTextCaptured(resolved.value)
    for (let index = 0; index < predicate.right.length; index += 1) {
      if (canonicalJsonTextCaptured(predicate.right[index]) === actual) return true
    }
    return false
  }
  if (typeof resolved.value === "number" && typeof predicate.right === "number") {
    if (predicate.kind === "greaterThan") return resolved.value > predicate.right
    if (predicate.kind === "greaterThanOrEqual") return resolved.value >= predicate.right
    if (predicate.kind === "lessThan") return resolved.value < predicate.right
    return resolved.value <= predicate.right
  }
  if (typeof resolved.value === "string" && typeof predicate.right === "string") {
    if (predicate.kind === "greaterThan") return resolved.value > predicate.right
    if (predicate.kind === "greaterThanOrEqual") return resolved.value >= predicate.right
    if (predicate.kind === "lessThan") return resolved.value < predicate.right
    return resolved.value <= predicate.right
  }
  return false
}

function snapshotBaseLocation(value: unknown): WorkflowContractV2DiagnosticLocation {
  return createDiagnostic({
    code: "WF2_PREDICATE_INVALID",
    severity: "error",
    message: "Workflow predicate is invalid.",
    location: value as WorkflowContractV2DiagnosticLocation
  }).location
}

function snapshotEnvironment(value: unknown): EnvironmentState {
  const record = snapshotExactRecord(value, ENVIRONMENT_FIELDS, "")
  const inputValues = snapshotDenseArray(record.inputs, 0, 256, "")
  const stepValues = snapshotDenseArray(record.steps, 1, 512, "")
  const inputs = new MapConstructor<string, CompiledLocalJsonSchema>()
  const outputs = new MapConstructor<string, { readonly stepIndex: number; readonly schema: CompiledLocalJsonSchema }>()

  for (let index = 0; index < inputValues.length; index += 1) {
    const binding = snapshotExactRecord(inputValues[index], INPUT_BINDING_FIELDS, "")
    const id = requireIdentifier(binding.id, "")
    const schemaId = requireString(binding.schemaId, "")
    const schema = requireCompiledSchema(binding.schema, schemaId)
    if (callMapHas(inputs, id)) predicateFail("")
    callMapSet(inputs, id, schema)
  }
  for (let index = 0; index < stepValues.length; index += 1) {
    const loose = snapshotLooseRecord(stepValues[index], "")
    if (loose.kind === "noValue") {
      assertExactKeys(loose, NO_VALUE_BINDING_FIELDS, "")
      continue
    }
    if (loose.kind !== "value") predicateFail("")
    assertExactKeys(loose, VALUE_BINDING_FIELDS, "")
    const id = requireIdentifier(loose.id, "")
    const schemaId = requireString(loose.schemaId, "")
    const schema = requireCompiledSchema(loose.schema, schemaId)
    if (callMapHas(outputs, id)) predicateFail("")
    callMapSet(outputs, id, objectFreeze({ stepIndex: index, schema }))
  }
  return objectFreeze({ inputs, outputs, inputCount: inputValues.length, stepCount: stepValues.length })
}

function requireCompiledSchema(value: unknown, schemaId: string): CompiledLocalJsonSchema {
  if (value === null || typeof value !== "object") predicateFail("")
  let root
  try {
    root = inspectSchemaPointer({ compiled: value as CompiledLocalJsonSchema, pointer: "" })
  } catch {
    predicateFail("")
  }
  if (!root.ok || (value as CompiledLocalJsonSchema).evidence.rootId !== schemaId) predicateFail("")
  return value as CompiledLocalJsonSchema
}

function snapshotPlacement(value: unknown, environment: EnvironmentState): WorkflowPredicatePlacement {
  const loose = snapshotLooseRecord(value, "")
  if (loose.kind === "inputRequiredWhen") {
    assertExactKeys(loose, INPUT_PLACEMENT_FIELDS, "")
    const inputIndex = requireIndex(loose.inputIndex, environment.inputCount)
    return objectFreeze({ kind: "inputRequiredWhen", inputIndex })
  }
  if (loose.kind === "stepEntry" || loose.kind === "stepTransition") {
    assertExactKeys(loose, STEP_PLACEMENT_FIELDS, "")
    const stepIndex = requireIndex(loose.stepIndex, environment.stepCount)
    return objectFreeze({ kind: loose.kind, stepIndex })
  }
  predicateFail("")
}

function preflightPredicate(root: unknown): void {
  const stack: PredicateStackEntry[] = []
  const active = new WeakSetConstructor<object>()
  appendArrayItem(stack, { value: root, pointer: "", depth: 1, leave: false })
  let nodes = 0
  let literalBytes = 0

  while (stack.length > 0) {
    const entry = stack[stack.length - 1]
    stack.length -= 1
    if (entry.leave) {
      if (entry.value !== null && typeof entry.value === "object") callWeakSetDelete(active, entry.value)
      continue
    }
    nodes += 1
    if (nodes > MAX_PREDICATE_NODES || entry.depth > MAX_PREDICATE_DEPTH) predicateFail(entry.pointer)
    if (entry.value === null || typeof entry.value !== "object" || isProxy(entry.value)) predicateFail(entry.pointer)
    if (callWeakSetHas(active, entry.value)) predicateFail(entry.pointer)
    callWeakSetAdd(active, entry.value)
    appendArrayItem(stack, { ...entry, leave: true })

    const record = snapshotLooseRecord(entry.value, entry.pointer)
    const kind = record.kind
    if (kind === "all" || kind === "any") {
      assertExactKeys(record, BOOLEAN_FIELDS, entry.pointer)
      const childrenPointer = `${entry.pointer}/predicates`
      const children = snapshotDenseArray(record.predicates, 1, MAX_BOOLEAN_CHILDREN, childrenPointer)
      for (let index = children.length - 1; index >= 0; index -= 1) {
        appendArrayItem(stack, {
          value: children[index],
          pointer: `${childrenPointer}/${numberAsString(index)}`,
          depth: entry.depth + 1,
          leave: false
        })
      }
      continue
    }
    if (kind === "not") {
      assertExactKeys(record, NOT_FIELDS, entry.pointer)
      appendArrayItem(stack, {
        value: record.predicate,
        pointer: `${entry.pointer}/predicate`,
        depth: entry.depth + 1,
        leave: false
      })
      continue
    }
    if (kind === "exists") {
      assertExactKeys(record, EXISTS_FIELDS, entry.pointer)
      preflightReference(record.left, `${entry.pointer}/left`)
      continue
    }
    if (
      kind !== "equals"
      && kind !== "notEquals"
      && kind !== "in"
      && kind !== "greaterThan"
      && kind !== "greaterThanOrEqual"
      && kind !== "lessThan"
      && kind !== "lessThanOrEqual"
    ) predicateFail(`${entry.pointer}/kind`)
    assertExactKeys(record, BINARY_FIELDS, entry.pointer)
    preflightReference(record.left, `${entry.pointer}/left`)
    if (kind === "in") {
      const members = snapshotDenseArray(record.right, 1, MAX_IN_MEMBERS, `${entry.pointer}/right`)
      let rightBytes = members.length + 1
      for (let index = 0; index < members.length; index += 1) {
        preflightJsonLiteral(members[index], `${entry.pointer}/right/${numberAsString(index)}`)
        rightBytes += canonicalJsonBytesCaptured(members[index]).length
        if (literalBytes + rightBytes > MAX_LITERAL_BYTES) predicateFail("")
      }
      literalBytes += rightBytes
    } else {
      preflightJsonLiteral(record.right, `${entry.pointer}/right`)
      literalBytes += canonicalJsonBytesCaptured(record.right).length
      if (literalBytes > MAX_LITERAL_BYTES) predicateFail("")
    }
  }
}

function preflightReference(value: unknown, pointer: string): void {
  const record = snapshotExactRecord(value, REFERENCE_FIELDS, pointer)
  if (record.source !== "input" && record.source !== "committedOutput") predicateFail(`${pointer}/source`)
  requireIdentifier(record.id, `${pointer}/id`)
  if (typeof record.pointer !== "string" || !isCanonicalJsonPointer(record.pointer)) {
    predicateFail(`${pointer}/pointer`)
  }
}

function preflightJsonLiteral(root: unknown, pointer: string): void {
  const stack: JsonStackEntry[] = []
  const active = new WeakSetConstructor<object>()
  appendArrayItem(stack, { value: root, depth: 1, leave: false })
  let nodes = 0
  while (stack.length > 0) {
    const entry = stack[stack.length - 1]
    stack.length -= 1
    if (entry.leave) {
      if (entry.value !== null && typeof entry.value === "object") callWeakSetDelete(active, entry.value)
      continue
    }
    nodes += 1
    if (nodes > MAX_LITERAL_NODES || entry.depth > MAX_LITERAL_DEPTH) predicateFail(pointer)
    const value = entry.value
    if (value === null || typeof value === "boolean") continue
    if (typeof value === "string") {
      if (!hasWellFormedUnicode(value)) predicateFail(pointer)
      continue
    }
    if (typeof value === "number") {
      if (!numberIsFinite(value) || objectIs(value, -0)) predicateFail(pointer)
      continue
    }
    if (typeof value !== "object" || isProxy(value)) predicateFail(pointer)
    if (callWeakSetHas(active, value)) predicateFail(pointer)
    callWeakSetAdd(active, value)
    appendArrayItem(stack, { value, depth: entry.depth, leave: true })
    const children = arrayIsArray(value)
      ? snapshotDenseArray(value, 0, MAX_LITERAL_NODES, pointer)
      : snapshotJsonObjectValues(value, pointer)
    for (let index = children.length - 1; index >= 0; index -= 1) {
      appendArrayItem(stack, { value: children[index], depth: entry.depth + 1, leave: false })
    }
  }
}

function validatePredicateNode(
  value: JsonValue,
  pointer: string,
  placement: WorkflowPredicatePlacement,
  environment: EnvironmentState
): void {
  const record = value as Readonly<Record<string, JsonValue>>
  if (record.kind === "all" || record.kind === "any") {
    const children = record.predicates as readonly JsonValue[]
    for (let index = 0; index < children.length; index += 1) {
      validatePredicateNode(children[index], `${pointer}/predicates/${numberAsString(index)}`, placement, environment)
    }
    return
  }
  if (record.kind === "not") {
    validatePredicateNode(record.predicate, `${pointer}/predicate`, placement, environment)
    return
  }
  const reference = record.left as CompiledWorkflowValueReference
  const resolution = inspectReference(reference, placement, environment)
  if (resolution.kind === "missing") predicateFail(`${pointer}/left/id`)
  if (resolution.kind === "unresolved") predicateFail(`${pointer}/left/pointer`)
  if (
    record.kind === "greaterThan"
    || record.kind === "greaterThanOrEqual"
    || record.kind === "lessThan"
    || record.kind === "lessThanOrEqual"
  ) {
    const right = record.right
    if (typeof right === "number") {
      if (resolution.kinds.length !== 1 || resolution.kinds[0] !== "number") {
        predicateFail(resolution.kinds.length === 1 ? `${pointer}/right` : `${pointer}/left/pointer`)
      }
    } else if (typeof right === "string") {
      if (resolution.kinds.length !== 1 || resolution.kinds[0] !== "string") {
        predicateFail(resolution.kinds.length === 1 ? `${pointer}/right` : `${pointer}/left/pointer`)
      }
    } else {
      predicateFail(`${pointer}/right`)
    }
  }
}

function inspectReference(
  reference: CompiledWorkflowValueReference,
  placement: WorkflowPredicatePlacement,
  environment: EnvironmentState
):
  | { readonly kind: "missing" }
  | { readonly kind: "unresolved" }
  | { readonly kind: "ok"; readonly kinds: readonly LocalJsonSchemaInstanceKind[] } {
  let schema: CompiledLocalJsonSchema | undefined
  if (reference.source === "input") {
    schema = callMapGet(environment.inputs, reference.id)
  } else if (placement.kind !== "inputRequiredWhen") {
    const output = callMapGet(environment.outputs, reference.id)
    if (output !== undefined) {
      const visible = placement.kind === "stepTransition"
        ? output.stepIndex <= placement.stepIndex
        : output.stepIndex < placement.stepIndex
      if (visible) schema = output.schema
    }
  }
  if (schema === undefined) return { kind: "missing" }
  let inspected
  try {
    inspected = inspectSchemaPointer({ compiled: schema, pointer: reference.pointer })
  } catch {
    return { kind: "unresolved" }
  }
  return inspected.ok ? { kind: "ok", kinds: inspected.kinds } : { kind: "unresolved" }
}

function snapshotExactRecord(
  value: unknown,
  fields: readonly string[],
  pointer: string
): UnknownRecord {
  const record = snapshotLooseRecord(value, pointer)
  assertExactKeys(record, fields, pointer)
  return record
}

function snapshotLooseRecord(value: unknown, pointer: string): UnknownRecord {
  if (value === null || typeof value !== "object" || isProxy(value)) predicateFail(pointer)
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) predicateFail(pointer)
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const keys = reflectOwnKeys(descriptors)
  const snapshot: Record<string, unknown> = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") predicateFail(pointer)
    const descriptor = descriptorMapValue(descriptors, key, pointer)
    if (!isEnumerableDataDescriptor(descriptor)) predicateFail(`${pointer}/${escapePointer(key)}`)
    defineRecordItem(snapshot, key, descriptor.value)
  }
  return objectFreeze(snapshot)
}

function assertExactKeys(record: UnknownRecord, fields: readonly string[], pointer: string): void {
  const keys = objectKeys(record)
  for (let index = 0; index < keys.length; index += 1) {
    if (!contains(fields, keys[index])) predicateFail(`${pointer}/${escapePointer(keys[index])}`)
  }
  for (let index = 0; index < fields.length; index += 1) {
    if (!objectHasOwn(record, fields[index])) predicateFail(`${pointer}/${fields[index]}`)
  }
}

function snapshotDenseArray(
  value: unknown,
  minimum: number,
  maximum: number,
  pointer: string
): readonly unknown[] {
  if (value === null || typeof value !== "object" || isProxy(value) || !arrayIsArray(value)) predicateFail(pointer)
  if (objectGetPrototypeOf(value) !== arrayPrototype) predicateFail(pointer)
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const lengthDescriptor = descriptorMapValue(descriptors, "length", pointer)
  if (!isDataDescriptor(lengthDescriptor)) predicateFail(pointer)
  const length = lengthDescriptor.value
  if (!numberIsSafeInteger(length) || length < minimum || length > maximum) predicateFail(pointer)
  const ownKeys = reflectOwnKeys(descriptors)
  if (ownKeys.length !== length + 1) predicateFail(pointer)
  const result: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const key = numberAsString(index)
    const descriptor = descriptorMapValue(descriptors, key, pointer)
    if (!isEnumerableDataDescriptor(descriptor)) predicateFail(pointer)
    appendArrayItem(result, descriptor.value)
  }
  return objectFreeze(result)
}

function snapshotJsonObjectValues(value: object, pointer: string): readonly unknown[] {
  if (isProxy(value)) predicateFail(pointer)
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) predicateFail(pointer)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const values: unknown[] = []
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !hasWellFormedUnicode(key)) predicateFail(pointer)
    const descriptor = descriptorMapValue(descriptors, key, pointer)
    if (!isEnumerableDataDescriptor(descriptor)) predicateFail(pointer)
    appendArrayItem(values, descriptor.value)
  }
  return objectFreeze(values)
}

function descriptorMapValue(
  descriptors: PropertyDescriptorMap,
  key: PropertyKey,
  pointer: string
): PropertyDescriptor {
  const holder = objectGetOwnPropertyDescriptor(descriptors, key)
  if (holder === undefined || !objectHasOwn(holder, "value")) predicateFail(pointer)
  return holder.value as PropertyDescriptor
}

function isDataDescriptor(descriptor: PropertyDescriptor): boolean {
  return objectHasOwn(descriptor, "value")
    && !objectHasOwn(descriptor, "get")
    && !objectHasOwn(descriptor, "set")
}

function isEnumerableDataDescriptor(descriptor: PropertyDescriptor): boolean {
  return isDataDescriptor(descriptor) && descriptor.enumerable === true
}

function requireIdentifier(value: unknown, pointer: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > 128
    || reflectApply(regexpExec, IDENTIFIER_PATTERN, [value]) === null
  ) predicateFail(pointer)
  return value
}

function requireString(value: unknown, pointer: string): string {
  if (typeof value !== "string" || !hasWellFormedUnicode(value)) predicateFail(pointer)
  return value
}

function requireIndex(value: unknown, length: number): number {
  if (typeof value !== "number" || !numberIsSafeInteger(value) || value < 0 || value >= length) predicateFail("")
  return value
}

function resolveValue(
  reference: CompiledWorkflowValueReference,
  context: {
    readonly inputs: Readonly<Record<string, JsonValue>>
    readonly committedOutputs: Readonly<Record<string, JsonValue>>
  }
): { readonly found: true; readonly value: JsonValue } | { readonly found: false } {
  const source = reference.source === "input" ? context.inputs : context.committedOutputs
  if (!objectHasOwn(source, reference.id)) return { found: false }
  let value: JsonValue = source[reference.id]
  const tokens = decodePointer(reference.pointer)
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (arrayIsArray(value)) {
      const arrayIndex = canonicalArrayIndex(token)
      if (arrayIndex === undefined || arrayIndex >= value.length) return { found: false }
      value = value[arrayIndex]
    } else if (isJsonRecord(value) && objectHasOwn(value, token)) {
      value = value[token]
    } else {
      return { found: false }
    }
  }
  return { found: true, value }
}

function decodePointer(pointer: string): readonly string[] {
  if (pointer.length === 0) return EMPTY_DIAGNOSTICS
  const tokens: string[] = []
  let token = ""
  for (let index = 1; index <= pointer.length; index += 1) {
    if (index === pointer.length || callCharCodeAt(pointer, index) === 0x2f) {
      appendArrayItem(tokens, token)
      token = ""
      continue
    }
    const code = callCharCodeAt(pointer, index)
    if (code === 0x7e) {
      const escaped = callCharCodeAt(pointer, index + 1)
      token += escaped === 0x30 ? "~" : "/"
      index += 1
    } else {
      token += reflectApply(stringFromCharCode, undefined, [code]) as string
    }
  }
  return objectFreeze(tokens)
}

function isCanonicalJsonPointer(value: string): boolean {
  if (!hasWellFormedUnicode(value)) return false
  if (value.length > 0 && callCharCodeAt(value, 0) !== 0x2f) return false
  for (let index = 0; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) return false
    if (code === 0x7e) {
      if (index + 1 >= value.length) return false
      const escaped = callCharCodeAt(value, index + 1)
      if (escaped !== 0x30 && escaped !== 0x31) return false
      index += 1
    }
  }
  return true
}

function canonicalArrayIndex(value: string): number | undefined {
  if (value.length === 0 || (value.length > 1 && callCharCodeAt(value, 0) === 0x30)) return undefined
  let result = 0
  for (let index = 0; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (code < 0x30 || code > 0x39) return undefined
    result = result * 10 + code - 0x30
    if (!numberIsSafeInteger(result)) return undefined
  }
  return result
}

function hasWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false
      const next = callCharCodeAt(value, index + 1)
      if (next < 0xdc00 || next > 0xdfff) return false
      index += 1
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

function predicateFailure(
  base: WorkflowContractV2DiagnosticLocation,
  relativePointer: string
): CompileWorkflowPredicateResult {
  let diagnostic: WorkflowContractV2Diagnostic
  try {
    diagnostic = createDiagnostic({
      code: "WF2_PREDICATE_INVALID",
      severity: "error",
      message: "Workflow predicate is invalid.",
      location: { path: base.path, pointer: `${base.pointer}${relativePointer}` }
    })
  } catch {
    diagnostic = createDiagnostic({
      code: "WF2_PREDICATE_INVALID",
      severity: "error",
      message: "Workflow predicate is invalid.",
      location: FALLBACK_LOCATION
    })
  }
  return objectFreeze({ ok: false, diagnostics: objectFreeze([diagnostic]) })
}

function predicateFail(pointer: string): never {
  throw new PredicateFailure(pointer)
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

function escapePointer(value: string): string {
  let result = ""
  for (let index = 0; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (code === 0x7e) result += "~0"
    else if (code === 0x2f) result += "~1"
    else result += reflectApply(stringSlice, value, [index, index + 1]) as string
  }
  return result
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function callCharCodeAt(value: string, index: number): number {
  return reflectApply(stringCharCodeAt, value, [index]) as number
}

function callMapGet<K, V>(map: ReadonlyMap<K, V>, key: K): V | undefined {
  return reflectApply(mapGet, map, [key]) as V | undefined
}

function callMapHas<K, V>(map: ReadonlyMap<K, V>, key: K): boolean {
  return reflectApply(mapHas, map, [key]) as boolean
}

function callMapSet<K, V>(map: Map<K, V>, key: K, value: V): void {
  reflectApply(mapSet, map, [key, value])
}

function callWeakSetHas(set: WeakSet<object>, value: object): boolean {
  return reflectApply(weakSetHas, set, [value]) as boolean
}

function callWeakSetAdd(set: WeakSet<object>, value: object): void {
  reflectApply(weakSetAdd, set, [value])
}

function callWeakSetDelete(set: WeakSet<object>, value: object): void {
  reflectApply(weakSetDelete, set, [value])
}

function appendArrayItem<T>(array: T[], value: T): void {
  objectDefineProperty(array, numberAsString(array.length), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function defineRecordItem(record: Record<string, unknown>, key: string, value: unknown): void {
  objectDefineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function isJsonRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !arrayIsArray(value)
}
