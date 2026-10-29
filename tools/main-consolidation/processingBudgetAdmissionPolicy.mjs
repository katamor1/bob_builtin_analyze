import {applyAggregateDocumentSourceAdmission,validateAggregateDocumentRepository} from './aggregateDocumentAdmissionPolicy.mjs';
import {applyBoundedDocumentSourceAdmission} from './boundedDocumentAdmissionPolicy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gateRInputData,gateRCanonicalJson,gateRDigest} from './gateRData.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ADMISSION='tools/main-consolidation/processing-budget-source-admission.json';
const COVERAGE='docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json';
const BASE='aa25f00f98c41c5aebdb30c68cdc967a1d205ab5';
const TREE='fc869e3735b5ddcad3dcf7e6892e290888656716';
export const PROCESSING_BUDGET_SOURCE_ADMISSION_SHA256='6c7b3e89feaa67976449c9deb04d3456968566b38b9be390015790f30f7e666a';
export const PROCESSING_BUDGET_SOURCE_COVERAGE_SHA256='a85e14013887aa28bf07c3c9c86c92761d9376ccd89a4a904a45d147b9b6a0f8';
export const PROCESSING_BUDGET_T13_SOURCE_PATHS=Object.freeze([
  ".github/workflows/processing-budget-runtime.yml",
  ".gitignore",
  "packages/processing-budget-runtime/README.md",
  "packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json",
  "packages/processing-budget-runtime/package-lock.json",
  "packages/processing-budget-runtime/package.json",
  "packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json",
  "packages/processing-budget-runtime/scripts/generate-processing-budget-contracts.js",
  "packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts",
  "packages/processing-budget-runtime/src/index.ts",
  "packages/processing-budget-runtime/src/processingBudgetError.ts",
  "packages/processing-budget-runtime/src/processingBudgetLedger.ts",
  "packages/processing-budget-runtime/src/processingBudgetProfile.ts",
  "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/tsconfig.json",
  "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
  "packages/processing-budget-runtime/test/helpers.js",
  "packages/processing-budget-runtime/test/packageContract.test.js",
  "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
  "packages/processing-budget-runtime/test/processingBudgetDefinition.test.js",
  "packages/processing-budget-runtime/test/processingBudgetLedger.test.js",
  "packages/processing-budget-runtime/tsconfig.json"
]);
export const PROCESSING_BUDGET_CONTROL_PATHS=Object.freeze([
  ".gitattributes",
  "docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json",
  "scripts/exact-head-ci-contract.test.js",
  "tools/main-consolidation/exact-head-ci-contract.json",
  "tools/main-consolidation/processing-budget-source-admission.json",
  "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
  "tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs"
]);
const baselines={
  "tools/main-consolidation/registry-bridge-source-admission.json": "1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4",
  "tools/main-consolidation/registry-discovery-source-admission.json": "c3a311ce9fb9948532234a0460b8643a93c1149bb1a10f92a737e1b71d6fd816",
  "tools/main-consolidation/registry-discovery-upstream-main-admission.json": "61be4ae3c383573d3075149d02c9ef9ac5955dc0243980b48538dcb7f07f3bd7",
  "tools/main-consolidation/feature-selection-source-universe.json": "c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79",
  "docs/release-evidence/feature-selection-ledger-2026-08-23.json": "e7603655a9f356d36938fc6d722061aa9a616fcfd8258bde05ad6c30ac9ae894"
};
export const PROCESSING_BUDGET_BASELINE_PATHS=Object.freeze(Object.keys(baselines));
const before={
  ".github/workflows/processing-budget-runtime.yml": null,
  ".gitignore": "559ab5d8e7ebce6384822e49d71d60b8ca7ee36f",
  "packages/processing-budget-runtime/README.md": null,
  "packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json": null,
  "packages/processing-budget-runtime/package-lock.json": null,
  "packages/processing-budget-runtime/package.json": null,
  "packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json": null,
  "packages/processing-budget-runtime/scripts/generate-processing-budget-contracts.js": null,
  "packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts": null,
  "packages/processing-budget-runtime/src/index.ts": null,
  "packages/processing-budget-runtime/src/processingBudgetError.ts": null,
  "packages/processing-budget-runtime/src/processingBudgetLedger.ts": null,
  "packages/processing-budget-runtime/src/processingBudgetProfile.ts": null,
  "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts": null,
  "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts": null,
  "packages/processing-budget-runtime/test/fixtures/tsconfig.json": null,
  "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts": null,
  "packages/processing-budget-runtime/test/helpers.js": null,
  "packages/processing-budget-runtime/test/packageContract.test.js": null,
  "packages/processing-budget-runtime/test/processingBudgetContracts.test.js": null,
  "packages/processing-budget-runtime/test/processingBudgetDefinition.test.js": null,
  "packages/processing-budget-runtime/test/processingBudgetLedger.test.js": null,
  "packages/processing-budget-runtime/tsconfig.json": null
};
const sourceIds={
  ".github/workflows/processing-budget-runtime.yml": [
    "source-9f42d0f519b0985a176778aa"
  ],
  ".gitignore": [
    "source-5df63668a86d46592ab24aa5"
  ],
  "packages/processing-budget-runtime/README.md": [
    "source-a8286a3ff1ab7a81e19604a5"
  ],
  "packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json": [
    "source-dbf0e78300057ea404011413"
  ],
  "packages/processing-budget-runtime/package-lock.json": [
    "source-e050742b7b51a7e281552c43"
  ],
  "packages/processing-budget-runtime/package.json": [
    "source-2dc2cff4c648616a169fa711"
  ],
  "packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json": [
    "source-df3ef033dd61514f10966848"
  ],
  "packages/processing-budget-runtime/scripts/generate-processing-budget-contracts.js": [
    "source-116ffcb1708dfab88771d924"
  ],
  "packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts": [
    "source-0ddab8f0a7385edb664ff6c5"
  ],
  "packages/processing-budget-runtime/src/index.ts": [
    "source-6ea58dc2902ca040cae5f75f"
  ],
  "packages/processing-budget-runtime/src/processingBudgetError.ts": [
    "source-5320828c1887a20eaf46dd64"
  ],
  "packages/processing-budget-runtime/src/processingBudgetLedger.ts": [
    "source-bc5ca26554439a83438dd5e7"
  ],
  "packages/processing-budget-runtime/src/processingBudgetProfile.ts": [
    "source-80994c711887d22f843b9eff"
  ],
  "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts": [
    "source-1af7f2371abe4195022a0223"
  ],
  "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts": [
    "source-c87b9592a9003fb1046dad54"
  ],
  "packages/processing-budget-runtime/test/fixtures/tsconfig.json": [
    "source-b6f88ff9b6c95adcacaded9e"
  ],
  "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts": [
    "source-75bd0042a5f39793d323ed37"
  ],
  "packages/processing-budget-runtime/test/helpers.js": [
    "source-5a8f885cd31ff13f1f53864a"
  ],
  "packages/processing-budget-runtime/test/packageContract.test.js": [
    "source-60f1d8d32af58e3c1772b1d1"
  ],
  "packages/processing-budget-runtime/test/processingBudgetContracts.test.js": [
    "source-1bed1bc5c87559b5e30af777"
  ],
  "packages/processing-budget-runtime/test/processingBudgetDefinition.test.js": [
    "source-2a80aed4ccf00e64fa21313e"
  ],
  "packages/processing-budget-runtime/test/processingBudgetLedger.test.js": [
    "source-db81d68332957cd43752ade9"
  ],
  "packages/processing-budget-runtime/tsconfig.json": [
    "source-3f97c2ee47589e0c7df351d0"
  ]
};
const fail=reason=>{throw new TypeError('Processing budget admission: '+reason)};
const digest=value=>gateRDigest(gateRCanonicalJson(value));
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))fail('exact fields');}
function data(relative){return JSON.parse(fs.readFileSync(path.join(ROOT,relative),'utf8'));}
function safeFile(root,relative){
 let current=root;
 for(const part of relative.split('/')){current=path.join(current,part);const stat=fs.lstatSync(current);if(stat.isSymbolicLink())fail('alias or symbolic link');}
 if(!fs.lstatSync(current).isFile())fail('regular file required');return current;
}
function read(root,relative){return JSON.parse(fs.readFileSync(safeFile(root,relative),'utf8'));}

export function validateProcessingBudgetCoverage(input){
 const c=gateRInputData(input,'processing budget coverage');
 exact(c,['schemaVersion','baseMainSha','baseTreeSha','sourceUniverseSha256','selectionLedgerSha256','items','remainderClosure']);
 if(c.schemaVersion!=='bob-builtin-analyze/proc-t13-ledger-source-coverage/v1'||c.baseMainSha!==BASE||c.baseTreeSha!==TREE||digest(c)!==PROCESSING_BUDGET_SOURCE_COVERAGE_SHA256)fail('sealed coverage identity');
 if(c.items.length!==23||new Set(c.items.map(x=>x.sourceItemId)).size!==23||c.remainderClosure.total!==675||c.remainderClosure.items.length!==675||c.remainderClosure.unassigned!==0)fail('complete partition');
 return true;
}
export function validateProcessingBudgetSourceAdmission(input){
 const a=gateRInputData(input,'processing budget source admission');
 exact(a,['schemaVersion','baseMainSha','baseTreeSha','sourceRows','controlRows','sourceCoverageDigest']);
 if(a.schemaVersion!=='bob-builtin-analyze/processing-budget-source-admission/v1'||a.baseMainSha!==BASE||a.baseTreeSha!==TREE||a.sourceCoverageDigest!==PROCESSING_BUDGET_SOURCE_COVERAGE_SHA256)fail('baseline identity');
 if(!Array.isArray(a.sourceRows)||!Array.isArray(a.controlRows)||JSON.stringify(a.sourceRows.map(x=>x.path))!==JSON.stringify(PROCESSING_BUDGET_T13_SOURCE_PATHS))fail('literal source paths');
 const sealedControls=PROCESSING_BUDGET_CONTROL_PATHS.filter(p=>p!==ADMISSION&&p!=='tools/main-consolidation/processingBudgetAdmissionPolicy.mjs');
 if(JSON.stringify(a.controlRows.map(x=>x.path))!==JSON.stringify(sealedControls))fail('literal control paths');
 for(const row of a.sourceRows){exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);if(row.mode!=='100644'||row.beforeBlobSha!==before[row.path]||!/^[a-f0-9]{40}$/.test(row.afterBlobSha)||JSON.stringify(row.sourceItemIds)!==JSON.stringify(sourceIds[row.path]))fail('source delta');}
 for(const row of a.controlRows){exact(row,['path','mode','blobSha']);if(row.mode!=='100644'||!/^[a-f0-9]{40}$/.test(row.blobSha))fail('control identity');}
 if(digest(a)!==PROCESSING_BUDGET_SOURCE_ADMISSION_SHA256)fail('sealed admission identity');return true;
}
export function processingBudgetT13SourceFiles(){
 const a=data(ADMISSION);validateProcessingBudgetSourceAdmission(a);
 return [...a.sourceRows.map(x=>({path:x.path,mode:x.mode,blobSha:x.afterBlobSha})),...a.controlRows].map(x=>({...x})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
// Reviewed current layers are applied separately; the T13 base remains immutable.
export function processingBudgetT14SourceFiles(){return applyBoundedDocumentSourceAdmission(fs.readFileSync(path.join(ROOT,'tools/main-consolidation/bounded-document-source-admission.json')),{domain:'processing_budget',baseFiles:processingBudgetT13SourceFiles()});}

export function processingBudgetCurrentSourceFiles(){return applyAggregateDocumentSourceAdmission(fs.readFileSync(path.join(ROOT,'tools/main-consolidation/aggregate-document-source-admission.json')),{domain:'processing_budget',baseFiles:processingBudgetT14SourceFiles()});}

export function validateProcessingBudgetRepository(root=ROOT){
 root=path.resolve(root);if(!fs.lstatSync(root).isDirectory()||fs.lstatSync(root).isSymbolicLink())fail('repository root');
 for(const [relative,expected] of Object.entries(baselines))if(gateRDigest(fs.readFileSync(safeFile(root,relative)))!==expected)fail('unchanged Owner/Discovery baseline');
 validateProcessingBudgetSourceAdmission(read(root,ADMISSION));validateProcessingBudgetCoverage(read(root,COVERAGE));
 validateAggregateDocumentRepository(root);
 const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
 const expected=processingBudgetCurrentSourceFiles(),controls=[ADMISSION,'tools/main-consolidation/processingBudgetAdmissionPolicy.mjs'];
 const required=[...new Set([...expected.map(row=>row.path),...controls])].sort();
 for(const relative of required)fs.readFileSync(safeFile(root,relative));
 const index=new Map();
 for(const line of git(['ls-files','--stage','--',...required]).split('\n')){const match=/^100644 ([0-9a-f]{40}) 0\t(.+)$/.exec(line);if(!match||index.has(match[2]))fail('index source identity');index.set(match[2],match[1]);}
 const measured=git(['hash-object','--stdin-paths'],required.join('\n')+'\n').split('\n');if(measured.length!==required.length)fail('working source inventory');
 const working=new Map(required.map((relative,position)=>[relative,measured[position]]));
 for(const row of expected){
  if(index.get(row.path)!==row.blobSha)fail('index source identity: '+row.path);
  if(working.get(row.path)!==row.blobSha)fail('working source identity: '+row.path);
 }
 for(const relative of controls)if(!index.has(relative)||working.get(relative)!==index.get(relative))fail('control working/index identity');
 const packagePrefix='packages/processing-budget-runtime/';
 const actual=[];
 function inventory(dir,relative){for(const name of fs.readdirSync(dir)){
  const file=path.join(dir,name),entry=relative+name,stat=fs.lstatSync(file);
  if(stat.isSymbolicLink())fail('package alias');
  if(relative===packagePrefix&&['node_modules','out'].includes(name)){if(!stat.isDirectory())fail('generated directory');continue;}
  if(stat.isDirectory())inventory(file,entry+'/');else if(stat.isFile())actual.push(entry);else fail('special package entry');
 }}
 inventory(path.join(root,packagePrefix),packagePrefix);
 const packagePaths=expected.filter(x=>x.path.startsWith(packagePrefix)).map(x=>x.path).sort();
 if(JSON.stringify(actual.sort())!==JSON.stringify(packagePaths))fail('unadmitted package inventory');
 for(const relative of [packagePrefix+'contracts/processing-budget-definition.v1.json',packagePrefix+'src/generatedProcessingBudgetDefinition.ts',packagePrefix+'schema/processing-budget-profile.v1.schema.json'])if(fs.readFileSync(safeFile(root,relative)).includes(13))fail('canonical contract LF');
}
