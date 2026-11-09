'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const h=require('./helpers');
const pathNames=['pathPolicy.d.ts','pathPolicy.js','pathPolicy.js.map'];
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function fixture(){
 const root=h.freshArtifactRoot('path-copy-profiles'),p=path.join(root,'packages/processing-budget-runtime');
 fs.mkdirSync(p,{recursive:true});
 for(const name of ['src','scripts','contracts','schema','out','package.json','package-lock.json','tsconfig.json','README.md'])fs.cpSync(path.join(h.packageRoot,name),path.join(p,name),{recursive:true});
 fs.mkdirSync(path.join(p,'node_modules/.cache/bob-processing-runtime'),{recursive:true});
 fs.copyFileSync(path.join(h.packageRoot,'node_modules/.cache/bob-processing-runtime/last-build.json'),path.join(p,'node_modules/.cache/bob-processing-runtime/last-build.json'));
 const extensions=Object.fromEntries(['bob-bazaar-review','bob-code-consistency-review','workflow-register'].map(name=>{
  const dir=path.join(root,'extensions',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,publisher:'local',version:'0.0.0'}));return[name,dir];
 }));
 return {root,p,extensions};
}
function copy(f,extension){return cp.spawnSync(process.execPath,[path.join(f.p,'scripts/copy-extension-runtime.js'),'--extension-root',f.extensions[extension]],{encoding:'utf8'});}
function manifest(dir){return JSON.parse(fs.readFileSync(path.join(dir,'out/shared-processing-budget-runtime/manifest.json')));}
function copyWorkflow(f){const r=copy(f,'workflow-register');assert.equal(r.status,0,'Workflow path-only copy must be admitted: '+r.stderr);return f.extensions['workflow-register'];}
function installedFacade(f,sourceRoot){
 const dir=path.join(f.root,'installed-'+crypto.randomBytes(4).toString('hex'),'out'),runtime=path.join(dir,'shared-processing-budget-runtime');fs.mkdirSync(runtime,{recursive:true});
 for(const name of ['pathPolicy.js','manifest.json'])fs.copyFileSync(path.join(sourceRoot,'out/shared-processing-budget-runtime',name),path.join(runtime,name));
 const source=path.resolve(h.packageRoot,'../../extensions/workflow-register/src/sharedProcessingBudgetRuntime.ts');assert.ok(fs.existsSync(source),'Workflow path-only facade must exist');
 fs.writeFileSync(path.join(dir,'sharedProcessingBudgetRuntime.js'),require('typescript').transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:1,target:9}}).outputText);
 return {entry:path.join(dir,'sharedProcessingBudgetRuntime.js'),runtime};
}
function loadChild(entry){return cp.spawnSync(process.execPath,['-e','require(process.argv[1])',entry],{encoding:'utf8',env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});}

// A generic full copy admits ledger/deadline modules into the path-only product.
test('path_copy_profiles_bind_exact_canonical_subset',()=>{
 const f=fixture(),full=copy(f,'bob-bazaar-review');assert.equal(full.status,0,full.stderr);
 const w=copyWorkflow(f),m=manifest(w),b=manifest(f.extensions['bob-bazaar-review']);
 assert.equal(m.schemaVersion,'bob-builtin-analyze/processing-runtime-path-copy/v1');assert.equal(m.profile,'path-only');
 assert.deepEqual(Object.keys(m).sort(),['payload','profile','schemaVersion','sourceInputDigest']);
 assert.deepEqual(m.payload.map(r=>r.path),pathNames);assert.equal(b.payload.length,48);
 assert.equal(b.schemaVersion,'bob-builtin-analyze/processing-runtime-copy/v1');assert.equal(Object.hasOwn(b,'profile'),false);
 assert.equal(m.sourceInputDigest,b.sourceInputDigest);
 assert.deepEqual(fs.readdirSync(path.join(w,'out/shared-processing-budget-runtime')).sort(),[...pathNames,'manifest.json'].sort());
 for(const row of m.payload){const bytes=fs.readFileSync(path.join(w,'out/shared-processing-budget-runtime',row.path));assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);assert.deepEqual(row,b.payload.find(r=>r.path===row.path));}
 const installed=installedFacade(f,w),child=loadChild(installed.entry);assert.equal(child.status,0,child.stderr);
 const facade=require(installed.entry);assert.equal(facade.normalizeWorkspaceRelativePath('日本語 docs/file.md'),'日本語 docs/file.md');assert.equal(facade.ProcessingBudgetLedger,undefined);assert.equal(facade.createCancellationScope,undefined);
});

// Updating a hash together with extra executable exports must not bypass profile validation.
test('workflow_rejects_full_profile_and_unknown_path_exports',()=>{
 const f=fixture(),w=copyWorkflow(f);const b=copy(f,'bob-bazaar-review');assert.equal(b.status,0,b.stderr);
 for(const mode of ['full-manifest','unknown-file','extra-export','hash-mismatch']){
  const installed=installedFacade(f,w),manifestPath=path.join(installed.runtime,'manifest.json');
  if(mode==='full-manifest')fs.writeFileSync(manifestPath,JSON.stringify(manifest(f.extensions['bob-bazaar-review'])));
  if(mode==='unknown-file')fs.copyFileSync(path.join(f.p,'out/processingBudgetLedger.js'),path.join(installed.runtime,'processingBudgetLedger.js'));
  if(mode==='hash-mismatch')fs.appendFileSync(path.join(installed.runtime,'pathPolicy.js'),'\n// stale\n');
  if(mode==='extra-export'){const file=path.join(installed.runtime,'pathPolicy.js');fs.appendFileSync(file,'\nexports.unexpected = 1;\n');const m=JSON.parse(fs.readFileSync(manifestPath));const row=m.payload.find(r=>r.path==='pathPolicy.js'),bytes=fs.readFileSync(file);row.bytes=bytes.length;row.sha256=sha(bytes);fs.writeFileSync(manifestPath,JSON.stringify(m));}
  const child=loadChild(installed.entry);assert.notEqual(child.status,0,mode+' unexpectedly loaded');
 }
});

// A stale source or aliased destination must not replace a previously verified copy.
test('stale_source_or_alias_never_publishes_path_copy',()=>{
 const f=fixture(),w=copyWorkflow(f),manifestPath=path.join(w,'out/shared-processing-budget-runtime/manifest.json'),before=fs.readFileSync(manifestPath);
 fs.appendFileSync(path.join(f.p,'src/pathPolicy.ts'),'\n');const stale=copy(f,'workflow-register');assert.notEqual(stale.status,0);assert.deepEqual(fs.readFileSync(manifestPath),before);
 const a=fixture(),target=a.extensions['workflow-register'];fs.mkdirSync(path.join(target,'out'));const external=path.join(a.root,'alias-target');fs.mkdirSync(external);fs.symlinkSync(external,path.join(target,'out/shared-processing-budget-runtime'),process.platform==='win32'?'junction':'dir');
 assert.notEqual(copy(a,'workflow-register').status,0);assert.deepEqual(fs.readdirSync(external),[]);
});
