import assert from 'node:assert/strict';
import {test} from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {makeEvidenceRepository,runInRepository} from './testSupport.mjs';
const apiUrl=new URL('../lib/ciSubjects.mjs',import.meta.url).href;
test('cross_os_ci_consumes_identical_actual_vsix_and_actual_git_tree',async()=>{
 const api=await import('../lib/ciSubjects.mjs').catch(()=>({}));assert.equal(typeof api.captureCiSubjects,'function','immutable CI subject handoff is missing');
 const f=await makeEvidenceRepository(),script=[
  "import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';",
  `import {captureCiSubjects,writeCiSubjectBundle,generateCiEvidence,compareCiEvidenceDirectories} from ${JSON.stringify(apiUrl)};`,
  `const f=${JSON.stringify(f)},input={commitSha:f.commitSha,vsixPaths:f.vsixSubjects.map(x=>x.path),providerCatalogPath:f.providerCatalogPath,collectionsPath:f.collectionsPath};`,
  "const captured=await captureCiSubjects(input);assert.equal(captured.receipt.commitSha,f.commitSha);assert.equal(captured.receipt.vsix.length,3);assert.equal(captured.receipt.vsix.reduce((n,x)=>n+x.expectedBytes,0),f.vsixSubjects.reduce((n,x)=>n+x.expectedBytes,0));",
  "const subjectDirectory=path.join(f.root,'subject');await writeCiSubjectBundle(subjectDirectory,captured);",
  "const output=path.join(f.root,'os');await generateCiEvidence({subjectDirectory,outputDirectory:output,expectedCommitSha:f.commitSha});",
  "const other=path.join(f.root,'other');await fs.cp(output,other,{recursive:true});const receiptPath=path.join(other,'run-receipt.json'),receipt=JSON.parse(await fs.readFile(receiptPath));receipt.platform=process.platform==='win32'?'linux':'win32';await fs.writeFile(receiptPath,JSON.stringify(receipt));",
  "const pair=process.platform==='win32'?[other,output]:[output,other];assert.equal((await compareCiEvidenceDirectories(...pair)).state,'identical');",
  "await assert.rejects(()=>compareCiEvidenceDirectories(output,output));",
  "const original=await fs.readFile(receiptPath);for(const mutate of [r=>r.subject.sourceTreeSha='0'.repeat(40),r=>r.subject.vsix[0].expectedSha256='0'.repeat(64),r=>r.subject.vsix[0].expectedBytes++,r=>r.subject.commitSha='0'.repeat(40)]){const r=JSON.parse(original);mutate(r);await fs.writeFile(receiptPath,JSON.stringify(r));await assert.rejects(()=>compareCiEvidenceDirectories(...pair));}await fs.writeFile(receiptPath,original);",
  "await fs.appendFile(path.join(other,'evidence','report.json'),'x');await assert.rejects(()=>compareCiEvidenceDirectories(...pair));",
  "await assert.rejects(()=>generateCiEvidence({subjectDirectory,outputDirectory:path.join(f.root,'wrong-head'),expectedCommitSha:'0'.repeat(40)}));",
  "const vsix=captured.receipt.vsix[0];await fs.appendFile(path.join(subjectDirectory,vsix.path),'x');await assert.rejects(()=>generateCiEvidence({subjectDirectory,outputDirectory:path.join(f.root,'wrong-vsix'),expectedCommitSha:f.commitSha}));",
  "assert.equal(await fs.stat(path.join(f.root,'wrong-vsix')).then(()=>true,()=>false),false);console.log('actual-source-handoff-and-byte-parity');"
 ].join('\n');
 const result=await runInRepository(f.root,'--input-type=module',['--eval',script]);assert.equal(result.code,0,result.stderr);assert.equal(result.stdout.trim(),'actual-source-handoff-and-byte-parity');
});
test('ci_entrypoints_are_import_safe_and_reject_unknown_or_missing_arguments',async()=>{
 const urls=['ci-evidence.mjs','compare-evidence.mjs'].map(x=>new URL('../'+x,import.meta.url).href);
 const r=await runInRepository(process.cwd(),'--input-type=module',['--eval',`import assert from 'node:assert/strict';import fs from 'node:fs/promises';let effects=0;for(const k of ['mkdir','mkdtemp','writeFile','rename'])fs[k]=()=>{effects++;throw Error('import effect')};for(const u of ${JSON.stringify(urls)})await import(u);assert.equal(effects,0);`]);assert.equal(r.code,0,r.stderr);
 for(const file of ['ci-evidence.mjs','compare-evidence.mjs']){const r=await runInRepository(process.cwd(),new URL('../'+file,import.meta.url).pathname.replace(/^\/([A-Za-z]):/,'$1:'),['--unknown']);assert.equal(r.code,1);assert.ok(!r.stderr.includes(process.cwd()));}
});
