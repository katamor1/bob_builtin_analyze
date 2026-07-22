import { types as utilTypes } from "node:util"

import { canonicalJsonBytes } from "./canonicalJson"
import {
  createWorkflowContractV2Diagnostic,
  type WorkflowContractV2Diagnostic,
  type WorkflowContractV2DiagnosticCode
} from "./diagnostics"
import {
  cloneAndFreezeJsonValue,
  type JsonObject,
  type JsonValue
} from "./jsonValue"

export const WORKFLOW_CONTRACT_V2_PACKAGE_SHAPE_POLICY =
  "workflow-contract-package-shape/v2" as const

export interface WorkflowReferenceV2 {
  readonly source: "input" | "committedOutput"
  readonly id: string
  readonly pointer: string
}

export type WorkflowValueTemplateV2 =
  | { readonly source: "literal"; readonly value: JsonValue }
  | WorkflowReferenceV2
  | { readonly source: "array"; readonly items: readonly WorkflowValueTemplateV2[] }
  | { readonly source: "object"; readonly properties: Readonly<Record<string, WorkflowValueTemplateV2>> }

export type WorkflowPredicateV2 =
  | {
      readonly kind: "equals" | "notEquals" | "greaterThan" | "greaterThanOrEqual" |
        "lessThan" | "lessThanOrEqual"
      readonly left: WorkflowReferenceV2
      readonly right: JsonValue
    }
  | {
      readonly kind: "in"
      readonly left: WorkflowReferenceV2
      readonly right: readonly JsonValue[]
    }
  | { readonly kind: "exists"; readonly left: WorkflowReferenceV2 }
  | { readonly kind: "all" | "any"; readonly predicates: readonly WorkflowPredicateV2[] }
  | { readonly kind: "not"; readonly predicate: WorkflowPredicateV2 }

export type WorkflowOutputV2 =
  | { readonly kind: "unit" }
  | {
      readonly kind: "value"
      readonly id: string
      readonly schema: string
      readonly maxBytes: number
    }

export interface WorkflowTransitionV2 {
  readonly decisions: readonly {
    readonly id: string
    readonly when: WorkflowPredicateV2
    readonly goto: string
    readonly loop?: {
      readonly id: string
      readonly maxIterations: number
      readonly extensionSize: number
      readonly checkpoint: { readonly title: string; readonly message: string }
    }
  }[]
  readonly default: { readonly goto: string }
}

export type WorkflowStepV2 =
  | {
      readonly id: string
      readonly title: string
      readonly type: "command"
      readonly required: boolean
      readonly when?: WorkflowPredicateV2
      readonly transition?: WorkflowTransitionV2
      readonly provider: string
      readonly input: WorkflowValueTemplateV2
      readonly output: WorkflowOutputV2
      readonly artifacts: readonly string[]
    }
  | {
      readonly id: string
      readonly title: string
      readonly type: "agent"
      readonly required: boolean
      readonly when?: WorkflowPredicateV2
      readonly transition?: WorkflowTransitionV2
      readonly prompt: string
      readonly context: readonly WorkflowReferenceV2[]
      readonly output: Extract<WorkflowOutputV2, { readonly kind: "value" }>
      readonly artifacts: readonly string[]
    }
  | {
      readonly id: string
      readonly title: string
      readonly type: "manual"
      readonly required: boolean
      readonly when?: WorkflowPredicateV2
      readonly transition?: WorkflowTransitionV2
      readonly prompt: string
      readonly form?: { readonly fields: readonly WorkflowManualFieldV2[] }
      readonly approval?: {
        readonly message: string
        readonly approveLabel: string
        readonly rejectLabel: string
      }
      readonly output: Extract<WorkflowOutputV2, { readonly kind: "value" }>
    }
  | {
      readonly id: string
      readonly title: string
      readonly type: "result"
      readonly required: boolean
      readonly when?: WorkflowPredicateV2
      readonly transition?: WorkflowTransitionV2
      readonly source: WorkflowReferenceV2 | { readonly source: "literal"; readonly value: JsonValue }
      readonly artifacts: readonly string[]
    }

export type WorkflowManualFieldV2 =
  | {
      readonly id: string
      readonly title: string
      readonly description?: string
      readonly type: "string"
      readonly required: boolean
      readonly default?: string
      readonly multiline: boolean
    }
  | {
      readonly id: string
      readonly title: string
      readonly description?: string
      readonly type: "number"
      readonly required: boolean
      readonly default?: number
    }
  | {
      readonly id: string
      readonly title: string
      readonly description?: string
      readonly type: "boolean"
      readonly required: boolean
      readonly default?: boolean
    }
  | {
      readonly id: string
      readonly title: string
      readonly description?: string
      readonly type: "select"
      readonly required: boolean
      readonly default?: string
      readonly options: readonly string[]
    }

export interface WorkflowPackageDocumentV2 {
  readonly schemaVersion: "workflow-register/v2"
  readonly id: string
  readonly name: string
  readonly description: string
  readonly inputs: readonly {
    readonly id: string
    readonly title: string
    readonly description?: string
    readonly schema: string
    readonly required: boolean
    readonly default?: JsonValue
    readonly requiredWhen?: WorkflowPredicateV2
  }[]
  readonly steps: readonly WorkflowStepV2[]
  readonly requiredArtifacts: readonly {
    readonly id: string
    readonly producedBy: string
    readonly path: string
    readonly mediaType: string
    readonly schema: string
    readonly maxBytes: number
    readonly owner: "provider" | "runtime"
    readonly required: boolean
  }[]
  readonly resumePolicy: {
    readonly mode: "restart-step" | "fail-closed"
    readonly maxAttempts: number
    readonly retainCommittedOutputs: boolean
    readonly allowArtifactReuse: boolean
  }
  readonly providers: readonly {
    readonly id: string
    readonly version: string
    readonly inputSchema: string
    readonly output: { readonly kind: "unit" } | { readonly kind: "value"; readonly schema: string }
    readonly errorSchema: string
    readonly sideEffect: "none" | "workspace-write" | "external"
    readonly idempotency: "idempotent" | "key-required" | "non-idempotent"
    readonly requiredCapabilities: readonly string[]
  }[]
  readonly bob: {
    readonly profile: "bob/2.0.1"
    readonly requiredCapabilities: readonly string[]
    readonly taskCapabilities: readonly string[]
  }
}

export type ValidateWorkflowContractV2PackageShapeResult =
  | {
      readonly ok: true
      readonly value: WorkflowPackageDocumentV2
      readonly diagnostics: readonly []
    }
  | {
      readonly ok: false
      readonly diagnostics: readonly WorkflowContractV2Diagnostic[]
    }

const cloneJsonValue = cloneAndFreezeJsonValue
const canonicalBytes = canonicalJsonBytes
const createDiagnostic = createWorkflowContractV2Diagnostic
const arrayIsArray = Array.isArray
const bufferByteLength = Buffer.byteLength.bind(Buffer) as (value: string, encoding?: BufferEncoding) => number
const isProxy = utilTypes.isProxy
const numberIsFinite = Number.isFinite
const numberIsSafeInteger = Number.isSafeInteger
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectKeys = Object.keys
const reflectOwnKeys = Reflect.ownKeys
const stringNormalize = String.prototype.normalize
const ordinaryObjectPrototype = Object.prototype

const SUCCESS_DIAGNOSTICS = objectFreeze([]) as readonly []
const TOP_REQUIRED = objectFreeze([
  "schemaVersion", "id", "name", "description", "inputs", "steps",
  "requiredArtifacts", "resumePolicy", "providers", "bob"
] as const)
const NO_FIELDS = objectFreeze([] as readonly string[])
const API_REQUIRED = objectFreeze(["document", "path"] as const)
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*$/u
const ARTIFACT_PATH_PATTERN = /^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*[:\\])[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u
const MEDIA_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/u
const SCHEMA_PATH_PATTERN = /^schemas\/[A-Za-z0-9._-]+\.json$/u
const PROMPT_PATH_PATTERN = /^prompts\/[A-Za-z0-9._-]+\.md$/u
const CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u
const BOB_CAPABILITIES = objectFreeze([
  "source.deactivate",
  "source.log",
  "source.registerWorkflow",
  "task.getAllMetadata",
  "task.getMessages",
  "task.sendMessage",
  "task.setStepComplete",
  "task.startSubagent",
  "task.toSerializable"
] as const)
const BOB_TASK_CAPABILITIES = objectFreeze(BOB_CAPABILITIES.filter((value) => value.startsWith("task.")))
const WORKSPACE_EFFECT_CAPABILITY = "workflow.effect.workspace-write"
const EXTERNAL_EFFECT_CAPABILITY = "workflow.effect.external"

class ShapeFailure extends Error {
  constructor(
    readonly code: WorkflowContractV2DiagnosticCode,
    readonly pointer: string,
    message: string
  ) {
    super(message)
  }
}

interface ApiSnapshot {
  readonly document: unknown
  readonly path: string
}

interface StepInfo {
  readonly index: number
  readonly id: string
  readonly type: "command" | "agent" | "manual" | "result"
  readonly record: Readonly<Record<string, JsonValue>>
  readonly output?: Readonly<Record<string, JsonValue>>
}

interface ProviderInfo {
  readonly record: Readonly<Record<string, JsonValue>>
}

interface PredicateBudget {
  nodes: number
  literalBytes: number
  readonly rootPointer: string
}

export function validateWorkflowContractV2PackageShape(input: {
  readonly document: JsonValue
  readonly path: string
}): ValidateWorkflowContractV2PackageShapeResult {
  let path = "workflow.yaml"
  try {
    const snapshot = snapshotApiInput(input)
    path = snapshot.path
    const document = cloneJsonValue(snapshot.document)
    validateDocument(document)
    validateDocumentBounds(document)
    return objectFreeze({
      ok: true,
      value: document as unknown as WorkflowPackageDocumentV2,
      diagnostics: SUCCESS_DIAGNOSTICS
    })
  } catch (error) {
    if (error instanceof ShapeFailure) return failure(path, error.code, error.pointer, error.message)
    return failure(path, "WF2_PACKAGE_LAYOUT_INVALID", "", "Workflow package document is invalid.")
  }
}

function snapshotApiInput(input: unknown): ApiSnapshot {
  if (input === null || typeof input !== "object" || isProxy(input)) throw new TypeError("invalid input")
  const prototype = objectGetPrototypeOf(input)
  if (prototype !== ordinaryObjectPrototype && prototype !== null) throw new TypeError("invalid input")
  const descriptors = objectGetOwnPropertyDescriptors(input)
  const keys = reflectOwnKeys(descriptors)
  if (keys.length !== API_REQUIRED.length) throw new TypeError("invalid input")
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !contains(API_REQUIRED, key)) throw new TypeError("invalid input")
  }
  const document = descriptorValue(descriptors, "document")
  const path = descriptorValue(descriptors, "path")
  if (typeof path !== "string") throw new TypeError("invalid input")
  return objectFreeze({ document, path })
}

function descriptorValue(descriptors: PropertyDescriptorMap, key: string): unknown {
  const descriptor = descriptors[key]
  if (
    descriptor === undefined || !objectHasOwn(descriptor, "value") ||
    objectHasOwn(descriptor, "get") || objectHasOwn(descriptor, "set")
  ) throw new TypeError("invalid input")
  return descriptor.value
}

function validateDocument(document: JsonValue): void {
  const root = exactRecord(document, "", TOP_REQUIRED, NO_FIELDS)
  if (root.schemaVersion !== "workflow-register/v2") {
    shapeFail("WF2_SCHEMA_VERSION_UNSUPPORTED", "/schemaVersion", "Workflow schema version is unsupported.")
  }
  identifier(root.id, "/id")
  humanText(root.name, "/name", 4096)
  humanText(root.description, "/description", 8192)

  const inputs = denseArray(root.inputs, "/inputs", 0, 256)
  const inputIds = new Map<string, number>()
  for (let index = 0; index < inputs.length; index += 1) {
    const pointer = `/inputs/${index}`
    const record = exactRecord(
      inputs[index],
      pointer,
      ["id", "title", "schema", "required"],
      ["description", "default", "requiredWhen"]
    )
    const id = identifier(record.id, `${pointer}/id`)
    uniqueId(inputIds, id, `${pointer}/id`)
    humanText(record.title, `${pointer}/title`, 4096)
    if (objectHasOwn(record, "description")) humanText(record.description, `${pointer}/description`, 8192)
    schemaPath(record.schema, `${pointer}/schema`)
    requiredBoolean(record.required, `${pointer}/required`)
    if (objectHasOwn(record, "requiredWhen")) validatePredicate(record.requiredWhen, `${pointer}/requiredWhen`)
  }

  const providers = denseArray(root.providers, "/providers", 0, 256)
  const providerIds = new Map<string, number>()
  const providerInfo = new Map<string, ProviderInfo>()
  for (let index = 0; index < providers.length; index += 1) {
    const pointer = `/providers/${index}`
    const record = exactRecord(
      providers[index],
      pointer,
      ["id", "version", "inputSchema", "output", "errorSchema", "sideEffect", "idempotency", "requiredCapabilities"],
      NO_FIELDS
    )
    const id = identifier(record.id, `${pointer}/id`)
    uniqueId(providerIds, id, `${pointer}/id`)
    if (typeof record.version !== "string" || !isSemverRange(record.version)) layout(`${pointer}/version`)
    schemaPath(record.inputSchema, `${pointer}/inputSchema`)
    validateProviderOutput(record.output, `${pointer}/output`)
    schemaPath(record.errorSchema, `${pointer}/errorSchema`)
    const sideEffect = enumString(record.sideEffect, ["none", "workspace-write", "external"], `${pointer}/sideEffect`)
    enumString(record.idempotency, ["idempotent", "key-required", "non-idempotent"], `${pointer}/idempotency`)
    const capabilities = capabilityArray(record.requiredCapabilities, `${pointer}/requiredCapabilities`, 128)
    validateProviderEffects(sideEffect, capabilities, `${pointer}/requiredCapabilities`)
    providerInfo.set(id, { record })
  }

  const artifacts = denseArray(root.requiredArtifacts, "/requiredArtifacts", 0, 512)
  const artifactIds = new Map<string, number>()
  const artifactInfo = new Map<string, Readonly<Record<string, JsonValue>>>()
  const exactPaths = new Map<string, number>()
  const foldedPaths = new Map<string, number>()
  for (let index = 0; index < artifacts.length; index += 1) {
    const pointer = `/requiredArtifacts/${index}`
    const record = exactRecord(
      artifacts[index],
      pointer,
      ["id", "producedBy", "path", "mediaType", "schema", "maxBytes", "owner", "required"],
      NO_FIELDS
    )
    const id = identifier(record.id, `${pointer}/id`)
    uniqueId(artifactIds, id, `${pointer}/id`)
    identifier(record.producedBy, `${pointer}/producedBy`)
    const artifactPathValue = artifactPath(record.path, `${pointer}/path`)
    if (exactPaths.has(artifactPathValue) || foldedPaths.has(artifactPathValue.toLowerCase())) {
      layout(`${pointer}/path`)
    }
    exactPaths.set(artifactPathValue, index)
    foldedPaths.set(artifactPathValue.toLowerCase(), index)
    mediaType(record.mediaType, `${pointer}/mediaType`)
    schemaPath(record.schema, `${pointer}/schema`)
    safeInteger(record.maxBytes, `${pointer}/maxBytes`, 1, 67_108_864)
    enumString(record.owner, ["provider", "runtime"], `${pointer}/owner`)
    requiredBoolean(record.required, `${pointer}/required`)
    artifactInfo.set(id, record)
  }

  const steps = denseArray(root.steps, "/steps", 1, 512)
  const stepIds = new Map<string, number>()
  const outputIds = new Map<string, number>()
  const decisionIds = new Map<string, number>()
  const loopIds = new Map<string, number>()
  const stepInfo: StepInfo[] = []
  for (let index = 0; index < steps.length; index += 1) {
    const info = validateStepShape(
      steps[index], index, stepIds, outputIds, decisionIds, loopIds
    )
    stepInfo.push(info)
  }

  validateResumePolicy(root.resumePolicy)
  validateBob(root.bob)
  validateReferencesAndSemantics(
    inputs,
    inputIds,
    stepInfo,
    stepIds,
    outputIds,
    providerInfo,
    artifactInfo
  )
}

function validateProviderOutput(value: JsonValue, pointer: string): void {
  const base = looseRecord(value, pointer)
  if (base.kind === "unit") {
    exactRecord(value, pointer, ["kind"], NO_FIELDS)
    return
  }
  if (base.kind === "value") {
    const record = exactRecord(value, pointer, ["kind", "schema"], NO_FIELDS)
    schemaPath(record.schema, `${pointer}/schema`)
    return
  }
  layout(`${pointer}/kind`)
}

function validateProviderEffects(sideEffect: string, capabilities: readonly string[], pointer: string): void {
  const workspaceIndex = indexOf(capabilities, WORKSPACE_EFFECT_CAPABILITY)
  const externalIndex = indexOf(capabilities, EXTERNAL_EFFECT_CAPABILITY)
  if (sideEffect === "none") {
    if (workspaceIndex >= 0) layout(`${pointer}/${workspaceIndex}`)
    if (externalIndex >= 0) layout(`${pointer}/${externalIndex}`)
  } else if (sideEffect === "workspace-write") {
    if (externalIndex >= 0) layout(`${pointer}/${externalIndex}`)
    if (workspaceIndex < 0) layout(pointer)
  } else {
    if (workspaceIndex >= 0) layout(`${pointer}/${workspaceIndex}`)
    if (externalIndex < 0) layout(pointer)
  }
}

function validateStepShape(
  value: JsonValue,
  index: number,
  stepIds: Map<string, number>,
  outputIds: Map<string, number>,
  decisionIds: Map<string, number>,
  loopIds: Map<string, number>
): StepInfo {
  const pointer = `/steps/${index}`
  const base = looseRecord(value, pointer)
  const type = base.type
  let required: readonly string[]
  let optional: readonly string[] = ["when", "transition"]
  if (type === "command") {
    required = ["id", "title", "type", "required", "provider", "input", "output", "artifacts"]
  } else if (type === "agent") {
    required = ["id", "title", "type", "required", "prompt", "context", "output", "artifacts"]
  } else if (type === "manual") {
    required = ["id", "title", "type", "required", "prompt", "output"]
    optional = ["when", "transition", "form", "approval"]
  } else if (type === "result") {
    required = ["id", "title", "type", "required", "source", "artifacts"]
  } else {
    layout(`${pointer}/type`)
  }
  const record = exactRecord(value, pointer, required, optional)
  const id = identifier(record.id, `${pointer}/id`)
  uniqueId(stepIds, id, `${pointer}/id`)
  humanText(record.title, `${pointer}/title`, 4096)
  requiredBoolean(record.required, `${pointer}/required`)
  if (objectHasOwn(record, "when")) validatePredicate(record.when, `${pointer}/when`)
  if (objectHasOwn(record, "transition")) {
    validateTransition(record.transition, pointer, decisionIds, loopIds)
  }

  let output: Readonly<Record<string, JsonValue>> | undefined
  if (type === "command") {
    identifier(record.provider, `${pointer}/provider`)
    validateTemplate(record.input, `${pointer}/input`, {
      nodes: 0,
      rootPointer: `${pointer}/input`
    })
    output = validateStepOutput(record.output, `${pointer}/output`, true)
    if (output.kind === "value") uniqueId(outputIds, output.id as string, `${pointer}/output/id`)
    identifierArray(record.artifacts, `${pointer}/artifacts`, 0, 128)
  } else if (type === "agent") {
    promptPath(record.prompt, `${pointer}/prompt`)
    const context = denseArray(record.context, `${pointer}/context`, 0, 256)
    const seen = new Map<string, number>()
    for (let contextIndex = 0; contextIndex < context.length; contextIndex += 1) {
      const reference = validateReference(context[contextIndex], `${pointer}/context/${contextIndex}`)
      if (reference.source !== "committedOutput") layout(`${pointer}/context/${contextIndex}/source`)
      const signature = `${reference.source}\u0000${reference.id}\u0000${reference.pointer}`
      uniqueId(seen, signature, `${pointer}/context/${contextIndex}`)
    }
    output = validateStepOutput(record.output, `${pointer}/output`, false)
    uniqueId(outputIds, output.id as string, `${pointer}/output/id`)
    identifierArray(record.artifacts, `${pointer}/artifacts`, 0, 128)
  } else if (type === "manual") {
    promptPath(record.prompt, `${pointer}/prompt`)
    if (!objectHasOwn(record, "form") && !objectHasOwn(record, "approval")) layout(pointer)
    const hasApproval = objectHasOwn(record, "approval")
    if (objectHasOwn(record, "form")) validateManualForm(record.form, `${pointer}/form`, hasApproval)
    if (hasApproval) validateApproval(record.approval, `${pointer}/approval`)
    output = validateStepOutput(record.output, `${pointer}/output`, false)
    uniqueId(outputIds, output.id as string, `${pointer}/output/id`)
  } else {
    validateResultSource(record.source, `${pointer}/source`)
    identifierArray(record.artifacts, `${pointer}/artifacts`, 0, 128)
  }
  return { index, id, type, record, output }
}

function validateStepOutput(
  value: JsonValue,
  pointer: string,
  allowUnit: boolean
): Readonly<Record<string, JsonValue>> {
  const base = looseRecord(value, pointer)
  if (base.kind === "unit") {
    if (!allowUnit) layout(`${pointer}/kind`)
    return exactRecord(value, pointer, ["kind"], NO_FIELDS)
  }
  if (base.kind !== "value") layout(`${pointer}/kind`)
  const record = exactRecord(value, pointer, ["kind", "id", "schema", "maxBytes"], NO_FIELDS)
  identifier(record.id, `${pointer}/id`)
  schemaPath(record.schema, `${pointer}/schema`)
  safeInteger(record.maxBytes, `${pointer}/maxBytes`, 1, 16_777_216)
  return record
}

function validateResultSource(value: JsonValue, pointer: string): void {
  const record = looseRecord(value, pointer)
  if (record.source === "literal") {
    exactRecord(value, pointer, ["source", "value"], NO_FIELDS)
  } else {
    validateReference(value, pointer)
  }
}

function validateManualForm(value: JsonValue, pointer: string, hasApproval: boolean): void {
  const record = exactRecord(value, pointer, ["fields"], NO_FIELDS)
  const fields = denseArray(record.fields, `${pointer}/fields`, 1, 128)
  const ids = new Map<string, number>()
  for (let index = 0; index < fields.length; index += 1) {
    const fieldPointer = `${pointer}/fields/${index}`
    const base = looseRecord(fields[index], fieldPointer)
    let required: readonly string[]
    if (base.type === "string") required = ["id", "title", "type", "required", "multiline"]
    else if (base.type === "number" || base.type === "boolean") required = ["id", "title", "type", "required"]
    else if (base.type === "select") required = ["id", "title", "type", "required", "options"]
    else layout(`${fieldPointer}/type`)
    const field = exactRecord(fields[index], fieldPointer, required, ["description", "default"])
    const id = identifier(field.id, `${fieldPointer}/id`)
    uniqueId(ids, id, `${fieldPointer}/id`)
    if (hasApproval && id === "decision") layout(`${fieldPointer}/id`)
    humanText(field.title, `${fieldPointer}/title`, 4096)
    if (objectHasOwn(field, "description")) humanText(field.description, `${fieldPointer}/description`, 8192)
    requiredBoolean(field.required, `${fieldPointer}/required`)
    if (base.type === "string") {
      requiredBoolean(field.multiline, `${fieldPointer}/multiline`)
      if (objectHasOwn(field, "default") && typeof field.default !== "string") layout(`${fieldPointer}/default`)
    } else if (base.type === "number") {
      if (objectHasOwn(field, "default") && (typeof field.default !== "number" || !numberIsFinite(field.default))) {
        layout(`${fieldPointer}/default`)
      }
    } else if (base.type === "boolean") {
      if (objectHasOwn(field, "default") && typeof field.default !== "boolean") layout(`${fieldPointer}/default`)
    } else {
      const options = optionArray(field.options, `${fieldPointer}/options`)
      if (objectHasOwn(field, "default")) {
        if (typeof field.default !== "string" || indexOf(options, field.default) < 0) layout(`${fieldPointer}/default`)
      }
    }
  }
}

function validateApproval(value: JsonValue, pointer: string): void {
  const record = exactRecord(value, pointer, ["message", "approveLabel", "rejectLabel"], NO_FIELDS)
  humanText(record.message, `${pointer}/message`, 4096)
  humanText(record.approveLabel, `${pointer}/approveLabel`, 4096)
  humanText(record.rejectLabel, `${pointer}/rejectLabel`, 4096)
}

function validateTransition(
  value: JsonValue,
  stepPointer: string,
  decisionIds: Map<string, number>,
  loopIds: Map<string, number>
): void {
  const pointer = `${stepPointer}/transition`
  const record = exactRecord(value, pointer, ["decisions", "default"], NO_FIELDS)
  const decisions = denseArray(record.decisions, `${pointer}/decisions`, 0, 128)
  for (let index = 0; index < decisions.length; index += 1) {
    const decisionPointer = `${pointer}/decisions/${index}`
    const decision = exactRecord(decisions[index], decisionPointer, ["id", "when", "goto"], ["loop"])
    const id = identifier(decision.id, `${decisionPointer}/id`)
    uniqueId(decisionIds, id, `${decisionPointer}/id`)
    validatePredicate(decision.when, `${decisionPointer}/when`)
    gotoValue(decision.goto, `${decisionPointer}/goto`)
    if (objectHasOwn(decision, "loop")) {
      const loopPointer = `${decisionPointer}/loop`
      const loop = exactRecord(decision.loop, loopPointer, ["id", "maxIterations", "extensionSize", "checkpoint"], NO_FIELDS)
      const loopId = identifier(loop.id, `${loopPointer}/id`)
      uniqueId(loopIds, loopId, `${loopPointer}/id`)
      safeInteger(loop.maxIterations, `${loopPointer}/maxIterations`, 1, 1000)
      safeInteger(loop.extensionSize, `${loopPointer}/extensionSize`, 1, 1000)
      const checkpoint = exactRecord(loop.checkpoint, `${loopPointer}/checkpoint`, ["title", "message"], NO_FIELDS)
      humanText(checkpoint.title, `${loopPointer}/checkpoint/title`, 4096)
      humanText(checkpoint.message, `${loopPointer}/checkpoint/message`, 4096)
    }
  }
  const fallback = exactRecord(record.default, `${pointer}/default`, ["goto"], NO_FIELDS)
  gotoValue(fallback.goto, `${pointer}/default/goto`)
}

function validateResumePolicy(value: JsonValue): void {
  const pointer = "/resumePolicy"
  const record = exactRecord(
    value,
    pointer,
    ["mode", "maxAttempts", "retainCommittedOutputs", "allowArtifactReuse"],
    NO_FIELDS
  )
  enumString(record.mode, ["restart-step", "fail-closed"], `${pointer}/mode`)
  safeInteger(record.maxAttempts, `${pointer}/maxAttempts`, 1, 100)
  requiredBoolean(record.retainCommittedOutputs, `${pointer}/retainCommittedOutputs`)
  requiredBoolean(record.allowArtifactReuse, `${pointer}/allowArtifactReuse`)
}

function validateBob(value: JsonValue): void {
  const pointer = "/bob"
  const record = exactRecord(value, pointer, ["profile", "requiredCapabilities", "taskCapabilities"], NO_FIELDS)
  if (record.profile !== "bob/2.0.1") layout(`${pointer}/profile`)
  subsetArray(record.requiredCapabilities, `${pointer}/requiredCapabilities`, BOB_CAPABILITIES, 9)
  subsetArray(record.taskCapabilities, `${pointer}/taskCapabilities`, BOB_TASK_CAPABILITIES, 6)
}

function validateReferencesAndSemantics(
  inputs: readonly JsonValue[],
  inputIds: ReadonlyMap<string, number>,
  steps: readonly StepInfo[],
  stepIds: ReadonlyMap<string, number>,
  outputIds: ReadonlyMap<string, number>,
  providers: ReadonlyMap<string, ProviderInfo>,
  artifacts: ReadonlyMap<string, Readonly<Record<string, JsonValue>>>
): void {
  const allInputIds = new Set(inputIds.keys())
  for (let index = 0; index < inputs.length; index += 1) {
    const record = inputs[index] as Readonly<Record<string, JsonValue>>
    if (objectHasOwn(record, "requiredWhen")) {
      validatePredicateReferences(
        record.requiredWhen,
        `/inputs/${index}/requiredWhen`,
        allInputIds,
        new Set(),
        false
      )
    }
  }

  const priorOutputs = new Set<string>()
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const pointer = `/steps/${index}`
    if (objectHasOwn(step.record, "when")) {
      validatePredicateReferences(step.record.when, `${pointer}/when`, allInputIds, priorOutputs)
    }
    if (step.type === "command") {
      validateTemplateReferences(step.record.input, `${pointer}/input`, allInputIds, priorOutputs)
      const providerId = step.record.provider
      if (typeof providerId !== "string" || !providers.has(providerId)) layout(`${pointer}/provider`)
      const provider = providers.get(providerId) as ProviderInfo
      const providerOutput = provider.record.output as Readonly<Record<string, JsonValue>>
      if (step.output?.kind !== providerOutput.kind) layout(`${pointer}/output`)
      if (
        step.output?.kind === "value" &&
        (providerOutput.kind !== "value" || step.output.schema !== providerOutput.schema)
      ) layout(`${pointer}/output/schema`)
    } else if (step.type === "agent") {
      const context = step.record.context as readonly JsonValue[]
      for (let contextIndex = 0; contextIndex < context.length; contextIndex += 1) {
        validateReferenceVisibility(
          context[contextIndex], `${pointer}/context/${contextIndex}`, allInputIds, priorOutputs
        )
      }
    } else if (step.type === "result") {
      const source = step.record.source as Readonly<Record<string, JsonValue>>
      if (source.source !== "literal") {
        validateReferenceVisibility(source, `${pointer}/source`, allInputIds, priorOutputs)
      }
    }

    if (objectHasOwn(step.record, "artifacts")) {
      const refs = step.record.artifacts as readonly JsonValue[]
      for (let artifactIndex = 0; artifactIndex < refs.length; artifactIndex += 1) {
        const id = refs[artifactIndex]
        if (typeof id !== "string" || !artifacts.has(id)) layout(`${pointer}/artifacts/${artifactIndex}`)
      }
    }

    if (objectHasOwn(step.record, "transition")) {
      const transition = step.record.transition as Readonly<Record<string, JsonValue>>
      const decisions = transition.decisions as readonly JsonValue[]
      const transitionOutputs = new Set(priorOutputs)
      if (step.output?.kind === "value") transitionOutputs.add(step.output.id as string)
      for (let decisionIndex = 0; decisionIndex < decisions.length; decisionIndex += 1) {
        const decision = decisions[decisionIndex] as Readonly<Record<string, JsonValue>>
        const decisionPointer = `${pointer}/transition/decisions/${decisionIndex}`
        validatePredicateReferences(
          decision.when, `${decisionPointer}/when`, allInputIds, transitionOutputs
        )
        validateDecisionTarget(decision, decisionPointer, index, stepIds)
      }
      const fallback = transition.default as Readonly<Record<string, JsonValue>>
      validateDefaultTarget(fallback.goto, `${pointer}/transition/default/goto`, index, stepIds)
    }
    if (step.output?.kind === "value") priorOutputs.add(step.output.id as string)
  }

  for (const [artifactId, artifact] of artifacts) {
    const artifactIndex = artifactIndexById(artifacts, artifactId)
    const pointer = `/requiredArtifacts/${artifactIndex}`
    const producedBy = artifact.producedBy
    if (typeof producedBy !== "string" || !stepIds.has(producedBy)) layout(`${pointer}/producedBy`)
    if (artifact.owner === "provider") {
      const producer = steps[stepIds.get(producedBy) as number]
      if (producer.type !== "command") layout(`${pointer}/owner`)
      const providerId = producer.record.provider
      const provider = typeof providerId === "string" ? providers.get(providerId) : undefined
      if (provider?.record.sideEffect !== "workspace-write") layout(`${pointer}/owner`)
    }
    const producer = steps[stepIds.get(producedBy) as number]
    const producedArtifacts = objectHasOwn(producer.record, "artifacts")
      ? producer.record.artifacts as readonly JsonValue[]
      : []
    if (!contains(producedArtifacts as readonly string[], artifactId)) layout(`${pointer}/producedBy`)
  }

  void outputIds
}

function artifactIndexById(
  artifacts: ReadonlyMap<string, Readonly<Record<string, JsonValue>>>,
  id: string
): number {
  let index = 0
  for (const key of artifacts.keys()) {
    if (key === id) return index
    index += 1
  }
  return 0
}

function validateDecisionTarget(
  decision: Readonly<Record<string, JsonValue>>,
  pointer: string,
  currentIndex: number,
  stepIds: ReadonlyMap<string, number>
): void {
  const target = decision.goto
  if (typeof target !== "string") layout(`${pointer}/goto`)
  const terminal = target === "$end" || target === "$fail"
  const targetIndex = terminal ? undefined : stepIds.get(target)
  if (!terminal && targetIndex === undefined) layout(`${pointer}/goto`)
  const needsLoop = targetIndex !== undefined && targetIndex <= currentIndex
  const hasLoop = objectHasOwn(decision, "loop")
  if (needsLoop && !hasLoop) layout(`${pointer}/loop`)
  if (!needsLoop && hasLoop) layout(`${pointer}/loop`)
}

function validateDefaultTarget(
  target: JsonValue,
  pointer: string,
  currentIndex: number,
  stepIds: ReadonlyMap<string, number>
): void {
  if (typeof target !== "string") layout(pointer)
  if (target === "$end" || target === "$fail") return
  const targetIndex = stepIds.get(target)
  if (targetIndex === undefined || targetIndex <= currentIndex) layout(pointer)
}

function validateTemplate(
  value: JsonValue,
  pointer: string,
  budget: { nodes: number; readonly rootPointer: string },
  depth = 1
): void {
  budget.nodes += 1
  if (depth > 32 || budget.nodes > 4096) layout(budget.rootPointer)
  const record = looseRecord(value, pointer)
  if (record.source === "literal") {
    exactRecord(value, pointer, ["source", "value"], NO_FIELDS)
  } else if (record.source === "input" || record.source === "committedOutput") {
    validateReference(value, pointer)
  } else if (record.source === "array") {
    const exact = exactRecord(value, pointer, ["source", "items"], NO_FIELDS)
    const items = denseArray(exact.items, `${pointer}/items`, 0, 256)
    for (let index = 0; index < items.length; index += 1) {
      validateTemplate(items[index], `${pointer}/items/${index}`, budget, depth + 1)
    }
  } else if (record.source === "object") {
    const exact = exactRecord(value, pointer, ["source", "properties"], NO_FIELDS)
    const properties = looseRecord(exact.properties, `${pointer}/properties`)
    const keys = objectKeys(properties)
    if (keys.length > 256) layout(`${pointer}/properties`)
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index]
      validateTemplate(properties[key], `${pointer}/properties/${escapePointer(key)}`, budget, depth + 1)
    }
  } else {
    layout(`${pointer}/source`)
  }
}

function validateTemplateReferences(
  value: JsonValue,
  pointer: string,
  inputs: ReadonlySet<string>,
  outputs: ReadonlySet<string>
): void {
  const record = value as Readonly<Record<string, JsonValue>>
  if (record.source === "input" || record.source === "committedOutput") {
    validateReferenceVisibility(value, pointer, inputs, outputs)
  } else if (record.source === "array") {
    const items = record.items as readonly JsonValue[]
    for (let index = 0; index < items.length; index += 1) {
      validateTemplateReferences(items[index], `${pointer}/items/${index}`, inputs, outputs)
    }
  } else if (record.source === "object") {
    const properties = record.properties as Readonly<Record<string, JsonValue>>
    for (const key of objectKeys(properties)) {
      validateTemplateReferences(properties[key], `${pointer}/properties/${escapePointer(key)}`, inputs, outputs)
    }
  }
}

function validatePredicate(value: JsonValue, pointer: string): void {
  validatePredicateNode(value, pointer, { nodes: 0, literalBytes: 0, rootPointer: pointer }, 1)
}

function validatePredicateNode(
  value: JsonValue,
  pointer: string,
  budget: PredicateBudget,
  depth: number
): void {
  budget.nodes += 1
  if (depth > 32 || budget.nodes > 1024) predicateFail(budget.rootPointer)
  const record = predicateRecord(value, pointer)
  const kind = record.kind
  if (kind === "all" || kind === "any") {
    const exact = predicateExactRecord(value, pointer, ["kind", "predicates"])
    const predicates = predicateArray(exact.predicates, `${pointer}/predicates`, 1, 128)
    for (let index = 0; index < predicates.length; index += 1) {
      validatePredicateNode(predicates[index], `${pointer}/predicates/${index}`, budget, depth + 1)
    }
    return
  }
  if (kind === "not") {
    const exact = predicateExactRecord(value, pointer, ["kind", "predicate"])
    validatePredicateNode(exact.predicate, `${pointer}/predicate`, budget, depth + 1)
    return
  }
  if (kind === "exists") {
    const exact = predicateExactRecord(value, pointer, ["kind", "left"])
    validatePredicateReference(exact.left, `${pointer}/left`)
    return
  }
  if (
    kind === "equals" || kind === "notEquals" || kind === "in" ||
    kind === "greaterThan" || kind === "greaterThanOrEqual" ||
    kind === "lessThan" || kind === "lessThanOrEqual"
  ) {
    const exact = predicateExactRecord(value, pointer, ["kind", "left", "right"])
    validatePredicateReference(exact.left, `${pointer}/left`)
    if (kind === "in") predicateArray(exact.right, `${pointer}/right`, 1, 256)
    if (
      kind !== "equals" && kind !== "notEquals" && kind !== "in" &&
      typeof exact.right !== "number" && typeof exact.right !== "string"
    ) predicateFail(`${pointer}/right`)
    budget.literalBytes += canonicalBytes(exact.right).length
    if (budget.literalBytes > 262_144) predicateFail(`${pointer}/right`)
    return
  }
  predicateFail(`${pointer}/kind`)
}

function validatePredicateReferences(
  value: JsonValue,
  pointer: string,
  inputs: ReadonlySet<string>,
  outputs: ReadonlySet<string>,
  allowOutputs = true
): void {
  const record = value as Readonly<Record<string, JsonValue>>
  if (record.kind === "all" || record.kind === "any") {
    const predicates = record.predicates as readonly JsonValue[]
    for (let index = 0; index < predicates.length; index += 1) {
      validatePredicateReferences(
        predicates[index],
        `${pointer}/predicates/${index}`,
        inputs,
        outputs,
        allowOutputs
      )
    }
  } else if (record.kind === "not") {
    validatePredicateReferences(record.predicate, `${pointer}/predicate`, inputs, outputs, allowOutputs)
  } else {
    const reference = record.left as Readonly<Record<string, JsonValue>>
    if (!allowOutputs && reference.source === "committedOutput") layout(`${pointer}/left/source`)
    validateReferenceVisibility(record.left, `${pointer}/left`, inputs, outputs)
  }
}

function validateReferenceVisibility(
  value: JsonValue,
  pointer: string,
  inputs: ReadonlySet<string>,
  outputs: ReadonlySet<string>
): void {
  const reference = value as unknown as WorkflowReferenceV2
  if (reference.source === "input") {
    if (!inputs.has(reference.id)) layout(`${pointer}/id`)
  } else if (!outputs.has(reference.id)) {
    layout(`${pointer}/id`)
  }
}

function validateReference(value: JsonValue, pointer: string): WorkflowReferenceV2 {
  const record = exactRecord(value, pointer, ["source", "id", "pointer"], NO_FIELDS)
  enumString(record.source, ["input", "committedOutput"], `${pointer}/source`)
  identifier(record.id, `${pointer}/id`)
  jsonPointer(record.pointer, `${pointer}/pointer`)
  return record as unknown as WorkflowReferenceV2
}

function validatePredicateReference(value: JsonValue, pointer: string): void {
  try {
    validateReference(value, pointer)
  } catch (error) {
    if (error instanceof ShapeFailure) predicateFail(error.pointer)
    throw error
  }
}

function validateDocumentBounds(root: JsonValue): void {
  const stack: Array<{ readonly value: JsonValue; readonly depth: number }> = [{ value: root, depth: 1 }]
  let nodes = 0
  while (stack.length > 0) {
    const entry = stack.pop() as { readonly value: JsonValue; readonly depth: number }
    nodes += 1
    if (nodes > 65_536 || entry.depth > 64) layout("")
    if (entry.value !== null && typeof entry.value === "object") {
      if (arrayIsArray(entry.value)) {
        for (let index = entry.value.length - 1; index >= 0; index -= 1) {
          stack.push({ value: entry.value[index], depth: entry.depth + 1 })
        }
      } else {
        const record = entry.value as JsonObject
        const keys = objectKeys(record)
        for (let index = keys.length - 1; index >= 0; index -= 1) {
          stack.push({ value: record[keys[index]], depth: entry.depth + 1 })
        }
      }
    }
  }
}

function exactRecord(
  value: JsonValue,
  pointer: string,
  required: readonly string[],
  optional: readonly string[]
): Readonly<Record<string, JsonValue>> {
  const record = looseRecord(value, pointer)
  const keys = objectKeys(record)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (!contains(required, key) && !contains(optional, key)) unknown(`${pointer}/${escapePointer(key)}`)
  }
  for (let index = 0; index < required.length; index += 1) {
    if (!objectHasOwn(record, required[index])) layout(pointer)
  }
  return record
}

function looseRecord(value: JsonValue, pointer: string): Readonly<Record<string, JsonValue>> {
  if (value === null || typeof value !== "object" || arrayIsArray(value)) layout(pointer)
  return value as Readonly<Record<string, JsonValue>>
}

function predicateRecord(value: JsonValue, pointer: string): Readonly<Record<string, JsonValue>> {
  if (value === null || typeof value !== "object" || arrayIsArray(value)) predicateFail(pointer)
  return value as Readonly<Record<string, JsonValue>>
}

function predicateExactRecord(
  value: JsonValue,
  pointer: string,
  required: readonly string[]
): Readonly<Record<string, JsonValue>> {
  const record = predicateRecord(value, pointer)
  const keys = objectKeys(record)
  for (let index = 0; index < keys.length; index += 1) {
    if (!contains(required, keys[index])) predicateFail(`${pointer}/${escapePointer(keys[index])}`)
  }
  for (let index = 0; index < required.length; index += 1) {
    if (!objectHasOwn(record, required[index])) predicateFail(pointer)
  }
  return record
}

function denseArray(value: JsonValue, pointer: string, min: number, max: number): readonly JsonValue[] {
  if (!arrayIsArray(value) || value.length < min || value.length > max) layout(pointer)
  return value
}

function predicateArray(value: JsonValue, pointer: string, min: number, max: number): readonly JsonValue[] {
  if (!arrayIsArray(value) || value.length < min || value.length > max) predicateFail(pointer)
  return value
}

function identifier(value: JsonValue, pointer: string): string {
  if (typeof value !== "string" || value.length > 128 || !IDENTIFIER_PATTERN.test(value)) layout(pointer)
  return value
}

function humanText(value: JsonValue, pointer: string, maxCodePoints: number): string {
  if (
    typeof value !== "string" || value.includes("\r") || CONTROL_PATTERN.test(value) ||
    codePointCount(value) < 1 || codePointCount(value) > maxCodePoints
  ) layout(pointer)
  return value
}

function requiredBoolean(value: JsonValue, pointer: string): boolean {
  if (typeof value !== "boolean") layout(pointer)
  return value
}

function safeInteger(value: JsonValue, pointer: string, min: number, max: number): number {
  if (typeof value !== "number" || !numberIsSafeInteger(value) || value < min || value > max) layout(pointer)
  return value
}

function enumString(value: JsonValue, allowed: readonly string[], pointer: string): string {
  if (typeof value !== "string" || !contains(allowed, value)) layout(pointer)
  return value
}

function schemaPath(value: JsonValue, pointer: string): string {
  if (
    typeof value !== "string" || bufferByteLength(value, "utf8") > 240 ||
    !SCHEMA_PATH_PATTERN.test(value) || !portableReference(value)
  ) layout(pointer)
  return value
}

function promptPath(value: JsonValue, pointer: string): string {
  if (
    typeof value !== "string" || bufferByteLength(value, "utf8") > 240 ||
    !PROMPT_PATH_PATTERN.test(value) || !portableReference(value)
  ) layout(pointer)
  return value
}

function artifactPath(value: JsonValue, pointer: string): string {
  if (
    typeof value !== "string" || !ARTIFACT_PATH_PATTERN.test(value) ||
    bufferByteLength(value, "utf8") > 240 || normalize(value) !== value
  ) layout(pointer)
  return value
}

function mediaType(value: JsonValue, pointer: string): string {
  if (typeof value !== "string" || !MEDIA_TYPE_PATTERN.test(value)) layout(pointer)
  return value
}

function jsonPointer(value: JsonValue, pointer: string): string {
  if (
    typeof value !== "string" || CONTROL_PATTERN.test(value) ||
    (value.length > 0 && !value.startsWith("/")) || /~(?:[^01]|$)/u.test(value)
  ) layout(pointer)
  return value
}

function gotoValue(value: JsonValue, pointer: string): string {
  if (value === "$end" || value === "$fail") return value
  return identifier(value, pointer)
}

function identifierArray(value: JsonValue, pointer: string, min: number, max: number): readonly string[] {
  const values = denseArray(value, pointer, min, max)
  const result: string[] = []
  const seen = new Map<string, number>()
  for (let index = 0; index < values.length; index += 1) {
    const id = identifier(values[index], `${pointer}/${index}`)
    uniqueId(seen, id, `${pointer}/${index}`)
    result.push(id)
  }
  return result
}

function capabilityArray(value: JsonValue, pointer: string, max: number): readonly string[] {
  const values = identifierArray(value, pointer, 0, max)
  requireSorted(values, pointer)
  return values
}

function subsetArray(
  value: JsonValue,
  pointer: string,
  allowed: readonly string[],
  max: number
): readonly string[] {
  const values = denseArray(value, pointer, 0, max)
  const result: string[] = []
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index]
    if (typeof item !== "string" || !contains(allowed, item)) layout(`${pointer}/${index}`)
    if (index > 0 && result[index - 1] >= item) layout(pointer)
    result.push(item)
  }
  return result
}

function optionArray(value: JsonValue, pointer: string): readonly string[] {
  const values = denseArray(value, pointer, 1, 256)
  const result: string[] = []
  const seen = new Map<string, number>()
  for (let index = 0; index < values.length; index += 1) {
    const item = values[index]
    if (typeof item !== "string" || codePointCount(item) < 1 || codePointCount(item) > 256) layout(`${pointer}/${index}`)
    uniqueId(seen, item, `${pointer}/${index}`)
    result.push(item)
  }
  return result
}

function requireSorted(values: readonly string[], pointer: string): void {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index - 1] >= values[index]) layout(pointer)
  }
}

function uniqueId(seen: Map<string, number>, id: string, pointer: string): void {
  if (seen.has(id)) layout(pointer)
  seen.set(id, seen.size)
}

function portableReference(value: string): boolean {
  if (value.includes("\\") || value.includes(":") || value.startsWith("/") || value.endsWith("/")) return false
  const segments = value.split("/")
  for (let index = 0; index < segments.length; index += 1) {
    if (segments[index].length === 0 || segments[index] === "." || segments[index] === "..") return false
  }
  return normalize(value) === value
}

function isSemverRange(value: string): boolean {
  if (value.length === 0 || value.length > 256 || CONTROL_PATTERN.test(value) || !/[0-9xX*]/u.test(value)) {
    return false
  }
  const parts = value.split("||")
  if (parts.some((part) => part.trim().length === 0)) return false
  const numeric = "(?:0|[1-9]\\d*)"
  const partialPart = `(?:${numeric}|[xX*])`
  const partial = `v?${partialPart}(?:\\.${partialPart}){0,2}`
  const prereleaseIdentifier = `(?:${numeric}|\\d*[A-Za-z-][0-9A-Za-z-]*)`
  const prerelease = `(?:-${prereleaseIdentifier}(?:\\.${prereleaseIdentifier})*)?`
  const buildIdentifier = "[0-9A-Za-z-]+"
  const build = `(?:\\+${buildIdentifier}(?:\\.${buildIdentifier})*)?`
  const exact = `v?${numeric}\\.${numeric}\\.${numeric}${prerelease}${build}`
  const versionSource = `(?:${exact}|${partial})`
  const version = new RegExp(`^${versionSource}$`, "u")
  const comparator = new RegExp(`^(?:(?:<=|>=|<|>|=|~|\\^)\\s*)?${versionSource}$`, "u")
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index].trim().replace(/(<=|>=|<|>|=|~|\^)\s+(?=[v0-9xX*])/gu, "$1")
    const hyphen = part.split(/\s+-\s+/u)
    if (hyphen.length === 2 && version.test(hyphen[0]) && version.test(hyphen[1])) continue
    const tokens = part.split(/\s+/u)
    if (tokens.length === 0 || tokens.some((token) => !comparator.test(token))) return false
  }
  return true
}

function codePointCount(value: string): number {
  let count = 0
  for (const _character of value) count += 1
  return count
}

function normalize(value: string): string {
  return Reflect.apply(stringNormalize, value, ["NFC"])
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return true
  }
  return false
}

function indexOf(values: readonly string[], value: string): number {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === value) return index
  }
  return -1
}

function escapePointer(value: string): string {
  return value.replace(/~/gu, "~0").replace(/\//gu, "~1")
}

function layout(pointer: string): never {
  return shapeFail("WF2_PACKAGE_LAYOUT_INVALID", pointer, "Workflow package shape is invalid.")
}

function unknown(pointer: string): never {
  return shapeFail("WF2_UNKNOWN_OR_NOOP_FIELD", pointer, "Workflow package field is unknown or has no effect.")
}

function predicateFail(pointer: string): never {
  return shapeFail("WF2_PREDICATE_INVALID", pointer, "Workflow predicate is invalid.")
}

function shapeFail(code: WorkflowContractV2DiagnosticCode, pointer: string, message: string): never {
  throw new ShapeFailure(code, pointer, message)
}

function failure(
  path: string,
  code: WorkflowContractV2DiagnosticCode,
  pointer: string,
  message: string
): ValidateWorkflowContractV2PackageShapeResult {
  let diagnostic: WorkflowContractV2Diagnostic
  try {
    diagnostic = createDiagnostic({ code, severity: "error", message, location: { path, pointer } })
  } catch {
    diagnostic = createDiagnostic({
      code: "WF2_PACKAGE_LAYOUT_INVALID",
      severity: "error",
      message: "Workflow package document is invalid.",
      location: { path: "workflow.yaml", pointer: "" }
    })
  }
  return objectFreeze({ ok: false, diagnostics: objectFreeze([diagnostic]) })
}
