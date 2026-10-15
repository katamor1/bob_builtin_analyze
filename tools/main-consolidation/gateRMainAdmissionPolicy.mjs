import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { gateRCanonicalJson, gateRDigest, gateRInputData, gateRPathRows, readGateRContainedFile } from './gateRData.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fail = reason => { throw new TypeError('Gate R main admission: ' + reason); };
export const GATE_R_MAIN_ADMISSION_SHA256 = 'c96f87778f7819e74edb650fe1ad93744531e20e6c309f63d9b7cf6097fee131';
// ADMITTED_DELTAS_START
const admittedDeltas = [
  {
    "path": "extensions/workflow-register/.vscodeignore",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/check-contract-v2-runtime-reachability.js",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/check-vsix-policy.js",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/recompress-vsix.js",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/index.ts",
    "familyIds": [
      "source-5878428770ba85ec6765b380"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/planLease.ts",
    "familyIds": [
      "source-9aad994c88d618f45c216249"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/runLeaseExecutionCoordinator.ts",
    "familyIds": [
      "source-04042ee1d12b54981a558cd1",
      "source-b06ff4b70ad3a69d34490e7e"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/runPlanLeaseContext.ts",
    "familyIds": [
      "source-299b38c2a6c3696dbc79dd52",
      "source-9aad994c88d618f45c216249",
      "source-ba622294349bb562549c5825"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/runPlanProvenance.ts",
    "familyIds": [
      "source-7ae51bbef33180664889fba4",
      "source-9aad994c88d618f45c216249"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/runPlanState.ts",
    "familyIds": [
      "source-a7f21730f621e090b2aed5e9"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/modelRuntime.ts",
    "familyIds": [
      "source-50f29b856d5d39f3e342ca85",
      "source-5206f6fdf1c711d1bb161d62"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/runProvenance.ts",
    "familyIds": [
      "source-0ee8bd8c0cf158480af89527"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/runtime/runStateCodec.ts",
    "familyIds": [
      "source-7ae51bbef33180664889fba4"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/runtime/runStateStore.ts",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f",
      "source-fde858a48c84d66184d3513a"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowContractV2ExecutionGuard.ts",
    "familyIds": [
      "source-9aad994c88d618f45c216249"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowContractV2LeasedRunStateStore.ts",
    "familyIds": [
      "source-04042ee1d12b54981a558cd1",
      "source-5ca2654642f10f69b53d3f8b"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowContractV2RunStateStore.ts",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowContractV2RuntimeBoundary.ts",
    "familyIds": [
      "source-01ca179efcbe182b733f7a89"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowRunCommands.ts",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/test/architectureContracts.test.js",
    "familyIds": [
      "source-3266621c45ba21fc5873f61d"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js",
    "familyIds": [
      "source-1125e24c264c3e7ff427c8ae",
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ExecutionGuard.test.js",
    "familyIds": [
      "source-3266621c45ba21fc5873f61d"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2GateR.test.js",
    "familyIds": [
      "source-3266621c45ba21fc5873f61d",
      "source-34c61efc427121c81952998a",
      "source-41c31bf3997087539134b1c2",
      "source-718be8379c70ab754a9d7484",
      "source-75c07aaa99be8455bdc3285f",
      "source-a5eabe004258ac7de4b9ebdb",
      "source-ba56f810f0c338c02ff4e864",
      "source-fde858a48c84d66184d3513a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ReachabilityPolicy.test.js",
    "familyIds": [
      "source-75c07aaa99be8455bdc3285f"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2RunLeaseDisposal.test.js",
    "familyIds": [
      "source-299b38c2a6c3696dbc79dd52",
      "source-41c31bf3997087539134b1c2"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2RunPlanTestSupport.js",
    "familyIds": [
      "source-fde858a48c84d66184d3513a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2RunProvenance.test.js",
    "familyIds": [
      "source-fde858a48c84d66184d3513a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2RunProvenanceProjection.test.js",
    "familyIds": [
      "source-34c61efc427121c81952998a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2RunSchemaType.test.js",
    "familyIds": [
      "source-718be8379c70ab754a9d7484"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2RuntimeLeaseScope.test.js",
    "familyIds": [
      "source-ba56f810f0c338c02ff4e864"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2TerminalLeaseRelease.test.js",
    "familyIds": [
      "source-a5eabe004258ac7de4b9ebdb"
    ]
  }
];
// ADMITTED_DELTAS_END
const baseFilesSha256 = '02abefbe1b6c3c59c764c1660de5833a4edec79911b921ef1e18c7710b3b78e4';
const catalogSha256 = 'dc215522dfcae4c114740b2411e63a90ded87d2f803a8e946bed47be352881f2';
const familyRows = [
 ['source-3266621c45ba21fc5873f61d','workflowContractV2ExecutionGuard.test.js','R1_authentic_lease_rejects_before_read'],
 ['source-34c61efc427121c81952998a','workflowContractV2RunProvenanceProjection.test.js','R1_plan_projection_contains_no_bodies'],
 ['source-41c31bf3997087539134b1c2','workflowContractV2RunLeaseDisposal.test.js','R1_all_private_retained_leases_release_once'],
 ['source-718be8379c70ab754a9d7484','workflowContractV2RunSchemaType.test.js','R1_run_only_discriminator_preserves_public_schema'],
 ['source-75c07aaa99be8455bdc3285f','workflowContractV2ExecutionBoundary.test.js','R1_public_paths_have_zero_runtime_effects'],
 ['source-a5eabe004258ac7de4b9ebdb','workflowContractV2TerminalLeaseRelease.test.js','R1_terminal_release_follows_durable_hooks'],
 ['source-ba56f810f0c338c02ff4e864','workflowContractV2RuntimeLeaseScope.test.js','R1_closed_scope_blocks_detached_work'],
 ['source-fde858a48c84d66184d3513a','workflowContractV2RunProvenance.test.js','R1_exact_provenance_and_stale_write_checks']
];
export function gateRActiveTestFamilies() {
 return familyRows.map(([sourceItemId,name,required]) => ({sourceItemId,testPath:'extensions/workflow-register/test/'+name,requiredCaseNames:[required]}));
}
const exact = (value, keys, label) => {
 if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k=>!Object.hasOwn(value,k))) fail(label+' exact keys');
};
export function validateGateRMainAdmission(input) {
 const value = gateRInputData(input,'main admission');
 exact(value,['schemaVersion','authority','baseMainSha','baseTreeSha','archiveCatalogSha256','capabilityId','baseFiles','deltas','activeTestFamilies'],'root');
 if(value.schemaVersion!=='workflow-gate-r-main-admission/v1'||value.authority!=='reviewed_candidate_source'||value.baseMainSha!=='5fc1cd30c39102b946f9300a0d77afd306eaaa03'||value.baseTreeSha!=='aaa6f2d8bbfb82b81d11b0e34f536d8c43475253'||value.archiveCatalogSha256!==catalogSha256||value.capabilityId!=='WF2-R1-PROVENANCE')fail('base/catalog/capability authority');
 if(!Array.isArray(value.baseFiles)||value.baseFiles.length!==1111||!Array.isArray(value.deltas)||!value.deltas.length)fail('base/delta coverage');
 gateRPathRows(value.baseFiles,'base files');gateRPathRows(value.deltas,'deltas');
 for(const row of value.baseFiles){exact(row,['path','mode','blobSha'],'base row');if(row.mode!=='100644'||!/^[a-f0-9]{40}$/.test(row.blobSha))fail('base blob/mode');}
 if(gateRDigest(gateRCanonicalJson(value.baseFiles))!==baseFilesSha256)fail('base snapshot identity');
 const before=new Map(value.baseFiles.map(f=>[f.path,f.blobSha]));
 for(const row of value.deltas){
  exact(row,['path','mode','beforeBlobSha','afterBlobSha','familyIds'],'delta row');
  if(row.mode!=='100644'||row.beforeBlobSha!==(before.get(row.path)??null)||!/^[a-f0-9]{40}$/.test(row.afterBlobSha)||row.afterBlobSha===row.beforeBlobSha)fail('delta before/after/mode');
  if(!Array.isArray(row.familyIds)||!row.familyIds.length||row.familyIds.some((id,i)=>typeof id!=='string'||!/^source-[a-f0-9]{24}$/.test(id)||(i&&row.familyIds[i-1]>=id)))fail('family identity/order');
 }
 if(!gateRCanonicalJson(value.deltas.map(({path,familyIds})=>({path,familyIds}))).equals(gateRCanonicalJson(admittedDeltas)))fail('literal R1 path/family allowlist');
 if(!gateRCanonicalJson(value.activeTestFamilies).equals(gateRCanonicalJson(gateRActiveTestFamilies())))fail('active family/path/required case contract');
 // The independently measured final artifact seals every literal path, blob and family.
 // It is a candidate admission, so future completion metadata cannot confer authority.
 if(gateRDigest(gateRCanonicalJson(value))!==GATE_R_MAIN_ADMISSION_SHA256)fail('sealed candidate source identity');
 return Object.freeze({state:'VALID_R1_CANDIDATE'});
}
export function readGateRMainAdmission() {
 const bytes=readGateRContainedFile(root,'tools/main-consolidation/gate-r-main-admission.json');
 validateGateRMainAdmission(bytes);return JSON.parse(bytes);
}
export function gateRExpectedMainFiles(){const value=readGateRMainAdmission(),files=new Map(value.baseFiles.map(f=>[f.path,f]));for(const row of value.deltas)files.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});return [...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);}
export function validateGateRMainRepositoryFiles(input) {
 gateRCanonicalJson(input);if(!Array.isArray(input))fail('source files array');gateRPathRows(input,'source files');
 if(!gateRCanonicalJson(input).equals(gateRCanonicalJson(gateRExpectedMainFiles())))fail('unselected source/shipping change or blob drift');return true;
}
const blobHash = bytes => createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
function measuredBlob(bytes,expected){if(blobHash(bytes)===expected)return expected;if(!bytes.subarray(0,8000).includes(0)&&blobHash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')))===expected)return expected;fail('source blob identity drift');}
export function validateGateRMainRepository() {
 const expected=gateRExpectedMainFiles(),known=new Set(expected.map(f=>f.path)),snapshot=[];
 for(const f of expected)snapshot.push({path:f.path,mode:f.mode,blobSha:measuredBlob(readGateRContainedFile(root,f.path),f.blobSha)});
 function scan(p,top=false){for(const entry of readdirSync(resolve(root,p),{withFileTypes:true})){
  const path=p+'/'+entry.name;
  // Only fixed generated/cache outputs are outside the tracked shipping domain.
  if(top&&(['node_modules','out','coverage','.tmp','tmp','.vscode-test','.vscode'].includes(entry.name)||/\.vsix$|\.tsbuildinfo$/.test(entry.name)||entry.name==='.vscode-test.json'))continue;
  if(entry.isSymbolicLink())fail('source path alias');
  if(entry.isDirectory())scan(path);else if(!known.has(path))fail('unexpected source/shipping path: '+path);
 }}
 for(const ext of ['workflow-register','bob-bazaar-review','bob-code-consistency-review'])scan('extensions/'+ext,true);
 validateGateRMainRepositoryFiles(snapshot);
}
