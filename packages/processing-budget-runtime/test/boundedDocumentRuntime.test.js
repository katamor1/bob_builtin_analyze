'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const h=require('./helpers/boundedDocumentFixtures');
test('oversize_growth_short_read_and_path_replacement_leave_zero_budget',async()=>{
 const r=h.load();for(const mode of ['grow','short','replace']){
  const f=h.fixture(),open=fsp.open;let once=false;
  const m=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{read:async(handle,...readArgs)=>{
   if(!once){once=true;if(mode==='grow')fs.appendFileSync(f.filePath,'+');if(mode==='short')return{bytesRead:0,buffer:readArgs[0]};if(mode==='replace'){fs.renameSync(f.filePath,path.join(f.root,'old.bin'));fs.writeFileSync(f.filePath,f.bytes);}}
   return handle.read(...readArgs);
  }}));
  try{await assert.rejects(()=>r.readBoundedDocumentFile(f.input),e=>['bounded_document_source_changed','bounded_document_read_failed'].includes(e.code));assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);}finally{m.mock.restore();}
 }
});
test('close_failure_prevents_commit_and_preserves_first_thrown_value',async()=>{
 const io=h.load(),engine=h.load('boundedDocumentFile'),open=fsp.open;
 for(const first of [undefined,null,0,new Error('parser first')]){
  const f=h.fixture(),m=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{close:async(handle)=>{await handle.close();throw Error('cleanup second');}}));let caught=false;
  try{await engine.withBoundedDocumentSnapshot(f.input,async()=>{throw first;});}catch(e){caught=true;assert.strictEqual(e,first);}finally{m.mock.restore();}
  assert.equal(caught,true);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);
 }
 const f=h.fixture(),m=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{close:async(handle)=>{await handle.close();throw Error('close');}}));
 try{await assert.rejects(()=>io.readBoundedDocumentFile(f.input),e=>e.code==='bounded_document_cleanup_failed');assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);}finally{m.mock.restore();}
});
test('callback_result_is_rejected_on_source_change_and_cancellation',async()=>{
 const engine=h.load('boundedDocumentFile');
 for(const mode of ['content','named','cancel']){const f=h.fixture(),controller=new AbortController();f.input.signal=controller.signal;
  await assert.rejects(()=>engine.withBoundedDocumentSnapshot(f.input,async()=>{if(mode==='cancel')controller.abort();else if(mode==='named'){fs.renameSync(f.filePath,path.join(f.root,'old'));fs.writeFileSync(f.filePath,f.bytes);}else{const before=fs.statSync(f.filePath);fs.writeFileSync(f.filePath,'mutated');fs.utimesSync(f.filePath,before.atime,before.mtime);}return 'must not escape';}),e=>['bounded_document_cancelled','bounded_document_source_changed'].includes(e.code));
  assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);
 }
});
