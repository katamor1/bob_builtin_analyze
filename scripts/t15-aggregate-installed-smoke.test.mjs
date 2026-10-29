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
test('t15_artifacts_require_42_compiled_and_same_28_runtime_bytes',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs');
 const good=fixture(t);const previous=process.env.CI_VERIFIED_HEAD_SHA;process.env.CI_VERIFIED_HEAD_SHA='3'.repeat(40);
 try{const checked=await runner.validateArtifactManifest(good.manifest);assert.equal(checked.compiled.length,42);assert.equal(checked.fixtures.length,8);assert.equal(checked.archives.reduce((sum,item)=>sum+item.archive.entries.filter(row=>row.path.startsWith('extension/out/shared-processing-budget-runtime/')&&row.path.endsWith('.js')).length,0),28);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
 const wrong=structuredClone(good.manifest);wrong.extensions[0].vsix.sha256='0'.repeat(64);await assert.rejects(()=>runner.validateArtifactManifest(wrong),/artifact/);
 const missing=fixture(t,'index.js');await assert.rejects(()=>runner.validateArtifactManifest(missing.manifest),/artifact/);
 assert.throws(()=>runner.assertInstalledRuntimePaths(path.join(good.dir,'extension'),[path.join(root,'packages/processing-budget-runtime/out/index.js')]),/artifact/);
});
test('installed_smoke_guard_rejects_wrong_head_before_claiming_profile',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs'),good=fixture(t),manifestPath=path.join(good.dir,'manifest.json'),evidenceRoot=path.join(good.dir,'host-proof');fs.writeFileSync(manifestPath,JSON.stringify(good.manifest));const previous=process.env.CI_VERIFIED_HEAD_SHA;process.env.CI_VERIFIED_HEAD_SHA='3'.repeat(40);
 try{await assert.rejects(()=>runner.runInstalledSmoke(manifestPath,evidenceRoot),/checkout guard identity changed/);assert.equal(fs.existsSync(evidenceRoot),false);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
});
test('installed_smoke_rejects_windows_renderer_path_overflow_before_profile',{skip:process.platform!=='win32'},async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs'),good=fixture(t),manifestPath=path.join(good.dir,'manifest.json'),evidenceRoot=path.join(good.dir,'a'.repeat(230));fs.writeFileSync(manifestPath,JSON.stringify(good.manifest));const previous=process.env.CI_VERIFIED_HEAD_SHA;process.env.CI_VERIFIED_HEAD_SHA=good.manifest.sourceHeadSha;
 try{await assert.rejects(()=>runner.runInstalledSmoke(manifestPath,evidenceRoot),/Windows renderer path/);assert.equal(fs.existsSync(evidenceRoot),false);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
});
test('installed_runtime_guard_accepts_windows_drive_case_for_same_physical_file',{skip:process.platform!=='win32'},async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs'),good=fixture(t),extensionRoot=path.join(good.dir,'extension'),runtime=path.join(extensionRoot,'out/shared-processing-budget-runtime');fs.mkdirSync(runtime,{recursive:true});const file=path.join(runtime,'index.js');fs.writeFileSync(file,'module.exports={}');
 const lowerDrive=file.replace(/^[A-Z]:/,value=>value.toLowerCase());assert.doesNotThrow(()=>runner.assertInstalledRuntimePaths(extensionRoot,[lowerDrive]));
});
test('installed_gui_error_is_logged_once_and_queue_recovers',async t=>{
 const host=require('./t15-aggregate-installed-extension-host.test.js'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'bob-installed-gui-'));const extensionRoot=path.join(directory,'extension');
 fs.cpSync(path.join(root,'extensions/bob-bazaar-review/out'),path.join(extensionRoot,'out'),{recursive:true});
 fs.cpSync(path.join(root,'extensions/bob-bazaar-review/node_modules/js-yaml'),path.join(extensionRoot,'node_modules/js-yaml'),{recursive:true});
 const result=await host.runGuiProbe(extensionRoot,directory);assert.equal(result.guiLoggedOriginalErrorCount,1);assert.equal(result.nextQueuedOperationSucceeded,true);assert.ok(result.modulePath.startsWith(extensionRoot+path.sep));
});

test('installed_smoke_rejects_resigned_vsix_with_wrong_parser_version',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs'),bad=fixture(t,undefined,entries=>{entries['extension/node_modules/cheerio/package.json']=Buffer.from(JSON.stringify({name:'cheerio',version:'0.0.0',main:'./dist/commonjs/index.js'}));});
 await assert.rejects(()=>runner.validateArtifactManifest(bad.manifest),/parser/);
});
test('installed_smoke_rejects_resigned_vsix_with_same_version_parser_byte_change',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs'),bad=fixture(t,undefined,entries=>{entries['extension/node_modules/cheerio/package.json']??=Buffer.from(JSON.stringify({name:'cheerio',version:'1.2.0'}));const key='extension/node_modules/cheerio/dist/commonjs/index.js',bytes=Buffer.from(entries[key]??Buffer.from('module.exports={};'));bytes[0]^=1;entries[key]=bytes;});
 await assert.rejects(()=>runner.validateArtifactManifest(bad.manifest),/parser/);
});
test('installed_parser_resolution_rejects_repository_fallback',async t=>{
 const host=require('./t15-aggregate-installed-extension-host.test.js');assert.equal(typeof host.resolveInstalledParserEntries,'function');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bob-parser-fallback-'));const extension=path.join(directory,'extensions/local'),parser=path.join(directory,'node_modules/cheerio');fs.mkdirSync(extension,{recursive:true});fs.mkdirSync(parser,{recursive:true});fs.writeFileSync(path.join(parser,'package.json'),JSON.stringify({name:'cheerio',version:'1.2.0',main:'index.js'}));fs.writeFileSync(path.join(parser,'index.js'),'module.exports={}');
 assert.throws(()=>host.resolveInstalledParserEntries(extension,[{name:'cheerio',version:'1.2.0',specifier:'cheerio'}]),/parser.*(?:path|fallback|escape)/i);
});

test('t15_smoke_rejects_resigned_parser_changed_runtime_wrong_head_and_repo_fallback',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs');const changed=fixture(t,undefined,entries=>{entries['extension/out/shared-processing-budget-runtime/documentBudget.js']=Buffer.from('module.exports={forged:true}');});await assert.rejects(()=>runner.validateArtifactManifest(changed.manifest),/runtime hash mismatch/);const missing=fixture(t,'workbookBudget.js');await assert.rejects(()=>runner.validateArtifactManifest(missing.manifest),/runtime module/);
 const old=structuredClone(fixture(t).manifest);old.compiledModules=old.compiledModules.slice(0,36);await assert.rejects(()=>runner.validateArtifactManifest(old),/compiled inventory/);
});
test('t15_receipt_requires_all_seventeen_cases_and_actual_host_exit',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs'),good=fixture(t),prepared=await runner.prepareInstalledArtifacts(good.manifest,path.join(good.dir,'receipt-fixture')),hostProbe=require('./t15-aggregate-installed-extension-host.test.js');
 const required=['normal_docx','normal_xlsx','missing_both_xlsx','crc_rejected','oversize_rejected','mutation_discarded','locators_preserved','source_unchanged','installed_gui_error_is_logged_once_and_queue_recovers','document_count_rejected_before_io','raw_aggregate_counts_duplicate_selections','pre_cancelled_document_has_no_parser','sparse_xlsx_rejected_before_parser','unselected_sheet_budget_is_enforced','parser_await_cancellation_discards_result','ordinary_failure_warns_and_aggregate_failure_throws','source_admission_raw_is_charged_once'];
 const host={schemaVersion:'bob-builtin-analyze/t15-installed-host/v1',sourceHeadSha:good.manifest.sourceHeadSha,sourceTreeSha:good.manifest.sourceTreeSha,vscode:'1.106.1',state:'passed',productActivationProbe:'not_run',productDeactivationProbe:'not_run',cases:required.map(name=>({name,state:'passed'})),loadedModules:[],parserIdentities:[]};
 for(const extension of prepared.config.extensions){for(const moduleName of names){const file=path.join(extension.root,'out/shared-processing-budget-runtime',moduleName+'.js');host.loadedModules.push({extensionRoot:extension.root,moduleName,...binding(fs.readFileSync(file),file)});}host.parserIdentities.push(...hostProbe.resolveInstalledParserEntries(extension.root,extension.parsers));}
 const result=runner.validateInstalledHostReceipt(host,prepared.config,good.manifest,0);assert.deepEqual([result.cases.length,result.loadedModules.length,result.parserIdentities.length],[17,28,8]);
 assert.throws(()=>runner.validateInstalledHostReceipt(host,prepared.config,good.manifest,1),/native host/);const skipped=structuredClone(host);skipped.cases[16].state='skipped';assert.throws(()=>runner.validateInstalledHostReceipt(skipped,prepared.config,good.manifest,0),/native host/);const duplicate=structuredClone(host);duplicate.loadedModules[1]=duplicate.loadedModules[0];assert.throws(()=>runner.validateInstalledHostReceipt(duplicate,prepared.config,good.manifest,0),/module/);const fallback=structuredClone(host);fallback.loadedModules[0].path=path.join(root,'packages/processing-budget-runtime/out/index.js');assert.throws(()=>runner.validateInstalledHostReceipt(fallback,prepared.config,good.manifest,0),/artifact/);
});
test('installed_runtime_excludes_development_declarations_and_maps',async t=>{
 const runner=await import('./t15-aggregate-installed-smoke.mjs');for(const suffix of ['d.ts','js.map']){const known=fixture(t,undefined,entries=>{entries['extension/out/shared-processing-budget-runtime/documentBudget.'+suffix]=Buffer.from('module.exports={}\n');});await assert.rejects(()=>runner.validateArtifactManifest(known.manifest),/unknown installed runtime/);}const unknown=fixture(t,undefined,entries=>{entries['extension/out/shared-processing-budget-runtime/unknown.d.ts']=Buffer.from('unexpected');});await assert.rejects(()=>runner.validateArtifactManifest(unknown.manifest),/unknown installed runtime/);
});
