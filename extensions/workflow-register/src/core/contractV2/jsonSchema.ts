import Ajv2020, {
  type ErrorObject,
  type ValidateFunction
} from "ajv/dist/2020"
import { types as utilTypes } from "node:util"
import { canonicalJsonDigest, canonicalJsonText } from "./canonicalJson"
import {
  createWorkflowContractV2Diagnostic,
  sortWorkflowContractV2Diagnostics,
  WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES,
  type WorkflowContractV2Diagnostic,
  type WorkflowContractV2DiagnosticCode,
  type WorkflowContractV2DiagnosticLocation
} from "./diagnostics"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"

const JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema" as const

export const WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT = JSON_SCHEMA_DIALECT

export interface LocalJsonSchemaSource {
  readonly id: string
  readonly schema: unknown
  readonly location: WorkflowContractV2DiagnosticLocation
}

export interface CompileLocalJsonSchemaInput {
  readonly rootId: string
  readonly schemas: readonly LocalJsonSchemaSource[]
  readonly diagnosticCode: WorkflowContractV2DiagnosticCode
  readonly location: WorkflowContractV2DiagnosticLocation
}

export interface LocalJsonSchemaEvidenceEntry {
  readonly id: string
  readonly schemaDigest: string
}

export interface LocalJsonSchemaEvidence {
  readonly dialect: typeof WORKFLOW_CONTRACT_V2_JSON_SCHEMA_DIALECT
  readonly rootId: string
  readonly schemas: readonly LocalJsonSchemaEvidenceEntry[]
  readonly catalogDigest: string
}

export interface CompiledLocalJsonSchema {
  readonly evidence: LocalJsonSchemaEvidence
}

export type CompileLocalJsonSchemaResult =
  | {
      readonly ok: true
      readonly compiled: CompiledLocalJsonSchema
      readonly diagnostics: readonly []
    }
  | { readonly ok: false; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] }

export interface ValidateLocalJsonSchemaValueInput {
  readonly compiled: CompiledLocalJsonSchema
  readonly value: unknown
  readonly diagnosticCode: WorkflowContractV2DiagnosticCode
  readonly location: WorkflowContractV2DiagnosticLocation
}

export type ValidateLocalJsonSchemaValueResult =
  | { readonly ok: true; readonly value: JsonValue; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly WorkflowContractV2Diagnostic[] }

type JsonObject = { readonly [key: string]: JsonValue }

interface PreparedSource {
  readonly id: string
  readonly schema: JsonValue
  readonly location: WorkflowContractV2DiagnosticLocation
}

interface DocumentState {
  readonly id: string
  readonly schema: JsonObject
  readonly location: WorkflowContractV2DiagnosticLocation
  readonly schemaDigest: string
  readonly nodes: Map<string, SchemaNode>
  readonly internalId: string
  transformed?: JsonObject
}

interface SchemaNode {
  readonly document: DocumentState
  readonly pointer: string
  readonly tokens: readonly string[]
  readonly value: JsonValue
  readonly children: SchemaNode[]
  referenceText?: string
  reference?: ReferenceEdge
}

interface ReferenceEdge {
  readonly source: SchemaNode
  readonly target: SchemaNode
  readonly location: WorkflowContractV2DiagnosticLocation
}

interface SchemaLocationRecord {
  readonly documentLocation: WorkflowContractV2DiagnosticLocation
  readonly tokens: readonly string[]
  readonly falseMarker: boolean
}

interface CompiledState {
  readonly validator: ValidateFunction
  readonly schemaLocations: WeakMap<object, SchemaLocationRecord>
  readonly fallbackSchemaLocation: SchemaLocationRecord
  readonly diagnosticCode: WorkflowContractV2DiagnosticCode
}

interface DomainFailure {
  readonly message: string
  readonly location: WorkflowContractV2DiagnosticLocation
}

interface ErrorSnapshot {
  readonly instancePath: string
  readonly keyword: string
  readonly parentSchema: object | undefined
}

const isProxy = utilTypes.isProxy
const Ajv2020Constructor = Ajv2020
const canonicalJsonDigestCaptured = canonicalJsonDigest
const canonicalJsonTextCaptured = canonicalJsonText
const cloneAndFreezeJsonValueCaptured = cloneAndFreezeJsonValue
const createWorkflowContractV2DiagnosticCaptured = createWorkflowContractV2Diagnostic
const sortWorkflowContractV2DiagnosticsCaptured = sortWorkflowContractV2Diagnostics
const workflowContractV2DiagnosticCodesCaptured = WORKFLOW_CONTRACT_V2_DIAGNOSTIC_CODES
const arrayIsArray = Array.isArray
const arrayPrototype = Array.prototype
const bufferFrom = Buffer.from
const bufferPrototypeToString = Buffer.prototype.toString
const BufferConstructor = Buffer
const mapForEach = Map.prototype.forEach
const mapGet = Map.prototype.get
const mapHas = Map.prototype.has
const mapSet = Map.prototype.set
const MapConstructor = Map
const mathMin = Math.min
const numberIsSafeInteger = Number.isSafeInteger
const objectCreate = Object.create
const objectDefineProperty = Object.defineProperty
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const stringCharCodeAt = String.prototype.charCodeAt
const stringFromCharCode = String.fromCharCode
const stringIndexOf = String.prototype.indexOf
const stringSlice = String.prototype.slice
const setAdd = Set.prototype.add
const setDelete = Set.prototype.delete
const setHas = Set.prototype.has
const SetConstructor = Set
const weakMapGet = WeakMap.prototype.get
const weakMapHas = WeakMap.prototype.has
const weakMapSet = WeakMap.prototype.set
const WeakMapConstructor = WeakMap

const COMPILE_INPUT_FIELDS = objectFreeze([
  "rootId",
  "schemas",
  "diagnosticCode",
  "location"
] as const)
const VALIDATE_INPUT_FIELDS = objectFreeze([
  "compiled",
  "value",
  "diagnosticCode",
  "location"
] as const)
const SOURCE_FIELDS = objectFreeze(["id", "schema", "location"] as const)
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []

const MESSAGES = objectFreeze({
  catalogEmpty: "JSON Schema catalog is empty.",
  catalogEntryInvalid: "JSON Schema catalog entry is invalid.",
  rootMissing: "JSON Schema catalog root is missing.",
  idInvalid: "JSON Schema document ID is invalid.",
  idDuplicated: "JSON Schema document ID is duplicated.",
  documentNoncanonical: "JSON Schema document is not canonical JSON.",
  dialectUnsupported: "JSON Schema document dialect is unsupported.",
  idMismatch: "JSON Schema document $id does not match its catalog ID.",
  keywordUnsupported: "JSON Schema keyword is unsupported.",
  formatUnsupported: "JSON Schema format is unsupported.",
  referenceNonlocal: "JSON Schema reference is not local.",
  referenceEscapes: "JSON Schema reference escapes the catalog.",
  referenceTargetInvalid: "JSON Schema reference target is invalid.",
  referenceCycle: "JSON Schema reference cycle is unsupported.",
  schemaInvalid: "JSON Schema document is invalid.",
  valueNoncanonical: "JSON Schema value is not canonical JSON.",
  falseSchema: "JSON Schema false schema rejected the value.",
  genericConstraint: "JSON Schema value violates a schema constraint."
})

const SUPPORTED_KEYWORDS = new SetConstructor<string>([
  "$schema", "$id", "$ref", "$defs", "$comment",
  "type", "enum", "const",
  "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum",
  "maxLength", "minLength", "pattern",
  "maxItems", "minItems", "uniqueItems", "maxContains", "minContains",
  "maxProperties", "minProperties", "required", "dependentRequired",
  "prefixItems", "items", "contains",
  "properties", "patternProperties", "additionalProperties", "dependentSchemas", "propertyNames",
  "if", "then", "else", "allOf", "anyOf", "oneOf", "not",
  "unevaluatedItems", "unevaluatedProperties",
  "title", "description", "default", "deprecated", "readOnly", "writeOnly", "examples"
])
const ONE_SCHEMA_KEYWORDS = new SetConstructor<string>([
  "items", "contains", "additionalProperties", "propertyNames", "if", "then", "else", "not",
  "unevaluatedItems", "unevaluatedProperties"
])
const ARRAY_SCHEMA_KEYWORDS = new SetConstructor<string>(["prefixItems", "allOf", "anyOf", "oneOf"])
const MAP_SCHEMA_KEYWORDS = new SetConstructor<string>([
  "$defs", "properties", "patternProperties", "dependentSchemas"
])
const KNOWN_VALIDATION_KEYWORDS = new SetConstructor<string>([
  "type", "enum", "const",
  "multipleOf", "maximum", "exclusiveMaximum", "minimum", "exclusiveMinimum",
  "maxLength", "minLength", "pattern",
  "maxItems", "minItems", "uniqueItems", "contains", "maxContains", "minContains",
  "maxProperties", "minProperties", "required", "dependentRequired",
  "additionalProperties", "unevaluatedProperties", "propertyNames", "patternProperties",
  "allOf", "anyOf", "oneOf", "if", "not", "unevaluatedItems"
])
const DIAGNOSTIC_CODE_SET = new SetConstructor<string>(workflowContractV2DiagnosticCodesCaptured)

const COMPILED_STATES = new WeakMapConstructor<object, CompiledState>()

export function compileLocalJsonSchema(
  input: CompileLocalJsonSchemaInput
): CompileLocalJsonSchemaResult {
  const snapshot = snapshotExactOrdinaryRecord(input, COMPILE_INPUT_FIELDS, "Local JSON Schema compile input")
  const diagnosticCode = requireDiagnosticCode(snapshot.diagnosticCode)
  const baseLocation = cloneLocation(snapshot.location, diagnosticCode)
  const rootId = requireWellFormedString(snapshot.rootId, "Local JSON Schema root ID")
  const schemaArray = snapshotSchemaArray(snapshot.schemas)
  if (schemaArray.kind === "invalid-entry") {
    return compileFailure(diagnosticCode, MESSAGES.catalogEntryInvalid, baseLocation)
  }

  if (schemaArray.values.length === 0) {
    return compileFailure(diagnosticCode, MESSAGES.catalogEmpty, baseLocation)
  }

  const prepared: PreparedSource[] = []
  for (let index = 0; index < schemaArray.values.length; index += 1) {
    const sourceSnapshot = trySnapshotExactOrdinaryRecord(schemaArray.values[index], SOURCE_FIELDS)
    if (sourceSnapshot === undefined || typeof sourceSnapshot.id !== "string") {
      return compileFailure(diagnosticCode, MESSAGES.catalogEntryInvalid, baseLocation)
    }
    let sourceLocation: WorkflowContractV2DiagnosticLocation
    try {
      sourceLocation = cloneLocation(sourceSnapshot.location, diagnosticCode)
    } catch {
      return compileFailure(diagnosticCode, MESSAGES.catalogEntryInvalid, baseLocation)
    }
    const id = sourceSnapshot.id
    if (!isCanonicalDocumentId(id)) {
      return compileFailure(diagnosticCode, MESSAGES.idInvalid, sourceLocation)
    }
    let cloned: JsonValue
    try {
      cloned = cloneAndFreezeJsonValueCaptured(sourceSnapshot.schema)
    } catch {
      return compileFailure(diagnosticCode, MESSAGES.documentNoncanonical, sourceLocation)
    }
    const item: PreparedSource = { id, schema: cloned, location: sourceLocation }
    defineArrayValue(prepared, index, item)
  }

  const ids = new MapConstructor<string, PreparedSource>()
  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index]
    if (callMapHas(ids, item.id)) {
      return compileFailure(diagnosticCode, MESSAGES.idDuplicated, item.location)
    }
    callMapSet(ids, item.id, item)
  }
  if (!callMapHas(ids, rootId)) {
    return compileFailure(diagnosticCode, MESSAGES.rootMissing, baseLocation)
  }

  const documents: DocumentState[] = []
  for (let index = 0; index < prepared.length; index += 1) {
    const item = prepared[index]
    if (!isJsonObject(item.schema)) {
      return compileFailure(diagnosticCode, MESSAGES.schemaInvalid, item.location)
    }
    defineArrayValue(documents, index, {
      id: item.id,
      schema: item.schema,
      location: item.location,
      schemaDigest: canonicalJsonDigestCaptured(item.schema),
      nodes: new MapConstructor<string, SchemaNode>(),
      internalId: internalSchemaId(item.id),
      transformed: undefined
    })
  }
  sortByDocumentId(documents)

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index]
    const dialect = readOwnJsonValue(document.schema, "$schema")
    if (dialect !== JSON_SCHEMA_DIALECT) {
      return compileFailure(diagnosticCode, MESSAGES.dialectUnsupported, document.location)
    }
    if (readOwnJsonValue(document.schema, "$id") !== document.id) {
      return compileFailure(diagnosticCode, MESSAGES.idMismatch, document.location)
    }
    const failure = walkSchema(document, document.schema, objectFreeze([] as string[]), true, diagnosticCode)
    if (failure !== undefined) {
      return compileFailure(diagnosticCode, failure.message, failure.location)
    }
  }

  const documentsById = new MapConstructor<string, DocumentState>()
  for (let index = 0; index < documents.length; index += 1) {
    callMapSet(documentsById, documents[index].id, documents[index])
  }
  const referenceFailure = resolveReferences(documents, documentsById, diagnosticCode)
  if (referenceFailure !== undefined) {
    return compileFailure(diagnosticCode, referenceFailure.message, referenceFailure.location)
  }
  const cycle = findFirstCyclicReference(documents)
  if (cycle !== undefined) {
    return compileFailure(diagnosticCode, MESSAGES.referenceCycle, cycle.location)
  }

  const schemaLocations = new WeakMapConstructor<object, SchemaLocationRecord>()
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index]
    document.transformed = transformSchema(callMapGet(document.nodes, "") as SchemaNode, schemaLocations) as JsonObject
  }

  let ajv: Ajv2020
  try {
    ajv = new Ajv2020Constructor({
      allErrors: true,
      strict: true,
      strictSchema: true,
      strictNumbers: true,
      strictTypes: true,
      strictTuples: true,
      strictRequired: true,
      allowMatchingProperties: false,
      allowUnionTypes: false,
      validateFormats: true,
      $data: false,
      removeAdditional: false,
      useDefaults: false,
      coerceTypes: false,
      ownProperties: true,
      validateSchema: true,
      addUsedSchema: false,
      inlineRefs: false,
      messages: false,
      verbose: true,
      logger: false
    })
    installCanonicalEqualityKeywords(ajv)
  } catch {
    return compileFailure(diagnosticCode, MESSAGES.schemaInvalid, baseLocation)
  }

  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index]
    try {
      ajv.addSchema(document.transformed as object, document.internalId)
    } catch {
      return compileFailure(diagnosticCode, MESSAGES.schemaInvalid, document.location)
    }
  }

  let rootValidator: ValidateFunction | undefined
  for (let index = 0; index < documents.length; index += 1) {
    const document = documents[index]
    let validator: ValidateFunction | undefined
    try {
      validator = ajv.getSchema(document.internalId)
    } catch {
      return compileFailure(diagnosticCode, MESSAGES.schemaInvalid, document.location)
    }
    if (validator === undefined) {
      return compileFailure(diagnosticCode, MESSAGES.schemaInvalid, document.location)
    }
    if (document.id === rootId) rootValidator = validator
  }
  if (rootValidator === undefined) {
    return compileFailure(diagnosticCode, MESSAGES.schemaInvalid, baseLocation)
  }

  const evidenceEntries: LocalJsonSchemaEvidenceEntry[] = []
  for (let index = 0; index < documents.length; index += 1) {
    defineArrayValue(evidenceEntries, index, objectFreeze({
      id: documents[index].id,
      schemaDigest: documents[index].schemaDigest
    }))
  }
  const frozenEntries = objectFreeze(evidenceEntries)
  const catalogDigest = canonicalJsonDigestCaptured({
    dialect: JSON_SCHEMA_DIALECT,
    rootId,
    schemas: frozenEntries
  })
  const evidence: LocalJsonSchemaEvidence = objectFreeze({
    dialect: JSON_SCHEMA_DIALECT,
    rootId,
    schemas: frozenEntries,
    catalogDigest
  })
  const compiled: CompiledLocalJsonSchema = objectFreeze({ evidence })
  const rootDocument = callMapGet(documentsById, rootId) as DocumentState
  callWeakMapSet(COMPILED_STATES, compiled, {
    validator: rootValidator,
    schemaLocations,
    fallbackSchemaLocation: {
      documentLocation: rootDocument.location,
      tokens: objectFreeze([] as string[]),
      falseMarker: false
    },
    diagnosticCode
  })
  return objectFreeze({ ok: true, compiled, diagnostics: EMPTY_DIAGNOSTICS })
}

function installCanonicalEqualityKeywords(ajv: Ajv2020): void {
  ajv.removeKeyword("const")
  ajv.addKeyword({
    keyword: "const",
    errors: false,
    compile(schema: unknown) {
      const expected = canonicalJsonTextCaptured(schema)
      return (data: unknown): boolean => canonicalJsonTextCaptured(data) === expected
    }
  })

  ajv.removeKeyword("enum")
  ajv.addKeyword({
    keyword: "enum",
    schemaType: "array",
    errors: false,
    compile(schema: unknown) {
      if (!arrayIsArray(schema)) return (): boolean => false
      const expected: string[] = []
      for (let index = 0; index < schema.length; index += 1) {
        defineArrayValue(expected, index, canonicalJsonTextCaptured(schema[index]))
      }
      return (data: unknown): boolean => {
        const actual = canonicalJsonTextCaptured(data)
        for (let index = 0; index < expected.length; index += 1) {
          if (expected[index] === actual) return true
        }
        return false
      }
    }
  })

  ajv.removeKeyword("uniqueItems")
  ajv.addKeyword({
    keyword: "uniqueItems",
    type: "array",
    schemaType: "boolean",
    errors: false,
    compile(schema: unknown) {
      if (schema !== true) return (): boolean => true
      return (data: unknown): boolean => {
        if (!arrayIsArray(data)) return true
        const seen = new SetConstructor<string>()
        for (let index = 0; index < data.length; index += 1) {
          const item = canonicalJsonTextCaptured(data[index])
          if (callSetHas(seen, item)) return false
          callSetAdd(seen, item)
        }
        return true
      }
    }
  })
}

export function validateLocalJsonSchemaValue(
  input: ValidateLocalJsonSchemaValueInput
): ValidateLocalJsonSchemaValueResult {
  const snapshot = snapshotExactOrdinaryRecord(input, VALIDATE_INPUT_FIELDS, "Local JSON Schema validate input")
  const diagnosticCode = requireDiagnosticCode(snapshot.diagnosticCode)
  const baseLocation = cloneLocation(snapshot.location, diagnosticCode)
  const compiled = snapshot.compiled
  if (compiled === null || typeof compiled !== "object" || !callWeakMapHas(COMPILED_STATES, compiled)) {
    throw new TypeError("Compiled local JSON Schema handle is invalid.")
  }
  const state = callWeakMapGet(COMPILED_STATES, compiled)
  if (state === undefined) throw new TypeError("Compiled local JSON Schema handle is invalid.")

  let value: JsonValue
  try {
    value = cloneAndFreezeJsonValueCaptured(snapshot.value)
  } catch {
    return validateFailure(diagnosticCode, MESSAGES.valueNoncanonical, baseLocation)
  }

  const valid = state.validator(value)
  const errors = snapshotAjvErrors(state.validator.errors)
  if (valid) {
    return objectFreeze({ ok: true, value, diagnostics: EMPTY_DIAGNOSTICS })
  }

  const diagnostics: WorkflowContractV2Diagnostic[] = []
  for (let index = 0; index < errors.length; index += 1) {
    const error = errors[index]
    const record = error.parentSchema === undefined
      ? state.fallbackSchemaLocation
      : callWeakMapGet(state.schemaLocations, error.parentSchema) ?? state.fallbackSchemaLocation
    const falseSchema = record.falseMarker && error.keyword === "not"
    const message = falseSchema
      ? MESSAGES.falseSchema
      : validationMessage(error.keyword)
    const location = appendInstancePath(baseLocation, error.instancePath, diagnosticCode)
    const related = falseSchema
      ? deriveLocation(record.documentLocation, record.tokens, diagnosticCode)
      : deriveErrorSchemaLocation(record, error, diagnosticCode)
    defineArrayValue(diagnostics, diagnostics.length, createWorkflowContractV2DiagnosticCaptured({
      code: diagnosticCode,
      severity: "error",
      message,
      location,
      relatedLocations: [related]
    }))
  }
  const sorted = sortWorkflowContractV2DiagnosticsCaptured(diagnostics)
  return objectFreeze({ ok: false, diagnostics: sorted })
}

function snapshotExactOrdinaryRecord(
  value: unknown,
  expectedFields: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  const snapshot = trySnapshotExactOrdinaryRecord(value, expectedFields)
  if (snapshot === undefined) throw new TypeError(`${label} must be an exact ordinary data record.`)
  return snapshot
}

function trySnapshotExactOrdinaryRecord(
  value: unknown,
  expectedFields: readonly string[]
): Readonly<Record<string, unknown>> | undefined {
  if (isProxy(value) || value === null || typeof value !== "object") return undefined
  if (objectGetPrototypeOf(value) !== objectPrototype) return undefined
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const ownKeys = reflectOwnKeys(descriptors)
  if (ownKeys.length !== expectedFields.length) return undefined
  const snapshot = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index]
    if (typeof key !== "string" || !containsString(expectedFields, key)) return undefined
    const descriptor = descriptorMapEntry(descriptors, key)
    if (
      descriptor === undefined
      || descriptorField(descriptor, "enumerable") !== true
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || !objectHasOwn(descriptor, "value")
    ) return undefined
    objectDefineProperty(snapshot, key, {
      configurable: false,
      enumerable: true,
      value: descriptorField(descriptor, "value"),
      writable: false
    })
  }
  for (let index = 0; index < expectedFields.length; index += 1) {
    if (!objectHasOwn(snapshot, expectedFields[index])) return undefined
  }
  return objectFreeze(snapshot)
}

function snapshotSchemaArray(value: unknown):
  | { readonly kind: "ok"; readonly values: readonly unknown[] }
  | { readonly kind: "invalid-entry" } {
  if (isProxy(value) || !arrayIsArray(value) || objectGetPrototypeOf(value) !== arrayPrototype) {
    throw new TypeError("Local JSON Schema catalog must be an ordinary Array.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap
  const lengthDescriptor = descriptorMapEntry(descriptors, "length")
  const length = lengthDescriptor === undefined ? undefined : descriptorField(lengthDescriptor, "value")
  if (typeof length !== "number" || !numberIsSafeInteger(length) || length < 0) {
    throw new TypeError("Local JSON Schema catalog length is invalid.")
  }
  const ownKeys = reflectOwnKeys(descriptors)
  for (let index = 0; index < ownKeys.length; index += 1) {
    const key = ownKeys[index]
    if (typeof key !== "string") throw new TypeError("Local JSON Schema catalog has a symbol property.")
    if (key !== "length" && canonicalArrayIndex(key) === undefined) {
      throw new TypeError("Local JSON Schema catalog has an extra property.")
    }
  }
  const values: unknown[] = []
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptorMapEntry(descriptors, numberAsString(index))
    if (
      descriptor === undefined
      || descriptorField(descriptor, "enumerable") !== true
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || !objectHasOwn(descriptor, "value")
    ) return { kind: "invalid-entry" }
    defineArrayValue(values, index, descriptorField(descriptor, "value"))
  }
  return { kind: "ok", values: objectFreeze(values) }
}

function requireDiagnosticCode(value: unknown): WorkflowContractV2DiagnosticCode {
  if (typeof value !== "string" || !callSetHas(DIAGNOSTIC_CODE_SET, value)) {
    throw new TypeError("Local JSON Schema diagnostic code is not registered.")
  }
  return value as WorkflowContractV2DiagnosticCode
}

function requireWellFormedString(value: unknown, label: string): string {
  if (typeof value !== "string" || !hasWellFormedUnicode(value)) {
    throw new TypeError(`${label} must be a well-formed string.`)
  }
  return value
}

function cloneLocation(
  value: unknown,
  diagnosticCode: WorkflowContractV2DiagnosticCode
): WorkflowContractV2DiagnosticLocation {
  return createWorkflowContractV2DiagnosticCaptured({
    code: diagnosticCode,
    severity: "error",
    message: MESSAGES.schemaInvalid,
    location: value as WorkflowContractV2DiagnosticLocation
  }).location
}

function isCanonicalDocumentId(value: string): boolean {
  if (!hasWellFormedUnicode(value) || value.length === 0) return false
  if (
    callCharCodeAt(value, 0) === 0x2f
    || callCharCodeAt(value, value.length - 1) === 0x2f
  ) return false
  let segmentLength = 0
  let segmentIsDot = true
  let segmentIsDoubleDot = true
  for (let index = 0; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (
      code === 0x3a || code === 0x3f || code === 0x23 || code === 0x25 || code === 0x5c
      || code <= 0x1f || (code >= 0x7f && code <= 0x9f)
    ) return false
    if (code === 0x2f) {
      if (segmentLength === 0 || segmentIsDot || segmentIsDoubleDot) return false
      segmentLength = 0
      segmentIsDot = true
      segmentIsDoubleDot = true
      continue
    }
    segmentLength += 1
    if (segmentLength === 1) {
      segmentIsDot = code === 0x2e
      segmentIsDoubleDot = code === 0x2e
    } else if (segmentLength === 2) {
      segmentIsDot = false
      segmentIsDoubleDot = segmentIsDoubleDot && code === 0x2e
    } else {
      segmentIsDot = false
      segmentIsDoubleDot = false
    }
  }
  return segmentLength > 0 && !segmentIsDot && !segmentIsDoubleDot
}

function walkSchema(
  document: DocumentState,
  value: JsonValue,
  tokens: readonly string[],
  root: boolean,
  diagnosticCode: WorkflowContractV2DiagnosticCode
): DomainFailure | undefined {
  const pointer = pointerFromTokens(tokens)
  if (typeof value === "boolean") {
    const node: SchemaNode = {
      document,
      pointer,
      tokens,
      value,
      children: [],
      referenceText: undefined,
      reference: undefined
    }
    callMapSet(document.nodes, pointer, node)
    return undefined
  }
  if (!isJsonObject(value)) {
    return { message: MESSAGES.schemaInvalid, location: deriveLocation(document.location, tokens, diagnosticCode) }
  }
  const node: SchemaNode = {
    document,
    pointer,
    tokens,
    value,
    children: [],
    referenceText: undefined,
    reference: undefined
  }
  callMapSet(document.nodes, pointer, node)
  const keys = objectKeys(value)
  sortStrings(keys)
  for (let index = 0; index < keys.length; index += 1) {
    const keyword = keys[index]
    const keywordTokens = appendToken(tokens, keyword)
    if (!root && keyword === "$schema") {
      return {
        message: MESSAGES.dialectUnsupported,
        location: deriveLocation(document.location, keywordTokens, diagnosticCode)
      }
    }
    if (!root && keyword === "$id") {
      return {
        message: MESSAGES.idMismatch,
        location: deriveLocation(document.location, keywordTokens, diagnosticCode)
      }
    }
    if (keyword === "format") {
      return {
        message: MESSAGES.formatUnsupported,
        location: deriveLocation(document.location, keywordTokens, diagnosticCode)
      }
    }
    if (!callSetHas(SUPPORTED_KEYWORDS, keyword)) {
      return {
        message: MESSAGES.keywordUnsupported,
        location: deriveLocation(document.location, keywordTokens, diagnosticCode)
      }
    }
    const keywordValue = readRequiredJsonValue(value, keyword)
    if (keyword === "$ref") {
      if (typeof keywordValue !== "string") {
        return {
          message: MESSAGES.schemaInvalid,
          location: deriveLocation(document.location, keywordTokens, diagnosticCode)
        }
      }
      node.referenceText = keywordValue
      continue
    }
    if (callSetHas(ONE_SCHEMA_KEYWORDS, keyword)) {
      const failure = walkChildSchema(node, keywordValue, keywordTokens, diagnosticCode)
      if (failure !== undefined) return failure
      continue
    }
    if (callSetHas(ARRAY_SCHEMA_KEYWORDS, keyword)) {
      if (!arrayIsArray(keywordValue)) {
        return {
          message: MESSAGES.schemaInvalid,
          location: deriveLocation(document.location, keywordTokens, diagnosticCode)
        }
      }
      for (let childIndex = 0; childIndex < keywordValue.length; childIndex += 1) {
        const childTokens = appendToken(keywordTokens, numberAsString(childIndex))
        const failure = walkChildSchema(
          node,
          readRequiredJsonValue(keywordValue as readonly JsonValue[], numberAsString(childIndex)),
          childTokens,
          diagnosticCode
        )
        if (failure !== undefined) return failure
      }
      continue
    }
    if (callSetHas(MAP_SCHEMA_KEYWORDS, keyword)) {
      if (!isJsonObject(keywordValue)) {
        return {
          message: MESSAGES.schemaInvalid,
          location: deriveLocation(document.location, keywordTokens, diagnosticCode)
        }
      }
      const names = objectKeys(keywordValue)
      sortStrings(names)
      for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
        const name = names[nameIndex]
        const childTokens = appendToken(keywordTokens, name)
        const failure = walkChildSchema(
          node,
          readRequiredJsonValue(keywordValue, name),
          childTokens,
          diagnosticCode
        )
        if (failure !== undefined) return failure
      }
    }
  }
  return undefined
}

function walkChildSchema(
  parent: SchemaNode,
  value: JsonValue,
  tokens: readonly string[],
  diagnosticCode: WorkflowContractV2DiagnosticCode
): DomainFailure | undefined {
  if (typeof value !== "boolean" && !isJsonObject(value)) {
    return {
      message: MESSAGES.schemaInvalid,
      location: deriveLocation(parent.document.location, tokens, diagnosticCode)
    }
  }
  const failure = walkSchema(parent.document, value, tokens, false, diagnosticCode)
  if (failure !== undefined) return failure
  const child = callMapGet(parent.document.nodes, pointerFromTokens(tokens))
  if (child === undefined) {
    return {
      message: MESSAGES.schemaInvalid,
      location: deriveLocation(parent.document.location, tokens, diagnosticCode)
    }
  }
  defineArrayValue(parent.children, parent.children.length, child)
  return undefined
}

function resolveReferences(
  documents: readonly DocumentState[],
  documentsById: ReadonlyMap<string, DocumentState>,
  diagnosticCode: WorkflowContractV2DiagnosticCode
): DomainFailure | undefined {
  for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
    const document = documents[documentIndex]
    const nodes = sortedDocumentNodes(document)
    for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
      const node = nodes[nodeIndex]
      if (node.referenceText === undefined) continue
      const refLocation = deriveLocation(document.location, appendToken(node.tokens, "$ref"), diagnosticCode)
      const parsed = parseLocalReference(node.referenceText, document.id)
      if (parsed === undefined) {
        return { message: MESSAGES.referenceNonlocal, location: refLocation }
      }
      if (parsed.kind === "target-invalid") {
        return { message: MESSAGES.referenceTargetInvalid, location: refLocation }
      }
      const targetDocument = callMapGet(documentsById, parsed.documentId)
      if (targetDocument === undefined) {
        return { message: MESSAGES.referenceEscapes, location: refLocation }
      }
      const target = callMapGet(targetDocument.nodes, parsed.pointer)
      if (target === undefined) {
        return { message: MESSAGES.referenceTargetInvalid, location: refLocation }
      }
      node.reference = { source: node, target, location: refLocation }
    }
  }
  return undefined
}

function parseLocalReference(
  reference: string,
  currentDocumentId: string
):
  | { readonly kind: "ok"; readonly documentId: string; readonly pointer: string }
  | { readonly kind: "target-invalid" }
  | undefined {
  if (reference.length === 0 || !hasWellFormedUnicode(reference)) return undefined
  if (
    callIndexOf(reference, "?") >= 0
    || callIndexOf(reference, "%") >= 0
    || callIndexOf(reference, "\\") >= 0
  ) return undefined
  if (callCharCodeAt(reference, 0) === 0x23) {
    if (reference === "#") return { kind: "ok", documentId: currentDocumentId, pointer: "" }
    if (reference.length < 2 || callCharCodeAt(reference, 1) !== 0x2f) return undefined
    const pointer = canonicalReferencePointer(callSlice(reference, 1))
    return pointer === undefined
      ? { kind: "target-invalid" }
      : { kind: "ok", documentId: currentDocumentId, pointer }
  }

  const hash = callIndexOf(reference, "#")
  const documentId = hash < 0 ? reference : callSlice(reference, 0, hash)
  if (!isCanonicalDocumentId(documentId)) return undefined
  if (hash < 0 || hash === reference.length - 1) return { kind: "ok", documentId, pointer: "" }
  if (callCharCodeAt(reference, hash + 1) !== 0x2f) return undefined
  const pointer = canonicalReferencePointer(callSlice(reference, hash + 1))
  return pointer === undefined
    ? { kind: "target-invalid" }
    : { kind: "ok", documentId, pointer }
}

function canonicalReferencePointer(value: string): string | undefined {
  if (value.length === 0) return ""
  if (callCharCodeAt(value, 0) !== 0x2f) return undefined
  let canonical = ""
  let segment = ""
  for (let index = 1; index <= value.length; index += 1) {
    if (index === value.length || callCharCodeAt(value, index) === 0x2f) {
      canonical += `/${escapePointerToken(segment)}`
      segment = ""
      continue
    }
    const code = callCharCodeAt(value, index)
    if (code === 0x7e) {
      if (index + 1 >= value.length) return undefined
      const escaped = callCharCodeAt(value, index + 1)
      if (escaped === 0x30) segment += "~"
      else if (escaped === 0x31) segment += "/"
      else return undefined
      index += 1
    } else {
      segment += codeUnitAsString(code)
    }
  }
  return canonical
}

function findFirstCyclicReference(documents: readonly DocumentState[]): ReferenceEdge | undefined {
  const nodes: SchemaNode[] = []
  for (let index = 0; index < documents.length; index += 1) {
    const documentNodes = sortedDocumentNodes(documents[index])
    for (let nodeIndex = 0; nodeIndex < documentNodes.length; nodeIndex += 1) {
      defineArrayValue(nodes, nodes.length, documentNodes[nodeIndex])
    }
  }
  const indexByNode = new MapConstructor<SchemaNode, number>()
  const lowByNode = new MapConstructor<SchemaNode, number>()
  const stack: SchemaNode[] = []
  const onStack = new SetConstructor<SchemaNode>()
  const components: SchemaNode[][] = []
  let nextIndex = 0

  function visit(node: SchemaNode): void {
    callMapSet(indexByNode, node, nextIndex)
    callMapSet(lowByNode, node, nextIndex)
    nextIndex += 1
    defineArrayValue(stack, stack.length, node)
    callSetAdd(onStack, node)
    const adjacent = sortedAdjacentNodes(node)
    for (let index = 0; index < adjacent.length; index += 1) {
      const target = adjacent[index]
      if (!callMapHas(indexByNode, target)) {
        visit(target)
        callMapSet(lowByNode, node, mathMin(
          callMapGet(lowByNode, node) as number,
          callMapGet(lowByNode, target) as number
        ))
      } else if (callSetHas(onStack, target)) {
        callMapSet(lowByNode, node, mathMin(
          callMapGet(lowByNode, node) as number,
          callMapGet(indexByNode, target) as number
        ))
      }
    }
    if (callMapGet(lowByNode, node) !== callMapGet(indexByNode, node)) return
    const component: SchemaNode[] = []
    while (stack.length > 0) {
      const item = stack[stack.length - 1]
      stack.length -= 1
      callSetDelete(onStack, item)
      defineArrayValue(component, component.length, item)
      if (item === node) break
    }
    defineArrayValue(components, components.length, component)
  }

  for (let index = 0; index < nodes.length; index += 1) {
    if (!callMapHas(indexByNode, nodes[index])) visit(nodes[index])
  }
  const componentByNode = new MapConstructor<SchemaNode, number>()
  const cyclic = new SetConstructor<number>()
  for (let index = 0; index < components.length; index += 1) {
    const component = components[index]
    for (let itemIndex = 0; itemIndex < component.length; itemIndex += 1) {
      callMapSet(componentByNode, component[itemIndex], index)
    }
    if (component.length > 1 || hasSelfEdge(component[0])) callSetAdd(cyclic, index)
  }
  const edges: ReferenceEdge[] = []
  for (let index = 0; index < nodes.length; index += 1) {
    const edge = nodes[index].reference
    if (edge === undefined) continue
    const sourceComponent = callMapGet(componentByNode, edge.source)
    if (
      sourceComponent !== undefined
      && sourceComponent === callMapGet(componentByNode, edge.target)
      && callSetHas(cyclic, sourceComponent)
    ) defineArrayValue(edges, edges.length, edge)
  }
  sortReferenceEdges(edges)
  return edges[0]
}

function transformSchema(
  node: SchemaNode,
  schemaLocations: WeakMap<object, SchemaLocationRecord>
): JsonValue {
  if (node.value === false) {
    const inner = objectCreate(objectPrototype) as Record<string, JsonValue>
    const marker = objectCreate(objectPrototype) as Record<string, JsonValue>
    defineRecordValue(marker, "not", inner)
    callWeakMapSet(schemaLocations, marker, {
      documentLocation: node.document.location,
      tokens: node.tokens,
      falseMarker: true
    })
    return marker
  }
  if (node.value === true) return true
  if (!isJsonObject(node.value)) {
    throw new TypeError("Local JSON Schema transform received an invalid schema node.")
  }
  const transformed = objectCreate(null) as Record<string, JsonValue>
  callWeakMapSet(schemaLocations, transformed, {
    documentLocation: node.document.location,
    tokens: node.tokens,
    falseMarker: false
  })
  const keys = objectKeys(node.value)
  sortStrings(keys)
  for (let index = 0; index < keys.length; index += 1) {
    const keyword = keys[index]
    const value = readRequiredJsonValue(node.value, keyword)
    let transformedValue: JsonValue
    if (keyword === "$id" && node.pointer === "") {
      transformedValue = node.document.internalId
    } else if (keyword === "$ref") {
      const target = node.reference?.target
      if (target === undefined) throw new TypeError("Local JSON Schema reference was not resolved.")
      transformedValue = `${target.document.internalId}#${target.pointer}`
    } else if (callSetHas(ONE_SCHEMA_KEYWORDS, keyword)) {
      transformedValue = transformSchema(childNode(node.document, appendToken(node.tokens, keyword)), schemaLocations)
    } else if (callSetHas(ARRAY_SCHEMA_KEYWORDS, keyword)) {
      const values: JsonValue[] = []
      const arrayValue = value as readonly JsonValue[]
      for (let itemIndex = 0; itemIndex < arrayValue.length; itemIndex += 1) {
        defineArrayValue(values, itemIndex, transformSchema(
          childNode(node.document, appendToken(appendToken(node.tokens, keyword), numberAsString(itemIndex))),
          schemaLocations
        ))
      }
      transformedValue = values
    } else if (callSetHas(MAP_SCHEMA_KEYWORDS, keyword)) {
      const map = value as JsonObject
      const copy = objectCreate(null) as Record<string, JsonValue>
      const names = objectKeys(map)
      sortStrings(names)
      for (let nameIndex = 0; nameIndex < names.length; nameIndex += 1) {
        const name = names[nameIndex]
        defineRecordValue(copy, name, transformSchema(
          childNode(node.document, appendToken(appendToken(node.tokens, keyword), name)),
          schemaLocations
        ))
      }
      transformedValue = copy
    } else {
      transformedValue = cloneAjvValue(value)
    }
    defineRecordValue(transformed, keyword, transformedValue)
  }
  return transformed
}

function cloneAjvValue(value: JsonValue): JsonValue {
  if (value === null || typeof value !== "object") return value
  if (arrayIsArray(value)) {
    const copy: JsonValue[] = []
    for (let index = 0; index < value.length; index += 1) {
      defineArrayValue(copy, index, cloneAjvValue(readRequiredJsonValue(value, numberAsString(index))))
    }
    return copy
  }
  const copy = objectCreate(null) as Record<string, JsonValue>
  const keys = objectKeys(value)
  for (let index = 0; index < keys.length; index += 1) {
    defineRecordValue(copy, keys[index], cloneAjvValue(readRequiredJsonValue(value, keys[index])))
  }
  return copy
}

function childNode(document: DocumentState, tokens: readonly string[]): SchemaNode {
  const node = callMapGet(document.nodes, pointerFromTokens(tokens))
  if (node === undefined) throw new TypeError("Local JSON Schema child node is missing.")
  return node
}

function snapshotAjvErrors(errors: ErrorObject[] | null | undefined): readonly ErrorSnapshot[] {
  const snapshots: ErrorSnapshot[] = []
  if (errors === null || errors === undefined) return snapshots
  for (let index = 0; index < errors.length; index += 1) {
    const error = errors[index]
    defineArrayValue(snapshots, index, {
      instancePath: typeof error.instancePath === "string" ? error.instancePath : "",
      keyword: typeof error.keyword === "string" ? error.keyword : "",
      parentSchema: error.parentSchema !== null && typeof error.parentSchema === "object"
        ? error.parentSchema
        : undefined
    })
  }
  return snapshots
}

function deriveErrorSchemaLocation(
  record: SchemaLocationRecord,
  error: ErrorSnapshot,
  diagnosticCode: WorkflowContractV2DiagnosticCode
): WorkflowContractV2DiagnosticLocation {
  const tokens = error.parentSchema !== undefined && objectHasOwn(error.parentSchema, error.keyword)
    ? appendToken(record.tokens, error.keyword)
    : record.tokens
  return deriveLocation(record.documentLocation, tokens, diagnosticCode)
}

function validationMessage(keyword: string): string {
  return callSetHas(KNOWN_VALIDATION_KEYWORDS, keyword)
    ? `JSON Schema value violates the ${keyword} constraint.`
    : MESSAGES.genericConstraint
}

function appendInstancePath(
  base: WorkflowContractV2DiagnosticLocation,
  instancePath: string,
  diagnosticCode: WorkflowContractV2DiagnosticCode
): WorkflowContractV2DiagnosticLocation {
  if (typeof instancePath !== "string" || (instancePath.length > 0 && callCharCodeAt(instancePath, 0) !== 0x2f)) {
    return base
  }
  try {
    return cloneLocation({ path: base.path, pointer: `${base.pointer}${instancePath}` }, diagnosticCode)
  } catch {
    return base
  }
}

function deriveLocation(
  base: WorkflowContractV2DiagnosticLocation,
  tokens: readonly string[],
  diagnosticCode: WorkflowContractV2DiagnosticCode
): WorkflowContractV2DiagnosticLocation {
  for (let length = tokens.length; length >= 0; length -= 1) {
    let pointer = base.pointer
    for (let index = 0; index < length; index += 1) pointer += `/${escapePointerToken(tokens[index])}`
    try {
      return cloneLocation({ path: base.path, pointer }, diagnosticCode)
    } catch {
      // A source-derived control name is trimmed one token at a time.
    }
  }
  return base
}

function compileFailure(
  diagnosticCode: WorkflowContractV2DiagnosticCode,
  message: string,
  location: WorkflowContractV2DiagnosticLocation
): CompileLocalJsonSchemaResult {
  const diagnostic = createWorkflowContractV2DiagnosticCaptured({
    code: diagnosticCode,
    severity: "error",
    message,
    location
  })
  return objectFreeze({ ok: false, diagnostics: objectFreeze([diagnostic]) })
}

function validateFailure(
  diagnosticCode: WorkflowContractV2DiagnosticCode,
  message: string,
  location: WorkflowContractV2DiagnosticLocation
): ValidateLocalJsonSchemaValueResult {
  const diagnostic = createWorkflowContractV2DiagnosticCaptured({
    code: diagnosticCode,
    severity: "error",
    message,
    location
  })
  return objectFreeze({ ok: false, diagnostics: objectFreeze([diagnostic]) })
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return value !== null && typeof value === "object" && !arrayIsArray(value)
}

function readOwnJsonValue(value: object, key: string): JsonValue | undefined {
  const descriptor = objectGetOwnPropertyDescriptor(value, key)
  if (descriptor === undefined || !objectHasOwn(descriptor, "value")) return undefined
  return descriptorField(descriptor, "value") as JsonValue
}

function readRequiredJsonValue(value: object, key: string): JsonValue {
  const result = readOwnJsonValue(value, key)
  if (result === undefined) throw new TypeError("Canonical JSON property is missing.")
  return result
}

function descriptorMapEntry(
  descriptors: PropertyDescriptorMap,
  key: PropertyKey
): PropertyDescriptor | undefined {
  const descriptor = objectGetOwnPropertyDescriptor(descriptors, key)
  if (descriptor === undefined || !objectHasOwn(descriptor, "value")) return undefined
  return descriptorField(descriptor, "value") as PropertyDescriptor
}

function descriptorField(descriptor: object, key: PropertyKey): unknown {
  const field = objectGetOwnPropertyDescriptor(descriptor, key)
  return field !== undefined && objectHasOwn(field, "value") ? field.value : undefined
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

function pointerFromTokens(tokens: readonly string[]): string {
  let pointer = ""
  for (let index = 0; index < tokens.length; index += 1) pointer += `/${escapePointerToken(tokens[index])}`
  return pointer
}

function escapePointerToken(value: string): string {
  let escaped = ""
  for (let index = 0; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (code === 0x7e) escaped += "~0"
    else if (code === 0x2f) escaped += "~1"
    else escaped += codeUnitAsString(code)
  }
  return escaped
}

function appendToken(tokens: readonly string[], token: string): readonly string[] {
  const copy: string[] = []
  for (let index = 0; index < tokens.length; index += 1) defineArrayValue(copy, index, tokens[index])
  defineArrayValue(copy, copy.length, token)
  return objectFreeze(copy)
}

function sortedDocumentNodes(document: DocumentState): SchemaNode[] {
  const nodes: SchemaNode[] = []
  callMapForEach(document.nodes, (node) => defineArrayValue(nodes, nodes.length, node))
  insertionSort(nodes, compareNodes)
  return nodes
}

function sortedAdjacentNodes(node: SchemaNode): SchemaNode[] {
  const adjacent: SchemaNode[] = []
  for (let index = 0; index < node.children.length; index += 1) {
    defineArrayValue(adjacent, adjacent.length, node.children[index])
  }
  if (node.reference !== undefined) defineArrayValue(adjacent, adjacent.length, node.reference.target)
  insertionSort(adjacent, compareNodes)
  return adjacent
}

function hasSelfEdge(node: SchemaNode): boolean {
  const adjacent = sortedAdjacentNodes(node)
  for (let index = 0; index < adjacent.length; index += 1) {
    if (adjacent[index] === node) return true
  }
  return false
}

function compareNodes(left: SchemaNode, right: SchemaNode): number {
  const documentOrder = compareStrings(left.document.id, right.document.id)
  return documentOrder === 0 ? compareStrings(left.pointer, right.pointer) : documentOrder
}

function sortByDocumentId(documents: DocumentState[]): void {
  insertionSort(documents, (left, right) => compareStrings(left.id, right.id))
}

function sortReferenceEdges(edges: ReferenceEdge[]): void {
  insertionSort(edges, (left, right) => {
    let order = compareStrings(left.source.document.id, right.source.document.id)
    if (order !== 0) return order
    order = compareStrings(left.source.pointer, right.source.pointer)
    if (order !== 0) return order
    order = compareStrings(left.target.document.id, right.target.document.id)
    return order !== 0 ? order : compareStrings(left.target.pointer, right.target.pointer)
  })
}

function sortStrings(values: string[]): void {
  insertionSort(values, compareStrings)
}

function insertionSort<T>(values: T[], compare: (left: T, right: T) => number): void {
  for (let index = 1; index < values.length; index += 1) {
    const value = values[index]
    let insertion = index
    while (insertion > 0 && compare(values[insertion - 1], value) > 0) {
      values[insertion] = values[insertion - 1]
      insertion -= 1
    }
    values[insertion] = value
  }
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function containsString(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}

function canonicalArrayIndex(value: string): number | undefined {
  if (value.length === 0) return undefined
  if (value === "0") return 0
  const first = callCharCodeAt(value, 0)
  if (first < 0x31 || first > 0x39) return undefined
  let result = first - 0x30
  for (let index = 1; index < value.length; index += 1) {
    const code = callCharCodeAt(value, index)
    if (code < 0x30 || code > 0x39) return undefined
    result = result * 10 + code - 0x30
    if (result > 0xffff_fffe) return undefined
  }
  return result
}

function internalSchemaId(id: string): string {
  const bytes = reflectApply(bufferFrom, BufferConstructor, [id, "utf8"]) as Buffer
  const encoded = reflectApply(bufferPrototypeToString, bytes, ["base64url"]) as string
  return `urn:workflow-contract-v2:schema:${encoded}`
}

function numberAsString(value: number): string {
  return `${value}`
}

function codeUnitAsString(code: number): string {
  return reflectApply(stringFromCharCode, undefined, [code]) as string
}

function callCharCodeAt(value: string, index: number): number {
  return reflectApply(stringCharCodeAt, value, [index]) as number
}

function callIndexOf(value: string, search: string, position?: number): number {
  return reflectApply(stringIndexOf, value, position === undefined ? [search] : [search, position]) as number
}

function callSlice(value: string, start: number, end?: number): string {
  return reflectApply(stringSlice, value, end === undefined ? [start] : [start, end]) as string
}

function defineArrayValue<T>(array: T[], index: number, value: T): void {
  objectDefineProperty(array, numberAsString(index), {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function defineRecordValue(record: Record<string, JsonValue>, key: string, value: JsonValue): void {
  objectDefineProperty(record, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true
  })
}

function callWeakMapGet<K extends object, V>(map: WeakMap<K, V>, key: K): V | undefined {
  return reflectApply(weakMapGet, map, [key]) as V | undefined
}

function callWeakMapHas<K extends object, V>(map: WeakMap<K, V>, key: K): boolean {
  return reflectApply(weakMapHas, map, [key]) as boolean
}

function callWeakMapSet<K extends object, V>(map: WeakMap<K, V>, key: K, value: V): void {
  reflectApply(weakMapSet, map, [key, value])
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

function callMapForEach<K, V>(map: ReadonlyMap<K, V>, callback: (value: V, key: K) => void): void {
  reflectApply(mapForEach, map, [callback])
}

function callSetHas<T>(set: Set<T>, value: T): boolean {
  return reflectApply(setHas, set, [value]) as boolean
}

function callSetAdd<T>(set: Set<T>, value: T): void {
  reflectApply(setAdd, set, [value])
}

function callSetDelete<T>(set: Set<T>, value: T): void {
  reflectApply(setDelete, set, [value])
}
