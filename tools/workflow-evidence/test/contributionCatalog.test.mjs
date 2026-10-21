import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createRequire} from 'node:module';
import {makeEvidenceRepository,runInRepository,makeZip,hash} from './testSupport.mjs';
import {validateVsixArchive} from '../lib/vsixArchive.mjs';
const exec=promisify(execFile),moduleUrl=new URL('../lib/contributionCatalog.mjs',import.meta.url).href;
const available=()=>import('../lib/contributionCatalog.mjs').catch(()=>({}));
async function catalog(f,{fail=false}={}){
 const code=`import assert from 'node:assert/strict';import {captureWorkflowEvidenceSubject} from ${JSON.stringify(new URL('../lib/evidenceSubject.mjs',import.meta.url).href)};import {buildWorkflowContributionCatalog,contributionCatalogDigests} from ${JSON.stringify(moduleUrl)};const request=${JSON.stringify(f)};delete request.root;${fail?`await assert.rejects(async()=>buildWorkflowContributionCatalog(await captureWorkflowEvidenceSubject(request)),e=>typeof e.code==='string'&&e.code.startsWith('evidence.'));console.log('rejected');`:`const s=await captureWorkflowEvidenceSubject(request),c=buildWorkflowContributionCatalog(s);const decoder=TextDecoder.prototype.decode;TextDecoder.prototype.decode=()=>{throw Error('payload decoded again')};assert.equal(buildWorkflowContributionCatalog(s),c);TextDecoder.prototype.decode=decoder;console.log(JSON.stringify({catalog:c,digests:contributionCatalogDigests(s,c),frozen:Object.isFrozen(c.owners[0].assets)}));`}`;
 const r=await runInRepository(f.root,'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);return fail?r.stdout.trim():JSON.parse(r.stdout.trim());
}
async function rewrite(f,index,edit,{source=true,reorder=false}={}){
 const descriptor=f.vsixSubjects[index],archive=validateVsixArchive(await fs.readFile(descriptor.path));
 let entries=archive.entries.map(row=>({name:row.path,data:archive.readEntry(row.path),method:8}));
 const owner=['alpha','beta','gamma'][index];
 const set=async(relative,value)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value)+'\n'),name=`extension/${relative}`,entry=entries.find(x=>x.name===name);if(entry)entry.data=bytes;else entries.push({name,data:bytes,method:8});if(source){const p=path.join(f.root,'extensions',owner,relative);await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,bytes);}return bytes;};
 const read=relative=>JSON.parse(entries.find(x=>x.name===`extension/${relative}`).data);
 await edit({entries,set,read,owner});if(reorder)entries=entries.reverse();
 const bytes=makeZip({entries});await fs.writeFile(descriptor.path,bytes);descriptor.expectedSha256=hash(bytes);descriptor.expectedBytes=bytes.length;
 if(source){await exec('git',['-c','core.autocrlf=false','add','--','extensions','.bob'],{cwd:f.root,windowsHide:true});await exec('git',['-c','user.name=fixture','-c','user.email=evidence@example.invalid','commit','--quiet','--allow-empty','-m','mutation'],{cwd:f.root,windowsHide:true});f.commitSha=(await exec('git',['rev-parse','HEAD'],{cwd:f.root,windowsHide:true})).stdout.trim();}
}

test('same_version_payload_and_command_drift_is_not_equivalent',async()=>{
 assert.equal(typeof(await available()).buildWorkflowContributionCatalog,'function','immutable contribution catalog is missing');
 const f=await makeEvidenceRepository(),original=await catalog(f),asset=original.catalog.owners[0].assets[0];
 assert.equal(original.catalog.schemaVersion,'workflow-discovery-catalog/v1');assert.equal(original.frozen,true);
 const require=createRequire(import.meta.url),Ajv=require('../../../extensions/workflow-register/node_modules/ajv/dist/2020').default,schema=JSON.parse(await fs.readFile(new URL('../schemas/workflow-discovery-catalog.v1.schema.json',import.meta.url))),check=new Ajv({strict:true}).compile(schema);
 assert.equal(check(original.catalog),true,JSON.stringify(check.errors));assert.equal(check({...original.catalog,lookup:{}}),false);
 await rewrite(f,0,async({set,owner})=>{const bytes=await set(`templates/.bob/workflows/${owner}/WORKFLOW.md`,Buffer.from('changed exact template\n'));await fs.writeFile(path.join(f.root,`.bob/workflows/${owner}/WORKFLOW.md`),bytes);});
 const changed=await catalog(f);assert.notEqual(asset.sha256,changed.catalog.owners[0].assets[0].sha256);assert.notEqual(original.digests.catalogDigest,changed.digests.catalogDigest);
 await rewrite(f,0,async({set,read})=>{const p=read('package.json');p.contributes.commands.push({command:'alpha.new',title:'New'});await set('package.json',p);},{source:false});assert.equal(await catalog(f,{fail:true}),'rejected');
});

test('claims_schema_rejects_noncanonical_owner_versions_and_unknown_fields',async()=>{
 const require=createRequire(import.meta.url),Ajv=require('../../../extensions/workflow-register/node_modules/ajv/dist/2020').default,schema=JSON.parse(await fs.readFile(new URL('../schemas/workflow-discovery-claims.v1.schema.json',import.meta.url))),check=new Ajv({strict:true}).compile(schema);
 const value={schemaVersion:'workflow-discovery-claims/v1',owner:{id:'fixture.alpha',version:'1.0.0'},scopes:[],exclusions:[],externalCommands:[],mirrors:[]};assert.equal(check(value),true);
 for(const version of ['v1.0.0','01.0.0','1.0.0-01'])assert.equal(check({...value,owner:{...value.owner,version}}),false,'noncanonical owner version accepted');
 assert.equal(check({...value,manualCatalog:{}}),false);
});

test('archive_metadata_only_changes_full_identity',async()=>{
 assert.equal(typeof(await available()).buildWorkflowContributionCatalog,'function','immutable contribution catalog is missing');
 const f=await makeEvidenceRepository({v2Packages:0}),first=await catalog(f);await rewrite(f,0,async()=>{},{source:false,reorder:true});const second=await catalog(f);
 assert.equal(first.digests.semanticCatalogDigest,second.digests.semanticCatalogDigest);assert.notEqual(first.digests.catalogDigest,second.digests.catalogDigest);
 assert.deepEqual(second.catalog.owners.map(x=>x.archive.sha256).sort(),f.vsixSubjects.map(x=>x.expectedSha256).sort());
});

test('package_source_and_vsce_metadata_bytes_are_separate_but_identity_is_checked',async()=>{
 assert.equal(typeof(await available()).buildWorkflowContributionCatalog,'function','immutable contribution catalog is missing');
 const f=await makeEvidenceRepository({v2Packages:0});await rewrite(f,0,async({set,read})=>{const p=read('package.json');p.__metadata={targetPlatform:'undefined'};await set('package.json',Buffer.from(JSON.stringify(p,null,2)));},{source:false});const result=await catalog(f),p=result.catalog.owners[0].package;
 assert.notEqual(p.source.sha256,p.vsix.sha256);assert.equal(result.catalog.owners[0].owner.id,'fixture.alpha');
});

const invalidCases=[
 ['malformed contributes',async x=>{const p=x.read('package.json');p.contributes=[];await x.set('package.json',p);}],
 ['explicit null commands',async x=>{const p=x.read('package.json');p.contributes.commands=null;await x.set('package.json',p);}],
 ['invalid UTF8 package',async x=>x.set('package.json',Buffer.from([0xff]))],
 ['duplicate commands',async x=>{const p=x.read('package.json');p.contributes.commands.push(p.contributes.commands[0]);await x.set('package.json',p);}],
 ['owner mismatch',async x=>{const m=x.read('contracts/workflow-contributions.json');m.owner.id='fixture.wrong';await x.set('contracts/workflow-contributions.json',m);}],
 ['overlapping scopes',async x=>{const c=x.read('contracts/workflow-discovery-claims.json');c.scopes.push({prefix:'templates/.bob/',role:'sample'});await x.set('contracts/workflow-discovery-claims.json',c);}],
 ['untracked exclusion',async x=>{const c=x.read('contracts/workflow-discovery-claims.json');c.exclusions.push({path:'missing/WORKFLOW.md',reason:'negative_fixture'});await x.set('contracts/workflow-discovery-claims.json',c);}],
 ['scope exclusion collision',async x=>{const c=x.read('contracts/workflow-discovery-claims.json');c.exclusions.push({path:`templates/.bob/workflows/${x.owner}/WORKFLOW.md`,reason:'negative_fixture'});await x.set('contracts/workflow-discovery-claims.json',c);}],
 ['external command scope escape',async x=>{const c=x.read('contracts/workflow-discovery-claims.json');c.externalCommands.push({id:'external.command',scope:'other/'});await x.set('contracts/workflow-discovery-claims.json',c);}],
 ['mirror byte drift',async x=>x.set(`templates/.bob/workflows/${x.owner}/WORKFLOW.md`,Buffer.from('wrong mirror bytes'))],
 ['mirror path escape',async x=>{const c=x.read('contracts/workflow-discovery-claims.json');c.mirrors[0].destination='../outside';await x.set('contracts/workflow-discovery-claims.json',c);}],
 ['missing declared payload',async x=>{x.entries.splice(x.entries.findIndex(x=>x.name.includes('/templates/')),1);}],
 ['absent manifest',async x=>{x.entries.splice(x.entries.findIndex(x=>x.name==='extension/contracts/workflow-contributions.json'),1);}],
 ['closed claims',async x=>{const c=x.read('contracts/workflow-discovery-claims.json');c.lookup={};await x.set('contracts/workflow-discovery-claims.json',c);}]
];
for(const [name,edit]of invalidCases)test(`claims_are_scoped_and_mirrors_bind_exact_bytes: ${name}`,async()=>{
 assert.equal(typeof(await available()).buildWorkflowContributionCatalog,'function','immutable contribution catalog is missing');
 const f=await makeEvidenceRepository({v2Packages:0});await rewrite(f,0,edit);assert.equal(await catalog(f,{fail:true}),'rejected');
});

test('catalog_rejects_cross_owner_identifier_and_registry_range_collisions',async()=>{
 assert.equal(typeof(await available()).buildWorkflowContributionCatalog,'function','immutable contribution catalog is missing');
 for(const mutation of ['id','range']){const f=await makeEvidenceRepository({v2Packages:0});await rewrite(f,1,async({read,set})=>{const m=read('contracts/workflow-contributions.json');if(mutation==='id')m.action_providers[0].id='alpha.run';else m.registry_api={min:'provider-registry/v2',max:'provider-registry/v2'};await set('contracts/workflow-contributions.json',m);});assert.equal(await catalog(f,{fail:true}),'rejected');}
});

test('claims_reject_folded_parent_scope_alias_independent_of_original_sort_order',async()=>{
 const {parseDiscoveryClaims}=await import('../lib/discoveryClaims.mjs');
 const owner={id:'fixture.alpha',version:'1.0.0'},value={schemaVersion:'workflow-discovery-claims/v1',owner,scopes:[{prefix:'z/',role:'sample'},{prefix:'Z/a/',role:'fixture'}],exclusions:[],externalCommands:[],mirrors:[]};
 assert.throws(()=>parseDiscoveryClaims(Buffer.from(JSON.stringify(value)),owner));
});

test('catalog_rejects_a_mirror_inside_another_owner_even_when_payload_bytes_match',async()=>{
 const f=await makeEvidenceRepository({v2Packages:0}),betaPath='extensions/beta/templates/.bob/workflows/beta/WORKFLOW.md',betaBytes=await fs.readFile(path.join(f.root,betaPath));
 await rewrite(f,0,async({set,read})=>{await set('templates/.bob/workflows/alpha/WORKFLOW.md',betaBytes);const c=read('contracts/workflow-discovery-claims.json');c.mirrors[0].destination=betaPath;await set('contracts/workflow-discovery-claims.json',c);});
 assert.equal(await catalog(f,{fail:true}),'rejected');
});
