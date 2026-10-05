const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

function digest(character) {
  return `sha256:${character.repeat(64)}`
}

function rawPackage(overrides = {}) {
  return Object.freeze({
    publication: 'published',
    workflowId: 'minimal',
    generation: digest('a'),
    packageDigest: digest('a'),
    files: Object.freeze([]),
    ...overrides
  })
}

function diagnostic() {
  return Object.freeze({
    code: 'WF2_LOCK_MISMATCH',
    severity: 'error',
    message: 'Workflow package lock does not match compiled evidence.',
    location: Object.freeze({ path: 'workflow.lock.json', pointer: '/environmentDigest' }),
    relatedLocations: Object.freeze([])
  })
}

function slot(overrides = {}) {
  return Object.freeze({
    collectionId: 'collection-test',
    collectionRoot: '/workspace/.bob/workflows',
    workflowId: 'minimal',
    ...overrides
  })
}

function subject() {
  return require('../out/workflowContractV2Entrypoint.js')
}

test('all product consumers share one current-generation handle and one failure diagnostic contract', async () => {
  const handle = Object.freeze({
    planDigest: digest('p'),
    plan: Object.freeze({
      workflowId: 'minimal',
      packageDigest: digest('a'),
      environmentDigest: digest('e')
    })
  })
  const environment = Object.freeze({})
  const loaded = rawPackage()
  const calls = []
  const entrypoint = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async (input) => {
      calls.push(['loadCurrent', input])
      return loaded
    },
    loadGeneration: async () => { throw new Error('explicit generation loader must not run') },
    getOrCompile: async (input) => {
      calls.push(['getOrCompile', input])
      return handle
    },
    acquire: async () => { throw new Error('lease path must not run') },
    invalidate: () => { throw new Error('invalidation must not run') }
  })

  const consumerNames = [
    'validation',
    'workspace-registration',
    'run-creation',
    'bob-adapter',
    'operation-hub',
    'command-validation'
  ]
  const results = []
  for (const consumer of consumerNames) {
    const result = await entrypoint.compileCurrent({ slot: slot(), consumer })
    assert.equal(result.ok, true)
    results.push(result.handle)
  }
  assert.equal(results.every((value) => value === handle), true)
  assert.equal(calls.filter(([name]) => name === 'loadCurrent').length, consumerNames.length)
  assert.equal(calls.filter(([name]) => name === 'getOrCompile').length, consumerNames.length)
  for (const [, input] of calls.filter(([name]) => name === 'getOrCompile')) {
    assert.equal(input.environment, environment)
    assert.equal(input.rawPackage, loaded)
    assert.equal(input.collectionId, 'collection-test')
    assert.equal(input.workflowId, 'minimal')
  }

  const failureDiagnostics = Object.freeze([diagnostic()])
  const { WorkflowPlanCompilationError } = require('../out/core/contractV2/planStore.js')
  const failing = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async () => loaded,
    loadGeneration: async () => loaded,
    getOrCompile: async () => { throw new WorkflowPlanCompilationError(failureDiagnostics) },
    acquire: async () => { throw new Error('lease path must not run') },
    invalidate: () => undefined
  })
  for (const consumer of consumerNames) {
    const result = await failing.compileCurrent({ slot: slot(), consumer })
    assert.equal(result.ok, false)
    assert.deepEqual(result.diagnostics, failureDiagnostics)
    assert.equal(Object.isFrozen(result.diagnostics), true)
  }
})

test('run creation acquires the same handle and explicit generation never consults current', async () => {
  const handle = Object.freeze({ planDigest: digest('p'), plan: Object.freeze({ workflowId: 'minimal' }) })
  const lease = Object.freeze({ handle, released: false, release() {} })
  const environment = Object.freeze({})
  let currentCalls = 0
  let generationCalls = 0
  let acquireCalls = 0
  const loaded = rawPackage()
  const entrypoint = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async () => { currentCalls += 1; return loaded },
    loadGeneration: async (input) => { generationCalls += 1; assert.equal(input.generation, digest('a')); return loaded },
    getOrCompile: async () => handle,
    acquire: async (input) => { acquireCalls += 1; assert.equal(input.environment, environment); return lease },
    invalidate: () => undefined
  })

  const acquired = await entrypoint.acquireCurrent({ slot: slot(), consumer: 'run-creation' })
  assert.equal(acquired.ok, true)
  assert.equal(acquired.lease, lease)
  assert.equal(acquired.lease.handle, handle)

  const explicit = await entrypoint.compileGeneration({
    slot: slot(),
    generation: digest('a'),
    expectedPackageDigest: digest('a'),
    consumer: 'resume'
  })
  assert.equal(explicit.ok, true)
  assert.equal(explicit.handle, handle)
  assert.equal(currentCalls, 1)
  assert.equal(generationCalls, 1)
  assert.equal(acquireCalls, 1)
})

test('entrypoint input rejects proxy and accessor records without invoking behavior', async () => {
  const environment = Object.freeze({})
  let traps = 0
  const proxy = new Proxy({ slot: slot(), consumer: 'validation' }, {
    get() { traps += 1; throw new Error('must not read proxy') },
    ownKeys() { traps += 1; throw new Error('must not inspect proxy') }
  })
  const entrypoint = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async () => rawPackage(),
    loadGeneration: async () => rawPackage(),
    getOrCompile: async () => Object.freeze({}),
    acquire: async () => Object.freeze({}),
    invalidate: () => undefined
  })
  await assert.rejects(entrypoint.compileCurrent(proxy), TypeError)
  assert.equal(traps, 0)

  let getterCalls = 0
  const accessor = { consumer: 'validation' }
  Object.defineProperty(accessor, 'slot', {
    enumerable: true,
    get() { getterCalls += 1; return slot() }
  })
  await assert.rejects(entrypoint.compileCurrent(accessor), TypeError)
  assert.equal(getterCalls, 0)
})

test('entrypoint validation uses captured RegExp intrinsics after module load', async () => {
  const modulePath = require.resolve('../out/workflowContractV2Entrypoint.js')
  delete require.cache[modulePath]
  const loadedModule = require(modulePath)
  const originalTest = RegExp.prototype.test
  RegExp.prototype.test = function replacedTest() {
    throw new Error('ambient RegExp.prototype.test must not run')
  }
  try {
    const environment = Object.freeze({})
    const compiled = Object.freeze({ planDigest: digest('p'), plan: Object.freeze({ workflowId: 'minimal' }) })
    const entrypoint = loadedModule.createWorkflowContractV2Entrypoint({
      environment,
      loadCurrent: async () => rawPackage(),
      loadGeneration: async () => rawPackage(),
      getOrCompile: async () => compiled,
      acquire: async () => Object.freeze({}),
      invalidate: () => undefined
    })
    const result = await entrypoint.compileGeneration({
      slot: slot(),
      consumer: 'resume',
      generation: digest('a'),
      expectedPackageDigest: digest('a')
    })
    assert.equal(result.ok, true)
    assert.equal(result.handle, compiled)
  } finally {
    RegExp.prototype.test = originalTest
    delete require.cache[modulePath]
  }
})


const {fixture,requireWithVscode}=require('./workflowContractV2EntrypointTestSupport')
test('real P2/P4/P5 path shares exact handle across all consumers and never leases',async()=>{
 const f=fixture();const first=await f.entrypoint.compileCurrent({slot:f.slot,consumer:'validation'});assert.equal(first.ok,true);
 for(const consumer of ['workspace-registration','run-creation','bob-adapter','operation-hub','command-validation','resume']){
 const r=await f.entrypoint.compileCurrent({slot:f.slot,consumer});assert.equal(r.ok,true);assert.strictEqual(r.handle,first.handle);}
 assert.equal(f.counters.compile,1);assert.equal(f.counters.acquire,0);assert.equal(f.counters.dispatch,0);
 f.adapter.mutate(['minimal','current.json'],Buffer.from('{}'));
 for(const consumer of ['validation','workspace-registration','bob-adapter','operation-hub']){const r=await f.entrypoint.compileCurrent({slot:f.slot,consumer});assert.equal(r.ok,false);assert.equal(r.diagnostics[0].code,'WF2_PACKAGE_LAYOUT_INVALID');}
 assert.equal(f.counters.compile,1);
 const pinned=await f.entrypoint.compileGeneration({slot:f.slot,consumer:'resume',generation:f.published.digest,expectedPackageDigest:f.published.digest});assert.equal(pinned.ok,true);assert.strictEqual(pinned.handle,first.handle);
})
test('nonruntime acquisition returns failure without lease and product acquire never reaches store',async()=>{
 for(const purpose of ['authoring-validation','evidence']){const f=fixture(purpose);const r=await f.entrypoint.acquireCurrent({slot:f.slot,consumer:'run-creation'});assert.equal(r.ok,false);assert.equal(f.counters.compile,0);}
 const {ActionRegistry}=requireWithVscode('../out/core/actionRegistry.js',{});let acquired=0;
 const {createWorkflowContractV2ProductEntrypoint}=require('../out/workflowContractV2Product');
 const workspace=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'p6-product-'));
 const collection=path.join(workspace,'.bob/workflows');require('./workflowContractV2EntrypointTestSupport').publishNodeFixture(collection);
 const p=createWorkflowContractV2ProductEntrypoint({actionRegistry:new ActionRegistry(),planStore:{getOrCompile:async()=>{throw Error('unused');},acquire:async()=>{acquired++;throw Error('must not acquire');},invalidate(){}}});
 try{const r=await p.acquireCurrent({slot:slot({collectionRoot:collection}),consumer:'run-creation'});assert.equal(r.ok,false);assert.equal(acquired,0);}finally{fs.rmSync(workspace,{recursive:true,force:true});}
})
test('slot snapshot is detached before an asynchronous package load',async()=>{
 let resolve;const loaded=new Promise(r=>resolve=r);const original=slot();const mutable={...original};let received;
 const e=subject().createWorkflowContractV2Entrypoint({environment:{},loadCurrent:async input=>{received=input;return loaded;},loadGeneration:async()=>rawPackage(),getOrCompile:async input=>{assert.equal(input.workflowId,'minimal');return {};},acquire:async()=>{},invalidate(){}});
 const promise=e.compileCurrent({slot:mutable,consumer:'validation'});mutable.workflowId='other';resolve(rawPackage());assert.equal((await promise).ok,true);assert.notStrictEqual(received,mutable);assert.equal(received.workflowId,'minimal');
})
