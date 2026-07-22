import type { WorkflowRegisterApi } from "../../../src/extension"
import type {
  ContributionHandlerSet,
  ContributionRegistration
} from "../../../src/core/contributionRegistry"
import type { WorkflowContributionManifest } from "../../../src/core/contributionManifest"

declare const api: WorkflowRegisterApi
declare const manifest: WorkflowContributionManifest
declare const provenance: {
  expectedOwner: { id: string; version: string }
  ownerDirectory: string
}
declare const handlers: ContributionHandlerSet

const literalVersion: "provider-registry/v1" = api.apiVersion
const registration: ContributionRegistration = api.registerContributionSet(manifest, provenance, handlers)
registration.dispose()
const legacyRegistration: ContributionRegistration = api.registerLegacyContributionSet(manifest, provenance, handlers)
legacyRegistration.dispose()
api.negotiateProviderRegistry({ min: literalVersion, max: literalVersion })

// @ts-expect-error registerContributionSet requires provenance as its second argument.
api.registerContributionSet(manifest, handlers)

// @ts-expect-error action provider handlers must satisfy the ActionProvider contract.
api.registerContributionSet(manifest, provenance, { actionProviders: new Map<string, number>(), preflightChecks: new Map(), resultSinks: new Map() })

// @ts-expect-error the deprecated adapter still requires explicit provenance.
api.registerLegacyContributionSet(manifest, handlers)

// @ts-expect-error the ownerless per-action adapter is no longer public.
api.registerActionProvider({ id: "legacy.action", execute: () => undefined })

// @ts-expect-error the versionless per-agent adapter is no longer public.
api.registerAgentProvider({ run: () => "legacy" })

// @ts-expect-error the versionless per-sink adapter is no longer public.
api.registerResultSink("legacy.sink", async () => ({ ok: true }))
