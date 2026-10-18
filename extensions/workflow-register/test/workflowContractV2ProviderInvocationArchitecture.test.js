const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const {test}=require('node:test')
const {fixture,requireWithVscode}=require('./workflowContractV2EntrypointTestSupport')
async function setup(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'p6-boundary-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const f=fixture(),result=await f.entrypoint.compileCurrent({slot:f.slot,consumer:'workspace-registration'});const view=require('../out/workflowContractV2View').adaptCompiledWorkflowForProduct({handle:result.handle,rawPackage:result.rawPackage,slot:f.slot,root:{root,name:'workspace',workspaceFolderName:'workspace',marker:'.bob',depth:0},currentPointer:{fsPath:path.join(root,'.bob/workflows/minimal/current.json')}});require('../out/workflowContractV2View').freezeWorkflowContractV2View(view.workflow);return {root,f,...view};}
function runtime(effects){const vscode={ViewColumn:{Active:1},commands:{executeCommand:async()=>{effects.dispatch++;}},workspace:{isTrusted:true,workspaceFolders:[],getConfiguration:()=>({get:(_k,d)=>d}),createFileSystemWatcher:()=>({onDidCreate(){},onDidChange(){},onDidDelete(){},dispose(){}})},window:{showInputBox:async()=>{effects.inputs++;},showQuickPick:async()=>{effects.inputs++;},showWarningMessage:async()=>{},showInformationMessage:async()=>{},showErrorMessage:async()=>{},createWebviewPanel:()=>{effects.bob++;throw Error('panel');}}};return vscode;}
function factory(vscode,effects){const {WorkflowRuntimeFactory}=requireWithVscode('../out/workflowRuntimeFactory.js',vscode);const {ActionRegistry}=requireWithVscode('../out/core/actionRegistry.js',vscode);return new WorkflowRuntimeFactory({engineVersion:'test',actionRegistry:new ActionRegistry(),customResultSinks:[],stepRuntime:{hold(){effects.bob++;}},agentProvider:()=>undefined,inputsProvider:()=>{effects.inputs++;return {};},gateRegistry:{}});}
function counters(){return {inputs:0,dispatch:0,bob:0,commands:0};}
function zero(effects,f,root){assert.deepEqual(effects,counters());assert.equal(f.counters.acquire,0);assert.equal(f.counters.dispatch,0);assert.equal(fs.existsSync(path.join(root,'.bob/workflows/runs')),false);}

const reachability = require('../scripts/check-contract-v2-runtime-reachability')
const bridgeModule = { path: 'src/core/contractV2/providerRegistry.ts', text: 'export class WorkflowProviderRegistry {} export function bindWorkflowProvider(value: unknown) { return value } export function invokeBoundWorkflowProviderDispatch(value: unknown) { return value }' }
test('R2 bridge aliases and namespace escapes cannot grant product authority', () => {
  const validate = text => reachability.validateContractV2ProductReachability([{ path: 'src/product.ts', text }, bridgeModule], ['src/product.ts'])
  assert.equal(validate('import { WorkflowProviderRegistry as Registry, bindWorkflowProvider as bind } from "./core/contractV2/providerRegistry"; const registry = new Registry(); bind({});'), undefined)
  assert.equal(validate('const { WorkflowProviderRegistry: Registry } = require("./core/contractV2/providerRegistry"); new Registry();'), undefined)
  for (const statement of [
    'import { invokeBoundWorkflowProviderDispatch as alias } from "./core/contractV2/providerRegistry"; alias({}, {});',
    'const { invokeBoundWorkflowProviderDispatch: alias } = require("./core/contractV2/providerRegistry"); alias({}, {});',
    'const { ["invokeBoundWorkflowProviderDispatch"]: alias } = require("./core/contractV2/providerRegistry"); alias({}, {});',
    'import * as providers from "./core/contractV2/providerRegistry"; const alias = providers; alias.invokeBoundWorkflowProviderDispatch({}, {});',
    'const providers = require("./core/contractV2/providerRegistry"); const alias = providers["invokeBoundWorkflowProviderDispatch"]; alias({}, {});',
    'export { invokeBoundWorkflowProviderDispatch as alias } from "./core/contractV2/providerRegistry";',
    'export * from "./core/contractV2/providerRegistry";',
    'export * as providers from "./core/contractV2/providerRegistry";',
    'import providers = require("./core/contractV2/providerRegistry");',
    'const providers = import("./core/contractV2/providerRegistry");'
  ]) assert.throws(() => validate(statement), /runtime|private|bridge|authority|reachability/, statement)
})
test('R2 bridge value imports have a single owner even outside product roots', () => {
  const owner = { path: 'src/core/contractV2/providerInvocation.ts', text: 'import { invokeBoundWorkflowProviderDispatch } from "./providerRegistry";' }
  const root = { path: 'src/product.ts', text: 'export const safe = true;' }
  assert.equal(reachability.validateContractV2ProductReachability([root, owner, bridgeModule], [root.path]), undefined)
  for (const text of ['import { invokeBoundWorkflowProviderDispatch as alias } from "./core/contractV2/providerRegistry";', 'export * from "./core/contractV2/providerRegistry";', 'const {invokeBoundWorkflowProviderDispatch: alias}=require("./core/contractV2/providerRegistry");']) {
    assert.throws(() => reachability.validateContractV2ProductReachability([root, bridgeModule, { path: 'src/hidden.ts', text }], [root.path]), /runtime|private|bridge|authority|reachability/)
  }
})
test('R2 envelope and staging cannot be value-imported by product routes', () => {
  for (const name of ['providerEnvelopeSnapshot', 'providerAttemptStaging', 'providerInvocation']) for (const statement of [`import { x } from "./core/contractV2/${name}";`, `export * from "./core/contractV2/${name}";`, `const x=require("./core/contractV2/${name}");`]) {
    assert.throws(() => reachability.validateContractV2ProductReachability([{ path: 'src/product.ts', text: statement }, { path: `src/core/contractV2/${name}.ts`, text: 'export const x=1;' }], ['src/product.ts']), /runtime|private|reachability/)
  }
  reachability.assertContractV2ProductRuntimeUnreachable()
})
test('R2 bridge remains a single captured call without validation retry or state ownership', () => {
  const ts = require('typescript'), source = fs.readFileSync(path.join(__dirname, '../src/core/contractV2/providerRegistry.ts'), 'utf8')
  const tree = ts.createSourceFile('registry.ts', source, ts.ScriptTarget.Latest, true)
  const bridge = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'invokeBoundWorkflowProviderDispatch')
  assert.ok(bridge?.body)
  const calls = []; const walk = node => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'reflectApply') calls.push(node); assert.equal(ts.isTryStatement(node) || ts.isForStatement(node) || ts.isWhileStatement(node), false); ts.forEachChild(node, walk) }; walk(bridge.body)
  assert.equal(calls.length, 1); assert.doesNotMatch(bridge.body.getText(tree), /canonical|validate|retry|artifact|commit|saveRun|planStore/)
})
test('R2 VSIX policy requires each of the three private emitted modules', async t => {
  const { ZipFile } = require('yazl'), { spawnSync } = require('node:child_process')
  const required = ['providerEnvelopeSnapshot', 'providerAttemptStaging', 'providerInvocation'].map(n => 'extension/out/core/contractV2/' + n + '.js')
  const old = ['core/contractV2/planLease', 'core/contractV2/runPlanProvenance', 'core/contractV2/runPlanLeaseContext', 'core/contractV2/runPlanState', 'core/contractV2/runLeaseExecutionCoordinator', 'core/contractV2/index', 'core/runtime/runStateCodec', 'core/runProvenance', 'workflowContractV2ExecutionGuard', 'workflowContractV2LeasedRunStateStore', 'workflowContractV2RuntimeBoundary', 'workflowContractV2RunStateStore', 'workflowRunCommands', 'workflowContractV2Product', 'workflowContractV2Entrypoint', 'workflowContractV2ProviderLifecycle'].map(n => 'extension/out/' + n + '.js')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'r2-policy-'))
  t.after(() => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); fs.rmSync(root, { recursive: true, force: true }) })
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'r2-policy', version: '1.0.0', main: './out/extension.js' }))
  for (const missing of [undefined, ...required]) {
    const zip = new ZipFile()
    for (const name of ['extension/package.json', 'extension/out/extension.js', ...old, ...required]) if (name !== missing) zip.addBuffer(Buffer.from('{}'), name)
    zip.end(); const chunks = []; await new Promise((resolve, reject) => zip.outputStream.on('data', b => chunks.push(b)).on('end', resolve).on('error', reject))
    fs.writeFileSync(path.join(root, 'r2-policy-1.0.0.vsix'), Buffer.concat(chunks))
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/check-vsix-policy.js'), '--max-bytes', '1200000'], { cwd: root, encoding: 'utf8', windowsHide: true })
    if (missing) { assert.notEqual(result.status, 0, missing); assert.ok(result.stderr.includes('Missing required VSIX entry: ' + missing)) }
    else assert.equal(result.status, 0, result.stderr)
  }
})

test('R2_product_paths_remain_unreachable', async t => {
 // Earlier cases loaded VS Code dependencies with different stubs. Give this
 // real product graph one coherent module realm without loading other tests.
 const outPrefix=path.resolve(__dirname,'../out')+path.sep,savedModules=new Map(Object.entries(require.cache).filter(([p])=>p.startsWith(outPrefix)));
 for(const p of savedModules.keys())delete require.cache[p];
 t.after(()=>{for(const p of Object.keys(require.cache))if(p.startsWith(outPrefix))delete require.cache[p];for(const [p,m]of savedModules)require.cache[p]=m;});
 const {publishNodeFixture}=require('./workflowContractV2EntrypointTestSupport'),fsp=require('node:fs/promises');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'r2-product-observation-'));
 t.after(()=>{assert.equal(path.dirname(root),path.resolve(os.tmpdir()));fs.rmSync(root,{recursive:true,force:true});});
 const {fixtureR2}=require('./workflowContractV2ProviderInvocationTestSupport');
 const compiledFixture=await fixtureR2(t,{sideEffect:'workspace-write'});
 const {MemoryPackageFileSystem,installPublished}=require('./workflowContractV2PackageLoaderTestSupport');
 const packageFs=new MemoryPackageFileSystem(),published={published:installPublished(packageFs,'minimal',compiledFixture.packageFiles)};
 const collection=path.join(root,'.bob/workflows'),destination=path.join(collection,...published.published.base);fs.mkdirSync(destination,{recursive:true});
 for(const [name,bytes]of Object.entries(compiledFixture.packageFiles)){const target=path.join(destination,...name.split('/'));fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,bytes);}
 fs.writeFileSync(path.join(collection,'minimal/current.json'),packageFs.entries.get('minimal/current.json').bytes);
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
 wrap(require('../out/core/contractV2/providerRegistry'),'invokeBoundWorkflowProviderDispatch',()=>{if(phase==='v2')measured.providerDispatches++;});
 wrap(require('../out/core/contractV2/providerInvocation'),'invokeCompiledWorkflowProvider',()=>{if(phase==='v2')measured.providerDispatches++;});
 wrap(require('../out/core/contractV2/providerAttemptStaging'),'beginWorkflowAttemptInvocation',()=>{if(phase==='v2')measured.v2ProductArtifactStages++;});
 for(const name of ['write','writeFileTransaction'])wrap(ResultSinkRegistry.prototype,name,()=>{if(phase==='v2')measured.v2ProductArtifactStages++;});
 const runRoot=path.join(root,'.bob/workflows/runs');
 const observedPath=value=>{const resolved=path.resolve(String(value));return process.platform==='win32'?resolved.toLowerCase():resolved;},observedRunRoots=[runRoot,path.join(fs.realpathSync.native(root),'.bob/workflows/runs')].map(observedPath);
 wrap(fsp,'mkdir',target=>{const p=observedPath(target);if(observedRunRoots.some(runRoot=>p===runRoot||p.startsWith(runRoot+path.sep))){if(phase==='v2')measured.v2ProductRunDirectoryCreations++;else normalDirectories++;}});
 try {
  const store=new WorkflowPlanStore(),registry=new ActionRegistry();
  const evidence=compiledFixture.catalog.evidence.providers[0],contract={...evidence,dispatch(){measured.providerDispatches++;return {};}};delete contract.contractDigest;
  registry.registerWorkflowProviderContract({sourceId:'r2-product-observation',contract});
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
  const observation={schemaVersion:'workflow-r2-product-wiring/v1',counterScope:'contract_v2_product_paths',observedProductSurfaces:observed,...measured};
  function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
  console.log('R2_PRODUCT_WIRING_BASE64='+Buffer.from(JSON.stringify(canonical(observation))+'\n').toString('base64'));
 }finally{for(const restore of restores.reverse())restore();}
});
