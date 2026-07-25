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

test('all engine execution paths verify Contract v2 before recovery, resume, retry, or checkpoint work', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  assert.match(runtime, /contractV2BeforeRun\?: \(workflow: CoreWorkflowDefinition\) => Promise<void> \| void/)
  assert.match(runtime, /class ContractV2BoundaryWorkflowEngine extends WorkflowEngine/)
  assert.match(runtime, ordered(
    'override async runWorkflow(',
    'await this.beforeRun?.(workflow)',
    'return super.runWorkflow(workflow, inputs, options)'
  ))
  assert.match(runtime, ordered(
    'override async resumeRun(',
    'await this.beforeRun?.(options.workflow)',
    'return super.resumeRun(runId, options)'
  ))
  assert.match(runtime, ordered(
    'override async resumeRunGuarded(',
    'await this.beforeRun?.(options.workflow)',
    'return super.resumeRunGuarded(runId, options, hooks)'
  ))
  assert.match(runtime, ordered(
    'override async retryCurrentStep(',
    'await this.beforeRun?.(workflow)',
    'return super.retryCurrentStep(runId, workflow, options)'
  ))
  assert.match(runtime, ordered(
    'override async approveBranchCheckpoint(',
    'await this.beforeRun?.(workflow)',
    'return super.approveBranchCheckpoint(runId, workflow)'
  ))
  assert.match(runtime, ordered(
    'createEngine(workspaceRoot: string, agentProvider?: AgentProvider)',
    'new ContractV2BoundaryWorkflowEngine(engineOptions, this.options.contractV2BeforeRun)'
  ))
})

test('direct run-state creation retains a second guard before FileRunStateStore creates a run', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  const guardedStore = source('workflowContractV2RunStateStore.ts')
  assert.match(runtime, /ContractV2GuardedRunStateStore/)
  assert.match(runtime, ordered(
    'createRunStore(workspaceRoot: string)',
    'new ContractV2GuardedRunStateStore({',
    'beforeCreateRun: this.options.contractV2BeforeRun'
  ))
  assert.match(guardedStore, ordered(
    'override async createRun(',
    'await this.beforeCreateRun?.(workflow, inputs)',
    'return super.createRun(workflow, inputs)'
  ))
})

test('the service acquires the exact current v2 plan, releases it, and fails before R5', () => {
  const service = source('workflowRegisterService.ts')
  assert.match(service, /acquireWorkflowContractV2RunLease/)
  assert.match(service, /contractV2BeforeRun: \(workflow\) => this\.assertContractV2RunCreationReady\(workflow\)/)
  assert.match(service, ordered(
    'private async assertContractV2RunCreationReady(',
    'acquireWorkflowContractV2RunLease({',
    'acquireCurrent: (input) => this.acquireCurrentWorkflowPackage(input)',
    'lease.release()',
    'Contract v2 runtime execution is not enabled before R5'
  ))
})

test('Operation Hub recompiles and compares the displayed current plan before dispatch', () => {
  const service = source('workflowRegisterService.ts')
  assert.match(service, /isOperationHubWorkflowMutationTarget/)
  assert.match(service, ordered(
    'async runWorkflow(',
    'verifyWorkflowContractV2CurrentPlan({',
    'compileCurrent: (input) => this.compileCurrentWorkflowPackage(input)',
    'return this.runCommands.runWorkflow(workflowArg, inputs)'
  ))
})

test('Bob evidence comes from the dedicated audited binding helper', () => {
  const registration = source('workflowRegistrationService.ts')
  assert.match(registration, /AUDITED_BOB_PROFILE_DIGEST/)
  assert.doesNotMatch(registration, /WORKFLOW_CONTRACT_V2_BOB_PROFILE_DIGEST/)
})
