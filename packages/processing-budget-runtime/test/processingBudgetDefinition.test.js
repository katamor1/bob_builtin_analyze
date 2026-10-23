'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadRuntime}=require('./helpers');
function runtime(){return {...loadRuntime('generatedProcessingBudgetDefinition'),...loadRuntime('processingBudgetProfile'),...loadRuntime('processingBudgetError')};}
function invalid(r,fn){assert.throws(fn,e=>{assert.ok(e instanceof r.ProcessingBudgetError);assert.equal(e.code,'processing_budget_profile_invalid');assert.ok(Buffer.byteLength(e.message,'utf8')<=512);assert.ok(Object.isFrozen(e.details));return true;});}
test('profiles_snapshot_closed_own_data_without_getter_or_coercion',()=>{
 const r=runtime(),n=r.normalizeProcessingBudgetProfile;
 const source={limits:{document_count:19}},p=n(source);source.limits.document_count=1;
 assert.equal(p.limits.document_count,19);assert.equal(Object.getPrototypeOf(p.limits),null);
 assert.ok(Object.isFrozen(p)&&Object.isFrozen(p.limits));assert.notEqual(p,n());
 assert.deepEqual(Object.keys(p.limits),r.PROCESSING_BUDGET_CATEGORY_IDS);
 assert.deepEqual({...r.DEFAULT_PROCESSING_BUDGET_PROFILE.limits},r.PROCESSING_BUDGET_DEFAULT_LIMITS);
 assert.deepEqual({...r.ABSOLUTE_PROCESSING_BUDGET_PROFILE.limits},r.PROCESSING_BUDGET_ABSOLUTE_MAXIMA);
 let calls=0;const evil={toString(){calls++;throw Error('coercion')},valueOf(){calls++;throw Error('coercion')}};
 for(const value of [null,[],7,'profile',Object.create({limits:{document_count:1}}),{schema_version:evil},{limits:{document_count:evil}}, {[Symbol('x')]:1},Object.defineProperty({},'limits',{get(){calls++;throw Error('getter')},enumerable:true}),{limits:Object.defineProperty({},'document_count',{get(){calls++;return 3},enumerable:true})},{limits:Object.defineProperty({},'document_count',{value:3})}])invalid(r,()=>n(value));
 for(const trap of ['getPrototypeOf','ownKeys','getOwnPropertyDescriptor']){const value=new Proxy({limits:{}},{[trap](){throw evil}});invalid(r,()=>n(value));}
 const revoked=Proxy.revocable({},{});revoked.revoke();invalid(r,()=>n(revoked.proxy));
 assert.equal(calls,0);
});
test('profiles_reject_invalid_limits_and_child_parent_violations',()=>{
 const r=runtime(),n=r.normalizeProcessingBudgetProfile;
 for(const id of r.PROCESSING_BUDGET_CATEGORY_IDS){
  const limits={...r.PROCESSING_BUDGET_ABSOLUTE_MAXIMA};assert.equal(n({limits}).limits[id],limits[id]);
  for(const value of [-1,0.25,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,limits[id]+1,'1',null])invalid(r,()=>n({limits:{...limits,[id]:value}}));
 }
 const zero=Object.fromEntries(r.PROCESSING_BUDGET_CATEGORY_IDS.map(id=>[id,0]));assert.ok(Object.values(n({limits:zero}).limits).every(v=>v===0));
 for(const c of r.PROCESSING_BUDGET_DEFINITION.filter(x=>x.aggregateInto)) invalid(r,()=>n({limits:{...zero,[c.id]:1}}));
 invalid(r,()=>n({limits:{unknown:1}}));invalid(r,()=>n({schema_version:'processing-budget-profile/v2'}));
});
test('current_bazaar_explicit_profile_preserves_20_25_100',()=>{
 const r=runtime(),p=r.normalizeProcessingBudgetProfile({limits:{single_document_bytes:26214400,total_document_bytes:104857600,document_count:20,total_operation_input_bytes:268435456}});
 assert.equal(p.limits.document_count,20);assert.equal(p.limits.single_document_bytes,26214400);assert.equal(p.limits.total_document_bytes,104857600);assert.equal(p.limits.total_operation_input_bytes,268435456);
 assert.equal(r.DEFAULT_PROCESSING_BUDGET_PROFILE.limits.single_document_bytes,5242880);
});
test('api_errors_are_typed_and_bounded',()=>{
 const r=runtime(),huge='x'.repeat(1000000);
 invalid(r,()=>r.normalizeProcessingBudgetProfile({[huge]:1}));
 invalid(r,()=>r.normalizeProcessingBudgetProfile({limits:{[huge]:1}}));
});
