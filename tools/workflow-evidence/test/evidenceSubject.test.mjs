import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makeEvidenceRepository,runInRepository,hash} from './testSupport.mjs';
const exec=promisify(execFile),url=name=>new URL(`../lib/${name}.mjs`,import.meta.url).href;
const git=async(root,args,input)=>{if(input===undefined)return(await exec('git',args,{cwd:root,windowsHide:true,maxBuffer:40*1024*1024})).stdout.trim();const {spawn}=await import('node:child_process');return new Promise((resolve,reject)=>{const child=spawn('git',args,{cwd:root,windowsHide:true}),out=[],err=[];child.stdout.on('data',b=>out.push(b));child.stderr.on('data',b=>err.push(b));child.on('error',reject);child.on('close',code=>code?reject(Error(Buffer.concat(err).toString())):resolve(Buffer.concat(out).toString().trim()));child.stdin.end(input);});};
const importSubject=()=>import('../lib/evidenceSubject.mjs').catch(()=>({}));

test('fixtures_resolve_an_aliased_temp_parent_without_weakening_input_alias_rejection',async()=>{
 const os=await import('node:os'),base=await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()),'workflow-evidence-temp-alias-')),actual=path.join(base,'physical'),alias=path.join(base,'alias');
 await fs.mkdir(actual);await fs.symlink(actual,alias,process.platform==='win32'?'junction':'dir');
 const code=`import assert from 'node:assert/strict';import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';os.tmpdir=()=>${JSON.stringify(alias)};const support=await import(${JSON.stringify(new URL('./testSupport.mjs',import.meta.url).href)});const fixture=await support.makeEvidenceRepository({v2Packages:0});assert.equal(fixture.root,await fs.realpath(fixture.root),'fixture must have a physical temp parent');const temporary=await support.temporaryDirectory('workflow-evidence-publication-');assert.equal(temporary,await fs.realpath(temporary));process.chdir(fixture.root);const request={...fixture};delete request.root;const {captureWorkflowEvidenceSubject}=await import(${JSON.stringify(url('evidenceSubject'))});await captureWorkflowEvidenceSubject(request);const first=request.vsixSubjects[0],aliased=path.join(${JSON.stringify(alias)},path.relative(${JSON.stringify(actual)},first.path));await assert.rejects(()=>captureWorkflowEvidenceSubject({...request,vsixSubjects:[{...first,path:aliased},...request.vsixSubjects.slice(1)]}),{code:'evidence.capture.changed'});`;
 const r=await runInRepository(base,'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);
});

test('capture_is_stable_after_return_and_rejects_inflight_replacement',async()=>{
 const module=await importSubject();assert.equal(typeof module.captureWorkflowEvidenceSubject,'function','opaque evidence capture is missing');
 const fixture=await makeEvidenceRepository();
 const code=`import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {captureWorkflowEvidenceSubject} from ${JSON.stringify(url('evidenceSubject'))};import {requireSubjectState} from ${JSON.stringify(url('subjectState'))};
 const request=${JSON.stringify(fixture)};delete request.root;const s=await captureWorkflowEvidenceSubject(request),state=requireSubjectState(s),p='extensions/alpha/package.json',before=state.git.readBlob(p);const copy=state.git.readBlob(p);copy.fill(0);await fs.writeFile(p,'changed');await fs.writeFile('untracked.yaml','untracked');execFileSync('git',['-c','user.name=fixture','-c','user.email=evidence@example.invalid','commit','--allow-empty','-m','tip moved'],{windowsHide:true});let reads=0;fs.open=async()=>{reads++;throw Error('reopened')};const after=state.git.readBlob(p);console.log(JSON.stringify({frozen:Object.isFrozen(s),equal:before.equals(after),reads,tree:state.git.treeSha,archive:state.vsix[0].archive.readEntry('extension/package.json').toString()}));`;
 const r=await runInRepository(fixture.root,'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);const result=JSON.parse(r.stdout.trim().split('\n').at(-1));assert.equal(result.frozen,true);assert.equal(result.equal,true);assert.equal(result.reads,0);assert.match(result.tree,/^[0-9a-f]{40}$/);assert.equal(JSON.parse(result.archive).name,'alpha');
});

test('subject_rejects_forged_tokens_bad_commit_and_closed_request_violations',async()=>{
 const module=await importSubject();assert.equal(typeof module.captureWorkflowEvidenceSubject,'function','opaque evidence capture is missing');
 const f=await makeEvidenceRepository({v2Packages:0});
 const code=`import assert from 'node:assert/strict';import {captureWorkflowEvidenceSubject} from ${JSON.stringify(url('evidenceSubject'))};import {requireSubjectState} from ${JSON.stringify(url('subjectState'))};const request=${JSON.stringify(f)};delete request.root;const s=await captureWorkflowEvidenceSubject(request);assert.throws(()=>requireSubjectState({}));assert.throws(()=>requireSubjectState(JSON.parse(JSON.stringify(s))));for(const sha of ['main',request.commitSha.slice(0,7),requireSubjectState(s).git.treeSha])await assert.rejects(()=>captureWorkflowEvidenceSubject({...request,commitSha:sha}));for(const extra of [{...request,workflows:[]},{...request,vsixSubjects:[...request.vsixSubjects,request.vsixSubjects[0]]},{...request,vsixSubjects:Array.from({length:65},()=>({...request.vsixSubjects[0]}))},{...request,vsixSubjects:[{...request.vsixSubjects[0],expectedSha256:'0'.repeat(64)}]},{...request,vsixSubjects:[{...request.vsixSubjects[0],expectedBytes:1}]}])await assert.rejects(()=>captureWorkflowEvidenceSubject(extra));console.log('rejected');`;
 const r=await runInRepository(f.root,'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.trim(),'rejected');
});

for(const fault of ['replace','grow','truncate','partial'])test(`capture_rejects_inflight_fd_path_changes: ${fault}`,async()=>{
 const module=await importSubject();assert.equal(typeof module.captureWorkflowEvidenceSubject,'function','opaque evidence capture is missing');
 const f=await makeEvidenceRepository({v2Packages:0}),file=f.vsixSubjects[0];
 const code=`import fs from 'node:fs/promises';import assert from 'node:assert/strict';const file=${JSON.stringify(file)},originalOpen=fs.open,originalBytes=await fs.readFile(file.path);let changed=false;fs.open=async(...args)=>{const handle=await originalOpen(...args);if(args[0]===file.path){const originalRead=handle.read.bind(handle);handle.read=async(...args)=>{if(!changed){changed=true;const fault=${JSON.stringify(fault)};if(fault==='replace'){await fs.rename(file.path,file.path+'.old');await fs.writeFile(file.path,originalBytes);}if(fault==='grow')await fs.appendFile(file.path,'x');if(fault==='truncate')await fs.truncate(file.path,1);if(fault==='partial')return{bytesRead:0,buffer:args[0]};}return originalRead(...args);};}return handle;};const {captureVsixFile}=await import(${JSON.stringify(url('vsixCapture'))});await assert.rejects(()=>captureVsixFile(file));assert.equal(changed,true);console.log('rejected');`;
 const r=await runInRepository(f.root,'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.trim(),'rejected');
});

test('vsix_capture_rejects_hardlink_and_reparse_aliases',async()=>{
 const {captureVsixFile}=await import('../lib/vsixCapture.mjs').catch(()=>({}));assert.equal(typeof captureVsixFile,'function','bounded FD capture is missing');
 const f=await makeEvidenceRepository({v2Packages:0}),file=f.vsixSubjects[0];await fs.link(file.path,file.path+'.hardlink');await assert.rejects(()=>captureVsixFile(file));
 const alias=path.join(f.root,'alias');await fs.symlink(path.dirname(file.path),alias,process.platform==='win32'?'junction':'dir');await assert.rejects(()=>captureVsixFile({...file,path:path.join(alias,path.basename(file.path))}));
});

test('git_snapshot_is_nul_safe_and_bounded',async()=>{
 const {captureGitTree,parseGitTreeMetadata}=await import('../lib/gitSnapshot.mjs').catch(()=>({}));assert.equal(typeof captureGitTree,'function','fixed Git snapshot is missing');
 const oid='a'.repeat(40),rows=parseGitTreeMetadata(Buffer.from(`100644 blob ${oid}\tspace name\0`+`100644 blob ${oid}\tnew\nline\0`+`100644 blob ${oid}\tliteral\\backslash\0`));
 assert.deepEqual(rows.map(x=>x.path),['space name','new\nline','literal\\backslash']);
 assert.throws(()=>parseGitTreeMetadata(Buffer.alloc(32*1024*1024+1)),{code:'evidence.limit.exceeded'});
 assert.throws(()=>parseGitTreeMetadata(Buffer.from(Array.from({length:200001},(_,i)=>`100644 blob ${oid}\tf${i}\0`).join(''))),{code:'evidence.limit.exceeded'});
 const f=await makeEvidenceRepository({v2Packages:0});
 const g=await captureGitTree({repositoryRoot:f.root,commitSha:f.commitSha,controlPaths:[f.providerCatalogPath,f.collectionsPath]});
 assert.ok(g.metadata.length>0);assert.equal(JSON.parse(g.readBlob('extensions/alpha/package.json')).name,'alpha');assert.throws(()=>g.readBlob('untracked.yaml'));
});

test('selected_git_aliases_and_symbolic_links_are_rejected',async()=>{
 const {captureGitTree}=await import('../lib/gitSnapshot.mjs').catch(()=>({}));assert.equal(typeof captureGitTree,'function','fixed Git snapshot is missing');
 for(const [name,mode]of [['.bob/workflows/unsafe/WORKFLOW.md','120000'],['.bob/workflows/CON/WORKFLOW.md','100644'],['.bob/workflows/literal\\name/WORKFLOW.md','100644'],['.bob/workflows/cafe\u0301/WORKFLOW.md','100644']]){
  const f=await makeEvidenceRepository({v2Packages:0}),blob=await git(f.root,['hash-object','-w','--stdin'],Buffer.from('target'));
  await git(f.root,['-c','core.protectNTFS=false','-c','core.protectHFS=false','update-index','--add','--cacheinfo',`${mode},${blob},extensions/alpha/${name}`]);await git(f.root,['-c','user.name=fixture','-c','user.email=evidence@example.invalid','commit','--quiet','-m','unsafe selected path']);
  const commitSha=await git(f.root,['rev-parse','HEAD']);await assert.rejects(()=>captureGitTree({repositoryRoot:f.root,commitSha,controlPaths:[f.providerCatalogPath,f.collectionsPath]}));
 }
});

test('malformed_capture_descriptors_fail_with_fixed_codes_without_native_exception_text',async()=>{
 const {captureVsixFile}=await import('../lib/vsixCapture.mjs').catch(()=>({}));assert.equal(typeof captureVsixFile,'function','bounded FD capture is missing');
 for(const bad of [null,0,[],{}, {path:'safe',expectedBytes:1,expectedSha256:{}}])await assert.rejects(()=>captureVsixFile(bad),error=>typeof error.code==='string'&&error.code.startsWith('evidence.'));
});

test('malformed_capture_request_root_is_rejected_before_io',async()=>{
 const {captureWorkflowEvidenceSubject}=await importSubject();assert.equal(typeof captureWorkflowEvidenceSubject,'function','opaque evidence capture is missing');
 for(const bad of [null,0,[]])await assert.rejects(()=>captureWorkflowEvidenceSubject(bad),error=>typeof error.code==='string'&&error.code.startsWith('evidence.'));
});

test('selected_blob_individual_and_aggregate_limits_are_checked_before_capture',async()=>{
 const {captureGitTree}=await import('../lib/gitSnapshot.mjs').catch(()=>({}));assert.equal(typeof captureGitTree,'function','fixed Git snapshot is missing');
 for(const [bytes,count]of [[8*1024*1024+1,1],[8*1024*1024,33]]){
  const f=await makeEvidenceRepository({v2Packages:0}),blob=await git(f.root,['hash-object','-w','--stdin'],Buffer.alloc(bytes,65));
  for(let i=0;i<count;i++)await git(f.root,['update-index','--add','--cacheinfo',`100644,${blob},extensions/alpha/.bob/workflows/large${i}/WORKFLOW.md`]);
  await git(f.root,['-c','user.name=fixture','-c','user.email=evidence@example.invalid','commit','--quiet','-m','large selected input']);
  const commitSha=await git(f.root,['rev-parse','HEAD']);await assert.rejects(()=>captureGitTree({repositoryRoot:f.root,commitSha,controlPaths:[f.providerCatalogPath,f.collectionsPath]}),{code:'evidence.limit.exceeded'});
 }
});
