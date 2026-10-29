import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import cp from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {gateRDigest} from '../gateRData.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..'),base='a826dc20c0e71f472401adf644ca8cc777b74c58';
const admissionPath='tools/main-consolidation/aggregate-document-source-admission.json',coveragePath='docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json';
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const policy=()=>import('../aggregateDocumentAdmissionPolicy.mjs');
const parent=()=>fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t15-admission-test-'));
test('exact_30_items_and_complete_675_partition_preserve_owner_origins',async()=>{
 const p=await policy(),coverage=read(coveragePath),universe=read('tools/main-consolidation/feature-selection-source-universe.json');assert.equal(p.validateAggregateDocumentCoverage(coverage),true);assert.deepEqual([coverage.items.length,coverage.remainderClosure.total,coverage.remainderClosure.unassigned],[30,675,0]);assert.equal(new Set(coverage.items.map(item=>item.origin.path)).size,25);assert.equal(new Set(coverage.items.map(item=>item.origin.blobSha)).size,23);
 const spec=fs.readFileSync(path.join(root,'docs/superpowers/specs/2026-10-26-proc-t15-aggregate-design.md'),'utf8'),ids=[...spec.matchAll(/^\| `(source-[a-f0-9]{24})` \|/gm)].map(match=>match[1]);assert.deepEqual(coverage.items.map(item=>item.sourceItemId),ids);assert.deepEqual(coverage.remainderClosure.items.map(item=>item.sourceItemId),universe.items.map(item=>item.sourceItemId));
 const checked=new Set();for(const item of coverage.items){const original=universe.items.find(row=>row.sourceItemId===item.sourceItemId);assert.equal(original.primaryOwner,'PROC-T15-AGGREGATE');assert.ok(original.origins.some(origin=>origin.commitSha===item.origin.commitSha&&origin.blobSha===item.origin.blobSha&&origin.path===item.origin.path));assert.equal(item.origin.commitSha,'7fc7a371e6506290d8626d06e9b12c2a67888b47');assert.match(item.origin.path,/^(?:packages\/processing-budget-runtime|extensions\/bob-(?:bazaar-review|code-consistency-review))\//);
  if(!checked.has(item.origin.blobSha)){const bytes=cp.execFileSync('git',['show',item.origin.commitSha+':'+item.origin.path],{cwd:root,maxBuffer:4*1024*1024}),blob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');assert.equal(blob,item.origin.blobSha);checked.add(blob);}
  assert.ok(item.targets.length>0);assert.ok(item.testPaths.length>0);assert.ok(item.testCases.length>0);for(const check of item.testCases)assert.ok(fs.readFileSync(path.join(root,check.path),'utf8').includes(check.name),check.name);
 }
 const missing=structuredClone(coverage);missing.items.pop();assert.throws(()=>p.validateAggregateDocumentCoverage(missing),/literal|coverage/);const wrongOwner=structuredClone(coverage);wrongOwner.remainderClosure.items[1].primaryOwner='PROC-T16-INPUT-PROCESS';assert.throws(()=>p.validateAggregateDocumentCoverage(wrongOwner),/literal|coverage/);
});
test('t15_layer_requires_exact_t14_before_and_separate_domains',async()=>{
 const p=await policy(),admission=read(admissionPath),processing=await import('../processingBudgetAdmissionPolicy.mjs'),shipping=await import('../gateRMainAdmissionPolicy.mjs');assert.equal(p.validateAggregateDocumentSourceAdmission(admission),true);assert.equal(processing.processingBudgetT13SourceFiles().length,28);
 const before=processing.processingBudgetT14SourceFiles(),gateBefore=shipping.gateRBoundedDocumentMainFiles(),current=[shipping.gateRCurrentMainFiles(),processing.processingBudgetCurrentSourceFiles()];assert.deepEqual(current[0],p.applyAggregateDocumentSourceAdmission(admission,{domain:'gate_r_shipping',baseFiles:gateBefore}));assert.deepEqual(current[1],p.applyAggregateDocumentSourceAdmission(admission,{domain:'processing_budget',baseFiles:before}));
 for(const row of [...admission.sourceRows,...admission.controlRows]){const expected={path:row.path,mode:row.mode,blobSha:row.afterBlobSha};assert.ok(current.some(rows=>JSON.stringify(rows.find(item=>item.path===row.path))===JSON.stringify(expected)),row.path);if(row.path.startsWith('extensions/'))assert.deepEqual(current[0].find(item=>item.path===row.path),expected);if(row.path.startsWith('packages/processing-budget-runtime/'))assert.deepEqual(current[1].find(item=>item.path===row.path),expected);}
 const wrong=structuredClone(admission);wrong.sourceRows[0].beforeBlobSha='f'.repeat(40);assert.throws(()=>p.applyAggregateDocumentSourceAdmission(wrong,{domain:'processing_budget',baseFiles:before}),/literal/);const unknown=structuredClone(admission);unknown.sourceRows.push({...unknown.sourceRows[0],sourceItemIds:unknown.sourceRows[0].sourceItemIds.slice(),path:'packages/processing-budget-runtime/src/unknown.ts'});assert.throws(()=>p.validateAggregateDocumentSourceAdmission(unknown),/literal|order/);assert.throws(()=>p.applyAggregateDocumentSourceAdmission(admission,{domain:'processing_budget',baseFiles:gateBefore}),/baseline|domain/);assert.throws(()=>p.applyAggregateDocumentSourceAdmission(admission,{domain:'arbitrary',baseFiles:before}),/domain/);
});
test('current_union_rejects_unknown_alias_working_index_drift',async()=>{
 const p=await policy(),{createAggregateAdmissionFixture}=await import('./helpers/aggregateAdmissionFixture.mjs');p.validateAggregateDocumentRepository(root);
 for(const mode of ['unknown','runtime','working','index','alias']){const fixture=createAggregateAdmissionFixture(parent());p.validateAggregateDocumentRepository(fixture.root);const target=path.join(fixture.root,'packages/processing-budget-runtime/src/documentBudget.ts');
  if(mode==='unknown')fs.writeFileSync(path.join(path.dirname(target),'unknown.ts'),'export const unexpected=1;');
  if(mode==='runtime'){const dir=path.join(fixture.root,'packages/processing-budget-runtime/runtime');fs.mkdirSync(dir);fs.writeFileSync(path.join(dir,'legacy.js'),'module.exports={}');}
  if(mode==='working')fs.appendFileSync(target,'\n// working drift\n');
  if(mode==='index'){const forged=cp.execFileSync('git',['hash-object','-w','--stdin'],{cwd:fixture.root,input:'forged',encoding:'utf8'}).trim();fixture.git('update-index','--cacheinfo','100644,'+forged+',packages/processing-budget-runtime/src/documentBudget.ts');}
  if(mode==='alias'){const source=path.dirname(target),retained=path.join(fixture.root,'retained-src');assert.ok(path.resolve(source).startsWith(fixture.root+path.sep)&&path.resolve(retained).startsWith(fixture.root+path.sep));fs.renameSync(source,retained);fs.symlinkSync(retained,source,process.platform==='win32'?'junction':'dir');}
  assert.throws(()=>p.validateAggregateDocumentRepository(fixture.root),/aggregate document|alias|identity|inventory/i,mode);
 }
});
test('old_t13_t14_historical_validators_and_raw_bindings_remain_strict',async()=>{
 const p=await policy(),old=await import('../boundedDocumentAdmissionPolicy.mjs'),{createT14AdmissionFixture}=await import('./helpers/aggregateAdmissionFixture.mjs'),fixture=createT14AdmissionFixture(parent());old.validateBoundedDocumentRepository(fixture.root);assert.throws(()=>old.validateBoundedDocumentRepository(root),/bounded document|identity/);
 for(const [relative,binding]of Object.entries(p.AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS)){assert.ok(binding.rawSha256.includes(gateRDigest(fs.readFileSync(path.join(root,relative)))),relative);const actual=cp.execFileSync('git',['ls-files','--stage','--',relative],{cwd:root,encoding:'utf8'}).trim();assert.equal(actual,`100644 ${binding.blobSha} 0\t${relative}`);}
 assert.equal(gateRDigest(fs.readFileSync(path.join(root,'tools/main-consolidation/registry-bridge-source-admission.json'))),'1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4');
 const oldStatus=JSON.parse(cp.execFileSync('git',['show',base+':docs/release-evidence/feature-integration-status.json'],{cwd:root,encoding:'utf8',maxBuffer:2*1024*1024}));assert.deepEqual([oldStatus.completionReferences.length,oldStatus.slices.filter(row=>row.state==='VERIFIED').length,oldStatus.nextSliceId],[14,12,'PROC-T15-AGGREGATE']);const current=read('docs/release-evidence/feature-integration-status.json');assert.deepEqual(current.completionReferences.slice(0,14),oldStatus.completionReferences);if(!current.completionReferences.some(row=>row.boundaryId==='PROC-T15-AGGREGATE'))assert.deepEqual([current.completionReferences.length,current.slices.filter(row=>row.state==='VERIFIED').length,current.nextSliceId],[14,12,'PROC-T15-AGGREGATE']);
});
test('future_completion_and_current_coverage_are_literal_lf',async()=>{
 const p=await policy(),attributes=fs.readFileSync(path.join(root,'.gitattributes'),'utf8');for(const relative of [coveragePath,admissionPath,'docs/release-evidence/proc-t15-aggregate-completion-2026-10-26.json'])assert.ok(attributes.split(/\r?\n/).includes(relative+' text eol=lf'),relative);for(const relative of [coveragePath,admissionPath])assert.equal(fs.readFileSync(path.join(root,relative)).includes(13),false);assert.equal(p.validateAggregateDocumentSourceAdmission(read(admissionPath)),true);
});
test('t15_ci_executes_current_and_historical_admission_cases',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/processing-budget-runtime.yml'),'utf8'),command=workflow.split(/\r?\n/).find(line=>line.includes('run: node --test tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs'));assert.ok(command);assert.ok(command.includes(" --test-concurrency=1"));for(const name of ['processingBudgetAdmissionPolicy','aggregateDocumentAdmissionPolicy','boundedDocumentAdmissionPolicy','gateRMainAdmissionPolicy'])assert.ok(command.includes('tools/main-consolidation/test/'+name+'.test.mjs'),name);
});
test('owned_fixture_git_object_retry_is_bounded_and_keeps_other_failures',async()=>{
 const {stageAdmissionFixtureIndex}=await import('./helpers/aggregateAdmissionFixture.mjs');const temporary=Object.assign(new Error('owned temporary object sharing'),{status:128,stderr:'error: unable to write file .git/objects/ab/'+ 'c'.repeat(38)+': Permission denied\nfatal: adding files failed\n'});let calls=0;const once=()=>{calls++;if(calls===1)throw temporary;return 'indexed';};if(process.platform==='win32'){assert.equal(stageAdmissionFixtureIndex(once),'indexed');assert.equal(calls,2);}else{assert.throws(()=>stageAdmissionFixtureIndex(once),error=>error===temporary);assert.equal(calls,1);}
 const unrelated=Object.assign(new Error('different git failure'),{status:128,stderr:'fatal: invalid index state'});calls=0;assert.throws(()=>stageAdmissionFixtureIndex(()=>{calls++;throw unrelated;}),error=>error===unrelated);assert.equal(calls,1);calls=0;assert.throws(()=>stageAdmissionFixtureIndex(()=>{calls++;throw temporary;}),error=>error===temporary);assert.equal(calls,process.platform==='win32'?2:1);
});
test('ci_fetches_exact_m2_and_archived_origin_for_real_blob_checks',()=>{
 const workflow=fs.readFileSync(path.join(root,'.github/workflows/processing-budget-runtime.yml'),'utf8');for(const sha of [base,'7fc7a371e6506290d8626d06e9b12c2a67888b47'])assert.ok(workflow.includes('git fetch --no-tags --depth=1 --no-write-fetch-head origin '+sha),sha);assert.ok(workflow.indexOf('Fetch immutable admission subjects')<workflow.indexOf('Test standalone package and installed consumers'));assert.ok(workflow.indexOf('run: node scripts/verify-ci-head.js')<workflow.indexOf('Fetch immutable admission subjects'));
});
