import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {validateVsixArchive} from '../tools/workflow-evidence/lib/vsixArchive.mjs';

const require=createRequire(import.meta.url),repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {assertInstalledRuntimePaths}=require('./t14-bounded-document-installed-extension-host.test.js');
export {assertInstalledRuntimePaths};
const names=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml'];
const compiledNames=names.flatMap(name=>['js','d.ts','js.map'].map(suffix=>name+'.'+suffix)).sort();
const ids=['local.bob-bazaar-review','local.bob-code-consistency-review'];
const fixtureNames=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md'];
const requiredCases=['normal_docx','normal_xlsx','missing_both_xlsx','crc_rejected','oversize_rejected','mutation_discarded','locators_preserved','source_unchanged','installed_gui_error_is_logged_once_and_queue_recovers'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(reason){throw Error('artifact verification: '+reason);}
function exactObject(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(Object.keys(input).sort())!==JSON.stringify([...keys].sort()))fail('closed object required');}
function noAlias(file){const absolute=path.resolve(file),root=path.parse(absolute).root;let current=root;for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())fail('path alias');}return absolute;}
function row(input,expectedName){
 exactObject(input,['path','bytes','sha256']);if(typeof input.path!=='string'||(expectedName!==undefined&&input.path!==expectedName)||!Number.isSafeInteger(input.bytes)||input.bytes<=0||typeof input.sha256!=='string'||!/^[0-9a-f]{64}$/.test(input.sha256))fail('invalid positive byte binding');
 return{path:input.path,bytes:input.bytes,sha256:input.sha256};
}
function readBinding(binding,maximum){
 row(binding);if(!path.isAbsolute(binding.path)||binding.bytes>maximum)fail('invalid artifact path or size');const file=noAlias(binding.path),before=fs.statSync(file);if(!before.isFile()||before.size!==binding.bytes)fail('artifact size mismatch');const bytes=fs.readFileSync(file);if(bytes.length!==binding.bytes||sha(bytes)!==binding.sha256)fail('artifact hash mismatch');return bytes;
}
function binding(file){const bytes=fs.readFileSync(noAlias(file));return{path:fs.realpathSync(file),bytes:bytes.length,sha256:sha(bytes)};}
function compiledRows(rows){if(!Array.isArray(rows)||rows.length!==compiledNames.length)fail('compiled inventory');return rows.map((input,index)=>row(input,compiledNames[index]));}
function verifyCopy(archive,expected){
 const prefix='extension/out/shared-processing-budget-runtime/',entries=archive.entries.filter(entry=>entry.path.startsWith(prefix)&&entry.kind==='file'),allowed=new Set([...compiledNames,'manifest.json']);
 if(entries.some(entry=>!allowed.has(entry.path.slice(prefix.length))))fail('unknown installed runtime file');
 for(const name of [...names.map(name=>name+'.js'),'manifest.json'])if(!entries.some(entry=>entry.path===prefix+name))fail('missing installed runtime module');
 const manifest=JSON.parse(archive.readEntry(prefix+'manifest.json').toString('utf8'));exactObject(manifest,['schemaVersion','sourceInputDigest','payload']);
 if(manifest.schemaVersion!=='bob-builtin-analyze/processing-runtime-copy/v1'||typeof manifest.sourceInputDigest!=='string'||!/^[0-9a-f]{64}$/.test(manifest.sourceInputDigest))fail('invalid runtime manifest');
 if(JSON.stringify(compiledRows(manifest.payload))!==JSON.stringify(expected))fail('compiled binding mismatch');
 for(const entry of entries.filter(entry=>!entry.path.endsWith('/manifest.json'))){const expectedRow=expected.find(row=>row.path===entry.path.slice(prefix.length));if(entry.bytes!==expectedRow.bytes||entry.sha256!==expectedRow.sha256)fail('installed runtime hash mismatch');}
 return manifest.sourceInputDigest;
}
export async function validateArtifactManifest(manifest){
 try{
  exactObject(manifest,['schemaVersion','sourceHeadSha','sourceTreeSha','compiledModules','extensions','fixtures']);
  if(manifest.schemaVersion!=='bob-builtin-analyze/t14-installed-artifacts/v1'||!/^[0-9a-f]{40}$/.test(manifest.sourceHeadSha)||!/^[0-9a-f]{40}$/.test(manifest.sourceTreeSha))fail('source identity');
  const compiled=compiledRows(manifest.compiledModules);if(!Array.isArray(manifest.extensions)||manifest.extensions.length!==2)fail('extension inventory');
  const archives=manifest.extensions.map((item,index)=>{exactObject(item,['id','vsix']);if(item.id!==ids[index])fail('extension identity');const archive=validateVsixArchive(readBinding(item.vsix,index===0?12000000:11000000));const pkg=JSON.parse(archive.readEntry('extension/package.json').toString('utf8'));if(pkg.publisher+'.'+pkg.name!==item.id||pkg.main!=='./out/extension.js')fail('installed extension manifest');return{archive,digest:verifyCopy(archive,compiled)};});
  if(archives[0].digest!==archives[1].digest)fail('extensions copied different builds');
  if(!Array.isArray(manifest.fixtures)||manifest.fixtures.length!==fixtureNames.length)fail('fixture inventory');
  const fixtures=manifest.fixtures.map((input,index)=>{exactObject(input,['name','path','bytes','sha256']);if(input.name!==fixtureNames[index])fail('fixture name');const positive=row({path:input.path,bytes:input.bytes,sha256:input.sha256});return{name:input.name,bytes:readBinding(positive,25*1048576),binding:positive};});
  return{manifest,compiled,archives,fixtures};
 }catch(error){if(error.message?.startsWith('artifact verification:'))throw error;fail('invalid artifact input');}
}
function claimRoot(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))fail('absolute fresh evidence root required');const absolute=path.resolve(directory);
 const workbench=path.join(absolute,'vscode-cache/vscode-win32-x64-archive-1.106.1/resources/app/out/vs/code/electron-browser/workbench/workbench.html');
 if(process.platform==='win32'&&workbench.length>=260)fail('Windows renderer path exceeds 259 characters; choose a shorter fresh physical evidence root');
 if(fs.existsSync(absolute)){noAlias(absolute);if(!fs.statSync(absolute).isDirectory()||fs.readdirSync(absolute).length)fail('evidence root must be fresh and empty');}else{noAlias(path.dirname(absolute));fs.mkdirSync(absolute);}
 fs.writeFileSync(path.join(absolute,'owned.json'),JSON.stringify({schemaVersion:'bob-builtin-analyze/t14-owned-root/v1',pid:process.pid})+'\n',{flag:'wx'});return fs.realpathSync(absolute);
}
function freshChild(parent,prefix){noAlias(parent);const created=fs.mkdtempSync(path.toNamespacedPath(path.join(parent,prefix)));return path.join(parent,path.basename(created));}
export async function createArtifactManifest(sourceRoot,evidenceParent){
 if(!path.isAbsolute(sourceRoot)||!path.isAbsolute(evidenceParent))fail('absolute preparation paths required');noAlias(sourceRoot);noAlias(evidenceParent);
 const inputRoot=freshChild(evidenceParent,'artifact-inputs-'),build=require(path.join(sourceRoot,'packages/processing-budget-runtime/scripts/build-runtime.js')).verifiedBuild();
 const extensions=ids.map(id=>{const name=id.slice('local.'.length),folder=path.join(sourceRoot,'extensions',name),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8')),target=path.join(inputRoot,name+'.vsix');fs.copyFileSync(noAlias(path.join(folder,name+'-'+pkg.version+'.vsix')),target,fs.constants.COPYFILE_EXCL);return{id,vsix:binding(target)};});
 const fixtures=require(path.join(sourceRoot,'extensions/bob-bazaar-review/test/helpers/ruleDocumentFixtures.js'));
 const fixtureBytes=[fixtures.createDocxFixture(),fixtures.createXlsxFixture(),fixtures.createXlsxFixture({omitStyles:true}),fixtures.createDocxFixture({additionalEntries:[{name:'custom/bad-crc.bin',data:Buffer.from('tampered'),crc32:0}]}),Buffer.from('# REQ-ARTIFACT-001\nsource must remain intact\n')];
 const rows=fixtureNames.map((name,index)=>{const file=path.join(inputRoot,name);fs.writeFileSync(file,fixtureBytes[index],{flag:'wx'});return{name,...binding(file)};});
 const git=(...args)=>cp.execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 const manifest={schemaVersion:'bob-builtin-analyze/t14-installed-artifacts/v1',sourceHeadSha:git('rev-parse','HEAD'),sourceTreeSha:git('rev-parse','HEAD^{tree}'),compiledModules:build.payload,extensions,fixtures:rows};
 await validateArtifactManifest(manifest);const manifestPath=path.join(inputRoot,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifestPath;
}
export async function prepareInstalledArtifacts(manifest,evidenceRoot){
 const checked=await validateArtifactManifest(manifest),root=claimRoot(evidenceRoot),artifactsRoot=path.join(root,'artifacts'),workspaceRoot=path.join(root,'workspace'),probeRoot=path.join(root,'probe'),logsRoot=path.join(root,'logs');
 for(const directory of [artifactsRoot,workspaceRoot,probeRoot,logsRoot,path.join(root,'user-data'),path.join(root,'extensions'),path.join(root,'vscode-cache')])fs.mkdirSync(directory);
 const extensions=checked.archives.map(({archive},index)=>{
  const target=path.join(artifactsRoot,ids[index].slice('local.'.length));fs.mkdirSync(target);
  for(const entry of archive.entries.filter(entry=>entry.path.startsWith('extension/')&&entry.kind==='file')){const relative=entry.path.slice('extension/'.length),output=path.resolve(target,relative);if(!output.startsWith(target+path.sep))fail('extraction escape');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,archive.readEntry(entry.path),{flag:'wx'});}
  return{id:ids[index],root:fs.realpathSync(target)};
 });
 for(const item of checked.fixtures)fs.writeFileSync(path.join(workspaceRoot,item.name),item.bytes,{flag:'wx'});
 const config={sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,extensions,workspaceRoot,fixtures:manifest.fixtures,hostReceiptPath:path.join(logsRoot,'host-receipt.json')};
 fs.copyFileSync(path.join(repositoryRoot,'scripts/t14-bounded-document-installed-extension-host.test.js'),path.join(probeRoot,'test.js'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(probeRoot,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(probeRoot,'package.json'),JSON.stringify({name:'t14-artifact-probe',publisher:'local',version:'0.0.0',engines:{vscode:'^1.106.1'},main:'./main.js',activationEvents:[]})+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(probeRoot,'main.js'),'exports.activate = () => {};\n',{flag:'wx'});
 return{root,config,probeRoot};
}
function pinnedHostRuntime(){
 const folder=path.join(repositoryRoot,'extensions/bob-bazaar-review/node_modules');
 for(const [name,version]of [['@vscode/test-cli','0.0.12'],['@vscode/test-electron','2.5.2']]){const dir=noAlias(path.join(folder,name));if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).version!==version)fail('pinned host tooling required after packaging');}
 return createRequire(path.join(repositoryRoot,'extensions/bob-bazaar-review/package.json'))('@vscode/test-electron');
}
export async function runInstalledSmoke(manifestPath,evidenceRoot){
 const manifest=JSON.parse(fs.readFileSync(noAlias(manifestPath),'utf8'));
 if(process.env.CI_VERIFIED_HEAD_SHA&&manifest.sourceHeadSha!==process.env.CI_VERIFIED_HEAD_SHA)fail('checkout guard identity changed');
 const prepared=await prepareInstalledArtifacts(manifest,evidenceRoot),{root,config,probeRoot}=prepared;
 const receipt={schemaVersion:'bob-builtin-analyze/t14-installed-smoke/v1',state:'failed',sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,os:process.platform,developmentPayloadFiles:36,shippedRuntimeFilesPerExtension:12,artifacts:manifest.extensions,hostExit:null,productActivationProbe:'not_run',productDeactivationProbe:'not_run'};
 let failure;
 try{
  const {runTests}=pinnedHostRuntime();
  receipt.hostExit=await runTests({version:'1.106.1',cachePath:path.join(root,'vscode-cache'),extensionDevelopmentPath:[...config.extensions.map(item=>item.root),probeRoot],extensionTestsPath:path.join(probeRoot,'test.js'),reuseMachineInstall:false,launchArgs:[config.workspaceRoot,'--user-data-dir='+path.join(root,'user-data'),'--extensions-dir='+path.join(root,'extensions'),'--disable-telemetry','--disable-gpu'],extensionTestsEnv:{NODE_PATH:'',NODE_OPTIONS:'',ELECTRON_RUN_AS_NODE:undefined}});
  const host=JSON.parse(fs.readFileSync(config.hostReceiptPath,'utf8'));
  if(receipt.hostExit!==0||host.state!=='passed'||host.sourceHeadSha!==manifest.sourceHeadSha||host.sourceTreeSha!==manifest.sourceTreeSha||host.vscode!=='1.106.1'||JSON.stringify(host.cases.map(item=>item.name))!==JSON.stringify(requiredCases)||host.cases.some(item=>item.state!=='passed')||host.loadedModules.length!==24)fail('native host proof incomplete');
  for(const item of config.extensions){const actual=host.loadedModules.filter(row=>row.extensionRoot===item.root);if(actual.length!==12)fail('native module inventory');assertInstalledRuntimePaths(item.root,actual.map(row=>row.path));for(const loaded of actual){const expected=manifest.compiledModules.find(row=>row.path===path.basename(loaded.path)),bytes=fs.readFileSync(noAlias(loaded.path));if(!expected||bytes.length!==expected.bytes||sha(bytes)!==expected.sha256||loaded.bytes!==expected.bytes||loaded.sha256!==expected.sha256)fail('native module binding');}}
  receipt.hostReceipt=binding(config.hostReceiptPath);receipt.state='passed';
 }catch(error){failure=error;receipt.failure=String(error?.message??error).slice(0,512);}
 fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(failure)throw failure;return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==6||process.argv[2]!=='--artifacts'||process.argv[4]!=='--evidence-root')fail('expected --artifacts and --evidence-root');const result=await runInstalledSmoke(path.resolve(process.argv[3]),process.argv[5]);process.stdout.write(JSON.stringify({state:result.state,hostExit:result.hostExit,sourceHeadSha:result.sourceHeadSha})+'\n');}
 catch(error){process.stderr.write(String(error?.message??error)+'\n');process.exitCode=1;}
}
