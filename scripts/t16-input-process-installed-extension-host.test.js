"use strict"
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');

// The byte-fixed T15 probe exercises the old document-only call once. Adapt
// that call at its boundary using the installed owner API, without rebuilding a
// ledger from a snapshot or changing either the probe or product module bytes.
async function runBaselineWithPairedOwner(config){
 const root=config.extensions[1].root,shared=require(path.join(root,'out/sharedProcessingBudgetRuntime.js')),extractor=require(path.join(root,'out/analyzers/documentExtractor.js'));
 const create=shared.createReviewDocumentOperation,extract=extractor.extractDocuments,owners=new WeakMap();
 shared.createReviewDocumentOperation=(count,limits,overrides,signal)=>{const owner=shared.createProcessingOperation({profile:shared.createReviewDocumentProfile(limits,overrides),signal}),document=owner.documents(count);owners.set(document,owner);return document;};
 extractor.extractDocuments=(input,options)=>{const owner=options.operation&&owners.get(options.operation);return extract(input,owner&&!options.processingOperation?{...options,processingOperation:owner}:options);};
 try{await require('./t15-aggregate-installed-extension-host.test.js').run();}
 finally{extractor.extractDocuments=extract;shared.createReviewDocumentOperation=create;}
}

exports.run=async function run(){
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'t16-config.json'),'utf8')),baseConfig=JSON.parse(fs.readFileSync(config.baselineConfigPath,'utf8')),vscode=require('vscode');
 const receipt={schemaVersion:'bob-builtin-analyze/t16-installed-host/v1',sourceHeadSha:config.sourceHeadSha,sourceTreeSha:config.sourceTreeSha,vscode:vscode.version,node:process.version,state:'failed',productActivationProbe:'not_run',productDeactivationProbe:'not_run',cases:[],loadedModules:[],parserIdentities:[]};
 async function check(name,operation){try{const detail=await operation();receipt.cases.push({name,state:'passed',...(detail?{detail}:{})});}catch(error){receipt.cases.push({name,state:'failed',message:String(error?.message??error).slice(0,512)});throw error;}}
 try{
  await runBaselineWithPairedOwner(baseConfig);
  const baseline=JSON.parse(fs.readFileSync(config.baselineHostReceiptPath,'utf8'));assert.equal(baseline.state,'passed');assert.equal(baseline.cases.length,17);
  receipt.cases.push(...baseline.cases);receipt.loadedModules=baseline.loadedModules;receipt.parserIdentities=baseline.parserIdentities;
  const root=baseConfig.extensions[1].root,workspace=baseConfig.workspaceRoot,load=name=>require(path.join(root,'out',name+'.js'));
  const factory=load('core/processingBudgetPipeline'),limits=load('core/limits').normalizeReviewProcessingLimits(),builder=load('core/reviewPackageBuilder');
  const used=(owner,id)=>owner.snapshot().categories.find(row=>row.category===id).committed;
  const review=JSON.parse(fs.readFileSync(path.join(workspace,'review-input.yaml'),'utf8'));
  function packageInput(outDir,operation){return{workspaceRoot:workspace,outDir,reviewInput:review,diff:{vcs:'git',vcsRoot:workspace,base:'a',head:'b',files:[],unifiedDiff:'',warnings:[]},documents:{documents:[],excerptsMarkdown:'日本語 α\n',evidence:[],warnings:[]},codeAnalysis:{changedSymbols:[],functions:[],defines:[],globals:[],callGraph:[],rtForbiddenCandidates:[],codeSlices:[],evidence:[],summaryMarkdown:'',warnings:[]},traceability:{rows:[],warnings:[],markdown:''},processingOperation:operation};}

  await check('shared_operation_all_input_stages',async()=>{
   fs.mkdirSync(path.join(workspace,'src'),{recursive:true});fs.writeFileSync(path.join(workspace,'src/t16.c'),'int t16(void) { return 1; }\n');
   const create=factory.createPipelineProcessingOperation,owners=[];factory.createPipelineProcessingOperation=(...args)=>{const owner=create(...args);owners.push(owner);return owner;};
   try{const result=await load('core/pipeline').preprocessReview({workspaceRoot:workspace,inputPath:'review-input.yaml',outDir:'.bob-review/t16-shared',diffFixturePath:'diff-fixture.json'});assert.equal(result.status,'ok');assert.equal(owners.length,1);const owner=owners[0],out=path.join(workspace,'.bob-review/t16-shared'),rawInput=fs.statSync(path.join(workspace,'review-input.yaml')).size,rawSource=fs.statSync(path.join(workspace,'source.md')).size,rawDiff=Buffer.byteLength(JSON.parse(fs.readFileSync(path.join(workspace,'diff-fixture.json'),'utf8')).unifiedDiff),excerpt=fs.statSync(path.join(out,'document-excerpts.md')).size,bob=fs.statSync(path.join(out,'bob-input.md')).size;assert.equal(used(owner,'total_operation_input_bytes'),rawInput+rawSource+rawDiff+excerpt+bob);assert.equal(used(owner,'managed_artifact_bytes'),await builder.computeManagedReviewPackageBytes(out));assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));return{rawInput,rawSource,rawDiff,excerpt,bob};}finally{factory.createPipelineProcessingOperation=create;}
  });
  const runner=load('core/externalProcessRunner'),nodeOptions={command:process.execPath,cwd:workspace,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},timeoutMs:10000};
  await check('independent_stdout_stderr_exact',async()=>{const result=await runner.runExternalProcess({...nodeOptions,args:['-e',"process.stdout.write(Buffer.alloc(32,97));process.stderr.write(Buffer.alloc(262144,98));"],maxStdoutBytes:32});assert.equal(result.stdout.length,32);assert.equal(result.stderr.length,262144);});
  await check('stdout_overflow_waits_for_child_exit',async()=>{
   const spawn=cp.spawn;let child,exited=false;cp.spawn=(...args)=>{const spawned=spawn(...args);if(args[0]===process.execPath){child=spawned;child.once('exit',()=>{exited=true;});}return spawned;};
   try{await assert.rejects(()=>runner.runExternalProcess({...nodeOptions,args:['-e',"process.stdout.write(Buffer.alloc(4096));setInterval(()=>{},1000);"],maxStdoutBytes:32}),error=>error.kind==='bufferExceeded'&&error.outputStream==='stdout'&&error.stdout.length<=32);assert.ok(child?.pid);let alive=false;try{process.kill(child.pid,0);alive=true;}catch(error){if(error.code!=='ESRCH')throw error;}assert.equal(alive,false);return{aliveAfterRejection:alive,exitEventObserved:exited};}finally{cp.spawn=spawn;}
  });
  await check('git_overflow_preserves_complete_metadata',async()=>{
   const repository=path.join(workspace,'t16-git');fs.mkdirSync(repository);const git=(...args)=>cp.execFileSync('git',args,{cwd:repository,encoding:'utf8',windowsHide:true});git('init','-q');for(const name of ['one.c','two.c'])fs.writeFileSync(path.join(repository,name),'old\n');git('add','--','one.c','two.c');const commit=()=>git('-c','user.name=T16 Host','-c','user.email=t16@example.invalid','commit','-qm','fixture');commit();const base=git('rev-parse','HEAD').trim();for(const name of ['one.c','two.c'])fs.writeFileSync(path.join(repository,name),'new long line\n'.repeat(1000));git('add','--','one.c','two.c');commit();const head=git('rev-parse','HEAD').trim();
   const result=await load('core/gitDiffCollector').collectGitDiff({...review,review:{...review.review,base,head,vcs:'git',vcs_root:'t16-git'}},{workspaceRoot:workspace,limits:{maxRawDiffBytes:128},processingBudgetLimits:{raw_diff_bytes:128}});assert.deepEqual(result.files.map(row=>row.path),['one.c','two.c']);assert.ok(Buffer.byteLength(result.unifiedDiff)<=128);assert.ok(result.warnings.some(row=>row.includes('maxRawDiffBytes')));
  });
  await check('excerpt_parent_budget_is_fatal',async()=>{
   const bytes=fs.statSync(path.join(workspace,'source.md')).size,overrides={total_operation_input_bytes:1000,document_excerpt_bytes:400},owner=factory.createPipelineProcessingOperation(limits,overrides),operation=owner.documents(1);owner.reserve('raw_diff_bytes',1000-bytes-1).commit();
   await assert.rejects(()=>load('analyzers/documentExtractor').extractDocuments(review,{workspaceRoot:workspace,processingOperation:owner,operation,processingBudgetLimits:overrides}),error=>error.details?.constrainedCategory==='total_operation_input_bytes');assert.equal(used(owner,'total_document_bytes'),bytes);assert.equal(used(owner,'document_excerpt_bytes'),0);assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));
  });
  await check('mandatory_bob_metadata_survives_clipping',async()=>{
   const owner=factory.createPipelineProcessingOperation(limits),out=path.join(workspace,'.bob-review/t16-clipped'),input=packageInput(out,owner);input.documents.excerptsMarkdown='optional line\n'.repeat(10000);input.limits={maxBobInputBytes:65536};const warnings=await builder.buildReviewPackage(input),warning=warnings.find(row=>row.includes('bob-input.md')),text=fs.readFileSync(path.join(out,'bob-input.md'),'utf8'),templates=await load('templates/templateLoader').loadPromptTemplates();assert.ok(warning);assert.ok(text.includes(review.review.id));assert.ok(text.includes(warning));for(const prompt of [templates.system,templates.task,templates.outputFormat])assert.ok(text.includes(prompt));assert.ok(Buffer.byteLength(text)<=65536);for(const file of ['deterministic-checks.md','manifest.yaml'])assert.ok(fs.readFileSync(path.join(out,file),'utf8').includes(file==='manifest.yaml'?JSON.stringify(warning):warning));
   const pure=load('core/reviewPackageBudgets');assert.throws(()=>pure.assembleMandatoryFirstBobInput({maximumBytes:10,template:'{{future_metadata}}{{document_excerpts}}',values:{future_metadata:'required text',document_excerpts:'optional'},truncatableKeys:['document_excerpts']}),error=>error.code==='processing_budget_exceeded');
  });
  await check('artifact_failure_releases_pending',async()=>{
   const owner=factory.createPipelineProcessingOperation(limits,{managed_artifact_bytes:1024}),out=path.join(workspace,'.bob-review/t16-artifact-failure');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'notes.txt'),'user data');await assert.rejects(()=>builder.buildReviewPackage(packageInput(out,owner)),error=>error.details?.constrainedCategory==='managed_artifact_bytes');assert.equal(used(owner,'bob_input_bytes'),0);assert.equal(used(owner,'managed_artifact_bytes'),0);assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));assert.deepEqual(fs.readdirSync(out),['notes.txt']);
  });
  await check('utf8_package_bytes_and_unmanaged_file_are_preserved',async()=>{
   const owner=factory.createPipelineProcessingOperation(limits),out=path.join(workspace,'.bob-review/t16-utf8');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'notes.txt'),'user data');await builder.buildReviewPackage(packageInput(out,owner));function bytes(directory){return fs.readdirSync(directory,{withFileTypes:true}).reduce((sum,entry)=>{if(directory===out&&entry.name==='notes.txt')return sum;const file=path.join(directory,entry.name);return sum+(entry.isDirectory()?bytes(file):fs.statSync(file).size);},0);}assert.equal(used(owner,'managed_artifact_bytes'),bytes(out));assert.equal(used(owner,'bob_input_bytes'),fs.statSync(path.join(out,'bob-input.md')).size);assert.equal(fs.readFileSync(path.join(out,'document-excerpts.md'),'utf8'),'日本語 α\n');assert.equal(fs.readFileSync(path.join(out,'notes.txt'),'utf8'),'user data');
  });
  // Re-observe all bound files after the additional cases as well.
  for(const row of [...receipt.loadedModules,...receipt.parserIdentities]){const bytes=fs.readFileSync(row.path);assert.equal(bytes.length,row.bytes);assert.equal(require('node:crypto').createHash('sha256').update(bytes).digest('hex'),row.sha256);}
  receipt.state='passed';
 }finally{fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
}
