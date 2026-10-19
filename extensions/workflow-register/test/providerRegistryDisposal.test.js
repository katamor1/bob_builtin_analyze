const assert=require('node:assert/strict'),{test}=require('node:test')
const {exported,service}=require('./providerRegistryRuntimeTestSupport')

test('cleanup continues after synchronous and asynchronous failures',async()=>{
 const dispose=exported('core/disposeResources','disposeResourcesInOrder'),attempted=[];let release
 const pending=new Promise(resolve=>{release=resolve}),names=['sync','waiting','async','last']
 const completion=dispose([{name:'sync',dispose(){attempted.push('sync');throw Error('sync')}},{name:'waiting',dispose(){attempted.push('waiting');return pending}},{name:'async',dispose(){attempted.push('async');return Promise.reject(Error('async'))}},{name:'last',dispose(){attempted.push('last')}}])
 assert.deepEqual(attempted,names);release();const result=await completion;assert.equal(result.failures.length,2);assert.deepEqual(result.failures.map(x=>x.name),['sync','async'])
})

test('service disposal observes asynchronous source cleanup and releases providers after an earlier throw',async()=>{
 const {service:s,events}=service();assert.equal(typeof s.whenDisposed,'function','shutdown completion boundary is missing');assert.throws(()=>s.whenDisposed(),/not started/)
 const attempted=[];s.catalogReloads.dispose=()=>{attempted.push('catalog');throw Error('early')};s.contractV2Providers.dispose=()=>{attempted.push('v2')}
 let reject;s.registeredSource={deactivate:()=>{attempted.push('source');return new Promise((_resolve,r)=>{reject=r})}}
 s.dispose();const completion=s.whenDisposed();assert.equal(s.whenDisposed(),completion);assert.deepEqual(attempted,['catalog','v2','source']);assert.equal(events.length,2)
 assert.equal(s.actionRegistry.snapshotContributions().ownedSetCount,0);assert.deepEqual(s.actionRegistry.list(),[])
 reject(Error('source'));const result=await completion;assert.equal(result.failures.length,2);s.dispose();assert.equal(s.whenDisposed(),completion)
})

test('V2 compatibility lifecycle attempts every disposer and retries only failed removals',()=>{
 const {WorkflowContractV2ProviderLifecycle}=require('../out/workflowContractV2ProviderLifecycle'),attempted=[];let fail=true
 const lifecycle=new WorkflowContractV2ProviderLifecycle({actionRegistry:{registerWorkflowProviderContract:input=>({dispose(){attempted.push(input.contract.id);if(input.contract.id==='second'&&fail)throw Error('remove')}})},createEntrypoint:()=>Object.freeze({})})
 const first=lifecycle.register({sourceId:'fixture',contract:{id:'first'}});lifecycle.register({sourceId:'fixture',contract:{id:'second'}})
 assert.throws(()=>lifecycle.dispose(),AggregateError);assert.deepEqual(attempted,['second','first'])
 fail=false;lifecycle.dispose();assert.deepEqual(attempted,['second','first','second']);first.dispose();assert.deepEqual(attempted,['second','first','second'])
})

function deferred() {
 let resolve, reject
 const promise = new Promise((yes, no) => { resolve = yes; reject = no })
 return { promise, resolve, reject }
}
function delayedRegistration(registerWorkflows) {
 const Module = require('node:module'), original = Module._load
 Module._load = function(request, parent, isMain) {
  if (request === './workflowRegistrationService' && parent.filename.endsWith('workflowRegisterService.js')) return { registerWorkflows }
  return original.call(this, request, parent, isMain)
 }
 try { return service() } finally { Module._load = original }
}
const update = source => ({ result: { summary: 'late', lines: [] }, coreWorkflows: [{ id: 'late-workflow' }], registeredSource: source,
 registeredIds: new Set(['late-workflow']), legacyFingerprint: 'late', sourceChanged: true, idsChanged: true })

test('shutdown waits for late registration and cleanup without republishing a disposed catalog', async () => {
 const started = deferred(), registration = deferred(), cleanup = deferred()
 let calls = 0, deactivated = 0, completed = false
 const { service: s } = delayedRegistration(() => { calls++; started.resolve(); return registration.promise })
 const reload = s.reload({ showReport: false })
 await started.promise
 const queued = s.reload({ showReport: false })
 s.dispose(); const completion = s.whenDisposed().then(value => { completed = true; return value })
 await new Promise(setImmediate); assert.equal(completed, false, 'shutdown completed before the in-flight registration')
 registration.resolve(update({ deactivate() { deactivated++; return cleanup.promise } }))
 await new Promise(setImmediate)
 assert.equal(deactivated, 1); assert.equal(completed, false, 'shutdown completed before late source cleanup')
 assert.equal(s.registeredSource, undefined); assert.equal(s.registeredIds.size, 0); assert.equal(s.coreWorkflows.size, 0)
 cleanup.resolve(); await Promise.all([reload, queued]); const result = await completion
 assert.equal(calls, 1, 'queued reload must not start after shutdown'); assert.equal(result.failures.length, 0)
 assert.equal(s.lastResult.summary.includes('late'), false)
 await assert.rejects(s.reload({ showReport: false }), /disposed/)
})

test('shutdown aggregates a late source cleanup rejection', async () => {
 const started = deferred(), registration = deferred(), failure = Error('late source cleanup failed')
 const { service: s } = delayedRegistration(() => { started.resolve(); return registration.promise })
 const reload = s.reload({ showReport: false }); await started.promise; s.dispose()
 registration.resolve(update({ deactivate: async () => { throw failure } }))
 await reload; const result = await s.whenDisposed()
 assert.equal(result.failures.length, 1); assert.equal(result.failures[0].error, failure)
 assert.equal(s.registeredSource, undefined); assert.equal(s.registeredIds.size, 0)
})

test('shutdown before workspace trust resolves prevents registration entirely', async () => {
 const trust = deferred(), Module = require('node:module'), original = Module._load
 let calls = 0
 Module._load = function(request, parent, isMain) {
  if (request === './workspaceTrust' && parent.filename.endsWith('workflowRegisterService.js')) return { requireTrustedWorkspace: () => trust.promise }
  return original.call(this, request, parent, isMain)
 }
 let s
 try { s = delayedRegistration(() => { calls++; return Promise.resolve(update(undefined)) }).service } finally { Module._load = original }
 const reload = s.reload({ showReport: false }); await Promise.resolve(); s.dispose(); trust.resolve(undefined)
 await reload; await s.whenDisposed(); assert.equal(calls, 0)
})

for (const fails of [false, true]) test(`native deactivate waits for asynchronous service cleanup (reject=${fails})`, async t => {
 const Module = require('node:module'), original = Module._load, gate = deferred(), subscriptions = []
 let disposed = 0, settled = false
 class Service {
  providerRegistryApi() { return {} }
  reload() { return Promise.resolve() }
  dispose() { disposed++ }
  whenDisposed() { return gate.promise }
 }
 Module._load = function(request, parent, isMain) {
  if (parent.filename.endsWith('extension.js')) {
   if (request === 'vscode') return { commands: { registerCommand: () => ({ dispose() {} }) } }
   if (request === './workflowRegisterService') return { WorkflowRegisterService: Service }
   if (request === './gui/operationHubProvider') return { OperationHubProvider: class { dispose() {} } }
  }
  return original.call(this, request, parent, isMain)
 }
 let extension
 try { const file = require.resolve('../out/extension'); delete require.cache[file]; extension = require(file) } finally { Module._load = original }
 t.after(() => subscriptions.forEach(disposable => disposable.dispose()))
 extension.activate({ extension: { id: 'local.workflow-register', extensionPath: __dirname, packageJSON: { version: '0.1.0' } }, subscriptions })
 const completion = extension.deactivate()
 assert.equal(typeof completion?.then, 'function', 'native deactivate must return the cleanup Promise')
 assert.equal(extension.deactivate(), completion, 'native completion must be stable')
 completion.then(() => { settled = true }, () => { settled = true })
 await new Promise(setImmediate); assert.equal(settled, false); assert.equal(disposed, 1)
 const failure = Error('native source cleanup failed')
 gate.resolve({ failures: fails ? [{ name: 'registeredSource', error: failure }] : [] })
 if (fails) await assert.rejects(completion, error => error instanceof AggregateError && error.errors[0] === failure)
 else await completion
 assert.equal(settled, true)
})
