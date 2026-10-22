import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(import.meta.url);
const policyPath=new URL('../processingBudgetAdmissionPolicy.mjs',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
test('t13_admission_is_literal_and_preserves_full_675_partition',async()=>{
 const p=await import(policyPath);
 const admission=read('tools/main-consolidation/processing-budget-source-admission.json'),coverage=read('docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json');
 assert.equal(p.validateProcessingBudgetCoverage(coverage),true);assert.equal(p.validateProcessingBudgetSourceAdmission(admission),true);
 assert.equal(coverage.items.length,23);assert.equal(coverage.remainderClosure.total,675);assert.equal(coverage.remainderClosure.items.length,675);assert.equal(coverage.remainderClosure.unassigned,0);
 assert.equal(p.PROCESSING_BUDGET_T13_SOURCE_PATHS.length,23);assert.equal(p.PROCESSING_BUDGET_CONTROL_PATHS.length,7);
 assert.equal(p.processingBudgetT13SourceFiles().length,28);assert.deepEqual(p.processingBudgetCurrentSourceFiles(),p.processingBudgetT13SourceFiles());
 for(const change of [a=>a.sourceRows.push({...a.sourceRows[0],path:'packages/processing-budget-runtime/extra.ts'}),a=>a.sourceRows[0].mode='120000',a=>a.sourceRows[0].afterBlobSha='0'.repeat(40),a=>a.sourceRows[0].path='../alias',a=>a.baseMainSha='90f926e0045405625f1f40d20a41346a94d1981a']){const a=structuredClone(admission);change(a);assert.throws(()=>p.validateProcessingBudgetSourceAdmission(a));}
 const bad=structuredClone(coverage);bad.remainderClosure.items.pop();assert.throws(()=>p.validateProcessingBudgetCoverage(bad));
 p.validateProcessingBudgetRepository(root);
 for(const baseline of ['tools/main-consolidation/registry-bridge-source-admission.json','tools/main-consolidation/registry-discovery-source-admission.json']){
  const fixture=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'bob-processing-budget-ledger-baseline-'));
  for(const file of p.PROCESSING_BUDGET_BASELINE_PATHS){fs.mkdirSync(path.dirname(path.join(fixture,file)),{recursive:true});fs.copyFileSync(path.join(root,file),path.join(fixture,file));}
  fs.appendFileSync(path.join(fixture,baseline),' ');assert.throws(()=>p.validateProcessingBudgetRepository(fixture),/baseline/);
 }
});
test('current_bazaar_actual_export_matches_explicit_profile',()=>{
 const {DEFAULT_RULE_AUTHORING_LIMITS:b}=require(path.join(root,'extensions/bob-bazaar-review/out/ruleAuthoring/ruleAuthoringLimits.js'));
 const {normalizeProcessingBudgetProfile:n}=require(path.join(root,'packages/processing-budget-runtime/out/index.js'));
 const p=n({limits:{document_count:b.maxSourceFiles,single_document_bytes:b.maxSourceBytes,total_document_bytes:b.maxAggregateSourceBytes,total_operation_input_bytes:268435456}});
 assert.equal(p.limits.document_count,20);assert.equal(p.limits.single_document_bytes,26214400);assert.equal(p.limits.total_document_bytes,104857600);
 assert.deepEqual(b,{maxSourceFiles:20,maxSourceBytes:26214400,maxAggregateSourceBytes:104857600,maxChunkBytes:32768,maxSourceIndexBytes:1048576,maxSelectedEvidenceBytes:1048576,maxProposalBytes:1048576,maxPdfOutputBytes:33554432,maxOoxmlEntries:5000,maxOoxmlDeclaredUncompressedBytes:262144000,maxRuleOperations:200,maxProjectContextOperations:100,maxPromptAddendumOperations:100,maxProjectContextBytes:262144,maxPromptAddendumBytes:262144});
});
test('five_workflow_contract_preserves_original_sixteen_jobs',()=>{
 const baseline={"schemaVersion":"bob-builtin-analyze/exact-head-ci-contract/v1","repository":"katamor1/bob_builtin_analyze","verificationStep":"Verify checked-out commit","dispatch":{"requiredInputs":["expectedHeadSha","dispatchNonce"],"runName":"wave0a-{expectedHeadSha}-{dispatchNonce}","headShaPattern":"^[0-9a-f]{40}$","noncePattern":"^[0-9a-f]{32}$","triggerShaMustEqualExpectedHead":true},"workflows":[{"id":"extensions-quality","path":".github/workflows/extensions-quality.yml","jobs":[{"name":"workflow-register","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"bob-bazaar-review","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"bob-code-consistency-review","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Windows / workflow-register","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Windows / bob-bazaar-review","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Windows / bob-code-consistency-review","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Real-machine environment contracts","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Extension source metrics","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"skipped"},{"name":"Workflow evidence subject","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Workflow evidence / ubuntu-latest","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Workflow evidence / windows-latest","runner":"windows-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Workflow evidence byte parity","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"}]},{"id":"workflow-contracts","path":".github/workflows/workflow-contracts.yml","jobs":[{"name":"Strict workflow validation","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"}]},{"id":"code-consistency-review-scaffold","path":".github/workflows/code-consistency-review-scaffold.yml","jobs":[{"name":"Validate scaffold","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"},{"name":"Validate VS Code extension","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"}]},{"id":"three-extension-ui-contracts","path":".github/workflows/three-extension-ui-contracts.yml","jobs":[{"name":"UI and documentation contracts","runner":"ubuntu-latest","pullRequest":"success","workflowDispatch":"success"}]}]};
 const c=read('tools/main-consolidation/exact-head-ci-contract.json');assert.deepEqual(c.workflows.slice(0,4),baseline.workflows);assert.equal(c.workflows.flatMap(x=>x.jobs).length,18);
 assert.deepEqual(c.workflows[4],{id:'processing-budget-runtime',path:'.github/workflows/processing-budget-runtime.yml',jobs:[{name:'Processing budget / ubuntu-latest',runner:'ubuntu-latest',pullRequest:'success',workflowDispatch:'success'},{name:'Processing budget / windows-latest',runner:'windows-latest',pullRequest:'success',workflowDispatch:'success'}]});
});
test('processing_matrix_builds_actual_parity_inputs_before_tests',()=>{
 const y=fs.readFileSync(path.join(root,'.github/workflows/processing-budget-runtime.yml'),'utf8');
 const guard=y.indexOf('- name: Verify checked-out commit'),setup=y.indexOf('- name: Setup Node.js'),install=y.indexOf('npm ci'),bazaar=y.indexOf('npm ci --prefix extensions/bob-bazaar-review'),compile=y.indexOf('npm run compile --prefix extensions/bob-bazaar-review'),parity=y.indexOf('node --test tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs');
 assert.ok(guard>0&&setup>guard&&install>setup&&bazaar>install&&compile>bazaar&&parity>compile);
 assert.match(y,/timeout-minutes: 10/);assert.match(y,/contents: read/);assert.match(y,/os: \[ubuntu-latest, windows-latest\]/);assert.match(y,/CI_VERIFIED_HEAD_SHA/);assert.doesNotMatch(y,/continue-on-error|\|\|\s*true/);
});
