const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

function digest(character) {
  return `sha256:${character.repeat(64)}`
}

function metadata(overrides = {}) {
  return Object.freeze({
    schemaVersion: 'workflow-contract-v2-view/v1',
    collectionId: '.bob/workflows',
    collectionRoot: '/workspace/.bob/workflows',
    workflowId: 'minimal',
    packageDigest: digest('a'),
    planDigest: digest('p'),
    ...overrides
  })
}

function workflow(overrides = {}) {
  return Object.freeze({
    id: 'minimal',
    contractV2: metadata(),
    ...overrides
  })
}

function handle(overrides = {}) {
  return Object.freeze({
    planDigest: digest('p'),
    plan: Object.freeze({
      workflowId: 'minimal',
      packageDigest: digest('a')
    }),
    ...overrides
  })
}

function lease(compiled = handle()) {
  let releases = 0
  return {
    value: Object.freeze({
      get handle() { return compiled },
      get released() { return releases > 0 },
      release() { releases += 1 }
    }),
    releases: () => releases
  }
}

function subject() {
  return require('../out/workflowContractV2ExecutionGuard.js')
}

test('run creation skips legacy workflows and returns the exact verified Contract v2 lease', async () => {
  let calls = 0
  const legacy = await subject().acquireWorkflowContractV2RunLease({
    workflow: Object.freeze({ id: 'legacy' }),
    acquireCurrent: async () => { calls += 1; throw new Error('must not acquire legacy') }
  })
  assert.equal(legacy, undefined)
  assert.equal(calls, 0)

  const currentLease = lease()
  const acquired = await subject().acquireWorkflowContractV2RunLease({
    workflow: workflow(),
    acquireCurrent: async (input) => {
      calls += 1
      assert.equal(input.consumer, 'run-creation')
      assert.deepEqual(input.slot, {
        collectionId: '.bob/workflows',
        collectionRoot: '/workspace/.bob/workflows',
        workflowId: 'minimal'
      })
      return Object.freeze({
        ok: true,
        lease: currentLease.value,
        rawPackage: Object.freeze({ packageDigest: digest('a') }),
        diagnostics: Object.freeze([])
      })
    }
  })
  assert.equal(acquired, currentLease.value)
  assert.equal(currentLease.releases(), 0)
  assert.equal(calls, 1)
})

test('run creation fails closed and releases a lease whose private/current evidence drifted', async () => {
  const changed = lease(handle({ planDigest: digest('q') }))
  await assert.rejects(
    subject().acquireWorkflowContractV2RunLease({
      workflow: workflow(),
      acquireCurrent: async () => Object.freeze({
        ok: true,
        lease: changed.value,
        rawPackage: Object.freeze({ packageDigest: digest('a') }),
        diagnostics: Object.freeze([])
      })
    }),
    /changed|stale|digest/i
  )
  assert.equal(changed.releases(), 1)

  const diagnostics = Object.freeze([Object.freeze({
    code: 'WF2_LOCK_MISMATCH',
    severity: 'error',
    message: 'lock mismatch',
    location: Object.freeze({ path: 'workflow.lock.json', pointer: '' }),
    relatedLocations: Object.freeze([])
  })])
  await assert.rejects(
    subject().acquireWorkflowContractV2RunLease({
      workflow: workflow(),
      acquireCurrent: async () => Object.freeze({ ok: false, diagnostics })
    }),
    (error) => error && error.name === 'WorkflowContractV2BoundaryError' && error.diagnostics === diagnostics
  )
})

test('Operation Hub verifies the exact current plan before dispatching a workflow action', async () => {
  const compiled = handle()
  const verified = await subject().verifyWorkflowContractV2CurrentPlan({
    workflow: workflow(),
    compileCurrent: async (input) => {
      assert.equal(input.consumer, 'operation-hub')
      return Object.freeze({
        ok: true,
        handle: compiled,
        rawPackage: Object.freeze({ packageDigest: digest('a') }),
        diagnostics: Object.freeze([])
      })
    }
  })
  assert.equal(verified, compiled)

  await assert.rejects(
    subject().verifyWorkflowContractV2CurrentPlan({
      workflow: workflow(),
      compileCurrent: async () => Object.freeze({
        ok: true,
        handle: handle({ planDigest: digest('q') }),
        rawPackage: Object.freeze({ packageDigest: digest('a') }),
        diagnostics: Object.freeze([])
      })
    }),
    /changed|stale|digest/i
  )
})

test('run-state creation and Operation Hub guard Contract v2 before durable or command dispatch', () => {
  const root = path.join(__dirname, '..', 'src')
  const runtimeFactorySource = fs.readFileSync(path.join(root, 'workflowRuntimeFactory.ts'), 'utf8')
  const guardedStoreSource = fs.readFileSync(path.join(root, 'workflowContractV2RunStateStore.ts'), 'utf8')
  const hubSource = fs.readFileSync(path.join(root, 'gui', 'operationHubProvider.ts'), 'utf8')
  const serviceSource = fs.readFileSync(path.join(root, 'workflowRegisterService.ts'), 'utf8')

  assert.match(runtimeFactorySource, /ContractV2GuardedRunStateStore/)
  assert.match(runtimeFactorySource, /beforeCreateRun/)
  assert.match(guardedStoreSource, /await this\.beforeCreateRun\?\.\(workflow, inputs\)/)
  assert.match(guardedStoreSource, /return super\.createRun\(workflow, inputs\)/)
  assert.match(hubSource, /verifyWorkflowContractV2CurrentPlan/)
  assert.match(hubSource, /compileCurrentWorkflowPackage/)
  assert.match(serviceSource, /acquireCurrentWorkflowPackage:\s*\(input\)\s*=>\s*this\.acquireCurrentWorkflowPackage\(input\)/)
  assert.match(serviceSource, /Contract v2 runtime execution is not enabled before R5/)
})
