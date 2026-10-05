import { types as utilTypes } from "node:util"

import type {
  WorkflowProviderRegistration,
  WorkflowProviderRegistrationInput
} from "./core/actionRegistry"
import type { WorkflowContractV2Entrypoint } from "./workflowContractV2Entrypoint"

export interface WorkflowContractV2ProviderRegistryLike {
  registerWorkflowProviderContract(
    input: WorkflowProviderRegistrationInput
  ): WorkflowProviderRegistration
}

export interface WorkflowContractV2ProviderLifecycleInput {
  readonly actionRegistry: WorkflowContractV2ProviderRegistryLike
  readonly createEntrypoint: () => WorkflowContractV2Entrypoint
  readonly onChanged?: () => void
}

interface ManagedRegistration {
  registration: WorkflowProviderRegistration
  disposed: boolean
}

type RegisterProvider = (
  input: WorkflowProviderRegistrationInput
) => WorkflowProviderRegistration

const isProxy = utilTypes.isProxy
const objectCreate = Object.create
const objectFreeze = Object.freeze
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const objectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
const objectGetPrototypeOf = Object.getPrototypeOf
const objectHasOwn = Object.hasOwn
const objectPrototype = Object.prototype
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const setAdd = Set.prototype.add
const setClear = Set.prototype.clear
const setDelete = Set.prototype.delete
const setForEach = Set.prototype.forEach
const SetConstructor = Set
const INPUT_REQUIRED_FIELDS = objectFreeze(["actionRegistry", "createEntrypoint"] as const)
const INPUT_OPTIONAL_FIELDS = objectFreeze(["onChanged"] as const)

export class WorkflowContractV2ProviderLifecycle {
  private readonly registerProvider: RegisterProvider
  private readonly createEntrypoint: () => WorkflowContractV2Entrypoint
  private readonly onChanged?: () => void
  private readonly registrations = new SetConstructor<ManagedRegistration>()
  private entrypoint?: WorkflowContractV2Entrypoint
  private disposed = false

  constructor(input: WorkflowContractV2ProviderLifecycleInput) {
    const snapshot = snapshotInput(input)
    this.registerProvider = bindRegistrationMethod(snapshot.actionRegistry)
    if (typeof snapshot.createEntrypoint !== "function" || isProxy(snapshot.createEntrypoint)) {
      throw new TypeError("Workflow Contract v2 entrypoint factory is invalid.")
    }
    if (snapshot.onChanged !== undefined && (typeof snapshot.onChanged !== "function" || isProxy(snapshot.onChanged))) {
      throw new TypeError("Workflow Contract v2 provider change callback is invalid.")
    }
    this.createEntrypoint = snapshot.createEntrypoint as () => WorkflowContractV2Entrypoint
    this.onChanged = snapshot.onChanged as (() => void) | undefined
    this.entrypoint = this.buildEntrypoint()
  }

  current(): WorkflowContractV2Entrypoint {
    if (this.disposed) throw new Error("Workflow Contract v2 provider lifecycle is disposed.")
    if (this.entrypoint === undefined) {
      throw new Error("Workflow Contract v2 compiler environment is unavailable.")
    }
    return this.entrypoint
  }

  register(input: WorkflowProviderRegistrationInput): WorkflowProviderRegistration {
    if (this.disposed) throw new Error("Workflow Contract v2 provider lifecycle is disposed.")
    const registration = reflectApply(this.registerProvider, undefined, [input]) as WorkflowProviderRegistration
    let next: WorkflowContractV2Entrypoint
    try {
      next = this.buildEntrypoint()
    } catch (error) {
      registration.dispose()
      throw error
    }

    const managed: ManagedRegistration = { registration, disposed: false }
    reflectApply(setAdd, this.registrations, [managed])
    this.entrypoint = next
    this.notifyChanged()
    return objectFreeze({
      dispose: () => this.disposeRegistration(managed)
    })
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.entrypoint = undefined
    reflectApply(setForEach, this.registrations, [
      (managed: ManagedRegistration) => {
        if (managed.disposed) return
        managed.disposed = true
        managed.registration.dispose()
      }
    ])
    reflectApply(setClear, this.registrations, [])
  }

  private disposeRegistration(managed: ManagedRegistration): void {
    if (managed.disposed) return
    managed.disposed = true
    reflectApply(setDelete, this.registrations, [managed])
    managed.registration.dispose()
    if (this.disposed) return

    try {
      this.entrypoint = this.buildEntrypoint()
    } catch (error) {
      this.entrypoint = undefined
      this.notifyChanged()
      throw error
    }
    this.notifyChanged()
  }

  private buildEntrypoint(): WorkflowContractV2Entrypoint {
    const entrypoint = reflectApply(this.createEntrypoint, undefined, []) as WorkflowContractV2Entrypoint
    if (typeof entrypoint !== "object" || entrypoint === null || isProxy(entrypoint)) {
      throw new TypeError("Workflow Contract v2 entrypoint factory returned an invalid value.")
    }
    return entrypoint
  }

  private notifyChanged(): void {
    if (this.onChanged === undefined) return
    try {
      reflectApply(this.onChanged, undefined, [])
    } catch {
      // The provider/environment transition is already committed. A UI reload
      // callback cannot roll back the exact registry and compiler namespace.
    }
  }
}

function bindRegistrationMethod(value: unknown): RegisterProvider {
  if (
    (typeof value !== "object" && typeof value !== "function")
    || value === null
    || isProxy(value)
  ) throw new TypeError("Workflow Contract v2 provider registry is invalid.")

  let owner: object | null = value
  while (owner !== null) {
    if (isProxy(owner)) throw new TypeError("Workflow Contract v2 provider registry is invalid.")
    const descriptor = objectGetOwnPropertyDescriptor(owner, "registerWorkflowProviderContract")
    if (descriptor !== undefined) {
      if (
        !objectHasOwn(descriptor, "value")
        || objectHasOwn(descriptor, "get")
        || objectHasOwn(descriptor, "set")
        || typeof descriptor.value !== "function"
        || isProxy(descriptor.value)
      ) throw new TypeError("Workflow Contract v2 provider registry method is invalid.")
      const method = descriptor.value
      return (input) => reflectApply(method, value, [input]) as WorkflowProviderRegistration
    }
    owner = objectGetPrototypeOf(owner)
  }
  throw new TypeError("Workflow Contract v2 provider registry method is unavailable.")
}

function snapshotInput(
  input: WorkflowContractV2ProviderLifecycleInput
): Readonly<Record<string, unknown>> {
  if (typeof input !== "object" || input === null || isProxy(input)) {
    throw new TypeError("Workflow Contract v2 provider lifecycle input must be an ordinary record.")
  }
  if (objectGetPrototypeOf(input) !== objectPrototype) {
    throw new TypeError("Workflow Contract v2 provider lifecycle input must use Object.prototype.")
  }
  const descriptors = objectGetOwnPropertyDescriptors(input)
  const keys = reflectOwnKeys(descriptors)
  const result: Record<string, unknown> = objectCreate(null) as Record<string, unknown>
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index]
    if (
      typeof key !== "string"
      || (!contains(INPUT_REQUIRED_FIELDS, key) && !contains(INPUT_OPTIONAL_FIELDS, key))
    ) throw new TypeError("Workflow Contract v2 provider lifecycle input contains an unknown field.")
    const descriptor = descriptors[key]
    if (
      descriptor === undefined
      || !objectHasOwn(descriptor, "value")
      || objectHasOwn(descriptor, "get")
      || objectHasOwn(descriptor, "set")
      || descriptor.enumerable !== true
    ) throw new TypeError("Workflow Contract v2 provider lifecycle input must contain enumerable data fields.")
    result[key] = descriptor.value
  }
  for (let index = 0; index < INPUT_REQUIRED_FIELDS.length; index += 1) {
    if (!objectHasOwn(result, INPUT_REQUIRED_FIELDS[index])) {
      throw new TypeError("Workflow Contract v2 provider lifecycle input is missing a required field.")
    }
  }
  return objectFreeze(result)
}

function contains(values: readonly string[], value: string): boolean {
  for (let index = 0; index < values.length; index += 1) if (values[index] === value) return true
  return false
}
