import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {gateRExpectedMainFiles,readGateRMainAdmission} from '../gateRMainAdmissionPolicy.mjs';
let policy={};
try { policy=await import('../registryBridgeAdmissionPolicy.mjs'); } catch(error) { if(error.code!=='ERR_MODULE_NOT_FOUND')throw error; }
function admission(){assert.equal(typeof policy.applyRegistryBridgeSourceAdmission,'function','closed bridge candidate admission is required');return JSON.parse(readFileSync(new URL('../registry-bridge-source-admission.json',import.meta.url)));}
const base=()=>gateRExpectedMainFiles();
test('bridge admission adds only the exact Task1 through Task4 source delta without other baseline drift',()=>{
 const b=base(),out=policy.applyRegistryBridgeSourceAdmission?.(admission(),b);assert.equal(out.length,b.length+28);
 const deltas=new Map(admission().deltas.map(row=>[row.path,row]));assert.equal(deltas.size,56);
 for(const row of b){const change=deltas.get(row.path);assert.deepEqual(out.find(x=>x.path===row.path),change?{path:row.path,mode:row.mode,blobSha:change.afterBlobSha}:row);}
 assert.deepEqual(admission().deltas.filter(row=>row.beforeBlobSha!==null).map(row=>row.path),["extensions/bob-bazaar-review/src/workflow/workflowProviders.ts","extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts","extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js","extensions/bob-code-consistency-review/src/extension.ts","extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts","extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js","extensions/workflow-register/package.json","extensions/workflow-register/scripts/check-contract-v2-runtime-reachability.js","extensions/workflow-register/scripts/recompress-vsix.js","extensions/workflow-register/src/bobWorkflowRunner.ts","extensions/workflow-register/src/core/actionRegistry.ts","extensions/workflow-register/src/core/agentProvider.ts","extensions/workflow-register/src/core/contractV2/providerRegistry.ts","extensions/workflow-register/src/core/engine.ts","extensions/workflow-register/src/core/engine/preflight.ts","extensions/workflow-register/src/core/engineTypes.ts","extensions/workflow-register/src/core/resultSinkRegistry.ts","extensions/workflow-register/src/core/runtime/resultSinkRegistry.ts","extensions/workflow-register/src/extension.ts","extensions/workflow-register/src/workflowContractV2ProviderLifecycle.ts","extensions/workflow-register/src/workflowRegisterService.ts","extensions/workflow-register/src/workflowRuntimeFactory.ts","extensions/workflow-register/test/operationHubAgentProvider.test.js","extensions/workflow-register/test/registrationWiring.test.js","extensions/workflow-register/test/runtimeWiring.test.js","extensions/workflow-register/test/vsixCompression.test.js","extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js","extensions/workflow-register/test/workflowRegister.test.js"]);
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

test('bridge admission reads actual on-disk canonical bytes',()=>{const bytes=readFileSync(new URL('../registry-bridge-source-admission.json',import.meta.url));assert.equal(policy.applyRegistryBridgeSourceAdmission(bytes,base()).length,base().length+28);});
