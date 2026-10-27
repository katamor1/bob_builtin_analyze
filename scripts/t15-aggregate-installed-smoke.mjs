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
const names=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml','documentBudget','workbookBudget'];
const compiledNames=names.flatMap(name=>['js','d.ts','js.map'].map(suffix=>name+'.'+suffix)).sort();
const ids=['local.bob-bazaar-review','local.bob-code-consistency-review'];
const fixtureNames=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md','legacy.doc','sparse.xlsx','unselected-over-budget.xlsx'];
const requiredCases=['normal_docx','normal_xlsx','missing_both_xlsx','crc_rejected','oversize_rejected','mutation_discarded','locators_preserved','source_unchanged','installed_gui_error_is_logged_once_and_queue_recovers',"document_count_rejected_before_io","raw_aggregate_counts_duplicate_selections","pre_cancelled_document_has_no_parser","sparse_xlsx_rejected_before_parser","unselected_sheet_budget_is_enforced","parser_await_cancellation_discards_result","ordinary_failure_warns_and_aggregate_failure_throws","source_admission_raw_is_charged_once"];
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
 const prefix='extension/out/shared-processing-budget-runtime/',entries=archive.entries.filter(entry=>entry.path.startsWith(prefix)&&entry.kind==='file'),allowed=new Set([...names.map(name=>name+'.js'),'manifest.json']);
 if(entries.some(entry=>!allowed.has(entry.path.slice(prefix.length))))fail('unknown installed runtime file');
 for(const name of [...names.map(name=>name+'.js'),'manifest.json'])if(!entries.some(entry=>entry.path===prefix+name))fail('missing installed runtime module');
 const manifest=JSON.parse(archive.readEntry(prefix+'manifest.json').toString('utf8'));exactObject(manifest,['schemaVersion','sourceInputDigest','payload']);
 if(manifest.schemaVersion!=='bob-builtin-analyze/processing-runtime-copy/v1'||typeof manifest.sourceInputDigest!=='string'||!/^[0-9a-f]{64}$/.test(manifest.sourceInputDigest))fail('invalid runtime manifest');
 if(JSON.stringify(compiledRows(manifest.payload))!==JSON.stringify(expected))fail('compiled binding mismatch');
 for(const entry of entries.filter(entry=>!entry.path.endsWith('/manifest.json'))){const expectedRow=expected.find(row=>row.path===entry.path.slice(prefix.length));if(entry.bytes!==expectedRow.bytes||entry.sha256!==expectedRow.sha256)fail('installed runtime hash mismatch');}
 return manifest.sourceInputDigest;
}
// Keep the accepted T14 source-fixed 583-file parser contract read-only.
import {expectedParserIdentities} from './t14-bounded-document-installed-smoke.mjs';
export {expectedParserIdentities};
function verifyParsers(archive,id){
 const parsers=expectedParserIdentities(id);
 for(const parser of parsers){
  const prefix='extension/node_modules/'+parser.name+'/',entries=archive.entries.filter(entry=>entry.kind==='file'&&entry.path.startsWith(prefix)).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  if(JSON.stringify(entries.map(entry=>entry.path.slice('extension/'.length)))!==JSON.stringify(parser.payload.map(row=>row.path)))fail('parser inventory mismatch');
  const metadata=JSON.parse(archive.readEntry(prefix+'package.json').toString('utf8'));if(metadata.name!==parser.name||metadata.version!==parser.version)fail('parser version mismatch');
  for(let index=0;index<entries.length;index++)if(entries[index].bytes!==parser.payload[index].bytes||entries[index].sha256!==parser.payload[index].sha256)fail('parser payload mismatch');
 }
 return parsers;
}
function verifySourceParserIdentities(sourceRoot){
 for(const id of ids){const folder=path.join(sourceRoot,'extensions',id.slice('local.'.length)),lock=JSON.parse(fs.readFileSync(noAlias(path.join(folder,'package-lock.json')),'utf8'));
  for(const parser of expectedParserIdentities(id)){
   const locked=lock.packages['node_modules/'+parser.name];if(locked?.version!==parser.version||locked.integrity!==parser.integrity)fail('source parser lock mismatch');
   for(const expected of parser.payload){const bytes=fs.readFileSync(noAlias(path.join(folder,expected.path)));if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('source parser payload mismatch');}
  }
 }
}

export async function validateArtifactManifest(manifest){
 try{
  exactObject(manifest,['schemaVersion','sourceHeadSha','sourceTreeSha','compiledModules','extensions','fixtures']);
  if(manifest.schemaVersion!=='bob-builtin-analyze/t15-installed-artifacts/v1'||!/^[0-9a-f]{40}$/.test(manifest.sourceHeadSha)||!/^[0-9a-f]{40}$/.test(manifest.sourceTreeSha))fail('source identity');
  const compiled=compiledRows(manifest.compiledModules);if(!Array.isArray(manifest.extensions)||manifest.extensions.length!==2)fail('extension inventory');
  const archives=manifest.extensions.map((item,index)=>{exactObject(item,['id','vsix']);if(item.id!==ids[index])fail('extension identity');const archive=validateVsixArchive(readBinding(item.vsix,index===0?12000000:11000000));const pkg=JSON.parse(archive.readEntry('extension/package.json').toString('utf8'));if(pkg.publisher+'.'+pkg.name!==item.id||pkg.main!=='./out/extension.js')fail('installed extension manifest');return{archive,digest:verifyCopy(archive,compiled),parsers:verifyParsers(archive,item.id)};});
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
 fs.writeFileSync(path.join(absolute,'owned.json'),JSON.stringify({schemaVersion:'bob-builtin-analyze/t15-owned-root/v1',pid:process.pid})+'\n',{flag:'wx'});return fs.realpathSync(absolute);
}
function freshChild(parent,prefix){noAlias(parent);const created=fs.mkdtempSync(path.toNamespacedPath(path.join(parent,prefix)));return path.join(parent,path.basename(created));}
export async function createArtifactManifest(sourceRoot,evidenceParent){
 if(!path.isAbsolute(sourceRoot)||!path.isAbsolute(evidenceParent))fail('absolute preparation paths required');noAlias(sourceRoot);noAlias(evidenceParent);
 verifySourceParserIdentities(sourceRoot);
 const inputRoot=freshChild(evidenceParent,'artifact-inputs-'),build=require(path.join(sourceRoot,'packages/processing-budget-runtime/scripts/build-runtime.js')).verifiedBuild();
 const extensions=ids.map(id=>{const name=id.slice('local.'.length),folder=path.join(sourceRoot,'extensions',name),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8')),target=path.join(inputRoot,name+'.vsix');fs.copyFileSync(noAlias(path.join(folder,name+'-'+pkg.version+'.vsix')),target,fs.constants.COPYFILE_EXCL);return{id,vsix:binding(target)};});
 const fixtures=require(path.join(sourceRoot,'extensions/bob-bazaar-review/test/helpers/ruleDocumentFixtures.js'));
 const fixtureBytes=[fixtures.createDocxFixture(),fixtures.createXlsxFixture(),fixtures.createXlsxFixture({omitStyles:true}),fixtures.createDocxFixture({additionalEntries:[{name:'custom/bad-crc.bin',data:Buffer.from('tampered'),crc32:0}]}),Buffer.from('# REQ-ARTIFACT-001\nsource must remain intact\n')];
 const codec=createRequire(path.join(sourceRoot,'extensions/bob-bazaar-review/package.json'))('fflate');
 const sparse=(part)=>{const entries=codec.unzipSync(fixtureBytes[1]);entries[part]=codec.strToU8('<worksheet><sheetData><row r="502"/></sheetData></worksheet>');return Buffer.from(codec.zipSync(entries));};
 fixtureBytes.push(Buffer.from('d0cf11e0a1b11ae1','hex'),sparse('xl/worksheets/sheet2.xml'),sparse('xl/worksheets/sheet1.xml'));
 const rows=fixtureNames.map((name,index)=>{const file=path.join(inputRoot,name);fs.writeFileSync(file,fixtureBytes[index],{flag:'wx'});return{name,...binding(file)};});
 const git=(...args)=>cp.execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 const manifest={schemaVersion:'bob-builtin-analyze/t15-installed-artifacts/v1',sourceHeadSha:git('rev-parse','HEAD'),sourceTreeSha:git('rev-parse','HEAD^{tree}'),compiledModules:build.payload,extensions,fixtures:rows};
 await validateArtifactManifest(manifest);const manifestPath=path.join(inputRoot,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifestPath;
}
export async function prepareInstalledArtifacts(manifest,evidenceRoot){
 const checked=await validateArtifactManifest(manifest),root=claimRoot(evidenceRoot),artifactsRoot=path.join(root,'artifacts'),workspaceRoot=path.join(root,'workspace'),probeRoot=path.join(root,'probe'),logsRoot=path.join(root,'logs');
 for(const directory of [artifactsRoot,workspaceRoot,probeRoot,logsRoot,path.join(root,'user-data'),path.join(root,'extensions'),path.join(root,'vscode-cache')])fs.mkdirSync(directory);
 const extensions=checked.archives.map(({archive},index)=>{
  const target=path.join(artifactsRoot,ids[index].slice('local.'.length));fs.mkdirSync(target);
  for(const entry of archive.entries.filter(entry=>entry.path.startsWith('extension/')&&entry.kind==='file')){const relative=entry.path.slice('extension/'.length),output=path.resolve(target,relative);if(!output.startsWith(target+path.sep))fail('extraction escape');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,archive.readEntry(entry.path),{flag:'wx'});}
  return{id:ids[index],root:fs.realpathSync(target),parsers:checked.archives[index].parsers};
 });
 for(const item of checked.fixtures)fs.writeFileSync(path.join(workspaceRoot,item.name),item.bytes,{flag:'wx'});
 const config={sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,extensions,workspaceRoot,fixtures:manifest.fixtures,hostReceiptPath:path.join(logsRoot,'host-receipt.json')};
 fs.copyFileSync(path.join(repositoryRoot,'scripts/t15-aggregate-installed-extension-host.test.js'),path.join(probeRoot,'test.js'),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(repositoryRoot,'scripts/t14-bounded-document-installed-extension-host.test.js'),path.join(probeRoot,'t14-bounded-document-installed-extension-host.test.js'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(probeRoot,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(probeRoot,'package.json'),JSON.stringify({name:'t15-artifact-probe',publisher:'local',version:'0.0.0',engines:{vscode:'^1.106.1'},main:'./main.js',activationEvents:[]})+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(probeRoot,'main.js'),'exports.activate = () => {};\n',{flag:'wx'});
 return{root,config,probeRoot};
}
function pinnedHostRuntime(){
 const folder=path.join(repositoryRoot,'extensions/bob-bazaar-review/node_modules');
 for(const [name,version]of [['@vscode/test-cli','0.0.12'],['@vscode/test-electron','2.5.2']]){const dir=noAlias(path.join(folder,name));if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).version!==version)fail('pinned host tooling required after packaging');}
 return createRequire(path.join(repositoryRoot,'extensions/bob-bazaar-review/package.json'))('@vscode/test-electron');
}
// Kept as one validator so unit negatives and the actual host use identical admission.
export function validateInstalledHostReceipt(host,config,manifest,hostExit){
 if(hostExit!==0||host?.schemaVersion!=='bob-builtin-analyze/t15-installed-host/v1'||host.state!=='passed'||host.sourceHeadSha!==manifest.sourceHeadSha||host.sourceTreeSha!==manifest.sourceTreeSha||host.vscode!=='1.106.1'||host.productActivationProbe!=='not_run'||host.productDeactivationProbe!=='not_run'||!Array.isArray(host.cases)||JSON.stringify(host.cases.map(item=>item.name))!==JSON.stringify(requiredCases)||host.cases.some(item=>item.state!=='passed'))fail('native host proof incomplete');
 const cases=host.cases.map(({name,state})=>({name,state})),loadedModules=[],parserIdentities=[];
 if(!Array.isArray(host.loadedModules)||host.loadedModules.length!==28)fail('native module inventory');
 if(!Array.isArray(host.parserIdentities)||host.parserIdentities.length!==8)fail('native parser inventory');
 for(const item of config.extensions){
  const actual=host.loadedModules.filter(row=>row.extensionRoot===item.root),seen=new Set();
  if(actual.length!==14)fail('native module inventory');assertInstalledRuntimePaths(item.root,actual.map(row=>row.path));
  for(const loaded of actual){const moduleName=path.basename(loaded.path,'.js'),expected=manifest.compiledModules.find(row=>row.path===moduleName+'.js');if(!names.includes(moduleName)||seen.has(moduleName)||loaded.moduleName!==moduleName)fail('native module identity');seen.add(moduleName);const bytes=readBinding(row({path:loaded.path,bytes:loaded.bytes,sha256:loaded.sha256}),50*1048576);if(!expected||bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('native module binding');loadedModules.push({extensionId:item.id,moduleName,...binding(loaded.path)});}
  const parsers=host.parserIdentities.filter(row=>row.extensionRoot===item.root),seenParsers=new Set();if(parsers.length!==4)fail('native parser identity');
  for(const parser of item.parsers){const actual=parsers.find(row=>row.name===parser.name),expected=parser.payload.find(row=>row.path===actual?.relativePath);if(!actual||seenParsers.has(actual.name)||actual.version!==parser.version||actual.integrity!==parser.integrity||!expected)fail('native parser binding');seenParsers.add(actual.name);const file=noAlias(actual.path),root=fs.realpathSync(item.root),relative=path.relative(root,fs.realpathSync(file)).split(path.sep).join('/');if(relative!==actual.relativePath||!relative.startsWith('node_modules/'+parser.name+'/'))fail('artifact parser path escape');const bytes=readBinding(row({path:file,bytes:actual.bytes,sha256:actual.sha256}),50*1048576);if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('native parser hash');parserIdentities.push({extensionId:item.id,name:parser.name,version:parser.version,integrity:parser.integrity,specifier:parser.specifier,relativePath:relative,...binding(file)});}
 }
 return{cases,loadedModules,parserIdentities};
}
export async function runInstalledSmoke(manifestPath,evidenceRoot){
 if(typeof manifestPath!=='string'||!path.isAbsolute(manifestPath))fail('absolute artifact manifest required');
 const manifest=JSON.parse(fs.readFileSync(noAlias(manifestPath),'utf8'));
 if(process.env.CI_VERIFIED_HEAD_SHA&&manifest.sourceHeadSha!==process.env.CI_VERIFIED_HEAD_SHA)fail('checkout guard identity changed');
 const prepared=await prepareInstalledArtifacts(manifest,evidenceRoot),{root,config,probeRoot}=prepared;
 const receipt={schemaVersion:'bob-builtin-analyze/t15-installed-smoke/v1',state:'failed',sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,os:process.platform,developmentPayloadFiles:42,shippedRuntimeFilesPerExtension:14,artifactManifest:binding(manifestPath),hostReceipt:null,hostExit:null,cases:[],loadedModules:[],parserIdentities:[],productActivationProbe:'not_run',productDeactivationProbe:'not_run',failure:null};
 let failed=false,firstFailure;
 try{
  const {runTests}=pinnedHostRuntime();
  receipt.hostExit=await runTests({version:'1.106.1',cachePath:path.join(root,'vscode-cache'),extensionDevelopmentPath:[...config.extensions.map(item=>item.root),probeRoot],extensionTestsPath:path.join(probeRoot,'test.js'),reuseMachineInstall:false,launchArgs:[config.workspaceRoot,'--user-data-dir='+path.join(root,'user-data'),'--extensions-dir='+path.join(root,'extensions'),'--disable-telemetry','--disable-gpu'],extensionTestsEnv:{NODE_PATH:'',NODE_OPTIONS:'',ELECTRON_RUN_AS_NODE:undefined}});
  receipt.hostReceipt=binding(config.hostReceiptPath);const host=JSON.parse(fs.readFileSync(config.hostReceiptPath,'utf8'));
  if(Array.isArray(host.cases))receipt.cases=host.cases.filter(item=>typeof item?.name==='string'&&typeof item.state==='string').map(({name,state})=>({name,state}));
  Object.assign(receipt,validateInstalledHostReceipt(host,config,manifest,receipt.hostExit));receipt.state='passed';
 }catch(error){failed=true;firstFailure=error;receipt.failure='Installed aggregate document host verification failed; inspect the bound host receipt and logs.';if(!receipt.hostReceipt&&fs.existsSync(config.hostReceiptPath)){receipt.hostReceipt=binding(config.hostReceiptPath);try{const host=JSON.parse(fs.readFileSync(config.hostReceiptPath,'utf8'));if(Array.isArray(host.cases))receipt.cases=host.cases.filter(item=>typeof item?.name==='string'&&typeof item.state==='string').map(({name,state})=>({name,state}));}catch{}}}
 fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(failed)throw firstFailure;return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==6||process.argv[2]!=='--artifacts'||process.argv[4]!=='--evidence-root')fail('expected --artifacts and --evidence-root');const result=await runInstalledSmoke(process.argv[3],process.argv[5]);process.stdout.write(JSON.stringify({state:result.state,hostExit:result.hostExit,sourceHeadSha:result.sourceHeadSha})+'\n');}
 catch(error){process.stderr.write(String(error?.message??error)+'\n');process.exitCode=1;}
}
