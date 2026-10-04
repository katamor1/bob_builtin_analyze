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
