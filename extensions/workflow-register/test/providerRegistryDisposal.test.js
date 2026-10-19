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
