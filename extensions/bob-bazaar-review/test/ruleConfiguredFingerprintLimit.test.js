const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const hash=require('../out/ruleAuthoring/ruleSourceHash'),api=require('../out/ruleAuthoring/extraction/documentExtractor');
const {DEFAULT_RULE_AUTHORING_LIMITS:defaults}=require('../out/ruleAuthoring/ruleAuthoringLimits');
async function file(t,name,bytes){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bob-fingerprint-cap-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const filePath=path.join(root,name);await fs.writeFile(filePath,bytes);return{root,filePath};}
test('fingerprint_rejects_effective_ceiling_before_content_read',async t=>{
 const f=await file(t,'source.doc','ab'),open=fs.open;let reads=0;const m=mock.method(fs,'open',async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle);handle.read=(...a)=>{reads++;return read(...a);};return handle;});
 try{await assert.rejects(()=>hash.fingerprintSource(f.filePath,{maximumBytes:1,rootPath:f.root}),e=>e.code==='bounded_document_source_invalid');assert.equal(reads,0);}finally{m.mock.restore();}
});
test('effective_source_ceiling_reaches_all_three_fingerprint_calls',async t=>{
 const f=await file(t,'source.doc','a'),original=hash.fingerprintSource,observed=[];const m=mock.method(hash,'fingerprintSource',async(filePath,options)=>{observed.push(options);return original(filePath,options);});
 try{await api.extractRuleDocument({filePath:f.filePath});await api.extractRuleDocuments([{filePath:f.filePath}],undefined,{...defaults,maxSourceBytes:1});}finally{m.mock.restore();}
 assert.deepEqual(observed.map(x=>x?.maximumBytes),[defaults.maxSourceBytes,defaults.maxSourceBytes,1,1]);assert.ok(observed.every(x=>x.rootPath===f.root));
});
