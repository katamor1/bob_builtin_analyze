'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const load=()=>require('../out/core/stableReviewInput');
const defaults=require('../out/core/limits').DEFAULT_REVIEW_PROCESSING_LIMITS;
const owner=(overrides,signal)=>require('../out/core/processingBudgetPipeline').createPipelineProcessingOperation(defaults,overrides,signal);
const category=(op,id='total_operation_input_bytes')=>op.snapshot().categories.find(row=>row.category===id);
function fixture(bytes='hello'){const parent=process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),root=fs.mkdtempSync(path.join(parent,'t16-stable-')),filePath=path.join(root,'input.yaml');fs.writeFileSync(filePath,bytes);return{root,filePath,maximumBytes:100,textEncoding:'utf8'};}
function wrap(handle,hooks){return new Proxy(handle,{get(target,key){if(hooks[key])return(...args)=>hooks[key](target,...args);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});}

// Break: allocating or parsing input before its root reservation bypasses the operation cap.
test('review_input_reserves_root_before_allocation_and_parse',async()=>{
 const {readStableReviewInputText}=load(),f=fixture(),op=owner(),allocate=Buffer.alloc;let observed=false;
 const spy=mock.method(Buffer,'alloc',(size,...args)=>{if(size===5){observed=true;assert.equal(category(op).reserved,5);assert.equal(category(op).committed,0);}return allocate(size,...args);});
 try{assert.equal(await readStableReviewInputText({...f,operation:op}),'hello');}finally{spy.mock.restore();}
 assert.equal(observed,true);assert.equal(category(op).committed,5);assert.equal(category(op).reserved,0);assert.equal(category(op,'total_document_bytes').committed,0);assert.equal(category(op,'document_count').committed,0);
});

// Break: summing fixture JSON plus its later retained raw diff charges the transport twice.
test('fixture_read_is_bounded_without_extra_root_debit',async()=>{
 const {readStableDiffFixtureText,readStableReviewInputText}=load(),f=fixture('日本語\n'),op=owner();
 assert.equal(await readStableDiffFixtureText({...f,maximumBytes:10}),'日本語\n');assert.equal(await readStableReviewInputText({...f,maximumBytes:10,operation:op}),'日本語\n');assert.equal(category(op).committed,10);
 await assert.rejects(()=>readStableDiffFixtureText({...f,maximumBytes:9}),/diff fixture exceeded maxBytes/);
});

// Break: partial read or same-size replacement is accepted as a complete stable snapshot.
test('stable_read_rejects_short_read_replacement_and_close_failure',async()=>{
 const {readStableReviewInputText}=load();
 for(const mode of ['short','mutate','replace','close']){
  const f=fixture(),op=owner(),open=fsp.open;let reads=0;const closeFailure=new Error('injected close failure');
  const spy=mock.method(fsp,'open',async(...args)=>wrap(await open(...args),{
   read:async(handle,...args)=>{reads++;if(mode==='short')return{bytesRead:0,buffer:args[0]};const result=await handle.read(...args);if(reads===1&&mode==='mutate'){const before=fs.statSync(f.filePath);fs.writeFileSync(f.filePath,'HELLO');fs.utimesSync(f.filePath,before.atime,before.mtime);}if(reads===1&&mode==='replace'){fs.renameSync(f.filePath,f.filePath+'.original');fs.writeFileSync(f.filePath,'hello');}return result;},
   close:async handle=>{await handle.close();if(mode==='close')throw closeFailure;}
  }));
  try{await assert.rejects(()=>readStableReviewInputText({...f,operation:op}),error=>mode==='close'?error===closeFailure:error instanceof Error);assert.equal(category(op).committed,0);assert.equal(category(op).reserved,0);}finally{spy.mock.restore();}
 }
});

// Break: a low root cap is silently raised or failure cleanup loses a falsey first cause.
test('review_input_zero_parent_and_falsey_first_failure',async()=>{
 const {readStableReviewInputText}=load(),f=fixture(),zero=owner({total_operation_input_bytes:0});
 await assert.rejects(()=>readStableReviewInputText({...f,operation:zero}),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='total_operation_input_bytes');assert.equal(category(zero).reserved,0);
 const empty=fixture('');assert.equal(await readStableReviewInputText({...empty,operation:zero}),'');
 for(const first of [undefined,null,0]){
  const op=owner(),open=fsp.open;const spy=mock.method(fsp,'open',async(...args)=>wrap(await open(...args),{read:async()=>{throw first;},close:async handle=>{await handle.close();throw Error('later close failure');}}));
  let failed=false;try{await readStableReviewInputText({...f,operation:op});}catch(error){failed=true;assert.strictEqual(error,first);}finally{spy.mock.restore();}assert.equal(failed,true);assert.equal(category(op).reserved,0);assert.equal(category(op).committed,0);
 }
});

// Break: read completion or asynchronous close commits an input after operator cancellation.
test('stable_read_cancellation_releases_before_result_adoption',async()=>{
 const {readStableReviewInputText}=load(),f=fixture(),c=new AbortController(),op=owner(undefined,c.signal),open=fsp.open,reason=new Error('cancel read');let closed=0;
 const spy=mock.method(fsp,'open',async(...args)=>wrap(await open(...args),{read:async(handle,...args)=>{const result=await handle.read(...args);c.abort(reason);return result;},close:async handle=>{closed++;return handle.close();}}));
 try{await assert.rejects(()=>readStableReviewInputText({...f,operation:op}),e=>e===reason);assert.equal(closed,1);assert.equal(category(op).committed,0);assert.equal(category(op).reserved,0);}finally{spy.mock.restore();}
});

// Break: invalid, unsafe or nonregular sources reach content allocation or JSON/YAML parsing.
test('oversize_nonregular_and_unsafe_stat_never_allocate_or_parse',async()=>{
 const {readStableReviewInputText}=load(),f=fixture(),op=owner(),allocate=Buffer.alloc;let allocated=0;
 const allocation=mock.method(Buffer,'alloc',(...args)=>{allocated++;return allocate(...args);});
 try{await assert.rejects(()=>readStableReviewInputText({...f,maximumBytes:4,operation:op}),/review-input.yaml exceeded maxDocumentBytes/);await assert.rejects(()=>readStableReviewInputText({...f,filePath:f.root,operation:op}));assert.equal(allocated,0);}finally{allocation.mock.restore();}
 const open=fsp.open,spy=mock.method(fsp,'open',async(...args)=>wrap(await open(...args),{stat:async(handle,...args)=>{const stat=await handle.stat(...args);return Object.assign(Object.create(Object.getPrototypeOf(stat)),stat,{size:9007199254740992n});}}));
 try{await assert.rejects(()=>readStableReviewInputText({...f,operation:op}));assert.equal(category(op).reserved,0);}finally{spy.mock.restore();}
 const yaml=require('yaml'),parse=yaml.parse;let parseCalls=0;const parsed=mock.method(yaml,'parse',(...args)=>{parseCalls++;return parse(...args);});
 try{await assert.rejects(()=>require('../out/core/reviewInputValidator').validateReviewInput(f.filePath,f.root,'utf8',1,{processingOperation:op}),/review-input.yaml exceeded maxDocumentBytes/);assert.equal(parseCalls,0);}finally{parsed.mock.restore();}
});

// Break: dropping a signal mismatch or forged owner creates an unaccounted read.
test('stable_input_rejects_foreign_signal_and_forged_owner_before_open',async()=>{
 const {readStableReviewInputText}=load(),f=fixture(),a=new AbortController(),b=new AbortController(),op=owner(undefined,a.signal),open=fsp.open;let opens=0;
 const spy=mock.method(fsp,'open',async(...args)=>{opens++;return open(...args);});
 try{await assert.rejects(()=>readStableReviewInputText({...f,operation:op,signal:b.signal}),e=>e.code==='bounded_document_input_invalid');await assert.rejects(()=>readStableReviewInputText({...f,operation:{...op}}),e=>e.code==='bounded_document_input_invalid');assert.equal(opens,0);}finally{spy.mock.restore();}
});
