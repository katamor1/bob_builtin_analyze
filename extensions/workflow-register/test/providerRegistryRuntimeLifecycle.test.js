const assert=require('node:assert/strict'),{test}=require('node:test')
const {harness,register,manifest,handlers,exported,ownedSinks,root,input}=require('./providerRegistryRuntimeTestSupport')

test('live views created before publication see only current action preflight agent and sink handlers',async t=>{
 const x=harness(),calls=[],sinks=ownedSinks(x,root(t)),live=exported('core/agentProvider','createLiveAgentProvider')(()=>x.runtime.getAgentProvider())
 const resolver=exported('core/engine/preflight','createPreflightCheckResolver')({},x.runtime)
 assert.equal(resolver.getPreflightCheck('fixture.ready'),undefined);await assert.rejects(()=>live.run({}),/Agent provider is required/)
 const r=register(x,manifest(),handlers(calls));assert.deepEqual(sinks.list(),['fixture.sink']);assert.equal((await x.registry.execute('fixture.action',{inputs:{}})).value,'action-value')
 assert.equal(await resolver.getPreflightCheck('fixture.ready')({}),true);assert.equal(await live.run({}),'agent-value')
 assert.equal((await sinks.writeContribution({type:'fixture.sink',contractVersion:'fixture.sink/v1',payload:{}},input())).ok,true)
 r.dispose();assert.deepEqual(sinks.list(),[]);assert.equal(resolver.getPreflightCheck('fixture.ready'),undefined);await assert.rejects(()=>live.run({}),/Agent provider is required/)
 assert.equal((await x.registry.execute('fixture.action',{inputs:{}})).ok,false);assert.equal((await sinks.writeContribution({type:'fixture.sink',contractVersion:'fixture.sink/v1',payload:{}},input())).ok,false)
 const next=handlers();next.agentProvider.run=()=> 'next';const r2=register(x,manifest(),next);assert.equal(await live.run({}),'next');r2.dispose();assert.deepEqual(calls,['action','preflight','agent','sink'])
})

test('sink version mismatch calls no handler',async t=>{
 const x=harness(),calls=[];register(x,manifest(),handlers(calls));const sinks=ownedSinks(x,root(t))
 assert.equal(typeof sinks.writeContribution,'function','atomic sink write boundary is missing')
 const result=await sinks.writeContribution({type:'fixture.sink',contractVersion:'fixture.sink/v2',payload:{}},input());assert.equal(result.ok,false);assert.equal(calls.length,0)
})

test('file transaction binding requires the same run owner token and handler and stale disposal is harmless',()=>{
 const Binding=exported('core/runtime/resultSinkRegistry','ResultSinkFileTransactionBinding'),b=new Binding(),scope={workspaceRoot:process.cwd(),runId:'one'},token={},handler=async()=>({ok:true}),transaction=async()=>({ok:true})
 const r=b.bind(scope,token,handler,transaction)
 assert.equal(b.getFileTransaction({...scope},token,handler),transaction)
 assert.equal(b.getFileTransaction({...scope,runId:'two'},token,handler),undefined)
 assert.equal(b.getFileTransaction(scope,{},handler),undefined);assert.equal(b.getFileTransaction(scope,token,async()=>({ok:true})),undefined)
 r.dispose();assert.equal(b.getFileTransaction(scope,token,handler),undefined);const r2=b.bind(scope,token,handler,transaction);r.dispose();assert.equal(b.getFileTransaction(scope,token,handler),transaction);r2.dispose()
})

test('file transaction refuses mixed runs and an owner replacement without invoking transaction or commit',async t=>{
 const x=harness(),m=manifest();m.result_sinks=[{type:'file',contract_version:'workflow-register.file-result-sink/v1'}]
 let transactions=0,commits=0;const h=handlers();h.resultSinks=new Map([['file',async()=>({ok:true})]])
 const r=register(x,m,h),sinks=ownedSinks(x,root(t),{fileTransactionFactory:()=>async(_writes,commit)=>{transactions++;await commit();return{ok:true}}})
 const write=runId=>({sink:{type:'file',path:'result.txt'},input:input(runId)})
 assert.equal((await sinks.writeFileTransaction([write('one'),write('two')],()=>{commits++})).ok,false);assert.equal(transactions,0);assert.equal(commits,0)
 assert.equal((await sinks.writeFileTransaction([write('one')],()=>{commits++})).ok,true);assert.equal(transactions,1);assert.equal(commits,1)
 r.dispose();register(x,m,h)
 assert.equal((await sinks.writeFileTransaction([write('one')],()=>{commits++})).ok,false);assert.equal(transactions,1);assert.equal(commits,1)
 assert.equal((await sinks.writeFileTransaction([write('new-run')],()=>{commits++})).ok,true)
})
