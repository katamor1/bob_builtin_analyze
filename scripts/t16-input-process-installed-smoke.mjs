import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import * as baselineRunner from './t15-aggregate-installed-smoke.mjs';
export {assertInstalledRuntimePaths} from './t15-aggregate-installed-smoke.mjs';
const repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const supplementalNames=['review-input.yaml','diff-fixture.json'];
const additional=['shared_operation_all_input_stages','independent_stdout_stderr_exact','stdout_overflow_waits_for_child_exit','git_overflow_preserves_complete_metadata','excerpt_parent_budget_is_fatal','mandatory_bob_metadata_survives_clipping','artifact_failure_releases_pending','utf8_package_bytes_and_unmanaged_file_are_preserved'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(reason){throw Error('artifact verification: '+reason);}
function exact(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(Object.keys(input).sort())!==JSON.stringify([...keys].sort()))fail('closed object required');}
function noAlias(file){if(typeof file!=='string'||!path.isAbsolute(file))fail('absolute path required');const absolute=path.resolve(file),root=path.parse(absolute).root;let current=root;for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())fail('path alias');}return absolute;}
function readBinding(binding,maximum=16*1048576){exact(binding,['path','bytes','sha256']);if(!Number.isSafeInteger(binding.bytes)||binding.bytes<=0||binding.bytes>maximum||typeof binding.sha256!=='string'||!/^[a-f0-9]{64}$/.test(binding.sha256))fail('byte binding');const file=noAlias(binding.path),stat=fs.lstatSync(file);if(!stat.isFile()||stat.size!==binding.bytes)fail('artifact size');const bytes=fs.readFileSync(file);if(bytes.length!==binding.bytes||sha(bytes)!==binding.sha256)fail('artifact hash');return bytes;}
function binding(file){const bytes=fs.readFileSync(noAlias(file));return{path:fs.realpathSync(file),bytes:bytes.length,sha256:sha(bytes)};}
function fixtures(rows){if(!Array.isArray(rows)||rows.length!==2)fail('supplemental fixture inventory');return rows.map((row,index)=>{exact(row,['name','path','bytes','sha256']);if(row.name!==supplementalNames[index])fail('supplemental fixture name');const {name,...bound}=row;return{name,bytes:readBinding(bound),binding:bound};});}

export async function validateArtifactManifest(manifest){
 exact(manifest,['schemaVersion','sourceHeadSha','sourceTreeSha','baselineManifest','supplementalFixtures']);
 if(manifest.schemaVersion!=='bob-builtin-analyze/t16-installed-artifacts/v1'||![manifest.sourceHeadSha,manifest.sourceTreeSha].every(value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value)))fail('manifest subject');
 const baselineManifest=JSON.parse(readBinding(manifest.baselineManifest)),baseline=await baselineRunner.validateArtifactManifest(baselineManifest);
 if(baselineManifest.sourceHeadSha!==manifest.sourceHeadSha||baselineManifest.sourceTreeSha!==manifest.sourceTreeSha)fail('baseline subject mismatch');
 return{manifest,baseline,fixtures:fixtures(manifest.supplementalFixtures)};
}

export async function createArtifactManifest(sourceRoot,evidenceParent){
 const baselinePath=await baselineRunner.createArtifactManifest(sourceRoot,evidenceParent),baseline=JSON.parse(fs.readFileSync(baselinePath,'utf8')),root=path.dirname(baselinePath);
 const review={schema_version:1,review:{id:'t16-installed',title:'T16 input process',change_type:'bugfix',purpose:'installed input accounting',base:'a',head:'b',vcs:'git'},artifacts:{requirements:[{path:'source.md'}]},review_focus:['requirement-code-consistency']};
 const diff={base:'a',head:'b',files:[{path:'src/t16.c',status:'modified',additions:1,deletions:1}],unifiedDiff:'diff --git a/src/t16.c b/src/t16.c\n--- a/src/t16.c\n+++ b/src/t16.c\n@@ -1 +1 @@\n-int t16(void) { return 0; }\n+int t16(void) { return 1; }\n',warnings:[]};
 const rows=supplementalNames.map((name,index)=>{const file=path.join(root,name);fs.writeFileSync(file,JSON.stringify(index===0?review:diff,null,2)+'\n',{flag:'wx'});return{name,...binding(file)};});
 const manifest={schemaVersion:'bob-builtin-analyze/t16-installed-artifacts/v1',sourceHeadSha:baseline.sourceHeadSha,sourceTreeSha:baseline.sourceTreeSha,baselineManifest:binding(baselinePath),supplementalFixtures:rows};
 await validateArtifactManifest(manifest);const file=path.join(root,'t16-artifacts.json');fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return file;
}

export async function validateInstalledHostReceipt(host,config,manifest,hostExit){
 const checked=await validateArtifactManifest(manifest);
 exact(config,['sourceHeadSha','sourceTreeSha','baselineConfigPath','baselineHostReceiptPath','hostReceiptPath','supplementalFixtures']);
 if(config.sourceHeadSha!==manifest.sourceHeadSha||config.sourceTreeSha!==manifest.sourceTreeSha||JSON.stringify(config.supplementalFixtures)!==JSON.stringify(manifest.supplementalFixtures))fail('host config subject');
 const baselineConfig=JSON.parse(fs.readFileSync(noAlias(config.baselineConfigPath),'utf8'));
 if(config.baselineHostReceiptPath!==baselineConfig.hostReceiptPath||config.hostReceiptPath===config.baselineHostReceiptPath)fail('baseline receipt path');
 const baselineHost=JSON.parse(fs.readFileSync(noAlias(config.baselineHostReceiptPath),'utf8'));
 const proof=baselineRunner.validateInstalledHostReceipt(baselineHost,baselineConfig,checked.baseline.manifest,hostExit);
 exact(host,['schemaVersion','sourceHeadSha','sourceTreeSha','vscode','node','state','productActivationProbe','productDeactivationProbe','cases','loadedModules','parserIdentities']);
 if(host.schemaVersion!=='bob-builtin-analyze/t16-installed-host/v1'||host.state!=='passed'||host.sourceHeadSha!==manifest.sourceHeadSha||host.sourceTreeSha!==manifest.sourceTreeSha||host.vscode!=='1.106.1'||typeof host.node!=='string'||host.productActivationProbe!=='not_run'||host.productDeactivationProbe!=='not_run')fail('native host proof incomplete');
 const required=[...proof.cases.map(row=>row.name),...additional];
 if(!Array.isArray(host.cases)||JSON.stringify(host.cases.map(row=>row?.name))!==JSON.stringify(required)||host.cases.some(row=>row.state!=='passed'))fail('native case inventory');
 if(JSON.stringify(host.loadedModules)!==JSON.stringify(baselineHost.loadedModules)||JSON.stringify(host.parserIdentities)!==JSON.stringify(baselineHost.parserIdentities))fail('native baseline identities changed');
 return{cases:host.cases.map(({name,state})=>({name,state})),loadedModules:proof.loadedModules,parserIdentities:proof.parserIdentities};
}

function pinnedHostRuntime(){
 const folder=path.join(repositoryRoot,'extensions/bob-bazaar-review/node_modules');
 for(const [name,version]of [['@vscode/test-cli','0.0.12'],['@vscode/test-electron','2.5.2']])if(JSON.parse(fs.readFileSync(path.join(noAlias(path.join(folder,name)),'package.json'),'utf8')).version!==version)fail('pinned host tooling required after packaging');
 return createRequire(path.join(repositoryRoot,'extensions/bob-bazaar-review/package.json'))('@vscode/test-electron');
}

export async function runInstalledSmoke(manifestPath,evidenceRoot){
 const manifest=JSON.parse(fs.readFileSync(noAlias(manifestPath),'utf8'));
 if(process.env.CI_VERIFIED_HEAD_SHA&&manifest.sourceHeadSha!==process.env.CI_VERIFIED_HEAD_SHA)fail('checkout guard identity changed');
 const checked=await validateArtifactManifest(manifest),prepared=await baselineRunner.prepareInstalledArtifacts(checked.baseline.manifest,evidenceRoot),{root,config:baselineConfig,probeRoot}=prepared;
 const config={sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,baselineConfigPath:path.join(probeRoot,'config.json'),baselineHostReceiptPath:baselineConfig.hostReceiptPath,hostReceiptPath:path.join(root,'logs/t16-host-receipt.json'),supplementalFixtures:manifest.supplementalFixtures};
 fs.copyFileSync(path.join(probeRoot,'test.js'),path.join(probeRoot,'t15-aggregate-installed-extension-host.test.js'),fs.constants.COPYFILE_EXCL);
 fs.copyFileSync(path.join(repositoryRoot,'scripts/t16-input-process-installed-extension-host.test.js'),path.join(probeRoot,'t16-test.js'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(probeRoot,'t16-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 for(const fixture of checked.fixtures)fs.writeFileSync(path.join(baselineConfig.workspaceRoot,fixture.name),fixture.bytes,{flag:'wx'});
 const receipt={schemaVersion:'bob-builtin-analyze/t16-installed-smoke/v1',state:'failed',sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,os:process.platform,developmentPayloadFiles:42,shippedRuntimeFilesPerExtension:14,artifactManifest:binding(manifestPath),baselineManifest:manifest.baselineManifest,baselineHostReceipt:null,hostReceipt:null,hostExit:null,cases:[],loadedModules:[],parserIdentities:[],productActivationProbe:'not_run',productDeactivationProbe:'not_run',failure:null};
 let failed=false,firstFailure;
 try{
  const {runTests}=pinnedHostRuntime();
  receipt.hostExit=await runTests({version:'1.106.1',cachePath:path.join(root,'vscode-cache'),extensionDevelopmentPath:[...baselineConfig.extensions.map(item=>item.root),probeRoot],extensionTestsPath:path.join(probeRoot,'t16-test.js'),reuseMachineInstall:false,launchArgs:[baselineConfig.workspaceRoot,'--user-data-dir='+path.join(root,'user-data'),'--extensions-dir='+path.join(root,'extensions'),'--disable-telemetry','--disable-gpu'],extensionTestsEnv:{NODE_PATH:'',NODE_OPTIONS:'',ELECTRON_RUN_AS_NODE:undefined}});
  const host=JSON.parse(fs.readFileSync(config.hostReceiptPath,'utf8'));Object.assign(receipt,await validateInstalledHostReceipt(host,config,manifest,receipt.hostExit));receipt.state='passed';
 }catch(error){failed=true;firstFailure=error;receipt.failure='Installed input and process host verification failed; inspect the bound host receipts and logs.';}
 for(const [field,file]of [['baselineHostReceipt',config.baselineHostReceiptPath],['hostReceipt',config.hostReceiptPath]])if(fs.existsSync(file))receipt[field]=binding(file);
 if(failed&&receipt.hostReceipt){try{const host=JSON.parse(fs.readFileSync(config.hostReceiptPath,'utf8'));if(Array.isArray(host.cases))receipt.cases=host.cases.filter(row=>typeof row?.name==='string'&&typeof row.state==='string').map(({name,state})=>({name,state}));}catch{}}
 fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(failed)throw firstFailure;return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==6||process.argv[2]!=='--artifacts'||process.argv[4]!=='--evidence-root')fail('expected --artifacts and --evidence-root');const result=await runInstalledSmoke(process.argv[3],process.argv[5]);process.stdout.write(JSON.stringify({state:result.state,hostExit:result.hostExit,sourceHeadSha:result.sourceHeadSha})+'\n');}
 catch(error){process.stderr.write(String(error?.message??error)+'\n');process.exitCode=1;}
}
