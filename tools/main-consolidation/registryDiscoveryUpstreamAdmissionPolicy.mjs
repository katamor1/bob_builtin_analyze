import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows} from './gateRData.mjs';
const fail=reason=>{throw new TypeError('Registry Discovery upstream admission: '+reason)};
export const REGISTRY_DISCOVERY_UPSTREAM_ADMISSION_SHA256='61be4ae3c383573d3075149d02c9ef9ac5955dc0243980b48538dcb7f07f3bd7';
const OWNER_FILES_DIGEST='49fe197e298117444e81a9ac16dd3585d0ad866d04632f907fbc88f62080d2bc',RESULT_FILES_DIGEST='62005465003f0b5e1f3bcc292722b2e0f677b28e2b2f1d648d80242b6a51e420';
const PATHS=Object.freeze([
  "extensions/bob-bazaar-review/contracts/workflow-contributions.json",
  "extensions/bob-bazaar-review/package-lock.json",
  "extensions/bob-bazaar-review/package.json",
  "extensions/bob-bazaar-review/src/mcp/jsonRpc.ts",
  "extensions/bob-bazaar-review/src/mcp/mcpConfig.ts",
  "extensions/bob-bazaar-review/src/mcp/mcpConfigHealth.ts",
  "extensions/bob-bazaar-review/src/workspace/bobWorkspaceInit.ts",
  "extensions/bob-bazaar-review/src/workspace/templateRefresh.ts",
  "extensions/bob-bazaar-review/src/workspace/workflowTemplateCompatibility.ts",
  "extensions/bob-bazaar-review/test/bobWorkspaceMcpHealth.test.js",
  "extensions/bob-bazaar-review/test/bobWorkspaceWorkflowMigration.test.js",
  "extensions/bob-bazaar-review/test/mcpAllowedRoots.test.js",
  "extensions/bob-bazaar-review/test/mcpConfig.test.js",
  "extensions/bob-bazaar-review/test/mcpRequestLimit.test.js",
  "extensions/bob-bazaar-review/test/mcpStdioInterop.test.js",
  "extensions/bob-bazaar-review/test/mcpWriteTools.test.js",
  "extensions/workflow-register/contracts/workflow-contributions.json",
  "extensions/workflow-register/package-lock.json",
  "extensions/workflow-register/package.json",
  "extensions/workflow-register/scripts/recompress-vsix.js",
  "extensions/workflow-register/src/workflowRegistrationService.ts",
  "extensions/workflow-register/test/contributionManifest.test.js",
  "extensions/workflow-register/test/providerRegistryDisposal.test.js",
  "extensions/workflow-register/test/providerRegistryRuntimeTestSupport.js",
  "extensions/workflow-register/test/threeExtensionProviderLifecycle.test.js",
  "extensions/workflow-register/test/vsixCompression.test.js",
  "extensions/workflow-register/test/workflowRegistrationDiagnostics.test.js"
]);
const exact=(v,keys)=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('exact fields')};
export function applyRegistryDiscoveryUpstreamAdmission(input,ownerExpectedFiles){
 const a=gateRInputData(input,'upstream main source admission');exact(a,['schemaVersion','acceptedMainSha','parentMainSha','ownerFilesDigest','resultFilesDigest','deltas']);
 if(a.schemaVersion!=='bob-builtin-analyze/registry-discovery-upstream-main-admission/v1'||a.acceptedMainSha!=='90f926e0045405625f1f40d20a41346a94d1981a'||a.parentMainSha!=='3d3d25c296dc798c7eb2fd786625775bca1152f0'||a.ownerFilesDigest!==OWNER_FILES_DIGEST||gateRDigest(gateRCanonicalJson(ownerExpectedFiles))!==OWNER_FILES_DIGEST)fail('fixed upstream or Owner baseline');
 if(!Array.isArray(a.deltas))fail('source rows');gateRPathRows(a.deltas,'upstream deltas');if(!gateRCanonicalJson(a.deltas.map(x=>x.path)).equals(gateRCanonicalJson(PATHS)))fail('literal paths');
 const result=new Map(ownerExpectedFiles.map(x=>[x.path,x]));for(const row of a.deltas){exact(row,['path','mode','beforeBlobSha','afterBlobSha']);if(row.mode!=='100644'||row.beforeBlobSha!==(result.get(row.path)?.blobSha??null)||!/^[a-f0-9]{40}$/.test(row.afterBlobSha)||row.afterBlobSha===row.beforeBlobSha)fail('source identity');result.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});}
 const rows=[...result.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 if(a.resultFilesDigest!==RESULT_FILES_DIGEST||gateRDigest(gateRCanonicalJson(rows))!==RESULT_FILES_DIGEST||gateRDigest(gateRCanonicalJson(a))!==REGISTRY_DISCOVERY_UPSTREAM_ADMISSION_SHA256)fail('sealed upstream identity');return rows;
}
