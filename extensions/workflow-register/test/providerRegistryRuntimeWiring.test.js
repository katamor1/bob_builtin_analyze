"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")
const { readSrc } = require("./helpers/sourceReader")

test("service passes one provider runtime resolver to action and runtime factories", () => {
  const service = readSrc("workflowRegisterService.ts")

  assert.match(service, /contributionResolver: this\.providerRegistryHost\.runtimeResolver/)
  assert.equal(
    (service.match(/contributionResolver: this\.providerRegistryHost\.runtimeResolver/g) ?? []).length,
    2
  )
})

test("runtime factory resolves preflight, result sink, and agent providers live", () => {
  const factory = readSrc("workflowRuntimeFactory.ts")

  assert.match(factory, /contributionResolver: ContributionRuntimeResolver/)
  assert.match(factory, /preflightCheckResolver: this\.options\.contributionResolver/)
  assert.match(factory, /contributionResolver: this\.options\.contributionResolver/)
  assert.match(factory, /createLiveAgentProvider\(\(\) =>/)
})

test("review-task agent remains ahead of registry, legacy, and configured providers", () => {
  const factory = readSrc("workflowRuntimeFactory.ts")

  assert.match(factory, /if \(explicitProvider\) return explicitProvider/)
  assert.match(factory, /this\.options\.contributionResolver\.getAgentProvider\(\)[\s\S]*this\.options\.agentProvider\(\)[\s\S]*configuredProvider/)
})

test("Bob runner receives the same live preflight and agent facades", () => {
  const factory = readSrc("workflowRuntimeFactory.ts")
  const runner = readSrc("bobWorkflowRunner.ts")

  assert.match(factory, /preflightCheckResolver: this\.options\.contributionResolver/)
  assert.match(factory, /agentProvider: this\.createRuntimeAgentProvider\(\)/)
  assert.match(runner, /preflightCheckResolver\?: WorkflowPreflightCheckResolver/)
  assert.match(runner, /preflightCheckResolver: this\.options\.preflightCheckResolver/)
})
