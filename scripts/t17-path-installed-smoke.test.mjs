import {test,beforeEach,afterEach} from 'node:test';
import cp from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {expectedParserIdentities} from './t14-bounded-document-installed-smoke.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const repository=path.dirname(directory);
const require=createRequire(import.meta.url);
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const ids=['bob-bazaar-review','bob-code-consistency-review','workflow-register'];
const modules=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml','documentBudget','workbookBudget','deadlineCancellation','pathPolicy'];
const pathNames=['path_portable_syntax_and_host_absolute','path_physical_containment_existing_and_missing','path_rejects_root_parent_leaf_links','path_deepest_physical_multi_root','path_three_workspace_marker_roots','path_bounded_file_identity_and_hardlinks','path_stable_input_parent_revalidation','path_ccr_artifact_authoring','path_ccr_output_backup_kind_guards','path_three_extension_canonical_copy','path_workflow_has_path_only_capability','path_unc_native_containment'];
async function api(){
 assert.ok(fs.existsSync(path.join(directory,'t17-path-installed-smoke.mjs')),'installed PATH harness must exist');
 return import('./t17-path-installed-smoke.mjs');
}
function emit(root,name,value){
 const file=path.join(root,name),bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));
 fs.writeFileSync(file,bytes,{flag:'wx'});
 return {path:file,bytes:bytes.length,sha256:sha(bytes)};
}
function tar(entries){
 const blocks=[];
 for(const [name,bytes] of Object.entries(entries)){
  const header=Buffer.alloc(512);
  header.write('package/'+name);header.write('0000644\0',100);header.write('0000000\0',108);header.write('0000000\0',116);
  header.write(bytes.length.toString(8).padStart(11,'0')+'\0',124);header.write('00000000000\0',136);header.fill(32,148,156);header[156]=48;
  header.write('ustar\0',257);header.write('00',263);
  header.write([...header].reduce((a,b)=>a+b,0).toString(8).padStart(6,'0')+'\0 ',148);
  blocks.push(header,bytes,Buffer.alloc((512-bytes.length%512)%512));
 }
 return zlib.gzipSync(Buffer.concat([...blocks,Buffer.alloc(1024)]));
}
function artifactFixture(runtime){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'t17path-contract-'));
 const {zipSync}=require(path.join(repository,'packages/processing-budget-runtime/node_modules/fflate'));
 const sourceHeadSha='1'.repeat(40),sourceTreeSha='2'.repeat(40),payload={};
 for(const name of modules)for(const suffix of ['js','d.ts','js.map'])payload[name+'.'+suffix]=Buffer.from(name+':'+suffix+'\n');
 const compiledModules=Object.keys(payload).sort().map(name=>({path:name,bytes:payload[name].length,sha256:sha(payload[name])}));
 function vsix(name,{wrongProfile=false,wrongBytes=false}={}){
  const workflow=name===ids[2],main='./out/'+(workflow?'extensionWithAuthoring':'extension')+'.js';
  const entries={'extension/package.json':Buffer.from(JSON.stringify({name,publisher:'local',version:'0.0.0',main})),['extension/'+main.slice(2)]:Buffer.from('exports.activate=()=>{};')};
  const prefix='extension/out/shared-processing-budget-runtime/';
  const profile=workflow&&!wrongProfile?'path-only':'full';
  const rows=profile==='path-only'?compiledModules.filter(row=>row.path.startsWith('pathPolicy.')):compiledModules;
  for(const row of rows)if(row.path.endsWith('.js'))entries[prefix+row.path]=wrongBytes&&row.path==='pathPolicy.js'?Buffer.from('changed bytes'):payload[row.path];
  entries[prefix+'manifest.json']=Buffer.from(JSON.stringify({
   schemaVersion:profile==='full'?'bob-builtin-analyze/processing-runtime-copy/v1':'bob-builtin-analyze/processing-runtime-path-copy/v1',
   sourceInputDigest:'a'.repeat(64),...(profile==='path-only'?{profile}:{}),payload:rows
  }));
  if(!workflow)for(const parser of expectedParserIdentities('local.'+name))for(const row of parser.payload)entries['extension/'+row.path]=fs.readFileSync(path.join(repository,'extensions',name,row.path));
  return Buffer.from(zipSync(entries));
 }
 const tarEntries={'package.json':Buffer.from(JSON.stringify({name:'@bob/processing-budget-runtime',version:'0.1.0',private:true,dependencies:{},exports:{'./path-policy':{types:'./out/pathPolicy.d.ts',require:'./out/pathPolicy.js',default:'./out/pathPolicy.js'}}})),
  'README.md':Buffer.from('fixture'),'contracts/processing-budget-definition.v1.json':Buffer.from('{}'),'schema/processing-budget-profile.v1.schema.json':Buffer.from('{}')};
 for(const [name,bytes] of Object.entries(payload))tarEntries['out/'+name]=bytes;
 const proof={schemaVersion:'bob-builtin-analyze/processing-budget-pack-proof/v1',node:process.version,tarball:emit(root,'runtime.tgz',tar(tarEntries)),manifest:Object.keys(tarEntries).sort(),consumerResults:['workflow-register',...ids.slice(0,2)].map(consumer=>({consumer,typecheck:'passed'})),
  runtimeResult:{state:'passed',entry:'out/index.js',checks:['constructor','reserve_commit','release','snapshot','bounded_read','validated_ooxml','deep_import_rejected','aggregate_operation','workbook_budget','path_policy_root','path_policy_subpath','physical_path']},installedResolvedPath:path.join(root,'consumer','out','index.js')};
 function packProof(value,suffix){return emit(root,'proof-wrapper-'+suffix+'.json',{schemaVersion:'bob-builtin-analyze/t17-path-package-proof/v1',sourceHeadSha,sourceTreeSha,proof:emit(root,'pack-proof-'+suffix+'.json',value)});}
 const fixtures=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md','legacy.doc','sparse.xlsx','unselected-over-budget.xlsx','review-input.yaml','diff-fixture.json'].map(name=>({name,...emit(root,name,Buffer.from('fixture '+name))}));
 const probes=['t17-path-installed-baseline-cases.js','t17-path-installed-extension-host.test.js'].map(name=>({name,...emit(root,name,Buffer.from('exports.run=async()=>{};'))}));
 const manifest={schemaVersion:'bob-builtin-analyze/t17-path-artifacts/v1',sourceHeadSha,sourceTreeSha,compiledModules,extensions:ids.map(name=>({id:'local.'+name,vsix:emit(root,name+'.vsix',vsix(name))})),fixtures,packageProof:packProof(proof,'valid'),probes,baseline:runtime.PATH_HOST_BASELINE};
 return {root,manifest,vsix,proof,packProof};
}

test('path_host_requires_exact_49_cases_and_three_copy_profiles',async()=>{
 const runtime=await api(),fixture=artifactFixture(runtime);
 const checked=await runtime.validateArtifactManifest(fixture.manifest);
 assert.deepEqual(checked.archives.map(row=>row.profile),['full','full','path-only']);
 assert.equal(checked.compiled.length,48);
 assert.deepEqual(runtime.PATH_HOST_CASE_NAMES.slice(-12),pathNames);
 assert.equal(runtime.PATH_HOST_CASE_NAMES.length,49);
 const rows=runtime.PATH_HOST_CASE_NAMES.map(name=>({name,state:'passed'}));
 rows[48]={name:pathNames[11],state:'not_applicable',detail:{mode:'posix',reason:'posix_no_native_unc'}};
 assert.equal(runtime.validatePathHostCases(rows,{os:'linux',executionMode:'ci'},null),'passed');
 for(const mutate of [r=>r.pop(),r=>r.push({...r[0]}),r=>r[1]=r[0],r=>[r[0],r[1]]=[r[1],r[0]]]){
  const copy=structuredClone(rows);mutate(copy);
  assert.throws(()=>runtime.validatePathHostCases(copy,{os:'linux',executionMode:'ci'},null),/case/i);
 }
 const forged=structuredClone(fixture.manifest);forged.extensions[2].vsix=emit(fixture.root,'workflow-full.vsix',fixture.vsix(ids[2],{wrongProfile:true}));
 await assert.rejects(()=>runtime.validateArtifactManifest(forged),/profile|runtime/i);
});

test('windows_unc_not_run_cannot_pass_acceptance',async()=>{
 const runtime=await api(),rows=runtime.PATH_HOST_CASE_NAMES.map(name=>({name,state:'passed'}));
 rows[48]={name:pathNames[11],state:'not_run',detail:{mode:'native_unc',reason:'owned_fixture_unavailable'}};
 assert.equal(runtime.validatePathHostCases(rows,{os:'win32',executionMode:'local'},null),'local_partial');
 assert.throws(()=>runtime.validatePathHostCases(rows,{os:'win32',executionMode:'ci'},null),/UNC|case/i);
 rows[48]={name:pathNames[11],state:'passed',detail:{mode:'native_unc',nonce:'3'.repeat(32),root:'foreign',rejections:3}};
 assert.throws(()=>runtime.validatePathHostCases(rows,{os:'win32',executionMode:'ci'},{nonce:'4'.repeat(32),uncRoot:'owned'}),/UNC|case/i);
});

test('path_artifact_joins_installed_bytes_without_repo_fallback',async()=>{
 const runtime=await api(),fixture=artifactFixture(runtime);
 const prepared=await runtime.prepareInstalledArtifacts(fixture.manifest,path.join(fixture.root,'host'));
 assert.equal(prepared.config.extensions.length,3);
 for(const ext of prepared.config.extensions){
  const installed=path.join(ext.root,'out','shared-processing-budget-runtime','pathPolicy.js');
  const wanted=fixture.manifest.compiledModules.find(row=>row.path==='pathPolicy.js');
  assert.equal(sha(fs.readFileSync(installed)),wanted.sha256);
 }
 const drift=structuredClone(fixture.manifest);drift.extensions[2].vsix=emit(fixture.root,'changed-runtime.vsix',fixture.vsix(ids[2],{wrongBytes:true}));
 await assert.rejects(()=>runtime.validateArtifactManifest(drift),/hash|binding/i);
 const corrupt=fixture.vsix(ids[2]);corrupt[14]^=1;
 drift.extensions[2].vsix=emit(fixture.root,'corrupt.vsix',corrupt);
 await assert.rejects(()=>runtime.validateArtifactManifest(drift),/artifact|CRC/i);
 const proof=structuredClone(fixture.proof);proof.consumerResults.pop();drift.extensions[2]=fixture.manifest.extensions[2];drift.packageProof=fixture.packProof(proof,'missing-consumer');
 await assert.rejects(()=>runtime.validateArtifactManifest(drift),/type proof/i);
});

test('path_installed_host_rejects_32_or_34_runtime_modules',async()=>{
 const runtime=await api(),fixture=artifactFixture(runtime);
 const {config}=await runtime.prepareInstalledArtifacts(fixture.manifest,path.join(fixture.root,'host'));
 const cases=runtime.PATH_HOST_CASE_NAMES.map((name,index)=>index<25?{name,state:'passed'}:{
  name,state:'passed',detail:{mode:'installed_module_controlled_clock'}
 });
 const child=cases.find(row=>row.name==='deadline_native_child_settlement');
 child.detail={mode:'native_child',pid:1,exitEventObserved:true,aliveAfterRejection:false,
  terminationCause:'stdout_limit',cleanupStatus:'controller_settled',exitObservationPhase:'after_controller_settlement'};
 cases[48]=process.platform==='win32'
  ?{name:pathNames[11],state:'not_run',detail:{mode:'native_unc',reason:'owned_fixture_unavailable'}}
  :{name:pathNames[11],state:'not_applicable',detail:{mode:'posix',reason:'posix_no_native_unc'}};
 for(const count of [32,34]){
  const host={schemaVersion:'bob-builtin-analyze/t17-path-installed-host/v1',
   sourceHeadSha:config.sourceHeadSha,sourceTreeSha:config.sourceTreeSha,vscode:'1.106.1',node:process.version,
   ...config.execution,state:process.platform==='win32'?'local_partial':'passed',
   productActivationProbe:'not_run',productDeactivationProbe:'not_run',
   activatedExtensions:config.extensions.map(item=>item.id),baseline:config.baseline,cases,
   loadedModules:Array.from({length:count},()=>({})),parserIdentities:Array.from({length:8},()=>({}))};
  await assert.rejects(()=>runtime.validateInstalledHostReceipt(host,config,fixture.manifest,0),/33 runtime/);
 }
});

test('path_artifact_rejects_native_unc_from_another_source',async()=>{
 const runtime=await api(),{root,manifest}=artifactFixture(runtime);
 const foreign={schemaVersion:'bob-builtin-analyze/t17-path-native-unc-fixture/v1',
  executionMode:'native_windows_runner',state:'ready',createdByThisInvocation:true,
  sourceHeadSha:'f'.repeat(40),sourceTreeSha:manifest.sourceTreeSha,
  ci:null,nonce:null,fixtureRoot:null,evidenceRoot:null,shareName:null,uncRoot:null,
  runnerPrincipal:null,runnerSid:null,share:null,bindings:null};
 manifest.nativeUncFixture=emit(root,'foreign-unc.json',foreign);
 await assert.rejects(()=>runtime.validateArtifactManifest(manifest),/native UNC fixture subject/);
});

// Synthetic manifest subjects are local contract fixtures, including on a real
// CI runner. The native CLI remains in the separately guarded workflow step.
const contextKeys=['GITHUB_ACTIONS','RUNNER_OS','GITHUB_EVENT_NAME','EXPECTED_HEAD_SHA','CI_VERIFIED_HEAD_SHA'];
let savedContext;
beforeEach(()=>{savedContext=Object.fromEntries(contextKeys.map(key=>[key,process.env[key]]));delete process.env.GITHUB_ACTIONS;});
afterEach(()=>{for(const [key,value]of Object.entries(savedContext))if(value===undefined)delete process.env[key];else process.env[key]=value;});
test('synthetic_path_subject_cannot_be_promoted_to_guarded_CI_evidence',async()=>{
 const runtime=await api(),fixture=artifactFixture(runtime);
 const head=cp.execFileSync('git',['rev-parse','HEAD'],{cwd:repository,encoding:'utf8'}).trim();
 Object.assign(process.env,{GITHUB_ACTIONS:'true',RUNNER_OS:process.platform==='win32'?'Windows':'Linux',GITHUB_EVENT_NAME:'pull_request',EXPECTED_HEAD_SHA:head,CI_VERIFIED_HEAD_SHA:head});
 const host=path.join(fixture.root,'forged-ci-host');
 await assert.rejects(()=>runtime.prepareInstalledArtifacts(fixture.manifest,host),/CI source guard mismatch/);
 assert.equal(fs.existsSync(host),false);
});
