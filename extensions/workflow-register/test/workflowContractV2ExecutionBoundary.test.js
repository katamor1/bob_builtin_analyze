const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {test}=require('node:test')
const {fixture,requireWithVscode}=require('./workflowContractV2EntrypointTestSupport')
async function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'p6-boundary-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=fixture(),result=await f.entrypoint.compileCurrent({slot:f.slot,consumer:'workspace-registration'});const view=require('../out/workflowContractV2View').adaptCompiledWorkflowForProduct({handle:result.handle,rawPackage:result.rawPackage,slot:f.slot,root:{root,name:'workspace',workspaceFolderName:'workspace',marker:'.bob',depth:0},currentPointer:{fsPath:path.join(root,'.bob/workflows/minimal/current.json')}});require('../out/workflowContractV2View').freezeWorkflowContractV2View(view.workflow);return {root,f,...view};}
function runtime(effects){const vscode={ViewColumn:{Active:1},commands:{executeCommand:async()=>{effects.dispatch++;}},workspace:{isTrusted:true,workspaceFolders:[],getConfiguration:()=>({get:(_k,d)=>d}),createFileSystemWatcher:()=>({onDidCreate(){},onDidChange(){},onDidDelete(){},dispose(){}})},window:{showInputBox:async()=>{effects.inputs++;},showQuickPick:async()=>{effects.inputs++;},showWarningMessage:async()=>{},showInformationMessage:async()=>{},showErrorMessage:async()=>{},createWebviewPanel:()=>{effects.bob++;throw Error('panel');}}};return vscode;}
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
