'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{createRequire}=require('node:module');
const h=require('./helpers/boundedDocumentFixtures'),packageTools=require('./helpers');
const opModule=()=>h.load('documentBudget'),root=()=>h.load('index');
const raw=op=>['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>op.snapshot().categories.find(x=>x.category===id).committed);
const usage=(op,id)=>op.snapshot().categories.find(x=>x.category===id).committed;
const request=f=>({filePath:f.filePath,rootPath:f.root,maximumFileBytes:25*1048576});
function xlsx(rows=2,missingStyles=false,badCrc=false){const entries=[{name:'[Content_Types].xml',data:'types',method:8},{name:'xl/worksheets/s.xml',data:'<worksheet><sheetData><row r="'+rows+'"/></sheetData></worksheet>',method:8,...(badCrc?{crc:0}:{})},{name:'xl/workbook.xml',data:'<workbook xmlns:r="urn:rel"><sheets><sheet name="S" r:id="r1"/></sheets></workbook>',method:8},{name:'xl/_rels/workbook.xml.rels',data:'<Relationships><Relationship Id="r1" Type="urn:relationships/worksheet" Target="worksheets/s.xml"/></Relationships>',method:8}];if(!missingStyles)entries.push({name:'xl/styles.xml',data:'<styleSheet/>',method:8});return{bytes:h.buildZip(entries),entries};}
function operation(signal){const op=opModule().createDocumentOperation({selectedDocumentCount:1,profile:root().normalizeProcessingBudgetProfile(),signal});assert.equal(typeof op.withValidatedOoxml,'function','budgeted operation API must exist');return op;}
const options=(loadXlsxCodec=async()=>h.codec())=>({documentKind:'xlsx',structuralLimits:{maxEntries:5000,maxExpandedBytes:250*1048576},xlsxBudget:{headerRows:0},loadXlsxCodec});

// Break caught: two physical reads double-charging raw, or an admitted reread skipping stability.
test('admitted_ooxml_reread_charges_raw_once_without_skipping_verification',async()=>{
 const f=h.fixture(xlsx().bytes),op=operation(),admission=await op.fingerprintSelection(0,request(f));let calls=0;
 const result=await op.withValidatedOoxml(admission,options(),async input=>{calls++;assert.equal(input.documentKind,'xlsx');assert.equal(input.parserInput.equals(f.bytes),true);assert.equal(input.normalization,'none');assert.deepEqual(input.workbookInspection.sheets,[{name:'S',partName:'xl/worksheets/s.xml',rowSpan:2}]);return 'ok';});
 assert.equal(result,'ok');assert.equal(calls,1);assert.deepEqual(raw(op),[f.bytes.length,f.bytes.length,f.bytes.length]);assert.deepEqual([usage(op,'total_sheets'),usage(op,'total_rows')],[1,2]);assert.equal(op.snapshot().categories.every(x=>x.reserved===0),true);
 const changed=h.fixture(xlsx().bytes),b=operation(),a=await b.fingerprintSelection(0,request(changed));const before=fs.statSync(changed.filePath),bytes=Buffer.from(changed.bytes);bytes[bytes.length-1]^=1;fs.writeFileSync(changed.filePath,bytes);fs.utimesSync(changed.filePath,before.atime,before.mtime);await assert.rejects(()=>b.withValidatedOoxml(a,options(),async()=>assert.fail('changed source parser')),e=>e.code==='bounded_document_source_changed');
});

// Break caught: a second inflate pass or inspecting bytes before CRC succeeds.
test('worksheet_observer_runs_after_crc_once_per_entry_without_retaining_buffers',async()=>{
 const data=xlsx(),f=h.fixture(data.bytes),op=operation(),admission=await op.fingerprintSelection(0,request(f)),workbook=h.load('workbookBudget'),create=workbook.createXlsxInspectionObserver,inflate=zlib.inflateRawSync;let observed=0,inflates=0;
 const i=mock.method(zlib,'inflateRawSync',function(...args){inflates++;return inflate.apply(this,args);});const o=mock.method(workbook,'createXlsxInspectionObserver',function(){const observer=create();return{observeEntry(name,bytes){observed++;return observer.observeEntry(name,bytes);},finish(){return observer.finish();}};});
 try{await op.withValidatedOoxml(admission,options(),async()=>undefined);assert.equal(inflates,5);assert.equal(observed,5);}finally{o.mock.restore();i.mock.restore();}
 const bad=h.fixture(xlsx(2,false,true).bytes),b=operation(),a=await b.fingerprintSelection(0,request(bad));let parserCalls=0;await assert.rejects(()=>b.withValidatedOoxml(a,options(),async()=>{parserCalls++;}),e=>e.code==='bounded_document_archive_invalid');assert.equal(parserCalls,0);assert.equal(usage(b,'total_rows'),0);
});

// Break caught: loading codec/parser before the entire workbook is admitted.
test('all_workbook_budgets_commit_before_parser_and_codec_results_are_adopted',async()=>{
 const f=h.fixture(xlsx(501,true).bytes),op=operation(),a=await op.fingerprintSelection(0,request(f));let codec=0,parser=0;
 await assert.rejects(()=>op.withValidatedOoxml(a,options(async()=>{codec++;return h.codec();}),async()=>{parser++;}),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='rows_per_sheet');assert.deepEqual([codec,parser,usage(op,'total_sheets'),usage(op,'total_rows')],[0,0,0,0]);assert.deepEqual(raw(op),[f.bytes.length,f.bytes.length,f.bytes.length]);
 const good=h.fixture(xlsx(2,true).bytes),b=operation(),admission=await b.fingerprintSelection(0,request(good));await b.withValidatedOoxml(admission,options(async()=>{assert.deepEqual([usage(b,'total_sheets'),usage(b,'total_rows')],[1,2]);return h.codec();}),async input=>{assert.equal(input.normalization,'xlsx_minimal_styles');assert.equal(input.workbookInspection.sheets[0].rowSpan,2);});
});

// Break caught: rollback of admitted resources or replacement of the original callback throw.
test('parser_failure_keeps_admitted_usage_and_normal_t14_failure_releases_raw',async()=>{
 for(const reason of [undefined,null,0,new Error('parser first')]){
  const f=h.fixture(xlsx().bytes),op=operation(),a=await op.fingerprintSelection(0,request(f));let failed=false;try{await op.withValidatedOoxml(a,options(),async()=>{throw reason;});}catch(e){failed=true;assert.strictEqual(e,reason);}assert.equal(failed,true);assert.deepEqual(raw(op),[f.bytes.length,f.bytes.length,f.bytes.length]);assert.deepEqual([usage(op,'total_sheets'),usage(op,'total_rows')],[1,2]);assert.equal(op.snapshot().categories.every(x=>x.reserved===0),true);
  const normal=await h.request();await h.load('ooxmlParserInput').withValidatedOoxmlParserInput(normal.request,async()=>{throw reason;}).then(()=>assert.fail('must throw'),e=>assert.strictEqual(e,reason));assert.deepEqual(h.committedTriple(normal.request.ledger),[0,0,0]);
 }
});

// Break caught: adopting a codec/parser await result after its effective signal was cancelled.
test('budgeted_codec_and_parser_await_cancellation_keep_error_identity',async()=>{
 for(const stage of ['codec','parser']){const c=new AbortController(),reason=new Error('cancel after '+stage),f=h.fixture(xlsx(2,stage==='codec').bytes),op=operation(c.signal),a=await op.fingerprintSelection(0,request(f));let parserCalls=0;
  await assert.rejects(()=>op.withValidatedOoxml(a,options(async()=>{if(stage==='codec')c.abort(reason);return h.codec();}),async()=>{parserCalls++;c.abort(reason);return 'discard';}),e=>e===reason);assert.equal(parserCalls,stage==='codec'?0:1);assert.deepEqual([usage(op,'total_sheets'),usage(op,'total_rows')],[1,2]);assert.deepEqual(raw(op),[f.bytes.length,f.bytes.length,f.bytes.length]);
 }
});

// Break caught: exported arbitrary input/skip switches or reuse of a consumed admission.
test('budgeted_ooxml_options_are_closed_and_handles_are_single_use',async()=>{
 for(const extra of [{parserInput:Buffer.from('forged')},{inspection:{sheets:[]}},{skipCharge:true}]){const f=h.fixture(xlsx().bytes),op=operation(),a=await op.fingerprintSelection(0,request(f));await assert.rejects(()=>op.withValidatedOoxml(a,{...options(),...extra},async()=>assert.fail('invalid options')),e=>e.code==='bounded_document_input_invalid');}
 const f=h.fixture(xlsx().bytes),op=operation(),a=await op.fingerprintSelection(0,request(f));const first=op.withValidatedOoxml(a,options(),async()=>undefined);await assert.rejects(()=>op.withValidatedOoxml(a,options(),async()=>undefined),e=>e.code==='bounded_document_input_invalid');await first;await assert.rejects(()=>op.verifyAfterExternalRead(a),e=>e.code==='bounded_document_input_invalid');
});

// Break caught: missing APIs/types in the tarball, or repository/deep-import fallback.
test('packed_aggregate_api_has_exact_46_paths_and_no_deep_import',async()=>{
 const proof=packageTools.packAndInstall(packageTools.packageRoot,packageTools.freshArtifactRoot('aggregate-pack'));assert.equal(proof.manifest.length,46);
 const requireInstalled=createRequire(path.join(proof.consumerRoot,'package.json')),r=requireInstalled('@bob/processing-budget-runtime');for(const api of ['createDocumentOperation','assertDocumentNotCancelled','commitWorkbookBudget','commitXlsxWorkbookBudget','assertParsedXlsxWorkbookWithinBudget'])assert.equal(typeof r[api],'function');assert.equal(r.createXlsxInspectionObserver,undefined);assert.throws(()=>requireInstalled('@bob/processing-budget-runtime/out/documentBudget'),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');
 const filePath=path.join(proof.consumerRoot,'source.docx'),bytes=fs.readFileSync(filePath),op=r.createDocumentOperation({selectedDocumentCount:1,profile:r.normalizeProcessingBudgetProfile()}),admission=await op.fingerprintSelection(0,{filePath,rootPath:proof.consumerRoot,maximumFileBytes:1024});let calls=0;await op.withValidatedOoxml(admission,{documentKind:'docx',structuralLimits:{maxEntries:5000,maxExpandedBytes:250*1048576},loadXlsxCodec:async()=>assert.fail('docx codec')},async input=>{calls++;assert.equal(input.parserInput.equals(bytes),true);assert.equal(Object.hasOwn(input,'workbookInspection'),false);});assert.equal(calls,1);assert.deepEqual(raw(op),[bytes.length,bytes.length,bytes.length]);
});

// Break caught: an ordinary competing builder release being treated as an invalid filesystem.
test('build_lock_release_between_eexist_and_inspection_retries_without_bypass',()=>{
 const build=require('../scripts/build-runtime'),lock=path.join(build.cache,'build.lock'),open=fs.openSync;let released=false;
 const s=mock.method(fs,'openSync',function(file,flags,...args){if(file===lock&&flags==='wx'&&!released){released=true;const fd=open(file,flags,...args);fs.closeSync(fd);fs.unlinkSync(file);throw Object.assign(new Error('competing owner released'),{code:'EEXIST'});}return open(file,flags,...args);});
 try{assert.equal(build.withBuildLock(()=>42),42);assert.equal(released,true);assert.equal(fs.existsSync(lock),false);}finally{s.mock.restore();}
});
