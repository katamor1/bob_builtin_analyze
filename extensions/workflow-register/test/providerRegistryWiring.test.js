"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { test } = require("node:test")
const { extensionRoot, readSrc } = require("./helpers/sourceReader")

test("provider registry API has an explicit export boundary without star exports", () => {
  const apiPath = path.join(extensionRoot, "src", "api", "providerRegistryApi.ts")
  assert.ok(fs.existsSync(apiPath), "src/api/providerRegistryApi.ts must exist")
  const source = fs.readFileSync(apiPath, "utf8")

  assert.match(source, /export const PROVIDER_REGISTRY_API_VERSION = "provider-registry\/v1" as const/)
  assert.match(source, /export interface ProviderRegistryV1Api/)
  assert.match(source, /export type ProviderProvenanceContext = ContributionManifestValidationContext/)
  assert.doesNotMatch(source, /export\s+\*/)
})

test("core activation publishes one frozen complete API and the authoring wrapper preserves it", () => {
  const extension = readSrc("extension.ts")
  const wrapper = readSrc("extensionWithAuthoring.ts")

  assert.match(extension, /export interface WorkflowRegisterApi extends ProviderRegistryV1Api/)
  assert.match(extension, /const providerRegistryApi = service\.providerRegistryApi/)
  assert.match(extension, /const api: WorkflowRegisterApi = Object\.freeze\(\{/)
  assert.match(extension, /apiVersion: providerRegistryApi\.apiVersion/)
  assert.match(extension, /negotiateProviderRegistry: providerRegistryApi\.negotiateProviderRegistry/)
  assert.match(extension, /registerContributionSet: providerRegistryApi\.registerContributionSet/)
  assert.match(wrapper, /const api = activateCore\(context\)/)
  assert.match(wrapper, /return api/)
  assert.doesNotMatch(wrapper, /return\s+\{[\s\S]*\.\.\.api/)
})

test("WorkflowRegisterService owns and disposes exactly one provider registry host", () => {
  const service = readSrc("workflowRegisterService.ts")

  assert.match(service, /import \{ disposeResourcesInOrder \} from "\.\/core\/disposeResources"/)
  assert.match(service, /private readonly providerRegistryHost = new ProviderRegistryHost\(\)/)
  assert.match(service, /readonly providerRegistryApi = this\.providerRegistryHost\.api/)
  assert.match(service, /disposeResourcesInOrder\(\[[\s\S]*this\.watcher\.dispose\(\)[\s\S]*this\.providerRegistryHost\.dispose\(\)/)
  assert.match(service, /deactivateRegisteredSource\(source\)[\s\S]*if \(disposal\.hasPropagatedError\) throw disposal\.firstPropagatedError/)
  assert.equal((service.match(/new ProviderRegistryHost\(/g) ?? []).length, 1)
})

test("existing legacy provider methods are not routed through the v1 registry in Task 3", () => {
  const service = readSrc("workflowRegisterService.ts")

  assert.match(service, /registerActionProvider\(provider: ActionProvider\): ActionProviderRegistration \{[\s\S]*this\.actionProviderRegistrations\.track\(this\.actionRegistry\.register\(provider\)\)/)
  assert.match(service, /registerAgentProvider\(provider: AgentProvider\): void \{[\s\S]*this\.agentProvider = provider/)
  assert.match(service, /registerResultSink\(type: string,[\s\S]*this\.customResultSinks\.push\(\{ type, handler \}\)/)
})
