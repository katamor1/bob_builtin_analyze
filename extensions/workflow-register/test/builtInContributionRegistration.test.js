const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{test}=require('node:test')
const {exported,root,input,vscodeStub,service}=require('./providerRegistryRuntimeTestSupport')

test('built-in contribution set publishes exactly two actions three checks and two sinks once',()=>{
 const {own}=vscodeStub(),{ActionRegistry}=require('../out/core/actionRegistry'),{ProviderRegistryHost}=require('../out/api/providerRegistryApi')
 const registry=new ActionRegistry(),host=new ProviderRegistryHost({actionRegistry:registry,resolveInstalledExtension:()=>own})
 const register=exported('builtInContributions','registerWorkflowRegisterBuiltInContributions'),r=register(host,{installed:own,executeCommand:()=>undefined,isWorkspaceTrusted:()=>true,workspaceFolders:()=>[]})
 const s=host.snapshot();assert.equal(s.ownedSetCount,1);assert.equal(s.actionProviders.length,2);assert.equal(s.preflightChecks.length,3);assert.equal(s.resultSinks.length,2)
 assert.throws(()=>register(host,{installed:own,executeCommand:()=>undefined}),e=>e.code==='contribution.registry.duplicate_owner');r.dispose();assert.deepEqual(registry.list(),[])
})

test('existing command file and legacy file-transaction override retain their behavior with atomic built-ins',async t=>{
 const {service:s,vscode}=service(),workspace=root(t),commands=[];vscode.commands.executeCommand=async(...args)=>{commands.push(args);return'command-value'}
 assert.equal(s.actionRegistry.snapshotContributions().ownedSetCount,1)
 const engine=s.runtimeFactory.createEngine(workspace),sinks=engine.resultSinks
 assert.equal((await sinks.write({type:'command',command:'bobBazaar.captureReviewResult'},input())).ok,true);assert.equal(commands.length,1)
 assert.equal((await sinks.write({type:'file',path:'plain.txt'},input())).ok,true);assert.equal(fs.readFileSync(path.join(workspace,'plain.txt'),'utf8'),'fixture text')
 let overrides=0,commits=0;s.registerResultSink('file',async()=>{overrides++;return{ok:true}})
 assert.equal((await sinks.write({type:'file',path:'ignored.txt'},input())).ok,true);assert.equal(overrides,1)
 assert.equal((await sinks.writeFileTransaction([{sink:{type:'file',path:'atomic.txt'},input:input()}],()=>{commits++})).ok,true)
 assert.equal(fs.readFileSync(path.join(workspace,'atomic.txt'),'utf8'),'fixture text');assert.equal(overrides,1);assert.equal(commits,1)
 s.dispose();await s.whenDisposed()
})
