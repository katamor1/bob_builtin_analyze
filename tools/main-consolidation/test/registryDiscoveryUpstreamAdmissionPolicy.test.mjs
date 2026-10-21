import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {gateROwnerMainFiles} from '../gateRMainAdmissionPolicy.mjs';
const root=new URL('../../../',import.meta.url),read=p=>readFileSync(new URL(p,root)),hash=b=>createHash('sha256').update(b).digest('hex');
const admission=()=>JSON.parse(read('tools/main-consolidation/registry-discovery-upstream-main-admission.json'));
async function api(){const p=await import('../registryDiscoveryUpstreamAdmissionPolicy.mjs').catch(()=>({}));assert.equal(typeof p.applyRegistryDiscoveryUpstreamAdmission,'function','fixed upstream admission is missing');return p;}
test('fixed published upstream source composes after immutable Owner and before Discovery',async()=>{
 const p=await api(),base=gateROwnerMainFiles(),a=admission(),out=p.applyRegistryDiscoveryUpstreamAdmission(a,base);
 assert.equal(a.acceptedMainSha,'90f926e0045405625f1f40d20a41346a94d1981a');assert.equal(a.parentMainSha,'3d3d25c296dc798c7eb2fd786625775bca1152f0');
 assert.equal(hash(read('tools/main-consolidation/registry-bridge-source-admission.json')),'1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4');
 const delta=new Map(a.deltas.map(x=>[x.path,x]));for(const row of base)assert.deepEqual(out.find(x=>x.path===row.path),delta.has(row.path)?{path:row.path,mode:row.mode,blobSha:delta.get(row.path).afterBlobSha}:row);
 assert.ok(out.some(x=>x.path==='extensions/bob-bazaar-review/src/mcp/mcpConfigHealth.ts'));assert.ok(a.deltas.length>0);
 for(const row of a.deltas){assert.ok(row.path.startsWith('extensions/'));assert.doesNotMatch(row.path,/artifactTransaction|checkpointRunner|workflowContractV2Runner/);}
});
for(const [name,mutate]of [['commit',a=>a.acceptedMainSha='0'.repeat(40)],['before blob',a=>a.deltas[0].beforeBlobSha='0'.repeat(40)],['after blob',a=>a.deltas[0].afterBlobSha='0'.repeat(40)],['arbitrary source',a=>a.deltas[0].path='extensions/workflow-register/src/core/contractV2/artifactTransaction.ts'],['missing source',a=>a.deltas.pop()],['extra authority',a=>a.runtimeActivation=true]])test('upstream admission rejects '+name,async()=>{const p=await api(),a=admission();mutate(a);assert.throws(()=>p.applyRegistryDiscoveryUpstreamAdmission(a,gateROwnerMainFiles()),TypeError);});
test('upstream admission rejects replaced Owner and never invokes admission getters',async()=>{const p=await api(),base=gateROwnerMainFiles();base[0].blobSha='0'.repeat(40);assert.throws(()=>p.applyRegistryDiscoveryUpstreamAdmission(admission(),base),TypeError);let calls=0;const a=admission();Object.defineProperty(a,'deltas',{get(){calls++;throw Error('getter')}});assert.throws(()=>p.applyRegistryDiscoveryUpstreamAdmission(a,gateROwnerMainFiles()),TypeError);assert.equal(calls,0);});
