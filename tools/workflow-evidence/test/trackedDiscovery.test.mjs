import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {makeEvidenceRepository,runInRepository,makeZip,hash} from './testSupport.mjs';
import {validateVsixArchive} from '../lib/vsixArchive.mjs';
const exec=promisify(execFile),url=name=>new URL(`../lib/${name}.mjs`,import.meta.url).href;
async function available(){const m=await import('../lib/trackedDiscovery.mjs').catch(()=>({}));assert.equal(typeof m.discoverTrackedWorkflows,'function','tracked workflow classifier is missing');}
async function write(f,relative,bytes){const p=path.join(f.root,relative);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);}
async function commit(f){await exec('git',['-c','core.autocrlf=false','add','--','extensions','.bob'],{cwd:f.root,windowsHide:true});await exec('git',['-c','user.name=fixture','-c','user.email=evidence@example.invalid','commit','--quiet','--allow-empty','-m','discovery fixture'],{cwd:f.root,windowsHide:true});f.commitSha=(await exec('git',['rev-parse','HEAD'],{cwd:f.root,windowsHide:true})).stdout.trim();}
async function claims(f,edit){
 const relative='contracts/workflow-discovery-claims.json',p=path.join(f.root,'extensions/alpha',relative),data=JSON.parse(await fs.readFile(p));edit(data);const bytes=Buffer.from(JSON.stringify(data)+'\n');await fs.writeFile(p,bytes);
 const descriptor=f.vsixSubjects[0],archive=validateVsixArchive(await fs.readFile(descriptor.path)),entries=archive.entries.map(row=>({name:row.path,data:row.path==='extension/'+relative?bytes:archive.readEntry(row.path),method:8})),updated=makeZip({entries});await fs.writeFile(descriptor.path,updated);descriptor.expectedBytes=updated.length;descriptor.expectedSha256=hash(updated);
}
async function evaluate(f,{errorCode}={}){
 const code=`import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';import {captureWorkflowEvidenceSubject} from ${JSON.stringify(url('evidenceSubject'))};import {buildWorkflowContributionCatalog} from ${JSON.stringify(url('contributionCatalog'))};const request=${JSON.stringify(f)};delete request.root;const subject=await captureWorkflowEvidenceSubject(request),catalog=buildWorkflowContributionCatalog(subject);const require=createRequire(${JSON.stringify(new URL('../../../extensions/workflow-register/package.json',import.meta.url).href)}),compiler=require('./out/core/contractV2/compiler.js');let compilerCalls=0;compiler.compileWorkflowPackage=()=>{compilerCalls++;throw Error('V1 compiler invoked')};const {discoverTrackedWorkflows}=await import(${JSON.stringify(url('trackedDiscovery'))});let reads=0;for(const key of ['readFile','readdir','open','stat','lstat','realpath'])fs[key]=async()=>{reads++;throw Error('live filesystem read')};${errorCode?`assert.throws(()=>discoverTrackedWorkflows(subject,catalog),e=>e.code===${JSON.stringify(errorCode)}&&e.diagnostics.length>0);console.log(JSON.stringify({rejected:true,compilerCalls,reads}));`:`const discovery=discoverTrackedWorkflows(subject,catalog);assert.throws(()=>discoverTrackedWorkflows(subject,JSON.parse(JSON.stringify(catalog))));console.log(JSON.stringify({discovery,compilerCalls,reads,frozen:Object.isFrozen(discovery.candidates)}));`}`;
 const r=await runInRepository(f.root,'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);return JSON.parse(r.stdout.trim());
}

test('tracked_discovery_has_exact_classification_without_live_reads',async()=>{
 await available();const f=await makeEvidenceRepository();await write(f,'extensions/alpha/fixtures/flat/WORKFLOW.md','flat tracked V1\n');await commit(f);
 const oid=(await exec('git',['rev-parse','HEAD:extensions/alpha/package.json'],{cwd:f.root,windowsHide:true})).stdout.trim();await exec('git',['-c','core.protectNTFS=false','update-index','--add','--cacheinfo',`100644,${oid},extensions/alpha/fixtures/nul\nsafe.txt`],{cwd:f.root,windowsHide:true});await exec('git',['-c','user.name=fixture','-c','user.email=evidence@example.invalid','commit','--quiet','-m','NUL-safe metadata'],{cwd:f.root,windowsHide:true});f.commitSha=(await exec('git',['rev-parse','HEAD'],{cwd:f.root,windowsHide:true})).stdout.trim();await write(f,'extensions/alpha/fixtures/untracked/WORKFLOW.md','not tracked');
 const {discovery:d,reads,frozen}=await evaluate(f);assert.equal(reads,0);assert.equal(frozen,true);assert.equal(d.coverage.total,d.candidates.length);assert.equal(d.coverage.unclassified,0);assert.equal(d.coverage.ambiguous,0);assert.ok(d.candidates.some(x=>x.path==='.bob/workflows/alpha/WORKFLOW.md'));assert.ok(d.candidates.some(x=>x.path==='extensions/alpha/fixtures/flat/WORKFLOW.md'));assert.ok(!d.candidates.some(x=>x.path.includes('untracked')||x.path.includes('nul\n')));
 assert.deepEqual(d.candidates.map(x=>x.path),d.candidates.map(x=>x.path).sort());
});

test('v1_inventory_does_not_invoke_a_compiler',async()=>{
 await available();const f=await makeEvidenceRepository({v2Packages:0}),result=await evaluate(f),rows=result.discovery.candidates;
 assert.equal(result.compilerCalls,0);assert.equal(rows.length,6);assert.ok(rows.every(x=>x.classification==='inventory_only'));assert.ok(rows.every(x=>/^[0-9a-f]{64}$/.test(x.sha256)&&x.bytes>0));
});

test('only_explicit_published_v2_is_compile_eligible',async()=>{
 await available();const f=await makeEvidenceRepository();await write(f,'extensions/alpha/fixtures/unselected/workflow.yaml','invalid fixture YAML is inventory only: [\n');await write(f,'extensions/alpha/negatives/WORKFLOW.md','explicitly negative fixture');await claims(f,c=>c.exclusions.push({path:'negatives/WORKFLOW.md',reason:'negative_fixture'}));await commit(f);
 const {discovery:d,compilerCalls}=await evaluate(f);assert.equal(compilerCalls,0);assert.equal(d.candidates.filter(x=>x.classification==='published_v2').length,1);assert.equal(d.candidates.filter(x=>x.classification==='unselected_v2').length,1);assert.equal(d.candidates.filter(x=>x.classification==='negative_fixture').length,1);assert.equal(d.coverage.excluded,1);assert.equal(d.coverage.total,d.coverage.classified+d.coverage.excluded);assert.equal(d.candidates.filter(x=>x.path.includes('/versions/')).length,0);
});

test('unclassified_owned_workflow_is_not_normal_coverage',async()=>{
 await available();const f=await makeEvidenceRepository({v2Packages:0});await write(f,'extensions/alpha/unknown/WORKFLOW.md','unclaimed');await commit(f);const result=await evaluate(f,{errorCode:'evidence.discovery.unclassified'});assert.equal(result.rejected,true);assert.equal(result.reads,0);
});

test('ambiguous_role_between_owned_scope_and_mirror_is_rejected',async()=>{
 await available();const f=await makeEvidenceRepository(),bytes=await fs.readFile(path.join(f.root,'extensions/alpha/templates/.bob/workflows/alpha/WORKFLOW.md'));await write(f,'extensions/alpha/fixtures/mirror/WORKFLOW.md',bytes);await claims(f,c=>{c.mirrors[0].destination='extensions/alpha/fixtures/mirror/WORKFLOW.md';});await commit(f);assert.equal((await evaluate(f,{errorCode:'evidence.discovery.ambiguous'})).rejected,true);
});

test('missing_published_generation_is_not_normal_coverage',async()=>{
 await available();const f=await makeEvidenceRepository(),version=path.join(f.root,'extensions/alpha/fixtures/published/minimal/versions');await fs.rename(version,version+'.missing');await commit(f);assert.equal((await evaluate(f,{errorCode:'evidence.discovery.unclassified'})).rejected,true);
});
