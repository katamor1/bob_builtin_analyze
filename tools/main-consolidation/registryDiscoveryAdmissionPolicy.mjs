import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows} from './gateRData.mjs';
const fail=reason=>{throw new TypeError('Registry Discovery source admission: '+reason)};
export const REGISTRY_DISCOVERY_SOURCE_ADMISSION_SHA256='c3a311ce9fb9948532234a0460b8643a93c1149bb1a10f92a737e1b71d6fd816';
export const REGISTRY_DISCOVERY_SOURCE_COVERAGE_SHA256='100c0c53e6764e08685c81a5f92c0d193e798b675de1c8da8c8b7ea44d3560d9';
const BASE_FILES_DIGEST='62005465003f0b5e1f3bcc292722b2e0f677b28e2b2f1d648d80242b6a51e420';
export const REGISTRY_DISCOVERY_TOOL_PATHS=Object.freeze([
  "tools/workflow-evidence/README.md",
  "tools/workflow-evidence/ci-evidence.mjs",
  "tools/workflow-evidence/compare-evidence.mjs",
  "tools/workflow-evidence/discover-tracked-workflows.mjs",
  "tools/workflow-evidence/generate-workflow-contract-report.mjs",
  "tools/workflow-evidence/lib/ciSubjects.mjs",
  "tools/workflow-evidence/lib/cli.mjs",
  "tools/workflow-evidence/lib/compileEvidence.mjs",
  "tools/workflow-evidence/lib/contractReport.mjs",
  "tools/workflow-evidence/lib/contributionCatalog.mjs",
  "tools/workflow-evidence/lib/discoveryClaims.mjs",
  "tools/workflow-evidence/lib/evidenceSubject.mjs",
  "tools/workflow-evidence/lib/gitSnapshot.mjs",
  "tools/workflow-evidence/lib/primitives.mjs",
  "tools/workflow-evidence/lib/publishEvidence.mjs",
  "tools/workflow-evidence/lib/snapshotPackageFileSystem.mjs",
  "tools/workflow-evidence/lib/subjectState.mjs",
  "tools/workflow-evidence/lib/trackedDiscovery.mjs",
  "tools/workflow-evidence/lib/vsixArchive.mjs",
  "tools/workflow-evidence/lib/vsixCapture.mjs",
  "tools/workflow-evidence/native/rename_noreplace.c",
  "tools/workflow-evidence/native/rename_noreplace.ps1",
  "tools/workflow-evidence/schemas/workflow-discovery-catalog.v1.schema.json",
  "tools/workflow-evidence/schemas/workflow-discovery-claims.v1.schema.json",
  "tools/workflow-evidence/schemas/workflow-discovery-report.v1.schema.json",
  "tools/workflow-evidence/test/ciEvidence.test.mjs",
  "tools/workflow-evidence/test/cli.test.mjs",
  "tools/workflow-evidence/test/compileEvidence.test.mjs",
  "tools/workflow-evidence/test/contractReport.test.mjs",
  "tools/workflow-evidence/test/contributionCatalog.test.mjs",
  "tools/workflow-evidence/test/evidenceSubject.test.mjs",
  "tools/workflow-evidence/test/fixtures/ci-collections.json",
  "tools/workflow-evidence/test/primitives.test.mjs",
  "tools/workflow-evidence/test/publication.test.mjs",
  "tools/workflow-evidence/test/testSupport.mjs",
  "tools/workflow-evidence/test/trackedDiscovery.test.mjs",
  "tools/workflow-evidence/test/vsixArchive.test.mjs"
]);
const admitted=[
  {
    "path": "extensions/bob-bazaar-review/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-a3b4ca6a0b1e4db038b83ee2"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/contracts/workflow-discovery-claims.json",
    "sourceItemIds": [
      "source-a3b4ca6a0b1e4db038b83ee2"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/test/workflowContributionManifest.test.js",
    "sourceItemIds": [
      "source-a3b4ca6a0b1e4db038b83ee2"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-12d9b78e71be42e5711771f4",
      "source-f894324f170cd6b0e3e013d0"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/contracts/workflow-discovery-claims.json",
    "sourceItemIds": [
      "source-f894324f170cd6b0e3e013d0"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/test/workflowContributionManifest.test.js",
    "sourceItemIds": [
      "source-12d9b78e71be42e5711771f4",
      "source-f894324f170cd6b0e3e013d0"
    ]
  },
  {
    "path": "extensions/workflow-register/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-0bd231a3c17b7b56bbbbda21"
    ]
  },
  {
    "path": "extensions/workflow-register/contracts/workflow-discovery-claims.json",
    "sourceItemIds": [
      "source-0bd231a3c17b7b56bbbbda21"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/lib/workflow-contract-v2-environment.js",
    "sourceItemIds": [
      "source-2d2e01542f2b8de11ef04afb"
    ]
  },
  {
    "path": "extensions/workflow-register/test/contributionManifest.test.js",
    "sourceItemIds": [
      "source-0bd231a3c17b7b56bbbbda21",
      "source-94c75d7f2b39527bdd46537b"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ManifestOwnedCatalog.test.js",
    "sourceItemIds": [
      "source-2d2e01542f2b8de11ef04afb"
    ]
  }
];
const exact=(v,keys)=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('exact fields')};
export function validateRegistryDiscoveryCoverage(input){const c=gateRInputData(input,'Discovery source coverage');if(gateRDigest(gateRCanonicalJson(c))!==REGISTRY_DISCOVERY_SOURCE_COVERAGE_SHA256||c.items.length!==27||new Set(c.items.map(x=>x.sourceItemId)).size!==27||c.remainderClosure.total!==675||c.remainderClosure.items.length!==675||c.remainderClosure.unassigned!==0||c.formalProgressChanged!==false)fail('source coverage or remainder');return true;}
export function applyRegistryDiscoverySourceAdmission(input,ownerExpectedFiles){
 const a=gateRInputData(input,'Discovery source admission');exact(a,['schemaVersion','baseMainSha','baseFilesDigest','deltas','toolFiles','sourceCoverageDigest']);
 if(a.schemaVersion!=='bob-builtin-analyze/registry-discovery-source-admission/v1'||a.baseMainSha!=='90f926e0045405625f1f40d20a41346a94d1981a'||a.baseFilesDigest!==BASE_FILES_DIGEST||gateRDigest(gateRCanonicalJson(ownerExpectedFiles))!==BASE_FILES_DIGEST)fail('unchanged Owner baseline');
 if(!Array.isArray(a.deltas)||!Array.isArray(a.toolFiles))fail('source rows');gateRPathRows(a.deltas,'Discovery deltas');gateRPathRows(a.toolFiles,'Discovery tools');
 if(!gateRCanonicalJson(a.deltas.map(({path,sourceItemIds})=>({path,sourceItemIds}))).equals(gateRCanonicalJson(admitted))||!gateRCanonicalJson(a.toolFiles.map(x=>x.path)).equals(gateRCanonicalJson(REGISTRY_DISCOVERY_TOOL_PATHS)))fail('literal source paths');
 const result=new Map(ownerExpectedFiles.map(x=>[x.path,x]));
 for(const row of a.deltas){exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);if(row.mode!=='100644'||row.beforeBlobSha!==(result.get(row.path)?.blobSha??null)||!/^[a-f0-9]{40}$/.test(row.afterBlobSha)||row.afterBlobSha===row.beforeBlobSha)fail('product source identity');result.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});}
 for(const row of a.toolFiles){exact(row,['path','mode','blobSha']);if(row.mode!=='100644'||!/^[a-f0-9]{40}$/.test(row.blobSha)||result.has(row.path))fail('tool source identity');result.set(row.path,{...row});}
 if(a.sourceCoverageDigest!==REGISTRY_DISCOVERY_SOURCE_COVERAGE_SHA256||gateRDigest(gateRCanonicalJson(a))!==REGISTRY_DISCOVERY_SOURCE_ADMISSION_SHA256)fail('sealed Discovery identity');return [...result.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
