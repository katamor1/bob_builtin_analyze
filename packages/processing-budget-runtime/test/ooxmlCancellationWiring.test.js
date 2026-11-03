'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),r=require('../out'),preflight=require('../out/ooxmlPreflight'),h=require('./helpers/boundedDocumentFixtures');
test('validated_public_and_admitted_ooxml_forward_effective_signal',async()=>{
 const f=await h.request(),source=new AbortController(),owner=r.createProcessingOperation({profile:r.normalizeProcessingBudgetProfile(),signal:source.signal}),docs=owner.documents(1),original=preflight.preflightOoxmlArchive,signals=[];const spy=mock.method(preflight,'preflightOoxmlArchive',async(bytes,limits,options)=>{signals.push(options?.signal);return original(bytes,limits,options);});
 try{await require("../out/validatedOoxml").withValidatedOoxmlParserInput({...f.request,signal:owner.signal},async input=>assert.ok(Buffer.isBuffer(input.parserInput)));const admission=await docs.fingerprintSelection(0,{filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024});await docs.withValidatedOoxml(admission,{documentKind:'docx',structuralLimits:{maxEntries:5000,maxExpandedBytes:250*1048576},loadXlsxCodec:async()=>h.codec()},async input=>assert.ok(Buffer.isBuffer(input.parserInput)));assert.deepEqual(signals,[owner.signal,owner.signal]);}finally{owner.dispose();spy.mock.restore();}
});
test('raw_preflight_does_not_accept_request_callbacks',async()=>{
 let callbacks=0;await assert.rejects(()=>preflight.preflightOoxmlArchive(h.buildZip(h.entries()),{maxOoxmlEntries:5000,maxOoxmlDeclaredUncompressedBytes:250*1048576},{check:()=>callbacks++}),e=>e.code==='bounded_document_input_invalid');assert.equal(callbacks,0);assert.equal(r.preflightOoxmlArchive,undefined);
});
