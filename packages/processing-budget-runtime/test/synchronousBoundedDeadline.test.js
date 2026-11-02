'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fsp=require('node:fs/promises'),r=require('../out'),h=require('./helpers/boundedDocumentFixtures'),{fakeClock}=require('./helpers/deadlineClock');
const scoped=clock=>r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});
test('trusted_expiry_between_read_chunks_before_timer',async()=>{
 const f=h.fixture(Buffer.from('abcdef')),clock=fakeClock(),scope=scoped(clock),open=fsp.open;let reads=0,closes=0;
 const spy=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{read:async(handle,buffer,offset,length,position)=>{reads++;const result=await handle.read(buffer,offset,1,position);clock.set(150);return result;},close:async handle=>{closes++;return handle.close();}}));
 try{await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,signal:scope.signal}),e=>e.code==='processing_cancelled'&&e.kind==='deadline');assert.equal(reads,1);assert.equal(closes,1);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);assert.equal(h.openReservations(f.input.ledger),0);}finally{scope.dispose();spy.mock.restore();}
});
test('expiry_after_stat_prevents_any_reservation',async()=>{
 const f=h.fixture(),clock=fakeClock(),scope=scoped(clock),open=fsp.open;const spy=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{stat:async(handle,...options)=>{const stat=await handle.stat(...options);clock.set(150);return stat;}}));
 try{await assert.rejects(()=>r.readBoundedDocumentFile({...f.input,signal:scope.signal}),e=>e.code==='processing_cancelled');assert.equal(h.events(f.input.ledger).filter(e=>e[0]==='reserve').length,0);}finally{scope.dispose();spy.mock.restore();}
});
test('workbook_group_commits_only_after_last_check',()=>{
 for(const cancelled of [false,true]){const clock=fakeClock(),scope=scoped(clock),budget=new r.ProcessingBudgetLedger(),reserve=r.ProcessingBudgetLedger.prototype.reserveForTarget;let reservations=0,commits=0,lastCheck=false;
  const spy=mock.method(r.ProcessingBudgetLedger.prototype,'reserveForTarget',function(...args){const token=reserve.apply(this,args);reservations++;return Object.freeze({...token,commit(actual){assert.equal(lastCheck,true);commits++;return token.commit(actual);}});});
  const action=()=>r.commitWorkbookBudget({ledger:budget,workbookTarget:'book',sheets:[{name:'one',rowCount:1},{name:'two',rowCount:2}],cancellation:()=>{if(reservations===3){assert.equal(commits,0);lastCheck=true;if(cancelled)clock.set(150);}scope.throwIfCancelled();}});
  try{if(cancelled){assert.throws(action,e=>e.kind==='deadline');assert.equal(commits,0);assert.equal(budget.snapshot().categories.every(x=>x.reserved===0&&x.committed===0),true);}else{assert.deepEqual([action().sheetCount,commits],[2,3]);}}finally{scope.dispose();spy.mock.restore();}
 }
});

test('workbook_xml_enumeration_refreshes_before_adoption',()=>{const clock=fakeClock(),scope=scoped(clock),workbook=require('../out/workbookBudget'),observer=workbook.createXlsxInspectionObserver(()=>scope.throwIfCancelled()),decode=TextDecoder.prototype.decode;const spy=mock.method(TextDecoder.prototype,'decode',function(...args){const text=decode.apply(this,args);clock.set(150);return text;});try{assert.throws(()=>observer.observeEntry('xl/workbook.xml',Buffer.from('<workbook><sheets/></workbook>')),e=>e.code==='processing_cancelled');}finally{scope.dispose();spy.mock.restore();}});
