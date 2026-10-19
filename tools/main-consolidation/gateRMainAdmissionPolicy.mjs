import { createHash } from 'node:crypto';
import { applyRegistryBridgeSourceAdmission } from './registryBridgeAdmissionPolicy.mjs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { gateRCanonicalJson, gateRDigest, gateRInputData, gateRPathRows, readGateRContainedFile } from './gateRData.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const fail = reason => { throw new TypeError('Gate R main admission: ' + reason); };
export const GATE_R_MAIN_ADMISSION_SHA256 = '156633d3e71cbf13ea8d081f4aa4e3bcf984208a7705ed2eaf83578896098bdc';
// ADMITTED_DELTAS_START
const admittedDeltas = [
  {
    "path": "extensions/workflow-register/scripts/check-contract-v2-runtime-reachability.js",
    "familyIds": [
      "source-5ec92ed8eb7c664752c179f6",
      "source-9c06a4751ee2e5cb236ffade"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/check-vsix-policy.js",
    "familyIds": [
      "source-14cfd7d06e0a3ff1d07dbd07",
      "source-5ec92ed8eb7c664752c179f6",
      "source-7fac6492e3e471002b40d219",
      "source-9c06a4751ee2e5cb236ffade",
      "source-e6276ab81d5965f9ef86745d",
      "source-f3f7f4b0b7abd506c0c8f506",
      "source-fecb7999677bed9e8fe3ce13"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/recompress-vsix.js",
    "familyIds": [
      "source-14cfd7d06e0a3ff1d07dbd07",
      "source-5ec92ed8eb7c664752c179f6",
      "source-7fac6492e3e471002b40d219",
      "source-9c06a4751ee2e5cb236ffade",
      "source-e6276ab81d5965f9ef86745d",
      "source-f3f7f4b0b7abd506c0c8f506",
      "source-fecb7999677bed9e8fe3ce13"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/providerAttemptStaging.ts",
    "familyIds": [
      "source-7fac6492e3e471002b40d219",
      "source-fecb7999677bed9e8fe3ce13"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/providerEnvelopeSnapshot.ts",
    "familyIds": [
      "source-e6276ab81d5965f9ef86745d"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/providerInvocation.ts",
    "familyIds": [
      "source-14cfd7d06e0a3ff1d07dbd07",
      "source-7fac6492e3e471002b40d219",
      "source-f3f7f4b0b7abd506c0c8f506"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/providerRegistry.ts",
    "familyIds": [
      "source-9c06a4751ee2e5cb236ffade"
    ]
  },
  {
    "path": "extensions/workflow-register/test/architectureContracts.test.js",
    "familyIds": [
      "source-5ec92ed8eb7c664752c179f6",
      "source-9c06a4751ee2e5cb236ffade"
    ]
  },
  {
    "path": "extensions/workflow-register/test/vsixCompression.test.js",
    "familyIds": [
      "source-14cfd7d06e0a3ff1d07dbd07",
      "source-5ec92ed8eb7c664752c179f6",
      "source-7fac6492e3e471002b40d219",
      "source-9c06a4751ee2e5cb236ffade",
      "source-e6276ab81d5965f9ef86745d",
      "source-f3f7f4b0b7abd506c0c8f506",
      "source-fecb7999677bed9e8fe3ce13"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2GateR.test.js",
    "familyIds": [
      "source-42e52f0142bc1480cba3f8bb",
      "source-5ec92ed8eb7c664752c179f6",
      "source-67e4c888b7aa389e2ebf5135",
      "source-917527dedba80f811bb34bac",
      "source-aa64e1c64d51e4da51fd72c7",
      "source-e9053c4efd76a31cfe133bdb",
      "source-e98cec4ab341f9224f6e2ee0"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ManifestPackaging.test.js",
    "familyIds": [
      "source-14cfd7d06e0a3ff1d07dbd07",
      "source-5ec92ed8eb7c664752c179f6",
      "source-7fac6492e3e471002b40d219",
      "source-9c06a4751ee2e5cb236ffade",
      "source-e6276ab81d5965f9ef86745d",
      "source-f3f7f4b0b7abd506c0c8f506",
      "source-fecb7999677bed9e8fe3ce13"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocation.test.js",
    "familyIds": [
      "source-e9053c4efd76a31cfe133bdb"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationArchitecture.test.js",
    "familyIds": [
      "source-5ec92ed8eb7c664752c179f6"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationFailurePrecedence.test.js",
    "familyIds": [
      "source-917527dedba80f811bb34bac"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationFollowup.test.js",
    "familyIds": [
      "source-67e4c888b7aa389e2ebf5135"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationFoundation.test.js",
    "familyIds": [
      "source-aa64e1c64d51e4da51fd72c7"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationHardening.test.js",
    "familyIds": [
      "source-e98cec4ab341f9224f6e2ee0"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationReviewCases.test.js",
    "familyIds": [
      "source-42e52f0142bc1480cba3f8bb"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ProviderInvocationTestSupport.js",
    "familyIds": [
      "source-aa64e1c64d51e4da51fd72c7"
    ]
  }
];
// ADMITTED_DELTAS_END
const baseFilesSha256 = '2308ff9dc7a82f6eeab3a68e396085fe489ce24b1f70e3d107d6b606f7e0d494';
const catalogSha256 = 'dc215522dfcae4c114740b2411e63a90ded87d2f803a8e946bed47be352881f2';
const familyRows = [
  [
    "source-3266621c45ba21fc5873f61d",
    "workflowContractV2ExecutionGuard.test.js",
    "R1_authentic_lease_rejects_before_read",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-34c61efc427121c81952998a",
    "workflowContractV2RunProvenanceProjection.test.js",
    "R1_plan_projection_contains_no_bodies",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-41c31bf3997087539134b1c2",
    "workflowContractV2RunLeaseDisposal.test.js",
    "R1_all_private_retained_leases_release_once",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-42e52f0142bc1480cba3f8bb",
    "workflowContractV2ProviderInvocationReviewCases.test.js",
    "R2_closed_scope_and_concurrent_attempt_refusal",
    "WF2-R2-INVOKE"
  ],
  [
    "source-5ec92ed8eb7c664752c179f6",
    "workflowContractV2ProviderInvocationArchitecture.test.js",
    "R2_product_paths_remain_unreachable",
    "WF2-R2-INVOKE"
  ],
  [
    "source-67e4c888b7aa389e2ebf5135",
    "workflowContractV2ProviderInvocationFollowup.test.js",
    "R2_snapshot_dispatch_and_retry_identity",
    "WF2-R2-INVOKE"
  ],
  [
    "source-718be8379c70ab754a9d7484",
    "workflowContractV2RunSchemaType.test.js",
    "R1_run_only_discriminator_preserves_public_schema",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-75c07aaa99be8455bdc3285f",
    "workflowContractV2ExecutionBoundary.test.js",
    "R1_public_paths_have_zero_runtime_effects",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-917527dedba80f811bb34bac",
    "workflowContractV2ProviderInvocationFailurePrecedence.test.js",
    "R2_staging_failure_and_settlement_precedence",
    "WF2-R2-INVOKE"
  ],
  [
    "source-a5eabe004258ac7de4b9ebdb",
    "workflowContractV2TerminalLeaseRelease.test.js",
    "R1_terminal_release_follows_durable_hooks",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-aa64e1c64d51e4da51fd72c7",
    "workflowContractV2ProviderInvocationFoundation.test.js",
    "R2_authentic_retained_run_and_attempt_foundation",
    "WF2-R2-INVOKE"
  ],
  [
    "source-ba56f810f0c338c02ff4e864",
    "workflowContractV2RuntimeLeaseScope.test.js",
    "R1_closed_scope_blocks_detached_work",
    "WF2-R1-PROVENANCE"
  ],
  [
    "source-e9053c4efd76a31cfe133bdb",
    "workflowContractV2ProviderInvocation.test.js",
    "R2_compiled_input_output_error_contract",
    "WF2-R2-INVOKE"
  ],
  [
    "source-e98cec4ab341f9224f6e2ee0",
    "workflowContractV2ProviderInvocationHardening.test.js",
    "R2_bounded_hostile_values_and_write_sessions",
    "WF2-R2-INVOKE"
  ],
  [
    "source-fde858a48c84d66184d3513a",
    "workflowContractV2RunProvenance.test.js",
    "R1_exact_provenance_and_stale_write_checks",
    "WF2-R1-PROVENANCE"
  ]
];
export function gateRActiveTestFamilies(capabilityId) {
 return familyRows.filter(row=>capabilityId===undefined||row[3]===capabilityId).map(([sourceItemId,name,required])=>({sourceItemId,testPath:'extensions/workflow-register/test/'+name,requiredCaseNames:[required]}));
}
const exact = (value, keys, label) => {
 if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).length !== keys.length || keys.some(k=>!Object.hasOwn(value,k))) fail(label+' exact keys');
};
export function validateGateRMainAdmission(input) {
 const value = gateRInputData(input,'main admission');
 exact(value,['schemaVersion','authority','baseMainSha','baseTreeSha','archiveCatalogSha256','capabilityId','baseFiles','deltas','activeTestFamilies'],'root');
 if(value.schemaVersion!=='workflow-gate-r-main-admission/v2'||value.authority!=='reviewed_candidate_source'||value.baseMainSha!=='abdedeb23fe133c2b541c8cc2fa7d35f2e8b5688'||value.baseTreeSha!=='db566dab17c1a17c5d66804fe1f0b84a415a3b3d'||value.archiveCatalogSha256!==catalogSha256||value.capabilityId!=='WF2-R2-INVOKE')fail('base/catalog/capability authority');
 if(!Array.isArray(value.baseFiles)||value.baseFiles.length!==1126||!Array.isArray(value.deltas)||!value.deltas.length)fail('base/delta coverage');
 gateRPathRows(value.baseFiles,'base files');gateRPathRows(value.deltas,'deltas');
 for(const row of value.baseFiles){exact(row,['path','mode','blobSha'],'base row');if(row.mode!=='100644'||!/^[a-f0-9]{40}$/.test(row.blobSha))fail('base blob/mode');}
 if(gateRDigest(gateRCanonicalJson(value.baseFiles))!==baseFilesSha256)fail('base snapshot identity');
 const before=new Map(value.baseFiles.map(f=>[f.path,f.blobSha]));
 for(const row of value.deltas){
  exact(row,['path','mode','beforeBlobSha','afterBlobSha','familyIds'],'delta row');
  if(row.mode!=='100644'||row.beforeBlobSha!==(before.get(row.path)??null)||!/^[a-f0-9]{40}$/.test(row.afterBlobSha)||row.afterBlobSha===row.beforeBlobSha)fail('delta before/after/mode');
  if(!Array.isArray(row.familyIds)||!row.familyIds.length||row.familyIds.some((id,i)=>typeof id!=='string'||!/^source-[a-f0-9]{24}$/.test(id)||(i&&row.familyIds[i-1]>=id)))fail('family identity/order');
 }
 if(!gateRCanonicalJson(value.deltas.map(({path,familyIds})=>({path,familyIds}))).equals(gateRCanonicalJson(admittedDeltas)))fail('literal R2 path/family allowlist');
 if(!gateRCanonicalJson(value.activeTestFamilies).equals(gateRCanonicalJson(gateRActiveTestFamilies())))fail('active family/path/required case contract');
 // The independently measured final artifact seals every literal path, blob and family.
 // It is a candidate admission, so future completion metadata cannot confer authority.
 if(gateRDigest(gateRCanonicalJson(value))!==GATE_R_MAIN_ADMISSION_SHA256)fail('sealed candidate source identity');
 return Object.freeze({state:'VALID_R2_CANDIDATE'});
}
export function readGateRMainAdmission() {
 const bytes=readGateRContainedFile(root,'tools/main-consolidation/gate-r-main-admission.json');
 validateGateRMainAdmission(bytes);return JSON.parse(bytes);
}
export function gateRExpectedMainFiles(){const value=readGateRMainAdmission(),files=new Map(value.baseFiles.map(f=>[f.path,f]));for(const row of value.deltas)files.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});return [...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);}
export function gateRCurrentMainFiles(){return applyRegistryBridgeSourceAdmission(readGateRContainedFile(root,'tools/main-consolidation/registry-bridge-source-admission.json'),gateRExpectedMainFiles());}
export function validateGateRMainRepositoryFiles(input) {
 gateRCanonicalJson(input);if(!Array.isArray(input))fail('source files array');gateRPathRows(input,'source files');
 if(!gateRCanonicalJson(input).equals(gateRCanonicalJson(gateRCurrentMainFiles())))fail('unselected source/shipping change or blob drift');return true;
}
const blobHash = bytes => createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
function measuredBlob(bytes,expected){if(blobHash(bytes)===expected)return expected;if(!bytes.subarray(0,8000).includes(0)&&blobHash(Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')))===expected)return expected;fail('source blob identity drift');}
export function validateGateRMainRepository() {
 const expected=gateRCurrentMainFiles(),known=new Set(expected.map(f=>f.path)),snapshot=[];
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
