
const path=require('node:path'),fs=require('node:fs'),Module=require('node:module');
const {createLockedRawPackage,createEmptyProviderCatalog,createBobProfile}=require('./workflowContractV2CompilerTestSupport');
const {MemoryPackageFileSystem,installPublished}=require('./workflowContractV2PackageLoaderTestSupport');
function fixture(purpose='runtime') {
 const api=require('../out/core/contractV2');const adapter=new MemoryPackageFileSystem();
 const locked=createLockedRawPackage();const published=installPublished(adapter,'minimal',locked.files);
 const environment=api.createAuditedWorkflowCompilerEnvironment({purpose,providerCatalog:createEmptyProviderCatalog(),bobProfile:createBobProfile()});
 const root=require('../out/core/contractV2/packageRoot').createWorkflowPackageRoot(adapter,'/collection');
 const loader=require('../out/core/contractV2/packageLoader');const store=new api.WorkflowPlanStore();
 const counters={load:0,generation:0,compile:0,acquire:0,dispatch:0};const handles=new Set();
 const slot=Object.freeze({collectionId:'collection-test',collectionRoot:'/collection',workflowId:'minimal'});
 const entrypoint=require('../out/workflowContractV2Entrypoint').createWorkflowContractV2Entrypoint({environment,
 loadCurrent:async()=>{counters.load++;return loader.loadCurrentWorkflowPackage({fileSystem:adapter,collectionRoot:root,workflowId:'minimal'});},
 loadGeneration:async input=>{counters.generation++;return loader.loadWorkflowPackageGeneration({fileSystem:adapter,collectionRoot:root,workflowId:'minimal',generation:input.generation,...(input.expectedPackageDigest?{expectedPackageDigest:input.expectedPackageDigest}:{})});},
 getOrCompile:async input=>{const result=await store.getOrCompile(input);if(!handles.has(result)){handles.add(result);counters.compile++;}return result;},
 acquire:async input=>{counters.acquire++;return store.acquire(input);},invalidate:(collectionId,workflowId)=>store.invalidateSlot(collectionId,workflowId)});
 return {api,adapter,published,locked,store,environment,entrypoint,counters,slot};
}
function requireWithVscode(relative,stub) {
 const target=path.resolve(__dirname,relative),original=Module._load;
 Module._load=function(request,parent,isMain){if(request==='vscode')return stub;return original.call(this,request,parent,isMain);};
 try{delete require.cache[target];return require(target);}finally{Module._load=original;}
}
function publishNodeFixture(collectionRoot) {
 const locked=createLockedRawPackage();const adapter=new MemoryPackageFileSystem();const published=installPublished(adapter,'minimal',locked.files);
 const destination=path.join(collectionRoot,...published.base);fs.mkdirSync(destination,{recursive:true});
 for(const [name,bytes]of Object.entries(locked.files)){const file=path.join(destination,...name.split('/'));fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}
 fs.writeFileSync(path.join(collectionRoot,'minimal/current.json'),adapter.entries.get('minimal/current.json').bytes);
 return {locked,published};
}
module.exports={fixture,requireWithVscode,publishNodeFixture};
