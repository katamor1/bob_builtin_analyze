'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {freshArtifactRoot}=require('./helpers');
const api=()=>{const r=require('../out');assert.equal(typeof r.resolvePhysicalContainedPathSync,'function','canonical physical path API must be exported by the real package root');return r;};
const fixture=()=>{const root=fs.realpathSync(freshArtifactRoot('path-policy'));fs.mkdirSync(path.join(root,'日本語 docs'));fs.writeFileSync(path.join(root,'日本語 docs','仕様.md'),'owned');return root;};
const policyError=(r,code)=>(e)=>e instanceof r.PathPolicyError&&(!code||e.code===code);

// Removing raw syntax validation lets unsafe names be reinterpreted by the host.
test('portable_syntax_exact_utf8_and_windows_names',()=>{
 const r=api();
 assert.equal(r.normalizeWorkspaceRelativePath('日本語 docs/仕様.md'),'日本語 docs/仕様.md');
 assert.equal(r.normalizeWorkspaceRelativePath('docs\\仕様.md'),'docs/仕様.md');
 assert.equal(r.normalizeWorkspaceRelativePath('..name/file'),'..name/file');
 assert.equal(r.normalizeWorkspaceRelativePath('é'.repeat(2048)),'é'.repeat(2048));
 const bad=['',' a','a ','a/ b','a /b','a//b','a/','a/./b','a/../b','/absolute','C:relative','C:/absolute',String.raw`\\server\share\file`,String.raw`\\?\C:\file`,'a:b','x<y','a.','CON','con.txt','PRN.log','NUL','COM1.txt','LPT9','COM¹.log','LPT³.csv','a'.repeat(4097),'e'+String.fromCharCode(0x301),String.fromCharCode(0xd800),'a'+String.fromCharCode(0x85)+'b','a'+String.fromCharCode(0x7f)+'b'];
 for(const value of bad)assert.throws(()=>r.normalizeWorkspaceRelativePath(value),policyError(r),'unsafe syntax accepted: '+JSON.stringify(value));
 let calls=0;assert.throws(()=>r.normalizeWorkspaceRelativePath({toString(){calls++;return 'safe';}}),policyError(r));assert.equal(calls,0);
});

// Treating a string prefix as containment accepts siblings and traversal.
test('portable_containment_uses_volume_kind_and_component_boundaries',()=>{
 const r=api();
 for(const [root,target,platform,want]of [
  ['/root','/root/file','linux',true],['/root','/root','linux',true],['/root','/root2/file','linux',false],['/root','/root/..name','linux',true],['/root','/ROOT/file','linux',false],
  ['C:\\Work','c:\\work\\日本語 file.md','linux',true],['C:\\Work','C:\\Work2\\x','win32',false],['C:\\Work','D:\\Work\\x','win32',false],
  [String.raw`\\Server\Share\Root`,String.raw`\\server\share\root\file`,'linux',true],
  [String.raw`\\Server\Share\Root`,String.raw`\\server\share2\root\file`,'win32',false],
  ['/root','C:\\root\\file','linux',false],['/root','/root/../outside','linux',false],
  [String.raw`\\server\share`,String.raw`\\server\share\a\..\b`,'win32',false]
 ])assert.equal(r.isPortablePathContained(root,target,platform),want,JSON.stringify([root,target]));
});

// Broad absence catches can turn unreadable paths or file ancestors into safe output.
test('missing_suffix_requires_directory_and_enoent_only',t=>{
 const r=api(),root=fixture();
 const value=r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:'new/sub/output.yaml',mustExist:false,expectedType:'file'});
 assert.deepEqual(value,{root_path:root,path:path.join(root,'new','sub','output.yaml'),relative_path:'new/sub/output.yaml',exists:false});
 assert.equal(Object.isFrozen(value),true);
 const canonical=r.canonicalizePhysicalPathSync(path.join(root,'new','sub','output.yaml'),{mustExist:false,expectedType:'file'});
 assert.equal(canonical.existing_ancestor,root);assert.equal(canonical.exists,false);assert.equal(Object.isFrozen(canonical),true);
 const source=path.join(root,'日本語 docs','仕様.md');
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:source+'/child',mustExist:false}),policyError(r));
 const blocked=path.join(root,'blocked'),original=fs.lstatSync;
 t.mock.method(fs,'lstatSync',function(file,...args){if(path.resolve(String(file))===blocked)throw Object.assign(new Error('injected permission denial'),{code:'EACCES'});return original.call(fs,file,...args);});
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:'blocked/new',mustExist:false}),policyError(r,'path_policy_unavailable'));
});

// Following a governed link, including an in-root link, crosses an unapproved alias.
test('physical_roots_links_and_deepest_selection',async()=>{
 const r=api(),root=fixture(),a=path.join(root,'A'),b=path.join(root,'B'),deep=path.join(b,'deep');
 fs.mkdirSync(a);fs.mkdirSync(deep,{recursive:true});fs.writeFileSync(path.join(deep,'file.md'),'content');
 const alias=path.join(a,'alias');fs.symlinkSync(b,alias,process.platform==='win32'?'junction':'dir');
 const through=path.join(alias,'deep','file.md');
 assert.equal(await r.selectDeepestPhysicalRoot([a,b,deep],through),deep);
 assert.equal(await r.selectDeepestPhysicalRoot([a,b],path.join(alias,'missing','file.md')),b);
 assert.equal(await r.selectDeepestPhysicalRoot([alias],path.join(deep,'file.md')),undefined);
 assert.throws(()=>r.canonicalizePhysicalPathSync(alias),policyError(r,'path_policy_symlink'));
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:a,candidatePath:'alias/deep/file.md'}),policyError(r));
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:alias,candidatePath:'deep/file.md'}),policyError(r));
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:a,candidatePath:'alias',expectedType:'directory'}),policyError(r));
 const followed=r.canonicalizePhysicalPathSync(through,{rejectLinks:false,expectedType:'file'});assert.equal(followed.path,path.join(deep,'file.md'));
 assert.equal(r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:root,expectedType:'directory'}).relative_path,'.');
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:a,candidatePath:path.join(deep,'file.md')}),policyError(r,'path_policy_escape'));
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:a,expectedType:'file'}),policyError(r,'path_policy_not_file'));
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:'日本語 docs/仕様.md',expectedType:'directory'}),policyError(r,'path_policy_not_directory'));
 assert.equal((await r.resolvePhysicalContainedPath({rootPath:root,candidatePath:'日本語 docs/仕様.md',expectedType:'file'})).exists,true);
});

// Accessors/unknown options must not execute or weaken existence/link validation.
test('closed_options_never_invoke_getters',()=>{
 const r=api(),root=fixture();let getters=0;
 const accessor=Object.defineProperty({},'mustExist',{enumerable:true,get(){getters++;return false;}});
 for(const options of [null,accessor,{mustExist:0},{rejectLinks:'false'},{expectedType:'socket'},{unknown:true},Object.create({mustExist:false}),{[Symbol('hidden')]:true}])assert.throws(()=>r.canonicalizePhysicalPathSync(root,options),policyError(r,'path_policy_invalid'));
 const input=Object.defineProperty({rootPath:root},'candidatePath',{enumerable:true,get(){getters++;return 'missing';}});
 assert.throws(()=>r.resolvePhysicalContainedPathSync(input),policyError(r,'path_policy_invalid'));
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:'missing',allowAbsolute:0}),policyError(r,'path_policy_invalid'));
 assert.equal(getters,0);
});

// A repository-only export leaves installed and type consumers without the policy.
test('public_path_subpath_has_only_path_authority_in_real_pack',()=>{
 const r=api(),h=require('./helpers'),{createRequire}=require('node:module');
 const proof=h.packAndInstall(h.packageRoot,h.freshArtifactRoot('path-public-pack')),load=createRequire(path.join(proof.consumerRoot,'package.json'));
 const isolated=load('@bob/processing-budget-runtime/path-policy');
 assert.equal(isolated.normalizeWorkspaceRelativePath('日本語 docs/file.md'),'日本語 docs/file.md');
 assert.deepEqual(Object.keys(isolated).sort(),['MAX_PUBLIC_PATH_UTF8_BYTES','PathPolicyError','canonicalizePhysicalPathSync','isPortablePathContained','normalizeWorkspaceRelativePath','resolvePhysicalContainedPath','resolvePhysicalContainedPathSync','selectDeepestPhysicalRoot'].sort());
 const receipt=JSON.parse(fs.readFileSync(proof.receipt.path,'utf8'));
 assert.equal(proof.manifest.length,52);assert.equal(receipt.consumerResults.length,3);
 assert.equal(typeof r.createProcessingOperation,'function');
 assert.throws(()=>load('@bob/processing-budget-runtime/out/pathPolicy'),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');
});
