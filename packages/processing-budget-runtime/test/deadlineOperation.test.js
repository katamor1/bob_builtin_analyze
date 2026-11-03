'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),{performance}=require('node:perf_hooks'),{getEventListeners}=require('node:events'),r=require('../out'),h=require('./helpers/boundedDocumentFixtures');
const request=f=>({filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024});
const profile=()=>r.normalizeProcessingBudgetProfile();
test('one_deadline_one_ledger_one_document_owner',()=>{
 const owner=r.createProcessingOperation({profile:profile()}),document=owner.documents(0);try{assert.ok(owner.signal instanceof AbortSignal);assert.equal(document.signal,owner.signal);assert.equal(document.deadline,owner.deadline);assert.equal(document.snapshot().categories.length,13);owner.reserve('raw_diff_bytes',3).commit();assert.deepEqual(owner.snapshot(),document.snapshot());assert.throws(()=>owner.documents(0),e=>e.code==='bounded_document_input_invalid');assert.equal('ledger'in owner,false);assert.equal('scope'in owner,false);}finally{owner.dispose?.();}
});
test('default_deadline_is_120000_once',()=>{
 let now=100;const spy=mock.method(performance,'now',()=>now);let owner;try{owner=r.createProcessingOperation({profile:profile()});assert.equal(owner.deadline.expires_at_monotonic_ms,120100);now=1000;owner.reserve('raw_diff_bytes',1).release();assert.equal(owner.deadline.expires_at_monotonic_ms,120100);now=120100;assert.throws(()=>owner.documents(0),e=>e.code==='processing_cancelled'&&e.kind==='deadline');assert.equal(owner.snapshot().categories.length,13);}finally{owner?.dispose?.();spy.mock.restore();}
});
test('borrowed_dispose_keeps_owner_live',()=>{
 const source=new AbortController(),original=new Error('after borrowed disposal'),owner=r.createProcessingOperation({profile:profile(),signal:source.signal}),document=owner.documents(0);try{assert.equal(getEventListeners(source.signal,'abort').length,1);document.dispose();assert.equal(getEventListeners(source.signal,'abort').length,1);source.abort(original);assert.throws(()=>owner.throwIfCancelled(),e=>e===original);assert.equal(owner.snapshot().categories.length,13);}finally{owner.dispose?.();}assert.equal(getEventListeners(source.signal,'abort').length,0);
});
test('owned_document_dispose_releases_only_its_scope',async()=>{
 let now=100;const spy=mock.method(performance,'now',()=>now),source=new AbortController();let document;try{document=r.createDocumentOperation({profile:profile(),selectedDocumentCount:1,signal:source.signal});assert.equal(document.deadline.expires_at_monotonic_ms,120100);assert.equal(getEventListeners(source.signal,'abort').length,1);document.dispose();document.dispose();assert.equal(getEventListeners(source.signal,'abort').length,0);assert.equal(document.signal.aborted,false);now=120100;await assert.rejects(()=>document.readSelection(0,request(h.fixture())),e=>e.code==='processing_cancelled'&&e.kind==='deadline');}finally{document?.dispose?.();spy.mock.restore();}
});
test('legacy_selection_signal_is_not_shadowed',async()=>{
 const source=new AbortController(),original=new Error('selection'),f=h.fixture(),owner=r.createProcessingOperation({profile:profile()}),docs=owner.documents(1);source.abort(original);
 try{assert.ok(owner.signal instanceof AbortSignal);await assert.rejects(()=>docs.readSelection(0,{...request(f),signal:source.signal}),e=>e===original);assert.equal(owner.snapshot().categories.find(x=>x.category==='total_document_bytes').committed,0);}finally{owner.dispose?.();}
 const common=new AbortController(),explicit=r.createProcessingOperation({profile:profile(),signal:common.signal});try{const result=await explicit.documents(1).readSelection(0,{...request(f),signal:source.signal});assert.equal(result.copyBytes().toString(),f.bytes.toString());}finally{explicit.dispose?.();}
});
test('operation_error_identity_and_falsey_nonerror_are_preserved',()=>{
 for(const original of [new Error('operator'),false,0,'',null,new r.ProcessingCancellationError('deadline')]){
  const source=new AbortController(),owner=r.createProcessingOperation({profile:profile(),signal:source.signal});const before=owner.snapshot();source.abort(original);try{assert.throws(()=>owner.throwIfCancelled(),e=>original instanceof Error?e===original:e.code==='bounded_document_cancelled');assert.deepEqual(owner.snapshot(),before);}finally{owner.dispose?.();}
  assert.throws(()=>r.createProcessingOperation({profile:profile(),signal:source.signal}),e=>original instanceof Error?e===original:e.code==='bounded_document_cancelled');assert.equal(getEventListeners(source.signal,'abort').length,0);
 }
});
