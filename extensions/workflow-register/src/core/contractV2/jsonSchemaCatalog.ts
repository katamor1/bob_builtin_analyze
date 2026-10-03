import { types as utilTypes } from "node:util"

import { canonicalJsonDigest } from "./canonicalJson"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic,
  type WorkflowContractV2DiagnosticCode,
  type WorkflowContractV2DiagnosticLocation
} from "./diagnostics"
import {
  compileLocalJsonSchema,
  inspectLocalJsonSchemaInstancePointer,
  validateLocalJsonSchemaValue,
  WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
  type CompiledLocalJsonSchema,
  type InspectLocalJsonSchemaInstancePointerResult,
  type LocalJsonSchemaEvidence,
  type LocalJsonSchemaSource,
  type ValidateLocalJsonSchemaValueResult
} from "./jsonSchema"
import { cloneAndFreezeJsonValue, type JsonObject, type JsonValue } from "./jsonValue"

export interface CompileLocalJsonSchemaCatalogInput {
  readonly rootIds: readonly string[]
  readonly schemas: readonly LocalJsonSchemaSource[]
  readonly diagnosticCode: WorkflowContractV2DiagnosticCode
  readonly location: WorkflowContractV2DiagnosticLocation
}

declare const compiledLocalJsonSchemaViewBrand: unique symbol
export interface CompiledLocalJsonSchemaView {
  readonly [compiledLocalJsonSchemaViewBrand]: true
  readonly evidence: LocalJsonSchemaEvidence
}

export interface CompiledLocalJsonSchemaViewRoot {
  readonly id: string
  readonly compiled: CompiledLocalJsonSchemaView
}

export type CompileLocalJsonSchemaCatalogResult =
  | {
      readonly ok: true
      readonly roots: readonly CompiledLocalJsonSchemaViewRoot[]
      readonly diagnostics: readonly []
    }
  | { readonly ok: false; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] }

interface ViewState {
  readonly base: CompiledLocalJsonSchema
  readonly key: string
  readonly prefix: string
  readonly dependencies: readonly string[]
  readonly sources: readonly LocalJsonSchemaSource[]
  readonly rootId: string
}

export interface LocalJsonSchemaPredicateBinding {
  readonly compiled: CompiledLocalJsonSchema
  readonly pointerPrefix: string
}

const isProxy = utilTypes.isProxy
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const arrayPop = Array.prototype.pop
const arrayPush = Array.prototype.push
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectCreate = Object.create
const objectDefineProperty = Object.defineProperty
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const stringCharCodeAt = String.prototype.charCodeAt
const stringIndexOf = String.prototype.indexOf
const stringSlice = String.prototype.slice
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, ViewState>, key: object
) => ViewState | undefined
const weakMapHas = Function.prototype.call.bind(WeakMap.prototype.has) as (
  map: WeakMap<object, ViewState>, key: object
) => boolean
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, ViewState>, key: object, value: ViewState
) => WeakMap<object, ViewState>
const INPUT_FIELDS = objectFreeze(["rootIds", "schemas", "diagnosticCode", "location"] as const)
const VIEW_INPUT_FIELDS = objectFreeze(["compiled", "pointer"] as const)
const DEPENDENCY_INPUT_FIELDS = objectFreeze(["compiled"] as const)
const VALIDATE_INPUT_FIELDS = objectFreeze(["compiled", "value", "diagnosticCode", "location"] as const)
const MAX_ROOTS = 510
const MAP_SCHEMA_KEYWORDS = objectFreeze([
  "$defs", "properties", "patternProperties", "dependentSchemas"
] as const)
const ARRAY_SCHEMA_KEYWORDS = objectFreeze(["prefixItems", "allOf", "anyOf", "oneOf"] as const)
const ONE_SCHEMA_KEYWORDS = objectFreeze([
  "items", "contains", "additionalProperties", "propertyNames", "if", "then", "else", "not",
  "unevaluatedItems", "unevaluatedProperties"
] as const)
// Match F3's sole-reference normalization; validation siblings are not flattened.
const REFERENCE_NON_VALIDATION_KEYWORDS = objectFreeze([
  "$ref", "$schema", "$id", "$defs", "$comment", "title", "description", "default",
  "deprecated", "readOnly", "writeOnly", "examples"
] as const)
const SYNTHETIC_ID = "__workflow-contract-v2-internal__/catalog"
const SOURCE_FIELDS = objectFreeze(["id", "schema", "location"] as const)
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []
const views = new WeakMap<object, ViewState>()

export function compileLocalJsonSchemaCatalog(
  input: CompileLocalJsonSchemaCatalogInput
): CompileLocalJsonSchemaCatalogResult {
  const snapshot = snapshotExactRecord(input, INPUT_FIELDS, "Local JSON Schema catalog-view input")
  const rootIds = snapshotRootIds(snapshot.rootIds)
  const schemas = snapshotSchemaSources(snapshot.schemas)
  const properties = objectCreate(null) as Record<string, JsonValue>
  const keys: string[] = []
  for (let index = 0; index < rootIds.length; index += 1) {
    const key = `root-${numberAsString(index)}`
    push(keys, key)
    defineRecord(properties, key, objectFreeze({ $ref: rootIds[index] }))
  }
  const syntheticSchema = objectFreeze({
    $schema: WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
    $id: SYNTHETIC_ID,
    type: "object",
    properties: objectFreeze(properties),
    additionalProperties: false
  })
  const sources: LocalJsonSchemaSource[] = []
  for (let index = 0; index < schemas.length; index += 1) push(sources, schemas[index])
  push(sources, objectFreeze({
    id: SYNTHETIC_ID,
    schema: syntheticSchema,
    location: snapshot.location as WorkflowContractV2DiagnosticLocation
  }))

  const baseResult = compileLocalJsonSchema({
    rootId: SYNTHETIC_ID,
    schemas: objectFreeze(sources),
    diagnosticCode: snapshot.diagnosticCode as WorkflowContractV2DiagnosticCode,
    location: snapshot.location as WorkflowContractV2DiagnosticLocation
  })
  if (!baseResult.ok) return baseResult

  const actualEvidence = withoutSyntheticEvidence(baseResult.compiled.evidence.schemas, SYNTHETIC_ID)
  const roots: CompiledLocalJsonSchemaViewRoot[] = []
  for (let index = 0; index < rootIds.length; index += 1) {
    const rootId = rootIds[index]
    if (!containsEvidence(actualEvidence, rootId)) {
      return failure(
        snapshot.diagnosticCode as WorkflowContractV2DiagnosticCode,
        snapshot.location as WorkflowContractV2DiagnosticLocation
      )
    }
    const evidence = objectFreeze({
      dialect: WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
      rootId,
      schemas: actualEvidence,
      catalogDigest: canonicalJsonDigest({
        dialect: WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT,
        rootId,
        schemas: actualEvidence
      })
    })
    const compiled = objectFreeze({ evidence }) as CompiledLocalJsonSchemaView
    weakMapSet(views, compiled, objectFreeze({
      base: baseResult.compiled,
      key: keys[index],
      prefix: `/${keys[index]}`,
      dependencies: collectDependencies(rootId, schemas),
      sources: schemas,
      rootId
    }))
    push(roots, objectFreeze({ id: rootId, compiled }))
  }
  return objectFreeze({ ok: true as const, roots: objectFreeze(roots), diagnostics: EMPTY_DIAGNOSTICS })
}

export function inspectLocalJsonSchemaViewInstancePointer(input: {
  readonly compiled: CompiledLocalJsonSchemaView
  readonly pointer: string
}): InspectLocalJsonSchemaInstancePointerResult {
  const snapshot = snapshotExactRecord(input, VIEW_INPUT_FIELDS, "Local JSON Schema view inspection input")
  const state = requireViewState(snapshot.compiled)
  if (typeof snapshot.pointer !== "string") throw new TypeError("Local JSON Schema view pointer is invalid.")
  return inspectLocalJsonSchemaInstancePointer({
    compiled: state.base,
    pointer: `${state.prefix}${snapshot.pointer}`
  })
}

export function inspectLocalJsonSchemaViewDocumentDependencies(input: {
  readonly compiled: CompiledLocalJsonSchemaView
}): readonly string[] {
  const snapshot = snapshotExactRecord(
    input,
    DEPENDENCY_INPUT_FIELDS,
    "Local JSON Schema view dependency input"
  )
  return requireViewState(snapshot.compiled).dependencies
}

export function validateLocalJsonSchemaViewValue(input: {
  readonly compiled: CompiledLocalJsonSchemaView
  readonly value: unknown
  readonly diagnosticCode: WorkflowContractV2DiagnosticCode
  readonly location: WorkflowContractV2DiagnosticLocation
}): ValidateLocalJsonSchemaValueResult {
  const snapshot = snapshotExactRecord(input, VALIDATE_INPUT_FIELDS, "Local JSON Schema view validation input")
  const state = requireViewState(snapshot.compiled)
  const wrapper = objectCreate(null) as Record<string, unknown>
  objectDefineProperty(wrapper, state.key, {
    configurable: false,
    enumerable: true,
    value: snapshot.value,
    writable: false
  })
  const location = snapshot.location as WorkflowContractV2DiagnosticLocation
  const result = validateLocalJsonSchemaValue({
    compiled: state.base,
    value: objectFreeze(wrapper),
    diagnosticCode: snapshot.diagnosticCode as WorkflowContractV2DiagnosticCode,
    location
  })
  if (result.ok) {
    const value = (result.value as JsonObject)[state.key]
    return objectFreeze({ ok: true as const, value, diagnostics: EMPTY_DIAGNOSTICS })
  }
  const diagnostics: WorkflowContractV2Diagnostic[] = []
  for (let index = 0; index < result.diagnostics.length; index += 1) {
    const diagnostic = result.diagnostics[index]
    const pointer = stripViewPointer(diagnostic.location.pointer, location.pointer, state.prefix)
    push(diagnostics, createWorkflowContractV2Diagnostic({
      code: diagnostic.code,
      severity: diagnostic.severity,
      message: diagnostic.message,
      location: { path: diagnostic.location.path, pointer },
      relatedLocations: diagnostic.relatedLocations
    }))
  }
  return objectFreeze({ ok: false as const, diagnostics: objectFreeze(diagnostics) })
}

export function bindLocalJsonSchemaViewForPredicate(
  compiled: CompiledLocalJsonSchemaView
): LocalJsonSchemaPredicateBinding {
  const state = requireViewState(compiled)
  return objectFreeze({ compiled: state.base, pointerPrefix: state.prefix })
}

// Internal role adapter: only detached catalog-owned JSON is returned, never a validator.
export function resolveLocalJsonSchemaViewManualRole(compiled: CompiledLocalJsonSchemaView): {
  readonly root: JsonValue | undefined
  readonly properties: Readonly<Record<string, JsonValue | undefined>>
} {
  const state = requireViewState(compiled)
  const source = findSource(state.sources, state.rootId)
  const resolved = source === undefined ? undefined : normalizeRoleReference(state.sources, state.rootId, source.schema as JsonValue)
  const properties = objectCreate(null) as Record<string, JsonValue | undefined>
  const root = resolved?.value
  if (resolved !== undefined && isJsonObject(root) && isJsonObject(root.properties)) {
    const keys = objectKeys(root.properties)
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      const property = normalizeRoleReference(state.sources, resolved.documentId, root.properties[key])
      properties[key] = property?.value
    }
  }
  return objectFreeze({ root, properties: objectFreeze(properties) })
}

function normalizeRoleReference(
  sources: readonly LocalJsonSchemaSource[], documentId: string, value: JsonValue
): { readonly documentId: string; readonly value: JsonValue } | undefined {
  const visited: JsonValue[] = []
  while (isJsonObject(value) && typeof value.$ref === "string") {
    for (let index = 0; index < visited.length; index += 1) if (visited[index] === value) return undefined
    push(visited, value)
    const keys = objectKeys(value)
    for (let index = 0; index < keys.length; index += 1) {
      if (!contains(REFERENCE_NON_VALIDATION_KEYWORDS, keys[index])) return undefined
    }
    // F3 already validated local document IDs, canonical pointer escapes, targets, and cycles.
    const hash = reflectApply(stringIndexOf, value.$ref, ["#"]) as number
    if (hash !== 0) documentId = hash < 0 ? value.$ref : slice(value.$ref, 0, hash)
    const source = findSource(sources, documentId)
    if (source === undefined) return undefined
    let target = source.schema as JsonValue | undefined
    const pointer = hash < 0 ? "" : slice(value.$ref, hash + 1, value.$ref.length)
    let start = 1
    for (let end = 1; end <= pointer.length; end += 1) {
      if (end !== pointer.length && charCodeAt(pointer, end) !== 0x2f) continue
      let token = ""
      for (let index = start; index < end; index += 1) {
        if (charCodeAt(pointer, index) === 0x7e) {
          index += 1
          token += charCodeAt(pointer, index) === 0x30 ? "~" : "/"
        } else token += slice(pointer, index, index + 1)
      }
      if (target === null || typeof target !== "object" || !objectHasOwn(target, token)) return undefined
      target = objectGetOwnPropertyDescriptors(target)[token]?.value as JsonValue | undefined
      start = end + 1
    }
    if (target === undefined) return undefined
    value = target
  }
  return objectFreeze({ documentId, value })
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !arrayIsArray(value)
}

export function isCompiledLocalJsonSchemaView(value: unknown): value is CompiledLocalJsonSchemaView {
  return typeof value === "object" && value !== null && !isProxy(value) && weakMapHas(views, value)
}

function requireViewState(value: unknown): ViewState {
  if (!isCompiledLocalJsonSchemaView(value)) throw new TypeError("Compiled local JSON Schema view is invalid.")
  const state = weakMapGet(views, value)
  if (state === undefined) throw new TypeError("Compiled local JSON Schema view state is unavailable.")
  return state
}

function snapshotRootIds(value: unknown): readonly string[] {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError("Local JSON Schema catalog root IDs must be a dense ordinary array.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const length = descriptors.length?.value
  if (
    typeof length !== "number"
    || !numberIsSafeInteger(length)
    || length < 1
    || length > MAX_ROOTS
    || reflectOwnKeys(descriptors).length !== length + 1
  ) throw new TypeError("Local JSON Schema catalog root IDs have an invalid length.")
  const result: string[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[numberAsString(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
      || typeof descriptor.value !== "string"
      || (index > 0 && result[index - 1] >= descriptor.value)
    ) throw new TypeError("Local JSON Schema catalog root IDs must be sorted and duplicate-free.")
    push(result, descriptor.value)
  }
  return objectFreeze(result)
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  }
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) throw new TypeError(`${label} must be an ordinary record.`)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== fields.length) throw new TypeError(`${label} contains an unknown field.`)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(fields, key)) throw new TypeError(`${label} contains an unknown field.`)
  }
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    const descriptor = descriptors[field]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError(`${label}.${field} must be an enumerable own data property.`)
    result[field] = descriptor.value
  }
  return objectFreeze(result) as Readonly<Record<Fields[number], unknown>>
}

function snapshotSchemaSources(value: unknown): readonly LocalJsonSchemaSource[] {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError("Local JSON Schema catalog sources must be a dense ordinary array.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const length = descriptors.length?.value
  if (
    typeof length !== "number"
    || !numberIsSafeInteger(length)
    || length < 1
    || length > MAX_ROOTS
    || reflectOwnKeys(descriptors).length !== length + 1
  ) throw new TypeError("Local JSON Schema catalog sources have an invalid length.")
  const result: LocalJsonSchemaSource[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[numberAsString(index)]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError("Local JSON Schema catalog sources must contain own data items.")
    const source = snapshotExactRecord(descriptor.value, SOURCE_FIELDS, "Local JSON Schema catalog source")
    push(result, objectFreeze({
      id: source.id as string,
      schema: cloneAndFreezeJsonValue(source.schema),
      location: source.location as WorkflowContractV2DiagnosticLocation
    }))
  }
  return objectFreeze(result)
}

function collectDependencies(
  rootId: string,
  sources: readonly LocalJsonSchemaSource[]
): readonly string[] {
  const reachable: string[] = []
  const queue: string[] = []
  pushUnique(reachable, rootId)
  pushUnique(queue, rootId)
  while (queue.length > 0) {
    const id = pop(queue)
    if (id === undefined) break
    const source = findSource(sources, id)
    if (source === undefined) continue
    const targets = collectReferenceTargets(source.schema as JsonValue)
    for (let index = 0; index < targets.length; index += 1) {
      if (!contains(reachable, targets[index])) {
        push(reachable, targets[index])
        push(queue, targets[index])
      }
    }
  }
  sortText(reachable)
  return objectFreeze(reachable)
}

function collectReferenceTargets(root: JsonValue): readonly string[] {
  const targets: string[] = []
  const stack: JsonValue[] = []
  push(stack, root)
  while (stack.length > 0) {
    const value = pop(stack)
    if (value === undefined || value === null || typeof value !== "object" || arrayIsArray(value)) continue
    const record = value as Readonly<Record<string, JsonValue>>
    if (
      objectHasOwn(record, "$ref")
      && typeof record.$ref === "string"
      && charCodeAt(record.$ref, 0) !== 0x23
    ) {
      const target = referenceDocumentId(record.$ref)
      if (target !== undefined) pushUnique(targets, target)
    }
    for (let index = 0; index < ONE_SCHEMA_KEYWORDS.length; index += 1) {
      const child = record[ONE_SCHEMA_KEYWORDS[index]]
      if (child !== undefined) push(stack, child)
    }
    for (let index = 0; index < ARRAY_SCHEMA_KEYWORDS.length; index += 1) {
      const children = record[ARRAY_SCHEMA_KEYWORDS[index]]
      if (!arrayIsArray(children)) continue
      for (let childIndex = 0; childIndex < children.length; childIndex += 1) push(stack, children[childIndex])
    }
    for (let index = 0; index < MAP_SCHEMA_KEYWORDS.length; index += 1) {
      const children = record[MAP_SCHEMA_KEYWORDS[index]]
      if (children === null || typeof children !== "object" || arrayIsArray(children)) continue
      const names = objectKeys(children)
      for (let childIndex = 0; childIndex < names.length; childIndex += 1) {
        push(stack, (children as Readonly<Record<string, JsonValue>>)[names[childIndex]])
      }
    }
  }
  sortText(targets)
  return objectFreeze(targets)
}

function referenceDocumentId(reference: string): string | undefined {
  for (let index = 0; index < reference.length; index += 1) {
    if (charCodeAt(reference, index) === 0x23) return slice(reference, 0, index)
  }
  return reference
}

function findSource(values: readonly LocalJsonSchemaSource[], id: string): LocalJsonSchemaSource | undefined {
  for (let index = 0; index < values.length; index += 1) if (values[index].id === id) return values[index]
  return undefined
}

function pushUnique(values: string[], value: string): void {
  if (!contains(values, value)) push(values, value)
}

function sortText(values: string[]): void {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && values[insertion - 1] > value) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

function pop<T>(values: T[]): T | undefined {
  return reflectApply(arrayPop, values, []) as T | undefined
}

function withoutSyntheticEvidence(
  evidence: readonly { readonly id: string; readonly schemaDigest: string }[],
  syntheticId: string
): readonly { readonly id: string; readonly schemaDigest: string }[] {
  const result: { readonly id: string; readonly schemaDigest: string }[] = []
  for (let index = 0; index < evidence.length; index += 1) {
    if (evidence[index].id !== syntheticId) push(result, evidence[index])
  }
  return objectFreeze(result)
}

function containsEvidence(values: readonly { readonly id: string }[], id: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index].id === id) return true
  return false
}

function stripViewPointer(pointer: string, basePointer: string, prefix: string): string {
  const marker = `${basePointer}${prefix}`
  const index = reflectApply(stringIndexOf, pointer, [marker]) as number
  if (index !== 0) return pointer
  return `${basePointer}${slice(pointer, marker.length, pointer.length)}`
}

function failure(
  code: WorkflowContractV2DiagnosticCode,
  location: WorkflowContractV2DiagnosticLocation
): CompileLocalJsonSchemaCatalogResult {
  const diagnostic = createWorkflowContractV2Diagnostic({
    code,
    severity: "error",
    message: "JSON Schema catalog root is missing.",
    location
  })
  return objectFreeze({ ok: false as const, diagnostics: objectFreeze([diagnostic]) })
}

function defineRecord(record: Record<string, JsonValue>, key: string, value: JsonValue): void {
  objectDefineProperty(record, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false
  })
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function charCodeAt(value: string, index: number): number {
  return reflectApply(stringCharCodeAt, value, [index]) as number
}

function slice(value: string, start: number, end: number): string {
  return reflectApply(stringSlice, value, [start, end]) as string
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
