import fs from 'node:fs';
import path from 'node:path';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const script=fileURLToPath(import.meta.url),repository=path.resolve(path.dirname(script),'..'),powershellScript=path.join(path.dirname(script),'t17-path-native-unc-fixture.ps1'),require=createRequire(import.meta.url);
const fixtureSchema='bob-builtin-analyze/t17-path-native-unc-fixture/v1',psSchema='bob-builtin-analyze/t17-path-native-unc-powershell/v1',markerSchema='bob-builtin-analyze/t17-path-native-unc-owner/v1';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const fail=reason=>{throw new TypeError('native UNC fixture: '+reason);};
function data(value,keys,label){
 if(!value||typeof value!=='object'||Array.isArray(value)||![null,Object.prototype].includes(Object.getPrototypeOf(value)))fail(label+' input');
 const descriptors=Object.getOwnPropertyDescriptors(value),names=Reflect.ownKeys(descriptors);
 if(names.length!==keys.length||names.some(name=>typeof name!=='string'||!keys.includes(name)))fail(label+' exact input keys');
 const result={};for(const key of keys){const d=descriptors[key];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)fail(label+' own data input');result[key]=d.value;}return result;
}
function text(value,label,maximum=4096){if(typeof value!=='string'||!value||Buffer.byteLength(value)>maximum||value.trim()!==value||value.normalize('NFC')!==value||/[\u0000-\u001f\u007f-\u009f\ud800-\udfff]/u.test(value))fail(label+' input');return value;}
function digest(value,label,pattern=/^[a-f0-9]{40}$/){if(typeof value!=='string'||!pattern.test(value))fail(label+' subject');return value;}
function same(a,b){return process.platform==='win32'?path.normalize(a).toLowerCase()===path.normalize(b).toLowerCase():path.normalize(a)===path.normalize(b);}
function contained(root,value){const relative=path.relative(root,value);return relative===''||relative!=='..'&&!relative.startsWith('..'+path.sep)&&!path.isAbsolute(relative);}
// This bootstrap owns only fresh nonce directories under RUNNER_TEMP. It has no
// dependency on product output or a prebuilt package during root contract tests.
function physical(value,{missing=false,directory=false}={}){
 text(value,'path');if(!path.isAbsolute(value)||process.platform==='win32'&&!/^[A-Za-z]:[\\/]/u.test(value))fail('absolute local path required');
 const parsed=path.parse(value),parts=value.slice(parsed.root.length).split(/[\\/]/u);if(parts.length===1&&parts[0]==='')parts.pop();
 if(parts.some(part=>!part||part==='.'||part==='..'||part.trim()!==part))fail('raw path rejected');
 let current=parsed.root,prior;
 for(let i=-1;i<parts.length;i++){
  if(i>=0){if(!prior?.isDirectory())fail('path ancestor not directory');current=path.join(current,parts[i]);}
  let stat;try{stat=fs.lstatSync(current);}catch(error){if(missing&&error.code==='ENOENT'&&i===parts.length-1&&prior?.isDirectory())return path.resolve(value);throw error;}
  if(stat.isSymbolicLink()||!same(current,fs.realpathSync.native(current)))fail('path alias rejected');prior=stat;
 }
 if(directory&&!prior?.isDirectory())fail('path not directory');return path.resolve(value);
}
function binding(file){physical(file);const before=fs.statSync(file,{bigint:true});if(!before.isFile()||before.nlink!==1n||before.size>1048576n)fail('nonregular or excessive evidence file');const bytes=fs.readFileSync(file),after=fs.statSync(file,{bigint:true});for(const key of ['dev','ino','nlink','size','mtimeNs','ctimeNs'])if(before[key]!==after[key])fail('evidence file changed');return{path:file,bytes:bytes.length,sha256:hash(bytes)};}
function bound(value){const row=data(value,['path','bytes','sha256'],'binding');text(row.path,'binding path');if(!Number.isSafeInteger(row.bytes)||row.bytes<=0)fail('binding bytes');digest(row.sha256,'binding hash',/^[a-f0-9]{64}$/);const actual=binding(row.path);if(actual.bytes!==row.bytes||actual.sha256!==row.sha256)fail('binding changed');return fs.readFileSync(row.path);}
function emit(file,value){fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});return binding(file);}
function context(value){
 const c=data(value,['platform','githubActions','runnerOS','runnerTemp','headSha','treeSha','verifiedHeadSha','event','dispatchNonce'],'runner');
 if(c.platform!=='win32'||c.githubActions!=='true'||c.runnerOS!=='Windows')fail('Windows GitHub runner/CI required');
 digest(c.headSha,'head');digest(c.treeSha,'tree');digest(c.verifiedHeadSha,'verified head');if(c.headSha!==c.verifiedHeadSha||!['push','pull_request','workflow_dispatch'].includes(c.event))fail('unverified runner subject');
 if(c.event==='workflow_dispatch')digest(c.dispatchNonce,'dispatch nonce',/^[a-f0-9]{32}$/);else if(c.dispatchNonce!==null)fail('unexpected dispatch subject');
 c.runnerTemp=physical(c.runnerTemp,{directory:true});return c;
}
function freshRoot(raw,c,nonce){text(raw,'fixture root',200);if(!path.basename(raw).includes(nonce))fail('fixture directory nonce');const resolved=physical(raw,{missing:true});if(!contained(c.runnerTemp,resolved)||same(c.runnerTemp,resolved))fail('fixture path outside runner temp');if(fs.existsSync(resolved))fail('fixture path already exists');return resolved;}
function mkdirFresh(root){fs.mkdirSync(root,{recursive:false});physical(root,{directory:true});}
function ownerFields(owner){return{schemaVersion:markerSchema,sourceHeadSha:owner.sourceHeadSha,sourceTreeSha:owner.sourceTreeSha,nonce:owner.nonce,fixtureRoot:owner.fixtureRoot,shareName:owner.shareName,runnerPrincipal:owner.runnerPrincipal,runnerSid:owner.runnerSid};}
function identity(value){const row=data(value,['principal','sid'],'identity');text(row.principal,'runner principal',256);if(typeof row.sid!=='string'||!/^S-1(?:-\d+){2,15}$/u.test(row.sid))fail('runner identity SID');return row;}
function verifyShare(value,owner){
 const share=data(value,['name','path','description','scopeName','access'],'share');
 if(share.name!==owner.shareName||!same(text(share.path,'share path'),owner.fixtureRoot)||share.description!=='bob-t17-path:'+owner.nonce+':'+owner.sourceHeadSha||share.scopeName!=='*')fail('share ownership path/name/subject mismatch');
 if(!Array.isArray(share.access)||share.access.length!==1)fail('share principal ACL mismatch');const access=data(share.access[0],['principal','sid','type','right'],'share ACL');
 if(access.principal!==owner.runnerPrincipal||access.sid!==owner.runnerSid||access.type!=='Allow'||access.right!=='Full')fail('share principal ACL mismatch');return share;
}
function verifyObservation(value,owner,probe){
 const row=data(value,['root','file','links'],'UNC observations'),root=data(row.root,['path','realpath','isDirectory'],'UNC root'),file=data(row.file,['path','realpath','isFile','bytes','sha256'],'UNC file');
 const expected=owner.uncRoot+'\\日本語 space.txt',winSame=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.win32.normalize(a).toLowerCase()===path.win32.normalize(b).toLowerCase();
 if(root.path!==owner.uncRoot||!winSame(root.realpath,owner.uncRoot)||root.isDirectory!==true||file.path!==expected||!winSame(file.realpath,expected)||file.isFile!==true||file.bytes!==probe.bytes||file.sha256!==probe.sha256)fail('UNC native lstat/realpath/read mismatch');
 if(!Array.isArray(row.links)||row.links.length!==3)fail('UNC link inventory');for(const [i,name]of ['root-link','parent-link','target-link'].entries()){const link=data(row.links[i],['path','isSymbolicLink'],'UNC link');if(link.path!==owner.uncRoot+'\\'+name||link.isSymbolicLink!==true)fail('UNC link observation');}return row;
}
function createDriver(adapter,controlled){
 const mode=controlled?'controlled_test_adapter':'native_windows_runner';
 async function runPs(operation,owner,evidence,logs){
  const executable=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',powershellScript,'-Mode',operation,'-FixtureRoot',owner.fixtureRoot,'-EvidenceRoot',evidence,'-Nonce',owner.nonce,'-SourceHeadSha',owner.sourceHeadSha,'-SourceTreeSha',owner.sourceTreeSha];
  if(owner.runnerPrincipal)args.push('-RunnerPrincipal',owner.runnerPrincipal,'-RunnerSid',owner.runnerSid);
  const response=await adapter.executePowerShell({executable,args});const result=data(response,['exitCode','stdout','stderr'],'PowerShell result');
  if(!Number.isInteger(result.exitCode)||typeof result.stdout!=='string'||typeof result.stderr!=='string'||Buffer.byteLength(result.stdout)+Buffer.byteLength(result.stderr)>65536)fail('PowerShell result bounds');
  logs.push(emit(path.join(evidence,'powershell-'+String(logs.length).padStart(2,'0')+'-'+operation+'.json'),{executable,args,...result}));
  let parsed;try{parsed=JSON.parse(result.stdout);}catch{fail('PowerShell fixture protocol failed');}
  const row=data(parsed,['schemaVersion','operation','state','identity','share','created','removed','error'],'PowerShell fixture');
  if(row.schemaVersion!==psSchema||row.operation!==operation||!['ok','failed'].includes(row.state)||typeof row.created!=='boolean'||typeof row.removed!=='boolean')fail('PowerShell fixture protocol mismatch');
  row.identity=identity(row.identity);if(operation!=='identity'&&(row.identity.principal!==owner.runnerPrincipal||row.identity.sid!==owner.runnerSid))fail('PowerShell runner identity changed');
  if(row.state!=='ok'||result.exitCode!==0||result.stderr!==''){const error=new Error('native UNC fixture: share command failed: '+String(row.error||operation).slice(0,512));error.fixtureCreated=row.created;throw error;}
  if(row.error!==null||operation!=='create'&&row.created||operation!=='remove'&&row.removed)fail('PowerShell fixture state mismatch');return row;
 }
 async function removeOwned(owner,evidence,logs){const query=await runPs('query',owner,evidence,logs);if(!query.share)fail('share missing or already removed');verifyShare(query.share,owner);const removed=await runPs('remove',owner,evidence,logs);if(removed.removed!==true||removed.share!==null)fail('share removal unconfirmed');const after=await runPs('query',owner,evidence,logs);if(after.share!==null)fail('share removal not observed');}
 async function prepareNativeUncFixture(value){
  const input=data(value,['fixtureRoot','evidenceRoot','nonce'],'prepare');digest(input.nonce,'nonce',/^[a-f0-9]{32}$/);const c=context(await adapter.context());
  const fixtureRoot=freshRoot(input.fixtureRoot,c,input.nonce),evidenceRoot=freshRoot(input.evidenceRoot,c,input.nonce);if(contained(fixtureRoot,evidenceRoot)||contained(evidenceRoot,fixtureRoot))fail('fixture/evidence paths overlap');
  mkdirFresh(fixtureRoot);mkdirFresh(evidenceRoot);
  const owner={sourceHeadSha:c.headSha,sourceTreeSha:c.treeSha,nonce:input.nonce,fixtureRoot,evidenceRoot,shareName:'bob-t17path-'+input.nonce,uncRoot:'\\\\127.0.0.1\\bob-t17path-'+input.nonce,runnerPrincipal:'',runnerSid:''},logs=[];let created=false,cleanup='not_created';
  try{
   const actor=(await runPs('identity',owner,evidenceRoot,logs)).identity;owner.runnerPrincipal=actor.principal;owner.runnerSid=actor.sid;
   const marker=emit(path.join(fixtureRoot,'.t17-path-owner.json'),ownerFields(owner)),probePath=path.join(fixtureRoot,'日本語 space.txt');fs.writeFileSync(probePath,'t17-path native UNC evidence\n',{flag:'wx'});
   const content=path.join(fixtureRoot,'content');fs.mkdirSync(content);fs.writeFileSync(path.join(content,'inner.txt'),'owned nested UNC evidence\n',{flag:'wx'});for(const name of ['root-link','parent-link','target-link'])fs.symlinkSync(content,path.join(fixtureRoot,name),'junction');
   const before=await runPs('query',owner,evidenceRoot,logs);if(before.share!==null)fail('foreign or existing share collision');
   try{const result=await runPs('create',owner,evidenceRoot,logs);created=result.created;if(!created)fail('share creation unconfirmed');}catch(error){created=error.fixtureCreated===true||created;throw error;}
   const observedShare=verifyShare((await runPs('query',owner,evidenceRoot,logs)).share,owner),probe=binding(probePath),observations=verifyObservation(await adapter.observeUnc(owner),owner,probe);
   const observation=emit(path.join(evidenceRoot,'native-unc-observations.json'),{schemaVersion:'bob-builtin-analyze/t17-path-native-unc-observations/v1',executionMode:mode,state:controlled?'controlled_passed':'passed',sourceHeadSha:c.headSha,sourceTreeSha:c.treeSha,nonce:owner.nonce,...observations});
   const manifest={schemaVersion:fixtureSchema,executionMode:mode,state:controlled?'controlled_ready':'ready',sourceHeadSha:c.headSha,sourceTreeSha:c.treeSha,ci:{event:c.event,verifiedHeadSha:c.verifiedHeadSha,dispatchNonce:c.dispatchNonce},nonce:owner.nonce,fixtureRoot,evidenceRoot,shareName:owner.shareName,uncRoot:owner.uncRoot,runnerPrincipal:owner.runnerPrincipal,runnerSid:owner.runnerSid,createdByThisInvocation:true,share:observedShare,bindings:{ownerMarker:marker,probeFile:probe,nestedProbeFile:binding(path.join(content,'inner.txt')),observations:observation,powershellScript:binding(powershellScript),driverScript:binding(script),powershellLogs:logs}};
   const manifestPath=path.join(evidenceRoot,'native-unc-fixture.json');emit(manifestPath,manifest);return{manifestPath};
  }catch(error){
   if(created){try{await removeOwned(owner,evidenceRoot,logs);cleanup='removed_owned_definition';}catch(cleanupError){cleanup='unconfirmed: '+String(cleanupError.message).slice(0,512);}}
   emit(path.join(evidenceRoot,'native-unc-fixture.failed.json'),{schemaVersion:fixtureSchema,executionMode:mode,state:'failed',...owner,createdByThisInvocation:created,cleanup,error:String(error.message).slice(0,1024),powershellLogs:logs});throw error;
  }
 }
 async function disposeNativeUncFixture(value){
  const input=data(value,['fixtureManifestPath','evidenceRoot'],'dispose'),c=context(await adapter.context());physical(input.fixtureManifestPath);if(!contained(c.runnerTemp,input.fixtureManifestPath))fail('fixture manifest outside runner temp');
  const bytes=fs.readFileSync(input.fixtureManifestPath),manifest=data(JSON.parse(bytes),['schemaVersion','executionMode','state','sourceHeadSha','sourceTreeSha','ci','nonce','fixtureRoot','evidenceRoot','shareName','uncRoot','runnerPrincipal','runnerSid','createdByThisInvocation','share','bindings'],'fixture manifest');
  if(manifest.schemaVersion!==fixtureSchema||manifest.executionMode!==mode||manifest.state!==(controlled?'controlled_ready':'ready')||manifest.createdByThisInvocation!==true||manifest.sourceHeadSha!==c.headSha||manifest.sourceTreeSha!==c.treeSha)fail('fixture manifest ownership/subject/state mismatch');
  digest(manifest.nonce,'nonce',/^[a-f0-9]{32}$/);if(manifest.shareName!=='bob-t17path-'+manifest.nonce||manifest.uncRoot!=='\\\\127.0.0.1\\'+manifest.shareName)fail('fixture manifest share identity');
  const ci=data(manifest.ci,['event','verifiedHeadSha','dispatchNonce'],'fixture CI');if(ci.event!==c.event||ci.verifiedHeadSha!==c.headSha||ci.dispatchNonce!==c.dispatchNonce)fail('fixture manifest CI subject');
  physical(manifest.fixtureRoot,{directory:true});physical(manifest.evidenceRoot,{directory:true});if(!contained(c.runnerTemp,manifest.fixtureRoot)||!contained(c.runnerTemp,manifest.evidenceRoot)||!same(path.join(manifest.evidenceRoot,'native-unc-fixture.json'),input.fixtureManifestPath))fail('fixture owner location');
  const bindings=data(manifest.bindings,['ownerMarker','probeFile','nestedProbeFile','observations','powershellScript','driverScript','powershellLogs'],'fixture bindings');
  const expectedBindings = {
   ownerMarker: path.join(manifest.fixtureRoot,'.t17-path-owner.json'),
   probeFile: path.join(manifest.fixtureRoot,'日本語 space.txt'),
   nestedProbeFile: path.join(manifest.fixtureRoot,'content','inner.txt'),
   observations: path.join(manifest.evidenceRoot,'native-unc-observations.json'),
   powershellScript,
   driverScript: script
  };
  const verifyLocation = (value, expected) => {
   const row = data(value,['path','bytes','sha256'],'fixture binding');
   if (!same(text(row.path,'fixture binding path'),expected)) fail('fixture binding owner mismatch');
  };
  for (const [name,expected] of Object.entries(expectedBindings)) verifyLocation(bindings[name],expected);
  const operations = ['identity','query','create','query'];
  if (!Array.isArray(bindings.powershellLogs) || bindings.powershellLogs.length !== operations.length) fail('fixture PowerShell log inventory');
  for (const [index,operation] of operations.entries()) {
   const name = 'powershell-'+String(index).padStart(2,'0')+'-'+operation+'.json';
   verifyLocation(bindings.powershellLogs[index],path.join(manifest.evidenceRoot,name));
  }
  for (const name of Object.keys(expectedBindings)) if (name !== 'ownerMarker') bound(bindings[name]);
  for (const row of bindings.powershellLogs) bound(row);
  const marker=data(JSON.parse(bound(bindings.ownerMarker)),Object.keys(ownerFields(manifest)),'fixture owner marker');if(JSON.stringify(marker)!==JSON.stringify(ownerFields(manifest)))fail('fixture marker ownership mismatch');verifyShare(manifest.share,manifest);
  const evidenceRoot=freshRoot(input.evidenceRoot,c,manifest.nonce);if(contained(manifest.fixtureRoot,evidenceRoot)||contained(manifest.evidenceRoot,evidenceRoot))fail('cleanup evidence overlaps fixture');mkdirFresh(evidenceRoot);const logs=[];
  try{await removeOwned(manifest,evidenceRoot,logs);const receiptPath=path.join(evidenceRoot,'native-unc-cleanup.json');emit(receiptPath,{schemaVersion:'bob-builtin-analyze/t17-path-native-unc-cleanup/v1',executionMode:mode,state:controlled?'controlled_disposed':'disposed',sourceHeadSha:c.headSha,sourceTreeSha:c.treeSha,nonce:manifest.nonce,shareName:manifest.shareName,fixtureRoot:manifest.fixtureRoot,runnerPrincipal:manifest.runnerPrincipal,runnerSid:manifest.runnerSid,removed:true,fixtureFilesRetained:true,fixtureManifest:binding(input.fixtureManifestPath),powershellLogs:logs});return{receiptPath};}
  catch(error){emit(path.join(evidenceRoot,'native-unc-cleanup.failed.json'),{schemaVersion:'bob-builtin-analyze/t17-path-native-unc-cleanup/v1',executionMode:mode,state:'failed',sourceHeadSha:c.headSha,sourceTreeSha:c.treeSha,nonce:manifest.nonce,error:String(error.message).slice(0,1024),powershellLogs:logs});throw error;}
 }
 return{prepareNativeUncFixture,disposeNativeUncFixture};
}
function nativeAdapter(){return{
 context:async()=>{
  if(process.platform!=='win32'||process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows')fail('Windows GitHub runner/CI required');
  const guard=require('./verify-ci-head.js').verifyCiHead(process.env,repository),tree=cp.execFileSync('git',['rev-parse','--verify','HEAD^{tree}'],{cwd:repository,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();
  return{platform:process.platform,githubActions:process.env.GITHUB_ACTIONS,runnerOS:process.env.RUNNER_OS,runnerTemp:process.env.RUNNER_TEMP,headSha:guard.actualHeadSha,treeSha:tree,verifiedHeadSha:process.env.CI_VERIFIED_HEAD_SHA,event:guard.event,dispatchNonce:guard.dispatchNonce??null};
 },
 executePowerShell:({executable,args})=>new Promise(resolve=>cp.execFile(executable,args,{cwd:repository,encoding:'utf8',windowsHide:true,timeout:30000,maxBuffer:65536},(error,stdout,stderr)=>resolve({exitCode:error?(Number.isInteger(error.code)?error.code:1):0,stdout:stdout||'',stderr:stderr||''}))),
 observeUnc:async owner=>{const file=owner.uncRoot+'\\日本語 space.txt',bytes=fs.readFileSync(file);return{root:{path:owner.uncRoot,realpath:fs.realpathSync.native(owner.uncRoot),isDirectory:fs.lstatSync(owner.uncRoot).isDirectory()},file:{path:file,realpath:fs.realpathSync.native(file),isFile:fs.lstatSync(file).isFile(),bytes:bytes.length,sha256:hash(bytes)},links:['root-link','parent-link','target-link'].map(name=>({path:owner.uncRoot+'\\'+name,isSymbolicLink:fs.lstatSync(owner.uncRoot+'\\'+name).isSymbolicLink()}))};}
};}
export function prepareNativeUncFixture(input){return createDriver(nativeAdapter(),false).prepareNativeUncFixture(input);}
export function disposeNativeUncFixture(input){return createDriver(nativeAdapter(),false).disposeNativeUncFixture(input);}
// Trusted test-only DI is never accepted by either CLI or production input.
export function createNativeUncFixtureDriverForTest(adapter){const a=data(adapter,['context','executePowerShell','observeUnc'],'test adapter');if(Object.values(a).some(value=>typeof value!=='function'))fail('test adapter functions');return createDriver(a,true);}
async function main(args){
 const prepare=args[0]==='--prepare',dispose=args[0]==='--dispose';if(!prepare&&!dispose)fail('CLI operation');const expected=prepare?['--fixture-root','--evidence-root','--nonce']:['--fixture-manifest','--evidence-root'];
 if(args.length!==1+expected.length*2)fail('CLI exact arguments');const values={};for(let i=0;i<expected.length;i++){if(args[1+i*2]!==expected[i])fail('CLI exact argument order');values[expected[i]]=args[2+i*2];}
 const result=prepare?await prepareNativeUncFixture({fixtureRoot:values['--fixture-root'],evidenceRoot:values['--evidence-root'],nonce:values['--nonce']}):await disposeNativeUncFixture({fixtureManifestPath:values['--fixture-manifest'],evidenceRoot:values['--evidence-root']});process.stdout.write(JSON.stringify(result)+'\n');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{process.stderr.write(String(error.message)+'\n');process.exitCode=1;});
