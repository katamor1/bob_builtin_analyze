import * as nodeCrypto from "node:crypto"
import { types as utilTypes } from "node:util"

import {
  buildWorkflowArtifactSetV2,
  decodeWorkflowArtifactSetV2,
  workflowArtifactSetV2Digest,
  type WorkflowArtifactSetEntryV2,
  type WorkflowArtifactSetV2
} from "./artifactSetV2"
import {
  allocateAttemptArtifactWorkspace,
  listAttemptArtifactWorkspaceFiles,
  promoteAttemptArtifactWorkspace,
  readCommittedAttemptArtifactFile,
  readCommittedAttemptArtifactSetBytes,
  readVerifiedAttemptArtifactWorkspaceFile,
  writeAttemptArtifactSetFile,
  writeAttemptArtifactWorkspaceFile,
  type AttemptArtifactWorkspace
} from "./attemptArtifactWorkspace"
import {
  requireCompiledWorkflowPlanState,
  type CompiledWorkflowPlan,
  type CompiledWorkflowPlanPrivateState,
  type CompiledWorkflowStep
} from "./compiledPlan"
import {
  validateLocalJsonSchemaViewValue,
  type CompiledLocalJsonSchemaView
} from "./jsonSchemaCatalog"
import { parseStrictJson } from "./packageLoaderInput"
import {
  requireActiveWorkflowPlanLeaseHandle,
  type WorkflowPlanLease
} from "./planLease"
import {
  createWorkflowAttemptStaging,
  type WorkflowAttemptStaging
} from "./providerAttemptStaging"
import { snapshotBoundedWorkflowProviderEnvelope } from "./providerEnvelopeSnapshot"
import type { Sha256Digest } from "./providerContract"

export interface WorkflowArtifactTransaction {
  readonly __workflowArtifactTransactionBrand?: never
}

interface ArtifactDeclaration {
  readonly id: string
  readonly path: string
  readonly schema: string
  readonly mediaType: string
  readonly maxBytes: number
  readonly required: boolean
  readonly compiledSchema: CompiledLocalJsonSchemaView
}

interface TransactionState {
  readonly lease: WorkflowPlanLease
  readonly workspace: AttemptArtifactWorkspace
  readonly attempt: WorkflowAttemptStaging
  readonly workflowId: string
  readonly stepId: string
  readonly attemptId: string
  readonly inputDigest: Sha256Digest
  readonly planDigest: Sha256Digest
  readonly packageDigest: Sha256Digest
  readonly declarations: readonly ArtifactDeclaration[]
  readonly stagedIds: Set<string>
  status: "open" | "promoted" | "committed" | "orphaned"
}

export interface CommittedWorkflowArtifactSetV2 {
  readonly artifactSet: WorkflowArtifactSetV2
  readonly artifactSetDigest: Sha256Digest
}

export type WorkflowArtifactTransactionInspection =
  | { readonly status: "missing" }
  | { readonly status: "orphaned"; readonly artifactSetDigest: Sha256Digest }
  | {
      readonly status: "committed"
      readonly artifactSet: WorkflowArtifactSetV2
      readonly artifactSetDigest: Sha256Digest
    }

const isProxy = utilTypes.isProxy
const createHash = nodeCrypto.createHash
const hashUpdate = nodeCrypto.Hash.prototype.update
const hashDigest = nodeCrypto.Hash.prototype.digest
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const setAdd = Set.prototype.add
const setHas = Set.prototype.has
const SetConstructor = Set
const states = new WeakMap<object, TransactionState>()
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, TransactionState>, key: object
) => TransactionState | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, TransactionState>, key: object, value: TransactionState
) => WeakMap<object, TransactionState>
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u
const ATTEMPT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u
const STEP_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const OPEN_FIELDS = objectFreeze(["lease", "runRoot", "attemptId", "stepId", "inputDigest"] as const)
const INSPECT_REQUIRED_FIELDS = objectFreeze(["runRoot", "attemptId"] as const)
const INSPECT_OPTIONAL_FIELDS = objectFreeze(["expectedArtifactSetDigest"] as const)
const MAX_ARTIFACT_SET_BYTES = 4_194_304

export async function openWorkflowArtifactTransaction(input: {
  readonly lease: WorkflowPlanLease
  readonly runRoot: string
  readonly attemptId: string
  readonly stepId: string
  readonly inputDigest: Sha256Digest
}): Promise<WorkflowArtifactTransaction> {
  const snapshot = snapshotExactRecord(input, OPEN_FIELDS, "Workflow artifact transaction input")
  const lease = snapshot.lease as WorkflowPlanLease
  const handle = requireActiveWorkflowPlanLeaseHandle(lease)
  const privateState = requireCompiledWorkflowPlanState(handle)
  if (
    privateState.purpose !== "runtime"
    || !privateState.leaseable
    || privateState.publication !== "published"
  ) throw new TypeError("Workflow artifact transaction requires a live runtime plan lease.")
  const stepId = requireStepId(snapshot.stepId)
  const attemptId = requireAttemptId(snapshot.attemptId)
  const inputDigest = requireDigest(snapshot.inputDigest, "Workflow artifact transaction inputDigest")
  if (typeof snapshot.runRoot !== "string") {
    throw new TypeError("Workflow artifact transaction runRoot is invalid.")
  }
  const step = findCommandStep(handle.plan.workflow.steps, stepId)
  const declarations = artifactDeclarations(handle.plan, privateState, step)
  const workspace = await allocateAttemptArtifactWorkspace(snapshot.runRoot, attemptId)

  let state!: TransactionState
  const attempt = createWorkflowAttemptStaging({
    stageArtifact: async (artifact) => {
      if (state.status !== "open") throw new Error("Workflow artifact transaction is no longer open.")
      const declaration = findDeclaration(state.declarations, artifact.id)
      if (declaration === undefined) {
        throw new Error("Workflow provider attempted to stage an undeclared artifact.")
      }
      if (reflectApply(setHas, state.stagedIds, [artifact.id]) as boolean) {
        throw new Error("Workflow provider attempted to stage a duplicate artifact.")
      }
      await writeAttemptArtifactWorkspaceFile(state.workspace, declaration.path, artifact.bytes)
      reflectApply(setAdd, state.stagedIds, [artifact.id])
    }
  })
  state = {
    lease,
    workspace,
    attempt,
    workflowId: handle.plan.workflowId,
    stepId,
    attemptId,
    inputDigest,
    planDigest: handle.planDigest,
    packageDigest: handle.plan.packageDigest,
    declarations,
    stagedIds: new SetConstructor<string>(),
    status: "open"
  }
  const transaction = objectFreeze({}) as WorkflowArtifactTransaction
  weakMapSet(states, transaction, state)
  return transaction
}

export function workflowArtifactTransactionAttempt(
  transaction: WorkflowArtifactTransaction
): WorkflowAttemptStaging {
  return requireTransactionState(transaction).attempt
}

export async function commitWorkflowArtifactTransaction(
  transaction: WorkflowArtifactTransaction,
  commitVisibility: (evidence: CommittedWorkflowArtifactSetV2) => Promise<void> | void
): Promise<CommittedWorkflowArtifactSetV2> {
  const state = requireOpenTransactionState(transaction)
  if (typeof commitVisibility !== "function" || isProxy(commitVisibility)) {
    throw new TypeError("Workflow artifact visibility commit callback is invalid.")
  }
  const handle = requireActiveWorkflowPlanLeaseHandle(state.lease)
  if (handle.planDigest !== state.planDigest || handle.plan.packageDigest !== state.packageDigest) {
    throw new Error("Workflow artifact transaction plan evidence changed.")
  }
  for (let index = 0; index < state.declarations.length; index += 1) {
    const declaration = state.declarations[index]
    if (declaration.required && !(reflectApply(setHas, state.stagedIds, [declaration.id]) as boolean)) {
      throw new Error("Workflow artifact transaction is missing a required artifact.")
    }
  }

  const expectedPaths: string[] = []
  for (let index = 0; index < state.declarations.length; index += 1) {
    const declaration = state.declarations[index]
    if (reflectApply(setHas, state.stagedIds, [declaration.id]) as boolean) expectedPaths.push(declaration.path)
  }
  expectedPaths.sort()
  const observedPaths = await listAttemptArtifactWorkspaceFiles(state.workspace)
  if (!sameStringArray(observedPaths, expectedPaths)) {
    throw new Error("Workflow artifact staging set contains missing or extra files.")
  }

  const entries: WorkflowArtifactSetEntryV2[] = []
  for (let index = 0; index < state.declarations.length; index += 1) {
    const declaration = state.declarations[index]
    if (!(reflectApply(setHas, state.stagedIds, [declaration.id]) as boolean)) continue
    const verified = await readVerifiedAttemptArtifactWorkspaceFile(
      state.workspace,
      declaration.path,
      declaration.maxBytes
    )
    validateArtifactSchema(declaration, verified.bytes)
    entries.push(objectFreeze({
      id: declaration.id,
      path: declaration.path,
      schema: declaration.schema,
      sha256: sha256(verified.bytes),
      bytes: verified.bytes.byteLength,
      mediaType: declaration.mediaType,
      producer: state.stepId,
      producerAttempt: state.attemptId,
      source: "runtime-staged" as const,
      inputDigest: state.inputDigest,
      planDigest: state.planDigest,
      verification: "verified" as const
    }))
  }
  entries.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  const artifactSetEvidence = buildWorkflowArtifactSetV2({
    workflowId: state.workflowId,
    stepId: state.stepId,
    attemptId: state.attemptId,
    planDigest: state.planDigest,
    packageDigest: state.packageDigest,
    inputDigest: state.inputDigest,
    entries: objectFreeze(entries)
  })
  if (artifactSetEvidence.bytes.byteLength > MAX_ARTIFACT_SET_BYTES) {
    throw new Error("Workflow artifact-set evidence exceeds its byte limit.")
  }
  await writeAttemptArtifactSetFile(state.workspace, artifactSetEvidence.bytes)
  await promoteAttemptArtifactWorkspace(state.workspace)
  state.status = "promoted"
  const committed = objectFreeze({
    artifactSet: artifactSetEvidence.artifactSet,
    artifactSetDigest: artifactSetEvidence.artifactSetDigest
  })
  try {
    await reflectApply(commitVisibility, undefined, [committed])
  } catch (error) {
    state.status = "orphaned"
    throw error
  }
  state.status = "committed"
  return committed
}

export async function inspectCommittedWorkflowArtifactTransaction(input: {
  readonly runRoot: string
  readonly attemptId: string
  readonly expectedArtifactSetDigest?: Sha256Digest
}): Promise<WorkflowArtifactTransactionInspection> {
  const snapshot = snapshotRecord(
    input,
    INSPECT_REQUIRED_FIELDS,
    INSPECT_OPTIONAL_FIELDS,
    "Workflow artifact transaction inspection"
  )
  if (typeof snapshot.runRoot !== "string") {
    throw new TypeError("Workflow artifact inspection runRoot is invalid.")
  }
  const attemptId = requireAttemptId(snapshot.attemptId)
  const bytes = await readCommittedAttemptArtifactSetBytes({
    runRoot: snapshot.runRoot,
    attemptId
  })
  if (bytes === undefined) return objectFreeze({ status: "missing" as const })
  if (bytes.byteLength > MAX_ARTIFACT_SET_BYTES) {
    throw new Error("Workflow artifact-set evidence exceeds its byte limit.")
  }
  const artifactSet = decodeWorkflowArtifactSetV2(parseStrictJson(bytes, "Workflow artifact-set"))
  if (artifactSet.attemptId !== attemptId) {
    throw new Error("Workflow artifact-set attempt identity does not match its directory.")
  }
  const artifactSetDigest = workflowArtifactSetV2Digest(artifactSet)
  if (snapshot.expectedArtifactSetDigest === undefined) {
    return objectFreeze({ status: "orphaned" as const, artifactSetDigest })
  }
  const expected = requireDigest(
    snapshot.expectedArtifactSetDigest,
    "Workflow artifact inspection expected digest"
  )
  if (artifactSetDigest !== expected) {
    throw new Error("Workflow artifact-set digest does not match committed visibility evidence.")
  }
  for (let index = 0; index < artifactSet.entries.length; index += 1) {
    const entry = artifactSet.entries[index]
    const fileBytes = await readCommittedAttemptArtifactFile({
      runRoot: snapshot.runRoot,
      attemptId,
      relativePath: entry.path,
      maximumBytes: entry.bytes
    })
    if (fileBytes.byteLength !== entry.bytes || sha256(fileBytes) !== entry.sha256) {
      throw new Error("Workflow committed artifact bytes do not match artifact-set evidence.")
    }
  }
  return objectFreeze({
    status: "committed" as const,
    artifactSet,
    artifactSetDigest
  })
}

function artifactDeclarations(
  plan: CompiledWorkflowPlan,
  privateState: CompiledWorkflowPlanPrivateState,
  step: Extract<CompiledWorkflowStep, { readonly type: "command" }>
): readonly ArtifactDeclaration[] {
  const declarations: ArtifactDeclaration[] = []
  for (let refIndex = 0; refIndex < step.artifacts.length; refIndex += 1) {
    const id = step.artifacts[refIndex]
    for (let index = 0; index < plan.requiredArtifacts.length; index += 1) {
      const artifact = plan.requiredArtifacts[index]
      if (artifact.id !== id || artifact.producedBy !== step.id || artifact.owner !== "provider") continue
      declarations.push(objectFreeze({
        id: artifact.id,
        path: artifact.path,
        schema: artifact.schema,
        mediaType: artifact.mediaType,
        maxBytes: artifact.maxBytes,
        required: artifact.required,
        compiledSchema: findSchema(privateState, artifact.schema)
      }))
      break
    }
  }
  declarations.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  return objectFreeze(declarations)
}

function validateArtifactSchema(declaration: ArtifactDeclaration, bytes: Uint8Array): void {
  if (!isJsonMediaType(declaration.mediaType)) {
    throw new Error("Workflow Contract v2 artifact validation currently requires a JSON media type.")
  }
  let parsed: unknown
  try {
    parsed = parseStrictJson(bytes, `Workflow artifact ${declaration.id}`)
  } catch {
    throw new Error("Workflow artifact is not valid canonical JSON input.")
  }
  const bounded = snapshotBoundedWorkflowProviderEnvelope(parsed, declaration.maxBytes)
  if (bounded === undefined) {
    throw new Error("Workflow artifact JSON exceeds its structural budget.")
  }
  const validated = validateLocalJsonSchemaViewValue({
    compiled: declaration.compiledSchema,
    value: bounded,
    diagnosticCode: "WF2_ARTIFACT_SCHEMA_INVALID",
    location: objectFreeze({ path: declaration.path, pointer: "" })
  })
  if (!validated.ok) throw new Error("Workflow artifact failed its compiled schema validation.")
}

function findCommandStep(
  steps: readonly CompiledWorkflowStep[],
  stepId: string
): Extract<CompiledWorkflowStep, { readonly type: "command" }> {
  for (let index = 0; index < steps.length; index += 1) {
    if (steps[index].id === stepId && steps[index].type === "command") {
      return steps[index] as Extract<CompiledWorkflowStep, { readonly type: "command" }>
    }
  }
  throw new TypeError("Workflow artifact transaction command step is unavailable.")
}

function findSchema(
  state: CompiledWorkflowPlanPrivateState,
  id: string
): CompiledLocalJsonSchemaView {
  for (let index = 0; index < state.schemas.length; index += 1) {
    if (state.schemas[index].id === id) return state.schemas[index].compiled
  }
  throw new TypeError("Workflow artifact transaction schema is unavailable.")
}

function findDeclaration(
  declarations: readonly ArtifactDeclaration[],
  id: string
): ArtifactDeclaration | undefined {
  for (let index = 0; index < declarations.length; index += 1) {
    if (declarations[index].id === id) return declarations[index]
  }
  return undefined
}

function requireTransactionState(value: unknown): TransactionState {
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw new TypeError("Workflow artifact transaction is invalid.")
  }
  const state = weakMapGet(states, value)
  if (state === undefined) throw new TypeError("Workflow artifact transaction is invalid.")
  return state
}

function requireOpenTransactionState(value: unknown): TransactionState {
  const state = requireTransactionState(value)
  if (state.status !== "open") throw new Error("Workflow artifact transaction is no longer open.")
  return state
}

function requireAttemptId(value: unknown): string {
  if (typeof value !== "string" || !ATTEMPT_PATTERN.test(value) || /[. ]$/u.test(value)) {
    throw new TypeError("Workflow artifact transaction attempt id is invalid.")
  }
  return value
}

function requireStepId(value: unknown): string {
  if (typeof value !== "string" || !STEP_PATTERN.test(value)) {
    throw new TypeError("Workflow artifact transaction step id is invalid.")
  }
  return value
}

function requireDigest(value: unknown, label: string): Sha256Digest {
  if (typeof value !== "string" || !DIGEST_PATTERN.test(value)) {
    throw new TypeError(`${label} is invalid.`)
  }
  return value as Sha256Digest
}

function snapshotExactRecord<const Fields extends readonly string[]>(
  value: unknown,
  fields: Fields,
  label: string
): Readonly<Record<Fields[number], unknown>> {
  return snapshotRecord(value, fields, objectFreeze([] as const), label) as Readonly<Record<Fields[number], unknown>>
}

function snapshotRecord(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  label: string
): Readonly<Record<string, unknown>> {
  if (
    typeof value !== "object"
    || value === null
    || isProxy(value)
    || objectGetPrototypeOf(value) !== objectPrototype
  ) throw new TypeError(`${label} must be an ordinary non-proxy record.`)
  const descriptors = objectGetOwnPropertyDescriptors(value)
  const keys = reflectOwnKeys(descriptors)
  const result = Object.create(null) as Record<string, unknown>
  for (let index = 0; index < required.length; index += 1) {
    const field = required[index]
    result[field] = dataValue(descriptors[field], `${label}.${field}`)
  }
  for (let index = 0; index < optional.length; index += 1) {
    const field = optional[index]
    if (objectHasOwn(descriptors, field)) result[field] = dataValue(descriptors[field], `${label}.${field}`)
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || (!contains(required, key) && !contains(optional, key))) {
      throw new TypeError(`${label} contains an unknown field.`)
    }
  }
  if (keys.length !== required.length + optionalCount(result, optional)) {
    throw new TypeError(`${label} has an invalid shape.`)
  }
  return objectFreeze(result)
}

function dataValue(descriptor: PropertyDescriptor | undefined, label: string): unknown {
  if (
    descriptor === undefined
    || !objectHasOwn(descriptor, "value")
    || objectHasOwn(descriptor, "get")
    || objectHasOwn(descriptor, "set")
    || descriptor.enumerable !== true
  ) throw new TypeError(`${label} must be an enumerable own data property.`)
  return descriptor.value
}

function optionalCount(record: Readonly<Record<string, unknown>>, fields: readonly string[]): number {
  let count = 0
  for (let index = 0; index < fields.length; index += 1) if (objectHasOwn(record, fields[index])) count += 1
  return count
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false
  return true
}

function sha256(bytes: Uint8Array): Sha256Digest {
  const hash = reflectApply(createHash, undefined, ["sha256"]) as nodeCrypto.Hash
  reflectApply(hashUpdate, hash, [bytes])
  return `sha256:${reflectApply(hashDigest, hash, ["hex"]) as string}`
}

function isJsonMediaType(value: string): boolean {
  return value === "application/json" || value.endsWith("+json")
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
