'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {preprocessReview}=require('../out/core/pipeline'),{validateReviewInput}=require('../out/core/reviewInputValidator'),shared=require('../out/sharedProcessingBudgetRuntime');
function input(paths){return{schema_version:1,review:{id:'pipeline',title:'pipeline',change_type:'bugfix',purpose:'test',base:'a',head:'b',vcs:'git'},artifacts:{requirements:paths.map(path=>({path}))},review_focus:['requirement-code-consistency']};}
function fixture(t,paths=['missing.md']){const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccr-t15-pipeline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'input.json'),JSON.stringify(input(paths)));return root;}
test('pipeline_pre_cancel_precedes_validation_and_document_context_precedes_git_diff',async t=>{
 const root=fixture(t,['one.md']);fs.writeFileSync(path.join(root,'one.md'),'# REQ-001\ntext');const c=new AbortController(),reason=new Error('stop before paths');c.abort(reason);const fileSystem=require('../out/core/fileSystem');let resolves=0;const original=fileSystem.resolveWorkspacePathStrict,m=mock.method(fileSystem,'resolveWorkspacePathStrict',(...a)=>{resolves++;return original(...a);});
 try{await assert.rejects(()=>preprocessReview({workspaceRoot:root,inputPath:'input.json',outDir:'.bob-review/review-package',abortSignal:c.signal}),e=>e===reason);assert.equal(resolves,0);}finally{m.mock.restore();}
 const events=[],factory=shared.createReviewDocumentOperation,git=require('../out/core/gitDiffCollector'),sentinel=new Error('git reached'),a=mock.method(shared,'createReviewDocumentOperation',(...args)=>{const op=factory(...args);events.push(['context',op.selectedDocumentCount,op.snapshot().categories.find(r=>r.category==='document_count').committed]);return op;}),b=mock.method(git,'collectGitDiff',async()=>{events.push(['git']);throw sentinel;});
 try{await assert.rejects(()=>preprocessReview({workspaceRoot:root,inputPath:'input.json',outDir:'.bob-review/review-package'}),e=>e===sentinel);assert.deepEqual(events,[['context',1,1],['git']]);}finally{a.mock.restore();b.mock.restore();}
});
test('pipeline_count_precedes_reference_path_resolution_and_exists_checks',async t=>{
 const root=fixture(t,['missing.md','../../outside.md']),fileSystem=require('../out/core/fileSystem'),original=fileSystem.resolveWorkspacePathStrict;let referencePaths=0,exists=0;const a=mock.method(fileSystem,'resolveWorkspacePathStrict',(...args)=>{if(args[2]==='artifact path')referencePaths++;return original(...args);}),b=mock.method(fileSystem,'pathExists',async()=>{exists++;return false;});
 try{await assert.rejects(()=>preprocessReview({workspaceRoot:root,inputPath:'input.json',outDir:'.bob-review/review-package',processingBudgetLimits:{document_count:1}}),e=>e instanceof shared.ProcessingBudgetError&&e.code==='processing_budget_exceeded');assert.deepEqual([referencePaths,exists],[0,0]);}finally{a.mock.restore();b.mock.restore();}
});
test('validator_without_hook_preserves_existing_schema_path_and_500_reference_errors',async t=>{
 const root=fixture(t);await assert.rejects(()=>validateReviewInput(path.join(root,'input.json'),root),/references missing artifact/);fs.writeFileSync(path.join(root,'input.json'),JSON.stringify(input(['../../outside.md'])));await assert.rejects(()=>validateReviewInput(path.join(root,'input.json'),root),/artifact path escapes workspace/);
 fs.writeFileSync(path.join(root,'input.json'),JSON.stringify(input(Array(501).fill('missing.md'))));let hooks=0;await assert.rejects(()=>validateReviewInput(path.join(root,'input.json'),root,'utf8',1048576,{beforeArtifactPaths(){hooks++;}}),/artifact references exceed maximum/);assert.equal(hooks,0);
 fs.writeFileSync(path.join(root,'input.json'),'{}');await assert.rejects(()=>validateReviewInput(path.join(root,'input.json'),root),/Invalid review-input/);
});
test('validator_hook_throw_or_cancellation_does_not_start_artifact_paths',async t=>{
 const root=fixture(t),reason=new Error('hook refused');await assert.rejects(()=>validateReviewInput(path.join(root,'input.json'),root,'utf8',1048576,{beforeArtifactPaths(){throw reason;}}),e=>e===reason);
 const c=new AbortController();await assert.rejects(()=>validateReviewInput(path.join(root,'input.json'),root,'utf8',1048576,{signal:c.signal,beforeArtifactPaths(){c.abort(reason);}}),e=>e===reason);
});
test('pipeline_passes_the_same_counted_context_and_signal_to_document_extraction',async t=>{
 const root=fixture(t,['one.md']);fs.writeFileSync(path.join(root,'one.md'),'# REQ-001\ntext');const c=new AbortController(),factory=shared.createReviewDocumentOperation,git=require('../out/core/gitDiffCollector'),documents=require('../out/analyzers/documentExtractor'),stop=new Error('document boundary reached');let created,calls=0;
 const a=mock.method(shared,'createReviewDocumentOperation',(...args)=>{calls++;created=factory(...args);return created;}),b=mock.method(git,'collectGitDiff',async()=>({base:'a',head:'b',files:[],warnings:[],unifiedDiff:''})),d=mock.method(documents,'extractDocuments',async(_input,options)=>{assert.strictEqual(options.operation,created);assert.strictEqual(options.signal,c.signal);assert.equal(created.snapshot().categories.find(x=>x.category==='document_count').committed,1);throw stop;});
 try{await assert.rejects(()=>preprocessReview({workspaceRoot:root,inputPath:'input.json',outDir:'.bob-review/review-package',abortSignal:c.signal}),e=>e===stop);assert.equal(calls,1);}finally{a.mock.restore();b.mock.restore();d.mock.restore();}
});
