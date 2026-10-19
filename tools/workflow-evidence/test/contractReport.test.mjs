import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeEvidenceRepository,runInRepository} from './testSupport.mjs';
const url=name=>new URL(`../lib/${name}.mjs`,import.meta.url).href;

test('report_joins_only_same_subject_verified_results',async()=>{
 const api=await import('../lib/contractReport.mjs').catch(()=>({}));assert.equal(typeof api.createWorkflowContractReport,'function','provenance-bound report is missing');
 const f=await makeEvidenceRepository();
 const code=[
  `import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {createRequire} from 'node:module';`,
  `import {captureWorkflowEvidenceSubject} from ${JSON.stringify(url('evidenceSubject'))};`,
  `import {buildWorkflowContributionCatalog} from ${JSON.stringify(url('contributionCatalog'))};`,
  `import {discoverTrackedWorkflows} from ${JSON.stringify(url('trackedDiscovery'))};`,
  `import {compileWorkflowEvidence} from ${JSON.stringify(url('compileEvidence'))};`,
  `import {createWorkflowContractReport,generateEvidenceBytes} from ${JSON.stringify(url('contractReport'))};`,
  `import {digestBytes} from ${JSON.stringify(url('primitives'))};`,
  `const request=${JSON.stringify(f)};delete request.root;`,
  `const s=await captureWorkflowEvidenceSubject(request),c=buildWorkflowContributionCatalog(s),d=discoverTrackedWorkflows(s,c),p=await compileWorkflowEvidence(s,d),r=createWorkflowContractReport(s,c,d,p),files=await generateEvidenceBytes(s);`,
  `assert.equal(r.schemaVersion,'workflow-discovery-report/v1');assert.equal(r.state,'verified');`,
  `assert.equal(r.catalogDigest,digestBytes(files['catalog.json']));assert.equal(r.discoveryDigest,digestBytes(files['discovery.json']));assert.equal(r.compiledManifestDigest,digestBytes(files['compiled-plan-manifest.json']));assert.equal(Object.hasOwn(r,'reportDigest'),false);`,
  `assert.ok(Object.isFrozen(r.workflows));assert.ok(r.workflows.filter(x=>x.classification==='inventory_only').every(x=>x.compilation===null));assert.equal(r.workflows.filter(x=>x.compilation!==null).length,1);`,
  `for(const args of [[s,JSON.parse(JSON.stringify(c)),d,p],[s,c,JSON.parse(JSON.stringify(d)),p],[s,c,d,JSON.parse(JSON.stringify(p))],[await captureWorkflowEvidenceSubject(request),c,d,p]])assert.throws(()=>createWorkflowContractReport(...args));`,
  `assert.throws(()=>Object.defineProperty(c.owners[0].archive,'bytes',{value:0}));const first=Buffer.from(files['report.json']);files['catalog.json'].fill(0);assert.deepEqual((await generateEvidenceBytes(s))['report.json'],first);`,
  `const require=createRequire(${JSON.stringify(new URL('../../../extensions/workflow-register/package.json',import.meta.url).href)}),Ajv=require('ajv/dist/2020').default;`,
  `const schema=JSON.parse(await fs.readFile(new URL(${JSON.stringify(new URL('../schemas/workflow-discovery-report.v1.schema.json',import.meta.url).href)}),'utf8')),check=new Ajv({strict:true}).compile(schema);assert.equal(check(r),true,JSON.stringify(check.errors));assert.equal(check({...r,hostPath:process.cwd()}),false);`,
  `console.log(JSON.stringify({keys:Object.keys(files).sort(),reportText:first.toString()}));`
 ].join('\n');
 const result=await runInRepository(f.root,'--input-type=module',['--eval',code]);assert.equal(result.code,0,result.stderr);const r=JSON.parse(result.stdout.trim());
 assert.deepEqual(r.keys,['catalog.json','compiled-plan-manifest.json','discovery.json','report.json']);assert.ok(!r.reportText.includes(JSON.stringify(f.root).slice(1,-1)));assert.ok(!r.reportText.includes(f.commitSha));
});
