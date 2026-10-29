'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fsp=require('node:fs/promises');
const h=require('./helpers/boundedDocumentFixtures');
const runtime=()=>h.load('documentBudget');
const core=()=>h.load('index');
const request=f=>({filePath:f.filePath,rootPath:f.root,maximumFileBytes:1024});
const count=report=>report.categories.find(row=>row.category==='document_count').committed;
const triple=operation=>['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>operation.snapshot().categories.find(row=>row.category===id).committed);

// Break caught: starting any selection before the whole-operation count reservation.
test('full_count_precedes_path_coercion_and_content_io',async()=>{
 const {createDocumentOperation}=runtime(),{normalizeProcessingBudgetProfile}=core();
 let io=0,coercions=0;const open=fsp.open,spy=mock.method(fsp,'open',async(...args)=>{io++;return open(...args);});
 try{
  assert.throws(()=>createDocumentOperation({selectedDocumentCount:129,profile:normalizeProcessingBudgetProfile()}),e=>e.details.constrainedCategory==='document_count');
  assert.equal(io,0);
  const operation=createDocumentOperation({selectedDocumentCount:2,profile:normalizeProcessingBudgetProfile()});assert.equal(count(operation.snapshot()),2);
  const f=h.fixture(),input={rootPath:f.root,maximumFileBytes:1024,get filePath(){coercions++;return f.filePath;}};
  await assert.rejects(()=>operation.readSelection(0,input),e=>e.code==='bounded_document_input_invalid');assert.equal(coercions,0);assert.equal(io,0);
  assert.equal(createDocumentOperation({selectedDocumentCount:1024,profile:core().ABSOLUTE_PROCESSING_BUDGET_PROFILE}).selectedDocumentCount,1024);
  assert.throws(()=>createDocumentOperation({selectedDocumentCount:1025,profile:core().ABSOLUTE_PROCESSING_BUDGET_PROFILE}),e=>e.details.constrainedCategory==='document_count');
 }finally{spy.mock.restore();}
});

// Break caught: physical-path dedup or a fingerprint reread charging zero/twice.
test('duplicate_path_selections_count_and_charge_separately',async()=>{
 const f=h.fixture(Buffer.from('1234')),operation=runtime().createDocumentOperation({selectedDocumentCount:2,profile:core().normalizeProcessingBudgetProfile({limits:{single_document_bytes:4,total_document_bytes:8}})});
 const first=await operation.fingerprintSelection(0,request(f));const second=await operation.fingerprintSelection(1,request(f));
 assert.notStrictEqual(first,second);assert.equal(first.fingerprint.sha256,second.fingerprint.sha256);assert.equal(count(operation.snapshot()),2);assert.deepEqual(triple(operation),[8,8,8]);
 await operation.verifyAfterExternalRead(first);await operation.verifyAfterExternalRead(second);assert.deepEqual(triple(operation),[8,8,8]);assert.equal(operation.snapshot().categories.every(x=>x.reserved===0),true);
});

// Break caught: allocating raw content before the actual ledger reserves its bytes.
test('raw_reservation_precedes_allocation_and_ancestors_charge_once',async()=>{
 const {ProcessingBudgetLedger,normalizeProcessingBudgetProfile}=core(),f=h.fixture(Buffer.from('1234567'));let ledger,seen=false;
 const reserve=ProcessingBudgetLedger.prototype.reserveForTarget,allocate=Buffer.alloc;
 const r=mock.method(ProcessingBudgetLedger.prototype,'reserveForTarget',function(...args){const token=reserve.apply(this,args);if(args[0]==='single_document_bytes')ledger=this;return token;});
 const a=mock.method(Buffer,'alloc',function(size,...args){if(size===7){assert.ok(ledger);assert.equal(ledger.snapshot().categories.find(x=>x.category==='total_document_bytes').reserved,7);seen=true;}return allocate(size,...args);});
 try{const operation=runtime().createDocumentOperation({selectedDocumentCount:1,profile:normalizeProcessingBudgetProfile()});const result=await operation.readSelection(0,request(f));assert.equal(seen,true);assert.equal(result.copyBytes().toString(),'1234567');const copy=result.copyBytes();copy.fill(0);assert.equal(result.copyBytes().toString(),'1234567');assert.equal(Object.isFrozen(result),true);assert.deepEqual(triple(operation),[7,7,7]);assert.equal(operation.snapshot().categories.every(x=>x.reserved===0),true);}finally{a.mock.restore();r.mock.restore();}
});

// Break caught: lowering an aggregate silently turning its failure into a leaf warning.
test('raw_exact_and_plus_one_preserve_aggregate_cause_before_allocation',async()=>{
 const {createDocumentOperation}=runtime(),{normalizeProcessingBudgetProfile}=core();
 for(const [size,total,category]of [[4,4,null],[5,4,'total_document_bytes']]){
  const f=h.fixture(Buffer.alloc(size,1)),operation=createDocumentOperation({selectedDocumentCount:1,profile:normalizeProcessingBudgetProfile({limits:{single_document_bytes:4,total_document_bytes:total}})});
  if(category){let allocations=0;const allocate=Buffer.alloc,a=mock.method(Buffer,'alloc',(n,...args)=>{if(n===size)allocations++;return allocate(n,...args);});try{await assert.rejects(()=>operation.readSelection(0,request(f)),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory===category);assert.equal(allocations,0);assert.deepEqual(triple(operation),[0,0,0]);}finally{a.mock.restore();}}
  else{await operation.readSelection(0,request(f));assert.deepEqual(triple(operation),[4,4,4]);}
 }
 const f=h.fixture(Buffer.from('1234')),operation=createDocumentOperation({selectedDocumentCount:2,profile:normalizeProcessingBudgetProfile({limits:{single_document_bytes:4,total_document_bytes:8}})});await operation.readSelection(0,request(f));await operation.readSelection(1,request(f));assert.deepEqual(triple(operation),[8,8,8]);
 const leaf=createDocumentOperation({selectedDocumentCount:1,profile:normalizeProcessingBudgetProfile({limits:{single_document_bytes:3}})});await assert.rejects(()=>leaf.readSelection(0,request(f)),e=>e.details.constrainedCategory==='single_document_bytes');
});

// Break caught: swallowing an Error reason or accepting a pre-cancelled operation.
test('operation_cancellation_keeps_error_reason_and_normalizes_non_error_without_coercion',async()=>{
 const {createDocumentOperation,assertDocumentNotCancelled}=runtime(),profile=core().normalizeProcessingBudgetProfile();
 for(const reason of [new Error('operator cancelled'),undefined,null,0,{toString(){throw Error('must not coerce');}}]){const c=new AbortController();c.abort(reason);const effective=c.signal.reason,check=e=>effective instanceof Error?e===effective:e.code==='bounded_document_cancelled';assert.throws(()=>createDocumentOperation({selectedDocumentCount:1,profile,signal:c.signal}),check);assert.throws(()=>assertDocumentNotCancelled(c.signal),check);}
 const f=h.fixture(),c=new AbortController(),operation=createDocumentOperation({selectedDocumentCount:1,profile,signal:c.signal});const reason=new Error('after admission');const admission=await operation.fingerprintSelection(0,request(f));c.abort(reason);await assert.rejects(()=>operation.verifyAfterExternalRead(admission),e=>e===reason);assert.deepEqual(triple(operation),[7,7,7]);
});
