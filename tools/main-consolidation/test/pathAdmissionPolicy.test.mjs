import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const coveragePath='docs/release-evidence/proc-t17-path-source-coverage-2026-11-04.json';
const admissionPath='tools/main-consolidation/path-source-admission.json';
const base='cf96788dbdd6836b449b7a31ecd3bae4ee4302a4';
const read=relative=>fs.readFileSync(path.join(root,relative));
const parse=relative=>JSON.parse(read(relative));
const policy=()=>import('../pathAdmissionPolicy.mjs');

test('path_layer_requires_exact_twenty_two_origins_and_all_675_assignments',async()=>{
 const p=await policy(),coverage=parse(coveragePath);
 const universe=parse('tools/main-consolidation/feature-selection-source-universe.json');
 const selected=universe.items.filter(row=>row.primaryOwner==='PROC-T17-PATH');
 assert.equal(p.validatePathCoverage(read(coveragePath)),true);
 assert.deepEqual(coverage.items.map(row=>row.sourceItemId),selected.map(row=>row.sourceItemId));
 assert.deepEqual([coverage.items.length,new Set(coverage.items.map(row=>row.origin.path)).size,
  new Set(coverage.items.map(row=>row.origin.blobSha)).size],[22,22,21]);
 assert.deepEqual(coverage.remainderClosure.items.map(row=>[row.sourceItemId,row.primaryOwner]),
  universe.items.map(row=>[row.sourceItemId,row.primaryOwner]));
 assert.deepEqual([coverage.remainderClosure.total,coverage.remainderClosure.unassigned],[675,0]);
 for(const mutate of [
  c=>c.items.pop(),c=>c.items[1].origin=c.items[0].origin,c=>c.remainderClosure.items.pop(),
  c=>c.items.find(row=>row.origin.path.endsWith('workspaceRoots.test.js')).symbolReceipts.pop()
 ]){
  const altered=structuredClone(coverage);mutate(altered);
  assert.throws(()=>p.validatePathCoverage(altered),/path admission/);
 }
 assert.throws(()=>p.validatePathCoverage(Buffer.concat([Buffer.from(' '),read(coveragePath)])),/canonical|raw/);
});

test('path_layer_rejects_missing_current_prerequisite_and_broadened_workflow_payload',async()=>{
 const p=await policy(),admission=parse(admissionPath);
 assert.equal(admission.baseMainSha,base);
 assert.equal(p.validatePathSourceAdmission(read(admissionPath)),true);
 assert.equal(p.validatePathRepository(root),true);
 for(const mutate of [
  a=>a.baseMainSha='0'.repeat(40),
  a=>a.controlRows.pop(),
  a=>a.sourceRows[0].sourceItemIds=[],
  a=>a.sourceRows.find(row=>row.path.endsWith('workflow-register/scripts/build-shared-runtime.js')).afterBlobSha='1'.repeat(40)
 ]){
  const altered=structuredClone(admission);mutate(altered);
  assert.throws(()=>p.validatePathSourceAdmission(altered),/path admission/);
 }
 const g=await import('../gateRMainAdmissionPolicy.mjs'),b=await import('../processingBudgetAdmissionPolicy.mjs');
 assert.deepEqual(g.gateRCurrentMainFiles(),p.applyPathSourceAdmission(admission,{domain:'gate_r_shipping',baseFiles:g.gateRDeadlineMainFiles()}));
 assert.deepEqual(b.processingBudgetCurrentSourceFiles(),p.applyPathSourceAdmission(admission,{domain:'processing_budget',baseFiles:b.processingBudgetT17DeadlineSourceFiles()}));
 assert.throws(()=>p.applyPathSourceAdmission(admission,{domain:'gate_r_shipping',baseFiles:b.processingBudgetT17DeadlineSourceFiles()}),/domain baseline/);
});

test('historical_t17_replay_keeps_original_counts_and_bytes',async()=>{
 const p=await policy(),{createDeadlineReplay}=await import('./helpers/pathAdmissionFixture.mjs');
 const {validateDeadlineRepository}=await import('../deadlineAdmissionPolicy.mjs');
 const fixture=createDeadlineReplay();
 assert.doesNotThrow(()=>validateDeadlineRepository(fixture.root));
 const original=JSON.parse(fixture.read('docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json'));
 assert.deepEqual([original.items.length,new Set(original.items.map(row=>row.origin.path)).size,
  new Set(original.items.map(row=>row.origin.blobSha)).size,original.remainderClosure.total],[54,54,53,675]);
 const completions=Object.entries(p.PATH_HISTORICAL_BINDINGS).filter(([relative,binding])=>binding.kind==='completion');
 assert.equal(completions.length,17);
 for(const [relative] of completions) assert.deepEqual(read(relative),fixture.read(relative),relative);
});
