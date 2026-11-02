'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {DEFAULT_REVIEW_PROCESSING_LIMITS:defaults,normalizeReviewProcessingLimits}=require('../out/core/limits');
const facade=()=>require('../out/sharedProcessingBudgetRuntime');
const factory=()=>require('../out/core/processingBudgetPipeline');

// Break: each direct stage normalizes a different subset of the input profile.
test('profile_validates_before_clamping_and_obeys_explicit_parent',()=>{
 const {createReviewDocumentProfile}=facade();
 const p=createReviewDocumentProfile(defaults,{total_operation_input_bytes:1000,total_sheets:2,total_rows:3});
 assert.deepEqual(['single_document_bytes','total_document_bytes','raw_diff_bytes','document_excerpt_bytes','bob_input_bytes','total_operation_input_bytes'].map(k=>p.limits[k]),[1000,1000,1000,1000,1000,1000]);
 assert.deepEqual([p.limits.sheets_per_workbook,p.limits.total_sheets,p.limits.rows_per_sheet,p.limits.total_rows],[2,2,3,3]);
 for(const overrides of [{raw_diff_bytes:10485761},{document_excerpt_bytes:8388609},{bob_input_bytes:8388609},{single_document_bytes:52428801},{total_document_bytes:268435457},{managed_artifact_bytes:67108865},{changed_files:20001},{raw_diff_bytes:-1},{raw_diff_bytes:1.5},{unknown:1}])assert.throws(()=>createReviewDocumentProfile(defaults,overrides),e=>e.code==='processing_budget_profile_invalid');
 let reads=0;const accessor=Object.defineProperty({},'raw_diff_bytes',{enumerable:true,get(){reads++;return 1;}});assert.throws(()=>createReviewDocumentProfile(defaults,accessor));assert.equal(reads,0);
});

// Break: defaults or a low root accidentally impose the archive32MiB public document limit.
test('profile_defaults_keep_public_50mib_and_bazaar_caps',()=>{
 const {createReviewDocumentProfile}=facade();
 const p=createReviewDocumentProfile(defaults);assert.deepEqual(['single_document_bytes','total_document_bytes','raw_diff_bytes','document_excerpt_bytes','bob_input_bytes','total_operation_input_bytes','managed_artifact_bytes'].map(k=>p.limits[k]),[5242880,33554432,1048576,2097152,2097152,67108864,16777216]);
 const raised=createReviewDocumentProfile(normalizeReviewProcessingLimits({maxDocumentBytes:52428800}));assert.equal(raised.limits.single_document_bytes,52428800);assert.equal(raised.limits.total_document_bytes,52428800);assert.equal(raised.limits.total_operation_input_bytes,67108864);
 const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
 const source=path.resolve(__dirname,'../../bob-bazaar-review/src/ruleAuthoring/ruleAuthoringLimits.ts'),compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}),scope={exports:{}};
 vm.runInNewContext(compiled.outputText,scope,{filename:source});
 const {DEFAULT_RULE_AUTHORING_LIMITS:b}=scope.exports;assert.deepEqual([b.maxSourceFiles,b.maxSourceBytes,b.maxAggregateSourceBytes,b.maxChunkBytes],[20,26214400,104857600,32768]);
});

// Break: a zero logical input budget is replaced by public minimums or other defaults.
test('zero_parent_clamps_all_input_children_but_not_artifact_budget',()=>{
 const {createPipelineProcessingOperation}=factory(),op=createPipelineProcessingOperation(defaults,{total_operation_input_bytes:0});
 assert.deepEqual(['single_document_bytes','total_document_bytes','raw_diff_bytes','document_excerpt_bytes','bob_input_bytes','total_operation_input_bytes'].map(k=>op.profile.limits[k]),[0,0,0,0,0,0]);assert.equal(op.profile.limits.managed_artifact_bytes,16777216);assert.equal(op.documents(0).selectedDocumentCount,0);
});

// Break: helper creates another profile or loses the operation's cancellation identity.
test('pipeline_factory_uses_the_shared_profile_and_signal',()=>{
 const {createPipelineProcessingOperation}=factory(),c=new AbortController();const op=createPipelineProcessingOperation(defaults,{raw_diff_bytes:13},c.signal);
 assert.equal(op.profile.limits.raw_diff_bytes,13);assert.ok(op.signal instanceof AbortSignal);assert.notStrictEqual(op.signal,c.signal);facade().assertProcessingOperation(op);
 const reason=new Error('cancel profile');c.abort(reason);assert.throws(()=>op.throwIfCancelled(),e=>e===reason);op.dispose();assert.throws(()=>createPipelineProcessingOperation(defaults,undefined,c.signal),e=>e===reason);
});

// A consistency-only CI job has no sibling Bazaar build output.
test('profile_defaults_are_independent_of_sibling_build_output',()=>{
 if(process.env.T16_ISOLATED_PROFILE_CHILD==='1')return;
 const {spawnSync}=require('node:child_process');
 const childCode=`const Module=require('node:module'),load=Module._load;
 Module._load=function(request,...args){if(typeof request==='string'&&request.split(String.fromCharCode(92)).join('/').includes('/bob-bazaar-review/out/'))throw new Error('Sibling compiled output is unavailable in a standalone consistency job');return load.call(this,request,...args);};
 require(${JSON.stringify(__filename)});`;
 const child=spawnSync(process.execPath,['--eval',childCode],{encoding:'utf8',env:{...process.env,T16_ISOLATED_PROFILE_CHILD:'1'}});
 assert.equal(child.status,0,child.stdout+'\n'+child.stderr);
});
