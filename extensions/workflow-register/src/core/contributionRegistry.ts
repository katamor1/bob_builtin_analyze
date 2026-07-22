import type { ActionProvider } from "./actionTypes"
import {
  validateContributionManifest,
  type ActionProviderContribution,
  type AgentProviderContribution,
  type ContributionManifestValidationContext,
  type PreflightCheckContribution,
  type ResultSinkContribution,
  type SchemaContribution,
  type WorkflowContributionManifest,
  type WorkflowTemplateContribution
} from "./contributionManifest"
import type { WorkflowPreflightChecks } from "./engine/preflight"
import type { AgentProvider } from "./modelProviders"
import type { ResultSinkRegistry } from "./resultSinkRegistry"

const nodePathModule = require("node:path") as typeof import("node:path")
const contributionManifestValidator = validateContributionManifest

export type ContributionKind =
  | "action_provider"
  | "preflight_check"
  | "result_sink"
  | "agent_provider"
  | "workflow_template"
  | "schema"

export type PreflightCheckHandler = WorkflowPreflightChecks[string]
export type ResultSinkHandler = Parameters<ResultSinkRegistry["register"]>[1]

export interface ContributionHandlerSet {
  actionProviders: Map<string, ActionProvider>
  preflightChecks: Map<string, PreflightCheckHandler>
  resultSinks: Map<string, ResultSinkHandler>
  agentProvider?: AgentProvider
}

/** Internal runtime lookup surface. This is intentionally not part of the public extension API. */
export interface ContributionRuntimeResolver {
  getActionProvider(id: string): ActionProvider | undefined
  getPreflightCheck(id: string): PreflightCheckHandler | undefined
  getResultSink(type: string): ResultSinkHandler | undefined
  getResultSinkContractVersion(type: string): string | undefined
  getAgentProvider(id?: string): AgentProvider | undefined
}

export type ContributionDeclaration =
  | ActionProviderContribution
  | PreflightCheckContribution
  | ResultSinkContribution
  | AgentProviderContribution
  | WorkflowTemplateContribution
  | SchemaContribution

export interface ContributionMetadata {
  readonly kind: ContributionKind
  readonly id: string
  readonly owner: Readonly<{ id: string; version: string }>
  readonly declaration: Readonly<ContributionDeclaration>
}

export interface ContributionRegistrySnapshot {
  readonly actionProviders: readonly ContributionMetadata[]
  readonly preflightChecks: readonly ContributionMetadata[]
  readonly resultSinks: readonly ContributionMetadata[]
  readonly agentProviders: readonly ContributionMetadata[]
  readonly workflowTemplates: readonly ContributionMetadata[]
  readonly schemas: readonly ContributionMetadata[]
}

export interface ContributionRegistration {
  dispose(): void
}

export interface PendingContributionCommit {
  readonly disposable: ContributionRegistration
  readonly snapshot: ContributionRegistrySnapshot
}

export interface ContributionRegistryOptions {
  /** Trusted instance policy used by provider-registry API negotiation. */
  manifestPolicy?: (manifest: Readonly<WorkflowContributionManifest>) => void
  /** Test seam invoked after the disposable and snapshot are frozen but before publication. */
  beforeCommit?: (pending: Readonly<PendingContributionCommit>) => void
  /** Test seam for observing the reverse removal order. */
  onRemove?: (metadata: ContributionMetadata) => void
}

export type ContributionRegistryErrorCode =
  | "contribution.registry.manifest_invalid"
  | "contribution.registry.handler_set_invalid"
  | "contribution.registry.handler_mismatch"
  | "contribution.registry.duplicate_identifier"
  | "contribution.registry.agent_provider_conflict"
  | "contribution.registry.commit_failed"
  | "contribution.registry.reentrant_mutation"

/**
 * A stable public error surface. A filtering proxy preserves native Error and
 * typed instanceof behavior without exposing later Object.prototype additions.
 * Publicly constructed instances are not trusted internally.
 */
export class ContributionRegistryError extends Error {
  readonly code: string
  readonly diagnosticId: string

  constructor(code: string, message: string, diagnosticId: string = code) {
    super(boundedText(message))
    objectDefineProperty(this, "name", {
      value: "ContributionRegistryError",
      enumerable: true,
      configurable: true,
      writable: true
    })
    this.code = boundedText(code)
    this.diagnosticId = boundedText(diagnosticId)
    return createPublicErrorProxy(this)
  }
}

interface RegisteredContribution {
  readonly token: symbol
  readonly metadata: ContributionMetadata
  readonly handler?: ActionProvider | PreflightCheckHandler | ResultSinkHandler | AgentProvider
}

interface RegistryState {
  readonly byId: Map<string, RegisteredContribution>
  readonly ordered: readonly RegisteredContribution[]
  readonly agentId?: string
  readonly snapshot: ContributionRegistrySnapshot
}

interface IncomingContribution {
  readonly metadata: ContributionMetadata
  readonly handler?: ActionProvider | PreflightCheckHandler | ResultSinkHandler | AgentProvider
}

interface SnapshottedHandlers {
  readonly actionProviders: Map<string, unknown>
  readonly preflightChecks: Map<string, unknown>
  readonly resultSinks: Map<string, unknown>
  readonly agentProvider?: unknown
}

type CapturedDescriptor = readonly [
  key: PropertyKey,
  isData: boolean,
  valueOrGetter: unknown,
  writableOrSetter: unknown,
  enumerable: boolean,
  configurable: boolean
]

type CapturedObjectBaseline = readonly [
  target: object,
  descriptors: readonly CapturedDescriptor[]
]

type CapturedPropertyBaseline = readonly [
  target: object,
  descriptor: CapturedDescriptor
]

const DIAGNOSTIC_BYTE_LIMIT = 256
const MAX_SNAPSHOT_DEPTH = 32
const MAX_SNAPSHOT_NODES = 50_000
const MAX_ARRAY_LENGTH = 20_000
const MAX_HANDLER_ENTRIES = 20_000
const MAX_HANDLER_PROTOTYPE_DEPTH = 32

const ArrayConstructor = Array
const MapConstructor = Map
const ProxyConstructor = Proxy
const WeakSetConstructor = WeakSet
const NumberConstructor = Number
const StringConstructor = String
const SymbolConstructor = Symbol
const arrayPrototype = Array.prototype
const errorPrototype = Error.prototype
const functionPrototype = Function.prototype
const mapPrototype = Map.prototype
const setPrototype = Set.prototype
const stringPrototype = String.prototype
const regexpPrototype = RegExp.prototype
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetPrototypeOf = Object.getPrototypeOf
const objectDefineProperty = Object.defineProperty
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectIs = Object.is
const objectSetPrototypeOf = Object.setPrototypeOf
const objectPrototype = Object.prototype
const reflectOwnKeys = Reflect.ownKeys
const reflectApply = Reflect.apply
const reflectGet = Reflect.get
const arrayIsArray = Array.isArray
const arrayPush = Array.prototype.push
const numberIsSafeInteger = Number.isSafeInteger
const stringCharCodeAt = String.prototype.charCodeAt
const arrayIndexPattern = /^(0|[1-9][0-9]*)$/
const regexpTest = RegExp.prototype.test
const mapEntries = Map.prototype.entries
const mapGet = Map.prototype.get
const mapHas = Map.prototype.has
const mapSet = Map.prototype.set
const mapDelete = Map.prototype.delete
const mapSizeGetter = objectGetOwnPropertyDescriptor(mapPrototype, "size")?.get as (
  this: Map<unknown, unknown>
) => number
const weakSetHas = WeakSet.prototype.has
const weakSetAdd = WeakSet.prototype.add
const weakSetDelete = WeakSet.prototype.delete
const mapIteratorNext = objectGetPrototypeOf(reflectApply(mapEntries, new MapConstructor(), [])).next as (
  this: IterableIterator<[unknown, unknown]>
) => IteratorResult<[unknown, unknown]>

// Registry-owned public values use stable copies of the module-load prototype
// descriptors. Their roots are null, so later Object.prototype additions cannot
// become executable behavior on values that the registry already returned.
const registryObjectPrototype = createIsolatedPrototype(objectPrototype, null)
const registryArrayPrototype = createIsolatedPrototype(arrayPrototype, registryObjectPrototype)
const registryFunctionPrototype = createIsolatedPrototype(functionPrototype, registryObjectPrototype)
const publicErrorPrototypeBaselines = captureObjectBaselines([
  ContributionRegistryError.prototype,
  errorPrototype
])
objectFreeze(ContributionRegistryError.prototype)
const publicErrorProxyHandler = createPublicErrorProxyHandler()

const validatorPrimordialBaselines = captureObjectBaselines([
  objectPrototype,
  arrayPrototype,
  functionPrototype,
  mapPrototype,
  setPrototype,
  stringPrototype,
  regexpPrototype,
  nodePathModule.posix
])
const objectPrototypeBaseline = validatorPrimordialBaselines[0]

const validatorBindingBaselines = capturePropertyBaselines([
  [globalThis, "Array"],
  [globalThis, "BigInt"],
  [globalThis, "Buffer"],
  [globalThis, "Function"],
  [globalThis, "Map"],
  [globalThis, "Number"],
  [globalThis, "Object"],
  [globalThis, "RegExp"],
  [globalThis, "Set"],
  [globalThis, "String"],
  [globalThis, "Symbol"],
  [globalThis, "WeakSet"],
  [Buffer, "byteLength"],
  [nodePathModule, "posix"]
])

const authenticErrors = new WeakSetConstructor<ContributionRegistryError>()

const EMPTY_SNAPSHOT = createSnapshot([])

export class ContributionRegistry {
  private readonly options: Readonly<ContributionRegistryOptions>
  private state: RegistryState = objectFreeze(isolateRegistryObject({
    byId: new MapConstructor<string, RegisteredContribution>(),
    ordered: objectFreeze([]) as readonly RegisteredContribution[],
    agentId: undefined,
    snapshot: EMPTY_SNAPSHOT
  }))
  private mutating = false

  constructor(options: ContributionRegistryOptions = {}) {
    this.options = objectFreeze(isolateRegistryObject({
      manifestPolicy: readRegistryOption(options, "manifestPolicy"),
      beforeCommit: readRegistryOption(options, "beforeCommit"),
      onRemove: readRegistryOption(options, "onRemove")
    }))
    objectDefineProperty(this, "options", {
      value: this.options,
      enumerable: false,
      configurable: false,
      writable: false
    })
    objectDefineProperty(this, "state", {
      value: this.state,
      enumerable: false,
      configurable: false,
      writable: true
    })
    objectDefineProperty(this, "mutating", {
      value: this.mutating,
      enumerable: false,
      configurable: false,
      writable: true
    })
  }

  registerContributionSet(
    untrustedManifest: unknown,
    untrustedValidationContext: ContributionManifestValidationContext,
    untrustedHandlers: unknown
  ): ContributionRegistration {
    this.enterMutation()
    try {
      const manifestValue = snapshotUntrustedPlainData(untrustedManifest, "manifest")
      const contextValue = snapshotUntrustedPlainData(untrustedValidationContext, "manifest")
      assertValidatorRuntimeIntegrity()
      const validation = validateSafely(manifestValue, contextValue)
      if (!validation.ok || !validation.manifest) {
        const first = validation.diagnostics[0]
        throw internalError(
          "contribution.registry.manifest_invalid",
          first
            ? `Contribution manifest is invalid (${first.code} at ${first.path}): ${first.message}`
            : "Contribution manifest is invalid."
        )
      }

      const manifest = deepFreezePlainData(validation.manifest)
      // This policy is registry-owned, not caller-provided. Its typed failures must pass through.
      this.options.manifestPolicy?.(manifest)

      let incoming: IncomingContribution[]
      try {
        const handlers = snapshotHandlerSet(untrustedHandlers)
        incoming = createIncomingContributions(manifest, handlers)
      } finally {
        assertHandlerObjectPrototypeIntegrity()
      }
      const staged = this.stageRegistration(incoming)
      const token = SymbolConstructor(manifest.owner.id)
      const tokenized: RegisteredContribution[] = []
      for (let index = 0; index < incoming.length; index += 1) {
        const item = incoming[index]
        appendArray(tokenized, contributionRecord(
          { token, metadata: item.metadata },
          ownContributionHandler(item)
        ))
      }
      const nextOrdered = copyArray(this.state.ordered)
      for (let index = 0; index < tokenized.length; index += 1) appendArray(nextOrdered, tokenized[index])
      const nextSnapshot = createSnapshot(nextOrdered)

      let disposed = false
      const contributionIds: string[] = []
      for (let index = 0; index < tokenized.length; index += 1) {
        appendArray(contributionIds, tokenized[index].metadata.id)
      }
      const dispose = isolateRegistryFunction(() => {
        this.enterMutation()
        let removed: ContributionMetadata[] = []
        try {
          if (disposed) return
          const nextById = cloneMap(this.state.byId)
          for (let index = contributionIds.length - 1; index >= 0; index -= 1) {
            const id = contributionIds[index]
            const current = reflectApply(mapGet, nextById, [id]) as RegisteredContribution | undefined
            if (current?.token !== token) continue
            reflectApply(mapDelete, nextById, [id])
            appendArray(removed, current.metadata)
          }
          const remaining: RegisteredContribution[] = []
          for (let index = 0; index < this.state.ordered.length; index += 1) {
            const current = this.state.ordered[index]
            if (reflectApply(mapGet, nextById, [current.metadata.id]) === current) {
              appendArray(remaining, current)
            }
          }
          this.state = objectFreeze(isolateRegistryObject({
            byId: nextById,
            ordered: objectFreeze(remaining),
            agentId: findAgentId(remaining),
            snapshot: createSnapshot(remaining)
          }))
          disposed = true
        } finally {
          this.leaveMutation()
        }
        if (this.options.onRemove) {
          for (let index = 0; index < removed.length; index += 1) this.options.onRemove(removed[index])
        }
      })
      const disposable: ContributionRegistration = objectFreeze(isolateRegistryObject({ dispose }))

      const nextById = staged
      for (let index = 0; index < tokenized.length; index += 1) {
        reflectApply(mapSet, nextById, [tokenized[index].metadata.id, tokenized[index]])
      }
      const nextState: RegistryState = objectFreeze(isolateRegistryObject({
        byId: nextById,
        ordered: objectFreeze(nextOrdered),
        agentId: findAgentId(nextOrdered),
        snapshot: nextSnapshot
      }))
      const pending = objectFreeze(isolateRegistryObject({ disposable, snapshot: nextSnapshot }))
      try {
        this.options.beforeCommit?.(pending)
      } catch (error) {
        rethrowUntrusted(error, "contribution.registry.commit_failed", "Contribution registry commit failed.")
      }
      this.state = nextState
      return disposable
    } finally {
      this.leaveMutation()
    }
  }

  snapshot(): ContributionRegistrySnapshot {
    return this.state.snapshot
  }

  getActionProvider(id: string): ActionProvider | undefined {
    return this.handlerFor("action_provider", id) as ActionProvider | undefined
  }

  getPreflightCheck(id: string): PreflightCheckHandler | undefined {
    return this.handlerFor("preflight_check", id) as PreflightCheckHandler | undefined
  }

  getResultSink(id: string): ResultSinkHandler | undefined {
    return this.handlerFor("result_sink", id) as ResultSinkHandler | undefined
  }

  getAgentProvider(id?: string): AgentProvider | undefined {
    const resolvedId = id ?? this.state.agentId
    return resolvedId ? this.handlerFor("agent_provider", resolvedId) as AgentProvider | undefined : undefined
  }

  getActionProviderMetadata(id: string): ContributionMetadata | undefined {
    return this.metadataFor("action_provider", id)
  }

  getPreflightCheckMetadata(id: string): ContributionMetadata | undefined {
    return this.metadataFor("preflight_check", id)
  }

  getResultSinkMetadata(id: string): ContributionMetadata | undefined {
    return this.metadataFor("result_sink", id)
  }

  getAgentProviderMetadata(id?: string): ContributionMetadata | undefined {
    const resolvedId = id ?? this.state.agentId
    return resolvedId ? this.metadataFor("agent_provider", resolvedId) : undefined
  }

  getWorkflowTemplateMetadata(id: string): ContributionMetadata | undefined {
    return this.metadataFor("workflow_template", id)
  }

  getSchemaMetadata(id: string): ContributionMetadata | undefined {
    return this.metadataFor("schema", id)
  }

  private stageRegistration(incoming: readonly IncomingContribution[]): Map<string, RegisteredContribution> {
    const staged = cloneMap(this.state.byId)
    let incomingAgentId: string | undefined
    for (let index = 0; index < incoming.length; index += 1) {
      const item = incoming[index]
      const id = item.metadata.id
      const existing = reflectApply(mapGet, staged, [id]) as RegisteredContribution | undefined
      if (existing) {
        throw internalError(
          "contribution.registry.duplicate_identifier",
          `Contribution '${id}' from '${item.metadata.owner.id}' conflicts with '${existing.metadata.owner.id}'.`
        )
      }
      if (item.metadata.kind === "agent_provider") {
        if (this.state.agentId || incomingAgentId) {
          throw internalError(
            "contribution.registry.agent_provider_conflict",
            `Agent provider '${id}' cannot be registered while another agent provider is active.`
          )
        }
        incomingAgentId = id
      }
      // Reserve the global identifier in the staged copy before inspecting later items.
      reflectApply(mapSet, staged, [
        id,
        objectFreeze(isolateRegistryObject({ token: SymbolConstructor("staged"), metadata: item.metadata }))
      ])
    }
    return staged
  }

  private metadataFor(kind: ContributionKind, id: string): ContributionMetadata | undefined {
    const item = reflectApply(mapGet, this.state.byId, [id]) as RegisteredContribution | undefined
    return item?.metadata.kind === kind ? item.metadata : undefined
  }

  private handlerFor(kind: ContributionKind, id: string): RegisteredContribution["handler"] | undefined {
    const item = reflectApply(mapGet, this.state.byId, [id]) as RegisteredContribution | undefined
    return item?.metadata.kind === kind ? ownContributionHandler(item) : undefined
  }

  private enterMutation(): void {
    if (this.mutating) {
      throw internalError(
        "contribution.registry.reentrant_mutation",
        "Contribution registry mutation is already in progress."
      )
    }
    this.mutating = true
  }

  private leaveMutation(): void {
    this.mutating = false
  }
}

objectSetPrototypeOf(ContributionRegistry.prototype, registryObjectPrototype)
objectFreeze(ContributionRegistry.prototype)

function validateSafely(value: unknown, context: unknown) {
  try {
    return contributionManifestValidator(value, context as ContributionManifestValidationContext)
  } catch (error) {
    rethrowUntrusted(error, "contribution.registry.manifest_invalid", "Contribution manifest validation failed safely.")
  }
}

function assertValidatorRuntimeIntegrity(): void {
  for (let index = 0; index < validatorPrimordialBaselines.length; index += 1) {
    if (!objectBaselineMatches(validatorPrimordialBaselines[index])) {
      throw internalError(
        "contribution.registry.manifest_invalid",
        "Contribution manifest validation runtime was modified."
      )
    }
  }
  for (let index = 0; index < validatorBindingBaselines.length; index += 1) {
    const baseline = validatorBindingBaselines[index]
    if (!descriptorMatches(baseline[0], baseline[1])) {
      throw internalError(
        "contribution.registry.manifest_invalid",
        "Contribution manifest validation runtime was modified."
      )
    }
  }
}

function assertHandlerObjectPrototypeIntegrity(): void {
  if (!objectBaselineMatches(objectPrototypeBaseline)) {
    throw internalError(
      "contribution.registry.handler_set_invalid",
      "Contribution handler modified the object runtime."
    )
  }
}

function createIsolatedPrototype(source: object, parent: object | null): object {
  const isolated = objectCreate(parent) as object
  const keys = reflectOwnKeys(source)
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = objectGetOwnPropertyDescriptor(source, keys[index])
    if (!descriptor) throw new Error("Unable to isolate registry prototype descriptor.")
    objectDefineProperty(isolated, keys[index], descriptor)
  }
  return objectFreeze(isolated)
}

function isolateRegistryObject<T extends object>(value: T): T {
  objectSetPrototypeOf(value, registryObjectPrototype)
  return value
}

function isolateRegistryArray<T>(value: T[]): T[] {
  objectSetPrototypeOf(value, registryArrayPrototype)
  return value
}

function isolateRegistryFunction<T extends (...args: never[]) => unknown>(value: T): T {
  objectSetPrototypeOf(value, registryFunctionPrototype)
  return objectFreeze(value)
}

function createPublicErrorProxy(error: ContributionRegistryError): ContributionRegistryError {
  return new ProxyConstructor(error, publicErrorProxyHandler)
}

function createPublicErrorProxyHandler(): ProxyHandler<ContributionRegistryError> {
  const handler = objectCreate(null) as ProxyHandler<ContributionRegistryError>
  const get = isolateRegistryFunction((
    target: ContributionRegistryError,
    key: PropertyKey
  ): unknown => {
    const ownDescriptor = objectGetOwnPropertyDescriptor(target, key)
    if (ownDescriptor) return reflectGet(target, key, target)
    return readCapturedErrorPrototypeProperty(target, key)
  })
  objectDefineProperty(handler, "get", {
    value: get,
    enumerable: false,
    configurable: false,
    writable: false
  })
  return objectFreeze(handler)
}

function readCapturedErrorPrototypeProperty(
  target: ContributionRegistryError,
  key: PropertyKey
): unknown {
  for (let baselineIndex = 0; baselineIndex < publicErrorPrototypeBaselines.length; baselineIndex += 1) {
    const descriptors = publicErrorPrototypeBaselines[baselineIndex][1]
    for (let descriptorIndex = 0; descriptorIndex < descriptors.length; descriptorIndex += 1) {
      const descriptor = descriptors[descriptorIndex]
      if (descriptor[0] !== key) continue
      if (descriptor[1]) return descriptor[2]
      return typeof descriptor[2] === "function"
        ? reflectApply(descriptor[2] as (...args: never[]) => unknown, target, [])
        : undefined
    }
  }
  return undefined
}

function readRegistryOption<K extends keyof ContributionRegistryOptions>(
  options: ContributionRegistryOptions,
  key: K
): ContributionRegistryOptions[K] {
  const descriptor = objectGetOwnPropertyDescriptor(options, key)
  if (!descriptor) return undefined
  const valueDescriptor = objectGetOwnPropertyDescriptor(descriptor, "value")
  if (valueDescriptor) return valueDescriptor.value as ContributionRegistryOptions[K]
  const getter = descriptorField(descriptor, "get")
  return typeof getter === "function"
    ? reflectApply(getter, options, []) as ContributionRegistryOptions[K]
    : undefined
}

function captureObjectBaselines(targets: readonly object[]): readonly CapturedObjectBaseline[] {
  const baselines = new ArrayConstructor<CapturedObjectBaseline>(targets.length)
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    const target = targets[targetIndex]
    const keys = reflectOwnKeys(target)
    const descriptors = new ArrayConstructor<CapturedDescriptor>(keys.length)
    for (let keyIndex = 0; keyIndex < keys.length; keyIndex += 1) {
      const descriptor = objectGetOwnPropertyDescriptor(target, keys[keyIndex])
      if (!descriptor) throw new Error("Unable to capture validator runtime descriptor.")
      descriptors[keyIndex] = captureDescriptor(keys[keyIndex], descriptor)
    }
    baselines[targetIndex] = objectFreeze([
      target,
      objectFreeze(descriptors)
    ]) as CapturedObjectBaseline
  }
  return objectFreeze(baselines)
}

function capturePropertyBaselines(
  targets: readonly (readonly [object, PropertyKey])[]
): readonly CapturedPropertyBaseline[] {
  const baselines = new ArrayConstructor<CapturedPropertyBaseline>(targets.length)
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index][0]
    const key = targets[index][1]
    const descriptor = objectGetOwnPropertyDescriptor(target, key)
    if (!descriptor) throw new Error("Unable to capture validator runtime binding.")
    baselines[index] = objectFreeze([
      target,
      captureDescriptor(key, descriptor)
    ]) as CapturedPropertyBaseline
  }
  return objectFreeze(baselines)
}

function captureDescriptor(key: PropertyKey, descriptor: PropertyDescriptor): CapturedDescriptor {
  const valueDescriptor = objectGetOwnPropertyDescriptor(descriptor, "value")
  const isData = valueDescriptor !== undefined
  return objectFreeze([
    key,
    isData,
    isData ? valueDescriptor.value : descriptorField(descriptor, "get"),
    isData ? descriptorField(descriptor, "writable") : descriptorField(descriptor, "set"),
    descriptorField(descriptor, "enumerable") as boolean,
    descriptorField(descriptor, "configurable") as boolean
  ]) as CapturedDescriptor
}

function descriptorField(descriptor: PropertyDescriptor, key: PropertyKey): unknown {
  const field = objectGetOwnPropertyDescriptor(descriptor, key)
  return field ? field.value : undefined
}

function objectBaselineMatches(baseline: CapturedObjectBaseline): boolean {
  const target = baseline[0]
  const descriptors = baseline[1]
  const keys = reflectOwnKeys(target)
  if (keys.length !== descriptors.length) return false
  for (let index = 0; index < descriptors.length; index += 1) {
    if (keys[index] !== descriptors[index][0] || !descriptorMatches(target, descriptors[index])) {
      return false
    }
  }
  return true
}

function descriptorMatches(target: object, baseline: CapturedDescriptor): boolean {
  const descriptor = objectGetOwnPropertyDescriptor(target, baseline[0])
  if (!descriptor) return false
  const valueDescriptor = objectGetOwnPropertyDescriptor(descriptor, "value")
  const isData = valueDescriptor !== undefined
  if (isData !== baseline[1]) return false
  const valueOrGetter = isData ? valueDescriptor.value : descriptorField(descriptor, "get")
  const writableOrSetter = isData
    ? descriptorField(descriptor, "writable")
    : descriptorField(descriptor, "set")
  return objectIs(valueOrGetter, baseline[2])
    && objectIs(writableOrSetter, baseline[3])
    && descriptorField(descriptor, "enumerable") === baseline[4]
    && descriptorField(descriptor, "configurable") === baseline[5]
}

function snapshotUntrustedPlainData(value: unknown, source: "manifest" | "handler"): unknown {
  const seen = new WeakSetConstructor<object>()
  const budget = { remaining: MAX_SNAPSHOT_NODES }
  try {
    return snapshotUnknown(value, source, seen, budget, 0)
  } catch (error) {
    const code = source === "manifest"
      ? "contribution.registry.manifest_invalid"
      : "contribution.registry.handler_set_invalid"
    rethrowUntrusted(error, code, source === "manifest"
      ? "Contribution manifest could not be safely read."
      : "Contribution handler set could not be safely read.")
  }
}

function snapshotUnknown(
  value: unknown,
  source: "manifest" | "handler",
  seen: WeakSet<object>,
  budget: { remaining: number },
  depth: number
): unknown {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) return value
  if (typeof value === "function") throw sourceReadError(source)
  if (depth > MAX_SNAPSHOT_DEPTH || budget.remaining <= 0) {
    throw sourceReadError(source)
  }
  budget.remaining -= 1
  if (weakSetContains(seen, value)) throw sourceReadError(source)
  weakSetInsert(seen, value)
  try {
    if (arrayIsArray(value)) return snapshotArray(value, source, seen, budget, depth)
    return snapshotRecord(value, source, seen, budget, depth)
  } finally {
    weakSetRemove(seen, value)
  }
}

function snapshotArray(
  value: unknown[],
  source: "manifest" | "handler",
  seen: WeakSet<object>,
  budget: { remaining: number },
  depth: number
): unknown[] {
  const lengthDescriptor = safeOwnDescriptor(value, "length", source)
  const length = lengthDescriptor && "value" in lengthDescriptor ? lengthDescriptor.value : undefined
  if (!numberIsSafeInteger(length) || length < 0 || length > MAX_ARRAY_LENGTH) throw sourceReadError(source)
  const keys = safeOwnKeys(value, source)
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (key === "length") continue
    if (typeof key !== "string" || !isArrayIndexWithinLength(key, length)) throw sourceReadError(source)
  }
  const result = isolateRegistryArray(new ArrayConstructor<unknown>(length))
  for (let index = 0; index < length; index += 1) {
    const descriptor = safeOwnDescriptor(value, StringConstructor(index), source)
    const item = descriptor ? descriptorValue(value, descriptor, source) : undefined
    result[index] = snapshotUnknown(item, source, seen, budget, depth + 1)
  }
  return result
}

function snapshotRecord(
  value: object,
  source: "manifest" | "handler",
  seen: WeakSet<object>,
  budget: { remaining: number },
  depth: number
): Record<string, unknown> {
  const keys = safeOwnKeys(value, source)
  const result = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string") throw sourceReadError(source)
    const descriptor = safeOwnDescriptor(value, key, source)
    if (!descriptor || !descriptor.enumerable) throw sourceReadError(source)
    const item = descriptorValue(value, descriptor, source)
    objectDefineProperty(result, key, {
      value: snapshotUnknown(item, source, seen, budget, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true
    })
  }
  return result
}

function snapshotHandlerSet(value: unknown): SnapshottedHandlers {
  if (value === null || typeof value !== "object" || safeArrayCheck(value, "handler")) {
    throw internalError("contribution.registry.handler_set_invalid", "Contribution handlers must be an object of native Maps.")
  }
  const keys = safeOwnKeys(value, "handler")
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (typeof key !== "string" || !isAllowedHandlerSetKey(key)) {
      throw internalError("contribution.registry.handler_set_invalid", "Contribution handler set has an unknown property.")
    }
  }

  const actionProviders = readRequiredHandlerProperty(value, "actionProviders")
  const preflightChecks = readRequiredHandlerProperty(value, "preflightChecks")
  const resultSinks = readRequiredHandlerProperty(value, "resultSinks")
  const agentDescriptor = safeOwnDescriptor(value, "agentProvider", "handler")
  const agentProvider = agentDescriptor ? descriptorValue(value, agentDescriptor, "handler") : undefined
  const snapshot = objectCreate(null) as {
    actionProviders: Map<string, unknown>
    preflightChecks: Map<string, unknown>
    resultSinks: Map<string, unknown>
    agentProvider?: unknown
  }
  defineSnapshotField(snapshot, "actionProviders", snapshotNativeMap(actionProviders))
  defineSnapshotField(snapshot, "preflightChecks", snapshotNativeMap(preflightChecks))
  defineSnapshotField(snapshot, "resultSinks", snapshotNativeMap(resultSinks))
  if (agentProvider !== undefined) defineSnapshotField(snapshot, "agentProvider", agentProvider)
  return objectFreeze(snapshot)
}

function isAllowedHandlerSetKey(key: string): boolean {
  return key === "actionProviders"
    || key === "preflightChecks"
    || key === "resultSinks"
    || key === "agentProvider"
}

function defineSnapshotField(target: object, key: string, value: unknown): void {
  objectDefineProperty(target, key, {
    value,
    enumerable: true,
    configurable: false,
    writable: false
  })
}

function safeArrayCheck(value: object, source: "manifest" | "handler"): boolean {
  try {
    return arrayIsArray(value)
  } catch (error) {
    rethrowUntrusted(error, sourceCode(source), sourceMessage(source))
  }
}

function readRequiredHandlerProperty(value: object, key: string): unknown {
  const descriptor = safeOwnDescriptor(value, key, "handler")
  if (!descriptor) {
    throw internalError("contribution.registry.handler_set_invalid", "Contribution handler set is missing a required Map.")
  }
  return descriptorValue(value, descriptor, "handler")
}

function snapshotNativeMap(value: unknown): Map<string, unknown> {
  const snapshot = new MapConstructor<string, unknown>()
  try {
    const iterator = reflectApply(mapEntries, value as Map<unknown, unknown>, [])
    let count = 0
    while (true) {
      const step = reflectApply(mapIteratorNext, iterator, []) as IteratorResult<[unknown, unknown]>
      if (step.done) break
      count += 1
      if (count > MAX_HANDLER_ENTRIES) {
        throw internalError("contribution.registry.handler_set_invalid", "Contribution handler Map has too many entries.")
      }
      const pair = step.value
      const key = pair[0]
      if (typeof key !== "string") {
        throw internalError("contribution.registry.handler_set_invalid", "Contribution handler Map keys must be strings.")
      }
      reflectApply(mapSet, snapshot, [key, pair[1]])
    }
  } catch (error) {
    rethrowUntrusted(
      error,
      "contribution.registry.handler_set_invalid",
      "Contribution handlers must use compatible native Maps."
    )
  }
  return snapshot
}

function createIncomingContributions(
  manifest: Readonly<WorkflowContributionManifest>,
  handlers: SnapshottedHandlers
): IncomingContribution[] {
  const actionIds: string[] = []
  for (let index = 0; index < manifest.action_providers.length; index += 1) {
    appendArray(actionIds, manifest.action_providers[index].id)
  }
  const preflightIds: string[] = []
  for (let index = 0; index < manifest.preflight_checks.length; index += 1) {
    appendArray(preflightIds, manifest.preflight_checks[index].id)
  }
  const sinkIds: string[] = []
  for (let index = 0; index < manifest.result_sinks.length; index += 1) {
    appendArray(sinkIds, manifest.result_sinks[index].type)
  }
  assertExactHandlerIds(handlers.actionProviders, actionIds)
  assertExactHandlerIds(handlers.preflightChecks, preflightIds)
  assertExactHandlerIds(handlers.resultSinks, sinkIds)
  if ((manifest.agent_provider !== undefined) !== (handlers.agentProvider !== undefined)) {
    throw internalError(
      "contribution.registry.handler_mismatch",
      "Agent provider declaration and handler presence must match exactly."
    )
  }

  const incoming: IncomingContribution[] = []
  for (let index = 0; index < manifest.action_providers.length; index += 1) {
    const declaration = manifest.action_providers[index]
    const value = reflectApply(mapGet, handlers.actionProviders, [declaration.id])
    const handler = snapshotActionProvider(value, declaration.id, manifest.owner.id)
    appendArray(incoming, entry("action_provider", declaration.id, manifest, declaration, handler))
  }
  for (let index = 0; index < manifest.preflight_checks.length; index += 1) {
    const declaration = manifest.preflight_checks[index]
    const handler = reflectApply(mapGet, handlers.preflightChecks, [declaration.id])
    if (typeof handler !== "function") throw handlerMismatch()
    appendArray(incoming, entry(
      "preflight_check",
      declaration.id,
      manifest,
      declaration,
      handler as PreflightCheckHandler
    ))
  }
  for (let index = 0; index < manifest.result_sinks.length; index += 1) {
    const declaration = manifest.result_sinks[index]
    const handler = reflectApply(mapGet, handlers.resultSinks, [declaration.type])
    if (typeof handler !== "function") throw handlerMismatch()
    appendArray(incoming, entry(
      "result_sink",
      declaration.type,
      manifest,
      declaration,
      handler as ResultSinkHandler
    ))
  }
  if (manifest.agent_provider && handlers.agentProvider !== undefined) {
    appendArray(incoming, entry(
      "agent_provider",
      manifest.agent_provider.id,
      manifest,
      manifest.agent_provider,
      snapshotAgentProvider(handlers.agentProvider)
    ))
  }
  for (let index = 0; index < manifest.workflow_templates.length; index += 1) {
    const declaration = manifest.workflow_templates[index]
    appendArray(incoming, entry("workflow_template", declaration.id, manifest, declaration))
  }
  for (let index = 0; index < manifest.schemas.length; index += 1) {
    const declaration = manifest.schemas[index]
    appendArray(incoming, entry("schema", declaration.id, manifest, declaration))
  }
  return incoming
}

function assertExactHandlerIds(actual: Map<string, unknown>, expected: readonly string[]): void {
  if (reflectApply(mapSizeGetter, actual, []) !== expected.length) throw handlerMismatch()
  for (let index = 0; index < expected.length; index += 1) {
    if (!reflectApply(mapHas, actual, [expected[index]])) throw handlerMismatch()
  }
}

function snapshotActionProvider(value: unknown, expectedId: string, ownerId: string): ActionProvider {
  if (value === null || typeof value !== "object") throw handlerMismatch()
  const id = readHandlerMember(value, "id")
  const execute = readHandlerMember(value, "execute")
  if (id !== expectedId || typeof execute !== "function") throw handlerMismatch()
  const callExecute = isolateRegistryFunction((input: Parameters<ActionProvider["execute"]>[0]) => (
    reflectApply(execute, value, [input])
  ))
  return objectFreeze(isolateRegistryObject({
    id: expectedId,
    sourceId: ownerId,
    execute: callExecute
  }))
}

function snapshotAgentProvider(value: unknown): AgentProvider {
  if (value === null || typeof value !== "object") throw handlerMismatch()
  const run = readHandlerMember(value, "run")
  if (typeof run !== "function") throw handlerMismatch()
  const callRun = isolateRegistryFunction((input: Parameters<AgentProvider["run"]>[0]) => (
    reflectApply(run, value, [input])
  ))
  return objectFreeze(isolateRegistryObject({ run: callRun }))
}

function readHandlerMember(value: object, key: string): unknown {
  const seen = new WeakSetConstructor<object>()
  let current: object | null = value
  for (let depth = 0; current !== null && depth < MAX_HANDLER_PROTOTYPE_DEPTH; depth += 1) {
    // Object.prototype is never an admissible provider surface; stopping here
    // prevents ambient prototype pollution from manufacturing handlers.
    if (current === objectPrototype) break
    if (weakSetContains(seen, current)) {
      throw internalError(
        "contribution.registry.handler_set_invalid",
        "Contribution handler prototype chain is cyclic."
      )
    }
    weakSetInsert(seen, current)
    const descriptor = safeOwnDescriptor(current, key, "handler")
    if (descriptor) return descriptorValue(value, descriptor, "handler")
    current = safeHandlerPrototype(current)
  }
  if (current !== null && current !== objectPrototype) {
    throw internalError(
      "contribution.registry.handler_set_invalid",
      "Contribution handler prototype chain exceeds the supported depth."
    )
  }
  throw handlerMismatch()
}

function entry(
  kind: ContributionKind,
  id: string,
  manifest: Readonly<WorkflowContributionManifest>,
  declaration: ContributionDeclaration,
  handler?: IncomingContribution["handler"]
): IncomingContribution {
  const metadata: ContributionMetadata = objectFreeze(isolateRegistryObject({
    kind,
    id,
    owner: manifest.owner,
    declaration
  }))
  return contributionRecord({ metadata }, handler)
}

function contributionRecord<T extends { metadata: ContributionMetadata }>(
  base: T,
  handler: IncomingContribution["handler"]
): T & { readonly handler?: IncomingContribution["handler"] } {
  if (handler !== undefined) {
    objectDefineProperty(base, "handler", {
      value: handler,
      enumerable: false,
      configurable: false,
      writable: false
    })
  }
  isolateRegistryObject(base)
  return objectFreeze(base) as T & { readonly handler?: IncomingContribution["handler"] }
}

function ownContributionHandler(
  record: { metadata: ContributionMetadata }
): IncomingContribution["handler"] {
  const descriptor = objectGetOwnPropertyDescriptor(record, "handler")
  return descriptor && "value" in descriptor
    ? descriptor.value as IncomingContribution["handler"]
    : undefined
}

function createSnapshot(ordered: readonly RegisteredContribution[]): ContributionRegistrySnapshot {
  const actionProviders = isolateRegistryArray<ContributionMetadata>([])
  const preflightChecks = isolateRegistryArray<ContributionMetadata>([])
  const resultSinks = isolateRegistryArray<ContributionMetadata>([])
  const agentProviders = isolateRegistryArray<ContributionMetadata>([])
  const workflowTemplates = isolateRegistryArray<ContributionMetadata>([])
  const schemas = isolateRegistryArray<ContributionMetadata>([])
  for (let index = 0; index < ordered.length; index += 1) {
    const metadata = ordered[index].metadata
    switch (metadata.kind) {
      case "action_provider": appendArray(actionProviders, metadata); break
      case "preflight_check": appendArray(preflightChecks, metadata); break
      case "result_sink": appendArray(resultSinks, metadata); break
      case "agent_provider": appendArray(agentProviders, metadata); break
      case "workflow_template": appendArray(workflowTemplates, metadata); break
      case "schema": appendArray(schemas, metadata); break
    }
  }
  return objectFreeze(isolateRegistryObject({
    actionProviders: objectFreeze(actionProviders),
    preflightChecks: objectFreeze(preflightChecks),
    resultSinks: objectFreeze(resultSinks),
    agentProviders: objectFreeze(agentProviders),
    workflowTemplates: objectFreeze(workflowTemplates),
    schemas: objectFreeze(schemas)
  }))
}

function findAgentId(ordered: readonly RegisteredContribution[]): string | undefined {
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].metadata.kind === "agent_provider") return ordered[index].metadata.id
  }
  return undefined
}

function cloneMap<K, V>(source: Map<K, V>): Map<K, V> {
  const target = new MapConstructor<K, V>()
  const iterator = reflectApply(mapEntries, source, []) as IterableIterator<[K, V]>
  while (true) {
    const step = reflectApply(mapIteratorNext, iterator, []) as IteratorResult<[K, V]>
    if (step.done) break
    reflectApply(mapSet, target, [step.value[0], step.value[1]])
  }
  return target
}

function appendArray<T>(target: T[], value: T): void {
  reflectApply(arrayPush, target, [value])
}

function copyArray<T>(source: readonly T[]): T[] {
  const result = new ArrayConstructor<T>(source.length)
  for (let index = 0; index < source.length; index += 1) result[index] = source[index]
  return result
}

function deepFreezePlainData<T>(value: T, seen = new WeakSetConstructor<object>()): T {
  if (value === null || typeof value !== "object" || weakSetContains(seen, value)) return value
  weakSetInsert(seen, value)
  if (arrayIsArray(value)) {
    for (let index = 0; index < value.length; index += 1) deepFreezePlainData(value[index], seen)
  } else {
    const keys = reflectOwnKeys(value)
    for (let index = 0; index < keys.length; index += 1) {
      const descriptor = objectGetOwnPropertyDescriptor(value, keys[index])
      if (descriptor && "value" in descriptor) deepFreezePlainData(descriptor.value, seen)
    }
  }
  return objectFreeze(value)
}

function safeOwnKeys(value: object, source: "manifest" | "handler"): PropertyKey[] {
  try {
    return reflectOwnKeys(value)
  } catch (error) {
    rethrowUntrusted(error, sourceCode(source), sourceMessage(source))
  }
}

function safeOwnDescriptor(
  value: object,
  key: PropertyKey,
  source: "manifest" | "handler"
): PropertyDescriptor | undefined {
  try {
    return objectGetOwnPropertyDescriptor(value, key)
  } catch (error) {
    rethrowUntrusted(error, sourceCode(source), sourceMessage(source))
  }
}

function safeHandlerPrototype(value: object): object | null {
  try {
    return objectGetPrototypeOf(value)
  } catch (error) {
    rethrowUntrusted(
      error,
      "contribution.registry.handler_set_invalid",
      "Contribution handler prototype could not be safely read."
    )
  }
}

function descriptorValue(
  receiver: object,
  descriptor: PropertyDescriptor,
  source: "manifest" | "handler"
): unknown {
  if ("value" in descriptor) return descriptor.value
  try {
    return descriptor.get ? reflectApply(descriptor.get, receiver, []) : undefined
  } catch (error) {
    rethrowUntrusted(error, sourceCode(source), sourceMessage(source))
  }
}

function sourceReadError(source: "manifest" | "handler"): ContributionRegistryError {
  return internalError(sourceCode(source), sourceMessage(source))
}

function sourceCode(source: "manifest" | "handler"): ContributionRegistryErrorCode {
  return source === "manifest"
    ? "contribution.registry.manifest_invalid"
    : "contribution.registry.handler_set_invalid"
}

function sourceMessage(source: "manifest" | "handler"): string {
  return source === "manifest"
    ? "Contribution manifest could not be safely read."
    : "Contribution handler set could not be safely read."
}

function isArrayIndexWithinLength(key: string, length: number): boolean {
  if (!reflectApply(regexpTest, arrayIndexPattern, [key])) return false
  const index = NumberConstructor(key)
  return numberIsSafeInteger(index) && index >= 0 && index < length && StringConstructor(index) === key
}

function handlerMismatch(): ContributionRegistryError {
  return internalError(
    "contribution.registry.handler_mismatch",
    "Contribution handlers must match declared identifiers and callable contracts exactly."
  )
}

function internalError(
  code: ContributionRegistryErrorCode,
  message: string,
  diagnosticId: string = code
): ContributionRegistryError {
  const error = new ContributionRegistryError(code, message, diagnosticId)
  weakSetInsert(authenticErrors, error)
  return objectFreeze(error)
}

function rethrowUntrusted(
  error: unknown,
  fallbackCode: ContributionRegistryErrorCode,
  fallbackMessage: string
): never {
  if (
    error !== null
    && typeof error === "object"
    && weakSetContains(authenticErrors, error as ContributionRegistryError)
  ) {
    const trusted = error as ContributionRegistryError
    throw internalError(trusted.code as ContributionRegistryErrorCode, trusted.message, trusted.diagnosticId)
  }
  throw internalError(fallbackCode, fallbackMessage)
}

function weakSetContains<T extends object>(set: WeakSet<T>, value: T): boolean {
  return reflectApply(weakSetHas, set, [value])
}

function weakSetInsert<T extends object>(set: WeakSet<T>, value: T): void {
  reflectApply(weakSetAdd, set, [value])
}

function weakSetRemove<T extends object>(set: WeakSet<T>, value: T): void {
  reflectApply(weakSetDelete, set, [value])
}

function boundedText(value: string): string {
  const source = StringConstructor(value)
  let result = ""
  let bytes = 0
  for (let index = 0; index < source.length; index += 1) {
    const codeUnit = reflectApply(stringCharCodeAt, source, [index]) as number
    let character = source[index]
    let nextBytes: number
    if ((codeUnit >= 0 && codeUnit <= 0x1f) || (codeUnit >= 0x7f && codeUnit <= 0x9f)) {
      character = "�"
      nextBytes = 3
    } else if (codeUnit <= 0x7f) {
      nextBytes = 1
    } else if (codeUnit <= 0x7ff) {
      nextBytes = 2
    } else if (codeUnit >= 0xd800 && codeUnit <= 0xdbff && index + 1 < source.length) {
      const nextCodeUnit = reflectApply(stringCharCodeAt, source, [index + 1]) as number
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        character += source[index + 1]
        nextBytes = 4
        index += 1
      } else {
        nextBytes = 3
      }
    } else {
      nextBytes = 3
    }
    if (bytes + nextBytes > DIAGNOSTIC_BYTE_LIMIT) break
    result += character
    bytes += nextBytes
  }
  return result
}
