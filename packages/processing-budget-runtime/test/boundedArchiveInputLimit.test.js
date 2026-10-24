'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');const h=require('./helpers/boundedDocumentFixtures');
test('source_and_structure_caps_reject_before_parser_without_budget_commit',async()=>{
 const api=h.load('validatedOoxml');for(const change of ['source','entries','expanded']){const f=await h.request();if(change==='source')f.request.maximumFileBytes=1;if(change==='entries')f.request.structuralLimits.maxEntries=1;if(change==='expanded')f.request.structuralLimits.maxExpandedBytes=1;let parses=0;
  await assert.rejects(()=>api.withValidatedOoxmlParserInput(f.request,async()=>{parses++;}));assert.equal(parses,0);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);
 }
});
test('trailing_deflate_crc_and_declared_expansion_are_validated_before_callback',async()=>{
 const api=h.load('validatedOoxml'),zlib=require('node:zlib');for(const entry of [
  {data:'payload',method:8,crc:1},
  {data:'payload',method:8,declaredSize:2},
  {data:'payload',method:8,compressed:Buffer.concat([zlib.deflateRawSync(Buffer.from('payload')),Buffer.from('trailing')])},
  {data:'payload',method:8,declaredSize:250*1048576+1}
 ]){const f=await h.request(h.buildZip([{name:'[Content_Types].xml',data:'types'},{name:'word/document.xml',...entry}]));await assert.rejects(()=>api.withValidatedOoxmlParserInput(f.request,async()=>assert.fail('invalid parser call')),e=>e.code==='bounded_document_archive_invalid');assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);}
});
