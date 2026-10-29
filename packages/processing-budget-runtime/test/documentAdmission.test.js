'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
const h=require('./helpers/boundedDocumentFixtures');
const runtime=()=>h.load('documentBudget'),profile=()=>h.load('index').normalizeProcessingBudgetProfile();
const request=f=>({filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024});
const operation=n=>runtime().createDocumentOperation({selectedDocumentCount:n,profile:profile()});
const triple=op=>['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>op.snapshot().categories.find(row=>row.category===id).committed);

// Break caught: letting arbitrary snapshots or another operation consume an admission.
test('admission_rejects_forge_cross_operation_out_of_range_reuse_and_concurrency_before_io',async()=>{
 const f=h.fixture(),a=operation(2),b=operation(1),admission=await a.fingerprintSelection(0,request(f));let opens=0;const open=fsp.open,s=mock.method(fsp,'open',async(...args)=>{opens++;return open(...args);});
 try{
  for(const forged of [{...admission},{fingerprint:admission.fingerprint},null])await assert.rejects(()=>a.verifyAfterExternalRead(forged),e=>e.code==='bounded_document_input_invalid');
  await assert.rejects(()=>b.verifyAfterExternalRead(admission),e=>e.code==='bounded_document_input_invalid');
  for(const index of [-1,2,NaN,Infinity,'1'])await assert.rejects(()=>a.fingerprintSelection(index,request(f)),e=>e.code==='bounded_document_input_invalid');
  await assert.rejects(()=>a.fingerprintSelection(0,request(f)),e=>e.code==='bounded_document_input_invalid');assert.equal(opens,0);
  const first=a.verifyAfterExternalRead(admission);await assert.rejects(()=>a.verifyAfterExternalRead(admission),e=>e.code==='bounded_document_input_invalid');await first;
  const before=opens;await assert.rejects(()=>a.verifyAfterExternalRead(admission),e=>e.code==='bounded_document_input_invalid');assert.equal(opens,before);
 }finally{s.mock.restore();}
});

// Break caught: an unbounded user name/identity or a caller skip switch becoming trusted.
test('admission_freezes_identity_and_has_bounded_digest_targets',async()=>{
 const f=h.fixture(),a=operation(1),admission=await a.fingerprintSelection(0,request(f));assert.equal(Object.isFrozen(admission),true);assert.equal(Object.isFrozen(admission.fingerprint),true);
 assert.throws(()=>{admission.fingerprint.sha256='0'.repeat(64);},TypeError);assert.throws(()=>{admission.filePath='other';},TypeError);
 const targets=a.snapshot().targets;assert.equal(targets.length,1);assert.ok(Buffer.byteLength(targets[0].target,'utf8')<=256);assert.equal(targets[0].target.includes(f.filePath),false);
 for(const extra of [{target:'forged'},{ledger:f.input.ledger},{expectedFingerprint:admission.fingerprint},{skipCharge:true},{parserInput:Buffer.from('forged')}])await assert.rejects(()=>operation(1).fingerprintSelection(0,{...request(f),...extra}),e=>e.code==='bounded_document_input_invalid');
});

// Break caught: reusing a size/mtime-only check, omitting named-path checks, or rolling raw back.
test('normal_t14_failure_releases_but_admitted_raw_survives_later_failure',async()=>{
 const engine=h.load('boundedDocumentFile');
 for(const first of [undefined,null,0,new Error('first')]){const f=h.fixture();let caught=false;try{await engine.withBoundedDocumentSnapshot(f.input,async()=>{throw first;});}catch(e){caught=true;assert.strictEqual(e,first);}assert.equal(caught,true);assert.deepEqual(h.committedTriple(f.input.ledger),[0,0,0]);}
 for(const mode of ['content','named','close']){const f=h.fixture(),a=operation(1),admission=await a.fingerprintSelection(0,request(f));let spy;
  if(mode==='content'){const before=fs.statSync(f.filePath);fs.writeFileSync(f.filePath,'mutated');fs.utimesSync(f.filePath,before.atime,before.mtime);}
  if(mode==='named'){fs.renameSync(f.filePath,path.join(f.root,'retained'));fs.writeFileSync(f.filePath,f.bytes);}
  if(mode==='close'){const open=fsp.open;spy=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{close:async handle=>{await handle.close();throw Error('cleanup');}}));}
  try{await assert.rejects(()=>a.verifyAfterExternalRead(admission),e=>e.code===(mode==='close'?'bounded_document_cleanup_failed':'bounded_document_source_changed'));assert.deepEqual(triple(a),[7,7,7]);assert.equal(a.snapshot().categories.every(x=>x.reserved===0),true);await assert.rejects(()=>a.verifyAfterExternalRead(admission),e=>e.code==='bounded_document_input_invalid');}finally{spy?.mock.restore();}
 }
});

// Break caught: commit before close, or a failed slot remaining available for another read.
test('fingerprint_close_failure_releases_raw_and_consumes_the_selection_slot',async()=>{
 const f=h.fixture(),a=operation(1),open=fsp.open,s=mock.method(fsp,'open',async(...args)=>h.wrapHandle(await open(...args),{close:async handle=>{await handle.close();throw Error('cleanup');}}));
 try{await assert.rejects(()=>a.fingerprintSelection(0,request(f)),e=>e.code==='bounded_document_cleanup_failed');assert.deepEqual(triple(a),[0,0,0]);assert.equal(a.snapshot().categories.every(x=>x.reserved===0),true);}finally{s.mock.restore();}
 await assert.rejects(()=>a.fingerprintSelection(0,request(f)),e=>e.code==='bounded_document_input_invalid');
});

// Break caught: returning a fingerprint/snapshot after cancellation at its commit boundary.
test('cancellation_at_raw_commit_discards_fingerprint_and_snapshot_but_keeps_usage',async t=>{
 const {ProcessingBudgetLedger}=h.load('index');
 for(const method of ['fingerprintSelection','readSelection'])await t.test(method,async()=>{
  const f=h.fixture(),c=new AbortController(),reason=new Error('cancel at commit'),a=runtime().createDocumentOperation({selectedDocumentCount:1,profile:profile(),signal:c.signal}),reserve=ProcessingBudgetLedger.prototype.reserveForTarget;
  const s=mock.method(ProcessingBudgetLedger.prototype,'reserveForTarget',function(...args){const token=reserve.apply(this,args);return args[0]!=='single_document_bytes'?token:Object.freeze({...token,commit(actual){token.commit(actual);c.abort(reason);}});});
  try{await assert.rejects(()=>a[method](0,request(f)),e=>e===reason);assert.deepEqual(triple(a),[7,7,7]);assert.equal(a.snapshot().categories.every(x=>x.reserved===0),true);}finally{s.mock.restore();}
 });
});
