import type { ActionRegistry } from "../core/actionRegistry"
import {
  parseContributionRegistryRange, readInstalledContributionOwner, rejectContribution, validateContributionManifest,
  type ContributionRegistryApiRange, type InstalledContributionOwner, type ProviderProvenanceContext,
  type WorkflowContributionManifest
} from "../core/contributionManifest"
import type { ContributionHandlerSet, ContributionRegistration } from "../core/contributionRegistration"
import type { ContributionRegistrySnapshot } from "../core/contractV2/providerRegistry"

export const PROVIDER_REGISTRY_API_VERSION = "provider-registry/v1" as const
export function negotiateProviderRegistry(range: ContributionRegistryApiRange): typeof PROVIDER_REGISTRY_API_VERSION {
  const parsed = parseContributionRegistryRange(range)
  if (parsed.min > 1n || parsed.max < 1n) rejectContribution("provider.registry.version_incompatible")
  return PROVIDER_REGISTRY_API_VERSION
}
export interface ProviderRegistryV1Api {
  readonly apiVersion: typeof PROVIDER_REGISTRY_API_VERSION
  negotiateProviderRegistry(range: ContributionRegistryApiRange): typeof PROVIDER_REGISTRY_API_VERSION
  registerContributionSet(manifest: WorkflowContributionManifest, provenance: ProviderProvenanceContext, handlers: ContributionHandlerSet): ContributionRegistration
}
export interface ProviderRegistryHostOptions {
  readonly actionRegistry: ActionRegistry
  readonly resolveInstalledExtension: (id: string) => InstalledContributionOwner | undefined
}

/** Activation lifetime facade. The supplied ActionRegistry owns every live handler. */
export class ProviderRegistryHost {
  readonly api: ProviderRegistryV1Api
  private readonly actionRegistry: ActionRegistry
  private readonly resolveInstalledExtension: ProviderRegistryHostOptions["resolveInstalledExtension"]
  private readonly registrations = new Set<ContributionRegistration>()
  private disposed = false
  private registering = false

  constructor(options: ProviderRegistryHostOptions) {
    this.actionRegistry = options.actionRegistry
    this.resolveInstalledExtension = options.resolveInstalledExtension
    this.api = Object.freeze({
      apiVersion: PROVIDER_REGISTRY_API_VERSION,
      negotiateProviderRegistry,
      registerContributionSet: (manifest: WorkflowContributionManifest, provenance: ProviderProvenanceContext, handlers: ContributionHandlerSet) => {
        if (this.disposed) rejectContribution("provider.registry.host_disposed")
        if (this.registering) rejectContribution("contribution.registry.reentrant_mutation")
        this.registering = true
        try {
        const claimed = readInstalledContributionOwner(provenance)
        const validated = validateContributionManifest(manifest, claimed)
        negotiateProviderRegistry(validated.registry_api)
        let installed: InstalledContributionOwner
        try { installed = readInstalledContributionOwner(this.resolveInstalledExtension(validated.owner.id)) }
        catch { rejectContribution("contribution.provenance.invalid") }
        if (installed.id !== claimed.id || installed.version !== claimed.version || installed.extensionRoot !== claimed.extensionRoot) rejectContribution("contribution.provenance.invalid")
        const underlying = this.actionRegistry.registerContributionSet(validated, installed, handlers)
        const registration = Object.freeze({ dispose: () => {
          underlying.dispose()
          this.registrations.delete(registration)
        } })
        this.registrations.add(registration)
        return registration
        } finally { this.registering = false }
      }
    })
  }
  snapshot(): ContributionRegistrySnapshot { return this.actionRegistry.snapshotContributions() }
  trackedRegistrationCount(): number { return this.registrations.size }
  dispose(): void {
    if (this.registering) rejectContribution("contribution.registry.reentrant_mutation")
    this.disposed = true
    const failures: unknown[] = []
    for (const registration of Array.from(this.registrations).reverse()) {
      try { registration.dispose() } catch (error) { failures.push(error) }
    }
    if (failures.length) throw new AggregateError(failures, "Workflow contribution cleanup failed.")
  }
}
