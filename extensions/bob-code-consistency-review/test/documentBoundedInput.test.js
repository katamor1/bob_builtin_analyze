const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {extractDocuments}=require('../out/analyzers/documentExtractor'),shared=require('../out/sharedProcessingBudgetRuntime');
const {createDocxFixture,createXlsxFixture}=require('../../bob-bazaar-review/test/helpers/ruleDocumentFixtures');
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bob-ccr-bounded-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function input(paths){return{schema_version:1,review:{id:'bounded',title:'bounded',change_type:'bugfix',purpose:'test',base:'a',head:'b'},artifacts:{requirements:paths.map(path=>({path}))},review_focus:[]};}
test('oversized_markdown_is_rejected_before_decode_and_emits_no_evidence',async t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'large.md'),'# REQ-001\nprivate text');const decode=require('../out/core/textEncoding');let calls=0;const original=decode.decodeTextBuffer,m=mock.method(decode,'decodeTextBuffer',(...a)=>{calls++;return original(...a);});
 try{const r=await extractDocuments(input(['large.md']),{workspaceRoot:root,limits:{maxDocumentBytes:1}});assert.equal(calls,0);assert.deepEqual([r.evidence.length,r.excerptsMarkdown],[0,'']);assert.equal(r.documents.length,1);assert.ok(r.warnings.some(x=>x.includes('maxDocumentBytes')));}finally{m.mock.restore();}
});
test('docx_xlsx_parser_arguments_are_verified_buffers',t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'rules.docx'),createDocxFixture());fs.writeFileSync(path.join(root,'rules.xlsx'),createXlsxFixture());
 const script=`const assert=require('node:assert/strict'),Module=require('node:module'),original=Module._load;let docx=0,xlsx=0;Module._load=function(request,parent,isMain){const loaded=original.call(this,request,parent,isMain);if(request==='mammoth')return{...loaded,convertToHtml(input,...args){docx++;assert.ok(Buffer.isBuffer(input.buffer));assert.equal('path' in input,false);return loaded.convertToHtml(input,...args);}};if(request==='read-excel-file/node'){const wrapped=(input,...args)=>{xlsx++;assert.ok(Buffer.isBuffer(input));return loaded(input,...args);};Object.assign(wrapped,loaded);return wrapped;}return loaded;};require(${JSON.stringify(require.resolve('../out/analyzers/documentExtractor'))}).extractDocuments(${JSON.stringify(input(['rules.docx','rules.xlsx']))},{workspaceRoot:${JSON.stringify(root)}}).then(r=>{assert.ok(docx>0);assert.ok(xlsx>0);assert.ok(r.evidence.length>0);assert.equal(r.warnings.some(x=>x.includes('failed to extract')),false);}).catch(e=>{console.error(e);process.exitCode=1;});`;
 const result=cp.spawnSync(process.execPath,['-e',script],{encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr);
});
test('source_change_after_parse_discards_all_chunks',async t=>{
 const root=fixture(t);for(const [name,bytes]of [['source.docx',createDocxFixture()],['source.xlsx',createXlsxFixture()]]){
  const filePath=path.join(root,name);fs.writeFileSync(filePath,bytes);const method=name.endsWith('docx')?'extractDocxChunks':'extractXlsxChunks',adapter=require('../out/analyzers/'+(name.endsWith('docx')?'documentDocxExtractor':'documentXlsxExtractor'));let calls=0;
  const m=mock.method(adapter,method,async buffer=>{calls++;assert.ok(Buffer.isBuffer(buffer));const changed=Buffer.from(bytes);changed[40]^=1;fs.writeFileSync(filePath,changed);return[{evidenceType:'requirement',ref:'REQ-MUTATED',text:'must discard'}];});
  try{await assert.rejects(()=>extractDocuments(input([name]),{workspaceRoot:root}),e=>e.code==='bounded_document_source_changed');assert.equal(calls,1);}finally{m.mock.restore();}
 }
});
test('fifty_mib_source_is_not_rejected_by_default_parent_budget',async t=>{
 const root=fixture(t),bytes=Buffer.alloc(50*1048576,97);Buffer.from('# REQ-FIFTY\n').copy(bytes);fs.writeFileSync(path.join(root,'large.md'),bytes);let seen;const original=shared.createReviewDocumentOperation,m=mock.method(shared,'createReviewDocumentOperation',(...args)=>{const operation=original(...args);seen=operation.profile.limits;return operation;});
 try{const r=await extractDocuments(input(['large.md']),{workspaceRoot:root,limits:{maxDocumentBytes:50*1048576}});assert.equal(seen?.single_document_bytes,50*1048576);assert.equal(seen.total_document_bytes,50*1048576);assert.equal(seen.total_operation_input_bytes,64*1048576);assert.ok(r.evidence.length>0);assert.equal(r.warnings.some(x=>x.includes('failed to extract')),false);}finally{m.mock.restore();}
});
test('valid_source_still_truncates_excerpt_and_aggregate_output',async t=>{
 const root=fixture(t);for(const name of ['one.md','two.md'])fs.writeFileSync(path.join(root,name),'# REQ-VALID\n'+'valid excerpt '.repeat(100));const r=await extractDocuments(input(['one.md','two.md']),{workspaceRoot:root,limits:{maxDocumentBytes:4096,maxExcerptBytesPerDocument:120,maxBobInputBytes:250}});assert.ok(r.evidence.length>0);assert.ok(Buffer.byteLength(r.excerptsMarkdown)<=250);assert.ok(r.evidence.every(x=>Buffer.byteLength(x.text)<=120));assert.ok(r.warnings.some(x=>x.includes('maxExcerptBytesPerDocument')));
});
