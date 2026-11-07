'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {freshArtifactRoot}=require('./helpers');
const api=()=>{const r=require('../out');assert.equal(typeof r.resolvePhysicalContainedPathSync,'function','canonical physical path API must be exported');return r;};

// Host normalization would erase traversal/empty segments before they can be rejected.
test('raw_unc_and_root_components_are_checked_before_normalize',()=>{
 const r=api(),root=fs.realpathSync(freshArtifactRoot('path-absolute')),safe=path.join(root,'file.md');fs.writeFileSync(safe,'source');
 for(const suffix of [path.sep+'.'+path.sep+'file.md',path.sep+'child'+path.sep+'..'+path.sep+'file.md',path.sep+path.sep+'file.md',path.sep+'file.md'+path.sep])assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:root+suffix}));
 for(const suffix of [path.sep+'.',path.sep+'child'+path.sep+'..',path.sep+path.sep+'child'])assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root+suffix,candidatePath:safe}));
 for(const value of [String.raw`\\server\share.\root`,String.raw`\\server.\share\root`,String.raw`\\server\CON\root`,String.raw`\\server\share\a\..\b`,String.raw`\\?\UNC\server\share\file`,String.raw`C:relative`,String.raw`\\.\C:\file`])assert.equal(r.isPortablePathContained(value,value,'win32'),false,value);
 assert.equal(r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:safe,expectedType:'file'}).path,safe);
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:safe,allowAbsolute:false}),e=>e.code==='path_policy_absolute');
});

// A foreign absolute spelling must not become a host-relative filename.
test('physical_resolution_rejects_foreign_absolute_syntax',()=>{
 const r=api(),root=fs.realpathSync(freshArtifactRoot('path-foreign'));
 const foreign=process.platform==='win32'?'/tmp/foreign-file':String.raw`C:\foreign\file`;
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:foreign,mustExist:false}),e=>e.code==='path_policy_absolute');
 assert.equal(r.isPortablePathContained('C:\\Root','c:\\root\\child','linux'),true);
});

test('posix_absolute_paths_do_not_reclassify_literal_backslash_names',()=>{
 const r=api();
 assert.equal(r.isPortablePathContained('/root','/root/a\\b.md','linux'),false);
 assert.equal(r.isPortablePathContained('/root','/root/a/b.md','linux'),true);
 assert.equal(r.normalizeWorkspaceRelativePath('a\\b.md'),'a/b.md');
});

test('native_posix_absolute_path_preserves_document_identity_on_round_trip',{skip:process.platform==='win32'},()=>{
 const r=api(),root=fs.realpathSync(freshArtifactRoot('path-backslash'));
 const literal=path.join(root,'a\\b.md'),nested=path.join(root,'a','b.md');
 fs.mkdirSync(path.dirname(nested));
 fs.writeFileSync(literal,'literal');
 fs.writeFileSync(nested,'nested');
 assert.throws(()=>r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:literal}),error=>error.code==='path_policy_invalid');
 const admitted=r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:nested});
 assert.equal(admitted.relative_path,'a/b.md');
 assert.equal(r.resolvePhysicalContainedPathSync({rootPath:root,candidatePath:admitted.relative_path}).path,nested);
});
