'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');const h=require('./helpers');
const modules=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml','documentBudget','workbookBudget'];
const files=modules.flatMap(n=>['js','d.ts','js.map'].map(e=>n+'.'+e)).sort();
function bytes(file){const b=fs.readFileSync(file);return{bytes:b.length,sha256:crypto.createHash('sha256').update(b).digest('hex')};}
function fixture(){
 assert.ok(fs.existsSync(path.join(h.packageRoot,'scripts/copy-extension-runtime.js')),'canonical runtime copy must exist');
 const root=h.freshArtifactRoot('copy-repo'),p=path.join(root,'packages/processing-budget-runtime');fs.mkdirSync(p,{recursive:true});
 for(const name of ['src','scripts','contracts','schema','out','package.json','package-lock.json','tsconfig.json','README.md'])fs.cpSync(path.join(h.packageRoot,name),path.join(p,name),{recursive:true});
 fs.mkdirSync(path.join(p,'node_modules/.cache/bob-processing-runtime'),{recursive:true});fs.copyFileSync(path.join(h.packageRoot,'node_modules/.cache/bob-processing-runtime/last-build.json'),path.join(p,'node_modules/.cache/bob-processing-runtime/last-build.json'));
 const roots=['bob-bazaar-review','bob-code-consistency-review'].map(name=>{const dir=path.join(root,'extensions',name);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'package.json'),JSON.stringify({name,publisher:'local',version:'0.0.0'}));return dir;});return{root,p,roots};
}
function copy(f,dir){return cp.spawnSync(process.execPath,[path.join(f.p,'scripts/copy-extension-runtime.js'),'--extension-root',dir],{encoding:'utf8'});}
test('flat_copy_has_exact_compiled_bytes_and_no_source_fallback',()=>{
 const f=fixture();for(const dir of f.roots){const r=copy(f,dir);assert.equal(r.status,0,r.stderr);const dest=path.join(dir,'out/shared-processing-budget-runtime');assert.deepEqual(fs.readdirSync(dest).sort(),[...files,'manifest.json'].sort());
  for(const name of files)assert.deepEqual(bytes(path.join(dest,name)),bytes(path.join(h.packageRoot,'out',name)));
  const runtime=require(dest);assert.equal(typeof runtime.readBoundedDocumentFile,'function');assert.equal(runtime.prepareOoxmlParserInput,undefined);assert.equal(runtime.preflightOoxmlArchive,undefined);assert.equal(typeof require(path.join(dest,'validatedOoxml')).withValidatedOoxmlParserInput,'function');
 }
});
test('copy_rejects_escape_symlink_unknown_and_stale_output',()=>{
 for(const mode of ['escape','unknown','stale','alias']){const f=fixture();let dest=f.roots[0];if(mode==='escape')dest=path.join(f.root,'outside');if(mode==='unknown')fs.writeFileSync(path.join(f.p,'out/unknown.js'),'module.exports=1');if(mode==='stale')fs.appendFileSync(path.join(f.p,'src/boundedDocumentIo.ts'),'\n');if(mode==='alias'){fs.mkdirSync(path.join(dest,'out'));try{fs.symlinkSync(f.roots[1],path.join(dest,'out/shared-processing-budget-runtime'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM')continue;throw e;}}
  const r=copy(f,dest);assert.notEqual(r.status,0,mode);assert.equal(fs.existsSync(path.join(f.root,'outside')),false);
 }
});
test('concurrent_same_source_builds_do_not_mix_modules',async()=>{
 const script=path.join(h.packageRoot,'scripts/build-runtime.js');assert.ok(fs.existsSync(script),'canonical build must exist');
 const run=()=>new Promise((resolve,reject)=>{const child=cp.spawn(process.execPath,[script],{cwd:h.packageRoot,env:process.env});let stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.resume();child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(stderr)));});
 await Promise.all([run(),run()]);assert.deepEqual(fs.readdirSync(path.join(h.packageRoot,'out')).sort(),files);
 const f=fixture();for(const dir of f.roots)assert.equal(copy(f,dir).status,0);
 for(const name of files)assert.deepEqual(bytes(path.join(f.roots[0],'out/shared-processing-budget-runtime',name)),bytes(path.join(f.roots[1],'out/shared-processing-budget-runtime',name)));
});

test('extension_facade_uses_only_copied_js_and_rejects_missing_or_tampered_payload',()=>{
 const facadePath=path.resolve(h.packageRoot,'../../extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts');assert.ok(fs.existsSync(facadePath),'compiled-copy facade must exist');
 const ts=require('typescript'),source=fs.readFileSync(facadePath,'utf8');
 for(const mode of ['shipped-js','missing','tampered','unknown']){const f=fixture(),dir=f.roots[0];assert.equal(copy(f,dir).status,0);const out=path.join(dir,'out'),dest=path.join(out,'shared-processing-budget-runtime');
  const entry=path.join(out,'sharedProcessingBudgetRuntime.js');fs.writeFileSync(entry,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  const configSource=fs.readFileSync(path.resolve(h.packageRoot,'../../extensions/bob-bazaar-review/src/ruleAuthoring/ruleAuthoringLimits.ts'),'utf8'),configDirectory=path.join(out,'ruleAuthoring');fs.mkdirSync(configDirectory);fs.writeFileSync(path.join(configDirectory,'ruleAuthoringLimits.js'),ts.transpileModule(configSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText);
  for(const name of files.filter(n=>!n.endsWith('.js')))fs.unlinkSync(path.join(dest,name));
  if(mode==='missing')fs.unlinkSync(path.join(dest,'index.js'));if(mode==='tampered')fs.appendFileSync(path.join(dest,'index.js'),'\n');if(mode==='unknown')fs.writeFileSync(path.join(dest,'unknown.js'),'');
  if(mode!=='shipped-js'){assert.throws(()=>require(entry),/Processing runtime build required/);continue;}
  const api=require(entry);assert.equal(typeof api.withValidatedOoxmlParserInput,'function');assert.equal(api.prepareOoxmlParserInput,undefined);
  for(const maximum of [1,50*1048576]){const p=api.createDocumentLedger(maximum).profile.limits;assert.equal(p.single_document_bytes,maximum);assert.equal(p.total_document_bytes,Math.max(maximum,32*1048576));assert.equal(p.total_operation_input_bytes,64*1048576);assert.equal(p.document_count,128);}
 }
});
