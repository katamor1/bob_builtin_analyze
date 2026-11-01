import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const names=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml','documentBudget','workbookBudget'];
const {expectedParserIdentities}=await import('./t14-bounded-document-installed-smoke.mjs');
const binding=(bytes,pathname)=>({path:pathname,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
function fixture(t,omit,alter){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bob-installed-contract-'));
 const compiledModules=names.flatMap(name=>['js','d.ts','js.map'].map(suffix=>binding(Buffer.from('module.exports={}\n'),name+'.'+suffix))).sort((a,b)=>a.path.localeCompare(b.path));
 const {zipSync}=createRequire(path.join(root,'packages/processing-budget-runtime/package.json'))('fflate');
 const extensions=['bob-bazaar-review','bob-code-consistency-review'].map(name=>{
  const entries={'extension/package.json':Buffer.from(JSON.stringify({name,publisher:'local',version:'0.0.0',main:'./out/extension.js'})),'extension/out/extension.js':Buffer.from('exports.activate=()=>{};')};
  for(const row of compiledModules.filter(x=>x.path.endsWith('.js')))if(row.path!==omit)entries['extension/out/shared-processing-budget-runtime/'+row.path]=Buffer.from('module.exports={}\n');
  entries['extension/out/shared-processing-budget-runtime/manifest.json']=Buffer.from(JSON.stringify({schemaVersion:'bob-builtin-analyze/processing-runtime-copy/v1',sourceInputDigest:'a'.repeat(64),payload:compiledModules}));
  for(const parser of expectedParserIdentities('local.'+name))for(const file of parser.payload)entries['extension/'+file.path]=fs.readFileSync(path.join(root,'extensions',name,file.path));
  if(alter)alter(entries,name);
  const bytes=Buffer.from(zipSync(entries)),file=path.join(dir,name+'.vsix');fs.writeFileSync(file,bytes);return{id:'local.'+name,vsix:binding(bytes,file)};
 });
 const fixtures=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md','legacy.doc','sparse.xlsx','unselected-over-budget.xlsx'].map(name=>{const bytes=Buffer.from('fixture'),file=path.join(dir,name);fs.writeFileSync(file,bytes);return{name,...binding(bytes,file)};});
 return{dir,manifest:{schemaVersion:'bob-builtin-analyze/t15-installed-artifacts/v1',sourceHeadSha:'1'.repeat(40),sourceTreeSha:'2'.repeat(40),compiledModules,extensions,fixtures}};
}

const supplementalNames=['review-input.yaml','diff-fixture.json'];
function t16Fixture(t,alter){
 const f=fixture(t,undefined,alter),baselinePath=path.join(f.dir,'baseline.json');fs.writeFileSync(baselinePath,JSON.stringify(f.manifest));
 const supplementalFixtures=supplementalNames.map(name=>{const bytes=Buffer.from('{}\n'),file=path.join(f.dir,name);fs.writeFileSync(file,bytes);return{name,...binding(bytes,file)};});
 return{...f,baseline:f.manifest,manifest:{schemaVersion:'bob-builtin-analyze/t16-installed-artifacts/v1',sourceHeadSha:f.manifest.sourceHeadSha,sourceTreeSha:f.manifest.sourceTreeSha,baselineManifest:binding(fs.readFileSync(baselinePath),baselinePath),supplementalFixtures}};
}
const additional=['shared_operation_all_input_stages','independent_stdout_stderr_exact','stdout_overflow_waits_for_child_exit','git_overflow_preserves_complete_metadata','excerpt_parent_budget_is_fatal','mandatory_bob_metadata_survives_clipping','artifact_failure_releases_pending','utf8_package_bytes_and_unmanaged_file_are_preserved'];
const baselineCases=['normal_docx','normal_xlsx','missing_both_xlsx','crc_rejected','oversize_rejected','mutation_discarded','locators_preserved','source_unchanged','installed_gui_error_is_logged_once_and_queue_recovers','document_count_rejected_before_io','raw_aggregate_counts_duplicate_selections','pre_cancelled_document_has_no_parser','sparse_xlsx_rejected_before_parser','unselected_sheet_budget_is_enforced','parser_await_cancellation_discards_result','ordinary_failure_warns_and_aggregate_failure_throws','source_admission_raw_is_charged_once'];

test('t16_reuses_bound_t15_artifacts_without_source_fallback',async t=>{
 const runner=await import('./t16-input-process-installed-smoke.mjs'),f=t16Fixture(t),checked=await runner.validateArtifactManifest(f.manifest);assert.equal(checked.baseline.compiled.length,42);assert.equal(checked.baseline.fixtures.length,8);assert.equal(checked.fixtures.length,2);
 const wrong=structuredClone(f.manifest);wrong.baselineManifest.sha256='0'.repeat(64);await assert.rejects(()=>runner.validateArtifactManifest(wrong),/artifact/);assert.throws(()=>runner.assertInstalledRuntimePaths(f.dir,[path.join(root,'packages/processing-budget-runtime/out/index.js')]),/artifact/);
});

test('t16_requires_twentyfive_real_cases_and_baseline_receipt',async t=>{
 const runner=await import('./t16-input-process-installed-smoke.mjs'),baselineRunner=await import('./t15-aggregate-installed-smoke.mjs'),f=t16Fixture(t),prepared=await baselineRunner.prepareInstalledArtifacts(f.baseline,path.join(f.dir,'proof')),probe=require('./t15-aggregate-installed-extension-host.test.js');
 const base={schemaVersion:'bob-builtin-analyze/t15-installed-host/v1',sourceHeadSha:f.manifest.sourceHeadSha,sourceTreeSha:f.manifest.sourceTreeSha,vscode:'1.106.1',node:process.version,state:'passed',productActivationProbe:'not_run',productDeactivationProbe:'not_run',cases:baselineCases.map(name=>({name,state:'passed'})),loadedModules:[],parserIdentities:[]};
 for(const extension of prepared.config.extensions){for(const moduleName of names){const file=path.join(extension.root,'out/shared-processing-budget-runtime',moduleName+'.js');base.loadedModules.push({extensionRoot:extension.root,moduleName,...binding(fs.readFileSync(file),file)});}base.parserIdentities.push(...probe.resolveInstalledParserEntries(extension.root,extension.parsers));}
 fs.writeFileSync(prepared.config.hostReceiptPath,JSON.stringify(base));
 const config={sourceHeadSha:f.manifest.sourceHeadSha,sourceTreeSha:f.manifest.sourceTreeSha,baselineConfigPath:path.join(prepared.probeRoot,'config.json'),baselineHostReceiptPath:prepared.config.hostReceiptPath,hostReceiptPath:path.join(prepared.root,'logs/t16-host-receipt.json'),supplementalFixtures:f.manifest.supplementalFixtures};
 const host={...structuredClone(base),schemaVersion:'bob-builtin-analyze/t16-installed-host/v1',cases:[...base.cases,...additional.map(name=>({name,state:'passed'}))]};
 const good=await runner.validateInstalledHostReceipt(host,config,f.manifest,0);assert.deepEqual([good.cases.length,good.loadedModules.length,good.parserIdentities.length],[25,28,8]);
 for(const mutate of [h=>h.cases.pop(),h=>h.cases[18].state='failed',h=>h.sourceHeadSha='0'.repeat(40),h=>h.unknown=true,h=>h.loadedModules[0].path=path.join(root,'packages/processing-budget-runtime/out/index.js')]){const bad=structuredClone(host);mutate(bad);await assert.rejects(()=>runner.validateInstalledHostReceipt(bad,config,f.manifest,0),/artifact/);}
 await assert.rejects(()=>runner.validateInstalledHostReceipt(host,config,f.manifest,1),/artifact/);fs.unlinkSync(config.baselineHostReceiptPath);await assert.rejects(()=>runner.validateInstalledHostReceipt(host,config,f.manifest,0));
});

test('t16_rejects_wrong_head_resigned_parser_missing_case_and_unknown_field',async t=>{
 const runner=await import('./t16-input-process-installed-smoke.mjs'),f=t16Fixture(t),previous=process.env.CI_VERIFIED_HEAD_SHA,file=path.join(f.dir,'t16.json'),proof=path.join(f.dir,'never-claimed');fs.writeFileSync(file,JSON.stringify(f.manifest));process.env.CI_VERIFIED_HEAD_SHA='0'.repeat(40);
 try{await assert.rejects(()=>runner.runInstalledSmoke(file,proof),/checkout guard/);assert.equal(fs.existsSync(proof),false);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
 const bad=structuredClone(f.manifest);bad.unknown=true;await assert.rejects(()=>runner.validateArtifactManifest(bad),/closed/);const wrong=structuredClone(f.manifest);wrong.sourceTreeSha='0'.repeat(40);await assert.rejects(()=>runner.validateArtifactManifest(wrong),/subject/);
 const parser=t16Fixture(t,entries=>{entries['extension/node_modules/cheerio/package.json']=Buffer.from(JSON.stringify({name:'cheerio',version:'0.0.0'}));});await assert.rejects(()=>runner.validateArtifactManifest(parser.manifest),/parser/);
});
