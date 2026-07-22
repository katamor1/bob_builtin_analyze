"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

test("service activation owns one atomic built-in registration and lets the host reverse all registrations first", () => {
  const service = readSrc("workflowRegisterService.ts")

  assert.match(service, /private readonly fileTransactions = new ResultSinkFileTransactionBinding\(\)/)
  assert.match(service, /private readonly actionRegistry = new ActionRegistry\(\{[\s\S]*contributionResolver: this\.providerRegistryHost\.runtimeResolver[\s\S]*\}\)/)
  assert.match(service, /this\.builtInContributionRegistration = registerWorkflowRegisterBuiltInContributions\(\{[\s\S]*api: this\.providerRegistryApi[\s\S]*installedOwner[\s\S]*fileTransactions: this\.fileTransactions/)
  assert.equal((service.match(/registerWorkflowRegisterBuiltInContributions\(/g) ?? []).length, 1)
  assert.doesNotMatch(service, /createDefaultActionRegistry/)

  const builtInIndex = service.indexOf('label: "workflow-register built-in contribution set"')
  const hostIndex = service.indexOf('label: "one or more provider contribution sets"')
  assert.ok(hostIndex >= 0 && builtInIndex > hostIndex)
})

test("runtime factory uses only live atomic contributions without a custom sink fallback", () => {
  const factory = readSrc("workflowRuntimeFactory.ts")
  const runner = readSrc("bobWorkflowRunner.ts")
  const engine = readSrc("core", "engine.ts")
  const engineTypes = readSrc("core", "engineTypes.ts")

  assert.match(factory, /fileTransactionResolver: ResultSinkFileTransactionResolver/)
  assert.match(factory, /new ResultSinkRegistry\(\{[\s\S]*contributionResolver: this\.options\.contributionResolver[\s\S]*fileTransactionResolver: this\.options\.fileTransactionResolver/)
  assert.doesNotMatch(factory, /createDefaultResultSinkRegistry/)
  assert.doesNotMatch(factory, /customResultSinks/)
  assert.match(factory, /includeDefaultPreflightChecks: false/)
  assert.match(factory, /preflightChecks: \(\) => \(\{\}\)/)
  assert.match(runner, /includeDefaultPreflightChecks\?: boolean/)
  assert.match(runner, /includeDefaultPreflightChecks: this\.options\.includeDefaultPreflightChecks/)
  assert.match(engineTypes, /includeDefaultPreflightChecks\?: boolean/)
  assert.match(engine, /options\.includeDefaultPreflightChecks === false[\s\S]*\{\}[\s\S]*createDefaultPreflightChecks\(workspaceRoot\)/)
})

test("service-bound Bazaar preflight keeps current workflow-root and multi-root discovery", () => {
  const service = readSrc("workflowRegisterService.ts")

  assert.match(service, /bazaarRepositoryAvailable: \(workflowRoot\) => this\.bazaarRepositoryAvailable\(workflowRoot\)/)
  assert.match(service, /private async bazaarRepositoryAvailable\(workflowRoot: string\): Promise<boolean>/)
  assert.match(service, /await rootHasMarker\(workflowRoot, "\.bzr"\)/)
  assert.match(service, /vscode\.workspace\.workspaceFolders \?\? \[\]/)
  assert.match(service, /await findMarkerRoots\(folders, "\.bzr"\)/)
})
