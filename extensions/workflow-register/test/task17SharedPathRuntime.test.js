'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('workflow_register_ships_only_canonical_path_runtime',()=>{
 const entry=path.join(root,'out/sharedProcessingBudgetRuntime.js');
 assert.ok(fs.existsSync(entry),'Workflow must ship a verified path-only facade');
 const runtime=path.join(root,'out/shared-processing-budget-runtime'),m=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json')));
 assert.equal(m.schemaVersion,'bob-builtin-analyze/processing-runtime-path-copy/v1');assert.equal(m.profile,'path-only');
 assert.deepEqual(m.payload.map(r=>r.path),['pathPolicy.d.ts','pathPolicy.js','pathPolicy.js.map']);
 const r=require(entry);assert.equal(r.normalizeWorkspaceRelativePath('日本語 docs/file.md'),'日本語 docs/file.md');assert.equal(r.ProcessingBudgetLedger,undefined);assert.equal(r.createCancellationScope,undefined);
 assert.equal(fs.existsSync(path.join(runtime,'index.js')),false);assert.equal(fs.existsSync(path.join(runtime,'deadlineCancellation.js')),false);
});
test('workflow_path_source_boundary_rejects_broad_runtime_imports',()=>{
 const file=path.join(root,'scripts/check-processing-path-boundary.js');assert.ok(fs.existsSync(file),'path capability boundary must exist');
 const checker=require(file);assert.doesNotThrow(()=>checker.checkProcessingPathBoundary(root));
});

test('workflow_boundary_rejects_ledger_import_loader_change_and_import_effect',()=>{
 const checker=require(path.join(root,'scripts/check-processing-path-boundary.js'));
 const base=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'bob-workflow-path-boundary-')),copyRoot=path.join(base,'extensions/workflow-register'),p=path.join(base,'packages/processing-budget-runtime/src');
 fs.cpSync(path.join(root,'src'),path.join(copyRoot,'src'),{recursive:true});fs.mkdirSync(p,{recursive:true});
 const canonical=path.resolve(root,'../../packages/processing-budget-runtime/src/pathPolicy.ts'),leaf=path.join(p,'pathPolicy.ts'),leafText=fs.readFileSync(canonical,'utf8');
 fs.writeFileSync(leaf,leafText);assert.doesNotThrow(()=>checker.checkProcessingPathBoundary(copyRoot));
 const extra=path.join(copyRoot,'src/unsafe.ts');fs.writeFileSync(extra,'import { ProcessingBudgetLedger } from "../../../packages/processing-budget-runtime/out";');
 assert.throws(()=>checker.checkProcessingPathBoundary(copyRoot),/boundary/);fs.writeFileSync(extra,'export const safe = true;');
 for(const suffix of ['\nimport { ProcessingBudgetLedger } from "./processingBudgetLedger";','\nfs.lstatSync(".");']){
  fs.writeFileSync(leaf,leafText+suffix);assert.throws(()=>checker.checkProcessingPathBoundary(copyRoot),/boundary/);
 }fs.writeFileSync(leaf,leafText);
 const facade=path.join(copyRoot,'src/sharedProcessingBudgetRuntime.ts'),text=fs.readFileSync(facade,'utf8');
 const bad=text.replace('require(path.join(directory, "pathPolicy.js"))','require(path.join(directory, "index.js"))');assert.notEqual(bad,text);fs.writeFileSync(facade,bad);assert.throws(()=>checker.checkProcessingPathBoundary(copyRoot),/boundary/);
});
test('workflow_vsix_policy_rejects_full_manifest_extra_module_and_changed_bytes',()=>{
 const validator=require(path.join(root,'scripts/check-vsix-policy.js')).validatePathRuntimeArchive;
 const build=require(path.resolve(root,'../../packages/processing-budget-runtime/scripts/build-runtime.js')).verifiedBuild();
 const runtime=path.join(root,'out/shared-processing-budget-runtime'),manifest=JSON.parse(fs.readFileSync(path.join(runtime,'manifest.json'))),javascript=fs.readFileSync(path.join(runtime,'pathPolicy.js')),prefix='extension/out/shared-processing-budget-runtime/',hash=b=>require('node:crypto').createHash('sha256').update(b).digest('hex');
 const view=(m,js=javascript,extra=false)=>{
  const entries=[{path:prefix+'pathPolicy.js',kind:'file',bytes:js.length,sha256:hash(js)},{path:prefix+'manifest.json',kind:'file',bytes:1,sha256:'0'.repeat(64)}];
  if(extra)entries.push({path:prefix+'processingBudgetLedger.js',kind:'file',bytes:1,sha256:'0'.repeat(64)});
  return{entries,readEntry(name){assert.equal(name,prefix+'manifest.json');return Buffer.from(JSON.stringify(m));}};
 };
 assert.equal(validator(view(manifest),build).state,'passed');
 assert.throws(()=>validator(view({...manifest,profile:'full'}),build),/Path-only/);
 assert.throws(()=>validator(view(manifest,javascript,true),build),/Path-only/);
 assert.throws(()=>validator(view(manifest,Buffer.concat([javascript,Buffer.from(' ')])),build),/hash/);
});
