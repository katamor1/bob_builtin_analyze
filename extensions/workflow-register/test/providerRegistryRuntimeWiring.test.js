const assert=require('node:assert/strict'),{test}=require('node:test')
const {harness,register,manifest,handlers,factory,root,service}=require('./providerRegistryRuntimeTestSupport')

test('factory engines created before registration use live views and preserve explicit agent priority',async t=>{
 const x=harness(),f=factory(x),engine=f.createEngine(root(t)),explicit=f.createEngine(root(t),{run:()=> 'explicit'})
 const r=register(x);assert.equal(await engine.agentProvider.run({}),'agent-value');assert.equal(await explicit.agentProvider.run({}),'explicit')
 x.registry.setLegacyAgent({run:()=> 'legacy'});assert.equal(await engine.agentProvider.run({}),'legacy');assert.equal(await explicit.agentProvider.run({}),'explicit')
 x.registry.disposeLegacyCompatibility();r.dispose();await assert.rejects(()=>engine.agentProvider.run({}),/Agent provider is required/)
 const h=handlers();h.agentProvider.run=()=> 'replacement';register(x,manifest(),h);assert.equal(await engine.agentProvider.run({}),'replacement')
})

test('a pre-created real engine runs current atomic command and preflight handlers across replacement',async t=>{
 const x=harness(),engine=factory(x).createEngine(root(t)),m=manifest();delete m.agent_provider;m.result_sinks=[];const calls=[]
 const h={actionProviders:new Map([['fixture.action',{id:'fixture.action',execute:()=>{calls.push('first');return'first'}}]]),preflightChecks:new Map([['fixture.ready',()=>{calls.push('ready');return true}]]),resultSinks:new Map()}
 const workflow={id:'fixture.workflow',name:'fixture',label:'Fixture',schemaVersion:'workflow-register/v1',definitionHash:'sha256:test',inputs:{},preflight:[{id:'ready',checks:['fixture.ready']}],engineSteps:[{id:'step',title:'Step',type:'command',action:{provider:'fixture.action'},resultKey:'value'}]}
 const r=register(x,m,h);let run=await engine.runWorkflow(workflow,{});assert.equal(run.status,'completed');assert.equal(run.state.value,'first');assert.deepEqual(calls,['ready','first'])
 r.dispose();h.actionProviders.get('fixture.action').execute=()=> 'second';register(x,m,h);run=await engine.runWorkflow(workflow,{});assert.equal(run.status,'completed');assert.equal(run.state.value,'second')
})

test('service compatibility APIs retain void returns while owning live slots in its backend',async()=>{
 const {service:s}=service();const old={run:()=> 'legacy'},sink=async()=>({ok:true})
 assert.equal(s.registerAgentProvider(old),undefined);assert.equal(s.registerResultSink('custom',sink),undefined)
 assert.equal(s.actionRegistry.getLegacyAgent(),old);assert.equal(s.actionRegistry.getLegacyResultSink('custom'),sink)
 assert.equal(Object.hasOwn(s,'customResultSinks'),false);assert.equal(Object.hasOwn(s,'agentProvider'),false);assert.equal(Object.hasOwn(s,'actionProviderRegistrations'),false)
 s.dispose();const done=await s.whenDisposed();assert.equal(done.failures.length,0);assert.equal(s.actionRegistry.getLegacyAgent(),undefined)
})
