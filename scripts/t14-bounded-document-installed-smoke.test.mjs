import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url);
const names=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml'];
const binding=(bytes,pathname)=>({path:pathname,bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
function fixture(t,omit){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bob-installed-contract-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const compiledModules=names.flatMap(name=>['js','d.ts','js.map'].map(suffix=>binding(Buffer.from('module.exports={}\n'),name+'.'+suffix))).sort((a,b)=>a.path.localeCompare(b.path));
 const {zipSync}=createRequire(path.join(root,'packages/processing-budget-runtime/package.json'))('fflate');
 const extensions=['bob-bazaar-review','bob-code-consistency-review'].map(name=>{
  const entries={'extension/package.json':Buffer.from(JSON.stringify({name,publisher:'local',version:'0.0.0',main:'./out/extension.js'})),'extension/out/extension.js':Buffer.from('exports.activate=()=>{};')};
  for(const row of compiledModules.filter(x=>x.path.endsWith('.js')))if(row.path!==omit)entries['extension/out/shared-processing-budget-runtime/'+row.path]=Buffer.from('module.exports={}\n');
  entries['extension/out/shared-processing-budget-runtime/manifest.json']=Buffer.from(JSON.stringify({schemaVersion:'bob-builtin-analyze/processing-runtime-copy/v1',sourceInputDigest:'a'.repeat(64),payload:compiledModules}));
  const bytes=Buffer.from(zipSync(entries)),file=path.join(dir,name+'.vsix');fs.writeFileSync(file,bytes);return{id:'local.'+name,vsix:binding(bytes,file)};
 });
 const fixtures=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md'].map(name=>{const bytes=Buffer.from('fixture'),file=path.join(dir,name);fs.writeFileSync(file,bytes);return{name,...binding(bytes,file)};});
 return{dir,manifest:{schemaVersion:'bob-builtin-analyze/t14-installed-artifacts/v1',sourceHeadSha:'1'.repeat(40),sourceTreeSha:'2'.repeat(40),compiledModules,extensions,fixtures}};
}
test('installed_smoke_rejects_wrong_hash_missing_module_and_repo_fallback',async t=>{
 const runner=await import('./t14-bounded-document-installed-smoke.mjs');
 const good=fixture(t);const previous=process.env.CI_VERIFIED_HEAD_SHA;process.env.CI_VERIFIED_HEAD_SHA='3'.repeat(40);
 try{await runner.validateArtifactManifest(good.manifest);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
 const wrong=structuredClone(good.manifest);wrong.extensions[0].vsix.sha256='0'.repeat(64);await assert.rejects(()=>runner.validateArtifactManifest(wrong),/artifact/);
 const missing=fixture(t,'index.js');await assert.rejects(()=>runner.validateArtifactManifest(missing.manifest),/artifact/);
 assert.throws(()=>runner.assertInstalledRuntimePaths(path.join(good.dir,'extension'),[path.join(root,'packages/processing-budget-runtime/out/index.js')]),/artifact/);
});
test('installed_smoke_guard_rejects_wrong_head_before_claiming_profile',async t=>{
 const runner=await import('./t14-bounded-document-installed-smoke.mjs'),good=fixture(t),manifestPath=path.join(good.dir,'manifest.json'),evidenceRoot=path.join(good.dir,'host-proof');fs.writeFileSync(manifestPath,JSON.stringify(good.manifest));const previous=process.env.CI_VERIFIED_HEAD_SHA;process.env.CI_VERIFIED_HEAD_SHA='3'.repeat(40);
 try{await assert.rejects(()=>runner.runInstalledSmoke(manifestPath,evidenceRoot),/checkout guard identity changed/);assert.equal(fs.existsSync(evidenceRoot),false);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
});
test('installed_smoke_rejects_windows_renderer_path_overflow_before_profile',{skip:process.platform!=='win32'},async t=>{
 const runner=await import('./t14-bounded-document-installed-smoke.mjs'),good=fixture(t),manifestPath=path.join(good.dir,'manifest.json'),evidenceRoot=path.join(good.dir,'a'.repeat(230));fs.writeFileSync(manifestPath,JSON.stringify(good.manifest));const previous=process.env.CI_VERIFIED_HEAD_SHA;process.env.CI_VERIFIED_HEAD_SHA=good.manifest.sourceHeadSha;
 try{await assert.rejects(()=>runner.runInstalledSmoke(manifestPath,evidenceRoot),/Windows renderer path/);assert.equal(fs.existsSync(evidenceRoot),false);}finally{if(previous===undefined)delete process.env.CI_VERIFIED_HEAD_SHA;else process.env.CI_VERIFIED_HEAD_SHA=previous;}
});
test('installed_runtime_guard_accepts_windows_drive_case_for_same_physical_file',{skip:process.platform!=='win32'},async t=>{
 const runner=await import('./t14-bounded-document-installed-smoke.mjs'),good=fixture(t),extensionRoot=path.join(good.dir,'extension'),runtime=path.join(extensionRoot,'out/shared-processing-budget-runtime');fs.mkdirSync(runtime,{recursive:true});const file=path.join(runtime,'index.js');fs.writeFileSync(file,'module.exports={}');
 const lowerDrive=file.replace(/^[A-Z]:/,value=>value.toLowerCase());assert.doesNotThrow(()=>runner.assertInstalledRuntimePaths(extensionRoot,[lowerDrive]));
});
test('installed_gui_error_is_logged_once_and_queue_recovers',async t=>{
 const host=require('./t14-bounded-document-installed-extension-host.test.js'),directory=fs.mkdtempSync(path.join(os.tmpdir(),'bob-installed-gui-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const extensionRoot=path.join(directory,'extension');
 fs.cpSync(path.join(root,'extensions/bob-bazaar-review/out'),path.join(extensionRoot,'out'),{recursive:true});
 fs.cpSync(path.join(root,'extensions/bob-bazaar-review/node_modules/js-yaml'),path.join(extensionRoot,'node_modules/js-yaml'),{recursive:true});
 const result=await host.runGuiProbe(extensionRoot,directory);assert.equal(result.guiLoggedOriginalErrorCount,1);assert.equal(result.nextQueuedOperationSucceeded,true);assert.ok(result.modulePath.startsWith(extensionRoot+path.sep));
});
