'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const r=require('../out/core/fileSystem');
function fixture(){const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t17path-syntax-'));fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs','日本語 file.md'),'safe');return root;}

// Break: normalization, reserved names, or ignored I/O errors bypass common raw/physical policy.
test('strict_and_changed_paths_keep_raw_syntax_until_common_policy',()=>{
 const root=fixture();
 for(const value of ['docs/./file.md','docs//file.md','docs/x/../file.md','docs/CON.txt','docs/file.','docs/a:b.md','docs/e\u0301.md','docs/\u0085file.md','docs/\ud800.md']){
  assert.throws(()=>r.resolveWorkspacePathStrict(root,value),undefined,value);assert.throws(()=>r.normalizeChangedFilePathStrict(value),undefined,value);
 }
 assert.throws(()=>r.resolveWorkspacePathStrict(root+path.sep+'.','docs/file.md'));
 assert.equal(r.resolveWorkspacePathStrict(root,'docs/日本語 file.md'),path.join(root,'docs','日本語 file.md'));
 assert.equal(r.isInsidePath(root,path.join(root,'..name')),true);assert.equal(r.normalizeChangedFilePathStrict('docs/..name.md'),'docs/..name.md');
});

// Break: generated kind allowlists become a generic absolute-path authority or lose existing nine intents.
test('kind_allowlists_and_contained_host_absolute_remain_distinct',()=>{
 const root=fixture(),inside=path.join(root,'docs','日本語 file.md');assert.equal(r.resolveWorkspacePathStrict(root,inside),inside);
 const valid=[['review-package-output','.bob-review/package'],['bob-output','.bob-review/bob-output/result.yaml'],['human-triage-output','.bob-review/human-triage'],['traceability-catalog','.bob-trace/catalog.json'],['traceability-gate-report','.bob-trace/gate.md'],['traceability-ai-draft-output','.bob-trace/ai-traceability-draft/result'],['repository-symbol-index-output','.bob/evidence-scope/index.json'],['repository-symbol-index-cache','.bob/evidence-scope/index.cache.json'],['artifact-ledger','.bob-review/artifact-ledger.json']];
 for(const [kind,value]of valid){assert.equal(r.resolveWorkspacePathForKind(root,value,kind),path.join(root,...value.split('/')));assert.throws(()=>r.resolveWorkspacePathForKind(root,inside,kind));}
 for(const value of ['.custom/CON.yaml','.custom/a:b.yaml','.custom/e\u0301.yaml'])assert.throws(()=>r.resolveWorkspacePathForKind(root,value,'bob-output'));
 assert.throws(()=>r.resolveWorkspacePathForKind(root,'.bob-review/bob-output/other','review-package-output'));
});

// Break: a contained link is treated as safe or a non-ENOENT observation becomes a missing suffix.
test('managed_paths_reject_inside_alias_and_unavailable_ancestors',()=>{
 const root=fixture(),linked=path.join(root,'alias');fs.symlinkSync(path.join(root,'docs'),linked,process.platform==='win32'?'junction':'dir');assert.throws(()=>r.resolveWorkspacePathStrict(root,'alias/日本語 file.md'));
 const stat=fs.lstatSync,spy=mock.method(fs,'lstatSync',(...args)=>{if(args[0]===root)throw Object.assign(Error('denied'),{code:'EACCES'});return stat(...args);});try{assert.throws(()=>r.resolveWorkspacePathStrict(root,'docs/missing.md'));}finally{spy.mock.restore();}
});
