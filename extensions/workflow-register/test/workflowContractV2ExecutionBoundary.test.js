const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {test}=require('node:test')
const {fixture,requireWithVscode}=require('./workflowContractV2EntrypointTestSupport')
async function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'p6-boundary-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=fixture(),result=await f.entrypoint.compileCurrent({slot:f.slot,consumer:'workspace-registration'});const view=require('../out/workflowContractV2View').adaptCompiledWorkflowForProduct({handle:result.handle,rawPackage:result.rawPackage,slot:f.slot,root:{root,name:'workspace',workspaceFolderName:'workspace',marker:'.bob',depth:0},currentPointer:{fsPath:path.join(root,'.bob/workflows/minimal/current.json')}});require('../out/workflowContractV2View').freezeWorkflowContractV2View(view.workflow);return {root,f,...view};}
function runtime(effects){const vscode={ViewColumn:{Active:1},commands:{executeCommand:async()=>{effects.dispatch++;}},workspace:{isTrusted:true,workspaceFolders:[],getConfiguration:()=>({get:(_k,d)=>d}),createFileSystemWatcher:()=>({onDidCreate(){},onDidChange(){},onDidDelete(){},dispose(){}})},window:{showInputBox:async()=>{effects.inputs++;},showQuickPick:async()=>{effects.inputs++;},showWarningMessage:async()=>{},showInformationMessage:async()=>{},showErrorMessage:async()=>{},createWebviewPanel:()=>{effects.bob++;throw Error('panel');}}};vscode.extensions=require("./providerRegistryRuntimeTestSupport").vscodeStub().vscode.extensions;return vscode;}
function factory(vscode,effects){const {WorkflowRuntimeFactory}=requireWithVscode('../out/workflowRuntimeFactory.js',vscode);const {ActionRegistry}=requireWithVscode('../out/core/actionRegistry.js',vscode);return new WorkflowRuntimeFactory({engineVersion:'test',actionRegistry:new ActionRegistry(),customResultSinks:[],stepRuntime:{hold(){effects.bob++;}},agentProvider:()=>undefined,inputsProvider:()=>{effects.inputs++;return {};},gateRegistry:{}});}
function counters(){return {inputs:0,dispatch:0,bob:0,commands:0};}
function zero(effects,f,root){assert.deepEqual(effects,counters());assert.equal(f.counters.acquire,0);assert.equal(f.counters.dispatch,0);assert.equal(fs.existsSync(path.join(root,'.bob/workflows/runs')),false);}
test('factory-owned guards block every engine route and direct run creation without optional hooks',async t=>{
 const {root,f,coreWorkflow}=await setup(t),effects=counters(),vscode=runtime(effects),rf=factory(vscode,effects),engine=rf.createEngine(root);
 for(const name of ['findRecoverableRun','loadRun','withRunLock','createRun','saveRun'])engine.runStore[name]=async()=>{effects.commands++;throw Error('durable/recovery route touched');};
 const routes=[()=>engine.runWorkflow(coreWorkflow,{}),()=>engine.resumeRun('never',{workflow:coreWorkflow}),()=>engine.resumeRunGuarded('never',{workflow:coreWorkflow},{beforeResume(){effects.commands++;}}),()=>engine.retryCurrentStep('never',coreWorkflow),()=>engine.approveBranchCheckpoint('never',coreWorkflow),()=>rf.createRunStore(root).createRun(coreWorkflow,{})];
 for(const invoke of routes){await assert.rejects(invoke(),e=>e.name==='WorkflowContractV2BoundaryError');zero(effects,f,root);}
});
test('Bob adapter and factory runner refuse V2 before inspecting a task or collecting inputs',async t=>{
 const {root,f,workflow}=await setup(t),effects=counters(),vscode=runtime(effects),rf=factory(vscode,effects);const runner=rf.createBobWorkflowRunner(workflow);const task=new Proxy({},{get(){effects.bob++;throw Error('task touched');}});
 for(const invoke of [()=>runner.runSingleWorkflowStep(task),()=>runner.runTodoStep({id:'one'},0,task),()=>runner.runEngineStep('one',0,task)]){await assert.rejects(invoke(),e=>e.name==='WorkflowContractV2BoundaryError');zero(effects,f,root);}
 const {createBobWorkflow}=requireWithVscode('../out/bobWorkflowFactory.js',vscode);assert.throws(()=>createBobWorkflow(workflow,runner),e=>e.name==='WorkflowContractV2BoundaryError');zero(effects,f,root);
});
test('service command guards reject current, invalid and same-digest stale V2 before command delegation',async t=>{
 const {root,f,coreWorkflow}=await setup(t),effects=counters(),vscode=runtime(effects);const {WorkflowRegisterService}=requireWithVscode('../out/workflowRegisterService.js',vscode),service=new WorkflowRegisterService('test');t.after(()=>service.dispose());service.coreWorkflows.set(coreWorkflow.id,coreWorkflow);service.compileCurrentWorkflowPackage=i=>f.entrypoint.compileCurrent(i);
 for(const name of ['runWorkflow','runWorkflowStep','startFromStepWithArtifacts'])service.runCommands[name]=async()=>{effects.commands++;return {};};
 for(const state of ['valid','stale','invalid']){
 if(state==='stale')f.entrypoint.invalidateSlot(f.slot);if(state==='invalid')f.adapter.mutate(['minimal','current.json'],Buffer.from('{}'));
 for(const invoke of [()=>service.runWorkflow(coreWorkflow.id),()=>service.runWorkflow(),()=>service.runWorkflowStep(coreWorkflow.id,'one'),()=>service.startFromStepWithArtifacts(coreWorkflow.id,'one','source')]){await assert.rejects(invoke(),e=>e.name==='WorkflowContractV2BoundaryError');zero(effects,f,root);}
 }
});

test('V1 direct creation still writes a normal run through the guarded store',async t=>{
 const {root}=await setup(t),effects=counters(),rf=factory(runtime(effects),effects);
 const {compileWorkflowDocument}=require('../out/core/workflowCompiler');const compiled=compileWorkflowDocument({sourceId:'test',filePath:'.bob/workflows/legacy/WORKFLOW.md',text:['---','name: legacy','description: Legacy compatibility.','---','Legacy prompt.'].join(String.fromCharCode(10))});assert.equal(compiled.ok,true);
 const store=rf.createRunStore(root);const run=await store.createRun(compiled.workflow,{});await store.saveRun(run);assert.equal(run.workflowId,compiled.workflow.id);assert.equal(fs.existsSync(path.join(root,'.bob/workflows/runs',run.runId,'run.json')),true);
});

test('cancelled mixed workflow selection never delegates run, step or artifact commands',async t=>{
 const {coreWorkflow}=await setup(t),effects=counters(),vscode=runtime(effects);let picks=0;vscode.window.showQuickPick=async()=>{picks++;return undefined;};const {WorkflowRegisterService}=requireWithVscode('../out/workflowRegisterService.js',vscode);const service=new WorkflowRegisterService('test');t.after(()=>service.dispose());service.coreWorkflows.set(coreWorkflow.id,coreWorkflow);service.coreWorkflows.set('legacy',{id:'legacy',label:'Legacy',name:'Legacy'});for(const name of ['runWorkflow','runWorkflowStep','startFromStepWithArtifacts'])service.runCommands[name]=async()=>{effects.commands++;};for(const invoke of [()=>service.runWorkflow(),()=>service.runWorkflowStep(),()=>service.startFromStepWithArtifacts()])assert.match(await invoke(),/選択されていません/);assert.equal(picks,3);assert.equal(effects.commands,0);
});


test('direct persisted-run commands reject V2 before coordination, saves, gates and engine creation', async t => {
  const { root, coreWorkflow, f } = await setup(t)
  const effects = { save: 0, engine: 0, gate: 0, coordinate: 0, panel: 0 }
  const vscode = runtime(counters())
  const { WorkflowRunCommandService } = requireWithVscode('../out/workflowRunCommands.js', vscode)
  let run = { runId: 'stored', workflowId: coreWorkflow.id, status: 'completed', inputs: {}, state: {}, steps: [], updatedAt: '2026-10-05' }
  const store = { loadRun: async () => structuredClone(run), listRuns: async () => [structuredClone(run)], saveRun: async () => { effects.save++ } }
  const commands = new WorkflowRunCommandService({ coreWorkflows: new Map([[coreWorkflow.id, coreWorkflow]]),
    runtimeFactory: { createRunStore: () => store, createEngine: () => { effects.engine++; throw Error('engine touched') } },
    ensureWorkflowsLoaded: async () => {}, workflowRootCandidates: async () => [{ root }], activeSteps: () => [],
    showManualStepPanel: async () => { effects.panel++ },
    gateRegistry: { pendingForRun: () => { effects.gate++; return { status: 'paused', ownerStepId: 'one' } },
      acceptPending: () => { effects.gate++ }, abortPending: () => { effects.gate++ } },
    coordinateGateDecision: async (_root, _id, _kind, operation) => { effects.coordinate++; return operation() } })
  for (const status of ['completed', 'paused', 'held', 'checkpoint']) {
    run = { ...run, status, steps: [{ id: 'one', status: 'completed' }] }
    const routes = [() => commands.runNextStep('stored'), () => commands.resumeRun('stored'),
      () => commands.retryCurrentStep('stored'), () => commands.approveBranchCheckpoint('stored'),
      () => commands.abortBranchCheckpoint('stored'), () => commands.recoverDetachedHeldRun('stored'),
      () => commands.runNextStepOnce(root, 'stored'), () => commands.resumeOrRetryRunOnce('resume', root, 'stored'),
      () => commands.resumeOrRetryRunOnce('retry', root, 'stored')]
    for (const invoke of routes) {
      await assert.rejects(invoke(), error => error.name === 'WorkflowContractV2BoundaryError')
      assert.deepEqual(effects, { save: 0, engine: 0, gate: 0, coordinate: 0, panel: 0 }, status)
      assert.equal(f.counters.acquire, 0)
    }
  }
})

test('guarded persisted-run loading denies V2 before journal recovery and direct save', async t => {
  const { root, coreWorkflow } = await setup(t)
  const { FileRunStateStore } = require('../out/core/runStateStore')
  const { ContractV2GuardedRunStateStore } = require('../out/workflowContractV2RunStateStore')
  const { compileWorkflowDocument } = require('../out/core/workflowCompiler')
  const legacy = compileWorkflowDocument({ sourceId: 'test', filePath: '.bob/workflows/legacy/WORKFLOW.md',
    text: ['---', 'name: legacy', 'description: Legacy compatibility.', '---', 'Prompt.'].join(String.fromCharCode(10)) }).workflow
  const original = new FileRunStateStore({ workspaceRoot: root })
  const run = await original.createRun(legacy, {})
  await original.saveRun(run)
  run.workflowId = coreWorkflow.id
  run.workflowFile = '.bob/workflows/minimal/current.json'
  const interrupted = new FileRunStateStore({ workspaceRoot: root, durabilityFault: stage => { if (stage === 'afterJournal') throw Error('interrupt') } })
  await assert.rejects(interrupted.saveRun(run), /interrupt/)
  const dir = path.join(root, '.bob/workflows/runs', run.runId)
  const before = fs.readdirSync(dir).sort().map(file => [file, fs.readFileSync(path.join(dir, file)).toString('hex')])
  for (const workflowById of [undefined, id => id === coreWorkflow.id ? coreWorkflow : undefined]) {
    const guarded = new ContractV2GuardedRunStateStore({ workspaceRoot: root, workflowById })
    await assert.rejects(guarded.loadRun(run.runId), error => error.name === 'WorkflowContractV2BoundaryError')
    await assert.rejects(guarded.saveRun(run), error => error.name === 'WorkflowContractV2BoundaryError')
    assert.deepEqual(fs.readdirSync(dir).sort().map(file => [file, fs.readFileSync(path.join(dir, file)).toString('hex')]), before)
  }
})


test('R1_marker_only_records_reject_before_recovery_and_save',async t=>{
 const {root}=await setup(t),{FileRunStateStore}=require('../out/core/runStateStore'),{ContractV2GuardedRunStateStore}=require('../out/workflowContractV2RunStateStore');
 const legacy=require('../out/core/workflowCompiler').compileWorkflowDocument({sourceId:'test',filePath:'.bob/workflows/legacy/WORKFLOW.md',text:['---','name: legacy','description: Legacy.','---','Prompt.'].join('\n')}).workflow;
 for(const marker of [{workflowSchemaVersion:'workflow-register/v2'},{planProvenance:null},{planProvenance:{malformed:true}}]){
  const original=new FileRunStateStore({workspaceRoot:root}),run=await original.createRun(legacy,{});await original.saveRun(run);
  const interrupted=new FileRunStateStore({workspaceRoot:root,durabilityFault:stage=>{if(stage==='afterJournal')throw Error('interrupt');}});
  await assert.rejects(interrupted.saveRun(run),/interrupt/);
  const dir=path.join(root,'.bob/workflows/runs',run.runId),journalPath=path.join(dir,'run-state.journal.json'),journal=JSON.parse(fs.readFileSync(journalPath,'utf8'));
  journal.nextRun.workflowId='unregistered-v2';delete journal.nextRun.workflowFile;Object.assign(journal.nextRun,marker);fs.writeFileSync(journalPath,JSON.stringify(journal));
  const snapshot=()=>fs.readdirSync(dir).sort().map(file=>[file,fs.readFileSync(path.join(dir,file)).toString('hex')]);const before=snapshot();
  const guarded=new ContractV2GuardedRunStateStore({workspaceRoot:root});
  await assert.rejects(guarded.loadRun(run.runId),error=>error.name==='WorkflowContractV2BoundaryError');assert.deepEqual(snapshot(),before);
  // An incoming legacy snapshot must not recover an already marked journal.
  const clean={...run};delete clean.planProvenance;clean.workflowSchemaVersion='legacy';
  await assert.rejects(guarded.saveRun(clean),error=>error.name==='WorkflowContractV2BoundaryError');assert.deepEqual(snapshot(),before);
 }
});

test('R1_marker_only_commands_reject_without_registered_workflow',async t=>{
 const {root}=await setup(t),effects={save:0,engine:0,gate:0,coordinate:0},vscode=runtime(counters());
 const {WorkflowRunCommandService}=requireWithVscode('../out/workflowRunCommands.js',vscode);
 let run={runId:'marker-only',workflowId:'unknown',status:'completed',inputs:{},state:{},steps:[],createdAt:'now',updatedAt:'now',planProvenance:null};
 const store={loadRun:async()=>structuredClone(run),listRuns:async()=>[structuredClone(run)],saveRun:async()=>{effects.save++;}};
 const commands=new WorkflowRunCommandService({coreWorkflows:new Map(),runtimeFactory:{createRunStore:()=>store,createEngine:()=>{effects.engine++;throw Error('engine touched');}},ensureWorkflowsLoaded:async()=>{},workflowRootCandidates:async()=>[{root}],activeSteps:()=>[],gateRegistry:{pendingForRun:()=>{effects.gate++;}},coordinateGateDecision:async()=>{effects.coordinate++;}});
 for(const marker of [{planProvenance:null},{planProvenance:{bad:true}},{workflowSchemaVersion:'workflow-register/v2'}]){
  run={...run,...marker};for(const invoke of [()=>commands.runNextStep('marker-only'),()=>commands.resumeRun('marker-only'),()=>commands.resumeOrRetryRunOnce('resume',root,'marker-only')]){
   await assert.rejects(invoke(),error=>error.name==='WorkflowContractV2BoundaryError');assert.deepEqual(effects,{save:0,engine:0,gate:0,coordinate:0});
  }
 }
});

test('R1_public_paths_have_zero_runtime_effects', async t => {
 // Earlier cases loaded VS Code dependencies with different stubs. Give this
 // real product graph one coherent module realm without loading other tests.
 const outPrefix=path.resolve(__dirname,'../out')+path.sep,savedModules=new Map(Object.entries(require.cache).filter(([p])=>p.startsWith(outPrefix)));
 for(const p of savedModules.keys())delete require.cache[p];
 t.after(()=>{for(const p of Object.keys(require.cache))if(p.startsWith(outPrefix))delete require.cache[p];for(const [p,m]of savedModules)require.cache[p]=m;});
 const {publishNodeFixture}=require('./workflowContractV2EntrypointTestSupport'),fsp=require('node:fs/promises');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'r1-product-observation-'));
 t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
 const published=publishNodeFixture(path.join(root,'.bob/workflows'));
 const pointer=path.join(root,'.bob/workflows/minimal/current.json'),generation=path.join(root,'.bob/workflows',...published.published.base,'workflow.yaml');
 const measured={v2ProductLeaseAcquisitions:0,providerDispatches:0,bobDispatches:0,v2ProductRunDirectoryCreations:0,v2ProductArtifactStages:0};
 let phase='v2',normalBob=0,normalDirectories=0;const observed=[];
 const restores=[];
 function wrap(object,name,observe){const original=object[name];assert.equal(typeof original,'function');object[name]=function(...args){observe.apply(this,args);return original.apply(this,args);};restores.push(()=>{object[name]=original;});}
 const effects=counters(),vscode=runtime(effects);
 vscode.Uri={file:fsPath=>({fsPath})};vscode.RelativePattern=class{constructor(base,pattern){this.base=typeof base==='string'?base:base.fsPath;this.pattern=pattern;}};
 vscode.ViewColumn.One=1;const files=[pointer,generation];
 vscode.workspace.workspaceFolders=[{name:'workspace',uri:{fsPath:root}}];
 vscode.workspace.findFiles=async pattern=>files.filter(p=>{const rel=path.relative(root,p).replaceAll('\\','/'),glob=pattern.pattern??'';return glob.endsWith('current.json')?/^\.bob\/workflows\/[^/]+\/current\.json$/.test(rel):glob.endsWith('workflow.yaml')?/^\.bob\/workflows\/[^/]+\/versions\/[^/]+\/workflow\.yaml$/.test(rel):p.endsWith('WORKFLOW.md');}).map(fsPath=>({fsPath}));
 vscode.workspace.fs={readFile:uri=>fsp.readFile(uri.fsPath)};vscode.workspace.asRelativePath=uri=>path.relative(root,uri.fsPath);
 const registered=[];vscode.extensions={getExtension:id=>id==='IBM.bob-code'?{id:'IBM.bob-code',isActive:true,packageJSON:{version:'2.0.1'},exports:{registerSource:()=>({deactivate(){},log(){},registerWorkflow(w){registered.push(w);return true;}})}}:undefined};
 const panel={webview:{cspSource:'vscode-resource:',html:'',onDidReceiveMessage:()=>({dispose(){}})},onDidDispose:()=>({dispose(){}}),reveal(){},dispose(){}};
 vscode.window.createWebviewPanel=()=>panel;
 const {ActionRegistry}=requireWithVscode('../out/core/actionRegistry.js',vscode),{WorkflowPlanStore}=require('../out/core/contractV2');
 const rf=factory(vscode,effects),{ResultSinkRegistry}=require('../out/core/resultSinkRegistry');
 wrap(WorkflowPlanStore.prototype,'acquire',()=>{if(phase==='v2')measured.v2ProductLeaseAcquisitions++;});
 wrap(Object.getPrototypeOf(rf),'acquireWorkflowPlan',()=>{if(phase==='v2')measured.v2ProductLeaseAcquisitions++;});
 wrap(ActionRegistry.prototype,'execute',()=>{if(phase==='v2')measured.providerDispatches++;});
 for(const name of ['write','writeFileTransaction'])wrap(ResultSinkRegistry.prototype,name,()=>{if(phase==='v2')measured.v2ProductArtifactStages++;});
 const runRoot=path.join(root,'.bob/workflows/runs');
 const observedPath=value=>{const resolved=path.resolve(String(value));return process.platform==='win32'?resolved.toLowerCase():resolved;},observedRunRoots=[runRoot,path.join(fs.realpathSync.native(root),'.bob/workflows/runs')].map(observedPath);
 wrap(fsp,'mkdir',target=>{const p=observedPath(target);if(observedRunRoots.some(runRoot=>p===runRoot||p.startsWith(runRoot+path.sep))){if(phase==='v2')measured.v2ProductRunDirectoryCreations++;else normalDirectories++;}});
 try {
  const store=new WorkflowPlanStore(),registry=new ActionRegistry();
  const gateway=require('../out/workflowContractV2Product').createWorkflowContractV2ProductEntrypoint({actionRegistry:registry,planStore:store});
  const commands=requireWithVscode('../out/commands/validateWorkflow.js',vscode);let reports=0;
  const options={sourceId:'workflow-register',compileCurrentWorkflowPackage:i=>gateway.compileCurrent(i),showMarkdownReport:async()=>{reports++;}};
  await commands.validateWorkspaceWorkflows(options);vscode.window.activeTextEditor={document:{uri:{fsPath:pointer},getText:()=>fs.readFileSync(pointer,'utf8')}};await commands.validateCurrentWorkflow(options);assert.equal(reports,2);observed.push('validation');
  const {registerWorkflows}=requireWithVscode('../out/workflowRegistrationService.js',vscode);
  const register=()=>registerWorkflows({contractV2:gateway,createRunner(workflow){if(workflow.core.contractV2)measured.bobDispatches++;const execute=async()=>{if(workflow.core.contractV2)measured.bobDispatches++;else normalBob++;return true;};return {runSingleWorkflowStep:execute,runTodoStep:execute,runEngineStep:execute};}});
  const first=await register();assert.equal(first.coreWorkflows.length,1,first.result.lines.join('\n'));assert.equal(registered.length,0);observed.push('registration');
  const core=first.coreWorkflows[0];assert.ok(core.contractV2);
  const {OperationHubProvider}=requireWithVscode('../out/gui/operationHubProvider.js',vscode);
  const hub=new OperationHubProvider({api:{listWorkflows:()=>first.coreWorkflows,compileCurrentWorkflowPackage:i=>gateway.compileCurrent(i)},extensionUri:{}});
  try{await hub.open();assert.match(panel.webview.html,/検証のみ・実行不可/);await hub.handleMessage({type:'operationHub.action',action:'runWorkflow',workflowId:core.id,workspaceRoot:root});assert.equal(effects.dispatch,0);}finally{hub.dispose();}
  observed.push('operation_hub');
  const model=require('../out/core/workflowAuthoringDefaults').createAuthoringModelFromTemplate({name:'legacy',description:'Legacy compatibility.',template:'command-then-agent'});
  const draft=require('../out/core/workflowAuthoringStepDraftValidation').validateStepDraft({model,originalStep:model.steps[0],draftStep:model.steps[0],stepIndex:0});assert.notEqual(draft.status,'error');
  const rendered=require('../out/core/workflowAuthoringSerializer').serializeAuthoringModelToMarkdown(model);
  const loaded=require('../out/core/workflowAuthoringLoader').loadAuthoringModelFromMarkdown({sourceId:'workflow-register',filePath:rendered.filePath,text:rendered.markdown});assert.ok(loaded);
  const compiled=require('../out/core/workflowCompiler').compileWorkflowDocument({sourceId:'workflow-register',filePath:rendered.filePath,text:rendered.markdown});assert.equal(compiled.ok,true);assert.equal(compiled.workflow.schemaVersion,'workflow-register/v1');observed.push('authoring');
  // Real factory routes remain closed, including Bob task inspection and direct durable creation.
  const result=await gateway.compileCurrent({slot:require('../out/workflowContractV2View').workflowContractV2CoreBinding(core).slot,consumer:'workspace-registration'});assert.equal(result.ok,true);
  await assert.rejects(rf.createRunStore(root).createRun(core,{}),e=>e.name==='WorkflowContractV2BoundaryError');
  const bound=await setup(t),runner=rf.createBobWorkflowRunner(bound.workflow),task=new Proxy({},{get(){measured.bobDispatches++;throw Error('task accessed');}});
  for(const invoke of [()=>runner.runSingleWorkflowStep(task),()=>runner.runTodoStep({id:'one'},0,task),()=>runner.runEngineStep('one',0,task)])await assert.rejects(invoke(),e=>e.name==='WorkflowContractV2BoundaryError');
  // Attribute ordinary V1 durable/Bob effects separately while keeping the same spies installed.
  phase='legacy';const legacyPath=path.join(root,rendered.filePath);fs.mkdirSync(path.dirname(legacyPath),{recursive:true});fs.writeFileSync(legacyPath,rendered.markdown);files.push(legacyPath);
  const mixed=await register();assert.equal(mixed.coreWorkflows.length,2);assert.equal(registered.length,1,mixed.result.lines.join('\n'));await registered[0].getSteps()[0].execution(Object.fromEntries(['getAllMetadata','getMessages','sendMessage','setStepComplete','startSubagent','toSerializable'].map(name=>[name,async()=>{normalBob++;}])));assert.ok(normalBob>0);
  const publicStore=rf.createRunStore(root),run=await publicStore.createRun(compiled.workflow,{});await publicStore.saveRun(run);assert.ok(fs.existsSync(path.join(runRoot,run.runId,'run.json')));assert.ok(normalDirectories>0);observed.push('legacy_v1');
  assert.deepEqual(measured,{v2ProductLeaseAcquisitions:0,providerDispatches:0,bobDispatches:0,v2ProductRunDirectoryCreations:0,v2ProductArtifactStages:0});
  const observation={schemaVersion:'workflow-r1-product-wiring/v1',counterScope:'contract_v2_product_paths',observedProductSurfaces:observed,...measured};
  function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
  console.log('R1_PRODUCT_WIRING_BASE64='+Buffer.from(JSON.stringify(canonical(observation))+'\n').toString('base64'));
 }finally{for(const restore of restores.reverse())restore();}
});
