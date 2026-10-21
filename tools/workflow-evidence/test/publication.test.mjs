import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {runInRepository,temporaryDirectory} from './testSupport.mjs';
const moduleUrl=new URL('../lib/publishEvidence.mjs',import.meta.url).href,keys=['catalog.json','discovery.json','report.json','compiled-plan-manifest.json'];
const files=()=>Object.fromEntries(keys.map((name,index)=>[name,Buffer.from(`{"fixture":${index}}\n`)]));
async function api(){const m=await import('../lib/publishEvidence.mjs').catch(()=>({}));assert.equal(typeof m.publishEvidenceDirectory,'function','atomic evidence publisher is missing');return m;}
const temp=()=>temporaryDirectory('workflow-evidence-publication-');

test('publication_is_atomic_no_replace_under_collision_and_late_failure: complete and readonly check',async()=>{
 const {publishEvidenceDirectory}=await api(),parent=await temp(),outputDirectory=path.join(parent,'result'),payload=files();const receipt=await publishEvidenceDirectory({outputDirectory,files:payload,check:false});assert.equal(receipt.state,'published');assert.deepEqual((await fs.readdir(outputDirectory)).sort(),[...keys].sort());for(const key of keys)assert.deepEqual(await fs.readFile(path.join(outputDirectory,key)),payload[key]);const checked=await publishEvidenceDirectory({outputDirectory,files:payload,check:true});assert.equal(checked.state,'checked');await fs.appendFile(path.join(outputDirectory,'report.json'),'x');await assert.rejects(()=>publishEvidenceDirectory({outputDirectory,files:payload,check:true}));
});

test('publication_is_atomic_no_replace_under_collision_and_late_failure: occupied targets preserved',async()=>{
 const {publishEvidenceDirectory}=await api(),parent=await temp();
 for(const kind of ['empty','nonempty','file','junction']){const target=path.join(parent,kind);if(kind==='file')await fs.writeFile(target,'sentinel');else if(kind==='junction'){const actual=path.join(parent,'actual');await fs.mkdir(actual);await fs.writeFile(path.join(actual,'sentinel'),'safe');await fs.symlink(actual,target,process.platform==='win32'?'junction':'dir');}else{await fs.mkdir(target);if(kind==='nonempty')await fs.writeFile(path.join(target,'sentinel'),'safe');}const before=await fs.lstat(target,{bigint:true});await assert.rejects(()=>publishEvidenceDirectory({outputDirectory:target,files:files(),check:false}));const after=await fs.lstat(target,{bigint:true});assert.equal(after.ino,before.ino);if(kind==='file')assert.equal(await fs.readFile(target,'utf8'),'sentinel');if(kind==='nonempty'||kind==='junction')assert.equal(await fs.readFile(path.join(target,'sentinel'),'utf8'),'safe');}
});

test('kernel_promotion_refuses_an_existing_empty_directory_without_replacing_its_identity',async()=>{
 const {promoteDirectoryNoReplace}=await api();assert.equal(typeof promoteDirectoryNoReplace,'function');const parent=await temp(),source=path.join(parent,'source'),target=path.join(parent,'target');await fs.mkdir(source);await fs.mkdir(target);const before=await fs.lstat(target,{bigint:true});await assert.rejects(()=>promoteDirectoryNoReplace(source,target));assert.equal((await fs.lstat(target,{bigint:true})).ino,before.ino);assert.ok((await fs.lstat(source)).isDirectory());
});

test('kernel_promotion_refuses_an_existing_file_without_replacement',async()=>{
 const {promoteDirectoryNoReplace}=await api();const parent=await temp(),source=path.join(parent,'source'),target=path.join(parent,'target');await fs.mkdir(source);await fs.writeFile(target,'sentinel');const before=await fs.lstat(target,{bigint:true});await assert.rejects(()=>promoteDirectoryNoReplace(source,target));assert.equal((await fs.lstat(target,{bigint:true})).ino,before.ino);assert.equal(await fs.readFile(target,'utf8'),'sentinel');assert.ok((await fs.lstat(source)).isDirectory());
});

test('publication_is_atomic_no_replace_under_collision_and_late_failure: concurrent processes',async()=>{
 await api();const parent=await temp(),output=path.join(parent,'shared');const scripts=['A','B'].map(tag=>`import {publishEvidenceDirectory} from ${JSON.stringify(moduleUrl)};const files=Object.fromEntries(${JSON.stringify(keys)}.map((key,i)=>[key,Buffer.from(JSON.stringify({index:i,writer:${JSON.stringify(tag)}})+'\\n')]));try{await publishEvidenceDirectory({outputDirectory:${JSON.stringify(output)},files,check:false});console.log('published')}catch(e){if(e.code!=='evidence.publication.conflict')throw e;console.log('conflict')}`);
 const results=await Promise.all(scripts.map(code=>runInRepository(parent,'--input-type=module',['--eval',code])));for(const r of results)assert.equal(r.code,0,r.stderr);assert.equal(results.filter(r=>r.stdout.trim()==='published').length,1);assert.equal(results.filter(r=>r.stdout.trim()==='conflict').length,1);const writers=await Promise.all(keys.map(async key=>JSON.parse(await fs.readFile(path.join(output,key),'utf8')).writer));assert.equal(new Set(writers).size,1);
});

for(const fault of ['write','sync','parent'])test(`publication_is_atomic_no_replace_under_collision_and_late_failure: ${fault}`,async()=>{
 await api();
 const parent=await temp(),output=path.join(parent,'result');
 const code=[
  "import assert from 'node:assert/strict';",
  "import fs from 'node:fs/promises';",
  "import path from 'node:path';",
  `const parent=${JSON.stringify(parent)},moved=${JSON.stringify(parent+'.moved')},fault=${JSON.stringify(fault)};`,
  "assert.equal(path.dirname(parent),path.dirname(moved));assert.ok(path.basename(parent).startsWith('workflow-evidence-publication-'));",
  "const open=fs.open,originalRename=fs.rename;let injected=false;",
  "fs.open=async(...args)=>{const h=await open(...args);if(path.basename(String(args[0]))==='compiled-plan-manifest.json'){const write=h.writeFile.bind(h),sync=h.sync.bind(h),close=h.close.bind(h);h.writeFile=async(...a)=>{if(fault==='write'){injected=true;throw Error('late write failure')}return write(...a)};h.sync=async()=>{if(fault==='sync'){injected=true;throw Error('late sync failure')}return sync()};h.close=async()=>{await close();if(fault==='parent'){await originalRename(parent,moved);await fs.mkdir(parent);injected=true}};}return h};",
  `const {publishEvidenceDirectory,publicationFailureReceipt}=await import(${JSON.stringify(moduleUrl)});`,
  `const files=Object.fromEntries(${JSON.stringify(keys)}.map((key,i)=>[key,Buffer.from(JSON.stringify({fixture:i})+String.fromCharCode(10))]));`,
  `let error;try{await publishEvidenceDirectory({outputDirectory:${JSON.stringify(output)},files,check:false})}catch(e){error=e}`,
  "assert.ok(error);assert.equal(injected,true);",
  `await assert.rejects(()=>fs.lstat(${JSON.stringify(output)}));`,
  "const receipt=publicationFailureReceipt(error);assert.equal(receipt.state,'failed');assert.ok(receipt.stagingLocator);",
  "const owned=await fs.readdir(fault==='parent'?moved:parent);assert.ok(owned.some(name=>name.startsWith('.workflow-evidence-staging-')));console.log('retained')"
 ].join('\n');
 const r=await runInRepository(path.dirname(parent),'--input-type=module',['--eval',code]);assert.equal(r.code,0,r.stderr);assert.equal(r.stdout.trim(),'retained');
});
test('oversized_or_accessor_file_bundles_fail_before_any_staging_write',async()=>{
 const {publishEvidenceDirectory}=await api(),parent=await temp(),outputDirectory=path.join(parent,'result'),payload=files();for(const name of keys){const large={...payload,[name]:Buffer.alloc(8*1024*1024+1)};await assert.rejects(()=>publishEvidenceDirectory({outputDirectory,files:large,check:false}));}let getter=0;const hostile=files();Object.defineProperty(hostile,'report.json',{enumerable:true,get(){getter++;return Buffer.from('{}')}});await assert.rejects(()=>publishEvidenceDirectory({outputDirectory,files:hostile,check:false}));assert.equal(getter,0);assert.deepEqual(await fs.readdir(parent),[]);
});
