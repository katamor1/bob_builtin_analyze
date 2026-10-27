import {createT14AdmissionFixture} from './helpers/aggregateAdmissionFixture.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gateRDigest} from '../gateRData.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const admissionPath='tools/main-consolidation/bounded-document-source-admission.json',coveragePath='docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json';
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const policy=()=>import('../boundedDocumentAdmissionPolicy.mjs');
test('exact_39_items_and_complete_675_partition',async()=>{
 const p=await policy(),coverage=read(coveragePath);assert.equal(p.validateBoundedDocumentCoverage(coverage),true);assert.deepEqual([coverage.items.length,coverage.remainderClosure.total,coverage.remainderClosure.unassigned],[39,675,0]);
 const spec=fs.readFileSync(path.join(root,'docs/superpowers/specs/2026-10-24-proc-t14-bounded-doc-design.md'),'utf8'),expected=[...spec.matchAll(/^\| (source-[a-f0-9]{24}) \|/gm)].map(x=>x[1]);assert.deepEqual(coverage.items.map(x=>x.sourceItemId),expected);
 const universe=read('tools/main-consolidation/feature-selection-source-universe.json');assert.deepEqual(coverage.remainderClosure.items.map(x=>x.sourceItemId),universe.items.map(x=>x.sourceItemId));
 for(const item of coverage.items){const original=universe.items.find(x=>x.sourceItemId===item.sourceItemId),origin=original.origins.find(x=>x.commitSha==='4d0fb728763db9d13c87d000790a88c45900733e');assert.deepEqual(item.origin,{commitSha:origin.commitSha,blobSha:origin.blobSha,path:origin.path});assert.ok(item.targets.length>0);assert.ok(item.testPaths.length>0);assert.ok(item.adaptation.length>0);}
 const missing=structuredClone(coverage);missing.items.pop();assert.throws(()=>p.validateBoundedDocumentCoverage(missing),/literal|coverage/);
});
test('historical_layers_keep_original_raw_bytes_and_subjects',async()=>{
 const p=await policy(),{processingBudgetT13SourceFiles}=await import('../processingBudgetAdmissionPolicy.mjs'),{gateRDiscoveryMainFiles}=await import('../gateRMainAdmissionPolicy.mjs');assert.equal(processingBudgetT13SourceFiles().length,28);assert.equal(gateRDiscoveryMainFiles().length,1213);
 assert.equal(gateRDigest(fs.readFileSync(path.join(root,'tools/main-consolidation/registry-bridge-source-admission.json'))),'1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4');
 for(const [relative,binding]of Object.entries(p.BOUNDED_DOCUMENT_HISTORICAL_BINDINGS)){assert.ok(binding.rawSha256.includes(gateRDigest(fs.readFileSync(path.join(root,relative)))),relative);const actual=cp.execFileSync('git',['ls-files','--stage','--',relative],{cwd:root,encoding:'utf8'}).trim();assert.equal(actual,`100644 ${binding.blobSha} 0\t${relative}`);}
});
test('literal_t14_layer_rejects_before_blob_alias_unknown_and_wrong_domain',async()=>{
 const p=await policy(),a=read(admissionPath),{processingBudgetT13SourceFiles}=await import('../processingBudgetAdmissionPolicy.mjs'),{gateRDiscoveryMainFiles}=await import('../gateRMainAdmissionPolicy.mjs');const base=processingBudgetT13SourceFiles();assert.equal(p.validateBoundedDocumentSourceAdmission(a),true);
 const before=structuredClone(a);before.sourceRows[0].beforeBlobSha='f'.repeat(40);assert.throws(()=>p.applyBoundedDocumentSourceAdmission(before,{domain:'processing_budget',baseFiles:base}),/literal/);
 const alias=structuredClone(a);alias.sourceRows[1]=alias.sourceRows[0];assert.throws(()=>p.validateBoundedDocumentSourceAdmission(alias),/alias|literal|order/);
 const unknown=structuredClone(a);unknown.sourceRows.push({path:'packages/processing-budget-runtime/src/unknown.ts',mode:'100644',beforeBlobSha:null,afterBlobSha:'e'.repeat(40),sourceItemIds:[]});assert.throws(()=>p.validateBoundedDocumentSourceAdmission(unknown),/literal/);
 assert.throws(()=>p.applyBoundedDocumentSourceAdmission(a,{domain:'processing_budget',baseFiles:gateRDiscoveryMainFiles()}),/domain|baseline/);assert.throws(()=>p.applyBoundedDocumentSourceAdmission(a,{domain:'arbitrary',baseFiles:base}),/domain/);
});
test('changed_extension_and_package_files_require_both_current_projections',async()=>{
 const {processingBudgetT14SourceFiles,processingBudgetT13SourceFiles}=await import('../processingBudgetAdmissionPolicy.mjs'),{gateRBoundedDocumentMainFiles,gateRDiscoveryMainFiles}=await import('../gateRMainAdmissionPolicy.mjs'),a=read(admissionPath);
 const current=[gateRBoundedDocumentMainFiles(),processingBudgetT14SourceFiles()];assert.ok(current[0].length>gateRDiscoveryMainFiles().length);assert.ok(current[1].length>processingBudgetT13SourceFiles().length);
 const maps=current.map(rows=>new Map(rows.map(row=>[row.path,row])));for(const row of [...a.sourceRows,...a.controlRows]){const expected={path:row.path,mode:row.mode,blobSha:row.afterBlobSha};assert.ok(maps.some(map=>JSON.stringify(map.get(row.path))===JSON.stringify(expected)),row.path);if(row.path.startsWith('extensions/'))assert.deepEqual(maps[0].get(row.path),expected);if(row.path.startsWith('packages/processing-budget-runtime/'))assert.deepEqual(maps[1].get(row.path),expected);}
});
function ownedFixture(){const parent=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t14-admission-parent-'));return createT14AdmissionFixture(parent);}

test('repository_rejects_unknown_runtime_alias_and_working_index_drift',async t=>{
 const p=await policy(),a=read(admissionPath);p.validateBoundedDocumentRepository(ownedFixture().root);
 for(const mode of ['unknown','runtime','working','index','alias']){const f=ownedFixture(t,a,p);p.validateBoundedDocumentRepository(f.root);const target=path.join(f.root,'packages/processing-budget-runtime/src/boundedDocumentIo.ts');
  if(mode==='unknown')fs.writeFileSync(path.join(path.dirname(target),'unknown.ts'),'export const unexpected=1;');
  if(mode==='runtime'){const dir=path.join(f.root,'packages/processing-budget-runtime/runtime');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'legacy.js'),'module.exports={}');}
  if(mode==='working')fs.appendFileSync(target,'\n// unexpected working drift\n');
  if(mode==='index'){const forged=cp.execFileSync('git',['hash-object','-w','--stdin'],{cwd:f.root,input:'forged',encoding:'utf8'}).trim();f.git('update-index','--cacheinfo','100644,'+forged+',packages/processing-budget-runtime/src/boundedDocumentIo.ts');}
  if(mode==='alias'){const source=path.dirname(target),retained=path.join(f.root,'retained-src');assert.ok(path.resolve(source).startsWith(f.root+path.sep)&&path.resolve(retained).startsWith(f.root+path.sep));fs.renameSync(source,retained);fs.symlinkSync(retained,source,process.platform==='win32'?'junction':'dir');}
  assert.throws(()=>p.validateBoundedDocumentRepository(f.root),/bounded document|alias|identity|inventory/i,mode);
 }
});
