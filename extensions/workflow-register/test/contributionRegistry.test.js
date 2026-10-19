const assert=require('node:assert/strict'),{test}=require('node:test')
const {harness,register,manifest,handlers,installed,errorCode}=require('./contributionRegistryTestSupport')
test('one atomic set publishes all declarations and manual disposal releases tracking',()=>{
 const x=harness(),calls=[],r=register(x,manifest(),handlers(calls)),s=x.host.snapshot()
 assert.equal(s.ownedSetCount,1);assert.equal(s.actionProviders.length,1);assert.equal(s.preflightChecks.length,1);assert.equal(s.resultSinks.length,1);assert.equal(s.agentProviders.length,1);assert.equal(s.workflowTemplates.length,1);assert.equal(s.schemas.length,1)
 assert.deepEqual(calls,[]);assert.equal(Object.isFrozen(s.actionProviders),true);assert.equal(JSON.stringify(s).includes('extensionRoot'),false)
 assert.equal(x.host.trackedRegistrationCount(),1);r.dispose();r.dispose();assert.equal(x.host.snapshot().ownedSetCount,0);assert.equal(x.host.trackedRegistrationCount(),0)
})
test('late collision publishes no partial generation',()=>{
 const x=harness();register(x);const before=x.host.snapshot(),fn=x.runtime.getActionProvider('fixture.action')
 x.current.value=installed({id:'local.other'});const m=manifest();m.owner.id='local.other';m.action_providers[0].id='other.action';m.action_providers[0].contract_version='other.action/v1'
 assert.throws(()=>register(x,m,handlers()),errorCode('contribution.handlers.invalid'))
 const h=handlers();h.actionProviders=new Map([['other.action',{id:'other.action',execute(){}}]])
 assert.throws(()=>register(x,m,h),errorCode('contribution.registry.duplicate_identifier'))
 assert.deepEqual(x.host.snapshot(),before);assert.equal(x.runtime.getActionProvider('fixture.action'),fn);assert.equal(x.runtime.getActionProvider('other.action'),undefined)
})
test('owner cannot register twice even after its installed version changes',()=>{
 const x=harness();register(x);const before=x.host.snapshot();assert.throws(()=>register(x),errorCode('contribution.registry.duplicate_owner'))
 x.current.value=installed({version:'2.0.0'});const m=manifest();m.owner.version='2.0.0'
 assert.throws(()=>register(x,m),errorCode('contribution.registry.duplicate_owner'));assert.deepEqual(x.host.snapshot(),before)
})
test('atomic and legacy actions cannot replace one another',async()=>{
 const x=harness(),old=x.registry.register({id:'fixture.action',sourceId:'legacy.owner',execute:()=> 'legacy'})
 assert.throws(()=>register(x),errorCode('contribution.registry.duplicate_identifier'));assert.equal(x.host.snapshot().ownedSetCount,0)
 assert.equal((await x.registry.execute('fixture.action',{inputs:{},args:{}})).value,'legacy');old.dispose()
 const r=register(x);assert.throws(()=>x.registry.register({id:'fixture.action',execute:()=> 'replacement'}));r.dispose()
})
test('stale public and unpublished disposables cannot remove a replacement generation',()=>{
 let pending,fail=true
 const x=harness({beforeContributionCommit:p=>{if(!pending)pending=p.registration;if(fail)throw Error('SECRET')}})
 assert.throws(()=>register(x),errorCode('contribution.registry.commit_failed'));assert.equal(x.host.snapshot().ownedSetCount,0)
 fail=false;const first=register(x);pending.dispose();assert.equal(x.host.snapshot().ownedSetCount,1)
 first.dispose();const second=register(x);first.dispose();pending.dispose();assert.equal(x.host.snapshot().ownedSetCount,1);second.dispose()
})
test('reentrant mutation and pending disposal fail without poisoning the accepted registration',()=>{
 let x,seen=0
 x=harness({beforeContributionCommit:p=>{
  assert.throws(()=>p.registration.dispose(),errorCode('contribution.registry.reentrant_mutation'))
  assert.throws(()=>x.registry.register({id:'extra.action',execute(){}}),errorCode('contribution.registry.reentrant_mutation'))
  assert.throws(()=>register(x),errorCode('contribution.registry.reentrant_mutation'));seen++
 }})
 const r=register(x);assert.equal(seen,1);assert.equal(x.host.snapshot().ownedSetCount,1);r.dispose();assert.equal(x.host.snapshot().ownedSetCount,0)
})
test('bounded register-dispose churn leaves no owned or tracked registrations',()=>{
 const x=harness();for(let i=0;i<1000;i++)register(x).dispose()
 assert.equal(x.host.snapshot().ownedSetCount,0);assert.equal(x.host.trackedRegistrationCount(),0);assert.equal(x.runtime.getActionProvider('fixture.action'),undefined)
})

test('legacy compatibility slots are owned live and preserve explicit agent and final sink priority',()=>{
 const x=harness(),legacy={run:()=> 'legacy'},last=async()=>({ok:true}),first=async()=>({ok:false})
 x.registry.setLegacyAgent(legacy);assert.equal(x.registry.getLegacyAgent(),legacy)
 assert.throws(()=>register(x),errorCode('contribution.registry.agent_conflict'));assert.equal(x.host.snapshot().ownedSetCount,0)
 x.registry.disposeLegacyCompatibility();const h=handlers(),r=register(x,manifest(),h)
 assert.equal(x.runtime.getAgentProvider().run,h.agentProvider.run)
 x.registry.setLegacyAgent(legacy);assert.equal(x.registry.getLegacyAgent(),legacy)
 x.registry.registerLegacyResultSink('file',first);x.registry.registerLegacyResultSink('file',last);assert.equal(x.registry.getLegacyResultSink('file'),last)
 x.registry.disposeLegacyCompatibility();assert.equal(x.registry.getLegacyAgent(),undefined);assert.equal(x.registry.getLegacyResultSink('file'),undefined)
 assert.equal(x.host.snapshot().ownedSetCount,1);r.dispose()
})

test('removal rejects all reentrant compatibility mutations and remains retryable after failure',()=>{
 let x,fail=true,r
 x=harness({beforeContributionRemove:()=>{
  assert.throws(()=>r.dispose(),errorCode('contribution.registry.reentrant_mutation'))
  assert.throws(()=>x.registry.setLegacyAgent({run(){}}),errorCode('contribution.registry.reentrant_mutation'))
  assert.throws(()=>x.registry.registerLegacyResultSink('file',async()=>({ok:true})),errorCode('contribution.registry.reentrant_mutation'))
  assert.throws(()=>x.registry.disposeLegacyCompatibility(),errorCode('contribution.registry.reentrant_mutation'))
  if(fail)throw Error('SECRET')
 }})
 r=register(x);const before=x.host.snapshot();assert.throws(()=>r.dispose(),errorCode('contribution.registry.commit_failed'))
 assert.deepEqual(x.host.snapshot(),before);assert.equal(x.host.trackedRegistrationCount(),1);fail=false;r.dispose();assert.equal(x.host.trackedRegistrationCount(),0)
})
test('shutdown continues after one removal failure and retains failed tracking for retry',()=>{
 const removed=[];let shouldFail=true
 const x=harness({beforeContributionRemove:s=>{const id=s.actionProviders[0].id;removed.push(id);if(id==='second.action'&&shouldFail)throw Error('SECRET')}})
 const a=manifest();delete a.agent_provider;for(const k of ['preflight_checks','result_sinks','workflow_templates','schemas'])a[k]=[]
 const h={actionProviders:new Map([['fixture.action',{id:'fixture.action',execute(){}}]]),preflightChecks:new Map(),resultSinks:new Map()};register(x,a,h)
 x.current.value=installed({id:'local.second'});const b=structuredClone(a);b.owner.id='local.second';b.action_providers=[{id:'second.action',contract_version:'second.action/v1'}]
 register(x,b,{...h,actionProviders:new Map([['second.action',{id:'second.action',execute(){}}]])})
 assert.throws(()=>x.host.dispose(),AggregateError);assert.deepEqual(removed,['second.action','fixture.action']);assert.equal(x.host.trackedRegistrationCount(),1)
 assert.throws(()=>register(x,b,h),errorCode('provider.registry.host_disposed'));shouldFail=false;x.host.dispose();assert.equal(x.host.trackedRegistrationCount(),0);assert.equal(x.host.snapshot().ownedSetCount,0)
})
