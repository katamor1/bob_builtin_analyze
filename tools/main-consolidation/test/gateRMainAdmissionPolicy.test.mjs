import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
let policy;
try { policy = await import('../gateRMainAdmissionPolicy.mjs'); } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND' || error.url !== new URL('../gateRMainAdmissionPolicy.mjs', import.meta.url).href) throw error;
  policy = {};
}
function admission() {
  assert.equal(typeof policy.validateGateRMainAdmission, 'function', 'closed reviewed-candidate source admission is required');
  return JSON.parse(readFileSync(new URL('../gate-r-main-admission.json', import.meta.url)));
}
test('R1 closed current-source admission precedes future VERIFIED metadata', () => {
  assert.deepEqual(policy.validateGateRMainAdmission?.(admission()), { state: 'VALID_R2_CANDIDATE' });
});
for (const [name, mutate] of [
  ['base main', a => a.baseMainSha = '0'.repeat(40)],
  ['base tree', a => a.baseTreeSha = '0'.repeat(40)],
  ['catalog', a => a.archiveCatalogSha256 = '0'.repeat(64)],
  ['authority', a => a.authority = 'runtime_activation'],
  ['future capability', a => a.capabilityId = 'WF2-R3-ARTIFACT-TX'],
  ['missing base row', a => a.baseFiles.pop()],
  ['base blob', a => a.baseFiles[0].blobSha = '0'.repeat(40)],
  ['base mode', a => a.baseFiles[0].mode = '120000'],
  ['duplicate base row', a => a.baseFiles.push({ ...a.baseFiles[0] })],
  ['base order', a => a.baseFiles.reverse()],
  ['case alias', a => a.baseFiles[0].path = a.baseFiles[0].path.toUpperCase()],
  ['missing delta', a => a.deltas.pop()],
  ['wrong before', a => a.deltas[0].beforeBlobSha = '0'.repeat(40)],
  ['wrong after', a => a.deltas[0].afterBlobSha = '0'.repeat(40)],
  ['arbitrary delta path', a => a.deltas[0].path = 'extensions/workflow-register/src/arbitrary.ts'],
  ['conditional delta', a => a.deltas[0].path = 'extensions/workflow-register/src/core/contractV2/artifactTransaction.ts'],
  ['wrong family', a => a.deltas[0].familyIds = ['source-000000000000000000000000']],
  ['duplicate family', a => a.deltas[0].familyIds.push(a.deltas[0].familyIds[0])],
  ['missing active family', a => a.activeTestFamilies.pop()],
  ['wrong required case', a => a.activeTestFamilies[0].requiredCaseNames = ['unrelated']],
  ['nested hosted recursion', a => a.activeTestFamilies[0].testPath = 'extensions/workflow-register/test/workflowContractV2GateR.test.js'],
  ['full-suite recursion', a => a.activeTestFamilies[0].testPath = 'npm test'],
  ['arbitrary execution authority', a => a.module = '../archive/runtime.js'],
  ['future VERIFIED prerequisite', a => a.verifiedMainSha = '0'.repeat(40)]
]) test('R1 admission rejects ' + name, () => { const a = admission(); mutate(a); assert.throws(() => policy.validateGateRMainAdmission(a), /Gate R|admission|source|base|canonical|path|family/i); });
test('R1 admission rejects getters/proxies without invoking them', () => {
  const a = admission(); let reads = 0;
  const getter = { ...a }; Object.defineProperty(getter, 'baseFiles', { enumerable: true, get() { reads++; throw Error('getter') } });
  assert.throws(() => policy.validateGateRMainAdmission(getter), TypeError); assert.equal(reads, 0);
  const proxy = new Proxy(a, { getPrototypeOf() { reads++; throw TypeError('proxy trap') } });
  assert.throws(() => policy.validateGateRMainAdmission(proxy), TypeError); assert.equal(reads, 0);
});

for(const [name,change]of [['extra newline',b=>Buffer.concat([b,Buffer.from('\n')])],['BOM',b=>Buffer.concat([Buffer.from([239,187,191]),b])],['CRLF',b=>Buffer.from(b.toString().replaceAll('\n','\r\n'))],['duplicate JSON key',b=>Buffer.from(b.toString().replace('{','{"authority":"reviewed_candidate_source",'))]])test('R1 admission rejects noncanonical '+name,()=>{
 const bytes=readFileSync(new URL('../gate-r-main-admission.json',import.meta.url));assert.throws(()=>policy.validateGateRMainAdmission(change(bytes)),TypeError);
});
import {createRequire}from'node:module';
const require=createRequire(new URL('../../../extensions/workflow-register/package.json',import.meta.url));
test('R1 admission and active schemas validate the actual candidate and reject future execution authority',()=>{
 const Ajv=require('ajv/dist/2020');const ajv=new Ajv({strict:true,allErrors:true});
 for(const [artifact,schema]of [['gate-r-main-admission.json','workflow-gate-r-main-admission.schema.json'],['gate-r-active-suite.json','workflow-gate-r-active-suite.schema.json']]){
  const value=JSON.parse(readFileSync(new URL('../'+artifact,import.meta.url))),validate=ajv.compile(JSON.parse(readFileSync(new URL('../../../docs/release-evidence/schemas/'+schema,import.meta.url))));
  assert.equal(validate(value),true,JSON.stringify(validate.errors));value.command='node archive/runtime.js';assert.equal(validate(value),false);
 }
});

test('R2 admission seals the entire 1126-file current-main shipping baseline and all fifteen families',()=>{const a=admission();assert.equal(a.schemaVersion,'workflow-gate-r-main-admission/v2');assert.equal(a.baseMainSha,'abdedeb23fe133c2b541c8cc2fa7d35f2e8b5688');assert.equal(a.baseFiles.length,1126);assert.equal(a.activeTestFamilies.length,15);assert.equal(a.capabilityId,'WF2-R2-INVOKE');});

import {readdirSync} from 'node:fs';
import {REGISTRY_DISCOVERY_TOOL_PATHS} from '../registryDiscoveryAdmissionPolicy.mjs';
test('Discovery layers literal root tools after unchanged Owner57 and verifies actual source bytes',()=>{
 const root=new URL('../../../',import.meta.url),actual=[];
 function scan(relative){for(const entry of readdirSync(new URL(relative+'/',root),{withFileTypes:true})){assert.equal(entry.isSymbolicLink(),false);const p=relative+'/'+entry.name;if(entry.isDirectory())scan(p);else actual.push(p);}}
 scan('tools/workflow-evidence');assert.deepEqual(actual.sort(),REGISTRY_DISCOVERY_TOOL_PATHS);
 const owner=policy.gateROwnerMainFiles(),current=policy.gateRCurrentMainFiles();assert.equal(owner.length,policy.gateRExpectedMainFiles().length+28);assert.ok(current.length>owner.length);
 assert.equal(JSON.parse(readFileSync(new URL('../registry-bridge-source-admission.json',import.meta.url))).deltas.length,57);
 policy.validateGateRMainRepository();
});
