import { types as nodeUtilTypes } from "node:util"
import type {
  ContributionHandlerSet,
  ContributionRegistration
} from "../core/contributionRegistry"
import type { WorkflowContributionManifest } from "../core/contributionManifest"
import {
  PROVIDER_REGISTRY_API_VERSION,
  type ProviderProvenanceContext,
  type ProviderRegistryV1Api
} from "./providerRegistryApi"

export const LEGACY_CONTRIBUTION_ADAPTER_POLICY = Object.freeze({
  deprecatedIn: "0.1.0",
  removeIn: "0.2.0",
  replacement: PROVIDER_REGISTRY_API_VERSION
})

export interface LegacyContributionAdapter {
  /**
   * @deprecated Use ProviderRegistryV1Api.registerContributionSet. Removed in workflow-register 0.2.0.
   */
  readonly registerLegacyContributionSet: (
    manifest: WorkflowContributionManifest,
    provenance: ProviderProvenanceContext,
    handlers: ContributionHandlerSet
  ) => ContributionRegistration
}

export interface LegacyContributionAdapterOptions {
  readonly api: ProviderRegistryV1Api
  readonly hostVersion: string
  readonly reportDiagnostic?: (message: string) => void
}

const LEGACY_DIAGNOSTIC =
  "Legacy contribution registration is deprecated and will be removed in 0.2.0; migrate to provider-registry/v1."
const SEMANTIC_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/
const NUMERIC_IDENTIFIER_PATTERN = /^[0-9]+$/
const MAX_VERSION_LENGTH = 200
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const regexpExec = RegExp.prototype.exec
const reflectApply = Reflect.apply
const stringTrim = String.prototype.trim
const stringSplit = String.prototype.split
const BigIntConstructor = BigInt
const isProxy = nodeUtilTypes.isProxy

/**
 * Creates the one-release compatibility adapter around the atomic provider-registry API.
 */
export function createLegacyContributionAdapter(
  options: LegacyContributionAdapterOptions
): LegacyContributionAdapter {
  let diagnosticAttempted = false

  return Object.freeze({
    registerLegacyContributionSet: (
      manifest: WorkflowContributionManifest,
      provenance: ProviderProvenanceContext,
      handlers: ContributionHandlerSet
    ): ContributionRegistration => {
      assertHostVersionSupported(options.hostVersion)
      assertRequiredOwnership(manifest, provenance)

      const negotiated = options.api.negotiateProviderRegistry({
        min: PROVIDER_REGISTRY_API_VERSION,
        max: PROVIDER_REGISTRY_API_VERSION
      })
      if (negotiated !== PROVIDER_REGISTRY_API_VERSION) {
        throw new Error("Legacy contribution adapter requires provider-registry/v1.")
      }

      const registration = options.api.registerContributionSet(manifest, provenance, handlers)
      if (!diagnosticAttempted) {
        diagnosticAttempted = true
        try {
          options.reportDiagnostic?.(LEGACY_DIAGNOSTIC)
        } catch {
          // A diagnostic sink must not turn a successful atomic registration into a failure.
        }
      }
      return registration
    }
  })
}

function assertHostVersionSupported(hostVersion: unknown): void {
  const actual = parseSemanticVersion(hostVersion)
  const deprecatedIn = parseSemanticVersion(LEGACY_CONTRIBUTION_ADAPTER_POLICY.deprecatedIn)
  const removeIn = parseSemanticVersion(LEGACY_CONTRIBUTION_ADAPTER_POLICY.removeIn)
  if (
    actual === undefined ||
    deprecatedIn === undefined ||
    removeIn === undefined ||
    compareSemanticVersions(actual, deprecatedIn) < 0 ||
    compareSemanticVersions(actual, removeIn) >= 0
  ) {
    throw new Error("Legacy contribution adapter is unavailable for this host version.")
  }
}

function assertRequiredOwnership(manifest: unknown, provenance: unknown): void {
  const owner = ownDataObject(manifest, "owner", "manifest owner")
  ownNonEmptyString(owner, "id", "manifest owner id")
  ownNonEmptyString(owner, "version", "manifest owner version")

  const expectedOwner = ownDataObject(provenance, "expectedOwner", "provenance owner")
  ownNonEmptyString(expectedOwner, "id", "provenance owner id")
  ownNonEmptyString(expectedOwner, "version", "provenance owner version")
  ownNonEmptyString(provenance, "ownerDirectory", "provenance owner directory")
}

function ownDataObject(target: unknown, key: string, label: string): object {
  const value = ownDataValue(target, key, label)
  if (typeof value !== "object" || value === null || isProxy(value)) {
    throw malformedArgument(label)
  }
  return value
}

function ownNonEmptyString(target: unknown, key: string, label: string): string {
  const value = ownDataValue(target, key, label)
  if (
    typeof value !== "string" ||
    reflectApply(stringTrim, value, []).length === 0
  ) {
    throw malformedArgument(label)
  }
  return value
}

function ownDataValue(target: unknown, key: string, label: string): unknown {
  if (typeof target !== "object" || target === null || isProxy(target)) {
    throw malformedArgument(label)
  }
  const descriptor = objectGetOwnPropertyDescriptor(target, key)
  if (!descriptor || !("value" in descriptor)) throw malformedArgument(label)
  return descriptor.value
}

function malformedArgument(label: string): Error {
  return new Error(`Legacy contribution adapter requires a valid ${label}.`)
}

interface PrereleaseIdentifier {
  readonly text: string
  readonly numeric?: bigint
}

type SemanticVersion = readonly [
  major: bigint,
  minor: bigint,
  patch: bigint,
  prerelease?: readonly PrereleaseIdentifier[]
]

function parseSemanticVersion(value: unknown): SemanticVersion | undefined {
  if (typeof value !== "string" || value.length > MAX_VERSION_LENGTH) return undefined
  const match = reflectApply(regexpExec, SEMANTIC_VERSION_PATTERN, [value])
  if (!match) return undefined
  let prerelease: PrereleaseIdentifier[] | undefined
  if (match[4] !== undefined) {
    prerelease = []
    const identifiers = reflectApply(stringSplit, match[4], ["."])
    for (let index = 0; index < identifiers.length; index += 1) {
      const text = identifiers[index]
      const numeric = reflectApply(regexpExec, NUMERIC_IDENTIFIER_PATTERN, [text]) !== null
      if (numeric && text.length > 1 && text[0] === "0") return undefined
      prerelease.push({ text, ...(numeric ? { numeric: BigIntConstructor(text) } : {}) })
    }
  }
  return [
    BigIntConstructor(match[1]),
    BigIntConstructor(match[2]),
    BigIntConstructor(match[3]),
    prerelease
  ]
}

function compareSemanticVersions(left: SemanticVersion, right: SemanticVersion): number {
  const major = compareBigInts(left[0], right[0])
  if (major !== 0) return major
  const minor = compareBigInts(left[1], right[1])
  if (minor !== 0) return minor
  const patch = compareBigInts(left[2], right[2])
  if (patch !== 0) return patch
  const leftPrerelease = left[3]
  const rightPrerelease = right[3]
  if (leftPrerelease === undefined) return rightPrerelease === undefined ? 0 : 1
  if (rightPrerelease === undefined) return -1
  const length = Math.min(leftPrerelease.length, rightPrerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftPrerelease[index]
    const rightIdentifier = rightPrerelease[index]
    if (leftIdentifier.text === rightIdentifier.text) continue
    if (leftIdentifier.numeric !== undefined && rightIdentifier.numeric !== undefined) {
      return leftIdentifier.numeric < rightIdentifier.numeric ? -1 : 1
    }
    if (leftIdentifier.numeric !== undefined) return -1
    if (rightIdentifier.numeric !== undefined) return 1
    return leftIdentifier.text < rightIdentifier.text ? -1 : 1
  }
  if (leftPrerelease.length < rightPrerelease.length) return -1
  if (leftPrerelease.length > rightPrerelease.length) return 1
  return 0
}

function compareBigInts(left: bigint, right: bigint): number {
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
