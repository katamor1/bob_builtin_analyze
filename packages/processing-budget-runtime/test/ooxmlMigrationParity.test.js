'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const h=require('./helpers/boundedDocumentFixtures'),m2=require('./helpers/m2OoxmlBaseline');
test('all_original_preflight_adversarial_cases_pass_against_both_owners',async()=>{
 const current=h.load('ooxmlPreflight'),old=m2.baseline();
 const before=m2.adversarialCases(old.preflightOoxmlArchive),after=m2.adversarialCases(current.preflightOoxmlArchive);assert.ok(before.length>=20);assert.deepEqual(before.map(x=>x.name),after.map(x=>x.name));
 for(let i=0;i<before.length;i++){await before[i].fn();await after[i].fn();}
});
test('missing_both_only_normalizes_once_with_lazy_codec',async()=>{
 const api=h.load('validatedOoxml');for(const extra of [[],[{name:'xl/styles.xml',data:'styles'}],[{name:'xl/sharedStrings.xml',data:'strings'}],[{name:'xl/styles.xml',data:'styles'},{name:'xl/sharedStrings.xml',data:'strings'}]]){
  const f=await h.request(h.buildZip(h.entries('xlsx',extra)),'xlsx');let oldLoads=0,newLoads=0;
  const codec=h.codec(),old=m2.baseline({strToU8:codec.strToU8,zipSync:map=>{oldLoads++;return codec.zipSync(map);}});
  const before=await old.prepareOoxmlParserInput(f.filePath,f.request.expectedFingerprint,'xlsx',old.limits);f.request.loadXlsxCodec=async()=>{newLoads++;return codec;};
  const after=await api.withValidatedOoxmlParserInput(f.request,async input=>input);assert.equal(after.normalization,before.normalization);assert.deepEqual(after.parserInput,before.parserInput);assert.equal(oldLoads,extra.length===0?1:0);assert.equal(newLoads,extra.length===0?1:0);assert.deepEqual(fs.readFileSync(f.filePath),f.bytes);
 }
});
test('raw_once_accounting_preserves_current_expansion_caps',async()=>{
 const api=h.load('validatedOoxml'),MiB=1048576;
 for(const scenario of ['entry60','c10e245']){
  let list;if(scenario==='entry60')list=h.entries('docx').map((x,i)=>i===1?{...x,data:Buffer.alloc(60*MiB,97)}:x);
  else{const padding=10*MiB-262144;list=[{name:'[Content_Types].xml',data:'types'},{name:'word/document.xml',data:Buffer.alloc(245*MiB-padding-5,97),method:8},{name:'padding.bin',data:Buffer.alloc(padding,98)}];}
  let bytes=h.buildZip(list);if(scenario==='c10e245'){const comment=10*MiB-bytes.length;assert.ok(comment>=0&&comment<=65535);bytes=h.buildZip(list,{comment:Buffer.alloc(comment)});assert.equal(bytes.length,10*MiB);}
  const f=await h.request(bytes),old=m2.baseline();await old.prepareOoxmlParserInput(f.filePath,f.request.expectedFingerprint,'docx',old.limits);await api.withValidatedOoxmlParserInput(f.request,async input=>assert.equal(input.parserInput.length,bytes.length));assert.deepEqual(h.committedTriple(f.input.ledger),[bytes.length,bytes.length,bytes.length]);assert.equal(h.openReservations(f.input.ledger),0);
 }
});
