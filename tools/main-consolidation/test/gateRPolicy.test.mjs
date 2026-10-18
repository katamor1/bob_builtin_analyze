import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
test('R1 active suites validate inventory and measured inactive product wiring', () => {
  const result = spawnSync(process.execPath, ['tools/main-consolidation/run-gate-r.mjs'], { cwd: repository, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const observation = JSON.parse(result.stdout);
  assert.equal(observation.state, 'ACTIVE_TEST_SUITES_PASSED');
  assert.equal(observation.inventoryValidation, 'PASSED');
  assert.equal(observation.runtimeSuiteState, 'PASSED');
  assert.equal(observation.runtimeSuitesExecuted, 15);
  assert.deepEqual(observation.activeCapabilityIds,['WF2-R1-PROVENANCE','WF2-R2-INVOKE']);
  assert.equal(observation.archiveTestsExecuted, 0);
  assert.equal(observation.providerDispatches, 0);
  assert.equal(observation.bobDispatches, 0);
  assert.equal(observation.runtimeActivation, false);
});
test('inventory command prints the complete classified archive rather than just test families', () => {
  const result = spawnSync(process.execPath, ['tools/main-consolidation/create-gate-r-inventory.mjs', '--print'], { cwd: repository, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  const inventory = JSON.parse(result.stdout);
  assert.equal(inventory.paths.length, 92);
  assert.equal(inventory.families.length, 108);
  assert.equal(inventory.families.filter(row => row.kind === 'test_family').length, 50);
  assert.equal(inventory.archive.toSha, 'a18c09b10fa51702d312e34940a694ad971a48cc');
});

import { readFileSync } from 'node:fs';
import * as policy from '../gateRPolicy.mjs';
import { gateRExpectedMainFiles } from '../gateRMainAdmissionPolicy.mjs';
const mainFiles = () => gateRExpectedMainFiles();
const inventoryBytes = readFileSync(new URL('../gate-r-archive-inventory.json', import.meta.url));
const activeBytes = readFileSync(new URL('../gate-r-active-suite.json', import.meta.url));
const catalogBytes = readFileSync(new URL('../gate-r-archive-source-catalog.json', import.meta.url));
const clone = bytes => JSON.parse(bytes);
const reject = operation => assert.throws(operation, /Gate R|catalog|inventory|active|canonical|baseline|path|object|array|alias|key|identity/i);
test('valid sealed inventory and R1 manifest are admitted', () => {
  assert.equal(policy.validateGateRInventory(inventoryBytes).state, 'VALID');
  assert.equal(policy.validateGateRActiveSuite(activeBytes).state, 'VALID_R1_R2');
});
const mutations = [
 ['missing historical path', i => i.paths.pop()],
 ['duplicated historical path', i => i.paths.push(structuredClone(i.paths[0]))],
 ['unclassified historical path', i => i.paths[0].classification = 'unclassified'],
 ['unknown historical path', i => i.paths[0].path = 'extensions/workflow-register/src/unknown.ts'],
 ['wrong endpoint head', i => i.archive.toSha = '0'.repeat(40)],
 ['wrong endpoint tree', i => i.archive.treeSha = '0'.repeat(40)],
 ['wrong source blob', i => i.paths[0].endpointBlobSha = '0'.repeat(40)],
 ['wrong provenance stage blob', i => i.families[0].origins[0].blobSha = '0'.repeat(40)],
 ['missing semantic family', i => i.families.pop()],
 ['duplicate semantic family', i => i.families.push(structuredClone(i.families[0]))],
 ['shared filename assigned to wrong family', i => { const f=i.families.find(f => f.path.endsWith('workflowContractV2ExecutionBoundary.test.js')); f.primaryOwner='WF2-R6-ARCHIVED'; }],
 ['conditional family reclassified active', i => { i.families.find(f => f.primaryOwner==='WF2-R3-ARTIFACT-TX').policyState='active'; }],
 ['rejected family reclassified active', i => { i.families.find(f => f.primaryOwner==='WF2-R6-ARCHIVED').policyState='active'; }],
 ['unknown root field', i => i.command = 'node archive-tests.js'],
 ['unknown nested field', i => i.paths[0].module = 'archive-runtime'],
 ['forged catalog authority', i => i.catalogSha256 = '0'.repeat(64)],
 ['path traversal', i => i.paths[0].path = '../runtime.js'],
 ['Windows absolute path', i => i.paths[0].path = 'C:/runtime.js'],
 ['UNC path', i => i.paths[0].path = '//server/runtime.js'],
 ['case-fold duplicate path', i => i.paths.push({...i.paths[0],path:i.paths[0].path.toUpperCase()})],
 ['path ordering drift', i => i.paths.reverse()],
 ['family ordering drift', i => i.families.reverse()],
 ['prototype key', i => Object.defineProperty(i.paths[0], '__proto__', {value:{},enumerable:true})]
];
for (const [name, mutate] of mutations) test('inventory rejects '+name, () => { const i=clone(inventoryBytes); mutate(i); reject(() => policy.validateGateRInventory(i)); });
for (const [name, bytes] of [
 ['CRLF', Buffer.from(inventoryBytes.toString().replaceAll('\n','\r\n'))],
 ['BOM', Buffer.concat([Buffer.from([239,187,191]),inventoryBytes])],
 ['extra newline', Buffer.concat([inventoryBytes,Buffer.from('\n')])],
 ['duplicate parsed key', Buffer.from(inventoryBytes.toString().replace('{','{"authority":"forged",'))],
 ['compact JSON', Buffer.from(JSON.stringify(clone(inventoryBytes))+'\n')]
]) test('inventory rejects noncanonical '+name, () => reject(() => policy.validateGateRInventory(bytes)));
for(const name of ['WF2-R1-PROVENANCE','WF2-R2-INVOKE','WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB','WF2-R6-ARCHIVED']) test('active suite rejects unintegrated '+name, () => {
 const a=clone(activeBytes);a.capabilities=[{capabilityId:name,testPaths:['extensions/workflow-register/test/future.test.js'],state:'VERIFIED'}];reject(()=>policy.validateGateRActiveSuite(a));
});
test('active suite rejects duplicate capabilities',()=>{const a=clone(activeBytes);a.capabilities=[{capabilityId:'WF2-R1-PROVENANCE'},{capabilityId:'WF2-R1-PROVENANCE'}];reject(()=>policy.validateGateRActiveSuite(a));});
test('active suite rejects arbitrary module authority',()=>{const a=clone(activeBytes);a.module='../archive/run.js';reject(()=>policy.validateGateRActiveSuite(a));});
test('active suite rejects an empty false PASS',()=>{const a=clone(activeBytes);a.runtimeSuiteState='PASSED';reject(()=>policy.validateGateRActiveSuite(a));});
test('validator rejects sparse object array',()=>{const a=clone(activeBytes);a.capabilities=Array(1);reject(()=>policy.validateGateRActiveSuite(a));});
test('validator rejects hidden/accessor data without invoking getters',()=>{const a=clone(activeBytes);let calls=0;Object.defineProperty(a,'capabilities',{get(){calls++;return []},enumerable:true});reject(()=>policy.validateGateRActiveSuite(a));assert.equal(calls,0);});
test('canonical data rejects object aliases',()=>{const shared={value:1};reject(()=>policy.gateRCanonicalJson({a:shared,b:shared}));});
test('catalog cannot be replaced by caller supplied source data',()=>{const c=clone(catalogBytes);c.endpointPaths.pop();reject(()=>policy.validateGateRCatalog(policy.gateRCanonicalJson(c)));});
test('existing shared-path baseline is accepted without archive filename bans',()=>{const files=mainFiles();assert.equal(policy.validateGateRRepositoryFiles(files),true);});
for(const [name,mutate] of [
 ['changed shared P6 blob',f=>{f.find(x=>x.path.endsWith('workflowRegisterService.ts')).blobSha='0'.repeat(40)}],
 ['removed baseline source',f=>f.splice(f.findIndex(x=>x.path.endsWith('workflowRegisterService.ts')),1)],
 ['renamed baseline source',f=>{f.find(x=>x.path.endsWith('workflowRegisterService.ts')).path+='moved'}],
 ['new inactive source',f=>f.push({mode:'100644',path:'extensions/workflow-register/src/core/contractV2/providerInvocation.ts',blobSha:'0'.repeat(40)})],
 ['new archived test',f=>f.push({mode:'100644',path:'extensions/workflow-register/test/workflowContractV2BobRuntime.test.js',blobSha:'0'.repeat(40)})],
 ['duplicate path',f=>f.push({...f[0]})]
]) test('repository rejects '+name,()=>{const f=mainFiles();mutate(f);reject(()=>policy.validateGateRRepositoryFiles(f));});
for(const [command,args] of [['run-gate-r.mjs',['--output','owned']],['run-gate-r.mjs',['--module','archive.js']],['create-gate-r-inventory.mjs',['--root','archive']]])test('CLI rejects arbitrary authority '+command+' '+args[0],()=>{const r=spawnSync(process.execPath,['tools/main-consolidation/'+command,...args],{cwd:repository,encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/accepts only/);assert.equal(r.stdout,'');});

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, linkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, isAbsolute, sep } from 'node:path';
function dataRoot(t) {
  const root=mkdtempSync(join(tmpdir(),'gate-r-owned-data-'));
  t.after(()=>{const rel=relative(tmpdir(),root);assert.ok(rel&&!isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('..'+sep));rmSync(root,{recursive:true,force:true});});
  return root;
}
test('contained reader reads an ordinary owned data file',t=>{const root=dataRoot(t);writeFileSync(join(root,'data.txt'),'safe');assert.equal(policy.readGateRContainedFile(root,'data.txt').toString(),'safe');});
for(const path of ['../data.txt','C:/data.txt','//server/data.txt','data\\file.txt','./data.txt','data//file.txt','data\u0000.txt'])test('contained reader rejects ambiguous path '+JSON.stringify(path),t=>{const root=dataRoot(t);reject(()=>policy.readGateRContainedFile(root,path));});
test('contained reader rejects physical directory alias',t=>{const root=dataRoot(t);mkdirSync(join(root,'physical'));writeFileSync(join(root,'physical','data.txt'),'safe');symlinkSync(join(root,'physical'),join(root,'alias'),process.platform==='win32'?'junction':'dir');reject(()=>policy.readGateRContainedFile(root,'alias/data.txt'));});
test('contained reader rejects hard-linked file identity',t=>{const root=dataRoot(t);writeFileSync(join(root,'data.txt'),'safe');linkSync(join(root,'data.txt'),join(root,'linked.txt'));reject(()=>policy.readGateRContainedFile(root,'linked.txt'));});
test('contained reader rejects an aliased root itself',t=>{const root=dataRoot(t);mkdirSync(join(root,'physical'));writeFileSync(join(root,'physical','data.txt'),'safe');symlinkSync(join(root,'physical'),join(root,'alias'),process.platform==='win32'?'junction':'dir');reject(()=>policy.readGateRContainedFile(join(root,'alias'),'data.txt'));});
test('both public CLI forms emit identical canonical bytes',()=>{const a=spawnSync(process.execPath,['tools/main-consolidation/run-gate-r.mjs'],{cwd:repository,encoding:'utf8'});const b=spawnSync(process.execPath,['tools/main-consolidation/run-gate-r.mjs','--check'],{cwd:repository,encoding:'utf8'});assert.equal(a.status,0,a.stderr);assert.equal(b.status,0,b.stderr);assert.equal(a.stdout,b.stdout);assert.equal(a.stdout.endsWith('\n'),true);assert.equal(a.stdout.includes('\r'),false);});

test('R1 canonical data rejects proxy traps before inspection',()=>{let reads=0;const proxy=new Proxy({safe:true},{getPrototypeOf(){reads++;throw TypeError('proxy trap');}});assert.throws(()=>policy.gateRCanonicalJson(proxy),TypeError);assert.equal(reads,0);});

const r1FamilyRows = [
 ['source-3266621c45ba21fc5873f61d','workflowContractV2ExecutionGuard.test.js','R1_authentic_lease_rejects_before_read'],
 ['source-34c61efc427121c81952998a','workflowContractV2RunProvenanceProjection.test.js','R1_plan_projection_contains_no_bodies'],
 ['source-41c31bf3997087539134b1c2','workflowContractV2RunLeaseDisposal.test.js','R1_all_private_retained_leases_release_once'],
 ['source-718be8379c70ab754a9d7484','workflowContractV2RunSchemaType.test.js','R1_run_only_discriminator_preserves_public_schema'],
 ['source-75c07aaa99be8455bdc3285f','workflowContractV2ExecutionBoundary.test.js','R1_public_paths_have_zero_runtime_effects'],
 ['source-a5eabe004258ac7de4b9ebdb','workflowContractV2TerminalLeaseRelease.test.js','R1_terminal_release_follows_durable_hooks'],
 ['source-ba56f810f0c338c02ff4e864','workflowContractV2RuntimeLeaseScope.test.js','R1_closed_scope_blocks_detached_work'],
 ['source-fde858a48c84d66184d3513a','workflowContractV2RunProvenance.test.js','R1_exact_provenance_and_stale_write_checks']
].map(([sourceItemId,name,required])=>({sourceItemId,testPath:'extensions/workflow-register/test/'+name,requiredCaseNames:[required]}));
test('R1 exact active-eight manifest is admitted without future completion authority',()=>{const active={schemaVersion:'workflow-gate-r-active-suite/v1',authority:'integrated_runtime_only',catalogSha256:policy.GATE_R_CATALOG_SHA256,capabilities:[{capabilityId:'WF2-R1-PROVENANCE',testFamilies:r1FamilyRows}]};assert.throws(()=>policy.validateGateRActiveSuite(active),TypeError);});
const tap = name => 'TAP version 13\n# Subtest: '+name+'\nok 1 - '+name+'\n  ---\n  duration_ms: 1\n  type: test\n  ...\n1..1\n# tests 1\n# suites 0\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 1\n';
const child = stdout => ({stdout,stderr:'',exitCode:0,signal:null,timedOut:false,outputOverflow:false});
test('R1 completed required TAP case is genuine success',()=>{assert.equal(typeof policy.validateGateRTestObservation,'function');assert.equal(policy.validateGateRTestObservation(r1FamilyRows[0],child(tap(r1FamilyRows[0].requiredCaseNames[0]))).state,'PASSED');});
for(const [name,mutate] of [
 ['missing required case',o=>o.stdout=tap('unrelated')],['required skip',o=>o.stdout=o.stdout.replace('ok 1 - ','ok 1 - ').replace('\n  ---',' # SKIP disabled\n  ---')],
 ['required todo',o=>o.stdout=o.stdout.replace('\n  ---',' # TODO future\n  ---')],['failed case',o=>o.stdout=o.stdout.replace('ok 1 - ','not ok 1 - ')],
 ['incomplete TAP',o=>o.stdout=o.stdout.slice(0,o.stdout.indexOf('1..1'))],['duplicate TAP summary',o=>o.stdout+='# tests 1\n'],
 ['unsettled exit',o=>o.exitCode=null],['signal',o=>o.signal='SIGTERM'],['timeout',o=>o.timedOut=true],['overflow',o=>o.outputOverflow=true],['cancelled',o=>o.stdout=o.stdout.replace('# cancelled 0','# cancelled 1')]
])test('R1 child rejects '+name,()=>{assert.equal(typeof policy.validateGateRTestObservation,'function');const o=child(tap(r1FamilyRows[0].requiredCaseNames[0]));mutate(o);assert.throws(()=>policy.validateGateRTestObservation(r1FamilyRows[0],o),/Gate R|TAP|case|child|timeout|output/i);});

test('R1 child rejects fractional TAP totals',()=>{const o=child(tap(r1FamilyRows[0].requiredCaseNames[0]));o.stdout=o.stdout.replace('# tests 1','# tests 1.5').replace('# pass 1','# pass 1.5');assert.throws(()=>policy.validateGateRTestObservation(r1FamilyRows[0],o),/TAP/);});
test('R1 child rejects malformed diagnostics despite complete summaries',()=>{const o=child(tap(r1FamilyRows[0].requiredCaseNames[0]));o.stdout=o.stdout.replace('  ...\n','');assert.throws(()=>policy.validateGateRTestObservation(r1FamilyRows[0],o),/TAP/);});
const wiring=()=>({schemaVersion:'workflow-r1-product-wiring/v1',counterScope:'contract_v2_product_paths',observedProductSurfaces:['validation','registration','operation_hub','authoring','legacy_v1'],v2ProductLeaseAcquisitions:0,providerDispatches:0,bobDispatches:0,v2ProductRunDirectoryCreations:0,v2ProductArtifactStages:0});
test('R1 wiring counters are derived from the closed real observation',()=>{const result=policy.validateGateRProductWiringObservation(wiring());assert.equal(result.counterScope,'contract_v2_product_paths');assert.equal(result.v2ProductLeaseAcquisitions,0);assert.match(result.wiringObservationSha256,/^[a-f0-9]{64}$/);});
for(const [name,mutate]of [
 ['nonzero lease',o=>o.v2ProductLeaseAcquisitions++],['nonzero provider',o=>o.providerDispatches++],['nonzero Bob',o=>o.bobDispatches++],['nonzero run directory',o=>o.v2ProductRunDirectoryCreations++],['nonzero artifacts',o=>o.v2ProductArtifactStages++],['missing surface',o=>o.observedProductSurfaces.pop()],['wrong order',o=>o.observedProductSurfaces.reverse()],['unknown counter',o=>o.otherEffects=0],['missing counter',o=>delete o.bobDispatches],['wrong scope',o=>o.counterScope='all_effects']
])test('R1 wiring rejects '+name,()=>{const o=wiring();mutate(o);assert.throws(()=>policy.validateGateRProductWiringObservation(o),TypeError);});

import { readdirSync, copyFileSync, existsSync } from 'node:fs';
for(const target of ['extensions/workflow-register/test/workflowContractV2GateR.test.js','npm test'])test('R1 recursive fixture is rejected before any child is scheduled: '+target,t=>{
 const owned=dataRoot(t),tools=join(owned,'tools/main-consolidation');mkdirSync(tools,{recursive:true});
 const source=join(repository,'tools/main-consolidation');
 for(const name of readdirSync(source))if(name.endsWith('.mjs')||['gate-r-archive-source-catalog.json','gate-r-archive-inventory.json'].includes(name))copyFileSync(join(source,name),join(tools,name));
 const a=clone(activeBytes);a.capabilities[0].testFamilies[0].testPath=target;writeFileSync(join(tools,'gate-r-active-suite.json'),policy.gateRCanonicalJson(a));
 const scheduled=join(owned,'scheduled.txt'),preload=join(owned,'observe-child.mjs');
 writeFileSync(preload,'import cp from "node:child_process";import{syncBuiltinESMExports}from"node:module";import{appendFileSync}from"node:fs";cp.spawn=()=>{appendFileSync('+JSON.stringify(scheduled)+',"spawn");throw Error("child scheduled");};syncBuiltinESMExports();');
 const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,join(tools,'run-gate-r.mjs')],{cwd:owned,encoding:'utf8',timeout:10000});
 assert.notEqual(result.status,0);assert.match(result.stderr,/active suite requires exact R1/);assert.equal(result.stdout,'');assert.equal(existsSync(scheduled),false);
});

const r2FamilyRows = [{"sourceItemId":"source-42e52f0142bc1480cba3f8bb","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocationReviewCases.test.js","requiredCaseNames":["R2_closed_scope_and_concurrent_attempt_refusal"]},{"sourceItemId":"source-5ec92ed8eb7c664752c179f6","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocationArchitecture.test.js","requiredCaseNames":["R2_product_paths_remain_unreachable"]},{"sourceItemId":"source-67e4c888b7aa389e2ebf5135","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocationFollowup.test.js","requiredCaseNames":["R2_snapshot_dispatch_and_retry_identity"]},{"sourceItemId":"source-917527dedba80f811bb34bac","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocationFailurePrecedence.test.js","requiredCaseNames":["R2_staging_failure_and_settlement_precedence"]},{"sourceItemId":"source-aa64e1c64d51e4da51fd72c7","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocationFoundation.test.js","requiredCaseNames":["R2_authentic_retained_run_and_attempt_foundation"]},{"sourceItemId":"source-e9053c4efd76a31cfe133bdb","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocation.test.js","requiredCaseNames":["R2_compiled_input_output_error_contract"]},{"sourceItemId":"source-e98cec4ab341f9224f6e2ee0","testPath":"extensions/workflow-register/test/workflowContractV2ProviderInvocationHardening.test.js","requiredCaseNames":["R2_bounded_hostile_values_and_write_sessions"]}];
const activeR1R2 = () => ({ schemaVersion:'workflow-gate-r-active-suite/v1',authority:'integrated_runtime_only',catalogSha256:policy.GATE_R_CATALOG_SHA256,capabilities:[{capabilityId:'WF2-R1-PROVENANCE',testFamilies:structuredClone(r1FamilyRows)},{capabilityId:'WF2-R2-INVOKE',testFamilies:structuredClone(r2FamilyRows)}] });
test('R2 exact fifteen-family manifest retains all eight R1 and seven R2 bodies',()=>{
 assert.equal(policy.validateGateRActiveSuite(activeR1R2()).state,'VALID_R1_R2');
 for(const cap of [0,1])for(let i=0;i<activeR1R2().capabilities[cap].testFamilies.length;i++){const a=activeR1R2();a.capabilities[cap].testFamilies.splice(i,1);assert.throws(()=>policy.validateGateRActiveSuite(a),TypeError);}
 for(const capabilityId of ['WF2-R3-ARTIFACT-TX','WF2-R4-EXECUTOR','WF2-R5-BOB','WF2-R6-ARCHIVED']){const a=activeR1R2();a.capabilities.push({capabilityId,testFamilies:[]});assert.throws(()=>policy.validateGateRActiveSuite(a),TypeError);}
 for(const testPath of ['extensions/workflow-register/test/workflowContractV2ProviderInvocationTestSupport.js','extensions/workflow-register/test/workflowContractV2GateR.test.js','npm test']){const a=activeR1R2();a.capabilities[1].testFamilies[0].testPath=testPath;assert.throws(()=>policy.validateGateRActiveSuite(a),TypeError);}
});
test('R2 required child case is executable and inherits the strict TAP refusal contract',()=>{
 const row=r2FamilyRows[0];assert.equal(policy.validateGateRTestObservation(row,child(tap(row.requiredCaseNames[0]))).state,'PASSED');
 for(const stdout of ['',tap('helper only'),tap(row.requiredCaseNames[0]).replace('ok 1 - ','not ok 1 - '),tap(row.requiredCaseNames[0]).replace('\n  ---',' # SKIP blocked\n  ---'),tap(row.requiredCaseNames[0])+tap(row.requiredCaseNames[0])])assert.throws(()=>policy.validateGateRTestObservation(row,child(stdout)),TypeError);
});
test('R2 cannot narrow the shipping domain to source and test files',()=>{
 for(const extension of ['workflow-register','bob-bazaar-review','bob-code-consistency-review'])for(const suffix of ['README.md','.vscodeignore','scripts/check-vsix-policy.js']){
  const files=mainFiles(),target=files.find(row=>row.path==='extensions/'+extension+'/'+suffix);assert.ok(target);target.blobSha='0'.repeat(40);assert.throws(()=>policy.validateGateRRepositoryFiles(files),TypeError);
 }
 for(const extension of ['workflow-register','bob-bazaar-review','bob-code-consistency-review']){const files=mainFiles();files.push({path:'extensions/'+extension+'/unexpected.txt',mode:'100644',blobSha:'0'.repeat(40)});files.sort((a,b)=>a.path<b.path?-1:1);assert.throws(()=>policy.validateGateRRepositoryFiles(files),TypeError);}
});
const wireSort=v=>Array.isArray(v)?v.map(wireSort):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,wireSort(v[k])])):v;
const wireText=v=>JSON.stringify(wireSort(v))+'\n';
const wiring2=()=>({...wiring(),schemaVersion:'workflow-r2-product-wiring/v1'});
const wireMarker=(version,value)=>'# R'+version+'_PRODUCT_WIRING_BASE64='+Buffer.from(wireText(value)).toString('base64')+'\n';
test('R2 combined wiring digest binds both decoded real-observation formats',()=>{
 assert.equal(typeof policy.validateGateRProductWiringOutputs,'function','two separately measured wiring outputs must be bound');
 const r1=wiring(),r2=wiring2(),result=policy.validateGateRProductWiringOutputs({r1:wireMarker(1,r1),r2:wireMarker(2,r2)});
 assert.equal(result.counterScope,'contract_v2_product_paths');for(const key of ['v2ProductLeaseAcquisitions','providerDispatches','bobDispatches','v2ProductRunDirectoryCreations','v2ProductArtifactStages'])assert.equal(result[key],0);
 assert.equal(result.wiringObservationSha256,policy.gateRDigest(Buffer.from(wireText({r1,r2}))));
});
for(const [name,mutate]of [
 ['missing R1',o=>o.r1=''],['missing R2',o=>o.r2=''],['duplicate R1',o=>o.r1+=o.r1],['duplicate R2',o=>o.r2+=o.r2],
 ['wrong role',o=>o.r2=wireMarker(1,wiring())],['wrong R2 schema',o=>o.r2=wireMarker(2,wiring())],['noncanonical JSON',o=>o.r2='# R2_PRODUCT_WIRING_BASE64='+Buffer.from(JSON.stringify(wiring2())).toString('base64')+'\n'],
 ['invalid base64',o=>o.r2='# R2_PRODUCT_WIRING_BASE64=not/base64===\n'],['nonzero R2 dispatch',o=>o.r2=wireMarker(2,{...wiring2(),providerDispatches:1})],['nonzero R1 lease',o=>o.r1=wireMarker(1,{...wiring(),v2ProductLeaseAcquisitions:1})],['missing R2 surface',o=>{const v=wiring2();v.observedProductSurfaces.pop();o.r2=wireMarker(2,v)}]
])test('R2 combined wiring rejects '+name,()=>{assert.equal(typeof policy.validateGateRProductWiringOutputs,'function');const value={r1:wireMarker(1,wiring()),r2:wireMarker(2,wiring2())};mutate(value);assert.throws(()=>policy.validateGateRProductWiringOutputs(value),TypeError);});
