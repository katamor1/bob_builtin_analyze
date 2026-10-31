'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fsp=require('node:fs/promises');
const h=require('./helpers/boundedDocumentFixtures');
const r=()=>h.load('index');
const committed=(op,id)=>op.snapshot().categories.find(row=>row.category===id).committed;
const request=f=>({filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024});
const invalid=e=>e?.code==='bounded_document_input_invalid';

// Break: starting a new ledger for a stage loses earlier input consumption.
test('one_processing_owner_shares_document_and_operation_debits',async()=>{
 const {createProcessingOperation,normalizeProcessingBudgetProfile}=r(),op=createProcessingOperation({profile:normalizeProcessingBudgetProfile()});
 op.reserve('total_operation_input_bytes',2).commit();
 const docs=op.documents(1),f=h.fixture(Buffer.from('1234'));
 await docs.readSelection(0,request(f));op.reserve('raw_diff_bytes',3).commit();
 op.reserve('document_excerpt_bytes',5).commit();op.reserve('bob_input_bytes',6).commit();op.reserve('managed_artifact_bytes',7).commit();
 op.assertDocuments(docs);
 assert.deepEqual(['document_count','single_document_bytes','total_document_bytes','raw_diff_bytes','document_excerpt_bytes','bob_input_bytes','managed_artifact_bytes','total_operation_input_bytes'].map(id=>committed(op,id)),[1,4,4,3,5,6,7,20]);
 assert.deepEqual(docs.snapshot(),op.snapshot());assert.equal(op.snapshot().categories.every(row=>row.reserved===0),true);
});

// Break: a second initialization resets the selection count or its ownership.
test('documents_initializes_once_including_zero',()=>{
 const {createProcessingOperation,normalizeProcessingBudgetProfile}=r();
 for(const count of [0,1,128]){const op=createProcessingOperation({profile:normalizeProcessingBudgetProfile()}),docs=op.documents(count);assert.equal(docs.selectedDocumentCount,count);assert.equal(committed(op,'document_count'),count);assert.throws(()=>op.documents(0),invalid);assert.equal(committed(op,'document_count'),count);}
 const op=createProcessingOperation({profile:r().ABSOLUTE_PROCESSING_BUDGET_PROFILE});assert.equal(op.documents(1024).selectedDocumentCount,1024);
 assert.throws(()=>createProcessingOperation({profile:r().ABSOLUTE_PROCESSING_BUDGET_PROFILE}).documents(1025),e=>e?.details?.constrainedCategory==='document_count');
});

// Break: accepting a structurally identical foreign handle bypasses the aggregate.
test('cross_owner_pair_is_rejected_before_io',async()=>{
 const {createProcessingOperation,normalizeProcessingBudgetProfile}=r(),profile=normalizeProcessingBudgetProfile();
 const op=createProcessingOperation({profile}),foreign=createProcessingOperation({profile}),docs=op.documents(1),other=foreign.documents(1);
 let opens=0;const open=fsp.open,spy=mock.method(fsp,'open',async(...args)=>{opens++;return open(...args);});
 try{for(const value of [other,{...docs},Object.create(docs),null,undefined])assert.throws(()=>op.assertDocuments(value),invalid);assert.equal(opens,0);assert.equal(committed(op,'total_operation_input_bytes'),0);op.assertDocuments(docs);}finally{spy.mock.restore();}
 const f=h.fixture(Buffer.from('four'));await docs.readSelection(0,request(f));assert.equal(committed(op,'total_operation_input_bytes'),4);assert.equal(committed(foreign,'total_operation_input_bytes'),0);
});

// Break: checking methods instead of identity can invoke hostile getters or forge owners.
test('opaque_owner_rejects_forge_closed_input_and_precancel',()=>{
 const {createProcessingOperation,assertProcessingOperation,normalizeProcessingBudgetProfile}=r(),profile=normalizeProcessingBudgetProfile();
 const op=createProcessingOperation({profile});assertProcessingOperation(op);assert.equal(Object.isFrozen(op),true);assert.equal('ledger' in op,false);assert.equal('reserveForTarget' in op,false);
 let getters=0;const forged=Object.defineProperty({},'profile',{get(){getters++;throw Error('getter');}});
 for(const value of [forged,{...op},Object.create(op),null,new Proxy({},{get(){getters++;throw Error('proxy');}})])assert.throws(()=>assertProcessingOperation(value),invalid);
 for(const value of [{profile,unknown:1},Object.create({profile}),Object.defineProperty({},'profile',{get(){getters++;throw Error('getter');},enumerable:true})])assert.throws(()=>createProcessingOperation(value),invalid);
 assert.equal(getters,0);
 for(const reason of [new Error('cancel'),0,null]){const c=new AbortController();c.abort(reason);assert.throws(()=>createProcessingOperation({profile,signal:c.signal}),e=>c.signal.reason instanceof Error?e===c.signal.reason:e?.code==='bounded_document_cancelled');}
});

// Break: a second physical read of an admitted original charges its bytes twice.
test('legacy_document_admission_stays_raw_once',async()=>{
 const {createProcessingOperation,createDocumentOperation,normalizeProcessingBudgetProfile}=r(),profile=normalizeProcessingBudgetProfile(),f=h.fixture(Buffer.from('four'));
 for(const make of [()=>createDocumentOperation({profile,selectedDocumentCount:1}),()=>createProcessingOperation({profile}).documents(1)]){
  const docs=make(),admission=await docs.fingerprintSelection(0,request(f));await docs.verifyAfterExternalRead(admission);
  assert.equal(committed(docs,'single_document_bytes'),4);assert.equal(committed(docs,'total_document_bytes'),4);assert.equal(committed(docs,'total_operation_input_bytes'),4);
  await assert.rejects(()=>docs.verifyAfterExternalRead(admission),invalid);assert.equal(docs.snapshot().categories.every(row=>row.reserved===0),true);
 }
});

// Break: failed or cancelled later-stage reservations corrupt earlier committed usage.
test('processing_owner_keeps_atomic_reservations_and_cancellation',async()=>{
 const {createProcessingOperation,normalizeProcessingBudgetProfile}=r(),c=new AbortController(),op=createProcessingOperation({profile:normalizeProcessingBudgetProfile({limits:{single_document_bytes:4,total_document_bytes:4,raw_diff_bytes:4,document_excerpt_bytes:0,bob_input_bytes:0,total_operation_input_bytes:8}}),signal:c.signal});
 await op.documents(1).readSelection(0,request(h.fixture(Buffer.from('four'))));
 const pending=op.reserve('raw_diff_bytes',4);assert.equal(committed(op,'total_operation_input_bytes'),4);pending.commit();assert.equal(committed(op,'total_operation_input_bytes'),8);
 const before=op.snapshot();assert.throws(()=>op.reserve('raw_diff_bytes',1),e=>e?.code==='processing_budget_exceeded');assert.deepEqual(op.snapshot(),before);
 assert.throws(()=>op.reserve('single_document_bytes',1),e=>e?.code==='processing_budget_target_required');
 const reason=new Error('later cancellation');c.abort(reason);assert.throws(()=>op.reserve('managed_artifact_bytes',1),e=>e===reason);assert.deepEqual(op.snapshot(),before);
});
