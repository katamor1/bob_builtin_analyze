'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {collectGitDiff}=require('../out/core/gitDiffCollector');
const {createPipelineProcessingOperation}=require('../out/core/processingBudgetPipeline');
const defaults=require('../out/core/limits').DEFAULT_REVIEW_PROCESSING_LIMITS;
function fixture(bytes){const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t16-diff-fixture-')),filePath=path.join(root,'diff.json');fs.writeFileSync(filePath,bytes);return{workspaceRoot:root,diffFixturePath:filePath};}

// Break: raw fixture allocation/JSON parse occurs before its transport cap check.
test('oversized_diff_fixtures_are_rejected_before_json_parsing',async()=>{
 const f=fixture(Buffer.alloc(257,0x7b));await assert.rejects(()=>collectGitDiff({review:{vcs:'git',base:'main',head:'feature'}},{...f,limits:{maxRawDiffBytes:64},processingBudgetLimits:{raw_diff_bytes:64,total_operation_input_bytes:128}}),e=>/diff fixture exceeded maxBytes \(257 > 128\)/.test(e.message)&&!/JSON is invalid/.test(e.message));
});

// Break: fixture JSON is charged again or parsed after an unstable read.
test('fixture_stable_read_precedes_json_parse',async()=>{
 const overrides={raw_diff_bytes:64,total_operation_input_bytes:400},operation=createPipelineProcessingOperation(defaults,overrides);
 const f=fixture(JSON.stringify({base:'b',head:'h',files:[{path:'src/a.c',status:'modified'}],unifiedDiff:'line\n'}));
 const result=await collectGitDiff({review:{vcs:'git',base:'b',head:'h'}},{...f,processingOperation:operation,processingBudgetLimits:overrides});assert.equal(result.files.length,1);assert.equal(operation.snapshot().categories.find(x=>x.category==='total_operation_input_bytes').committed,5);
 const unstable=fixture('{not json'),open=fsp.open,parse=JSON.parse;let parseCalls=0;
 const spy=mock.method(fsp,'open',async(...args)=>{const handle=await open(...args);return new Proxy(handle,{get(target,key){if(key==='read')return async(...readArgs)=>{const result=await target.read(...readArgs);fs.writeFileSync(unstable.diffFixturePath,'{BAD json');return result;};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});});
 const parsed=mock.method(JSON,'parse',(...args)=>{parseCalls++;return parse(...args);});
 try{await assert.rejects(()=>collectGitDiff({review:{vcs:'git',base:'b',head:'h'}},unstable),e=>e.code==='bounded_document_source_changed');assert.equal(parseCalls,0);}finally{parsed.mock.restore();spy.mock.restore();}
});
