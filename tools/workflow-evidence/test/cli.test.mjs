import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {makeEvidenceRepository,runInRepository} from './testSupport.mjs';
import {canonicalBytes} from '../lib/primitives.mjs';
const reportEntry=new URL('../generate-workflow-contract-report.mjs',import.meta.url),discoverEntry=new URL('../discover-tracked-workflows.mjs',import.meta.url),cliUrl=new URL('../lib/cli.mjs',import.meta.url).href;
test('cli_is_import_safe_bounded_and_check_is_read_only',async()=>{
 const m=await import('../lib/cli.mjs').catch(()=>({}));assert.equal(typeof m.runEvidenceCli,'function','shared evidence CLI is missing');const f=await makeEvidenceRepository(),descriptor=path.join(f.root,'subjects.json'),output=path.join(f.root,'output');await fs.writeFile(descriptor,canonicalBytes(f.vsixSubjects));const args=['--commit',f.commitSha,'--subjects',descriptor,'--provider-catalog',f.providerCatalogPath,'--collections',f.collectionsPath,'--output-directory',output];
 const first=await runInRepository(f.root,reportEntry.pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:'),args);assert.equal(first.code,0,first.stderr);const before=await fs.readFile(path.join(output,'report.json'));
 const code=`import fs from 'node:fs/promises';import {constants} from 'node:fs';let writes=0;const originalOpen=fs.open;fs.open=async(...a)=>{if(typeof a[1]==='string'?a[1]!=='r'&&a[1]!=='rs':Boolean(a[1]&(constants.O_WRONLY|constants.O_RDWR|constants.O_CREAT|constants.O_TRUNC|constants.O_APPEND))){writes++;throw Error('check opened for write')}return originalOpen(...a)};for(const key of ['mkdir','mkdtemp','writeFile','rename','copyFile','appendFile'])fs[key]=async()=>{writes++;throw Error('check wrote to disk')};const {runEvidenceCli}=await import(${JSON.stringify(cliUrl)});const code=await runEvidenceCli(${JSON.stringify([...args,'--check'])},{mode:'report'});if(code!==0||writes!==0)throw Error('check failed or wrote');`;
 const checked=await runInRepository(f.root,'--input-type=module',['--eval',code]);assert.equal(checked.code,0,checked.stderr);assert.deepEqual(await fs.readFile(path.join(output,'report.json')),before);
 for(const bad of [[...args,'--commit',f.commitSha],[...args,'--manual-catalog','x'],[...args,'--compiler','legacy'],args.map(x=>x===f.commitSha?'main':x)]){const r=await runInRepository(f.root,reportEntry.pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:'),bad);assert.notEqual(r.code,0);assert.ok(!r.stderr.includes(f.root));}
 await fs.appendFile(path.join(output,'report.json'),'x');assert.notEqual((await runInRepository(f.root,reportEntry.pathname.replace(/^\/(?:([A-Za-z]):)/,'$1:'),[...args,'--check'])).code,0);
 const imported=await runInRepository(f.root,'--input-type=module',['--eval',`import fs from 'node:fs/promises';import cp from 'node:child_process';let effects=0;for(const name of ['mkdir','writeFile','rename','mkdtemp'])fs[name]=()=>{effects++;throw Error('import effect')};cp.spawn=()=>{effects++;throw Error('import spawn')};await import(${JSON.stringify(reportEntry.href)});await import(${JSON.stringify(discoverEntry.href)});if(effects)throw Error('import side effect');console.log('import-safe')`]);assert.equal(imported.code,0,imported.stderr);assert.equal(imported.stdout.trim(),'import-safe');
});

test('entrypoints_import_without_compiled_output_and_report_fixed_build_required_error',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'workflow-evidence-unbuilt-')),toolRoot=path.join(root,'tools','workflow-evidence');
 await fs.mkdir(path.dirname(toolRoot),{recursive:true});await fs.cp(fileURLToPath(new URL('../',import.meta.url)),toolRoot,{recursive:true});
 const entries=['discover-tracked-workflows.mjs','generate-workflow-contract-report.mjs'];
 const imported=await runInRepository(root,'--input-type=module',['--eval',entries.map(name=>`await import(${JSON.stringify(new URL(name,new URL(`file:///${toolRoot.replaceAll('\\','/')}/`)).href)});`).join('\n')]);
 assert.equal(imported.code,0,imported.stderr);assert.equal(imported.stdout,'');
 const descriptor=path.join(root,'subjects.json');await fs.writeFile(descriptor,'[]\n');
 const run=await runInRepository(root,path.join(toolRoot,entries[1]),['--commit','0'.repeat(40),'--subjects',descriptor,'--provider-catalog','provider.json','--collections','collections.json','--output-directory',path.join(root,'output')]);
 assert.equal(run.code,1);assert.equal(run.stdout,'');assert.deepEqual(JSON.parse(run.stderr),{code:'evidence.build.required',diagnostics:[]});assert.ok(!run.stderr.includes(root));
});
