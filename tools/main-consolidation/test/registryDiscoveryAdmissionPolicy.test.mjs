import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gateRExpectedMainFiles} from '../gateRMainAdmissionPolicy.mjs';
import {applyRegistryBridgeSourceAdmission} from '../registryBridgeAdmissionPolicy.mjs';
const root=new URL('../../../',import.meta.url),read=p=>readFileSync(new URL(p,root)),json=p=>JSON.parse(read(p)),hash=b=>createHash('sha256').update(b).digest('hex');
const owner=()=>applyRegistryBridgeSourceAdmission(read('tools/main-consolidation/registry-bridge-source-admission.json'),gateRExpectedMainFiles());
async function api(){const p=await import('../registryDiscoveryAdmissionPolicy.mjs').catch(()=>({}));assert.equal(typeof p.applyRegistryDiscoverySourceAdmission,'function','literal Discovery admission is missing');return p;}
const admission=()=>json('tools/main-consolidation/registry-discovery-source-admission.json');
test('discovery_admission_is_additive_literal_and_remainder_complete',async()=>{
 const p=await api(),base=owner(),a=admission(),out=p.applyRegistryDiscoverySourceAdmission(a,base);assert.equal(hash(read('tools/main-consolidation/registry-bridge-source-admission.json')),'1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4');
 assert.ok(out.length>base.length);const delta=new Map(a.deltas.map(x=>[x.path,x]));for(const row of base)assert.deepEqual(out.find(x=>x.path===row.path),delta.has(row.path)?{path:row.path,mode:row.mode,blobSha:delta.get(row.path).afterBlobSha}:row);
 const coverage=json('docs/release-evidence/reg-bridge-discovery-source-coverage-2026-10-20.json'),ledger=json('docs/release-evidence/feature-selection-ledger-2026-08-23.json');
 assert.equal(coverage.items.length,27);assert.equal(new Set(coverage.items.map(x=>x.sourceItemId)).size,27);assert.equal(coverage.remainderClosure.unassigned,0);
 assert.deepEqual(coverage.remainderClosure.items.map(x=>x.sourceItemId).sort(),ledger.sourceItems.map(x=>x.sourceItemId).sort());
 for(const row of coverage.items){assert.ok(row.origins.length);for(const origin of row.origins){assert.match(origin.blobSha,/^[0-9a-f]{40}$/);assert.equal(origin.commitSha,'3e2dd68d4a0a880e7fa7ed065f5a1be2bd25a0ca');assert.ok(origin.path);}assert.ok(row.symbols.length);for(const target of [...row.targetPaths,...row.testPaths])assert.ok(read(target).length);}
 assert.ok(!a.deltas.some(x=>x.sourceItemIds.includes('source-eb7aeef897a4f48ed72d6900')));
});
for(const [name,mutate]of [['unexpected file',a=>a.toolFiles[0].path='tools/workflow-evidence/arbitrary.mjs'],['forbidden root',a=>a.deltas[0].path='extensions/workflow-register/src/core/contractV2/artifactTransaction.ts'],['wildcard',a=>a.toolFiles[0].path='tools/workflow-evidence/**'],['before drift',a=>a.deltas[0].beforeBlobSha='0'.repeat(40)],['after drift',a=>a.toolFiles[0].blobSha='0'.repeat(40)],['coverage drift',a=>a.sourceCoverageDigest='0'.repeat(64)],['extra authority',a=>a.runtimeActivation=true]])test('Discovery admission rejects '+name,async()=>{const p=await api(),a=admission();mutate(a);assert.throws(()=>p.applyRegistryDiscoverySourceAdmission(a,owner()),TypeError);});
test('Discovery admission rejects a replaced Owner baseline without invoking getters',async()=>{const p=await api(),a=admission(),base=owner();base[0].blobSha='0'.repeat(40);assert.throws(()=>p.applyRegistryDiscoverySourceAdmission(a,base),TypeError);let calls=0;Object.defineProperty(a,'toolFiles',{get(){calls++;throw Error('getter')}});assert.throws(()=>p.applyRegistryDiscoverySourceAdmission(a,owner()),TypeError);assert.equal(calls,0);});
