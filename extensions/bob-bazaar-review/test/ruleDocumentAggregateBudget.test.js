'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const shared=require('../out/sharedProcessingBudgetRuntime'),api=require('../out/ruleAuthoring/extraction/documentExtractor'),xlsx=require('../out/ruleAuthoring/extraction/xlsxExtractor');
const {DEFAULT_RULE_AUTHORING_LIMITS:defaults}=require('../out/ruleAuthoring/ruleAuthoringLimits'),{createXlsxFixture}=require('./helpers/ruleDocumentFixtures');
async function fixture(t,name='source.doc',bytes=Buffer.from('legacy')){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bob-t15-rule-'));t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(root,{recursive:true,force:true});});const filePath=path.join(root,name);await fs.writeFile(filePath,bytes);return{root,filePath,bytes};}
function observe(t){assert.equal(typeof shared.createRuleDocumentOperation,'function','rule operation factory must exist');const create=shared.createRuleDocumentOperation,operations=[],m=mock.method(shared,'createRuleDocumentOperation',(...args)=>{const op=create(...args);operations.push(op);return op;});t.after(()=>m.mock.restore());return operations;}
const usage=(op,id)=>op.snapshot().categories.find(x=>x.category===id).committed;

// Break caught: per-document contexts, or the count reservation after source I/O starts.
test('batch_reserves_all_twenty_before_any_path_or_fingerprint',async t=>{
 const operations=observe(t),f=await fixture(t);const open=fs.open;let io=0;const m=mock.method(fs,'open',async(...args)=>{io++;assert.equal(operations.length,1);assert.equal(usage(operations[0],'document_count'),20);return open(...args);});t.after(()=>m.mock.restore());
 const result=await api.extractRuleDocuments(Array.from({length:20},(_,i)=>({filePath:f.filePath,logicalName:'source-'+i+'.doc'})),undefined,defaults);assert.ok(io>0);assert.equal(result.documents.length,20);assert.equal(usage(operations[0],'total_document_bytes'),120);assert.ok(result.documents.every(x=>x.status==='requires_conversion'));
});

// Break caught: deduplicating before complete-count admission or touching a rejected prefix.
test('twenty_one_rejects_even_if_duplicates',async t=>{
 observe(t);let getters=0,io=0;const open=fs.open,m=mock.method(fs,'open',async(...args)=>{io++;return open(...args);});t.after(()=>m.mock.restore());const request={get filePath(){getters++;return '/must-not-read.doc';}};
 await assert.rejects(()=>api.extractRuleDocuments(Array(21).fill(request),undefined,defaults));assert.deepEqual([getters,io],[0,0]);
});

// Break caught: duplicate selections escaping raw admission or invoking duplicate parsers.
test('duplicate_and_existing_manifest_selections_charge_raw_before_canonical_parse',async t=>{
 const operations=observe(t),f=await fixture(t,'source.xlsx',createXlsxFixture()),parse=xlsx.extractXlsx;let parses=0;const m=mock.method(xlsx,'extractXlsx',async(...args)=>{parses++;return parse(...args);});t.after(()=>m.mock.restore());const requests=[{filePath:f.filePath,logicalName:'b.xlsx'},{filePath:f.filePath,logicalName:'a.xlsx'}];
 const first=await api.extractRuleDocuments(requests,undefined,defaults);assert.equal(parses,1);assert.equal(first.documents.length,1);assert.equal(first.documents[0].logicalName,'a.xlsx');assert.deepEqual([usage(operations[0],'document_count'),usage(operations[0],'total_document_bytes'),usage(operations[0],'total_sheets'),usage(operations[0],'total_rows')],[2,2*f.bytes.length,2,5]);
 const second=await api.extractRuleDocuments(requests,first.manifest,defaults);assert.equal(parses,1);assert.equal(second.documents.length,0);assert.deepEqual([usage(operations[1],'document_count'),usage(operations[1],'total_document_bytes'),usage(operations[1],'total_sheets')],[2,2*f.bytes.length,0]);assert.equal(second.duplicates.every(x=>x.reason==='duplicate_existing_manifest'),true);
});

// Break caught: a lower aggregate becoming a leaf warning, or raised public ceilings taking effect.
test('raw_exact_and_plus_one_preserve_25_and_100_mib_caps',async t=>{
 const operations=observe(t),f=await fixture(t,'a.doc',Buffer.from('abc'));const exact={...defaults,maxAggregateSourceBytes:6};await api.extractRuleDocuments([{filePath:f.filePath},{filePath:f.filePath,logicalName:'b.doc'}],undefined,exact);assert.equal(usage(operations[0],'total_document_bytes'),6);
 const second=path.join(f.root,'c.doc');await fs.writeFile(second,'four');let allocations=0;const alloc=Buffer.alloc,a=mock.method(Buffer,'alloc',(n,...args)=>{if(n===4)allocations++;return alloc(n,...args);});try{await assert.rejects(()=>api.extractRuleDocuments([{filePath:f.filePath},{filePath:second}],undefined,exact),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='total_document_bytes');assert.equal(allocations,0);assert.equal(usage(operations[1],'total_document_bytes'),3);}finally{a.mock.restore();}
 const raised=shared.createRuleDocumentOperation(0,{...defaults,maxSourceFiles:200,maxSourceBytes:100*1048576,maxAggregateSourceBytes:200*1048576});assert.deepEqual(['document_count','single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(k=>raised.profile.limits[k]),[20,25*1048576,100*1048576,100*1048576]);
});

// Break caught: Promise.all rejection leaving a later source's owned read active.
test('batch_preparation_settles_in_order_without_owned_siblings_after_failure',async t=>{
 const operations=observe(t),f=await fixture(t);const stat=fs.lstat;let later=0;const m=mock.method(fs,'lstat',async(file,...args)=>{if(file===f.filePath)later++;return stat(file,...args);});t.after(()=>m.mock.restore());await assert.rejects(()=>api.extractRuleDocuments([{filePath:path.join(f.root,'missing.doc')},{filePath:f.filePath}],undefined,defaults));await new Promise(resolve=>setImmediate(resolve));assert.equal(later,0);assert.equal(usage(operations[0],'document_count'),2);assert.equal(usage(operations[0],'total_document_bytes'),0);assert.equal(operations[0].snapshot().categories.every(x=>x.reserved===0),true);
});

// Break caught: counting dense output instead of the declared workbook span before parser load.
test('xlsx_full_span_budget_precedes_import_and_keeps_locators',async t=>{
 const operations=observe(t),{unzipSync,zipSync,strToU8}=require('fflate'),entries=unzipSync(createXlsxFixture());entries['xl/worksheets/sheet2.xml']=strToU8('<worksheet><sheetData><row r="501"/></sheetData></worksheet>');const f=await fixture(t,'sparse.xlsx',Buffer.from(zipSync(entries))),parse=xlsx.extractXlsx;let calls=0;const p=mock.method(xlsx,'extractXlsx',async(...args)=>{calls++;return parse(...args);});t.after(()=>p.mock.restore());await assert.rejects(()=>api.extractRuleDocument({filePath:f.filePath}),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='rows_per_sheet');assert.equal(calls,0);assert.equal(usage(operations[0],'total_sheets'),0);assert.equal(operations[0].snapshot().categories.every(x=>x.reserved===0),true);
 const good=await fixture(t,'valid.xlsx',createXlsxFixture()),result=await api.extractRuleDocument({filePath:good.filePath});assert.deepEqual(result.chunks.map(x=>[x.locator.sheet,x.locator.row,x.locator.cell_range]),[['Second',1,'B1:D1'],['Second',3,'A3:C3'],['First',2,'A2:A2']]);
});
