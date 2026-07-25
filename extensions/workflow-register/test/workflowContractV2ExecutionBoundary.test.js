const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

const root = path.join(__dirname, '..', 'src')

function source(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8')
}

function ordered(...parts) {
  return new RegExp(parts.map(escapeRegex).join('[\\s\\S]*'))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

test('standalone engines verify the Contract v2 lease before any run-store operation', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  assert.match(runtime, /contractV2BeforeRun\?: \(workflow: CoreWorkflowDefinition\) => Promise<void>/)
  assert.match(runtime, /class ContractV2BoundaryWorkflowEngine extends WorkflowEngine/)
  assert.match(runtime, ordered(
    'override async runWorkflow(',
    'await this.beforeRun(workflow)',
    'return super.runWorkflow(workflow, inputs, options)'
  ))
  assert.match(runtime, ordered(
    'const engineOptions: WorkflowEngineOptions = {',
    'const beforeRun = this.options.contractV2BeforeRun',
    'new ContractV2BoundaryWorkflowEngine(engineOptions, beforeRun)'
  ))
})

test('the service acquires the current v2 plan, verifies identity, releases it, and fails before R5', () => {
  const service = source('workflowRegisterService.ts')
  assert.match(service, /workflowContractV2CoreMetadata/)
  assert.match(service, /contractV2BeforeRun: \(workflow\) => this\.assertContractV2RuntimeBoundary\(workflow\)/)
  assert.match(service, ordered(
    'private async assertContractV2RuntimeBoundary(',
    'this.contractV2.acquireCurrent({',
    'consumer: "run-creation"',
    'lease.planDigest !== metadata.planDigest',
    'lease.packageDigest !== metadata.packageDigest',
    'lease.release()',
    'Contract v2 runtime execution is unavailable before R5'
  ))
})

test('Operation Hub requests recompile the displayed current plan before command dispatch', () => {
  const service = source('workflowRegisterService.ts')
  assert.match(service, /isOperationHubWorkflowMutationTarget/)
  assert.match(service, ordered(
    'async runWorkflow(',
    'await this.assertOperationHubContractV2Current(workflowArg)',
    'return this.runCommands.runWorkflow(workflowArg, inputs)'
  ))
  assert.match(service, ordered(
    'private async assertOperationHubContractV2Current(',
    'consumer: "operation-hub"',
    'result.handle.planDigest !== metadata.planDigest',
    'result.handle.plan.packageDigest !== metadata.packageDigest'
  ))
})

test('Bob evidence comes from the dedicated audited binding helper', () => {
  const registration = source('workflowRegistrationService.ts')
  assert.match(registration, /AUDITED_BOB_PROFILE_DIGEST/)
  assert.doesNotMatch(registration, /WORKFLOW_CONTRACT_V2_BOB_PROFILE_DIGEST/)
})
