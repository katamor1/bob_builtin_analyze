import { types as utilTypes } from "node:util"
import {
  compare as compareSemver,
  parse as parseSemver,
  satisfies as satisfiesSemver,
  validRange as validSemverRange
} from "semver"

import { canonicalJsonDigest } from "./canonicalJson"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic,
  type WorkflowContractV2DiagnosticLocation
} from "./diagnostics"
import type {
  Sha256Digest,
  WorkflowProviderContractInput,
  WorkflowProviderDispatch,
  WorkflowProviderDispatchInput,
  WorkflowProviderOutputEvidence,
  WorkflowProviderRegistration,
  WorkflowProviderRegistrationInput,
  WorkflowProviderSchemaEvidence
} from "./providerContract"

export type {
  Sha256Digest,
  WorkflowProviderArtifactWriter,
  WorkflowProviderContractInput,
  WorkflowProviderDispatch,
  WorkflowProviderDispatchInput,
  WorkflowProviderEffectInput,
  WorkflowProviderIdempotencyInput,
  WorkflowProviderOutputEvidence,
  WorkflowProviderRegistration,
  WorkflowProviderRegistrationInput,
  WorkflowProviderSchemaEvidence
} from "./providerContract"

export interface WorkflowProviderContractEvidence {
  readonly id: string
  readonly version: string
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
  readonly contractDigest: Sha256Digest
}

export interface WorkflowProviderCatalogEvidence {
  readonly schemaVersion: "workflow-provider-catalog/v2"
  readonly providers: readonly WorkflowProviderContractEvidence[]
}

declare const workflowProviderCatalogBrand: unique symbol
export interface WorkflowProviderCatalog {
  readonly [workflowProviderCatalogBrand]: true
  readonly evidence: WorkflowProviderCatalogEvidence
}

export interface WorkflowProviderContractRequirement {
  readonly id: string
  readonly version: string
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
}

export interface WorkflowProviderLockEvidence {
  readonly id: string
  readonly requestedVersion: string
  readonly exactVersion: string
  readonly contractDigest: Sha256Digest
  readonly inputSchema: WorkflowProviderSchemaEvidence
  readonly output: WorkflowProviderOutputEvidence
  readonly errorSchema: WorkflowProviderSchemaEvidence
  readonly sideEffect: "none" | "workspace-write" | "external"
  readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
  readonly requiredCapabilities: readonly string[]
}

declare const boundWorkflowProviderDispatchBrand: unique symbol
export interface BoundWorkflowProviderDispatchHandle {
  readonly [boundWorkflowProviderDispatchBrand]: true
}

export interface BindWorkflowProviderInput {
  readonly catalog: WorkflowProviderCatalog
  readonly requirement: WorkflowProviderContractRequirement
  readonly location: WorkflowContractV2DiagnosticLocation
}

export type BindWorkflowProviderResult =
  | {
      readonly ok: true
      readonly lockEvidence: WorkflowProviderLockEvidence
      readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

interface RegisteredProvider {
  readonly sourceId: string
  readonly evidence: WorkflowProviderContractEvidence
  readonly dispatch: WorkflowProviderDispatch
  readonly token: symbol
}

interface CatalogEntry {
  readonly evidence: WorkflowProviderContractEvidence
  readonly dispatch: WorkflowProviderDispatch
  readonly handle: BoundWorkflowProviderDispatchHandle
}

interface CatalogState {
  readonly byId: ReadonlyMap<string, ReadonlyMap<string, CatalogEntry>>
}

type SideEffect = WorkflowProviderContractEvidence["sideEffect"]
type Idempotency = WorkflowProviderContractEvidence["idempotency"]
type RecordSnapshot = Readonly<Record<string, unknown>>
type ValidationResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly pointer: string }

const arrayIsArray = Array.isArray
const arrayJoin = Array.prototype.join
const arrayPrototype = Array.prototype
const arrayPush = Array.prototype.push
const arraySort = Array.prototype.sort
const bufferByteLength = Buffer.byteLength.bind(Buffer) as (value: string, encoding?: BufferEncoding) => number
const canonicalDigest = canonicalJsonDigest
const createDiagnostic = createWorkflowContractV2Diagnostic
const isProxy = utilTypes.isProxy
const MapConstructor = Map
const mapDelete = Function.prototype.call.bind(Map.prototype.delete) as (map: Map<unknown, unknown>, key: unknown) => boolean
const mapForEach = Function.prototype.call.bind(Map.prototype.forEach) as (
  map: ReadonlyMap<unknown, unknown>,
  callback: (value: unknown, key: unknown) => void
) => void
const mapGet = Function.prototype.call.bind(Map.prototype.get) as (map: ReadonlyMap<unknown, unknown>, key: unknown) => unknown
const mapSet = Function.prototype.call.bind(Map.prototype.set) as (map: Map<unknown, unknown>, key: unknown, value: unknown) => Map<unknown, unknown>
const NumberConstructor = Number
const numberIsSafeInteger = Number.isSafeInteger
const numberToString = Number.prototype.toString
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec
const reflectApply = Reflect.apply
const semverCompare = compareSemver
const semverParse = parseSemver
const semverSatisfies = satisfiesSemver
const semverValidRange = validSemverRange
const stringReplace = String.prototype.replace
const stringNormalize = String.prototype.normalize
const SymbolConstructor = Symbol
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (map: WeakMap<object, unknown>, key: object) => unknown
const weakMapHas = Function.prototype.call.bind(WeakMap.prototype.has) as (map: WeakMap<object, unknown>, key: object) => boolean
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (map: WeakMap<object, unknown>, key: object, value: unknown) => WeakMap<object, unknown>
const mapSizeGetter = objectGetOwnPropertyDescriptor(Map.prototype, "size")?.get as
  ((this: ReadonlyMap<unknown, unknown>) => number)

const ID_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const SCHEMA_ID_PATTERN = /^schemas\/[A-Za-z0-9._-]+\.json$/u
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u
const INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u
const REGISTRATION_FIELDS = objectFreeze(["sourceId", "contract"] as const)
const CONTRACT_FIELDS = objectFreeze([
  "id", "version", "inputSchema", "output", "errorSchema", "sideEffect",
  "idempotency", "requiredCapabilities", "dispatch"
] as const)
const REQUIREMENT_FIELDS = objectFreeze([
  "id", "version", "inputSchema", "output", "errorSchema", "sideEffect",
  "idempotency", "requiredCapabilities"
] as const)
const SCHEMA_FIELDS = objectFreeze(["id", "bytes", "digest"] as const)
const OUTPUT_UNIT_FIELDS = objectFreeze(["kind"] as const)
const OUTPUT_VALUE_FIELDS = objectFreeze(["kind", "schema"] as const)
const BIND_FIELDS = objectFreeze(["catalog", "requirement", "location"] as const)
const EMPTY_DIAGNOSTICS = objectFreeze([]) as readonly []
const RESERVED_WORKSPACE = "workflow.effect.workspace-write"
const RESERVED_EXTERNAL = "workflow.effect.external"
const catalogStates = new WeakMap<object, CatalogState>()
const handleDispatches = new WeakMap<object, WorkflowProviderDispatch>()

// Private R2 bridge: invoke only the dispatch captured by this catalog handle.
export function invokeBoundWorkflowProviderDispatch(
  handle: BoundWorkflowProviderDispatchHandle,
  input: WorkflowProviderDispatchInput
): Promise<unknown> | unknown {
  if (typeof handle !== "object" || handle === null || isProxy(handle)) throw new TypeError("Workflow provider dispatch handle is invalid.")
  const dispatch = weakMapGet(handleDispatches, handle) as WorkflowProviderDispatch | undefined
  if (dispatch === undefined) throw new TypeError("Workflow provider dispatch handle is invalid.")
  return reflectApply(dispatch, undefined, [input])
}

export class WorkflowProviderRegistry {
  private readonly byId = new MapConstructor<string, Map<string, RegisteredProvider>>()

  register(input: WorkflowProviderRegistrationInput): WorkflowProviderRegistration {
    const wrapper = snapshotExactOrThrow(input, REGISTRATION_FIELDS, "Workflow provider registration")
    assertId(wrapper.sourceId, "Workflow provider source id")
    const sourceId = wrapper.sourceId as string
    const validated = validateContractForRegistration(wrapper.contract)
    const versionMap = getOrCreateVersionMap(this.byId, validated.evidence.id)
    const existing = mapGet(versionMap, validated.evidence.version) as RegisteredProvider | undefined
    if (existing !== undefined) {
      throw new Error(
        `Workflow provider '${validated.evidence.id}' version '${validated.evidence.version}' is already registered by '${existing.sourceId}' and cannot be replaced by '${sourceId}'.`
      )
    }
    const token = SymbolConstructor(validated.evidence.id)
    mapSet(versionMap, validated.evidence.version, objectFreeze({
      sourceId,
      evidence: validated.evidence,
      dispatch: validated.dispatch,
      token
    }))

    let disposed = false
    return objectFreeze({
      dispose: () => {
        if (disposed) return
        disposed = true
        const currentVersions = mapGet(this.byId, validated.evidence.id) as Map<string, RegisteredProvider> | undefined
        if (currentVersions === undefined) return
        const current = mapGet(currentVersions, validated.evidence.version) as RegisteredProvider | undefined
        if (current?.token !== token) return
        mapDelete(currentVersions, validated.evidence.version)
        if (
          getMapSize(currentVersions) === 0
          && mapGet(this.byId, validated.evidence.id) === currentVersions
        ) mapDelete(this.byId, validated.evidence.id)
      }
    })
  }

  snapshot(): WorkflowProviderCatalog {
    const entries: CatalogEntry[] = []
    forEachMap(this.byId, (versionsValue) => {
      const versions = versionsValue as ReadonlyMap<string, RegisteredProvider>
      forEachMap(versions, (registeredValue) => {
        const registered = registeredValue as RegisteredProvider
        const handle = objectFreeze({}) as BoundWorkflowProviderDispatchHandle
        weakMapSet(handleDispatches, handle, registered.dispatch)
        push(entries, objectFreeze({ evidence: registered.evidence, dispatch: registered.dispatch, handle }))
      })
    })
    sortEntries(entries)
    const detachedProviders: WorkflowProviderContractEvidence[] = []
    for (let index = 0; index < entries.length; index += 1) push(detachedProviders, entries[index].evidence)
    const providers = objectFreeze(detachedProviders)
    const evidence = objectFreeze({
      schemaVersion: "workflow-provider-catalog/v2" as const,
      providers
    })
    const catalog = objectFreeze({ evidence }) as WorkflowProviderCatalog
    const byId = new MapConstructor<string, ReadonlyMap<string, CatalogEntry>>()
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      let versions = mapGet(byId, entry.evidence.id) as Map<string, CatalogEntry> | undefined
      if (versions === undefined) {
        versions = new MapConstructor<string, CatalogEntry>()
        mapSet(byId, entry.evidence.id, versions)
      }
      mapSet(versions, entry.evidence.version, entry)
    }
    weakMapSet(catalogStates, catalog, objectFreeze({ byId }))
    return catalog
  }
}

export function bindWorkflowProvider(input: BindWorkflowProviderInput): BindWorkflowProviderResult {
  const outer = snapshotExactOrThrow(input, BIND_FIELDS, "Workflow provider binding")
  const baseDiagnostic = createDiagnostic({
    code: "WF2_PROVIDER_CONTRACT_MISMATCH",
    severity: "error",
    message: "Workflow provider contract does not match.",
    location: outer.location as WorkflowContractV2DiagnosticLocation
  })
  if (
    typeof outer.catalog !== "object"
    || outer.catalog === null
    || !weakMapHas(catalogStates, outer.catalog)
  ) throw new TypeError("Workflow provider catalog is not a branded snapshot.")
  const state = weakMapGet(catalogStates, outer.catalog) as CatalogState
  const requirementResult = validateRequirement(outer.requirement)
  if (!requirementResult.ok) return failure(baseDiagnostic.location, requirementResult.pointer)
  const requirement = requirementResult.value
  if (
    requirement.version.length < 1
    || requirement.version.length > 256
    || testPattern(CONTROL_PATTERN, requirement.version)
    || semverValidRange(requirement.version, { loose: false }) === null
  ) return failure(baseDiagnostic.location, "/version")

  const versions = mapGet(state.byId, requirement.id) as ReadonlyMap<string, CatalogEntry> | undefined
  const candidates: CatalogEntry[] = []
  if (versions !== undefined) {
    forEachMap(versions, (entryValue) => {
      const entry = entryValue as CatalogEntry
      if (semverSatisfies(entry.evidence.version, requirement.version, { loose: false })) push(candidates, entry)
    })
  }
  if (candidates.length === 0) return failure(baseDiagnostic.location, "/version")
  let highest = candidates[0]
  let tied = false
  for (let index = 1; index < candidates.length; index += 1) {
    const compared = semverCompare(candidates[index].evidence.version, highest.evidence.version)
    if (compared > 0) {
      highest = candidates[index]
      tied = false
    } else if (compared === 0 && candidates[index].evidence.version !== highest.evidence.version) {
      tied = true
    }
  }
  if (tied) return failure(baseDiagnostic.location, "/version")
  const mismatch = firstContractMismatch(highest.evidence, requirement)
  if (mismatch !== undefined) return failure(baseDiagnostic.location, mismatch)

  const lockEvidence = objectFreeze({
    id: highest.evidence.id,
    requestedVersion: requirement.version,
    exactVersion: highest.evidence.version,
    contractDigest: highest.evidence.contractDigest,
    inputSchema: highest.evidence.inputSchema,
    output: highest.evidence.output,
    errorSchema: highest.evidence.errorSchema,
    sideEffect: highest.evidence.sideEffect,
    idempotency: highest.evidence.idempotency,
    requiredCapabilities: highest.evidence.requiredCapabilities
  })
  return objectFreeze({
    ok: true as const,
    lockEvidence,
    dispatchHandle: highest.handle,
    diagnostics: EMPTY_DIAGNOSTICS
  })
}

function validateContractForRegistration(value: unknown): {
  readonly evidence: WorkflowProviderContractEvidence
  readonly dispatch: WorkflowProviderDispatch
} {
  const snapshot = snapshotExactOrThrow(value, CONTRACT_FIELDS, "Workflow provider contract")
  assertId(snapshot.id, "Workflow provider id")
  assertExactVersion(snapshot.version)
  const inputSchema = validateSchemaOrThrow(snapshot.inputSchema, "Workflow provider input schema")
  const output = validateOutputOrThrow(snapshot.output, "Workflow provider output")
  const errorSchema = validateSchemaOrThrow(snapshot.errorSchema, "Workflow provider error schema")
  const sideEffect = assertSideEffect(snapshot.sideEffect)
  const idempotency = assertIdempotency(snapshot.idempotency)
  const requiredCapabilities = validateCapabilitiesOrThrow(snapshot.requiredCapabilities)
  assertReservedCapabilities(sideEffect, requiredCapabilities)
  if (typeof snapshot.dispatch !== "function" || isProxy(snapshot.dispatch)) {
    throw new TypeError("Workflow provider dispatch must be a non-Proxy callable.")
  }
  const preimage = objectFreeze({
    id: snapshot.id as string,
    version: snapshot.version as string,
    inputSchema,
    output,
    errorSchema,
    sideEffect,
    idempotency,
    requiredCapabilities
  })
  const contractDigest = canonicalDigest(preimage) as Sha256Digest
  const evidence = objectFreeze({ ...preimage, contractDigest })
  return objectFreeze({ evidence, dispatch: snapshot.dispatch as WorkflowProviderDispatch })
}

function validateRequirement(value: unknown): ValidationResult<WorkflowProviderContractRequirement> {
  const record = snapshotRecord(value)
  if (!record.ok) return record
  const snapshot = record.value
  if (!objectHasOwn(snapshot, "id")) return invalid("/id")
  if (!validId(snapshot.id)) return invalid("/id")
  if (!objectHasOwn(snapshot, "version")) return invalid("/version")
  if (typeof snapshot.version !== "string") return invalid("/version")
  if (!objectHasOwn(snapshot, "inputSchema")) return invalid("/inputSchema")
  const inputSchema = validateSchema(snapshot.inputSchema, "/inputSchema")
  if (!inputSchema.ok) return inputSchema
  if (!objectHasOwn(snapshot, "output")) return invalid("/output")
  const output = validateOutput(snapshot.output, "/output")
  if (!output.ok) return output
  if (!objectHasOwn(snapshot, "errorSchema")) return invalid("/errorSchema")
  const errorSchema = validateSchema(snapshot.errorSchema, "/errorSchema")
  if (!errorSchema.ok) return errorSchema
  if (!objectHasOwn(snapshot, "sideEffect")) return invalid("/sideEffect")
  if (!validSideEffect(snapshot.sideEffect)) return invalid("/sideEffect")
  if (!objectHasOwn(snapshot, "idempotency")) return invalid("/idempotency")
  if (!validIdempotency(snapshot.idempotency)) return invalid("/idempotency")
  if (!objectHasOwn(snapshot, "requiredCapabilities")) return invalid("/requiredCapabilities")
  const capabilities = validateCapabilities(snapshot.requiredCapabilities, "/requiredCapabilities")
  if (!capabilities.ok) return capabilities
  const reservedPointer = reservedCapabilitiesFailurePointer(snapshot.sideEffect, capabilities.value)
  if (reservedPointer !== undefined) return invalid(reservedPointer)
  const unknown = firstUnknownField(snapshot, REQUIREMENT_FIELDS, "")
  if (unknown !== undefined) return invalid(unknown)
  return valid(objectFreeze({
    id: snapshot.id as string,
    version: snapshot.version,
    inputSchema: inputSchema.value,
    output: output.value,
    errorSchema: errorSchema.value,
    sideEffect: snapshot.sideEffect,
    idempotency: snapshot.idempotency,
    requiredCapabilities: capabilities.value
  }))
}

function validateSchema(value: unknown, pointer: string): ValidationResult<WorkflowProviderSchemaEvidence> {
  const record = snapshotRecord(value, pointer)
  if (!record.ok) return record
  if (!objectHasOwn(record.value, "id")) return invalid(`${pointer}/id`)
  if (!validSchemaId(record.value.id)) return invalid(`${pointer}/id`)
  if (!objectHasOwn(record.value, "bytes")) return invalid(`${pointer}/bytes`)
  if (!validSchemaBytes(record.value.bytes)) return invalid(`${pointer}/bytes`)
  if (!objectHasOwn(record.value, "digest")) return invalid(`${pointer}/digest`)
  if (!validDigest(record.value.digest)) return invalid(`${pointer}/digest`)
  const unknown = firstUnknownField(record.value, SCHEMA_FIELDS, pointer)
  if (unknown !== undefined) return invalid(unknown)
  return valid(objectFreeze({
    id: record.value.id as string,
    bytes: record.value.bytes as number,
    digest: record.value.digest as Sha256Digest
  }))
}

function validateOutput(value: unknown, pointer: string): ValidationResult<WorkflowProviderOutputEvidence> {
  const record = snapshotRecord(value, pointer)
  if (!record.ok) return record
  if (!objectHasOwn(record.value, "kind")) return invalid(`${pointer}/kind`)
  if (record.value.kind === "unit") {
    const unknown = firstUnknownField(record.value, OUTPUT_UNIT_FIELDS, pointer)
    return unknown === undefined ? valid(objectFreeze({ kind: "unit" as const })) : invalid(unknown)
  }
  if (record.value.kind !== "value") return invalid(`${pointer}/kind`)
  if (!objectHasOwn(record.value, "schema")) return invalid(`${pointer}/schema`)
  const schema = validateSchema(record.value.schema, `${pointer}/schema`)
  if (!schema.ok) return schema
  const unknown = firstUnknownField(record.value, OUTPUT_VALUE_FIELDS, pointer)
  return unknown === undefined
    ? valid(objectFreeze({ kind: "value" as const, schema: schema.value }))
    : invalid(unknown)
}

function validateCapabilities(value: unknown, pointer: string): ValidationResult<readonly string[]> {
  const array = snapshotArray(value, pointer)
  if (!array.ok) return array
  if (array.value.length > 128) return invalid(pointer)
  const detached: string[] = []
  for (let index = 0; index < array.value.length; index += 1) {
    const item = array.value[index]
    if (!validId(item)) return invalid(`${pointer}/${index}`)
    if (index > 0 && detached[index - 1] >= item) return invalid(`${pointer}/${index}`)
    push(detached, item)
  }
  return valid(objectFreeze(detached))
}

function firstContractMismatch(
  evidence: WorkflowProviderContractEvidence,
  requirement: WorkflowProviderContractRequirement
): string | undefined {
  return compareSchema(evidence.inputSchema, requirement.inputSchema, "/inputSchema")
    ?? compareOutput(evidence.output, requirement.output)
    ?? compareSchema(evidence.errorSchema, requirement.errorSchema, "/errorSchema")
    ?? (evidence.sideEffect === requirement.sideEffect ? undefined : "/sideEffect")
    ?? (evidence.idempotency === requirement.idempotency ? undefined : "/idempotency")
    ?? compareCapabilities(evidence.requiredCapabilities, requirement.requiredCapabilities)
}

function compareSchema(
  left: WorkflowProviderSchemaEvidence,
  right: WorkflowProviderSchemaEvidence,
  pointer: string
): string | undefined {
  if (left.id !== right.id) return `${pointer}/id`
  if (left.bytes !== right.bytes) return `${pointer}/bytes`
  if (left.digest !== right.digest) return `${pointer}/digest`
  return undefined
}

function compareOutput(left: WorkflowProviderOutputEvidence, right: WorkflowProviderOutputEvidence): string | undefined {
  if (left.kind !== right.kind) return "/output/kind"
  if (left.kind === "value" && right.kind === "value") return compareSchema(left.schema, right.schema, "/output/schema")
  return undefined
}

function compareCapabilities(left: readonly string[], right: readonly string[]): string | undefined {
  const length = left.length < right.length ? left.length : right.length
  for (let index = 0; index < length; index += 1) {
    if (left[index] !== right[index]) return `/requiredCapabilities/${index}`
  }
  return left.length === right.length ? undefined : `/requiredCapabilities/${length}`
}

function failure(location: WorkflowContractV2DiagnosticLocation, pointer: string): BindWorkflowProviderResult {
  const diagnostic = createDiagnostic({
    code: "WF2_PROVIDER_CONTRACT_MISMATCH",
    severity: "error",
    message: "Workflow provider contract does not match.",
    location: { path: location.path, pointer: `${location.pointer}${pointer}` }
  })
  return objectFreeze({ ok: false as const, diagnostics: objectFreeze([diagnostic]) })
}

function snapshotExactOrThrow(value: unknown, fields: readonly string[], label: string): RecordSnapshot {
  const result = snapshotRecord(value)
  if (!result.ok) throw new TypeError(`${label} must be an exact ordinary own-data record.`)
  const required = validateRequiredFields(result.value, fields, "")
  if (!required.ok) throw new TypeError(`${label} is missing a required field.`)
  const unknown = firstUnknownField(result.value, fields, "")
  if (unknown !== undefined) throw new TypeError(`${label} has an unknown field.`)
  return result.value
}

function snapshotRecord(value: unknown, pointer = ""): ValidationResult<RecordSnapshot> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || arrayIsArray(value)
  ) return invalid(pointer)
  const prototype = objectGetPrototypeOf(value)
  if (prototype !== objectPrototype && prototype !== null) return invalid(pointer)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const snapshot = objectCreate(null) as Record<string, unknown>
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]
    if (typeof key !== "string") return invalid(pointer)
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !("value" in descriptor)) return invalid(pointer)
    snapshot[key] = descriptor.value
  }
  return valid(objectFreeze(snapshot))
}

function snapshotArray(value: unknown, pointer: string): ValidationResult<readonly unknown[]> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || !arrayIsArray(value)
    || objectGetPrototypeOf(value) !== arrayPrototype
  ) return invalid(pointer)
  const descriptors = objectGetOwnPropertyDescriptors(value) as unknown as Record<string, PropertyDescriptor>
  const keys = reflectOwnKeys(descriptors)
  const lengthDescriptor = descriptors["length"]
  if (
    lengthDescriptor === undefined
    || !("value" in lengthDescriptor)
    || lengthDescriptor.enumerable
    || !numberIsSafeInteger(lengthDescriptor.value)
    || lengthDescriptor.value < 0
    || keys.length !== lengthDescriptor.value + 1
  ) return invalid(pointer)
  const detached: unknown[] = []
  for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
    const key = keys[keyIndex]
    if (key === "length") continue
    if (typeof key !== "string" || !testPattern(INDEX_PATTERN, key)) return invalid(pointer)
    const index = parseCanonicalIndex(key)
    if (index === undefined || index >= lengthDescriptor.value || numberAsString(index) !== key) return invalid(pointer)
    const descriptor = descriptors[key]
    if (!descriptor.enumerable || !("value" in descriptor)) return invalid(pointer)
    detached[index] = descriptor.value
  }
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    if (!objectHasOwn(detached, index)) return invalid(pointer)
  }
  return valid(objectFreeze(detached))
}

function validateRequiredFields(
  snapshot: RecordSnapshot,
  fields: readonly string[],
  pointer: string
): ValidationResult<true> {
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]
    if (!(field in snapshot)) return invalid(`${pointer}/${escapePointer(field)}`)
  }
  return valid(true)
}

function firstUnknownField(snapshot: RecordSnapshot, fields: readonly string[], pointer: string): string | undefined {
  const keys = objectKeys(snapshot)
  const unknown: string[] = []
  for (let index = 0; index < keys.length; index += 1) {
    if (!includes(fields, keys[index])) push(unknown, keys[index])
  }
  sortStrings(unknown)
  return unknown.length === 0 ? undefined : `${pointer}/${escapePointer(unknown[0])}`
}

function validateSchemaOrThrow(value: unknown, label: string): WorkflowProviderSchemaEvidence {
  const result = validateSchema(value, "")
  if (!result.ok) throw new TypeError(`${label} is invalid.`)
  return result.value
}

function validateOutputOrThrow(value: unknown, label: string): WorkflowProviderOutputEvidence {
  const result = validateOutput(value, "")
  if (!result.ok) throw new TypeError(`${label} is invalid.`)
  return result.value
}

function validateCapabilitiesOrThrow(value: unknown): readonly string[] {
  const result = validateCapabilities(value, "")
  if (!result.ok) throw new TypeError("Workflow provider capabilities are invalid.")
  return result.value
}

function assertId(value: unknown, label: string): asserts value is string {
  if (!validId(value)) throw new TypeError(`${label} is invalid.`)
}

function validId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= 128 && testPattern(ID_PATTERN, value)
}

function validSchemaId(value: unknown): value is string {
  return typeof value === "string"
    && reflectNormalize(value) === value
    && bufferByteLength(value, "utf8") <= 240
    && testPattern(SCHEMA_ID_PATTERN, value)
}

function validSchemaBytes(value: unknown): value is number {
  return typeof value === "number" && numberIsSafeInteger(value) && value >= 1 && value <= 4_194_304
}

function validDigest(value: unknown): value is Sha256Digest {
  return typeof value === "string" && testPattern(DIGEST_PATTERN, value)
}

function assertExactVersion(value: unknown): asserts value is string {
  if (typeof value !== "string") throw new TypeError("Workflow provider version is invalid.")
  const parsed = semverParse(value, { loose: false })
  const reconstructed = parsed === null
    ? undefined
    : `${parsed.version}${parsed.build.length > 0 ? `+${reflectApply(arrayJoin, parsed.build, ["."]) as string}` : ""}`
  if (reconstructed !== value) throw new TypeError("Workflow provider version must be canonical strict SemVer.")
}

function assertSideEffect(value: unknown): SideEffect {
  if (!validSideEffect(value)) throw new TypeError("Workflow provider side effect is invalid.")
  return value
}

function validSideEffect(value: unknown): value is SideEffect {
  return value === "none" || value === "workspace-write" || value === "external"
}

function assertIdempotency(value: unknown): Idempotency {
  if (!validIdempotency(value)) throw new TypeError("Workflow provider idempotency is invalid.")
  return value
}

function validIdempotency(value: unknown): value is Idempotency {
  return value === "idempotent" || value === "key-required" || value === "non-idempotent"
}

function assertReservedCapabilities(sideEffect: SideEffect, capabilities: readonly string[]): void {
  if (!reservedCapabilitiesValid(sideEffect, capabilities)) {
    throw new TypeError("Workflow provider reserved capabilities do not match its side effect.")
  }
}

function reservedCapabilitiesValid(sideEffect: SideEffect, capabilities: readonly string[]): boolean {
  const workspace = includes(capabilities, RESERVED_WORKSPACE)
  const external = includes(capabilities, RESERVED_EXTERNAL)
  return sideEffect === "none"
    ? !workspace && !external
    : sideEffect === "workspace-write"
      ? workspace && !external
      : external && !workspace
}

function getOrCreateVersionMap(
  byId: Map<string, Map<string, RegisteredProvider>>,
  id: string
): Map<string, RegisteredProvider> {
  const existing = mapGet(byId, id) as Map<string, RegisteredProvider> | undefined
  if (existing !== undefined) return existing
  const created = new MapConstructor<string, RegisteredProvider>()
  mapSet(byId, id, created)
  return created
}

function sortEntries(entries: CatalogEntry[]): void {
  reflectApply(arraySort, entries, [(left: CatalogEntry, right: CatalogEntry) =>
    codeUnitCompare(left.evidence.id, right.evidence.id)
    || codeUnitCompare(left.evidence.version, right.evidence.version)])
}

function sortStrings(values: string[]): void {
  reflectApply(arraySort, values, [codeUnitCompare])
}

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function escapePointer(value: string): string {
  const tilde = reflectApply(stringReplace, value, [/~/gu, "~0"]) as string
  return reflectApply(stringReplace, tilde, [/\//gu, "~1"]) as string
}

function testPattern(pattern: RegExp, value: string): boolean {
  return reflectApply(regexpExec, pattern, [value]) !== null
}

function reflectNormalize(value: string): string {
  return reflectApply(stringNormalize, value, ["NFC"]) as string
}

function reservedCapabilitiesFailurePointer(
  sideEffect: SideEffect,
  capabilities: readonly string[]
): string | undefined {
  const workspaceIndex = indexOf(capabilities, RESERVED_WORKSPACE)
  const externalIndex = indexOf(capabilities, RESERVED_EXTERNAL)
  if (sideEffect === "none") {
    if (workspaceIndex >= 0) return `/requiredCapabilities/${workspaceIndex}`
    return externalIndex >= 0 ? `/requiredCapabilities/${externalIndex}` : undefined
  }
  if (sideEffect === "workspace-write") {
    if (externalIndex >= 0) return `/requiredCapabilities/${externalIndex}`
    return workspaceIndex >= 0 ? undefined : "/requiredCapabilities"
  }
  if (workspaceIndex >= 0) return `/requiredCapabilities/${workspaceIndex}`
  return externalIndex >= 0 ? undefined : "/requiredCapabilities"
}

function includes(values: readonly string[], expected: string): boolean {
  return indexOf(values, expected) >= 0
}

function indexOf(values: readonly string[], expected: string): number {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === expected) return index
  }
  return -1
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}

function forEachMap<K, V>(map: ReadonlyMap<K, V>, callback: (value: V, key: K) => void): void {
  reflectApply(mapForEach, undefined, [map, callback])
}

function getMapSize(map: ReadonlyMap<unknown, unknown>): number {
  return reflectApply(mapSizeGetter, map, []) as number
}

function parseCanonicalIndex(value: string): number | undefined {
  const result = reflectApply(NumberConstructor, undefined, [value]) as number
  return numberIsSafeInteger(result) ? result : undefined
}

function numberAsString(value: number): string {
  return reflectApply(numberToString, value, []) as string
}

function valid<T>(value: T): ValidationResult<T> {
  return { ok: true, value }
}

function invalid<T = never>(pointer: string): ValidationResult<T> {
  return { ok: false, pointer }
}
