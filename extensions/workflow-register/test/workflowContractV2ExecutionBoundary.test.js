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

test('new standalone execution acquires one Contract v2 lease and never falls back to the legacy engine', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  assert.match(runtime, /contractV2AcquireRunLease\?: ContractV2AcquireRunLease/)
  assert.match(runtime, /contractV2RunExecutor\?: ContractV2RunExecutor/)
  assert.match(runtime, /executeWorkflowContractV2RuntimeBoundary/)
  assert.match(runtime, ordered(
    'override async runWorkflow(',
    'executeWorkflowContractV2RuntimeBoundary({',
    'acquireLease: () => this.acquireRunLease?.(workflow)',
    'legacyOperation: () => super.runWorkflow(workflow, inputs, options)',
    'compiledOperation: this.runExecutor',
    'lease'
  ))
})

test('resume retry approval and abort paths reject Contract v2 continuation without following current.json', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  for (const signature of [
    'override async resumeRun(',
    'override async resumeRunGuarded(',
    'override async retryCurrentStep(',
    'override async approveBranchCheckpoint('
  ]) {
    assert.match(runtime, ordered(signature, 'await this.beforeContinuation?.('))
  }
  assert.match(runtime, ordered(
    'override async abortBranchCheckpoint(',
    'const run = await this.continuationRunStore.loadRun(runId)',
    'run?.workflowSchemaVersion === "workflow-register/v2"',
    'run?.planProvenance !== undefined',
    'Contract v2 resume and continuation require R6',
    'return super.abortBranchCheckpoint(runId, reason)'
  ))
  assert.doesNotMatch(runtime, /acquireRunLease\?\.\(options\.workflow\)/)
})

test('Bob legacy input collection does not acquire a Contract v2 lease before the compiled Bob boundary', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  const factory = source('bobWorkflowFactory.ts')
  assert.match(runtime, ordered(
    'createBobWorkflowRunner(workflow: WorkflowDefinition)',
    'inputsProvider: async (task, provided) =>',
    'this.options.inputsProvider(workflow,'
  ))
  assert.doesNotMatch(runtime, /inputsProvider:[\s\S]*await beforeRun\?\./)
  assert.match(factory, /runCompiledWorkflowStep === undefined/)
  assert.match(factory, /compiled runtime execution is not enabled before R5/)
})

test('direct run-state creation uses only the exact active lease context and never reacquires current evidence', () => {
  const runtime = source('workflowRuntimeFactory.ts')
  const guardedStore = source('workflowContractV2RunStateStore.ts')
  assert.match(runtime, /ContractV2GuardedRunStateStore/)
  assert.match(runtime, ordered(
    'createRunStore(workspaceRoot: string)',
    'new ContractV2GuardedRunStateStore({',
    'workspaceRoot',
    'engineVersion: this.options.engineVersion'
  ))
  assert.doesNotMatch(runtime, /beforeCreateRun: beforeRun/)
  assert.match(guardedStore, ordered(
    'override async createRun(',
    'currentWorkflowContractV2PlanLease()',
    'this.createRunFromPlanLease(contextualLease, inputs)'
  ))
  assert.match(guardedStore, ordered(
    'async createRunFromPlanLease(',
    'currentWorkflowContractV2PlanLease()',
    'contextualLease !== lease',
    'active compiled plan lease context'
  ))
  assert.match(guardedStore, /Contract v2 run creation requires an active compiled plan lease/)
})

test('the service supplies new-run acquisition and fail-closed continuation boundaries separately', () => {
  const service = source('workflowRegisterService.ts')
  assert.match(service, /acquireWorkflowContractV2RunLease/)
  assert.match(service, /workflowContractV2CoreMetadata/)
  assert.match(service, /contractV2AcquireRunLease: \(workflow\) => this\.acquireContractV2RunLease\(workflow\)/)
  assert.match(service, /contractV2BeforeContinuation: \(workflow\) => this\.assertContractV2ContinuationReady\(workflow\)/)
  assert.match(service, ordered(
    'private acquireContractV2RunLease(',
    'return acquireWorkflowContractV2RunLease({',
    'acquireCurrent: (input) => this.acquireCurrentWorkflowPackage(input)'
  ))
  assert.match(service, /Contract v2 runtime execution is not enabled before R4/)
  assert.match(service, /Contract v2 resume and continuation require R6/)
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
