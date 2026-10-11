import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const repository = fileURLToPath(new URL('../../../', import.meta.url));
test('empty bootstrap validates inventory without claiming runtime execution', () => {
  const result = spawnSync(process.execPath, ['tools/main-consolidation/run-gate-r.mjs'], { cwd: repository, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const observation = JSON.parse(result.stdout);
  assert.equal(observation.state, 'INVENTORY_ONLY');
  assert.equal(observation.inventoryValidation, 'PASSED');
  assert.equal(observation.runtimeSuiteState, 'NOT_RUN_EMPTY');
  assert.equal(observation.runtimeSuitesExecuted, 0);
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
const inventoryBytes = readFileSync(new URL('../gate-r-archive-inventory.json', import.meta.url));
const activeBytes = readFileSync(new URL('../gate-r-active-suite.json', import.meta.url));
const catalogBytes = readFileSync(new URL('../gate-r-archive-source-catalog.json', import.meta.url));
const clone = bytes => JSON.parse(bytes);
const reject = operation => assert.throws(operation, /Gate R|catalog|inventory|active|canonical|baseline|path|object|array|alias|key|identity/i);
test('valid sealed inventory and empty manifest are admitted', () => {
  assert.equal(policy.validateGateRInventory(inventoryBytes).state, 'VALID');
  assert.equal(policy.validateGateRActiveSuite(activeBytes).state, 'VALID_EMPTY');
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
test('existing shared-path baseline is accepted without archive filename bans',()=>{const files=clone(catalogBytes).baseline.files;assert.equal(policy.validateGateRRepositoryFiles(files),true);});
for(const [name,mutate] of [
 ['changed shared P6 blob',f=>{f.find(x=>x.path.endsWith('workflowRegisterService.ts')).blobSha='0'.repeat(40)}],
 ['removed baseline source',f=>f.splice(f.findIndex(x=>x.path.endsWith('workflowRegisterService.ts')),1)],
 ['renamed baseline source',f=>{f.find(x=>x.path.endsWith('workflowRegisterService.ts')).path+='moved'}],
 ['new inactive source',f=>f.push({mode:'100644',path:'extensions/workflow-register/src/core/contractV2/providerInvocation.ts',blobSha:'0'.repeat(40)})],
 ['new archived test',f=>f.push({mode:'100644',path:'extensions/workflow-register/test/workflowContractV2BobRuntime.test.js',blobSha:'0'.repeat(40)})],
 ['duplicate path',f=>f.push({...f[0]})]
]) test('repository rejects '+name,()=>{const f=clone(catalogBytes).baseline.files;mutate(f);reject(()=>policy.validateGateRRepositoryFiles(f));});
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
