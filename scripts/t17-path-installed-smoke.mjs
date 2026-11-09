import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {validateVsixArchive} from '../tools/workflow-evidence/lib/vsixArchive.mjs';
import {expectedParserIdentities} from './t14-bounded-document-installed-smoke.mjs';
const require=createRequire(import.meta.url),repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml','documentBudget','workbookBudget','deadlineCancellation','pathPolicy'];
const compiledNames=names.flatMap(name=>['js','d.ts','js.map'].map(suffix=>name+'.'+suffix)).sort();
const ids=['local.bob-bazaar-review','local.bob-code-consistency-review','local.workflow-register'];
const fixtureNames=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md','legacy.doc','sparse.xlsx','unselected-over-budget.xlsx','review-input.yaml','diff-fixture.json'];
const probeNames=['t17-path-installed-baseline-cases.js','t17-path-installed-extension-host.test.js'];
const origin = {
 "sourceHeadSha": "cf96788dbdd6836b449b7a31ecd3bae4ee4302a4",
 "sourceTreeSha": "4955685da8d99efbb7424efcf278be3262d34dac",
 "rows": [
  {
   "path": "scripts/t17-deadline-installed-smoke.mjs",
   "blob": "f46223f8f4aec446b7c109a506735f7ac6c6cf61",
   "bytes": 30902,
   "sha256": "1003741f4e872afc60ae8f370ec4fa5e8f6f373b893cb5256641b30b20840fd7"
  },
  {
   "path": "scripts/t17-deadline-installed-smoke.test.mjs",
   "blob": "b7a5925a5a8f40d7de76ecf309fcfad3294ab26d",
   "bytes": 19418,
   "sha256": "1d7cb940cbee58db1a691c6eaa86061c103daa748c9cd586edee87c080ccfb42"
  },
  {
   "path": "scripts/t17-deadline-installed-extension-host.test.js",
   "blob": "9a274b5d9bb0b067d342b65e7c8540ce1a5b0382",
   "bytes": 17231,
   "sha256": "a3cfc627abc7376007c81664d42cd70683f242b184eee3c2b4efac45af714ce8"
  },
  {
   "path": "scripts/t17-deadline-installed-baseline-cases.js",
   "blob": "f483caa75536f1239c4854f436e3740cc87adff7",
   "bytes": 43905,
   "sha256": "e12312a0cd27675b711f5ac11841dec0fb10fd1e3a5ad98ad6bd83b30a477aa3"
  }
 ]
};
const baselineNames=['normal_docx','normal_xlsx','missing_both_xlsx','crc_rejected','oversize_rejected','mutation_discarded','locators_preserved','source_unchanged','installed_gui_error_is_logged_once_and_queue_recovers','document_count_rejected_before_io','raw_aggregate_counts_duplicate_selections','pre_cancelled_document_has_no_parser','sparse_xlsx_rejected_before_parser','unselected_sheet_budget_is_enforced','parser_await_cancellation_discards_result','ordinary_failure_warns_and_aggregate_failure_throws','source_admission_raw_is_charged_once','shared_operation_all_input_stages','independent_stdout_stderr_exact','stdout_overflow_waits_for_child_exit','git_overflow_preserves_complete_metadata','excerpt_parent_budget_is_fatal','mandatory_bob_metadata_survives_clipping','artifact_failure_releases_pending','utf8_package_bytes_and_unmanaged_file_are_preserved'];
const additional=['deadline_one_owner_reaches_all_stages','deadline_preexpired_fixture_has_no_reads','deadline_authentication_rejects_forged_reason','deadline_first_user_cause_survives_expiry','deadline_sync_read_refreshes_before_timer','deadline_sync_ooxml_refreshes_before_reserve','deadline_batch_signal_priority_and_shared_endpoint','deadline_mcp_calls_get_fresh_client','deadline_borrowed_dispose_keeps_owner_live','deadline_native_child_settlement','deadline_outer_cancel_wins_after_transport_failure','deadline_final_ledger_before_success'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(reason){throw Error('artifact verification: '+reason);}
function canonical(value){return JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);}
function same(a,b){return canonical(a)===canonical(b);}
function exactObject(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(Object.keys(input).sort())!==JSON.stringify([...keys].sort()))fail('closed object required');}
function noAlias(file){if(typeof file!=='string'||!path.isAbsolute(file))fail('absolute artifact path required');const absolute=path.resolve(file),root=path.parse(absolute).root;let current=root;for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())fail('path alias');}return absolute;}
function row(input,expectedName){
 exactObject(input,['path','bytes','sha256']);if(typeof input.path!=='string'||(expectedName!==undefined&&input.path!==expectedName)||!Number.isSafeInteger(input.bytes)||input.bytes<=0||typeof input.sha256!=='string'||!/^[0-9a-f]{64}$/.test(input.sha256))fail('invalid positive byte binding');
 return{path:input.path,bytes:input.bytes,sha256:input.sha256};
}
function readBinding(binding,maximum){
 row(binding);if(!path.isAbsolute(binding.path)||binding.bytes>maximum)fail('invalid artifact path or size');const file=noAlias(binding.path),before=fs.statSync(file);if(!before.isFile()||before.size!==binding.bytes)fail('artifact size mismatch');const bytes=fs.readFileSync(file);if(bytes.length!==binding.bytes||sha(bytes)!==binding.sha256)fail('artifact hash mismatch');return bytes;
}
function binding(file){const bytes=fs.readFileSync(noAlias(file));return{path:fs.realpathSync(file),bytes:bytes.length,sha256:sha(bytes)};}
function compiledRows(rows){if(!Array.isArray(rows)||rows.length!==compiledNames.length)fail('compiled inventory');return rows.map((input,index)=>row(input,compiledNames[index]));}
const pathNames = [
 'path_portable_syntax_and_host_absolute','path_physical_containment_existing_and_missing',
 'path_rejects_root_parent_leaf_links','path_deepest_physical_multi_root','path_three_workspace_marker_roots',
 'path_bounded_file_identity_and_hardlinks','path_stable_input_parent_revalidation','path_ccr_artifact_authoring',
 'path_ccr_output_backup_kind_guards','path_three_extension_canonical_copy','path_workflow_has_path_only_capability',
 'path_unc_native_containment'
];
export const PATH_HOST_CASE_NAMES = Object.freeze([...baselineNames,...additional,...pathNames]);
export const PATH_HOST_BASELINE = Object.freeze({
 mode:'case_semantics_preserved_in_t17_path_probe',
 sourceHeadSha:origin.sourceHeadSha,
 sourceTreeSha:origin.sourceTreeSha,
 probes:origin.rows,
 cases:[...baselineNames,...additional],
 adaptations:['native16_full_and_1_path_only','real_activation_three_extensions','preserved_deadline_cases']
});
const baseline = PATH_HOST_BASELINE;
const pathCopyNames = ['pathPolicy.d.ts','pathPolicy.js','pathPolicy.js.map'];
const runtimeNames = index => index===2?['pathPolicy']:names;

export function validatePathHostCases(rows,context,fixture) {
 if (!Array.isArray(rows) || !same(rows.map(row=>row?.name),PATH_HOST_CASE_NAMES)
   || rows.slice(0,48).some(row=>row.state!=='passed')) fail('49-case inventory or state mismatch');
 const last=rows[48];
 if (context.os==='linux') {
  if (fixture || last.state!=='not_applicable'
    || !same(last.detail,{mode:'posix',reason:'posix_no_native_unc'})) fail('UNC case is inapplicable on Linux');
  return 'passed';
 }
 if (context.os!=='win32') fail('unsupported host OS');
 if (!fixture) {
  if (context.executionMode!=='local' || last.state!=='not_run'
    || !same(last.detail,{mode:'native_unc',reason:'owned_fixture_unavailable'})) fail('Windows CI requires a passed native UNC case');
  return 'local_partial';
 }
 if (last.state!=='passed' || !same(last.detail,{
  mode:'native_unc',nonce:fixture.nonce,root:fixture.uncRoot,rejections:3
 })) fail('UNC case fixture mismatch');
 return 'passed';
}

function executionContext(manifest) {
 const os=process.platform;
 if (!['win32','linux'].includes(os)) fail('unsupported host OS');
 if (process.env.GITHUB_ACTIONS!=='true') {
  if (manifest.nativeUncFixture) fail('native UNC fixture requires the guarded CI runner');
  return {os,executionMode:'local'};
 }
 const runnerOs=os==='win32'?'Windows':'Linux';
 const guard=require('./verify-ci-head.js').verifyCiHead(process.env,repositoryRoot);
 const tree=cp.execFileSync('git',['rev-parse','--verify','HEAD^{tree}'],{
  cwd:repositoryRoot,encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000
 }).trim();
 if (process.env.RUNNER_OS!==runnerOs || process.env.CI_VERIFIED_HEAD_SHA!==guard.actualHeadSha
   || guard.actualHeadSha!==manifest.sourceHeadSha || tree!==manifest.sourceTreeSha) fail('CI source guard mismatch');
 if (Boolean(manifest.nativeUncFixture)!==(os==='win32')) fail('native UNC fixture required on Windows CI only');
 return {os,executionMode:'ci'};
}

function nativeFixture(bound,manifest) {
 const fixture=JSON.parse(readBinding(bound,1048576));
 exactObject(fixture,['schemaVersion','executionMode','state','sourceHeadSha','sourceTreeSha','ci','nonce','fixtureRoot','evidenceRoot','shareName','uncRoot','runnerPrincipal','runnerSid','createdByThisInvocation','share','bindings']);
 if (fixture.schemaVersion!=='bob-builtin-analyze/t17-path-native-unc-fixture/v1'
  || fixture.executionMode!=='native_windows_runner' || fixture.state!=='ready'
  || fixture.createdByThisInvocation!==true || fixture.sourceHeadSha!==manifest.sourceHeadSha
  || fixture.sourceTreeSha!==manifest.sourceTreeSha || !/^[a-f0-9]{32}$/.test(fixture.nonce)
  || fixture.shareName!=='bob-t17path-'+fixture.nonce
  || fixture.uncRoot!=='\\\\127.0.0.1\\'+fixture.shareName) fail('native UNC fixture subject');
 exactObject(fixture.ci,['event','verifiedHeadSha','dispatchNonce']);
 if (fixture.ci.verifiedHeadSha!==manifest.sourceHeadSha || !['push','pull_request','workflow_dispatch'].includes(fixture.ci.event)) fail('UNC CI subject');
 const evidenceRoot=path.dirname(bound.path);
 if (path.basename(bound.path)!=='native-unc-fixture.json' || fixture.evidenceRoot!==evidenceRoot) fail('UNC evidence root mismatch');
 exactObject(fixture.bindings,['ownerMarker','probeFile','nestedProbeFile','observations','powershellScript','driverScript','powershellLogs']);
 const expected={
  ownerMarker:path.join(fixture.fixtureRoot,'.t17-path-owner.json'),
  probeFile:path.join(fixture.fixtureRoot,'日本語 space.txt'),
  nestedProbeFile:path.join(fixture.fixtureRoot,'content','inner.txt'),
  observations:path.join(evidenceRoot,'native-unc-observations.json'),
  powershellScript:path.join(repositoryRoot,'scripts','t17-path-native-unc-fixture.ps1'),
  driverScript:path.join(repositoryRoot,'scripts','t17-path-native-unc-fixture.mjs')
 };
 const operations=['identity','query','create','query'];
 const logs=fixture.bindings.powershellLogs;
 if (!Array.isArray(logs)||logs.length!==operations.length) fail('UNC preparation logs');
 for (const [key,value] of Object.entries(expected)) {
  row(fixture.bindings[key]);
  if (path.resolve(fixture.bindings[key].path)!==path.resolve(value)) fail('foreign UNC binding');
 }
 for (const [index,operation] of operations.entries()) {
  row(logs[index]);
  if (logs[index].path!==path.join(evidenceRoot,'powershell-0'+index+'-'+operation+'.json')) fail('foreign UNC log');
 }
 if (process.env.GITHUB_ACTIONS!=='true'||process.platform!=='win32') fail('native UNC fixture requires the current Windows runner');
 const temp=noAlias(process.env.RUNNER_TEMP);
 for (const location of [fixture.fixtureRoot,evidenceRoot]) {
  const relative=path.relative(temp,noAlias(location));
  if (!relative || relative==='..' || relative.startsWith('..'+path.sep) || path.isAbsolute(relative)
    || !path.basename(location).includes(fixture.nonce)) fail('foreign UNC fixture root');
 }
 const bytes=Object.fromEntries(Object.keys(expected).map(key=>[key,readBinding(fixture.bindings[key],1048576)]));
 const marker=JSON.parse(bytes.ownerMarker);
 if (!same(marker,{schemaVersion:'bob-builtin-analyze/t17-path-native-unc-owner/v1',
  sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,nonce:fixture.nonce,
  fixtureRoot:fixture.fixtureRoot,shareName:fixture.shareName,runnerPrincipal:fixture.runnerPrincipal,runnerSid:fixture.runnerSid
 })) fail('UNC marker mismatch');
 const share={name:fixture.shareName,path:fixture.fixtureRoot,description:'bob-t17-path:'+fixture.nonce+':'+manifest.sourceHeadSha,
  scopeName:'*',access:[{principal:fixture.runnerPrincipal,sid:fixture.runnerSid,type:'Allow',right:'Full'}]};
 if (!same(fixture.share,share)) fail('UNC share owner mismatch');
 for (const [index,operation] of operations.entries()) {
  const log=JSON.parse(readBinding(logs[index],1048576)),output=JSON.parse(log.stdout);
  if (log.exitCode!==0 || log.stderr!=='' || output.operation!==operation || output.state!=='ok'
    || !same(output.identity,{principal:fixture.runnerPrincipal,sid:fixture.runnerSid})
    || output.created!==(index===2) || output.removed!==false
    || !same(output.share,index>=2?share:null)) fail('UNC PowerShell operation transcript');
 }
 const observations=JSON.parse(bytes.observations);
 if (observations.schemaVersion!=='bob-builtin-analyze/t17-path-native-unc-observations/v1'
  || observations.executionMode!=='native_windows_runner' || observations.state!=='passed'
  || observations.sourceHeadSha!==manifest.sourceHeadSha || observations.sourceTreeSha!==manifest.sourceTreeSha
  || observations.nonce!==fixture.nonce || observations.root?.path!==fixture.uncRoot
  || observations.root.isDirectory!==true || observations.file?.path!==fixture.uncRoot+'\\日本語 space.txt'
  || observations.file.isFile!==true || observations.file.sha256!==sha(bytes.probeFile)
  || observations.file.bytes!==bytes.probeFile.length
  || !same(observations.links,['root-link','parent-link','target-link'].map(name=>({path:fixture.uncRoot+'\\'+name,isSymbolicLink:true})))) fail('UNC observations mismatch');
 return fixture;
}

function verifyCopy(archive,expected,index){
 const profile=index===2?'path-only':'full';
 const prefix='extension/out/shared-processing-budget-runtime/';
 const entries=archive.entries.filter(entry=>entry.path.startsWith(prefix)&&entry.kind==='file');
 const wanted=[...runtimeNames(index).map(name=>name+'.js'),'manifest.json'].sort();
 if (!same(entries.map(entry=>entry.path.slice(prefix.length)).sort(),wanted)) fail('installed runtime profile inventory');
 const copy=JSON.parse(archive.readEntry(prefix+'manifest.json').toString('utf8'));
 exactObject(copy,profile==='full'?['schemaVersion','sourceInputDigest','payload']:['schemaVersion','profile','sourceInputDigest','payload']);
 const schema=profile==='full'?'bob-builtin-analyze/processing-runtime-copy/v1':'bob-builtin-analyze/processing-runtime-path-copy/v1';
 if (copy.schemaVersion!==schema || (profile==='path-only' && copy.profile!==profile)
  || !/^[a-f0-9]{64}$/.test(copy.sourceInputDigest)) fail('invalid runtime copy profile');
 const payload=profile==='full'?expected:expected.filter(row=>pathCopyNames.includes(row.path));
 if (!same(copy.payload,payload)) fail('compiled binding mismatch');
 for (const entry of entries) {
  const name=entry.path.slice(prefix.length);
  if (name==='manifest.json') continue;
  const bound=payload.find(row=>row.path===name);
  if (!bound || entry.bytes!==bound.bytes || entry.sha256!==bound.sha256) fail('installed runtime hash mismatch');
 }
 return {profile,digest:copy.sourceInputDigest};
}

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
 for(const id of ids.slice(0,2)){const folder=path.join(sourceRoot,'extensions',id.slice('local.'.length)),lock=JSON.parse(fs.readFileSync(noAlias(path.join(folder,'package-lock.json')),'utf8'));
  for(const parser of expectedParserIdentities(id)){
   const locked=lock.packages['node_modules/'+parser.name];if(locked?.version!==parser.version||locked.integrity!==parser.integrity)fail('source parser lock mismatch');
   for(const expected of parser.payload){const bytes=fs.readFileSync(noAlias(path.join(folder,expected.path)));if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('source parser payload mismatch');}
  }
 }
}
const packagePaths=['package.json','README.md','contracts/processing-budget-definition.v1.json','schema/processing-budget-profile.v1.schema.json',...compiledNames.map(name=>'out/'+name)].sort();
const consumers=['workflow-register','bob-bazaar-review','bob-code-consistency-review'];
const runtimeResult={state:'passed',entry:'out/index.js',checks:['constructor','reserve_commit','release','snapshot','bounded_read','validated_ooxml','deep_import_rejected','aggregate_operation','workbook_budget','path_policy_root','path_policy_subpath','physical_path']};
function verifyTarball(bytes,compiled){
 let tar;try{tar=zlib.gunzipSync(bytes,{maxOutputLength:16*1048576});}catch{fail('invalid bounded npm tarball');}
 if(tar.length%512!==0)fail('tar block length');let offset=0;const files=new Map();
 function octal(header,start,length){const text=header.subarray(start,start+length).toString('ascii').replace(/\0.*$/s,'').trim();if(!/^[0-7]+$/.test(text))fail('tar numeric field');const n=parseInt(text,8);if(!Number.isSafeInteger(n))fail('tar unsafe integer');return n;}
 while(offset+512<=tar.length){const header=tar.subarray(offset,offset+512);if(header.every(b=>b===0)){if(offset+1024>tar.length||!tar.subarray(offset).every(b=>b===0))fail('tar end markers');offset=tar.length;break;}const expected=octal(header,148,8);let sum=0;for(let i=0;i<512;i++)sum+=(i>=148&&i<156)?32:header[i];if(sum!==expected)fail('tar header checksum');const file=header.subarray(0,100).toString('utf8').split('\0')[0],prefix=header.subarray(345,500).toString('utf8').split('\0')[0];if(prefix||![0,48].includes(header[156])||!file.startsWith('package/'))fail('tar path or entry type');const relative=file.slice(8),size=octal(header,124,12);if(!packagePaths.includes(relative)||files.has(relative)||size>16*1048576||offset+512+size>tar.length)fail('tar payload inventory');files.set(relative,tar.subarray(offset+512,offset+512+size));offset+=512+Math.ceil(size/512)*512;}
 if(offset!==tar.length||!same([...files.keys()].sort(),packagePaths))fail('52-path tar inventory');
 for(const item of compiled){const bytes=files.get('out/'+item.path);if(bytes.length!==item.bytes||sha(bytes)!==item.sha256)fail('tar compiled binding');}
 const pkg=JSON.parse(files.get('package.json').toString('utf8'));if(pkg.name!=='@bob/processing-budget-runtime'||pkg.version!=='0.1.0'||pkg.private!==true||Object.keys(pkg.dependencies??{}).length)fail('tar package identity');
 if(!same(pkg.exports?.['./path-policy'],{types:'./out/pathPolicy.d.ts',require:'./out/pathPolicy.js',default:'./out/pathPolicy.js'}))fail('tar path subpath exports');
}
function verifyPackageProof(bound,manifest,compiled){
 const wrapper=JSON.parse(readBinding(bound,1048576));exactObject(wrapper,['schemaVersion','sourceHeadSha','sourceTreeSha','proof']);if(wrapper.schemaVersion!=='bob-builtin-analyze/t17-path-package-proof/v1'||wrapper.sourceHeadSha!==manifest.sourceHeadSha||wrapper.sourceTreeSha!==manifest.sourceTreeSha)fail('package proof subject');
 const proof=JSON.parse(readBinding(wrapper.proof,1048576));exactObject(proof,['schemaVersion','node','tarball','manifest','consumerResults','runtimeResult','installedResolvedPath']);if(proof.schemaVersion!=='bob-builtin-analyze/processing-budget-pack-proof/v1'||typeof proof.node!=='string'||typeof proof.installedResolvedPath!=='string'||!same(proof.manifest,packagePaths)||!same(proof.consumerResults,consumers.map(consumer=>({consumer,typecheck:'passed'})))||!same(proof.runtimeResult,runtimeResult))fail('package or three-type proof');verifyTarball(readBinding(proof.tarball,16*1048576),compiled);return{wrapper,proof};
}
export async function validateArtifactManifest(manifest){
 try{exactObject(manifest,['schemaVersion','sourceHeadSha','sourceTreeSha','compiledModules','extensions','fixtures','packageProof','probes','baseline',...(Object.hasOwn(manifest,'nativeUncFixture')?['nativeUncFixture']:[])]);if(manifest.schemaVersion!=='bob-builtin-analyze/t17-path-artifacts/v1'||!/^[a-f0-9]{40}$/.test(manifest.sourceHeadSha)||!/^[a-f0-9]{40}$/.test(manifest.sourceTreeSha)||!same(manifest.baseline,baseline))fail('current or baseline subject');
 const compiled=compiledRows(manifest.compiledModules);if(!Array.isArray(manifest.extensions)||manifest.extensions.length!==3)fail('three VSIX inventory');
 const archives=manifest.extensions.map((item,index)=>{exactObject(item,['id','vsix']);if(item.id!==ids[index])fail('extension identity');const archive=validateVsixArchive(readBinding(item.vsix,[12000000,11000000,1200000][index])),pkg=JSON.parse(archive.readEntry('extension/package.json'));if(pkg.publisher+'.'+pkg.name!==item.id||pkg.main!==['./out/extension.js','./out/extension.js','./out/extensionWithAuthoring.js'][index]||!archive.entries.some(entry=>entry.kind==='file'&&entry.path==='extension/'+pkg.main.slice(2)))fail('installed extension manifest');return{archive,...verifyCopy(archive,compiled,index),parsers:index<2?verifyParsers(archive,item.id):[]};});if(new Set(archives.map(item=>item.digest)).size!==1)fail('different runtime builds');
 if(!Array.isArray(manifest.fixtures)||manifest.fixtures.length!==10)fail('fixture inventory');const fixtures=manifest.fixtures.map((item,index)=>{exactObject(item,['name','path','bytes','sha256']);if(item.name!==fixtureNames[index])fail('fixture name');const{name,...bound}=item;return{name,bytes:readBinding(bound,25*1048576),binding:bound};});
 if(!Array.isArray(manifest.probes)||manifest.probes.length!==2)fail('probe inventory');const probes=manifest.probes.map((item,index)=>{exactObject(item,['name','path','bytes','sha256']);if(item.name!==probeNames[index])fail('probe name');const{name,...bound}=item;return{name,bytes:readBinding(bound,1048576),binding:bound};});const packageProof=verifyPackageProof(manifest.packageProof,manifest,compiled);const nativeUncFixture=manifest.nativeUncFixture?nativeFixture(manifest.nativeUncFixture,manifest):null;return{manifest,compiled,archives,fixtures,probes,packageProof,nativeUncFixture};
 }catch(error){if(error.message?.startsWith('artifact verification:'))throw error;fail('invalid artifact input');}
}
function freshChild(parent,prefix){noAlias(parent);const created=fs.mkdtempSync(path.toNamespacedPath(path.join(parent,prefix)));return path.join(parent,path.basename(created));}
export async function createArtifactManifest(sourceRoot,evidenceParent){
 noAlias(sourceRoot);noAlias(evidenceParent);verifySourceParserIdentities(sourceRoot);const inputRoot=freshChild(evidenceParent,'t17path-artifacts-'),build=require(path.join(sourceRoot,'packages/processing-budget-runtime/scripts/build-runtime.js')).verifiedBuild();
 const git=(...args)=>cp.execFileSync('git',['-c','core.fscache=false','-c','core.fsmonitor=false',...args],{cwd:sourceRoot,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'},stdio:['ignore','pipe','pipe']}).trim(),head=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
 const extensions=ids.map(id=>{const name=id.slice(6),folder=path.join(sourceRoot,'extensions',name),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'))),target=path.join(inputRoot,name+'.vsix');fs.copyFileSync(noAlias(path.join(folder,name+'-'+pkg.version+'.vsix')),target,fs.constants.COPYFILE_EXCL);return{id,vsix:binding(target)};});
 const fixture=require(path.join(sourceRoot,'extensions/bob-bazaar-review/test/helpers/ruleDocumentFixtures.js')),codec=createRequire(path.join(sourceRoot,'extensions/bob-bazaar-review/package.json'))('fflate');const docx=fixture.createDocxFixture(),xlsx=fixture.createXlsxFixture(),sparse=part=>{const entries=codec.unzipSync(xlsx);entries[part]=codec.strToU8('<worksheet><sheetData><row r="502"/></sheetData></worksheet>');return Buffer.from(codec.zipSync(entries));};
 const review={schema_version:1,review:{id:'t17-installed',title:'T17 deadline',change_type:'bugfix',purpose:'installed bounded preprocessing',base:'a',head:'b',vcs:'git'},artifacts:{requirements:[{path:'source.md'}]},review_focus:['requirement-code-consistency']},diff={base:'a',head:'b',files:[{path:'src/t16.c',status:'modified',additions:1,deletions:1}],unifiedDiff:'diff --git a/src/t16.c b/src/t16.c\n--- a/src/t16.c\n+++ b/src/t16.c\n@@ -1 +1 @@\n-int t16(void) { return 0; }\n+int t16(void) { return 1; }\n',warnings:[]};
 const bytes=[docx,xlsx,fixture.createXlsxFixture({omitStyles:true}),fixture.createDocxFixture({additionalEntries:[{name:'custom/bad-crc.bin',data:Buffer.from('tampered'),crc32:0}]}),Buffer.from('# REQ-ARTIFACT-001\nsource must remain intact\n'),Buffer.from('d0cf11e0a1b11ae1','hex'),sparse('xl/worksheets/sheet2.xml'),sparse('xl/worksheets/sheet1.xml'),Buffer.from(JSON.stringify(review,null,2)+'\n'),Buffer.from(JSON.stringify(diff,null,2)+'\n')];
 const fixtures=fixtureNames.map((name,index)=>{const file=path.join(inputRoot,name);fs.writeFileSync(file,bytes[index],{flag:'wx'});return{name,...binding(file)};});
 const probes=probeNames.map(name=>{const file=path.join(inputRoot,name);fs.copyFileSync(noAlias(path.join(sourceRoot,'scripts',name)),file,fs.constants.COPYFILE_EXCL);return{name,...binding(file)};});
 const helper=require(path.join(sourceRoot,'packages/processing-budget-runtime/test/helpers.js')),packRoot=path.join(inputRoot,'package-proof');fs.mkdirSync(packRoot);const proof=helper.packAndInstall(path.join(sourceRoot,'packages/processing-budget-runtime'),packRoot,{pathPolicy:true}),proofPath=path.join(inputRoot,'t17-path-package-proof.json');fs.writeFileSync(proofPath,JSON.stringify({schemaVersion:'bob-builtin-analyze/t17-path-package-proof/v1',sourceHeadSha:head,sourceTreeSha:tree,proof:proof.receipt},null,2)+'\n',{flag:'wx'});
 const manifest={schemaVersion:'bob-builtin-analyze/t17-path-artifacts/v1',sourceHeadSha:head,sourceTreeSha:tree,compiledModules:build.payload,extensions,fixtures,packageProof:binding(proofPath),probes,baseline};
 if(process.env.T17_PATH_NATIVE_UNC_MANIFEST)manifest.nativeUncFixture=binding(process.env.T17_PATH_NATIVE_UNC_MANIFEST);
 executionContext(manifest);await validateArtifactManifest(manifest);const file=path.join(inputRoot,'manifest.json');fs.writeFileSync(file,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return file;
}
function claimRoot(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))fail('absolute fresh evidence root required');const absolute=path.resolve(directory);
 const workbench=path.join(absolute,'vscode-cache/vscode-win32-x64-archive-1.106.1/resources/app/out/vs/code/electron-browser/workbench/workbench.html');
 if(process.platform==='win32'&&workbench.length>=260)fail('Windows renderer path exceeds 259 characters; choose a shorter fresh physical evidence root');
 if(fs.existsSync(absolute)){noAlias(absolute);if(!fs.statSync(absolute).isDirectory()||fs.readdirSync(absolute).length)fail('evidence root must be fresh and empty');}else{noAlias(path.dirname(absolute));fs.mkdirSync(absolute);}
 fs.writeFileSync(path.join(absolute,'owned.json'),JSON.stringify({schemaVersion:'bob-builtin-analyze/t17-path-owned-root/v1',pid:process.pid})+'\n',{flag:'wx'});return fs.realpathSync(absolute);
}
export async function prepareInstalledArtifacts(input,evidenceRoot){
 const manifest=typeof input==='string'?JSON.parse(fs.readFileSync(noAlias(input),'utf8')):input;
 const execution=executionContext(manifest);
 const checked=await validateArtifactManifest(manifest),root=claimRoot(evidenceRoot),artifactsRoot=path.join(root,'artifacts'),workspaceRoot=path.join(root,'workspace'),probeRoot=path.join(root,'probe'),logsRoot=path.join(root,'logs');for(const dir of [artifactsRoot,workspaceRoot,probeRoot,logsRoot,path.join(root,'user-data'),path.join(root,'extensions'),path.join(root,'vscode-cache')])fs.mkdirSync(dir);
 const all=checked.archives.map(({archive},index)=>{const target=path.join(artifactsRoot,ids[index].slice(6));fs.mkdirSync(target);for(const entry of archive.entries.filter(e=>e.path.startsWith('extension/')&&e.kind==='file')){const relative=entry.path.slice(10),output=path.resolve(target,relative);if(!output.startsWith(target+path.sep))fail('extraction escape');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,archive.readEntry(entry.path),{flag:'wx'});}return{id:ids[index],root:fs.realpathSync(target),parsers:checked.archives[index].parsers};}),extensions=all;
 for(const fixture of checked.fixtures)fs.writeFileSync(path.join(workspaceRoot,fixture.name),fixture.bytes,{flag:'wx'});for(const probe of checked.probes)fs.writeFileSync(path.join(probeRoot,probe.name),probe.bytes,{flag:'wx'});
 const baselineConfigPath=path.join(probeRoot,'baseline-config.json'),baselineStageConfigPath=path.join(probeRoot,'baseline-stage-config.json'),baselineHostReceiptPath=path.join(logsRoot,'t17-baseline25.json'),hostReceiptPath=path.join(logsRoot,'t17-host-receipt.json');
 const base={sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,extensions:extensions.slice(0,2),workflowRuntimePath:path.join(extensions[2].root,'out','shared-processing-budget-runtime','pathPolicy.js'),workspaceRoot,fixtures:manifest.fixtures,hostReceiptPath:path.join(logsRoot,'t17-baseline17.json')};fs.writeFileSync(baselineConfigPath,JSON.stringify(base,null,2)+'\n',{flag:'wx'});fs.writeFileSync(baselineStageConfigPath,JSON.stringify({sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,baselineConfigPath,baselineHostReceiptPath:base.hostReceiptPath,hostReceiptPath:baselineHostReceiptPath,supplementalFixtures:manifest.fixtures.slice(8)},null,2)+'\n',{flag:'wx'});
 const config={sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,extensions,workspaceRoot,fixtures:manifest.fixtures,probes:manifest.probes,baseline:manifest.baseline,execution,nativeUncFixture:checked.nativeUncFixture,baselineConfigPath,baselineStageConfigPath,baselineHostReceiptPath,hostReceiptPath};fs.writeFileSync(path.join(probeRoot,'t17-path-config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});fs.writeFileSync(path.join(probeRoot,'package.json'),JSON.stringify({name:'t17-artifact-probe',publisher:'local',version:'0.0.0',engines:{vscode:'^1.106.1'},main:'./main.js',activationEvents:[]})+'\n',{flag:'wx'});fs.writeFileSync(path.join(probeRoot,'main.js'),'exports.activate=()=>{};\n',{flag:'wx'});return{root,config,probeRoot,workflowRoot:all[2].root};
}
function pinnedHostRuntime(){
 const folder=path.join(repositoryRoot,'extensions/bob-bazaar-review/node_modules');
 for(const [name,version]of [['@vscode/test-cli','0.0.12'],['@vscode/test-electron','2.5.2']]){const dir=noAlias(path.join(folder,name));if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).version!==version)fail('pinned host tooling required after packaging');}
 return createRequire(path.join(repositoryRoot,'extensions/bob-bazaar-review/package.json'))('@vscode/test-electron');
}
export async function validateInstalledHostReceipt(host,config,manifest,exit) {
 const checked=await validateArtifactManifest(manifest);
 const context=executionContext(manifest);
 if (exit!==0 || config.sourceHeadSha!==manifest.sourceHeadSha || config.sourceTreeSha!==manifest.sourceTreeSha
  || !same(config.execution,context) || !same(config.fixtures,manifest.fixtures) || !same(config.probes,manifest.probes)
  || !same(config.baseline,baseline) || !same(config.nativeUncFixture,checked.nativeUncFixture)
  || !Array.isArray(config.extensions) || !same(config.extensions.map(item=>item.id),ids)) fail('host config subject');
 exactObject(host,['schemaVersion','sourceHeadSha','sourceTreeSha','vscode','node','os','executionMode','state','productActivationProbe','productDeactivationProbe','activatedExtensions','baseline','cases','loadedModules','parserIdentities']);
 if (host.schemaVersion!=='bob-builtin-analyze/t17-path-installed-host/v1'
  || host.sourceHeadSha!==manifest.sourceHeadSha || host.sourceTreeSha!==manifest.sourceTreeSha
  || host.os!==context.os || host.executionMode!==context.executionMode || host.vscode!=='1.106.1'
  || typeof host.node!=='string' || host.productActivationProbe!=='not_run' || host.productDeactivationProbe!=='not_run'
  || !same(host.baseline,baseline) || !same(host.activatedExtensions,ids)) fail('native host subject');
 const state=validatePathHostCases(host.cases,context,checked.nativeUncFixture);
 if (host.state!==state) fail('host state mismatch');
 for (const [index,row] of host.cases.entries()) {
  const keys=['name','state'];
  if (index>=baselineNames.length || Object.hasOwn(row,'detail')) keys.push('detail');
  exactObject(row,keys);
 }
 for (const row of host.cases.filter(item=>additional.includes(item.name))) {
  if (row.name==='deadline_native_child_settlement') {
   exactObject(row.detail,['mode','pid','exitEventObserved','aliveAfterRejection','terminationCause','cleanupStatus','exitObservationPhase']);
   if (row.detail.mode!=='native_child' || !Number.isSafeInteger(row.detail.pid) || row.detail.pid<=0
     || row.detail.exitEventObserved!==true || row.detail.aliveAfterRejection!==false
     || row.detail.terminationCause!=='stdout_limit' || row.detail.cleanupStatus!=='controller_settled'
     || row.detail.exitObservationPhase!=='after_controller_settlement') fail('native child settlement unconfirmed');
  } else if (row.detail?.mode!=='installed_module_controlled_clock') fail('controlled case kind');
 }
 if (!Array.isArray(host.loadedModules) || host.loadedModules.length!==33
   || !Array.isArray(host.parserIdentities) || host.parserIdentities.length!==8) fail('33 runtime / 8 parser inventory');
 const loadedModules=[],parserIdentities=[];
 for (const [index,item] of config.extensions.entries()) {
  const expectedNames=runtimeNames(index);
  const actual=host.loadedModules.filter(row=>row.extensionRoot===item.root);
  if (actual.length!==expectedNames.length || new Set(actual.map(row=>row.moduleName)).size!==expectedNames.length) fail('installed module inventory');
  for (const loaded of actual) {
   exactObject(loaded,['extensionRoot','moduleName','path','bytes','sha256']);
   if (!expectedNames.includes(loaded.moduleName)) fail('installed module identity');
   const expectedPath=path.join(item.root,'out','shared-processing-budget-runtime',loaded.moduleName+'.js');
   if (noAlias(loaded.path)!==noAlias(expectedPath)) fail('runtime path escape');
   const bound={path:loaded.path,bytes:loaded.bytes,sha256:loaded.sha256};
   const expected=checked.compiled.find(row=>row.path===loaded.moduleName+'.js');
   if (!expected || bound.bytes!==expected.bytes || bound.sha256!==expected.sha256) fail('native module binding');
   readBinding(bound,1048576);
   loadedModules.push({extensionId:item.id,moduleName:loaded.moduleName,...bound});
  }
  const parsers=index<2?expectedParserIdentities(item.id):[];
  if (!same(item.parsers,parsers)) fail('config parser pins');
  const actualParsers=host.parserIdentities.filter(row=>row.extensionRoot===item.root);
  if (actualParsers.length!==parsers.length || new Set(actualParsers.map(row=>row.name)).size!==parsers.length) fail('native parser inventory');
  for (const parser of parsers) {
   const observed=actualParsers.find(row=>row.name===parser.name);
   exactObject(observed,['extensionRoot','name','version','integrity','relativePath','path','bytes','sha256']);
   const entry=noAlias(createRequire(path.join(item.root,'package.json')).resolve(parser.specifier));
   const relative=path.relative(item.root,entry).split(path.sep).join('/');
   const expected=parser.payload.find(row=>row.path===relative);
   if (!expected || observed.version!==parser.version || observed.integrity!==parser.integrity
     || observed.relativePath!==relative || noAlias(observed.path)!==entry
     || observed.bytes!==expected.bytes || observed.sha256!==expected.sha256) fail('native parser identity');
   const bound={path:entry,bytes:observed.bytes,sha256:observed.sha256};
   readBinding(bound,50*1048576);
   parserIdentities.push({extensionId:item.id,name:parser.name,version:parser.version,integrity:parser.integrity,
    specifier:parser.specifier,relativePath:relative,...bound});
  }
 }
 return {state,cases:host.cases,loadedModules,parserIdentities,baseline,activatedExtensions:host.activatedExtensions};
}

async function cleanupUnc(manifest,fixture) {
 const {disposeNativeUncFixture}=await import('./t17-path-native-unc-fixture.mjs');
 const result=await disposeNativeUncFixture({
  fixtureManifestPath:manifest.nativeUncFixture.path,
  evidenceRoot:path.join(process.env.RUNNER_TEMP,'t17path-cleanup-'+fixture.nonce)
 });
 const bound=binding(result.receiptPath);
 const receipt=JSON.parse(readBinding(bound,1048576));
 if (receipt.state!=='disposed' || receipt.executionMode!=='native_windows_runner' || receipt.removed!==true
  || receipt.fixtureFilesRetained!==true || receipt.nonce!==fixture.nonce || receipt.shareName!==fixture.shareName
  || receipt.sourceHeadSha!==manifest.sourceHeadSha || receipt.sourceTreeSha!==manifest.sourceTreeSha
  || !same(receipt.fixtureManifest,manifest.nativeUncFixture)) fail('native UNC cleanup subject');
 return bound;
}

// The real UNC fixture uses only loopback in this fresh, owned host profile.
// This changes neither product policy nor the user's VS Code settings.
export function prepareNativeUncHostPolicy(ownedRoot,fixture) {
 if (fixture===null) return null;
 if (!fixture || fixture.executionMode!=='native_windows_runner'
   || !/^[a-f0-9]{32}$/.test(fixture.nonce)
   || fixture.uncRoot!=='\\\\127.0.0.1\\bob-t17path-'+fixture.nonce
   || !/^[a-f0-9]{40}$/.test(fixture.sourceHeadSha)
   || !/^[a-f0-9]{40}$/.test(fixture.sourceTreeSha)) fail('UNC host fixture identity');
 const root=noAlias(ownedRoot),owner=JSON.parse(fs.readFileSync(path.join(root,'owned.json'),'utf8'));
 exactObject(owner,['schemaVersion','pid']);
 if (owner.schemaVersion!=='bob-builtin-analyze/t17-path-owned-root/v1' || owner.pid!==process.pid) fail('UNC host root must be owned by this process');
 noAlias(path.join(root,'user-data'));noAlias(path.join(root,'logs'));
 const user=path.join(root,'user-data','User');fs.mkdirSync(user);
 const settings=path.join(user,'settings.json'),allowedHosts=['127.0.0.1'];
 fs.writeFileSync(settings,JSON.stringify({'security.allowedUNCHosts':allowedHosts},null,2)+'\n',{flag:'wx'});
 const receipt=path.join(root,'logs','unc-host-policy.json');
 fs.writeFileSync(receipt,JSON.stringify({schemaVersion:'bob-builtin-analyze/t17-path-unc-host-policy/v1',
  scope:'isolated_host_user_data',state:'prepared',sourceHeadSha:fixture.sourceHeadSha,sourceTreeSha:fixture.sourceTreeSha,
  fixtureNonce:fixture.nonce,allowedHosts,settings:binding(settings)},null,2)+'\n',{flag:'wx'});
 return binding(receipt);
}

export async function runInstalledSmoke(manifestPath,evidenceRoot) {
 const manifest=JSON.parse(fs.readFileSync(noAlias(manifestPath),'utf8'));
 const context=executionContext(manifest);
 const prepared=await prepareInstalledArtifacts(manifest,evidenceRoot);
 const {root,config,probeRoot}=prepared;
 const receipt={
  schemaVersion:'bob-builtin-analyze/t17-path-installed-smoke/v1',state:'failed',
  sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,...context,
  developmentPayloadFiles:48,shippedRuntimeFiles:33,parserPinnedFiles:583,tarballFiles:52,typeConsumers:3,
  artifactManifest:binding(manifestPath),nativeUncFixture:manifest.nativeUncFixture??null,nativeUncCleanup:null,
  hostReceipt:null,hostExit:null,cases:[],loadedModules:[],parserIdentities:[],baseline,
  activatedExtensions:[],productActivationProbe:'not_run',productDeactivationProbe:'not_run',visualUat:'not_run',liveBob:'not_run',failure:null
 };
 let failure;
 try {
  prepareNativeUncHostPolicy(root,config.nativeUncFixture);
  const {runTests}=pinnedHostRuntime();
  receipt.hostExit=await runTests({
   version:'1.106.1',cachePath:path.join(root,'vscode-cache'),
   extensionDevelopmentPath:[...config.extensions.map(item=>item.root),probeRoot],
   extensionTestsPath:path.join(probeRoot,probeNames[1]),reuseMachineInstall:false,
   launchArgs:[config.workspaceRoot,'--user-data-dir='+path.join(root,'user-data'),
    '--extensions-dir='+path.join(root,'extensions'),'--disable-telemetry','--disable-gpu'],
   extensionTestsEnv:{NODE_PATH:'',NODE_OPTIONS:'',ELECTRON_RUN_AS_NODE:undefined}
  });
  receipt.hostReceipt=binding(config.hostReceiptPath);
  const host=JSON.parse(readBinding(receipt.hostReceipt,1048576));
  Object.assign(receipt,await validateInstalledHostReceipt(host,config,manifest,receipt.hostExit));
 } catch (error) {
  failure=error;
  if (fs.existsSync(config.hostReceiptPath)) {
   receipt.hostReceipt=binding(config.hostReceiptPath);
   try {receipt.cases=JSON.parse(readBinding(receipt.hostReceipt,1048576)).cases??[];} catch {}
  }
 } finally {
  if (config.nativeUncFixture) {
   try {receipt.nativeUncCleanup=await cleanupUnc(manifest,config.nativeUncFixture);}
   catch (error) {failure??=error;receipt.cleanupFailure=String(error.message).slice(0,512);}
  }
  if (failure) {
   receipt.state='failed';
   receipt.failure=String(failure.message).slice(0,1024);
  }
  fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 }
 if (failure) throw failure;
 return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 try {
  if (process.argv.length!==6 || process.argv[2]!=='--artifacts' || process.argv[4]!=='--evidence-root') fail('expected --artifacts and --evidence-root');
  const result=await runInstalledSmoke(process.argv[3],process.argv[5]);
  process.stdout.write(JSON.stringify({state:result.state,hostExit:result.hostExit,sourceHeadSha:result.sourceHeadSha})+'\n');
  if (result.state==='local_partial') process.exitCode=2;
 } catch (error) {
  process.stderr.write(String(error?.message??error)+'\n');
  process.exitCode=1;
 }
}
