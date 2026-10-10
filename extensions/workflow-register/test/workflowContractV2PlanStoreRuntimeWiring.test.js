const assert = require('node:assert/strict')
const Module = require('node:module')
const { test } = require('node:test')
const { ActionRegistry } = require('../out/core/actionRegistry')

function loadRuntimeFactory(storeType) {
  const factoryPath = require.resolve('../out/workflowRuntimeFactory')
  const originalLoad = Module._load
  const vscode = {
    commands: { executeCommand: async () => undefined },
    workspace: { isTrusted: true, workspaceFolders: [], getConfiguration: () => ({ get: (_key, fallback) => fallback }) }
  }
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscode
    if (storeType && request === './core/contractV2' && parent?.filename === factoryPath) return { WorkflowPlanStore: storeType }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    delete require.cache[factoryPath]
    return { WorkflowRuntimeFactory: require(factoryPath).WorkflowRuntimeFactory, restore() { delete require.cache[factoryPath] } }
  } finally { Module._load = originalLoad }
}

function createFactory(WorkflowRuntimeFactory) {
  return new WorkflowRuntimeFactory({
    engineVersion: 'test', actionRegistry: new ActionRegistry(), customResultSinks: [],
    stepRuntime: { hold: async () => ({ completed: false }) }, agentProvider: () => undefined,
    inputsProvider: () => (async () => ({})), gateRegistry: {}
  })
}

test('workflow runtime factory owns one process-wide plan store and exposes only delegated operations', async () => {
  const stores = []
  const calls = []
  const handle = Object.freeze({ sentinel: 'handle' })
  const lease = Object.freeze({ sentinel: 'lease' })
  class BoundaryPlanStore {
    constructor() { stores.push(this) }
    getOrCompile(input) { calls.push({ operation: 'get', receiver: this, input }); return Promise.resolve(handle) }
    acquire(input) { calls.push({ operation: 'acquire', receiver: this, input }); return Promise.resolve(lease) }
    invalidateSlot(collectionId, workflowId) { calls.push({ operation: 'invalidate', receiver: this, collectionId, workflowId }) }
  }
  const loaded = loadRuntimeFactory(BoundaryPlanStore)
  try {
    const first = createFactory(loaded.WorkflowRuntimeFactory)
    const second = createFactory(loaded.WorkflowRuntimeFactory)
    assert.equal(stores.length, 1)
    assert.equal(calls.length, 0)
    first.createEngine('/workspace', { run: () => 'done' })
    assert.equal(calls.length, 0, 'V1 engine construction must not request a V2 plan')
    const getInput = Object.freeze({ sentinel: 'request' })
    const acquireInput = Object.freeze({ sentinel: 'acquisition' })
    assert.equal(await first.getOrCompileWorkflowPlan(getInput), handle)
    assert.equal(await second.acquireWorkflowPlan(acquireInput), lease)
    second.invalidateWorkflowPlanSlot('repository', 'minimal')
    assert.deepEqual(calls.map(call => call.operation), ['get', 'acquire', 'invalidate'])
    assert.ok(calls.every(call => call.receiver === stores[0]))
    assert.equal(calls[0].input, getInput)
    assert.equal(calls[1].input, acquireInput)
    assert.equal(calls[2].collectionId, 'repository')
    assert.equal(calls[2].workflowId, 'minimal')
    assert.equal(typeof first.getWorkflowPlanStore, 'undefined')
  } finally { loaded.restore() }
})

test('public plan store facade does not expose private factories or state', () => {
  const facade = require('../out/core/contractV2')
  assert.deepEqual(Object.keys(facade).sort(), [
    'WorkflowPlanCompilationError', 'WorkflowPlanInvalidatedError', 'WorkflowPlanStore',
    'compileWorkflowPackage', 'createAuditedWorkflowCompilerEnvironment',
    'COMPILED_WORKFLOW_PLAN_MANIFEST_SCHEMA_VERSION', 'createCompiledWorkflowPlanManifest',
    'createCompiledWorkflowPlanManifestPackage', 'encodeCompiledWorkflowPlanManifest'
  ].sort())
})

test('separate runtime factories share actual compiled handles and slot invalidation', async () => {
  const loaded = loadRuntimeFactory()
  try {
    const first = createFactory(loaded.WorkflowRuntimeFactory)
    const second = createFactory(loaded.WorkflowRuntimeFactory)
    assert.equal(typeof first.getOrCompileWorkflowPlan, 'function')
    const { createLockedRawPackage, createBobProfile, createEmptyProviderCatalog } = require('./workflowContractV2CompilerTestSupport')
    const { createAuditedWorkflowCompilerEnvironment } = require('../out/core/contractV2/compilerEnvironment.js')
    const environment = createAuditedWorkflowCompilerEnvironment({ purpose: 'runtime', providerCatalog: createEmptyProviderCatalog(), bobProfile: createBobProfile() })
    const request = { collectionId: 'runtime-shared', workflowId: 'minimal', rawPackage: createLockedRawPackage().rawPackage, environment }
    const [a, b] = await Promise.all([first.getOrCompileWorkflowPlan(request), second.getOrCompileWorkflowPlan(request)])
    assert.equal(a, b)
    const lease = await second.acquireWorkflowPlan(request)
    try {
      assert.equal(lease.handle, a)
      first.invalidateWorkflowPlanSlot(request.collectionId, request.workflowId)
      const replacement = await second.getOrCompileWorkflowPlan(request)
      assert.notEqual(replacement, a)
      assert.equal(replacement.planDigest, a.planDigest)
      assert.equal(lease.handle, a)
    } finally { lease.release() }
    assert.equal(lease.released, true)
    assert.throws(() => lease.handle, TypeError)
  } finally { loaded.restore() }
})
