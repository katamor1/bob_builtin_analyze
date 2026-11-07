const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
test('all_four_entry_paths_forward_effective_source_limit',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bob-discovery-wiring-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const calls=[],hosts=[],namespaces=[];const original=Module._load;
 const config={get(key,fallback){return key==='maxDocumentBytes'?2000:fallback;}};
 const vscode={ViewColumn:{One:1},ProgressLocation:{Notification:1},workspace:{getConfiguration(namespace){namespaces.push(namespace);return config;},openTextDocument:async()=>({})},window:{withProgress:async(_options,task)=>task(),showTextDocument:async()=>{},setStatusBarMessage(){},showErrorMessage:async()=>{}},env:{clipboard:{writeText:async()=>{}}}};
 Module._load=function(request,parent,isMain){
  if(request==='vscode')return vscode;
  if(request.endsWith('reviewInputDiscovery'))return{discoverReviewInputCandidates:async(workspaceRoot,options)=>{calls.push({caller:path.basename(parent.filename),workspaceRoot,options});return{documents:[],warnings:[]};}};
  if(request.endsWith('gitDiffCollector'))return{collectGitDiff:async()=>({vcs:'git',base:'a',head:'b',files:[],unifiedDiff:'',warnings:[]})};
  if(request.endsWith('reviewInputWizard'))return{collectReviewInputDraft:async()=>undefined,collectReviewMetadata:async()=>undefined};
  const loaded=original.call(this,request,parent,isMain);
  if(request.endsWith('extensionCommandOptions'))return{...loaded,requireBobWorkspaceRoot:async()=>root};
  if(request.endsWith('reviewInputAiDraftProvider'))return{...loaded,prepareAiReviewInputDraftPrompt:async input=>{hosts.push(input);return loaded.prepareAiReviewInputDraftPrompt(input);}};
  if(request.endsWith('traceabilityAiDraftProvider'))return{...loaded,prepareAiTraceabilityDraftPrompt:async input=>{hosts.push(input);return loaded.prepareAiTraceabilityDraftPrompt(input);}};
  return loaded;
 };
 try{
  const commandPath=require.resolve('../out/commands/reviewInputCommands');delete require.cache[commandPath];const commands=require(commandPath);
  await commands.runCreateReviewInput({workspaceRoot:root,maxDocumentBytes:'17'});
  assert.equal(calls.at(-1).options.limits?.maxDocumentBytes,17);
  const options={workspaceRoot:root,base:'HEAD~1',head:'HEAD',vcs:'git',maxDocumentBytes:'19'};
  await commands.runPrepareAiReviewInputDraft(options);assert.equal(calls.at(-1).options.limits?.maxDocumentBytes,19);assert.equal(hosts.at(-1).limits?.maxDocumentBytes,19);assert.equal(calls.at(-1).options.maxFiles,120);
  const tracePath=require.resolve('../out/traceabilityCommands');delete require.cache[tracePath];await require(tracePath).runPrepareAiTraceabilityDraft({...options,maxDocumentBytes:23});assert.equal(calls.at(-1).options.limits?.maxDocumentBytes,23);assert.equal(hosts.at(-1).limits?.maxDocumentBytes,23);assert.equal(calls.at(-1).options.maxFiles,160);
  const wizardPath=require.resolve('../out/webview/consistencyReviewWizard');delete require.cache[wizardPath];const {ConsistencyReviewWizardController}=require(wizardPath),disposable={dispose(){}};
  const panel={webview:{onDidReceiveMessage(){return disposable;}},onDidDispose(){return disposable;}};const wizard=new ConsistencyReviewWizardController({subscriptions:[]},panel);wizard.workspaceRoot=root;await wizard.buildModel([],{skipTraceabilityIo:true});assert.equal(calls.at(-1).options.limits?.maxDocumentBytes,2000);
  assert.deepEqual(calls.map(x=>x.caller),['reviewInputCommands.js','reviewInputAiDraftProvider.js','traceabilityAiDraftProvider.js','consistencyReviewWizard.js']);assert.ok(namespaces.every(x=>x==='bobCodeConsistency'));
 }finally{Module._load=original;}
});

test('authoring_commands_keep_raw_root_and_output_path_until_policy',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'bob-raw-options-'));
 fs.writeFileSync(path.join(root,'review-input.yaml'),'ORIGINAL');
 const original=Module._load;
 const vscode={workspace:{getConfiguration:()=>({get:(_key,fallback)=>fallback})}};
 let discoveries=0;
 Module._load=function(request,parent,isMain){
  if(request==='vscode')return vscode;
  if(request.endsWith('reviewInputDiscovery'))return{discoverReviewInputCandidates:async()=>{discoveries++;return{documents:[],warnings:[]};}};
  if(request.endsWith('reviewInputWizard'))return{collectReviewInputDraft:async()=>undefined};
  return original.call(this,request,parent,isMain);
 };
 try{
  const commandPath=require.resolve('../out/commands/reviewInputCommands');
  delete require.cache[commandPath];
  const {runCreateReviewInput}=require(commandPath);
  await t.test('explicit root',async()=>{
   await assert.rejects(()=>runCreateReviewInput({bobRoot:root+' '}),/ワークスペース/);
  });
  await t.test('explicit output',async()=>{
   await assert.rejects(()=>runCreateReviewInput({bobRoot:root,reviewInputPath:'review-input.yaml '}),/path/i);
  });
  assert.equal(discoveries,0);
  assert.equal(fs.readFileSync(path.join(root,'review-input.yaml'),'utf8'),'ORIGINAL');
 }finally{Module._load=original;}
});
