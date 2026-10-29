'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const shared=require('../out/sharedProcessingBudgetRuntime'),{extractDocuments,countDocumentSelections}=require('../out/analyzers/documentExtractor');
const {normalizeReviewProcessingLimits}=require('../out/core/limits');
const {createXlsxFixture}=require('../../bob-bazaar-review/test/helpers/ruleDocumentFixtures');
function input(paths){return{schema_version:1,review:{id:'aggregate',title:'aggregate',change_type:'bugfix',purpose:'test',base:'a',head:'b',vcs:'git'},artifacts:{requirements:paths.map(path=>({path}))},review_focus:['requirement-code-consistency']};}
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccr-t15-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function operation(n,limits={},overrides){return shared.createReviewDocumentOperation(n,normalizeReviewProcessingLimits(limits),overrides);}
function used(op,category){return op.snapshot().categories.find(row=>row.category===category).committed;}
test('all_artifact_selections_count_before_resolve_even_after_excerpt_exhaustion',async t=>{
 const root=fixture(t),i=input(['missing.md']);i.artifacts.extra=[{path:'other.md'},{}];i.artifacts.ignored='not an array';assert.equal(countDocumentSelections(i),2);
 const fileSystem=require('../out/core/fileSystem');let resolves=0;const m=mock.method(fileSystem,'resolveWorkspacePathStrict',()=>{resolves++;throw new Error('path must not be reached');});
 try{await assert.rejects(()=>extractDocuments(i,{workspaceRoot:root,limits:{maxBobInputBytes:1},processingBudgetLimits:{document_count:1}}),e=>e instanceof shared.ProcessingBudgetError&&e.code==='processing_budget_exceeded');assert.equal(resolves,0);}finally{m.mock.restore();}
});
test('count_1024_and_duplicate_selections_are_charged_without_a_second_context',async t=>{
 const root=fixture(t),text='# REQ-001\ntext';fs.writeFileSync(path.join(root,'one.md'),text);const op=operation(2),r=await extractDocuments(input(['one.md','one.md']),{workspaceRoot:root,operation:op});assert.equal(r.documents.length,2);assert.equal(used(op,'document_count'),2);assert.equal(used(op,'total_document_bytes'),2*Buffer.byteLength(text));
 assert.equal(operation(1024,{}, {document_count:1024}).selectedDocumentCount,1024);assert.throws(()=>operation(1025,{}, {document_count:1024}),e=>e.code==='processing_budget_exceeded');
});
test('fifty_mib_public_leaf_is_not_implicitly_cut_to_32',()=>{
 const op=operation(1,{maxDocumentBytes:50*1048576,maxWorkbookSheets:100,maxRowsPerSheet:5000});assert.equal(op.profile.limits.single_document_bytes,50*1048576);assert.equal(op.profile.limits.total_document_bytes,50*1048576);assert.equal(op.profile.limits.total_operation_input_bytes,64*1048576);assert.equal(op.profile.limits.total_sheets,100);assert.equal(op.profile.limits.total_rows,25000);
});
test('lower_aggregate_override_remains_fatal_not_single_source_warning',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'one.md'),'abcdef');const op=operation(1,{}, {total_document_bytes:5});let reads=0;const open=fsp.open,m=mock.method(fsp,'open',async(...args)=>{const h=await open(...args),read=h.read.bind(h);h.read=async(...a)=>{reads++;return read(...a);};return h;});
 try{await assert.rejects(()=>extractDocuments(input(['one.md']),{workspaceRoot:root,operation:op,processingBudgetLimits:{total_document_bytes:5}}),e=>e instanceof shared.ProcessingBudgetError&&e.details.constrainedCategory==='total_document_bytes');assert.equal(reads,0);assert.equal(used(op,'total_document_bytes'),0);}finally{m.mock.restore();}
 const exact=operation(1,{}, {total_document_bytes:6});await extractDocuments(input(['one.md']),{workspaceRoot:root,operation:exact,processingBudgetLimits:{total_document_bytes:6}});assert.equal(used(exact,'total_document_bytes'),6);
});
test('provided_context_and_closed_overrides_are_checked_before_paths',async t=>{
 const root=fixture(t),bad=[{single_document_bytes:50*1048576+1},{single_document_bytes:'1'},{document_count:NaN},{unknown:1},Object.create({document_count:1})];let getter=0;bad.push(Object.defineProperty({},'single_document_bytes',{enumerable:true,get(){getter++;throw new Error('getter');}}));for(const overrides of bad)assert.throws(()=>operation(1,{},overrides),e=>e.code==='processing_budget_profile_invalid');assert.equal(getter,0);
 await assert.rejects(()=>extractDocuments(input(['missing.md']),{workspaceRoot:root,operation:operation(2)}),e=>e.code==='bounded_document_input_invalid');await assert.rejects(()=>extractDocuments(input(['missing.md']),{workspaceRoot:root,operation:operation(1),processingBudgetLimits:{total_document_bytes:1}}),e=>e.code==='bounded_document_input_invalid');
 const p=operation(0,{}, {raw_diff_bytes:7});assert.equal(p.profile.limits.raw_diff_bytes,7);
});
test('all_declared_sheets_are_budgeted_before_selected_sheet_filter',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'book.xlsx'),createXlsxFixture());const i=input(['book.xlsx']);i.artifacts.requirements[0].sheets=['First'];const adapter=require('../out/analyzers/documentXlsxExtractor');let parses=0;const original=adapter.extractXlsxChunks,m=mock.method(adapter,'extractXlsxChunks',(...args)=>{parses++;return original(...args);});
 try{await assert.rejects(()=>extractDocuments(i,{workspaceRoot:root,limits:{maxRowsPerSheet:1}}),e=>e instanceof shared.ProcessingBudgetError&&e.details.constrainedCategory==='rows_per_sheet');assert.equal(parses,0);}finally{m.mock.restore();}
 const op=operation(1),r=await extractDocuments(input(['book.xlsx']),{workspaceRoot:root,operation:op});assert.equal(used(op,'total_sheets'),2);assert.equal(used(op,'total_rows'),3);assert.ok(r.evidence.some(e=>e.location==='Second!2'));assert.equal(r.warnings.some(w=>w.includes('failed to extract')),false);
});
test('ordinary_warning_and_typed_fatal_failures_keep_existing_document_ids',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'one.md'),'# REQ-001\ntext');const r=await extractDocuments(input(['unknown.ext','one.md']),{workspaceRoot:root});assert.deepEqual(r.documents.map(d=>d.document_id),['DOC-REQ-0001','DOC-REQ-0002']);assert.ok(r.warnings.some(w=>w.includes('unsupported document extension')));assert.equal(r.evidence[0].document_id,'DOC-REQ-0002');
 fs.writeFileSync(path.join(root,'bad.xlsx'),'bad zip');await assert.rejects(()=>extractDocuments(input(['bad.xlsx']),{workspaceRoot:root}),e=>e.code==='bounded_document_archive_invalid');
});
test('sparse_full_span_header_one_is_checked_before_dense_locator_filtering',async t=>{
 const root=fixture(t),{unzipSync,zipSync,strToU8}=require('fflate');for(const row of [501,502]){const entries=unzipSync(createXlsxFixture());entries['xl/worksheets/sheet2.xml']=strToU8(`<worksheet><sheetData><row r="${row}"/></sheetData></worksheet>`);fs.writeFileSync(path.join(root,'sparse.xlsx'),Buffer.from(zipSync(entries)));const op=operation(1);if(row===502){await assert.rejects(()=>extractDocuments(input(['sparse.xlsx']),{workspaceRoot:root,operation:op}),e=>e.details?.constrainedCategory==='rows_per_sheet');assert.equal(used(op,'total_sheets'),0);assert.equal(used(op,'total_rows'),0);}else{await extractDocuments(input(['sparse.xlsx']),{workspaceRoot:root,operation:op});assert.equal(used(op,'total_rows'),502);}}
});
