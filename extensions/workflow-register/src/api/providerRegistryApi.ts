import { types as nodeUtilTypes } from "node:util"
import {
  ContributionRegistry,
  type ContributionHandlerSet,
  type ContributionRegistration,
  type ContributionRegistryOptions,
  type ContributionRegistrySnapshot
} from "../core/contributionRegistry"
import type {
  ContributionManifestValidationContext,
  ContributionRegistryApiRange,
  WorkflowContributionManifest
} from "../core/contributionManifest"

export const PROVIDER_REGISTRY_API_VERSION = "provider-registry/v1" as const

export type ProviderProvenanceContext = ContributionManifestValidationContext

export interface ProviderRegistryV1Api {
  readonly apiVersion: typeof PROVIDER_REGISTRY_API_VERSION
  readonly negotiateProviderRegistry: (
    range: ContributionRegistryApiRange
  ) => typeof PROVIDER_REGISTRY_API_VERSION
  readonly registerContributionSet: (
    manifest: WorkflowContributionManifest,
    provenance: ProviderProvenanceContext,
    handlers: ContributionHandlerSet
  ) => ContributionRegistration
}

export type ProviderRegistryApiErrorCode =
  | "provider.registry.range_malformed"
  | "provider.registry.version_incompatible"
  | "provider.registry.host_disposed"

export class ProviderRegistryApiError extends Error {
  readonly code: ProviderRegistryApiErrorCode

  constructor(code: ProviderRegistryApiErrorCode, message: string) {
    super(message)
    this.name = "ProviderRegistryApiError"
    this.code = code
  }
}

const PROVIDER_REGISTRY_VERSION_PATTERN = /^provider-registry\/v([1-9][0-9]*)$/
const PROVIDER_REGISTRY_VERSION_MAX_LENGTH = 64
const HIGHEST_SUPPORTED_VERSION = 1n
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const BigIntConstructor = BigInt
const isProxy = nodeUtilTypes.isProxy
const reflectApply = Reflect.apply
const reflectOwnKeys = Reflect.ownKeys
const regexpExec = RegExp.prototype.exec

/** Negotiate the highest provider-registry version supported by this host. */
export function negotiateProviderRegistry(
  untrustedRange: ContributionRegistryApiRange
): typeof PROVIDER_REGISTRY_API_VERSION {
  const range = readClosedRange(untrustedRange)
  const min = parseVersion(range.min)
  const max = parseVersion(range.max)
  if (min === undefined || max === undefined || min > max) throw malformedRangeError()
  if (min <= HIGHEST_SUPPORTED_VERSION && HIGHEST_SUPPORTED_VERSION <= max) {
    return PROVIDER_REGISTRY_API_VERSION
  }
  throw new ProviderRegistryApiError(
    "provider.registry.version_incompatible",
    "Provider registry API range is incompatible with this host."
  )
}

/** Owns the registry instance and the activation-scoped registrations published through its API. */
export class ProviderRegistryHost {
  private readonly registry: ContributionRegistry
  private readonly registrations = new Set<ContributionRegistration>()
  private acceptingRegistrations = true
  readonly api: ProviderRegistryV1Api

  constructor(options: ContributionRegistryOptions = {}) {
    const additionalManifestPolicy = options.manifestPolicy
    this.registry = new ContributionRegistry({
      beforeCommit: options.beforeCommit,
      onRemove: options.onRemove,
      manifestPolicy: (manifest) => {
        negotiateProviderRegistry(manifest.registry_api)
        additionalManifestPolicy?.(manifest)
      }
    })
    const registerContributionSet = (
      manifest: WorkflowContributionManifest,
      provenance: ProviderProvenanceContext,
      handlers: ContributionHandlerSet
    ): ContributionRegistration => {
      if (!this.acceptingRegistrations) {
        throw new ProviderRegistryApiError(
          "provider.registry.host_disposed",
          "Provider registry host is disposed."
        )
      }
      const registration = this.registry.registerContributionSet(manifest, provenance, handlers)
      let disposed = false
      const tracked: ContributionRegistration = Object.freeze({
        dispose: () => {
          if (disposed) return
          registration.dispose()
          disposed = true
          this.registrations.delete(tracked)
        }
      })
      this.registrations.add(tracked)
      return tracked
    }
    this.api = Object.freeze({
      apiVersion: PROVIDER_REGISTRY_API_VERSION,
      negotiateProviderRegistry,
      registerContributionSet
    })
  }

  snapshot(): ContributionRegistrySnapshot {
    return this.registry.snapshot()
  }

  trackedRegistrationCount(): number {
    return this.registrations.size
  }

  dispose(): void {
    this.acceptingRegistrations = false
    const registrations = Array.from(this.registrations)
    let firstError: unknown
    let failed = false
    for (let index = registrations.length - 1; index >= 0; index -= 1) {
      try {
        registrations[index].dispose()
      } catch (error) {
        if (!failed) {
          firstError = error
          failed = true
        }
      }
    }
    if (failed) throw firstError
  }
}

function readClosedRange(untrustedRange: unknown): { min: string; max: string } {
  if (typeof untrustedRange !== "object" || untrustedRange === null) {
    throw malformedRangeError()
  }
  if (isProxy(untrustedRange)) throw malformedRangeError()

  let keys: PropertyKey[]
  try {
    keys = reflectOwnKeys(untrustedRange)
  } catch {
    throw malformedRangeError()
  }
  if (keys.length !== 2) throw malformedRangeError()
  let hasMin = false
  let hasMax = false
  for (let index = 0; index < keys.length; index += 1) {
    if (keys[index] === "min") hasMin = true
    else if (keys[index] === "max") hasMax = true
    else throw malformedRangeError()
  }
  if (!hasMin || !hasMax) throw malformedRangeError()

  let min: unknown
  let max: unknown
  try {
    min = ownDataValue(untrustedRange, "min")
    max = ownDataValue(untrustedRange, "max")
  } catch {
    throw malformedRangeError()
  }
  if (typeof min !== "string" || typeof max !== "string") throw malformedRangeError()
  return { min, max }
}

function ownDataValue(target: object, key: "min" | "max"): unknown {
  const descriptor = objectGetOwnPropertyDescriptor(target, key)
  if (!descriptor || !("value" in descriptor)) throw malformedRangeError()
  return descriptor.value
}

function parseVersion(value: string): bigint | undefined {
  if (value.length > PROVIDER_REGISTRY_VERSION_MAX_LENGTH) return undefined
  const match = reflectApply(regexpExec, PROVIDER_REGISTRY_VERSION_PATTERN, [value])
  return match ? BigIntConstructor(match[1]) : undefined
}

function malformedRangeError(): ProviderRegistryApiError {
  return new ProviderRegistryApiError(
    "provider.registry.range_malformed",
    "Provider registry API range is malformed."
  )
}
