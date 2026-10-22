'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const h=require('./helpers');let proof;
function packed(){return proof??=h.packAndInstall(h.packageRoot,h.freshArtifactRoot('pack'));}
function binding(p){const b=fs.readFileSync(p);return {sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};}
test('packed_runtime_works_without_repository_out_or_dev_dependencies',()=>{
 const p=packed(),r=JSON.parse(fs.readFileSync(p.receipt.path,'utf8'));
 assert.deepEqual(r.runtimeResult,{state:'passed',entry:'out/index.js',checks:['constructor','reserve_commit','release','snapshot']});
 assert.ok(r.installedResolvedPath.startsWith(fs.realpathSync(p.consumerRoot)+path.sep));assert.notEqual(r.installedResolvedPath,path.join(h.packageRoot,'out/index.js'));
 const installed=JSON.parse(fs.readFileSync(path.join(p.consumerRoot,'node_modules/@bob/processing-budget-runtime/package.json'),'utf8'));
 assert.equal(Object.keys(installed.dependencies||{}).length,0);assert.equal(fs.existsSync(path.join(p.consumerRoot,'node_modules/typescript')),false);
 assert.deepEqual(binding(p.tarball.path),{sha256:p.tarball.sha256,bytes:p.tarball.bytes});
});
test('packed_declarations_enforce_all_three_consumer_contracts',()=>{
 const r=JSON.parse(fs.readFileSync(packed().receipt.path,'utf8'));
 assert.deepEqual(r.consumerResults,[{consumer:'workflow-register',typecheck:'passed'},{consumer:'bob-bazaar-review',typecheck:'passed'},{consumer:'bob-code-consistency-review',typecheck:'passed'}]);
});
test('payload_is_exact_and_excludes_source_tests_and_stale_out',()=>{
 const p=packed(),expected=['package.json','README.md','contracts/processing-budget-definition.v1.json','schema/processing-budget-profile.v1.schema.json'];
 for(const n of ['index','generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger'])for(const e of ['js','d.ts','js.map'])expected.push('out/'+n+'.'+e);
 assert.deepEqual(p.manifest,[...expected].sort());assert.equal(p.manifest.some(x=>/^(src|test|scripts|node_modules)\//.test(x)),false);
 const fixture=h.freshArtifactRoot('stale-payload');for(const n of ['package.json','README.md','contracts','schema','out'])fs.cpSync(path.join(h.packageRoot,n),path.join(fixture,n),{recursive:true});
 fs.writeFileSync(path.join(fixture,'out/stale.js'),'module.exports = 1;\n');
 assert.throws(()=>h.packAndInstall(fixture,h.freshArtifactRoot('reject-stale')),/payload/);
});
test('published_artifact_binds_actual_pack_without_host_path_dependency',()=>{
 const p=packed(),output=h.publishCiArtifacts({head:'1'.repeat(40),tree:'2'.repeat(40),os:'test-os',proof:p,outputRoot:h.freshArtifactRoot('publish')});
 assert.deepEqual(fs.readdirSync(output).sort(),['package-manifest.json','receipt.json','runtime.tgz']);
 const r=JSON.parse(fs.readFileSync(path.join(output,'receipt.json'),'utf8'));
 assert.deepEqual(Object.keys(r),['schemaVersion','sourceHeadSha','sourceTreeSha','os','files','consumerResults','runtimeResult']);
 assert.equal(r.schemaVersion,'bob-builtin-analyze/processing-budget-ci-evidence/v1');assert.equal(r.sourceHeadSha,'1'.repeat(40));assert.equal(r.sourceTreeSha,'2'.repeat(40));
 for(const f of r.files){assert.ok(['runtime.tgz','package-manifest.json'].includes(f.path));assert.deepEqual(binding(path.join(output,f.path)),{sha256:f.sha256,bytes:f.bytes});}
 assert.equal(r.files[0].sha256,p.tarball.sha256);assert.equal(JSON.stringify(r).includes(p.consumerRoot),false);
 const forged={...p,tarball:{...p.tarball,sha256:'0'.repeat(64)}};assert.throws(()=>h.publishCiArtifacts({head:'1'.repeat(40),tree:'2'.repeat(40),os:'test-os',proof:forged,outputRoot:h.freshArtifactRoot('forged')}),/binding/);
});
