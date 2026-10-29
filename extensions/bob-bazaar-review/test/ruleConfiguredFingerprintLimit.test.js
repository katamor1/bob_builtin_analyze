const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const hash=require('../out/ruleAuthoring/ruleSourceHash'),shared=require('../out/sharedProcessingBudgetRuntime'),api=require('../out/ruleAuthoring/extraction/documentExtractor');
const {DEFAULT_RULE_AUTHORING_LIMITS:defaults}=require('../out/ruleAuthoring/ruleAuthoringLimits');
async function file(t,name,bytes){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bob-fingerprint-cap-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const filePath=path.join(root,name);await fs.writeFile(filePath,bytes);return{root,filePath};}
test('fingerprint_rejects_effective_ceiling_before_content_read',async t=>{
 const f=await file(t,'source.doc','ab'),open=fs.open;let reads=0;const m=mock.method(fs,'open',async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle);handle.read=(...a)=>{reads++;return read(...a);};return handle;});
 try{await assert.rejects(()=>hash.fingerprintSource(f.filePath,{maximumBytes:1,rootPath:f.root}),e=>e.code==='bounded_document_source_invalid');assert.equal(reads,0);}finally{m.mock.restore();}
});
test('effective_source_ceiling_reaches_operation_and_admission_before_content_read',async t=>{
 const f=await file(t,'source.doc','a'),original=shared.createRuleDocumentOperation,operations=[];const m=mock.method(shared,'createRuleDocumentOperation',(...args)=>{const operation=original(...args);operations.push(operation);return operation;});
 try{await api.extractRuleDocument({filePath:f.filePath});await api.extractRuleDocuments([{filePath:f.filePath}],undefined,{...defaults,maxSourceBytes:1});}finally{m.mock.restore();}
 assert.deepEqual(operations.map(op=>op.profile.limits.single_document_bytes),[defaults.maxSourceBytes,1]);assert.deepEqual(operations.map(op=>op.snapshot().categories.find(x=>x.category==='total_document_bytes').committed),[1,1]);
 const oversized=await file(t,'larger.doc','ab'),open=fs.open;let reads=0;const r=mock.method(fs,'open',async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle);handle.read=(...a)=>{reads++;return read(...a);};return handle;});try{await assert.rejects(()=>api.extractRuleDocuments([{filePath:oversized.filePath}],undefined,{...defaults,maxSourceBytes:1}),e=>e.code==='bounded_document_source_invalid');assert.equal(reads,0);}finally{r.mock.restore();}
});
