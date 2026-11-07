'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
const MARKER='.bzr',rootModule='../out/workspace/workspaceRoots.js',resolverModule='../out/workspace/workspaceResolver.js',resolveName='resolveBazaarWorkspaceFolder',returnsFolder=true;
const roots=require(rootModule),folder=(name,fsPath)=>({name,uri:{fsPath}}),unwrap=value=>returnsFolder?value?.uri.fsPath:value;
function fixture(){const base=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t17path-workspace-')),root=path.join(base,'日本語 space');fs.mkdirSync(root);return{base,root};}
function marker(root){fs.mkdirSync(path.join(root,MARKER),{recursive:true});}
function alias(target,name){fs.symlinkSync(target,name,process.platform==='win32'?'junction':'dir');}
function resolver(folders,active,pick=async()=>undefined){const filename=require.resolve(resolverModule),original=Module._load;delete require.cache[filename];Module._load=function(name,parent,isMain){if(name==='vscode')return{workspace:{workspaceFolders:folders},window:{activeTextEditor:active?{document:{uri:{scheme:'file',fsPath:active}}}:undefined,showWarningMessage:async()=>{},showQuickPick:pick},Uri:{file:fsPath=>({scheme:'file',fsPath})}};return original.call(this,name,parent,isMain);};try{return require(filename);}finally{Module._load=original;}}

// Break: stat follows a linked workspace, marker, or immediate child and grants it root authority.
test('physical_marker_roots_reject_linked_root_marker_and_child',async()=>{
 const f=fixture();marker(f.root);const linked=path.join(f.base,'linked');alias(f.root,linked);assert.deepEqual(await roots.findMarkerRoots([folder('linked',linked)],MARKER),[]);
 const other=path.join(f.base,'other');fs.mkdirSync(other);alias(path.join(f.root,MARKER),path.join(other,MARKER));assert.deepEqual(await roots.findMarkerRoots([folder('other',other)],MARKER),[]);
 const container=path.join(f.base,'container');fs.mkdirSync(container);alias(f.root,path.join(container,'child'));assert.deepEqual(await roots.findMarkerRoots([folder('container',container)],MARKER),[]);
 assert.deepEqual(await roots.findMarkerRoots([folder('raw-dot',f.root+path.sep+'.')],MARKER),[]);assert.equal(await roots.rootHasMarker(f.root,'.'+path.sep+MARKER),false);
 assert.deepEqual((await roots.findMarkerRoots([folder('safe',f.root)],MARKER)).map(row=>row.root),[f.root]);
});

// Break: lexical longest-prefix selects A when an active alias physically belongs to deeper B.
test('active_alias_selects_deepest_physical_root',async()=>{
 const f=fixture(),deeper=path.join(f.root,'project');marker(f.root);marker(deeper);const linked=path.join(f.root,'alias-to-project');alias(deeper,linked);
 for(const leaf of ['present.txt','missing.txt']){if(leaf==='present.txt')fs.writeFileSync(path.join(deeper,leaf),'active');const api=resolver([folder('outer',f.root),folder('deep',deeper)],path.join(linked,leaf));assert.equal(unwrap(await api[resolveName]({allowPick:false})),deeper);}
 const api=resolver([folder('outer',f.root),folder('deep',deeper)],deeper);assert.equal(unwrap(await api[resolveName]({allowPick:false})),deeper);
});

// Break: fallback returns an unchecked alias or treats the same physical directory as multiple choices.
test('fallbacks_are_physical_and_deduplicated',async()=>{
 const f=fixture(),linked=path.join(f.base,'linked');alias(f.root,linked);
 const api=resolver([folder('linked',linked),folder('first',f.root),folder('duplicate',f.root)]);assert.equal(unwrap(await api[resolveName]({allowPick:false})),f.root);
 const invalid=resolver([folder('linked',linked)]);assert.equal(unwrap(await invalid[resolveName]({allowPick:false})),undefined);
});

// Break: strengthening C explicit-root validation accidentally makes its marker requirement equal B's.
test('explicit_root_keeps_bazaar_ccr_marker_difference',async()=>{
 const f=fixture(),api=resolver([]);assert.equal(unwrap(await api[resolveName]({explicitRoot:f.root,allowPick:false})),returnsFolder?undefined:f.root);
 marker(f.root);assert.equal(unwrap(await api[resolveName]({explicitRoot:f.root,allowPick:false})),f.root);
 assert.equal(unwrap(await api[resolveName]({explicitRoot:f.root+path.sep+'.',allowPick:false})),undefined);
 const linked=path.join(f.base,'linked');alias(f.root,linked);assert.equal(unwrap(await api[resolveName]({explicitRoot:linked,allowPick:false})),undefined);
});

// Break: recursion or per-folder priority admits deeper children despite any direct workspace marker.
test('marker_discovery_keeps_global_direct_priority_one_level_and_read_failure',async()=>{
 const f=fixture(),container=path.join(f.base,'container'),child=path.join(container,'child'),grand=path.join(container,'unmarked','grand');marker(f.root);marker(child);marker(grand);
 const all=await roots.findMarkerRoots([folder('container',container),folder('direct',f.root)],MARKER);assert.deepEqual(all.map(row=>[row.root,row.depth]),[[f.root,'direct']]);
 assert.deepEqual((await roots.findMarkerRoots([folder('container',container)],MARKER)).map(row=>row.root),[child]);
 const spy=mock.method(fsp,'readdir',async()=>{throw Object.assign(Error('read denied'),{code:'EACCES'});});try{assert.deepEqual(await roots.findMarkerRoots([folder('container',container)],MARKER),[]);}finally{spy.mock.restore();}
});
