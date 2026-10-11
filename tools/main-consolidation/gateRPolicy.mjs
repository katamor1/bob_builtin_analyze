import { readFileSync, lstatSync, realpathSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { canonicalJson } from './featureIntegrationProgramPolicy.mjs';

export const GATE_R_CATALOG_SHA256 = 'dc215522dfcae4c114740b2411e63a90ded87d2f803a8e946bed47be352881f2';
const SOURCE_UNIVERSE_SHA256 = 'c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79';
export const gateRRepositoryRoot = new URL('../../', import.meta.url);
const root = fileURLToPath(gateRRepositoryRoot);
const allowedNewTest = 'extensions/workflow-register/test/workflowContractV2GateR.test.js';
const artifactPath = name => 'tools/main-consolidation/' + name;
const fail = reason => { throw new TypeError('Gate R: ' + reason); };
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const sha1 = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const exact = (value, keys, label) => { if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) fail(label + ' exact keys'); };
export const gateRDigest = bytes => createHash('sha256').update(bytes).digest('hex');

// The existing canonicalizer rejects accessors, sparse arrays and non-plain data.
// Add global alias/prototype-key rejection before it can inspect any values.
export function gateRCanonicalJson(value) {
  const seen = new Set();
  function guard(v) {
    if (v === null || typeof v !== 'object') return;
    if (seen.has(v)) fail('object alias or cycle');
    seen.add(v);
    const proto = Object.getPrototypeOf(v);
    if (!Array.isArray(v) && proto !== null && proto !== Object.prototype) fail('non-plain object');
    for (const key of Reflect.ownKeys(v)) {
      if (typeof key !== 'string' || ['__proto__', 'prototype', 'constructor'].includes(key)) fail('prototype or symbol key');
      const descriptor = Object.getOwnPropertyDescriptor(v, key);
      if (!Object.hasOwn(descriptor, 'value')) fail('accessor object data');
      guard(descriptor.value);
    }
  }
  guard(value);
  return Buffer.from(JSON.stringify(JSON.parse(canonicalJson(value)), null, 2) + '\n');
}
function inputData(input, label) {
  if (Buffer.isBuffer(input) || input instanceof Uint8Array || typeof input === 'string') {
    const bytes = Buffer.from(input);
    let value; try { value = JSON.parse(bytes); } catch { fail(label + ' invalid canonical JSON'); }
    if (!bytes.equals(gateRCanonicalJson(value))) fail(label + ' noncanonical bytes');
    return value;
  }
  gateRCanonicalJson(input); return input;
}
export function validateGateRPath(value) {
  if (typeof value !== 'string' || !value || value.startsWith('/') || /[:\\\x00-\x1f\x7f]/.test(value) || value.split('/').some(p => !p || p === '.' || p === '..')) fail('invalid repository path');
  return value;
}
function orderedUnique(rows, key, label) {
  const values = rows.map(r => key ? r[key] : r);
  if (values.some((v, i) => i && compare(values[i - 1], v) >= 0)) fail(label + ' duplicate or order');
}
function pathRows(rows, label) {
  orderedUnique(rows, 'path', label);
  const folded = new Set();
  for (const row of rows) { validateGateRPath(row.path); const fold = row.path.toLowerCase(); if (folded.has(fold)) fail(label + ' case alias'); folded.add(fold); }
}
// This reader has no executable authority. Production callers always use the
// fixed module repository root; tests may supply an owned data-fixture root.
export function readGateRContainedFile(dataRoot, repositoryPath) {
  validateGateRPath(repositoryPath);
  const base = resolve(dataRoot), target = resolve(base, ...repositoryPath.split('/'));
  const rel = relative(base, target);
  if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith('..' + sep)) fail('path escapes repository');
  const physicalEqual = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (lstatSync(base).isSymbolicLink() || !physicalEqual(realpathSync(base), base)) fail('root alias');
  let current = base;
  for (const part of repositoryPath.split('/')) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !physicalEqual(realpathSync(current), current)) fail('path alias');
  }
  const stat = lstatSync(target);
  if (!stat.isFile() || stat.nlink !== 1) fail('nonregular or linked file');
  return readFileSync(target);
}
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
  const expected = {schemaVersion:'workflow-gate-r-active-suite/v1',authority:'integrated_runtime_only',catalogSha256:GATE_R_CATALOG_SHA256,capabilities:[]};
  if (!gateRCanonicalJson(value).equals(gateRCanonicalJson(expected))) fail('active suite requires proven empty integrated runtime set');
  return Object.freeze({state:'VALID_EMPTY'});
}
export function validateGateRRepositoryFiles(input) {
  gateRCanonicalJson(input);
  if (!Array.isArray(input)) fail('baseline files array');
  pathRows(input, 'baseline input');
  for (const f of input) { exact(f, ['path','mode','blobSha'], 'baseline row'); if (f.mode !== '100644' && f.mode !== '100755') fail('baseline file mode'); if (!sha1(f.blobSha)) fail('baseline blob'); }
  const source = input.filter(f => f.path !== allowedNewTest), expected = readGateRCatalog().baseline.files;
  if (!gateRCanonicalJson(source).equals(gateRCanonicalJson(expected))) fail('baseline drift or inactive source/test activation');
  return true;
}
function blobHash(bytes) { return createHash('sha1').update(Buffer.from('blob ' + bytes.length + '\0')).update(bytes).digest('hex'); }
function measuredBlob(bytes, expected) {
  if (blobHash(bytes) === expected) return expected;
  // text=auto checkout CRLF is allowed, binary bytes never receive text folding.
  if (!bytes.subarray(0,8000).includes(0)) { const normalized = Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')); if (blobHash(normalized) === expected) return expected; }
  fail('baseline blob identity drift');
}
export function validateGateRRepository() {
  if (gateRDigest(readGateRContainedFile(root, artifactPath('feature-selection-source-universe.json'))) !== SOURCE_UNIVERSE_SHA256) fail('source universe identity');
  const catalog = readGateRCatalog(), snapshot = [];
  for (const f of catalog.baseline.files) snapshot.push({path:f.path,mode:f.mode,blobSha:measuredBlob(readGateRContainedFile(root,f.path),f.blobSha)});
  const known = new Set(snapshot.map(f => f.path));
  function scan(repositoryPath) {
    if (!existsSync(resolve(root, repositoryPath))) return;
    for (const entry of readdirSync(resolve(root,repositoryPath), {withFileTypes:true})) {
      const p = repositoryPath + '/' + entry.name;
      if (entry.isSymbolicLink()) fail('source/test path alias');
      if (entry.isDirectory()) scan(p);
      else if (!known.has(p) && p !== allowedNewTest) fail('unexpected source/test path: ' + p);
      else if (p === allowedNewTest) readGateRContainedFile(root,p);
    }
  }
  for (const ext of ['workflow-register','bob-bazaar-review','bob-code-consistency-review']) for (const dir of ['src','test']) scan('extensions/' + ext + '/' + dir);
  return validateGateRRepositoryFiles(snapshot);
}
export function gateRResult() {
  validateGateRInventory(readArtifact('gate-r-archive-inventory.json'));
  const active = readArtifact('gate-r-active-suite.json');
  validateGateRActiveSuite(active); validateGateRRepository();
  return Object.freeze({schemaVersion:'workflow-gate-r-result/v1',state:'INVENTORY_ONLY',inventoryValidation:'PASSED',runtimeSuiteState:'NOT_RUN_EMPTY',runtimeSuitesExecuted:0,archiveTestsExecuted:0,runtimeActivation:false,providerDispatches:0,bobDispatches:0,catalogSha256:GATE_R_CATALOG_SHA256,activeManifestSha256:gateRDigest(active)});
}
