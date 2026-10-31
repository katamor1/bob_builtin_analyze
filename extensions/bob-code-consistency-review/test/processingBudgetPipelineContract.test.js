'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {preprocessReview}=require('../out/core/pipeline');

// Break: the count hook, input reader, diff and real extraction each create a separate operation.
test('pipeline_has_one_owner_before_review_input_and_path_checks',async()=>{
 const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t16-pipeline-'));
 const review={schema_version:1,review:{id:'pipeline',title:'pipeline',change_type:'bugfix',purpose:'test',base:'a',head:'b',vcs:'git'},artifacts:{requirements:[{path:'source.md'}]},review_focus:['requirement-code-consistency']},rawInput=JSON.stringify(review),rawSource='# REQ-001\ntext';
 fs.writeFileSync(path.join(root,'input.json'),rawInput);fs.writeFileSync(path.join(root,'source.md'),rawSource);fs.writeFileSync(path.join(root,'diff.json'),JSON.stringify({base:'a',head:'b',files:[],unifiedDiff:'line\n',warnings:[]}));
 const factory=require('../out/core/processingBudgetPipeline'),documents=require('../out/analyzers/documentExtractor'),fileSystem=require('../out/core/fileSystem');
 const original=factory.createPipelineProcessingOperation,extract=documents.extractDocuments,resolve=fileSystem.resolveWorkspacePathStrict,open=fsp.open,owners=[],c=new AbortController(),stop=new Error('after real extraction');let result,referenceChecks=0,inputOpened=false;
 const a=mock.method(factory,'createPipelineProcessingOperation',(...args)=>{const owner=original(...args);owners.push(owner);return owner;});
 const b=mock.method(fileSystem,'resolveWorkspacePathStrict',(...args)=>{if(args[2]==='artifact path'){referenceChecks++;assert.equal(owners[0].snapshot().categories.find(x=>x.category==='document_count').committed,1);}return resolve(...args);});
 const d=mock.method(fsp,'open',async(...args)=>{if(path.resolve(args[0])===path.join(root,'input.json')){inputOpened=true;assert.equal(owners.length,1);}return open(...args);});
 const e=mock.method(documents,'extractDocuments',async(input,options)=>{assert.equal(owners.length,1);assert.strictEqual(options.processingOperation,owners[0]);owners[0].assertDocuments(options.operation);assert.strictEqual(options.signal,c.signal);result=await extract(input,options);throw stop;});
 try{
  await assert.rejects(()=>preprocessReview({workspaceRoot:root,inputPath:'input.json',outDir:'.bob-review/package',diffFixturePath:'diff.json',abortSignal:c.signal}),error=>error===stop);
  assert.equal(inputOpened,true);assert.equal(referenceChecks,2);assert.equal(owners.length,1);const snapshot=owners[0].snapshot(),used=id=>snapshot.categories.find(x=>x.category===id).committed;
  assert.equal(used('document_count'),1);assert.equal(used('raw_diff_bytes'),5);assert.equal(used('document_excerpt_bytes'),Buffer.byteLength(result.excerptsMarkdown,'utf8'));assert.equal(used('total_operation_input_bytes'),Buffer.byteLength(rawInput,'utf8')+Buffer.byteLength(rawSource,'utf8')+5+Buffer.byteLength(result.excerptsMarkdown,'utf8'));assert.equal(snapshot.categories.every(x=>x.reserved===0),true);
 }finally{e.mock.restore();d.mock.restore();b.mock.restore();a.mock.restore();}
});
