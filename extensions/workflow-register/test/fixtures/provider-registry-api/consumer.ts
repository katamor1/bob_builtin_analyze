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
api.negotiateProviderRegistry({ min: literalVersion, max: literalVersion })

// @ts-expect-error registerContributionSet requires provenance as its second argument.
api.registerContributionSet(manifest, handlers)

// @ts-expect-error action provider handlers must satisfy the ActionProvider contract.
api.registerContributionSet(manifest, provenance, { actionProviders: new Map<string, number>(), preflightChecks: new Map(), resultSinks: new Map() })
