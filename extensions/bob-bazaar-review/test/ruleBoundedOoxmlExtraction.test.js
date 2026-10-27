const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const shared=require('../out/sharedProcessingBudgetRuntime'),api=require('../out/ruleAuthoring/extraction/documentExtractor');
const {createDocxFixture,createXlsxFixture}=require('./helpers/ruleDocumentFixtures');
const adapters={docx:require('../out/ruleAuthoring/extraction/docxExtractor'),xlsx:require('../out/ruleAuthoring/extraction/xlsxExtractor')};
async function fixture(t,kind,bytes){const root=await fs.mkdtemp(path.join(os.tmpdir(),'bob-bounded-ooxml-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const filePath=path.join(root,'selected.'+kind);await fs.writeFile(filePath,bytes);return{root,filePath,bytes};}
test('both_ooxml_kinds_use_shared_callback_and_discard_changed_result',async t=>{
 for(const [kind,bytes]of [['docx',createDocxFixture()],['xlsx',createXlsxFixture()]]){
  const f=await fixture(t,kind,bytes),create=shared.createRuleDocumentOperation;let callbacks=0,operation;
  const m=mock.method(shared,'createRuleDocumentOperation',(...args)=>{operation=create(...args);return operation;});
  const parser=mock.method(adapters[kind],kind==='docx'?'extractDocx':'extractXlsx',async input=>{callbacks++;assert.ok(Buffer.isBuffer(input));assert.ok(input.equals(bytes));const changed=Buffer.from(bytes);changed[40]^=1;await fs.writeFile(f.filePath,changed);return{chunks:[],status:'success',warnings:[],extractor:{id:'mutation-probe',version:'1'}};});
  try{await assert.rejects(()=>api.extractRuleDocument({filePath:f.filePath}),e=>e.code==='bounded_document_source_changed');assert.equal(callbacks,1);assert.equal(operation.snapshot().categories.find(c=>c.category==='total_document_bytes').committed,bytes.length);assert.ok(operation.snapshot().categories.every(c=>c.reserved===0));}finally{m.mock.restore();parser.mock.restore();}
 }
});
test('external_selected_source_is_allowed_within_selected_parent',async t=>{
 const f=await fixture(t,'docx',createDocxFixture()),result=await api.extractRuleDocument({filePath:f.filePath});assert.equal(result.status,'partial');assert.ok(result.chunks.length>0);assert.deepEqual(await fs.readFile(f.filePath),f.bytes);
});
test('malformed_archive_never_loads_parser_or_codec',async t=>{
 const f=await fixture(t,'xlsx',Buffer.from('not zip'));let parsers=0,codecs=0;
 const p=mock.method(adapters.xlsx,'extractXlsx',async()=>{parsers++;throw Error('parser called');}),c=mock.method(shared,'loadXlsxCodec',async()=>{codecs++;throw Error('codec called');});
 try{await assert.rejects(()=>api.extractRuleDocument({filePath:f.filePath}),e=>e.code==='bounded_document_archive_invalid');assert.deepEqual([parsers,codecs],[0,0]);}finally{p.mock.restore();c.mock.restore();}
});
test('pdf_and_legacy_keep_status_and_receive_bounded_fingerprints',async t=>{
 const create=shared.createRuleDocumentOperation,operations=[];const m=mock.method(shared,'createRuleDocumentOperation',(...args)=>{const op=create(...args);operations.push(op);return op;});
 try{for(const kind of ['doc','xls','pdf']){const f=await fixture(t,kind,Buffer.from('legacy')),r=await api.extractRuleDocument({filePath:f.filePath,pdf:{runner:async()=>({stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),exitCode:0})}});assert.equal(r.status,kind==='pdf'?'requires_ocr':'requires_conversion');}assert.equal(operations.length,3);for(const op of operations){assert.equal(op.profile.limits.single_document_bytes,25*1048576);assert.equal(op.snapshot().categories.find(c=>c.category==='total_document_bytes').committed,6);assert.ok(op.snapshot().categories.every(c=>c.reserved===0));}}finally{m.mock.restore();}
});
