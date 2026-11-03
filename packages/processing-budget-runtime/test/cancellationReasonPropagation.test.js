'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fsp=require('node:fs/promises'),r=require('../out'),file=require('../out/boundedDocumentFile'),h=require('./helpers/boundedDocumentFixtures'),{fakeClock}=require('./helpers/deadlineClock');
test('typed_deadline_from_read_is_not_wrapped_as_io_failure',async()=>{
 const f=h.fixture(),clock=fakeClock(),scope=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule}),open=fsp.open;const spy=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{read:async()=>{clock.set(150);scope.throwIfCancelled();}}));
 try{await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,signal:scope.signal}),e=>e===scope.signal.reason);assert.equal(h.openReservations(f.input.ledger),0);}finally{scope.dispose();spy.mock.restore();}
});
test('reason_replay_never_authenticates_deadline',async()=>{
 const f=h.fixture(),source=new AbortController(),owner=r.createProcessingOperation({profile:r.normalizeProcessingBudgetProfile(),signal:source.signal}),docs=owner.documents(1),forged=new r.ProcessingCancellationError('deadline');source.abort(forged);
 try{await assert.rejects(()=>docs.readSelection(0,{filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024}),e=>e===forged);assert.equal(r.cancellationKindFromSignal(owner.signal),'user');await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,signal:source.signal}),e=>e.code==='bounded_document_cancelled');}finally{owner.dispose();}
});
test('falsey_original_failure_survives_without_cancel',async()=>{
 for(const original of [undefined,null,0,false,'']){const f=h.fixture();let rejected=false;try{await file.withBoundedDocumentSnapshot(f.input,async()=>{throw original;});}catch(error){rejected=true;assert.equal(error,original);}assert.equal(rejected,true);assert.equal(h.openReservations(f.input.ledger),0);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);}
});
