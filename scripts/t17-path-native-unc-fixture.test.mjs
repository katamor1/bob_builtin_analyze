import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url)),moduleFile=path.join(here,'t17-path-native-unc-fixture.mjs');
async function api(){assert.ok(fs.existsSync(moduleFile),'runner-only native UNC fixture driver must exist');return import('./t17-path-native-unc-fixture.mjs');}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),copy=value=>structuredClone(value);
function fixture(){const runnerTemp=fs.mkdtempSync(path.join(os.tmpdir(),'t17unc-')),nonce=randomBytes(16).toString('hex');return{runnerTemp,nonce,fixtureRoot:path.join(runnerTemp,'fixture-'+nonce),evidenceRoot:path.join(runnerTemp,'evidence-'+nonce)};}
function model(input,fault){
 const state={calls:[],removals:0,foreignRemovals:0,share:null,fault,context:{platform:'win32',githubActions:'true',runnerOS:'Windows',runnerTemp:input.runnerTemp,headSha:'1'.repeat(40),treeSha:'2'.repeat(40),verifiedHeadSha:'1'.repeat(40),event:'push',dispatchNonce:null}};
 const identity={principal:'CONTROLLED\\runner',sid:'S-1-5-21-123-456-789-1001'};
 const get=(args,key)=>{const at=args.indexOf(key);assert.ok(at>=0,key);assert.equal(typeof args[at+1],'string');return args[at+1];};
 const own=()=>({name:'bob-t17path-'+input.nonce,path:input.fixtureRoot,description:'bob-t17-path:'+input.nonce+':'+state.context.headSha,scopeName:'*',access:[{principal:identity.principal,sid:identity.sid,type:'Allow',right:'Full'}]});
 if(fault==='existing_foreign')state.share={...own(),path:path.join(input.runnerTemp,'foreign')};
 const adapter={
  context:async()=>copy(state.context),
  executePowerShell:async({executable,args})=>{
   assert.match(executable,/powershell\.exe$/i);assert.equal(args.includes('-Command'),false);assert.equal(path.basename(get(args,'-File')),'t17-path-native-unc-fixture.ps1');
   const operation=get(args,'-Mode');state.calls.push(operation);assert.equal(get(args,'-Nonce'),input.nonce);assert.equal(get(args,'-SourceHeadSha'),state.context.headSha);
   let created=false,removed=false,error=null,resultState='ok';
   if(operation==='create'){if(state.fault==='create_fail'){resultState='failed';error='injected New-SmbShare failure';}else{assert.equal(state.share,null);state.share=own();created=true;}}
   if(operation==='remove'){if(!state.share||state.share.path!==input.fixtureRoot||state.share.description!==own().description||state.share.access[0].sid!==identity.sid){state.foreignRemovals++;throw Error('foreign share must never be removed');}state.removals++;state.share=null;removed=true;}
   let share=copy(state.share);
   if(operation==='query'&&state.calls.includes('create')&&share){if(state.fault==='wrong_path')share.path=path.join(input.runnerTemp,'foreign');if(state.fault==='wrong_acl')share.access[0].sid='S-1-1-0';}
   return{exitCode:resultState==='ok'?0:1,stdout:JSON.stringify({schemaVersion:'bob-builtin-analyze/t17-path-native-unc-powershell/v1',operation,state:resultState,identity,share,created,removed,error}),stderr:''};
  },
  observeUnc:async owner=>{
   state.calls.push('observe_unc');if(state.fault==='unc_read_fail')throw Error('injected UNC read failure');
   const file=owner.uncRoot+'\\日本語 space.txt',bytes=fs.readFileSync(path.join(owner.fixtureRoot,'日本語 space.txt'));
   return{root:{path:owner.uncRoot,realpath:owner.uncRoot,isDirectory:true},file:{path:file,realpath:file,isFile:true,bytes:bytes.length,sha256:sha(bytes)},links:['root-link','parent-link','target-link'].map(name=>({path:owner.uncRoot+'\\'+name,isSymbolicLink:true}))};
  }
 };
 return{state,adapter};
}

// Break: importing or invoking the local CLI starts a real PowerShell share operation.
test('native_unc_import_is_inert_and_default_prepare_is_runner_only',async t=>{
 let calls=0;for(const name of ['spawn','spawnSync','execFile','execFileSync'])t.mock.method(cp,name,()=>{calls++;throw Error('must stay inert');});
 const r=await api();for(const name of ['prepareNativeUncFixture','disposeNativeUncFixture','createNativeUncFixtureDriverForTest'])assert.equal(typeof r[name],'function');assert.equal(calls,0);
 const f=fixture();if(process.env.GITHUB_ACTIONS!=='true')await assert.rejects(()=>r.prepareNativeUncFixture({fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce}),/runner|CI/i);assert.equal(calls,0);assert.equal(fs.existsSync(f.fixtureRoot),false);
});

// Break: a controlled adapter is indistinguishable from real runner/native evidence or skips query/read.
test('prepare_is_runner_only_and_owns_exact_loopback_share',async()=>{
 const r=await api(),f=fixture(),m=model(f),driver=r.createNativeUncFixtureDriverForTest(m.adapter),ready=await driver.prepareNativeUncFixture({fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce}),manifest=JSON.parse(fs.readFileSync(ready.manifestPath));
 assert.equal(manifest.schemaVersion,'bob-builtin-analyze/t17-path-native-unc-fixture/v1');assert.equal(manifest.executionMode,'controlled_test_adapter');assert.equal(manifest.state,'controlled_ready');assert.notEqual(manifest.state,'ready');assert.equal(manifest.createdByThisInvocation,true);
 assert.equal(manifest.sourceHeadSha,'1'.repeat(40));assert.equal(manifest.sourceTreeSha,'2'.repeat(40));assert.equal(manifest.shareName,'bob-t17path-'+f.nonce);assert.equal(manifest.uncRoot,'\\\\127.0.0.1\\'+manifest.shareName);assert.equal(manifest.runnerPrincipal,'CONTROLLED\\runner');
 assert.deepEqual(m.state.calls,['identity','query','create','query','observe_unc']);assert.equal(m.state.removals,0);assert.ok(fs.existsSync(manifest.bindings.ownerMarker.path));assert.ok(fs.existsSync(manifest.bindings.observations.path));
});

// Break: local/Linux/unverified subjects reach create, or malformed closed inputs execute getters.
test('invalid_runner_subject_nonce_or_path_fails_before_share_effects',async()=>{
 const r=await api();
 for(const mode of ['linux','local','unverified','bad-tree','bad-nonce','outside','existing-root','accessor','unknown']){
  const f=fixture(),m=model(f),request={fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce};let getters=0;
  if(mode==='linux')m.state.context.platform='linux';if(mode==='local')m.state.context.githubActions='false';if(mode==='unverified')m.state.context.verifiedHeadSha='3'.repeat(40);if(mode==='bad-tree')m.state.context.treeSha='bad';if(mode==='bad-nonce')request.nonce='BAD';if(mode==='outside')request.fixtureRoot=path.join(os.tmpdir(),'foreign-'+f.nonce);if(mode==='existing-root')fs.mkdirSync(f.fixtureRoot);if(mode==='accessor')Object.defineProperty(request,'nonce',{enumerable:true,get(){getters++;return f.nonce;}});if(mode==='unknown')request.override=()=>{};
  await assert.rejects(()=>r.createNativeUncFixtureDriverForTest(m.adapter).prepareNativeUncFixture(request),/runner|CI|fixture|nonce|subject|input|path|exist/i,mode);assert.equal(m.state.calls.includes('create'),false);assert.equal(m.state.removals,0);assert.equal(getters,0);
 }
});

// Break: failed create/query/UNC read publishes ready or removes a share whose ownership no longer matches.
test('foreign_share_and_failed_setup_never_produce_ready_fixture',async t=>{
 const r=await api();let fileDeletes=0;for(const name of ['rmSync','unlinkSync','rmdirSync'])t.mock.method(fs,name,()=>{fileDeletes++;throw Error('fixture/evidence deletion forbidden');});
 for(const fault of ['existing_foreign','create_fail','wrong_path','wrong_acl','unc_read_fail']){
  const f=fixture(),m=model(f,fault),driver=r.createNativeUncFixtureDriverForTest(m.adapter);await assert.rejects(()=>driver.prepareNativeUncFixture({fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce}),/fixture|share|UNC/i,fault);
  assert.equal(fs.existsSync(path.join(f.evidenceRoot,'native-unc-fixture.json')),false);const failed=JSON.parse(fs.readFileSync(path.join(f.evidenceRoot,'native-unc-fixture.failed.json')));assert.equal(failed.state,'failed');assert.equal(m.state.foreignRemovals,0);assert.equal(m.state.removals,fault==='unc_read_fail'?1:0);assert.equal(fs.existsSync(f.fixtureRoot),true);
 }
 assert.equal(fileDeletes,0);
});

// Break: dispose trusts a copied/tampered manifest or a changed share rather than re-querying exact ownership.
test('dispose_only_removes_matching_created_share_definition',async()=>{
 const r=await api();for(const mode of ['path','principal','description','source','created','unknown']){
  const f=fixture(),m=model(f),driver=r.createNativeUncFixtureDriverForTest(m.adapter),ready=await driver.prepareNativeUncFixture({fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce}),manifest=JSON.parse(fs.readFileSync(ready.manifestPath));
  if(mode==='path')m.state.share.path=path.join(f.runnerTemp,'foreign');if(mode==='principal')m.state.share.access[0].sid='S-1-1-0';if(mode==='description')m.state.share.description='foreign';if(mode==='source')manifest.sourceHeadSha='3'.repeat(40);if(mode==='created')manifest.createdByThisInvocation=false;if(mode==='unknown')manifest.override=true;
  if(['source','created','unknown'].includes(mode))fs.writeFileSync(ready.manifestPath,JSON.stringify(manifest));
  await assert.rejects(()=>driver.disposeNativeUncFixture({fixtureManifestPath:ready.manifestPath,evidenceRoot:path.join(f.runnerTemp,'cleanup-'+f.nonce)}),/fixture|share|owner|subject|manifest/i,mode);assert.equal(m.state.removals,0);assert.equal(m.state.foreignRemovals,0);assert.ok(fs.existsSync(f.fixtureRoot));
 }
});

// Break: cleanup deletes fixture evidence or can be replayed after the definition has already gone.
test('dispose_retains_physical_evidence_and_rejects_reuse',async()=>{
 const r=await api(),f=fixture(),m=model(f),driver=r.createNativeUncFixtureDriverForTest(m.adapter),ready=await driver.prepareNativeUncFixture({fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce}),before=fs.readFileSync(ready.manifestPath),manifest=JSON.parse(before);
 const done=await driver.disposeNativeUncFixture({fixtureManifestPath:ready.manifestPath,evidenceRoot:path.join(f.runnerTemp,'cleanup-'+f.nonce)}),receipt=JSON.parse(fs.readFileSync(done.receiptPath));assert.equal(receipt.state,'controlled_disposed');assert.equal(receipt.executionMode,'controlled_test_adapter');assert.equal(receipt.removed,true);assert.equal(m.state.removals,1);assert.equal(m.state.share,null);assert.deepEqual(fs.readFileSync(ready.manifestPath),before);
 for(const binding of [manifest.bindings.ownerMarker,manifest.bindings.probeFile,manifest.bindings.observations])assert.equal(sha(fs.readFileSync(binding.path)),binding.sha256);
 await assert.rejects(()=>driver.disposeNativeUncFixture({fixtureManifestPath:ready.manifestPath,evidenceRoot:path.join(f.runnerTemp,'cleanup-again-'+f.nonce)}),/fixture|share|exist|removed|owner/i);assert.equal(m.state.removals,1);
});

test('dispose_rejects_foreign_bindings_before_reading_them',async t=>{
 const r=await api();
 for(const field of ['observations','powershellLogs'])await t.test(field,async()=>{
  const f=fixture(),m=model(f),driver=r.createNativeUncFixtureDriverForTest(m.adapter);
  const ready=await driver.prepareNativeUncFixture({fixtureRoot:f.fixtureRoot,evidenceRoot:f.evidenceRoot,nonce:f.nonce});
  const manifest=JSON.parse(fs.readFileSync(ready.manifestPath)),foreign=path.join(f.runnerTemp,'foreign-'+f.nonce+'.json'),bytes=Buffer.from('foreign fixture data');
  fs.writeFileSync(foreign,bytes);const binding={path:foreign,bytes:bytes.length,sha256:sha(bytes)};
  if(field==='observations')manifest.bindings.observations=binding;else manifest.bindings.powershellLogs[0]=binding;
  fs.writeFileSync(ready.manifestPath,JSON.stringify(manifest));
  const read=fs.readFileSync;let foreignReads=0;
  const spy=t.mock.method(fs,'readFileSync',(file,...args)=>{if(file===foreign)foreignReads++;return read(file,...args);});
  try{await assert.rejects(()=>driver.disposeNativeUncFixture({fixtureManifestPath:ready.manifestPath,evidenceRoot:path.join(f.runnerTemp,'cleanup-'+f.nonce)}),/binding owner/i);assert.equal(foreignReads,0);assert.equal(m.state.removals,0);}finally{spy.mock.restore();}
 });
});
