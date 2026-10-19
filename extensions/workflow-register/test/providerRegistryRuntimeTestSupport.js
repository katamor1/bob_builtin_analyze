const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os')
const base=require('./contributionRegistryTestSupport'),{requireWithVscode}=require('./workflowContractV2EntrypointTestSupport')
function exported(module,name){const file=path.join(__dirname,'../out',module+'.js');assert(fs.existsSync(file),module+' runtime boundary is missing');const value=require(file)[name];assert.equal(typeof value,'function',name+' runtime boundary is missing');return value}
function root(t){const value=fs.mkdtempSync(path.join(os.tmpdir(),'registry-runtime-'));t.after(()=>fs.rmSync(value,{recursive:true,force:true}));return value}
const input=(runId='run-one')=>({workflowId:'fixture',runId,stepId:'step',text:'fixture text',inputs:{},state:{}})
function ownedSinks(x,workspaceRoot,extra={}){
 const {ResultSinkRegistry}=require('../out/core/resultSinkRegistry')
 return new ResultSinkRegistry({workspaceRoot,contributions:x.runtime,legacyHandler:type=>x.registry.getLegacyResultSink(type),listTypes:()=>x.registry.snapshotContributions().resultSinks.map(sink=>sink.type),...extra})
}
function vscodeStub(){
 const own={id:'local.workflow-register',version:'0.1.0',extensionRoot:path.resolve(__dirname,'..')},events=[]
 const vscode={ViewColumn:{Active:1},extensions:{getExtension:id=>id===own.id?{id,extensionPath:own.extensionRoot,packageJSON:{name:'workflow-register',publisher:'local',version:own.version}}:undefined},
  workspace:{isTrusted:true,workspaceFolders:[],getConfiguration:()=>({get:(key,value)=>key==='taskSnapshots.enabled'?false:value}),createFileSystemWatcher:()=>({onDidCreate(){},onDidChange(){},onDidDelete(){},dispose(){events.push('watcher')}})},
  commands:{executeCommand:async()=>undefined},window:{showWarningMessage:async()=>undefined,showInformationMessage:async()=>undefined,showErrorMessage:async()=>undefined}}
 return {own,events,vscode}
}
function factory(x){const {vscode}=vscodeStub(),{WorkflowRuntimeFactory}=requireWithVscode('../out/workflowRuntimeFactory.js',vscode);return new WorkflowRuntimeFactory({engineVersion:'test',actionRegistry:x.registry,ownedBuiltIns:true,customResultSinks:[],agentProvider:()=>undefined,stepRuntime:{},gateRegistry:{},inputsProvider:()=>({})})}
function service(){const stub=vscodeStub(),{WorkflowRegisterService}=requireWithVscode('../out/workflowRegisterService.js',stub.vscode);return {...stub,service:new WorkflowRegisterService('test',stub.own)}}
module.exports={...base,exported,root,input,ownedSinks,vscodeStub,requireWithVscode,factory,service}
