import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {gateRExpectedMainFiles,readGateRMainAdmission} from '../gateRMainAdmissionPolicy.mjs';
let policy={};
try { policy=await import('../registryBridgeAdmissionPolicy.mjs'); } catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
function admission(){assert.equal(typeof policy.applyRegistryBridgeSourceAdmission,'function','closed bridge candidate admission is required');return JSON.parse(readFileSync(new URL('../registry-bridge-source-admission.json',import.meta.url)));}
const base=()=>gateRExpectedMainFiles();
test('bridge admission adds only the exact nine Task1 source and shipping files',()=>{
 const b=base(),out=policy.applyRegistryBridgeSourceAdmission?.(admission(),b);assert.equal(out.length,b.length+9);
 for(const row of b)assert.deepEqual(out.find(x=>x.path===row.path),row);
 assert.equal(readGateRMainAdmission().capabilityId,'WF2-R2-INVOKE');
 assert.equal(admission().runtimeActivation,false);assert.equal(admission().authority,'candidate_source_only');
});
for(const[name,mutate]of[
 ['unknown path',a=>a.deltas[0].path='extensions/workflow-register/contracts/arbitrary.json'],
 ['missing path',a=>a.deltas.pop()],['duplicate path',a=>a.deltas.push({...a.deltas[0]})],
 ['blob drift',a=>a.deltas[0].afterBlobSha='0'.repeat(40)],['wrong before',a=>a.deltas[0].beforeBlobSha='0'.repeat(40)],
 ['wrong family',a=>a.deltas[0].sourceItemIds=['source-'+ '0'.repeat(24)]],
 ['activation',a=>a.runtimeActivation=true],['completion authority',a=>a.authority='VERIFIED'],
 ['wrong base',a=>a.baseMainSha='0'.repeat(40)],['extra field',a=>a.command='node archive.js']
])test('bridge candidate rejects '+name,()=>{const a=admission();mutate(a);assert.throws(()=>policy.applyRegistryBridgeSourceAdmission(a,base()),TypeError);});
test('bridge admission rejects replacement of its sealed R2 base',()=>{const a=admission(),b=base();b[0].blobSha='0'.repeat(40);assert.throws(()=>policy.applyRegistryBridgeSourceAdmission(a,b),TypeError);});
test('bridge admission rejects getters and proxies without invoking their behavior',()=>{
 const a=admission();let calls=0;Object.defineProperty(a,'deltas',{enumerable:true,get(){calls++;throw Error('SECRET')}});
 assert.throws(()=>policy.applyRegistryBridgeSourceAdmission(a,base()),TypeError);
 assert.throws(()=>policy.applyRegistryBridgeSourceAdmission(new Proxy({}, {ownKeys(){calls++;throw Error('SECRET')}}),base()),TypeError);assert.equal(calls,0);
});
