'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),YAML=require('yaml');
const {buildReviewInputFromDraft,writeReviewInputFromDraft}=require('../out/core/reviewInputBuilder');
function fixture(){const root=fs.mkdtempSync(path.join(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT||os.tmpdir(),'t17path-author-'));fs.mkdirSync(path.join(root,'docs'));fs.writeFileSync(path.join(root,'docs','one.md'),'# Requirements');return{root,draft:{review:{id:'path-review',title:'Physical paths'},artifact_candidates:[{kind:'requirements',path:'docs/one.md'}]}};}

// Break: authoring trims away invalid raw syntax or makes strict=false skip containment/link checks.
test('artifact_raw_paths_are_checked_even_when_strict_false',async()=>{
 const f=fixture();fs.symlinkSync(path.join(f.root,'docs'),path.join(f.root,'alias'),process.platform==='win32'?'junction':'dir');
 for(const value of [' docs/one.md','docs/one.md ','docs/./one.md','docs//one.md','docs/x/../one.md','docs/CON.txt','docs/a:b.md','docs/e\u0301.md','docs/\u0085file.md','alias/one.md','C:relative.md','\\\\?\\C:\\file.md']){
  const result=await buildReviewInputFromDraft({...f.draft,artifact_candidates:[{kind:'requirements',path:value}]},{workspaceRoot:f.root,strictPaths:false});assert.equal(result.status,'error',JSON.stringify(value));
 }
 const missing={...f.draft,artifact_candidates:[{kind:'requirements',path:'docs/new/missing.md'}]};assert.equal((await buildReviewInputFromDraft(missing,{workspaceRoot:f.root,strictPaths:false})).status,'ok');assert.equal((await buildReviewInputFromDraft(missing,{workspaceRoot:f.root,strictPaths:true})).status,'error');
 const directory={...f.draft,artifact_candidates:[{kind:'requirements',path:'docs'}]};assert.equal((await buildReviewInputFromDraft(directory,{workspaceRoot:f.root,strictPaths:false})).status,'error');
 const absolute={...f.draft,artifact_candidates:[{kind:'requirements',path:path.join(f.root,'docs','one.md')}]};const built=await buildReviewInputFromDraft(absolute,{workspaceRoot:f.root});assert.equal(built.status,'ok');assert.equal(built.reviewInput.artifacts.requirements[0].path,'docs/one.md');
});

// Break: an invalid output causes schema/build/read-existing/backup/write before containment is checked.
test('output_and_backup_fail_before_static_escape_write',async()=>{
 const f=fixture(),outside=fixture(),output=path.join(outside.root,'review-input.yaml');fs.writeFileSync(output,'ORIGINAL');
 const schema=require('../out/core/schemaLoader'),load=schema.loadSchemaValidator,write=fsp.writeFile,read=fsp.readFile;let schemaCalls=0,writes=0,reads=0;
 const a=mock.method(schema,'loadSchemaValidator',async(...args)=>{schemaCalls++;return load(...args);}),b=mock.method(fsp,'writeFile',async(file,...args)=>{if(String(file).startsWith(outside.root))writes++;return write(file,...args);}),c=mock.method(fsp,'readFile',async(file,...args)=>{if(String(file)===output)reads++;return read(file,...args);});
 try{const result=await writeReviewInputFromDraft({draft:f.draft,workspaceRoot:f.root,outputPath:output});assert.equal(result.status,'error');assert.equal(schemaCalls,0);assert.equal(reads,0);assert.equal(writes,0);assert.equal(fs.readFileSync(output,'utf8'),'ORIGINAL');}finally{a.mock.restore();b.mock.restore();c.mock.restore();}
});

// Break: a pre-existing alias at the deterministic backup name is followed before writing the new input.
test('authoring_rechecks_backup_leaf_before_write',async()=>{
 const f=fixture(),outside=fixture(),output=path.join(f.root,'review-input.yaml'),backup=output+'.bak-20261105T000000Z';fs.writeFileSync(output,'ORIGINAL');
 fs.symlinkSync(outside.root,backup,process.platform==='win32'?'junction':'dir');
 const clock=mock.method(Date.prototype,'toISOString',()=> '2026-11-05T00:00:00.000Z'),write=fsp.writeFile;let writes=0;
 const spy=mock.method(fsp,'writeFile',async(file,...args)=>{if(String(file)===output||String(file)===backup)writes++;return write(file,...args);});
 try{const result=await writeReviewInputFromDraft({draft:f.draft,workspaceRoot:f.root,outputPath:output});assert.equal(result.status,'error');assert.equal(writes,0);assert.equal(fs.readFileSync(output,'utf8'),'ORIGINAL');}finally{spy.mock.restore();clock.mock.restore();}
});

// Break: mkdir changes the validated parent to an outside junction and the following write is adopted.
test('authoring_discards_parent_replacement_after_mkdir',async()=>{
 const f=fixture(),outside=fixture(),parent=path.join(f.root,'future'),output=path.join(parent,'review-input.yaml'),mkdir=fsp.mkdir,write=fsp.writeFile;let replaced=false,outsideWrites=0;
 const made=mock.method(fsp,'mkdir',async(target,...args)=>{const result=await mkdir(target,...args);if(String(target)===parent&&!replaced){replaced=true;fs.renameSync(parent,parent+'.retained');fs.symlinkSync(outside.root,parent,process.platform==='win32'?'junction':'dir');}return result;}),written=mock.method(fsp,'writeFile',async(file,...args)=>{if(String(file)===output)outsideWrites++;return write(file,...args);});
 try{const result=await writeReviewInputFromDraft({draft:f.draft,workspaceRoot:f.root,outputPath:output});assert.equal(result.status,'error');assert.equal(replaced,true);assert.equal(outsideWrites,0);assert.equal(fs.existsSync(path.join(outside.root,'review-input.yaml')),false);}finally{made.mock.restore();written.mock.restore();}
});

// Break: path validation is moved ahead of the existing aggregate-reference limit.
test('artifact_reference_limit_precedes_path_io',async()=>{
 const f=fixture(),built=await buildReviewInputFromDraft(f.draft,{workspaceRoot:f.root});assert.equal(built.status,'ok');const input=path.join(f.root,'review-input.yaml'),data=built.reviewInput;
 for(const count of [501,500]){
  data.artifacts.requirements=Array.from({length:count},()=>({path:'docs/one.md'}));fs.writeFileSync(input,YAML.stringify(data));let artifactIo=0,hookCalls=0;const stat=fs.lstatSync,access=fsp.access;
  const a=mock.method(fs,'lstatSync',(...args)=>{if(String(args[0])===path.join(f.root,'docs','one.md'))artifactIo++;return stat(...args);}),b=mock.method(fsp,'access',async(file,...args)=>{if(String(file)===path.join(f.root,'docs','one.md'))artifactIo++;return access(file,...args);});
  try{const call=()=>require('../out/core/reviewInputValidator').validateReviewInput(input,f.root,'utf8',1048576,{beforeArtifactPaths(){hookCalls++;}});if(count===501){await assert.rejects(call,/artifact references exceed maximum/);assert.equal(artifactIo,0);assert.equal(hookCalls,0);}else{assert.equal((await call()).artifacts.requirements.length,500);assert.ok(artifactIo>=500);assert.equal(hookCalls,1);}}finally{a.mock.restore();b.mock.restore();}
 }
});
