'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process'),{performance}=require('node:perf_hooks'),{getEventListeners}=require('node:events');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
async function controlled(operation){const descriptor=Object.getOwnPropertyDescriptor(performance,'now'),clock={now:100};Object.defineProperty(performance,'now',{configurable:true,writable:true,value:()=>clock.now});try{return await operation(clock);}finally{if(descriptor)Object.defineProperty(performance,'now',descriptor);else delete performance.now;}}
function patch(restore,owner,key,replacement){const previous=owner[key];owner[key]=replacement(previous);restore.push(()=>{owner[key]=previous;});}
exports.observeExitNotification=async function(child,observed){if(observed())return;await new Promise((resolve,reject)=>{let timer;const cleanup=()=>{clearTimeout(timer);child.removeListener('exit',done);},done=()=>{cleanup();resolve();};timer=setTimeout(()=>{cleanup();reject(new Error('owned child exit notification was not observed within2000ms'));},2000);child.once('exit',done);if(observed())done();});};
exports.run=async function run(){
 const config=JSON.parse(fs.readFileSync(path.join(__dirname,'t17-path-config.json'),'utf8')),vscode=require('vscode'),receipt={schemaVersion:'bob-builtin-analyze/t17-path-installed-host/v1',sourceHeadSha:config.sourceHeadSha,sourceTreeSha:config.sourceTreeSha,vscode:vscode.version,node:process.version,...config.execution,state:'failed',activatedExtensions:[],productActivationProbe:'not_run',productDeactivationProbe:'not_run',baseline:config.baseline,cases:[],loadedModules:[],parserIdentities:[]};
 async function check(name,operation,native=false){try{const detail=native?await operation():await controlled(operation);receipt.cases.push({name,state:'passed',detail:{mode:native?'native_child':'installed_module_controlled_clock',...detail}});}catch(error){receipt.cases.push({name,state:'failed',message:String(error?.message??error).slice(0,512)});throw error;}}
 try{
  assert.equal(vscode.version,'1.106.1');await require('./t17-path-installed-baseline-cases.js').run();const base=JSON.parse(fs.readFileSync(config.baselineHostReceiptPath,'utf8'));assert.equal(base.state,'passed');assert.equal(base.cases.length,25);assert.equal(base.loadedModules.length,32);assert.equal(base.parserIdentities.length,8);receipt.cases.push(...base.cases);receipt.loadedModules=base.loadedModules;receipt.parserIdentities=base.parserIdentities;
  const workspace=config.workspaceRoot,bRoot=config.extensions[0].root,cRoot=config.extensions[1].root,loadB=name=>require(path.join(bRoot,'out',name+'.js')),loadC=name=>require(path.join(cRoot,'out',name+'.js')),B=loadB('sharedProcessingBudgetRuntime'),C=loadC('sharedProcessingBudgetRuntime'),limits=loadC('core/limits').DEFAULT_REVIEW_PROCESSING_LIMITS,review=JSON.parse(fs.readFileSync(path.join(workspace,'review-input.yaml'),'utf8'));
  const input=(name,extra={})=>({workspaceRoot:workspace,inputPath:'review-input.yaml',outDir:'.bob-review/'+name,diffFixturePath:'diff-fixture.json',...extra}),usage=(owner,id)=>owner.snapshot().categories.find(row=>row.category===id).committed;
  const owned=extra=>C.createProcessingOperation({profile:C.createReviewDocumentProfile(limits),deadline:{expires_at_monotonic_ms:150},...extra});
  await check('deadline_one_owner_reaches_all_stages',async()=>{const restore=[],owners=[],calls=[],source=new AbortController();patch(restore,C,'createProcessingOperation',create=>(...args)=>{const owner=create(...args);owners.push(owner);return owner;});for(const[module,key,read]of [[loadC('core/reviewInputValidator'),'validateReviewInput',a=>a[4]],[loadC('core/stableReviewInput'),'readStableReviewInputText',a=>a[0]],[loadC('core/stableReviewInput'),'readStableDiffFixtureText',a=>a[0]],[loadC('core/gitDiffCollector'),'collectGitDiff',a=>a[1]],[loadC('analyzers/documentExtractor'),'extractDocuments',a=>a[1]],[loadC('core/reviewPackageBuilder'),'buildReviewPackage',a=>a[0]],[loadC('core/reviewPackageWriter'),'createReviewPackageWriter',a=>a[0]]])patch(restore,module,key,original=>(...args)=>{calls.push([key,read(args)]);return original(...args);});try{const result=await loadC('core/pipeline').preprocessReview(input('t17-shared',{commandTimeoutMs:2000,abortSignal:source.signal}));assert.equal(result.status,'ok');assert.equal(owners.length,1);assert.equal(calls.length,7);const owner=owners[0];assert.equal(owner.deadline.expires_at_monotonic_ms,2100);for(const[name,options]of calls){assert.equal(options.signal,owner.signal,name);assert.equal(options.deadline,owner.deadline,name);assert.equal(options.processingOperation??options.operation,owner,name);}assert.equal(getEventListeners(source.signal,'abort').length,0);return{ownerCount:1,selectedBoundaries:7};}finally{for(const rollback of restore.reverse())rollback();for(const owner of owners)owner.dispose();}});
  await check('deadline_preexpired_fixture_has_no_reads',async clock=>{const owner=owned(),restore=[];let reads=0;for(const key of ['open','lstat'])patch(restore,fsp,key,original=>async(...args)=>{reads++;return original(...args);});clock.now=150;try{await assert.rejects(()=>loadC('core/gitDiffCollector').collectGitDiff(review,{workspaceRoot:workspace,diffFixturePath:path.join(workspace,'diff-fixture.json'),processingOperation:owner,signal:owner.signal,deadline:owner.deadline}),error=>error.code==='processing_cancelled'&&error.kind==='deadline');assert.equal(reads,0);return{reads};}finally{for(const rollback of restore.reverse())rollback();owner.dispose();}});
  await check('deadline_authentication_rejects_forged_reason',async clock=>{const authentic=C.createCancellationScope({deadline:{expires_at_monotonic_ms:150}}),source=new AbortController(),fake=new C.ProcessingCancellationError('deadline');source.abort(fake);const user=C.createCancellationScope({deadline:{expires_at_monotonic_ms:1000},signal:source.signal});let replay;try{assert.equal(C.cancellationKindFromSignal(user.signal),'user');clock.now=150;assert.equal(C.cancellationKindFromSignal(authentic.signal),'deadline');authentic.signal.reason.kind='user';assert.equal(C.cancellationKindFromSignal(authentic.signal),'deadline');const copied=new AbortController();copied.abort(authentic.signal.reason);replay=C.createCancellationScope({deadline:{expires_at_monotonic_ms:1000},signal:copied.signal});assert.equal(C.cancellationKindFromSignal(replay.signal),'user');assert.equal(B.cancellationKindFromSignal(authentic.signal),'user');return{forgedKind:'user',replayedKind:'user',nativeKind:'deadline'};}finally{authentic.dispose();user.dispose();replay?.dispose();}});
  await check('deadline_first_user_cause_survives_expiry',async clock=>{const source=new AbortController(),reason=new Error('first operator cause'),owner=owned({signal:source.signal});try{source.abort(reason);clock.now=200;assert.throws(()=>owner.throwIfCancelled(),error=>error===reason);assert.equal(C.cancellationKindFromSignal(owner.signal),'user');return{firstCause:'user',originalErrorIdentity:true};}finally{owner.dispose();}});
  await check('deadline_sync_read_refreshes_before_timer',async clock=>{const owner=owned(),documents=owner.documents(1),open=fsp.open;let reads=0,closes=0;fsp.open=async(...args)=>{const handle=await open(...args),read=handle.read.bind(handle),close=handle.close.bind(handle);handle.read=async(buffer,offset,length,position)=>{reads++;const value=await read(buffer,offset,1,position);clock.now=150;return value;};handle.close=async()=>{closes++;return close();};return handle;};try{await assert.rejects(()=>documents.readSelection(0,{filePath:path.join(workspace,'source.md'),rootPath:workspace,maximumFileBytes:1048576,signal:owner.signal}),error=>error.code==='processing_cancelled'&&error.kind==='deadline');assert.deepEqual([reads,closes,usage(owner,'total_document_bytes')],[1,1,0]);assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));return{reads,closes,committedBytes:0};}finally{fsp.open=open;owner.dispose();}});
  await check('deadline_sync_ooxml_refreshes_before_reserve',clock=>exports.runOoxmlCheckpointProbe({owned,loadC,review,workspace,clock}));
  await check('deadline_batch_signal_priority_and_shared_endpoint',async()=>{const a=path.join(workspace,'t17-a.pdf'),b=path.join(workspace,'t17-b.pdf');fs.writeFileSync(a,'pdf a',{flag:'wx'});fs.writeFileSync(b,'pdf b',{flag:'wx'});const common=new AbortController(),ignored=new AbortController(),calls=[];ignored.abort(new Error('ignored lower source'));const runner=async options=>{calls.push(options);return{stdout:Buffer.from('PDF text'),stderr:Buffer.alloc(0),exitCode:0};},requests=[{filePath:a,signal:ignored.signal,deadline:{expires_at_monotonic_ms:180},pdf:{runner,signal:ignored.signal,deadline:{expires_at_monotonic_ms:150}}},{filePath:b,pdf:{runner,timeoutMs:600000}}];const result=await loadB('ruleAuthoring/extraction/documentExtractor').extractRuleDocuments(requests,undefined,undefined,{signal:common.signal});assert.equal(result.documents.length,2);assert.equal(calls.length,2);assert.equal(calls[0].signal,calls[1].signal);assert.equal(calls[0].deadline,calls[1].deadline);assert.equal(calls[0].deadline.expires_at_monotonic_ms,150);const first=new AbortController(),second=new AbortController(),reason=new Error('selected source stopped batch');let started=0;const stop=async()=>{started++;second.abort(reason);return{stdout:Buffer.from('discard'),stderr:Buffer.alloc(0),exitCode:0};};await assert.rejects(()=>loadB('ruleAuthoring/extraction/documentExtractor').extractRuleDocuments([{filePath:a,signal:first.signal,pdf:{runner:stop}},{filePath:b,signal:second.signal,pdf:{runner:stop}}],undefined),error=>error===reason);assert.equal(started,1);return{sharedEndpoint:150,pdfCalls:2,readsAfterSelectedCancel:0};});
  await check('deadline_mcp_calls_get_fresh_client',async clock=>{const runner=loadB('bazaar/externalProcessRunner'),original=runner.runExternalProcess,Client=loadB('bazaar/bazaar').BazaarClient,dispose=Client.prototype.dispose,calls=[],disposed=[];runner.runExternalProcess=async options=>{calls.push(options);return{stdout:Buffer.from('status'),stderr:Buffer.alloc(0),exitCode:0};};Client.prototype.dispose=function(){disposed.push(this);return dispose.call(this);};try{const registry=loadB('mcp/tools').createMcpToolRegistry({requiredAllowedCwd:async()=>workspace,env:{BZR_PATH:'controlled-bzr'}});await registry.callTool('bazaar_status',{cwd:workspace});clock.now=200000;await registry.callTool('bazaar_status',{cwd:workspace});assert.deepEqual(calls.map(row=>row.deadline.expires_at_monotonic_ms),[120100,320000]);assert.equal(disposed.length,2);assert.notEqual(disposed[0],disposed[1]);return{clients:2,disposed:2};}finally{runner.runExternalProcess=original;Client.prototype.dispose=dispose;}});
  await check('deadline_borrowed_dispose_keeps_owner_live',async clock=>{const source=new AbortController(),owner=owned({signal:source.signal}),document=owner.documents(0),reason=new Error('parent still watched');try{assert.equal(getEventListeners(source.signal,'abort').length,1);document.dispose();assert.equal(getEventListeners(source.signal,'abort').length,1);clock.now=149;owner.reserve('raw_diff_bytes',0).release();source.abort(reason);assert.throws(()=>owner.throwIfCancelled(),error=>error===reason);return{parentWatchedAfterBorrowedDispose:true};}finally{owner.dispose();assert.equal(getEventListeners(source.signal,'abort').length,0);}});
  await check('deadline_native_child_settlement',async()=>{const original=cp.spawn;let child,exitEventObserved=false;cp.spawn=(...args)=>{const value=original(...args);if(args[0]===process.execPath){child=value;value.once('exit',()=>{exitEventObserved=true;});}return value;};let raw;try{await assert.rejects(()=>loadC('core/externalProcessRunner').runExternalProcess({command:process.execPath,args:['-e','process.stdout.write(Buffer.alloc(4096));setInterval(()=>{},1000);'],cwd:workspace,env:{...process.env,ELECTRON_RUN_AS_NODE:'1'},maxStdoutBytes:32,deadline:C.createAbsoluteDeadline(10000)}),error=>{raw=error;return error.kind==='bufferExceeded'&&error.outputStream==='stdout';});assert.ok(child?.pid);let aliveAfterRejection=false;try{process.kill(child.pid,0);aliveAfterRejection=true;}catch(error){if(error.code!=='ESRCH')throw error;}assert.equal(aliveAfterRejection,false);await exports.observeExitNotification(child,()=>exitEventObserved);assert.equal(exitEventObserved,true);assert.equal(raw.cleanupStatus,'controller_settled');assert.equal(raw.terminationCause,'stdout_limit');assert.ok(raw.stdout.length<=32);return{pid:child.pid,exitEventObserved,aliveAfterRejection,terminationCause:raw.terminationCause,cleanupStatus:raw.cleanupStatus,exitObservationPhase:'after_controller_settlement'};}finally{cp.spawn=original;if(child?.exitCode===null&&child?.signalCode===null)child.kill('SIGKILL');}},true);
  await check('deadline_outer_cancel_wins_after_transport_failure',async clock=>{const runner=loadC('core/externalProcessRunner'),run=runner.runExternalProcess;for(const user of [false,true]){clock.now=100;const source=new AbortController(),owner=owned({signal:source.signal}),reason=new runner.ExternalProcessError('operator reason','bufferExceeded','operator',[],workspace,Buffer.from('not transport'),Buffer.alloc(0),undefined,'stdout'),raw=new runner.ExternalProcessError('transport limit','bufferExceeded','git',[],workspace,Buffer.from('prefix'),Buffer.alloc(0),undefined,'stdout','stdout_limit','controller_settled');let calls=0;runner.runExternalProcess=async()=>{calls++;if(calls<=2)return{stdout:Buffer.from('a'.repeat(40)),stderr:Buffer.alloc(0),exitCode:0};if(calls<=4)return{stdout:Buffer.alloc(0),stderr:Buffer.alloc(0),exitCode:0};if(user)source.abort(reason);else clock.now=150;throw raw;};try{await assert.rejects(()=>loadC('core/gitDiffCollector').collectGitDiff(review,{workspaceRoot:workspace,processingOperation:owner,signal:owner.signal,deadline:owner.deadline}),error=>user?error===reason:error.code==='processing_cancelled'&&error.kind==='deadline');assert.equal(calls,5);assert.equal(raw.terminationCause,'stdout_limit');assert.equal(usage(owner,'raw_diff_bytes'),0);}finally{runner.runExternalProcess=run;owner.dispose();}}return{transportCauseRetained:'stdout_limit',adoptedDiffBytes:0,userIdentityRetained:true};});
  await check('deadline_final_ledger_before_success',async clock=>{const ledger=loadC('evidenceScope/artifactLedger'),update=ledger.updateArtifactLedger,create=C.createProcessingOperation,owners=[];let final=0;C.createProcessingOperation=(...args)=>{const owner=create(...args);owners.push(owner);return owner;};ledger.updateArtifactLedger=async input=>{const result=await update(input);if(input.observations.some(row=>row.kind==='review-package')){final++;clock.now=150;}return result;};try{await assert.rejects(()=>loadC('core/pipeline').preprocessReview(input('t17-final',{deadline:{expires_at_monotonic_ms:150}})),error=>error.code==='processing_cancelled'&&error.kind==='deadline');assert.equal(final,1);assert.equal(owners.length,1);assert.ok(usage(owners[0],'managed_artifact_bytes')>0);assert.ok(owners[0].snapshot().categories.every(row=>row.reserved===0));return{finalLedgerReturned:1,successReturned:false,priorCommitsRetained:true};}finally{ledger.updateArtifactLedger=update;C.createProcessingOperation=create;for(const owner of owners)owner.dispose();}});
  await runPathCases({config,receipt,vscode,B,C,loadB,loadC,workspace,limits});
  for(const row of [...receipt.loadedModules,...receipt.parserIdentities]){const bytes=fs.readFileSync(row.path);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);}assert.equal(receipt.cases.length,49);receipt.state=receipt.cases[48].state==='not_run'?'local_partial':'passed';
 }finally{fs.writeFileSync(config.hostReceiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
};

exports.runOoxmlCheckpointProbe=async function({owned,loadC,review,workspace,clock}){const usage=(owner,id)=>owner.snapshot().categories.find(row=>row.category===id).committed;const owner=owned(),documents=owner.documents(1),extractor=loadC('analyzers/documentDocxExtractor'),parse=extractor.extractDocxChunks,read=Buffer.prototype.readUInt32LE;let reads=0,parses=0;extractor.extractDocxChunks=(...args)=>{parses++;return parse(...args);};Buffer.prototype.readUInt32LE=function(...args){const result=read.apply(this,args);if(result===0x06054b50&&this[0]===0x50&&this[1]===0x4b){reads++;clock.now=150;}return result;};try{const selected={...review,artifacts:{requirements:[{path:'normal.docx'}]}};await assert.rejects(()=>loadC('analyzers/documentExtractor').extractDocuments(selected,{workspaceRoot:workspace,processingOperation:owner,operation:documents,signal:owner.signal,deadline:owner.deadline}),error=>error.code==='processing_cancelled'&&error.kind==='deadline');assert.equal(reads,1);assert.equal(parses,0);assert.equal(usage(owner,'total_document_bytes'),fs.statSync(path.join(workspace,'normal.docx')).size);assert.equal(usage(owner,'total_sheets'),0);assert.ok(owner.snapshot().categories.every(row=>row.reserved===0));return{archiveReads:reads,parserCalls:parses,workbookReserved:0};}finally{Buffer.prototype.readUInt32LE=read;extractor.extractDocxChunks=parse;owner.dispose();}};

async function runPathCases({config,receipt,vscode,B,C,loadB,loadC,workspace,limits}) {
 const root=fs.mkdtempSync(path.join(workspace,'path-'));
 const wRoot=config.extensions[2].root;
 const loadW=name=>require(path.join(wRoot,'out',name+'.js'));
 const resolve=(rootPath,candidatePath,options={})=>C.resolvePhysicalContainedPathSync({rootPath,candidatePath,...options});
 const link=(target,alias)=>fs.symlinkSync(target,alias,process.platform==='win32'?'junction':'dir');
 const reject=error=>error instanceof C.PathPolicyError;
 const canonical=file=>fs.realpathSync.native(file).replace(/^[a-z]:/,letter=>letter.toUpperCase());
 const folder=file=>({name:path.basename(file),uri:vscode.Uri.file(file)});
 const own=(name)=>{const directory=path.join(root,name);fs.mkdirSync(directory);return directory;};
 async function check(name,mode,operation){
  try {receipt.cases.push({name,state:'passed',detail:{mode,...await operation()}});}
  catch (error) {receipt.cases.push({name,state:'failed',message:String(error.message).slice(0,512)});throw error;}
 }
 for (const item of config.extensions) {
  const extension=vscode.extensions.getExtension(item.id);
  assert.ok(extension,'installed extension '+item.id);
  assert.equal(canonical(extension.extensionPath),canonical(item.root));
  await extension.activate();
  assert.equal(extension.isActive,true);
  receipt.activatedExtensions.push(item.id);
 }
 const W=loadW('sharedProcessingBudgetRuntime');

 await check('path_portable_syntax_and_host_absolute','installed_module',()=>{
  for (const runtime of [B,C,W]) {
   assert.equal(runtime.normalizeWorkspaceRelativePath('日本語 space/file.txt'),'日本語 space/file.txt');
   for (const bad of ['a/../b','a/./b','a//b','CON.txt','x:stream','C:relative','e\u0301.txt']) {
    assert.throws(()=>runtime.normalizeWorkspaceRelativePath(bad),error=>error instanceof runtime.PathPolicyError);
   }
   assert.equal(runtime.isPortablePathContained('C:\\Work','c:\\WORK\\file.txt','win32'),true);
   assert.equal(runtime.isPortablePathContained('\\\\server\\share','\\\\server\\other\\file','win32'),false);
  }
  const source=path.join(root,'syntax.txt');fs.writeFileSync(source,'safe');
  assert.equal(resolve(root,source,{expectedType:'file'}).relative_path,'syntax.txt');
  assert.throws(()=>resolve(root,source,{allowAbsolute:false}),reject);
  assert.throws(()=>resolve(root,process.platform==='win32'?'/tmp/out':'C:\\out'),reject);
  return {facades:3,hostAbsolute:true,foreignRejected:true};
 });

 await check('path_physical_containment_existing_and_missing','native_filesystem',()=>{
  const dir=own('contain'),file=path.join(dir,'exists.txt');fs.writeFileSync(file,'fixture');
  assert.equal(resolve(dir,dir,{expectedType:'directory'}).relative_path,'.');
  assert.equal(resolve(dir,'exists.txt',{expectedType:'file'}).path,canonical(file));
  const missing=resolve(dir,'a/b/new.txt',{mustExist:false,expectedType:'file'});
  assert.equal(missing.exists,false);assert.equal(missing.path,path.join(canonical(dir),'a','b','new.txt'));
  assert.throws(()=>resolve(dir,'exists.txt/child',{mustExist:false}),reject);
  assert.throws(()=>resolve(dir,'exists.txt',{expectedType:'directory'}),reject);
  assert.throws(()=>resolve(dir,path.join(root,'syntax.txt')),reject);
  return {file:true,root:true,missingSuffix:true,rejections:3};
 });

 await check('path_rejects_root_parent_leaf_links','native_filesystem',()=>{
  const physical=own('real'),safe=own('safe'),aliasRoot=path.join(root,'root-alias');
  fs.writeFileSync(path.join(physical,'leaf.txt'),'fixture');
  link(physical,aliasRoot);link(physical,path.join(safe,'parent-alias'));
  if (process.platform==='win32') link(physical,path.join(safe,'leaf-alias'));
  else fs.symlinkSync(path.join(physical,'leaf.txt'),path.join(safe,'leaf-alias'),'file');
  for (const [base,candidate] of [[aliasRoot,'leaf.txt'],[safe,'parent-alias/leaf.txt'],[safe,'leaf-alias']]) {
   assert.throws(()=>resolve(base,candidate),error=>error.code==='path_policy_symlink');
  }
  return {rejections:3,linkType:process.platform==='win32'?'junction':'symlink'};
 });

 await check('path_deepest_physical_multi_root','native_filesystem',async()=>{
  const a=own('outer'),b=path.join(a,'inner');fs.mkdirSync(b);
  const file=path.join(b,'source.txt');fs.writeFileSync(file,'source');
  const alias=path.join(root,'inner-alias');link(b,alias);
  assert.equal(await C.selectDeepestPhysicalRoot([a,b],path.join(alias,'source.txt')),b);
  assert.equal(await C.selectDeepestPhysicalRoot([a,b],path.join(alias,'missing.txt')),b);
  assert.equal(await C.selectDeepestPhysicalRoot([alias,a],file),a);
  const sameRoot=process.platform==='win32'?b[0].toLowerCase()+b.slice(1):b;
  assert.equal(await C.selectDeepestPhysicalRoot([b,sameRoot],file),b);
  assert.equal(await C.selectDeepestPhysicalRoot([a,b],path.join(root,'outside.txt')),undefined);
  return {alias:true,missing:true,tie:true,linkedRootExcluded:true};
 });

 await check('path_three_workspace_marker_roots','native_filesystem',async()=>{
  const direct=own('marker-direct'),outer=own('marker-outer'),child=path.join(outer,'child'),fallback=own('marker-fallback');
  for(const name of ['.bob','.bzr']){
   fs.mkdirSync(path.join(direct,name),{recursive:true});
   fs.mkdirSync(path.join(child,name),{recursive:true});
  }
  const br=loadB('workspace/workspaceRoots'),cr=loadC('workspaceRoots'),wr=loadW('core/workspaceRoots');
  for(const [api,marker] of [[br,'.bzr'],[cr,'.bob'],[wr,'.bob']]){
   const roots=await api.findMarkerRoots([folder(direct),folder(outer),folder(fallback)],marker);
   assert.deepEqual(roots.map(item=>canonical(item.root)),[canonical(direct)]);
   assert.deepEqual((await api.findMarkerRoots([folder(outer),folder(fallback)],marker)).map(item=>canonical(item.root)),[canonical(child)]);
  }
  assert.deepEqual(wr.fallbackWorkspaceRootCandidates([folder(fallback),folder(fallback)]).map(item=>canonical(item.root)),[canonical(fallback)]);
  assert.equal(await loadB('workspace/workspaceResolver').resolveBazaarWorkspaceFolder({explicitRoot:fallback,allowPick:false}),undefined);
  assert.equal(canonical(await loadC('workspaceResolver').resolveBobWorkspaceRoot({explicitRoot:fallback,allowPick:false})),canonical(fallback));
  return {modules:3,direct:true,child:true,fallback:true,explicitDifference:true};
 });

 await check('path_bounded_file_identity_and_hardlinks','native_filesystem_and_controlled_hook',async()=>{
  const dir=own('bounded'),file=path.join(dir,'read.txt'),ledger=new C.ProcessingBudgetLedger();
  const input={rootPath:dir,filePath:file,maximumFileBytes:1024,target:'installed-path',ledger};
  fs.writeFileSync(file,'before');fs.linkSync(file,path.join(dir,'hardlink.txt'));
  await assert.rejects(()=>C.readBoundedDocumentFile(input),error=>error.code==='bounded_document_source_invalid');
  const mutate=path.join(dir,'mutate.txt');fs.writeFileSync(mutate,'before');
  const snapshot=loadC('shared-processing-budget-runtime/boundedDocumentFile').withBoundedDocumentSnapshot;
  let adopted=0;
  await assert.rejects(()=>snapshot({...input,filePath:mutate},async()=>{
   const before=fs.statSync(mutate);fs.writeFileSync(mutate,'change');fs.utimesSync(mutate,before.atime,before.mtime);
   return 'must discard';
  }).then(()=>{adopted++;}),error=>error.code==='bounded_document_source_changed');
  assert.equal(adopted,0);
  assert.ok(ledger.snapshot().categories.every(row=>row.reserved===0&&row.committed===0));
  const controller=new AbortController();controller.abort(new Error('installed cancellation'));
  await assert.rejects(()=>C.readBoundedDocumentFile({...input,filePath:mutate,signal:controller.signal}),error=>error.code==='bounded_document_cancelled');
  return {hardlinkRejected:true,sameSizeDiscarded:true,adopted,reservations:0};
 });

 await check('path_stable_input_parent_revalidation','installed_module_controlled_filesystem',async()=>{
  const dir=own('stable'),sub=path.join(dir,'sub');fs.mkdirSync(sub);
  const file=path.join(sub,'input.yaml');fs.writeFileSync(file,'stable');
  const stable=loadC('core/stableReviewInput'),options={filePath:file,maximumBytes:100,textEncoding:'utf8'};
  assert.equal(await stable.readStableDiffFixtureText(options),'stable');
  const owner=loadC('core/processingBudgetPipeline').createPipelineProcessingOperation(limits);
  const native=fs.realpathSync.native,open=fsp.open;
  let read=false;
  fs.realpathSync.native=target=>read&&target===sub?sub+'.observed-alias':native(target);
  fsp.open=async(...args)=>{
   const handle=await open(...args);
   return new Proxy(handle,{get(object,key){
    const value=Reflect.get(object,key,object);
    if (key==='read') return async(...args)=>{const result=await value.apply(object,args);read=true;return result;};
    return typeof value==='function'?value.bind(object):value;
   }});
  };
  try {
   await assert.rejects(()=>stable.readStableReviewInputText({...options,rootPath:dir,operation:owner}),error=>error.code==='bounded_document_source_invalid');
   assert.equal(read,true);
   assert.ok(owner.snapshot().categories.every(row=>row.reserved===0&&row.committed===0));
  } finally {fs.realpathSync.native=native;fsp.open=open;owner.dispose();}
  return {standalone:true,parentObservation:true,adopted:false};
 });

 const makeDraft=paths=>({review:{id:'path-installed',title:'Installed path'},artifact_candidates:paths.map(file=>({kind:'requirements',path:file}))});
 const author=loadC('core/reviewInputBuilder');
 await check('path_ccr_artifact_authoring','native_filesystem',async()=>{
  const dir=own('author'),source=path.join(dir,'source.md');fs.writeFileSync(source,'# Source');
  const strict=await author.buildReviewInputFromDraft(makeDraft([source]),{workspaceRoot:dir});
  assert.equal(strict.status,'ok');assert.equal(strict.reviewInput.artifacts.requirements[0].path,'source.md');
  const missing=makeDraft(['missing.md']);
  assert.equal((await author.buildReviewInputFromDraft(missing,{workspaceRoot:dir})).status,'error');
  assert.equal((await author.buildReviewInputFromDraft(missing,{workspaceRoot:dir,strictPaths:false})).status,'ok');
  const alias=path.join(dir,'inside-link');link(dir===root?root:path.dirname(dir),alias);
  const bad=makeDraft([' ./source.md','x/../source.md','inside-link/author/source.md']);
  assert.equal((await author.buildReviewInputFromDraft(bad,{workspaceRoot:dir,strictPaths:false})).status,'error');
  return {strict:true,relaxedMissingOnly:true,stored:'source.md'};
 });

 await check('path_ccr_output_backup_kind_guards','native_filesystem_and_controlled_hook',async()=>{
  const dir=own('write'),outside=own('write-outside');fs.writeFileSync(path.join(dir,'source.md'),'# Source');
  const draft=makeDraft(['source.md']),options={workspaceRoot:dir,draft};
  const files=loadC('core/fileSystem');
  assert.equal(files.resolveWorkspacePathForKind(dir,'.bob-review/run','review-package-output'),path.join(canonical(dir),'.bob-review','run'));
  assert.throws(()=>files.resolveWorkspacePathForKind(dir,'wrong/run','review-package-output'));
  const foreign=path.join(outside,'review.yaml');
  assert.equal((await author.writeReviewInputFromDraft({...options,outputPath:foreign})).status,'error');
  assert.equal(fs.existsSync(foreign),false);
  const first=await author.writeReviewInputFromDraft({...options,outputPath:'review.yaml'});
  assert.equal(first.status,'ok');
  const second=await author.writeReviewInputFromDraft({...options,outputPath:'review.yaml'});
  assert.equal(second.status,'ok');assert.equal(fs.readFileSync(path.join(dir,second.backupPath),'utf8'),first.yaml);
  const mkdir=fsp.mkdir,target=path.join(dir,'replace');let replaced=false;
  fsp.mkdir=async(file,...args)=>{
   const result=await mkdir(file,...args);
   if (file===target&&!replaced){fs.renameSync(target,target+'-retained');link(outside,target);replaced=true;}
   return result;
  };
  try {assert.equal((await author.writeReviewInputFromDraft({...options,outputPath:'replace/review.yaml'})).status,'error');}
  finally {fsp.mkdir=mkdir;}
  assert.equal(replaced,true);assert.equal(fs.existsSync(foreign),false);
  return {outsideWrites:0,backup:true,postMkdirRejected:true};
 });

 await check('path_three_extension_canonical_copy','installed_modules',()=>{
  const workflowFile=canonical(require.resolve(path.join(wRoot,'out/shared-processing-budget-runtime/pathPolicy.js')));
  assert.ok(require.cache[workflowFile]||Object.keys(require.cache).some(file=>canonical(file)===workflowFile));
  const bytes=fs.readFileSync(workflowFile);
  receipt.loadedModules.push({extensionRoot:wRoot,moduleName:'pathPolicy',path:workflowFile,bytes:bytes.length,sha256:sha(bytes)});
  const pathModules=receipt.loadedModules.filter(item=>item.moduleName==='pathPolicy');
  assert.equal(receipt.loadedModules.length,33);assert.equal(pathModules.length,3);
  assert.equal(new Set(pathModules.map(item=>item.sha256)).size,1);
  for(const item of receipt.loadedModules)assert.ok(canonical(item.path).startsWith(canonical(item.extensionRoot)+path.sep));
  return {loaded:33,canonicalPathSha256:sha(bytes),fallbacks:0};
 });

 await check('path_workflow_has_path_only_capability','installed_modules',()=>{
  const payload=path.join(wRoot,'out/shared-processing-budget-runtime');
  assert.deepEqual(fs.readdirSync(payload).sort(),['manifest.json','pathPolicy.js']);
  const manifest=JSON.parse(fs.readFileSync(path.join(payload,'manifest.json'),'utf8'));
  assert.equal(manifest.profile,'path-only');
  assert.deepEqual(manifest.payload.map(item=>item.path),['pathPolicy.d.ts','pathPolicy.js','pathPolicy.js.map']);
  for(const key of ['ProcessingBudgetLedger','createProcessingOperation','createDeadlineScope','readBoundedDocumentFile'])assert.equal(W[key],undefined);
  assert.equal(W.normalizeWorkspaceRelativePath('a/b'),'a/b');
  return {profile:'path-only',runtimeFiles:1};
 });

 if(process.platform==='linux'){
  assert.equal(config.nativeUncFixture,null);
  receipt.cases.push({name:'path_unc_native_containment',state:'not_applicable',detail:{mode:'posix',reason:'posix_no_native_unc'}});
 }else if(!config.nativeUncFixture){
  assert.equal(config.execution.executionMode,'local');
  receipt.cases.push({name:'path_unc_native_containment',state:'not_run',detail:{mode:'native_unc',reason:'owned_fixture_unavailable'}});
 }else{
  await check('path_unc_native_containment','native_unc',()=>{
   const fixture=config.nativeUncFixture,unc=fixture.uncRoot;
   const result=resolve(unc,'日本語 space.txt',{expectedType:'file'});
   assert.equal(result.exists,true);
   assert.equal(sha(fs.readFileSync(result.path)),fixture.bindings.probeFile.sha256);
   for(const [base,candidate] of [[unc+'\\root-link','inner.txt'],[unc,'parent-link/inner.txt'],[unc,'target-link']]){
    assert.throws(()=>resolve(base,candidate),error=>error.code==='path_policy_symlink');
   }
   return {nonce:fixture.nonce,root:unc,rejections:3};
  });
 }
}
