'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadRuntime}=require('./helpers');
function runtime(){return {...loadRuntime('generatedProcessingBudgetDefinition'),...loadRuntime('processingBudgetProfile'),...loadRuntime('processingBudgetError'),...loadRuntime('processingBudgetLedger')};}
function error(code){return e=>{assert.equal(e.code,'processing_budget_'+code);assert.ok(Buffer.byteLength(e.message)<=512);assert.ok(Object.isFrozen(e.details));return true;};}
function row(l,id){return l.snapshot().categories.find(x=>x.category===id);}
function reserve(l,c,n,target='t'){return ['single_document_bytes','sheets_per_workbook','rows_per_sheet'].includes(c)?l.reserveForTarget(c,target,n):l.reserve(c,n);}
test('reservation_chain_is_atomic_under_shared_ancestor_contention',()=>{
 const r=runtime(),limits=Object.fromEntries(r.PROCESSING_BUDGET_CATEGORY_IDS.map(c=>[c,10]));
 const l=new r.ProcessingBudgetLedger({limits});
 const a=l.reserveForTarget('single_document_bytes','a',6),b=l.reserve('raw_diff_bytes',4);
 const before=l.snapshot();assert.throws(()=>l.reserveForTarget('single_document_bytes','new',1),error('exceeded'));assert.deepEqual(l.snapshot(),before);
 b.release();const c=l.reserveForTarget('single_document_bytes','b',4);a.commit(3);c.commit();
 assert.equal(row(l,'total_document_bytes').committed,7);assert.equal(row(l,'total_operation_input_bytes').committed,7);
 assert.equal(row(l,'raw_diff_bytes').used,0);l.reserve('managed_artifact_bytes',10).commit();assert.equal(row(l,'total_operation_input_bytes').used,7);
 for(const profile of [r.DEFAULT_PROCESSING_BUDGET_PROFILE,r.ABSOLUTE_PROCESSING_BUDGET_PROFILE])for(const id of r.PROCESSING_BUDGET_CATEGORY_IDS){
  const x=new r.ProcessingBudgetLedger(profile),n=profile.limits[id],p=reserve(x,id,n);assert.equal(row(x,id).reserved,n);
  const old=x.snapshot();assert.throws(()=>reserve(x,id,1),error('exceeded'));assert.deepEqual(x.snapshot(),old);p.commit();assert.equal(row(x,id).committed,n);
 }
 const x=new r.ProcessingBudgetLedger();x.reserve('changed_files',1).commit();assert.throws(()=>x.reserve('changed_files',Number.MAX_SAFE_INTEGER),e=>{assert.equal(e.code,'processing_budget_exceeded');assert.equal(e.details.observed,undefined);return true;});
});
test('invalid_commit_stays_open_and_releasable',()=>{
 const r=runtime(),l=new r.ProcessingBudgetLedger(),p=l.reserveForTarget('single_document_bytes','a',10);
 for(const n of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,11,'1',null]){const before=l.snapshot();assert.throws(()=>p.commit(n),error('commit_invalid'));assert.deepEqual(l.snapshot(),before);}
 p.release();assert.equal(l.snapshot().targets.length,0);assert.equal(row(l,'total_operation_input_bytes').used,0);
 assert.throws(()=>p.release(),error('reservation_finalized'));assert.throws(()=>p.commit(),error('reservation_finalized'));
 const q=l.reserve('bob_input_bytes',10);q.commit(4);assert.equal(row(l,'bob_input_bytes').used,4);assert.throws(()=>q.commit(0),error('reservation_finalized'));
 const z=l.reserveForTarget('rows_per_sheet','zero',0);assert.equal(l.snapshot().targets.length,0);l.reserveForTarget('rows_per_sheet','zero',2).commit();z.release();assert.equal(row(l,'total_rows').committed,2);
 for(const n of [-1,0.2,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1',null])assert.throws(()=>l.reserve('changed_files',n),error('reservation_invalid'));
 assert.ok(Object.isFrozen(l)&&Object.isFrozen(q));
});
test('target_summary_utf8_order_and_old_snapshot_are_correct',()=>{
 const r=runtime(),l=new r.ProcessingBudgetLedger({limits:{rows_per_sheet:2}}),old=l.snapshot();
 for(const t of ['\u{10000}','\ue000','z'])l.reserveForTarget('rows_per_sheet',t,2).commit();
 const s=l.snapshot(),sum=row(l,'rows_per_sheet');assert.equal(sum.used,6);assert.equal(sum.limit,2);assert.equal(sum.target_count,3);assert.equal(Object.hasOwn(sum,'remaining'),false);
 assert.deepEqual(s.targets.map(x=>x.target),['z','\ue000','\u{10000}']);assert.equal(old.targets.length,0);
 assert.ok(Object.isFrozen(s)&&Object.isFrozen(s.categories)&&Object.isFrozen(s.targets)&&s.targets.every(Object.isFrozen)&&s.categories.every(Object.isFrozen));
 assert.deepEqual(s.categories.map(x=>x.category),r.PROCESSING_BUDGET_CATEGORY_IDS);
 const utf=new r.ProcessingBudgetLedger();utf.reserveForTarget('rows_per_sheet','😀'.repeat(64),1).release();
 utf.reserveForTarget('rows_per_sheet','x'.repeat(256),1).release();utf.reserveForTarget('rows_per_sheet','\ud800'.repeat(85),1).release();
 for(const t of ['',null,3,'😀'.repeat(64)+'x','x'.repeat(257),'\ud800'.repeat(86)]){const before=utf.snapshot();assert.throws(()=>utf.reserveForTarget('rows_per_sheet',t,1),error('target_invalid'));assert.deepEqual(utf.snapshot(),before);}
 for(const t of ['a/../b','b','é','e\u0301'])utf.reserveForTarget('rows_per_sheet',t,1).commit();assert.equal(utf.snapshot().targets.length,4);
});
test('forged_receiver_and_diagnostics_do_not_gain_authority',()=>{
 const r=runtime(),l=new r.ProcessingBudgetLedger();let calls=0;const evil={toString(){calls++;throw Error('coercion')},valueOf(){calls++;throw Error('coercion')}};
 for(const v of [evil,'x'.repeat(1000000),Symbol('x'),null,'__proto__']){assert.throws(()=>l.reserve(v,1),error('category_invalid'));assert.throws(()=>l.reserveForTarget(v,'t',1),error('category_invalid'));}
 assert.throws(()=>l.reserve('single_document_bytes',1),error('target_required'));assert.throws(()=>l.reserveForTarget('changed_files','t',1),error('target_invalid'));
 assert.throws(()=>l.reserve('changed_files',evil),error('reservation_invalid'));assert.throws(()=>l.reserveForTarget('rows_per_sheet',evil,1),error('target_invalid'));
 const p=l.reserve('changed_files',1);assert.throws(()=>p.commit(evil),error('commit_invalid'));p.release();assert.equal(calls,0);
 for(const fn of [()=>l.snapshot.call({}),()=>l.reserve.call({},'changed_files',1),()=>l.reserveForTarget.call({},'rows_per_sheet','t',1),()=>Object.getOwnPropertyDescriptor(r.ProcessingBudgetLedger.prototype,'profile').get.call({})])assert.throws(fn,TypeError);
 assert.equal(row(l,'changed_files').used,0);
});
test('ledger_invariants_hold_for_deterministic_64_step_sequences',()=>{
 const r=runtime();
 const chains={single_document_bytes:['total_document_bytes','total_operation_input_bytes'],total_document_bytes:['total_operation_input_bytes'],document_count:[],sheets_per_workbook:['total_sheets'],total_sheets:[],rows_per_sheet:['total_rows'],total_rows:[],changed_files:[],raw_diff_bytes:['total_operation_input_bytes'],document_excerpt_bytes:['total_operation_input_bytes'],bob_input_bytes:['total_operation_input_bytes'],managed_artifact_bytes:[],total_operation_input_bytes:[]};
 for(const category of Object.keys(chains)){
  const l=new r.ProcessingBudgetLedger({limits:Object.fromEntries(Object.keys(chains).map(id=>[id,20]))});let committed=0;const open=[];
  for(let i=0;i<64;i++){
   if(i%4<2){const amount=1+(i%7),before=l.snapshot(),reserved=open.reduce((s,x)=>s+x.amount,0);if(committed+reserved+amount>20){assert.throws(()=>reserve(l,category,amount),error('exceeded'));assert.deepEqual(l.snapshot(),before);}else open.push({amount,token:reserve(l,category,amount)});}
   else if(open.length){const x=open.shift();if(i%4===2){const actual=Math.floor(x.amount/2);x.token.commit(actual);committed+=actual;}else x.token.release();}
   const s=l.snapshot(),reserved=open.reduce((n,x)=>n+x.amount,0);
   for(const id of [category,...chains[category]]){const x=s.categories.find(x=>x.category===id);assert.equal(x.committed,committed);assert.equal(x.reserved,reserved);assert.equal(x.used,committed+reserved);}
   for(const x of [...s.categories,...s.targets]){assert.ok(Number.isSafeInteger(x.used)&&x.used>=0);assert.equal(x.used,x.committed+x.reserved);if(x.scope!=='target')assert.ok(x.used<=x.limit);}
  }
  for(const x of open)x.token.release();
 }
});
