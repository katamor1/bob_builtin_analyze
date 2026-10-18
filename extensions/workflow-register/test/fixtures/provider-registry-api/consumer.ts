import type { WorkflowRegisterApi } from "../../../src/extension"
import type { ProviderRegistryV1Api } from "../../../src/api/providerRegistryApi"
import type { ContributionHandlerSet } from "../../../src/core/contributionRegistration"
import type { WorkflowContributionManifest, ProviderProvenanceContext } from "../../../src/core/contributionManifest"

export function consume(old: WorkflowRegisterApi, api: ProviderRegistryV1Api, manifest: WorkflowContributionManifest, context: ProviderProvenanceContext, handlers: ContributionHandlerSet): "provider-registry/v1" {
  const version: "provider-registry/v1" = api.negotiateProviderRegistry({ min: "provider-registry/v1", max: "provider-registry/v1" })
  api.registerContributionSet(manifest, context, handlers).dispose()
  old.registerActionProvider({ id: "fixture.action", execute: () => undefined }).dispose()
  old.registerAgentProvider({ run: () => "value" })
  old.registerResultSink("file", async () => ({ ok: true }))
  return version
}
