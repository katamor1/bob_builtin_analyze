import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { canonicalJson } from './featureIntegrationProgramPolicy.mjs';
import { gateRActiveTestFamilies, validateGateRMainRepository, validateGateRMainRepositoryFiles } from './gateRMainAdmissionPolicy.mjs';
import { gateRCanonicalJson, gateRDigest, validateGateRPath, readGateRContainedFile, gateRInputData as inputData, gateROrderedUnique as orderedUnique, gateRPathRows as pathRows } from './gateRData.mjs';
export { gateRCanonicalJson, gateRDigest, validateGateRPath, readGateRContainedFile } from './gateRData.mjs';

export const GATE_R_CATALOG_SHA256 = 'dc215522dfcae4c114740b2411e63a90ded87d2f803a8e946bed47be352881f2';
const SOURCE_UNIVERSE_SHA256 = 'c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79';
export const gateRRepositoryRoot = new URL('../../', import.meta.url);
const root = fileURLToPath(gateRRepositoryRoot);
const artifactPath = name => 'tools/main-consolidation/' + name;
const fail = reason => { throw new TypeError('Gate R: ' + reason); };
const sha1 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const exact = (value, keys, label) => { if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(label + ' exact keys'); };

const readArtifact = name => readGateRContainedFile(root, artifactPath(name));
let cachedCatalog;
export function validateGateRCatalog(input) {
  const catalog = inputData(input, 'catalog');
  if (gateRDigest(gateRCanonicalJson(catalog)) !== GATE_R_CATALOG_SHA256) fail('untrusted source catalog identity');
  exact(catalog, ['schemaVersion','authority','archive','sourceUniverseSha256','commits','endpointPaths','rangePaths','families','baseline'], 'catalog');
  exact(catalog.archive, ['fromSha','toSha','treeSha','carrierSha256','manifests'], 'archive');
  if (catalog.schemaVersion !== 'workflow-gate-r-source-catalog/v1' || catalog.authority !== 'archive_read_only' || catalog.sourceUniverseSha256 !== SOURCE_UNIVERSE_SHA256) fail('catalog authority');
  if (catalog.archive.fromSha !== 'e860d1ebbafe7068fc6871b16c9586a11b4fe19d' || catalog.archive.toSha !== 'a18c09b10fa51702d312e34940a694ad971a48cc' || catalog.archive.treeSha !== '1c37b277ffa2047041c4473c56c112edc9ae98e5') fail('archive identity');
  orderedUnique(catalog.commits, null, 'commits');
  if (catalog.commits.length !== 217 || catalog.commits.some(s => !sha1(s))) fail('commit inventory');
  pathRows(catalog.endpointPaths, 'endpoint paths');
  for (const row of catalog.endpointPaths) { exact(row, ['path','mode','blobSha'], 'endpoint'); if (!sha1(row.blobSha)) fail('endpoint blob'); }
  pathRows(catalog.rangePaths, 'range paths');
  for (const row of catalog.rangePaths) {
    exact(row, ['path','classification','sourceItemIds','otherSourceItemIds','predecessorBlobSha','endpointBlobSha','history','blobs'], 'range path');
    if (!['workflow_c_owned','predecessor_baseline','transport_metadata'].includes(row.classification)) fail('unclassified range path');
    for (const h of row.history) { exact(h, ['commitSha','path','previousBlobSha','blobSha','change'], 'history'); if (!catalog.commits.includes(h.commitSha) || h.path !== row.path) fail('history identity'); }
    for (const b of row.blobs) exact(b, ['blobSha','byteSize','sha256'], 'blob');
    if (row.classification === 'workflow_c_owned' && !row.sourceItemIds.length) fail('unclassified family path');
  }
  orderedUnique(catalog.families, 'sourceItemId', 'families');
  for (const f of catalog.families) {
    exact(f, ['sourceItemId','path','family','kind','symbols','primaryOwner','consumedBy','rationale','origins'], 'family');
    if (!/^WF2-R[1-6]-/.test(f.primaryOwner)) fail('unclassified family owner');
    for (const o of f.origins) exact(o, ['trancheId','path','snapshotKind','commitSha','blobSha','byteSize','sha256'], 'origin');
  }
  for (const [i, n] of [8,7,4,8,11,12].entries()) if (catalog.families.filter(f => f.kind === 'test_family' && f.primaryOwner.startsWith('WF2-R' + (i + 1) + '-')).length !== n) fail('test family coverage');
  exact(catalog.baseline, ['mainSha','treeSha','sharedPaths','files'], 'baseline');
  pathRows(catalog.baseline.files, 'baseline files');
  for (const row of catalog.baseline.files) exact(row, ['path','mode','blobSha'], 'baseline file');
  for (const row of catalog.baseline.sharedPaths) { exact(row, ['path','mode','type','blobSha','families'], 'shared path'); for (const f of row.families) exact(f, ['id','owner','kind','family','symbols'], 'shared family'); }
  return catalog;
}
export function readGateRCatalog() {
  // Every command rechecks actual bytes before using the cached parsed data.
  const bytes = readArtifact('gate-r-archive-source-catalog.json');
  if (gateRDigest(bytes) !== GATE_R_CATALOG_SHA256) fail('source catalog digest');
  if (!cachedCatalog) {
    cachedCatalog = validateGateRCatalog(bytes);
    const freeze = v => { if (v && typeof v === 'object') { for (const x of Object.values(v)) freeze(x); Object.freeze(v); } return v; };
    freeze(cachedCatalog);
  }
  return cachedCatalog;
}
export function buildGateRInventory() {
  const catalog = readGateRCatalog();
  return { schemaVersion:'workflow-gate-r-archive-inventory/v1',authority:'archive_read_only',catalogSha256:GATE_R_CATALOG_SHA256,archive:catalog.archive,paths:catalog.rangePaths,families:catalog.families.map(f => ({...f,policyState:/^WF2-R[12]-/.test(f.primaryOwner)?'expected_inactive_planned':/^WF2-R[345]-/.test(f.primaryOwner)?'expected_inactive_conditional':'expected_absent_rejected'})),absentLegacyTests:['extensions/workflow-register/test/workflowContractV2Runtime.test.js','extensions/workflow-register/test/workflowContractV2BobRuntime.test.js'] };
}
export function validateGateRInventory(input) {
  const value = inputData(input, 'inventory');
  if (!gateRCanonicalJson(value).equals(gateRCanonicalJson(buildGateRInventory()))) fail('inventory identity, classification or coverage mismatch');
  return Object.freeze({state:'VALID'});
}
export function validateGateRActiveSuite(input) {
  const value = inputData(input, 'active suite');
  readGateRCatalog();
  const expected = {schemaVersion:'workflow-gate-r-active-suite/v1',authority:'integrated_runtime_only',catalogSha256:GATE_R_CATALOG_SHA256,capabilities:[{capabilityId:'WF2-R1-PROVENANCE',testFamilies:gateRActiveTestFamilies()}]};
  if (!gateRCanonicalJson(value).equals(gateRCanonicalJson(expected))) fail('active suite requires exact R1 families and current paths');
  return Object.freeze({state:'VALID_R1'});
}
export function validateGateRRepositoryFiles(input) {
  return validateGateRMainRepositoryFiles(input);
}
export function validateGateRRepository() {
  if (gateRDigest(readGateRContainedFile(root, artifactPath('feature-selection-source-universe.json'))) !== SOURCE_UNIVERSE_SHA256) fail('source universe identity');
  readGateRCatalog();validateGateRMainRepository();return true;
}
export function validateGateRTestObservation(family, input) {
  const row = inputData(family,'test family'), value=inputData(input,'child observation');
  if(!gateRActiveTestFamilies().some(f=>gateRCanonicalJson(f).equals(gateRCanonicalJson(row))))fail('unselected test family/path (recursive execution refused)');
  exact(value,['stdout','stderr','exitCode','signal','timedOut','outputOverflow'],'child observation');
  if(typeof value.stdout!=='string'||typeof value.stderr!=='string'||value.stderr!==''||value.exitCode!==0||value.signal!==null||value.timedOut!==false||value.outputOverflow!==false)fail('child unsuccessful/unsettled/timeout/output');
  const lines=value.stdout.replaceAll('\r\n','\n').split('\n');
  let diagnostic=false;
  for(const line of lines){
   if(line==='  ---'){if(diagnostic)fail('TAP duplicate diagnostics');diagnostic=true;continue;}
   if(line==='  ...'){if(!diagnostic)fail('TAP unmatched diagnostics');diagnostic=false;continue;}
   if(/^\s/.test(line)){if(!diagnostic)fail('TAP malformed diagnostics');continue;}
   if(diagnostic)fail('TAP truncated diagnostics');
   if(line!==''&&!/^(?:TAP version 13|#.*|1\.\.\d+|(?:not )?ok \d+ - .+|R1_(?:PROVENANCE_FIXTURE|PRODUCT_WIRING)_BASE64=[A-Za-z0-9+/=]+)$/.test(line))fail('TAP malformed output');
  }
  if(diagnostic)fail('TAP incomplete diagnostics');
  if(lines.filter(l=>l==='TAP version 13').length!==1)fail('TAP version');
  const plans=lines.filter(l=>/^1\.\./.test(l)),completions=lines.filter(l=>/^(?:not )?ok \d+ - /.test(l));
  if(plans.length!==1||!/^1\.\.[1-9]\d*$/.test(plans[0]))fail('TAP incomplete/duplicate plan');
  const count=Number(plans[0].slice(3));if(completions.length!==count||lines.indexOf(plans[0])<lines.lastIndexOf(completions.at(-1)))fail('TAP completed plan coverage');
  const names=[];
  for(const [i,line] of completions.entries()){
    const match=/^ok (\d+) - (.+)$/.exec(line);
    if(!match||Number(match[1])!==i+1||/\s+#\s*(?:skip|todo)\b/i.test(match[2]))fail('TAP failed/skipped/todo case');names.push(match[2]);
  }
  if(new Set(names).size!==names.length||row.requiredCaseNames.some(n=>names.filter(x=>x===n).length!==1))fail('required case missing/duplicate');
  const summary={};for(const key of ['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms']){
   const matches=lines.filter(l=>l.startsWith('# '+key+' '));if(matches.length!==1||!(key==='duration_ms'?/^\d+(?:\.\d+)?$/:/^\d+$/).test(matches[0].slice(key.length+3)))fail('TAP malformed/duplicate summary');summary[key]=Number(matches[0].slice(key.length+3));
  }
  if(summary.tests!==count||summary.pass!==summary.tests||summary.suites!==0||['fail','cancelled','skipped','todo'].some(k=>summary[k]!==0))fail('TAP failure/cancel/skip/todo summary');
  return Object.freeze({state:'PASSED'});
}
export function validateGateRProductWiringObservation(input) {
  const value=inputData(input,'product wiring');
  const counters=['v2ProductLeaseAcquisitions','providerDispatches','bobDispatches','v2ProductRunDirectoryCreations','v2ProductArtifactStages'];
  exact(value,['schemaVersion','counterScope','observedProductSurfaces',...counters],'product wiring');
  if(value.schemaVersion!=='workflow-r1-product-wiring/v1'||value.counterScope!=='contract_v2_product_paths'||JSON.stringify(value.observedProductSurfaces)!==JSON.stringify(['validation','registration','operation_hub','authoring','legacy_v1'])||counters.some(k=>value[k]!==0))fail('product wiring surfaces/counters');
  return Object.freeze({...Object.fromEntries(counters.map(k=>[k,value[k]])),counterScope:value.counterScope,wiringObservationSha256:gateRDigest(Buffer.from(canonicalJson(value)))});
}
function wiringFromOutput(stdout){
 const markers=stdout.replaceAll('\r\n','\n').split('\n').filter(l=>/^(?:# )?R1_PRODUCT_WIRING_BASE64=/.test(l));if(markers.length!==1)fail('product wiring marker missing/duplicate');
 const encoded=markers[0].replace(/^(?:# )?R1_PRODUCT_WIRING_BASE64=/,'');if(!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded))fail('wiring base64');
 const bytes=Buffer.from(encoded,'base64');if(bytes.toString('base64')!==encoded)fail('wiring base64 identity');let value;try{value=JSON.parse(bytes);}catch{fail('wiring JSON');}
 if(Buffer.from(canonicalJson(value)).compare(bytes)!==0)fail('wiring noncanonical bytes');return validateGateRProductWiringObservation(value);
}
function executeFixedFamily(family,deadline,outputBudget){return new Promise((resolveChild,reject)=>{
 const remaining=deadline-performance.now();if(remaining<=0){reject(new TypeError('Gate R: total timeout'));return;}
 // Family paths come only from the closed manifest; no caller-supplied command/root.
 // node:test's parent IPC context otherwise silently changes direct-child TAP
 // into its binary reporter. Each selected file is its own direct Node process.
 const environment={...process.env};delete environment.NODE_TEST_CONTEXT;
 const child=spawn(process.execPath,[family.testPath.slice('extensions/workflow-register/'.length)],{cwd:resolve(root,'extensions/workflow-register'),env:environment,shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stdout='',stderr='',timedOut=false,outputOverflow=false,spawnError;
 const timer=setTimeout(()=>{timedOut=true;child.kill();},remaining);
 function collect(channel,bytes){outputBudget.bytes+=bytes.length;if(outputBudget.bytes>1048576){outputOverflow=true;child.kill();return;}if(channel==='stdout')stdout+=bytes.toString('utf8');else stderr+=bytes.toString('utf8');}
 child.stdout.on('data',b=>collect('stdout',b));child.stderr.on('data',b=>collect('stderr',b));child.on('error',e=>{spawnError=e;});
 child.on('close',(exitCode,signal)=>{clearTimeout(timer);if(spawnError){reject(spawnError);return;}resolveChild({stdout,stderr,exitCode,signal,timedOut,outputOverflow});});
});}
export async function gateRResult() {
  const deadline=performance.now()+120000,outputBudget={bytes:0};
  validateGateRInventory(readArtifact('gate-r-archive-inventory.json'));
  const active = readArtifact('gate-r-active-suite.json');
  validateGateRActiveSuite(active); validateGateRRepository();
  let wiring;
  for(const family of gateRActiveTestFamilies()){
    const observation=await executeFixedFamily(family,deadline,outputBudget);
    try{validateGateRTestObservation(family,observation);}catch(error){throw new TypeError(error.message+' ('+family.testPath+', exit='+observation.exitCode+', stderr='+observation.stderr.slice(0,300)+')');}
    if(family.sourceItemId==='source-75c07aaa99be8455bdc3285f')wiring=wiringFromOutput(observation.stdout);
    else if(/R1_PRODUCT_WIRING_BASE64=/.test(observation.stdout))fail('unexpected wiring marker');
  }
  if(!wiring||performance.now()>deadline)fail('missing wiring/total timeout');
  return Object.freeze({schemaVersion:'workflow-gate-r-result/v2',state:'ACTIVE_TEST_SUITES_PASSED',inventoryValidation:'PASSED',runtimeSuiteState:'PASSED',runtimeSuitesExecuted:8,activeCapabilityIds:['WF2-R1-PROVENANCE'],archiveTestsExecuted:0,runtimeActivation:false,catalogSha256:GATE_R_CATALOG_SHA256,activeManifestSha256:gateRDigest(active),...wiring});
}
