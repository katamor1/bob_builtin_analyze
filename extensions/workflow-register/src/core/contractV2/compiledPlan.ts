import { types as utilTypes } from "node:util"

import { canonicalJsonDigest } from "./canonicalJson"
import type { WorkflowCompilerEnvironment } from "./compilerEnvironment"
import { requireWorkflowCompilerEnvironmentState } from "./compilerEnvironment"
import type { CompiledLocalJsonSchema } from "./jsonSchema"
import { cloneAndFreezeJsonValue, type JsonValue } from "./jsonValue"
import type { WorkflowPackageDocumentV2 } from "./packageShape"
import type { Sha256Digest } from "./providerContract"
import type {
  BoundWorkflowProviderDispatchHandle,
  WorkflowProviderLockEvidence
} from "./providerRegistry"
import type { LockedBobBinding, WorkflowCompilerPolicyVersions } from "./workflowLockContract"

export interface CompiledWorkflowPlanPredicateRecord {
  readonly phase: "entry" | "postCommit"
  readonly placement: JsonValue
  readonly location: { readonly path: string; readonly pointer: string }
  readonly predicate: JsonValue
}

export interface CompiledWorkflowPlan {
  readonly schemaVersion: "workflow-compiled-plan/v2"
  readonly compilerContractVersion: "workflow-register-compiler/v2"
  readonly policyVersions: WorkflowCompilerPolicyVersions
  readonly workflowId: string
  readonly packageDigest: Sha256Digest
  readonly lockfileDigest: Sha256Digest
  readonly environmentDigest: Sha256Digest
  readonly workflow: WorkflowPackageDocumentV2
  readonly prompts: readonly {
    readonly id: string
    readonly text: string
    readonly digest: Sha256Digest
  }[]
  readonly schemas: readonly {
    readonly dialect: string
    readonly id: string
    readonly digest: Sha256Digest
  }[]
  readonly schemaCatalogDigest: Sha256Digest
  readonly predicates: readonly CompiledWorkflowPlanPredicateRecord[]
  readonly providerBindings: readonly WorkflowProviderLockEvidence[]
  readonly bobProfileBinding: LockedBobBinding
  readonly requiredArtifacts: WorkflowPackageDocumentV2["requiredArtifacts"]
}

declare const compiledWorkflowPlanHandleBrand: unique symbol
export interface CompiledWorkflowPlanHandle {
  readonly [compiledWorkflowPlanHandleBrand]: true
  readonly plan: CompiledWorkflowPlan
  readonly planDigest: Sha256Digest
}

export interface CompiledWorkflowPlanPrivateState {
  readonly environment: WorkflowCompilerEnvironment
  readonly environmentIdentity: object
  readonly purpose: "runtime" | "authoring-validation" | "evidence"
  readonly leaseable: boolean
  readonly publication: "published" | "staging"
  readonly generation: string
  readonly prompts: readonly {
    readonly id: string
    readonly bytes: Readonly<Uint8Array>
  }[]
  readonly schemas: readonly {
    readonly id: string
    readonly compiled: CompiledLocalJsonSchema
  }[]
  readonly providers: readonly {
    readonly id: string
    readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
  }[]
}

export interface CreateCompiledWorkflowPlanHandleInput {
  readonly environment: WorkflowCompilerEnvironment
  readonly publication: "published" | "staging"
  readonly generation: string
  readonly plan: unknown
  readonly prompts: readonly { readonly id: string; readonly bytes: Uint8Array }[]
  readonly schemas: readonly { readonly id: string; readonly compiled: CompiledLocalJsonSchema }[]
  readonly providers: readonly {
    readonly id: string
    readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
  }[]
}

const isProxy = utilTypes.isProxy
const arrayPush = Array.prototype.push
const objectFreeze = Object.freeze
const reflectApply = Reflect.apply
const typedArraySet = Uint8Array.prototype.set
const Uint8ArrayConstructor = Uint8Array
const weakMapGet = Function.prototype.call.bind(WeakMap.prototype.get) as (
  map: WeakMap<object, CompiledWorkflowPlanPrivateState>,
  key: object
) => CompiledWorkflowPlanPrivateState | undefined
const weakMapSet = Function.prototype.call.bind(WeakMap.prototype.set) as (
  map: WeakMap<object, CompiledWorkflowPlanPrivateState>,
  key: object,
  value: CompiledWorkflowPlanPrivateState
) => WeakMap<object, CompiledWorkflowPlanPrivateState>
const states = new WeakMap<object, CompiledWorkflowPlanPrivateState>()

export function createCompiledWorkflowPlanHandle(
  input: CreateCompiledWorkflowPlanHandleInput
): CompiledWorkflowPlanHandle {
  if (typeof input !== "object" || input === null || isProxy(input)) {
    throw new TypeError("Compiled workflow plan input is invalid.")
  }
  const environmentState = requireWorkflowCompilerEnvironmentState(input.environment)
  if (input.publication !== "published" && input.publication !== "staging") {
    throw new TypeError("Compiled workflow plan publication is invalid.")
  }
  if (typeof input.generation !== "string" || input.generation.length === 0) {
    throw new TypeError("Compiled workflow plan generation is invalid.")
  }

  const plan = cloneAndFreezeJsonValue(input.plan) as unknown as CompiledWorkflowPlan
  const planDigest = canonicalJsonDigest(plan) as Sha256Digest
  const handle = objectFreeze({ plan, planDigest }) as CompiledWorkflowPlanHandle

  const promptCopies: { readonly id: string; readonly bytes: Readonly<Uint8Array> }[] = []
  for (let index = 0; index < input.prompts.length; index += 1) {
    const prompt = input.prompts[index]
    const bytes = new Uint8ArrayConstructor(prompt.bytes.byteLength)
    reflectApply(typedArraySet, bytes, [prompt.bytes])
    push(promptCopies, objectFreeze({ id: prompt.id, bytes }))
  }

  const schemaCopies: { readonly id: string; readonly compiled: CompiledLocalJsonSchema }[] = []
  for (let index = 0; index < input.schemas.length; index += 1) {
    const schema = input.schemas[index]
    push(schemaCopies, objectFreeze({ id: schema.id, compiled: schema.compiled }))
  }

  const providerCopies: {
    readonly id: string
    readonly dispatchHandle: BoundWorkflowProviderDispatchHandle
  }[] = []
  for (let index = 0; index < input.providers.length; index += 1) {
    const provider = input.providers[index]
    push(providerCopies, objectFreeze({
      id: provider.id,
      dispatchHandle: provider.dispatchHandle
    }))
  }

  weakMapSet(states, handle, objectFreeze({
    environment: input.environment,
    environmentIdentity: environmentState.identity,
    purpose: environmentState.purpose,
    leaseable: environmentState.leaseable && input.publication === "published",
    publication: input.publication,
    generation: input.generation,
    prompts: objectFreeze(promptCopies),
    schemas: objectFreeze(schemaCopies),
    providers: objectFreeze(providerCopies)
  }))
  return handle
}

export function requireCompiledWorkflowPlanState(
  handle: CompiledWorkflowPlanHandle
): CompiledWorkflowPlanPrivateState {
  if (typeof handle !== "object" || handle === null || isProxy(handle)) {
    throw new TypeError("Compiled workflow plan handle is invalid.")
  }
  const state = weakMapGet(states, handle)
  if (state === undefined) throw new TypeError("Compiled workflow plan handle is invalid.")
  return state
}

export function compiledWorkflowPlanBelongsToEnvironment(
  handle: CompiledWorkflowPlanHandle,
  environment: WorkflowCompilerEnvironment
): boolean {
  const state = requireCompiledWorkflowPlanState(handle)
  const environmentState = requireWorkflowCompilerEnvironmentState(environment)
  return state.environmentIdentity === environmentState.identity
}

export function isCompiledWorkflowPlanLeasable(handle: CompiledWorkflowPlanHandle): boolean {
  return requireCompiledWorkflowPlanState(handle).leaseable
}

function push<T>(values: T[], value: T): void {
  reflectApply(arrayPush, values, [value])
}
