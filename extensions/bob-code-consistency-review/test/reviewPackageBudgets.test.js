'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const runtime=require('../out/shared-processing-budget-runtime');
const make=overrides=>runtime.createProcessingOperation({profile:runtime.normalizeProcessingBudgetProfile(overrides)});
const api=()=>require('../out/core/reviewPackageBudgets');
const state=(op,id)=>op.snapshot().categories.find(row=>row.category===id);

// Break: classifying a new metadata placeholder as optional discards required review information.
test('mandatory_metadata_is_default_and_only_five_bulk_keys_clip',()=>{
 const result=api().assembleMandatoryFirstBobInput({maximumBytes:120,template:'BEGIN\n{{metadata}}\n{{document_excerpts}}\nEND\n',values:{metadata:'must survive',document_excerpts:'line one\nline two\n'.repeat(50)},truncatableKeys:['document_excerpts']});
 assert.ok(result.text.includes('must survive'));assert.ok(result.text.endsWith('END\n'));assert.ok(result.truncated);assert.equal(result.retainedBytes,Buffer.byteLength(result.text,'utf8'));assert.ok(result.retainedBytes<=120);
 assert.throws(()=>api().assembleMandatoryFirstBobInput({maximumBytes:64,template:'{{future_metadata}}{{document_excerpts}}',values:{future_metadata:'x'.repeat(65),document_excerpts:'optional'},truncatableKeys:['document_excerpts']}),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='bob_input_bytes'&&e.details.observed===65);
});

// Break: adding the clipping warning silently truncates mandatory checks on the second assembly.
test('final_warning_growth_never_truncates_mandatory_metadata',()=>{
 const options={maximumBytes:120,template:'START\n{{deterministic_checks}}\n{{document_excerpts}}\nEND\n',values:{deterministic_checks:'ok',document_excerpts:'line\n'.repeat(200)},truncatableKeys:['document_excerpts']};assert.equal(api().assembleMandatoryFirstBobInput(options).truncated,true);
 assert.throws(()=>api().assembleMandatoryFirstBobInput({...options,values:{...options.values,deterministic_checks:'warning '.repeat(30)}}),e=>e.code==='processing_budget_exceeded'&&e.details.constrainedCategory==='bob_input_bytes');
});

// Break: a full optional source is joined into the template before bounded assembly.
test('bob_original_count_does_not_render_unbounded_template',()=>{
 const source='line\n'.repeat(200000),join=Array.prototype.join;let unbounded=0;
 Array.prototype.join=function(...args){if(this.some(part=>part===source))unbounded++;return join.apply(this,args);};
 [source].join('');assert.equal(unbounded,1);unbounded=0;
 try{const result=api().assembleMandatoryFirstBobInput({maximumBytes:128,template:'HEAD\n{{document_excerpts}}\nEND\n',values:{document_excerpts:source},truncatableKeys:['document_excerpts']});assert.equal(result.originalBytes,1000010);assert.ok(result.retainedBytes<=128);assert.equal(unbounded,0);}finally{Array.prototype.join=join;}
});

// Break: mandatory exact/+1 or an exhausted aggregate bypasses the shared leaf and parent caps.
test('bob_default_absolute_exact_plus_one_and_parent_reservation',()=>{
 for(const [profile,limit]of [[undefined,2097152],[{limits:runtime.PROCESSING_BUDGET_ABSOLUTE_MAXIMA},8388608]]){
  const op=make(profile),options={operation:op,maximumBytes:limit,template:'{{mandatory}}',values:{mandatory:'x'.repeat(limit)},truncatableKeys:[]},result=api().reserveMandatoryFirstBobInput(options);assert.equal(result.retainedBytes,limit);assert.equal(state(op,'bob_input_bytes').reserved,limit);result.reservation.commit();assert.equal(state(op,'total_operation_input_bytes').committed,limit);
  const over=make(profile);assert.throws(()=>api().reserveMandatoryFirstBobInput({...options,operation:over,values:{mandatory:'x'.repeat(limit+1)}}),e=>e.code==='processing_budget_exceeded'&&e.details.limit===limit&&e.details.observed===limit+1);assert.equal(state(over,'bob_input_bytes').used,0);
 }
 const parent=make({limits:{single_document_bytes:0,total_document_bytes:0,document_excerpt_bytes:0,raw_diff_bytes:100,bob_input_bytes:100,total_operation_input_bytes:100}});parent.reserve('raw_diff_bytes',60).commit();const before=parent.snapshot();assert.throws(()=>api().reserveMandatoryFirstBobInput({operation:parent,maximumBytes:100,template:'{{metadata}}',values:{metadata:'x'.repeat(50)},truncatableKeys:[]}),e=>e.details.constrainedCategory==='total_operation_input_bytes'&&e.details.observed===110);assert.deepEqual(parent.snapshot(),before);
});

// Break: duplicate or absent optional keys hide typos, and a zero budget clips literal metadata.
test('bob_rejects_invalid_optional_keys_and_preserves_zero_budget_semantics',()=>{
 for(const keys of [['missing'],['document_excerpts','document_excerpts']])assert.throws(()=>api().assembleMandatoryFirstBobInput({maximumBytes:100,template:'{{document_excerpts}}',values:{document_excerpts:''},truncatableKeys:keys}));
 assert.throws(()=>api().assembleMandatoryFirstBobInput({maximumBytes:0,template:'required',values:{},truncatableKeys:[]}),e=>e.code==='processing_budget_exceeded'&&e.details.limit===0);
 assert.equal(api().assembleMandatoryFirstBobInput({maximumBytes:0,template:'',values:{},truncatableKeys:[]}).retainedBytes,0);
});
