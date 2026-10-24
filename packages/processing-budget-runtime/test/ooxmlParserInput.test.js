'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises');
const h=require('./helpers/boundedDocumentFixtures');
test('callback_runs_once_only_after_complete_zip_validation',async()=>{
 const api=h.load('validatedOoxml'),f=await h.request();let calls=0;const value=await api.withValidatedOoxmlParserInput(f.request,async input=>{calls++;assert.equal(h.openReservations(f.input.ledger),1);assert.equal(Buffer.isBuffer(input.parserInput),true);return 17;});
 assert.equal(value,17);assert.equal(calls,1);assert.deepEqual(h.committedTriple(f.input.ledger),[f.bytes.length,f.bytes.length,f.bytes.length]);assert.equal(h.openReservations(f.input.ledger),0);
});
test('normal_ooxml_preserves_original_buffer_identity_without_recompression',async()=>{
 const api=h.load('validatedOoxml');for(const [kind,extra]of [['docx',[]],['xlsx',[{name:'xl/styles.xml',data:'style'}]],['xlsx',[{name:'xl/sharedStrings.xml',data:'strings'}]]]){
  const f=await h.request(h.buildZip(h.entries(kind,extra)),kind),open=fsp.open;let original,codecs=0;f.request.loadXlsxCodec=async()=>{codecs++;return h.codec();};
  const m=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{read:async(handle,...args)=>{original??=args[0];return handle.read(...args);}}));
  try{await api.withValidatedOoxmlParserInput(f.request,async input=>{assert.strictEqual(input.parserInput,original);assert.equal(input.normalization,'none');});assert.equal(codecs,0);}finally{m.mock.restore();}
 }
});
test('post_sha_rejects_same_size_mtime_restored_mutation',async()=>{
 const api=h.load('validatedOoxml'),f=await h.request(),open=fsp.open;let calls=0;
 // Return captured bigint stat on the still-open source to isolate the SHA protection from stat drift.
 const m=mock.method(fsp,'open',async(...args)=>{const handle=await open(...args),before=await handle.stat({bigint:true});return h.wrapHandle(handle,{stat:async()=>before});});
 try{await assert.rejects(()=>api.withValidatedOoxmlParserInput(f.request,async()=>{calls++;const bytes=Buffer.from(f.bytes);bytes[40]^=1;fs.writeFileSync(f.filePath,bytes);return 'invalid result';}),e=>e.code==='bounded_document_source_changed');assert.equal(calls,1);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);}finally{m.mock.restore();}
});
test('callback_bytes_mutation_does_not_replace_source_sha',async()=>{
 const api=h.load('validatedOoxml'),f=await h.request();await api.withValidatedOoxmlParserInput(f.request,async input=>{input.parserInput.fill(0);});assert.deepEqual(fs.readFileSync(f.filePath),f.bytes);assert.deepEqual(h.committedTriple(f.input.ledger),[f.bytes.length,f.bytes.length,f.bytes.length]);
});
test('invalid_archives_and_kind_mismatch_do_not_load_parser_or_codec',async()=>{
 const api=h.load('validatedOoxml');for(const bytes of [Buffer.from('not zip'),h.buildZip(h.entries('docx').map(x=>({...x,crc:1}))),h.buildZip([...h.entries('docx'),{name:'xl/workbook.xml',data:'ambiguous'}])]){
  const f=await h.request(bytes),seen={parser:0,codec:0};f.request.loadXlsxCodec=async()=>{seen.codec++;return h.codec();};await assert.rejects(()=>api.withValidatedOoxmlParserInput(f.request,async()=>{seen.parser++;}),e=>e.code==='bounded_document_archive_invalid');assert.deepEqual(seen,{parser:0,codec:0});assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);
 }
 const f=await h.request();f.request.documentKind='xlsx';await assert.rejects(()=>api.withValidatedOoxmlParserInput(f.request,async()=>assert.fail()),e=>e.code==='bounded_document_kind_mismatch');
});
