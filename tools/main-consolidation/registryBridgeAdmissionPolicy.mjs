import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows} from './gateRData.mjs';
const fail=reason=>{throw new TypeError('Registry bridge source admission: '+reason)};
export const REGISTRY_BRIDGE_SOURCE_ADMISSION_SHA256='1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4';
const BASE_FILES_SHA256='44557aa00c8d4e846afac1b4bf286851d66a7594fe0360b9b9858cc8226e1b46';
const admitted=[
  {
    "path": "extensions/bob-bazaar-review/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-71443e2d19d7a40e05e396e8"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/src/workflow/workflowProviders.ts",
    "sourceItemIds": [
      "source-fda2fa7cf647654a7ee23674"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/src/workflow/workflowRegisterBridge.ts",
    "sourceItemIds": [
      "source-21c74c762ada2909d42a47b0"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/test/providerRegistryBridge.test.js",
    "sourceItemIds": [
      "source-6bd46f52727f256b495ee3d7",
      "source-fd40c97ba2097bd3305e520d"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/test/providerRegistryBridgeTestSupport.js",
    "sourceItemIds": [
      "source-fd40c97ba2097bd3305e520d"
    ]
  },
  {
    "path": "extensions/bob-bazaar-review/test/workflowProviderRegistration.test.js",
    "sourceItemIds": [
      "source-0b61f62d20da4612280b6569"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-2cd5d697cee371e3948b8f33"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/src/extension.ts",
    "sourceItemIds": [
      "source-09c3e86a1add707d71de4d8c"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/src/workflowProviderRegistration.ts",
    "sourceItemIds": [
      "source-ef342bf8f2f3c3f4b9629d6e"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/test/providerRegistryBridgeTestSupport.js",
    "sourceItemIds": [
      "source-efdfd169459fd6cf212c2e84"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/test/workflowProviderAtomicRegistration.test.js",
    "sourceItemIds": [
      "source-efdfd169459fd6cf212c2e84"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/test/workflowProviderRegistration.test.js",
    "sourceItemIds": [
      "source-b828b14f3a5c2a07fea08db5"
    ]
  },
  {
    "path": "extensions/workflow-register/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-79bd38ef5563e7b3aec53fd6"
    ]
  },
  {
    "path": "extensions/workflow-register/package.json",
    "sourceItemIds": [
      "source-888302701c275d7a8c7fb34c"
    ]
  },
  {
    "path": "extensions/workflow-register/schema/workflow-contributions.v1.schema.json",
    "sourceItemIds": [
      "source-06c5f2cc5db5e4f92b0cf2cc"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/check-contract-v2-runtime-reachability.js",
    "sourceItemIds": [
      "source-240df7c38b2b9a2698b1e2b8"
    ]
  },
  {
    "path": "extensions/workflow-register/scripts/recompress-vsix.js",
    "sourceItemIds": [
      "source-888302701c275d7a8c7fb34c"
    ]
  },
  {
    "path": "extensions/workflow-register/src/api/providerRegistryApi.ts",
    "sourceItemIds": [
      "source-05dcdabc25077b727fa3858a"
    ]
  },
  {
    "path": "extensions/workflow-register/src/bobWorkflowRunner.ts",
    "sourceItemIds": [
      "source-473b8fbfa56d3c4c61e553a0"
    ]
  },
  {
    "path": "extensions/workflow-register/src/builtInContributions.ts",
    "sourceItemIds": [
      "source-178b32177a4de88216c81e1e"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/actionRegistry.ts",
    "sourceItemIds": [
      "source-88604e6280fac57594af0b14"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/agentProvider.ts",
    "sourceItemIds": [
      "source-f8e9072cf65ee834911af7cc"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contractV2/providerRegistry.ts",
    "sourceItemIds": [
      "source-888302701c275d7a8c7fb34c"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contributionManifest.ts",
    "sourceItemIds": [
      "source-700d79ad28282566c4a56ca3"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/contributionRegistration.ts",
    "sourceItemIds": [
      "source-888302701c275d7a8c7fb34c"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/disposeResources.ts",
    "sourceItemIds": [
      "source-730d00e957bf6cefffeeacf2"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/engine.ts",
    "sourceItemIds": [
      "source-4aa26e2ba3475a88e66b9d2e"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/engine/preflight.ts",
    "sourceItemIds": [
      "source-d79dcd8a933e2243f74ff982"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/engineTypes.ts",
    "sourceItemIds": [
      "source-721523ae63cd162bf55c8c6f"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/resultSinkRegistry.ts",
    "sourceItemIds": [
      "source-e2649725e3a40cd18302e95a"
    ]
  },
  {
    "path": "extensions/workflow-register/src/core/runtime/resultSinkRegistry.ts",
    "sourceItemIds": [
      "source-e2649725e3a40cd18302e95a"
    ]
  },
  {
    "path": "extensions/workflow-register/src/extension.ts",
    "sourceItemIds": [
      "source-30975ac1581193529a323011"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowCatalogReloadCoordinator.ts",
    "sourceItemIds": [
      "source-240df7c38b2b9a2698b1e2b8"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowContractV2ProviderLifecycle.ts",
    "sourceItemIds": [
      "source-06b495365a39505884c0f86f"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowRegisterService.ts",
    "sourceItemIds": [
      "source-240df7c38b2b9a2698b1e2b8"
    ]
  },
  {
    "path": "extensions/workflow-register/src/workflowRuntimeFactory.ts",
    "sourceItemIds": [
      "source-f89eb258abf02ed66382987d"
    ]
  },
  {
    "path": "extensions/workflow-register/test/builtInContributionRegistration.test.js",
    "sourceItemIds": [
      "source-83eef9cf8e2990705d59370e",
      "source-a1581360299210be8dd381b0"
    ]
  },
  {
    "path": "extensions/workflow-register/test/contributionManifest.test.js",
    "sourceItemIds": [
      "source-fb04528e9e231cf695440dfb"
    ]
  },
  {
    "path": "extensions/workflow-register/test/contributionRegistration.test.js",
    "sourceItemIds": [
      "source-c357a71f441254a3b0893e6a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/contributionRegistry.test.js",
    "sourceItemIds": [
      "source-c357a71f441254a3b0893e6a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/contributionRegistryTestSupport.js",
    "sourceItemIds": [
      "source-c357a71f441254a3b0893e6a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/contributionTestSupport.js",
    "sourceItemIds": [
      "source-a3fd41a350be7f1b0dea1bc7"
    ]
  },
  {
    "path": "extensions/workflow-register/test/fixtures/provider-registry-api/consumer.ts",
    "sourceItemIds": [
      "source-68e935618e8909d8f47822a1",
      "source-c5828e6fb833ccaa6eea4c0f"
    ]
  },
  {
    "path": "extensions/workflow-register/test/fixtures/provider-registry-api/tsconfig.json",
    "sourceItemIds": [
      "source-68e935618e8909d8f47822a1"
    ]
  },
  {
    "path": "extensions/workflow-register/test/operationHubAgentProvider.test.js",
    "sourceItemIds": [
      "source-f89eb258abf02ed66382987d"
    ]
  },
  {
    "path": "extensions/workflow-register/test/providerRegistryApi.test.js",
    "sourceItemIds": [
      "source-68e935618e8909d8f47822a1"
    ]
  },
  {
    "path": "extensions/workflow-register/test/providerRegistryDisposal.test.js",
    "sourceItemIds": [
      "source-06b495365a39505884c0f86f"
    ]
  },
  {
    "path": "extensions/workflow-register/test/providerRegistryOwnership.test.js",
    "sourceItemIds": [
      "source-dcc9d121869659f63332ad3a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/providerRegistryRuntimeLifecycle.test.js",
    "sourceItemIds": [
      "source-49c3dcb3210f6747397403d8"
    ]
  },
  {
    "path": "extensions/workflow-register/test/providerRegistryRuntimeTestSupport.js",
    "sourceItemIds": [
      "source-49c3dcb3210f6747397403d8"
    ]
  },
  {
    "path": "extensions/workflow-register/test/providerRegistryRuntimeWiring.test.js",
    "sourceItemIds": [
      "source-2b3053b0bd0857926680aaa4"
    ]
  },
  {
    "path": "extensions/workflow-register/test/registrationWiring.test.js",
    "sourceItemIds": [
      "source-657058eea29c4c1daed416c3"
    ]
  },
  {
    "path": "extensions/workflow-register/test/runtimeWiring.test.js",
    "sourceItemIds": [
      "source-6e4f27e3414ecd0dbbe3abb7"
    ]
  },
  {
    "path": "extensions/workflow-register/test/threeExtensionProviderLifecycle.test.js",
    "sourceItemIds": [
      "source-b7f2224e7b3370bcd1126871",
      "source-ee09d1109431e8dcb4ef836b"
    ]
  },
  {
    "path": "extensions/workflow-register/test/vsixCompression.test.js",
    "sourceItemIds": [
      "source-c357a71f441254a3b0893e6a"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowContractV2ExecutionBoundary.test.js",
    "sourceItemIds": [
      "source-240df7c38b2b9a2698b1e2b8"
    ]
  },
  {
    "path": "extensions/workflow-register/test/workflowRegister.test.js",
    "sourceItemIds": [
      "source-30975ac1581193529a323011"
    ]
  }
];
const exact=(v,keys)=>{if(!v||Array.isArray(v)||typeof v!=='object'||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))fail('exact data fields')};
export function applyRegistryBridgeSourceAdmission(input,baseFiles){
 const a=gateRInputData(input,'registry bridge source admission');
 exact(a,['schemaVersion','authority','capabilityId','baseMainSha','baseTreeSha','gateRBaseAdmissionSha256','baseFilesSha256','runtimeActivation','deltas']);
 if(a.schemaVersion!=='workflow-registry-bridge-source-admission/v1'||a.authority!=='candidate_source_only'||a.capabilityId!=='REG-BRIDGE-OWNER-VERSION-LIFECYCLE'||a.baseMainSha!=='88de3a67aedf5c8d1b3ee2ea3226a973703ebaf0'||a.baseTreeSha!=='a82b99376f24e21113a127921a07c6efd159865f'||a.gateRBaseAdmissionSha256!=='156633d3e71cbf13ea8d081f4aa4e3bcf984208a7705ed2eaf83578896098bdc'||a.runtimeActivation!==false)fail('candidate identity or authority');
 if(a.baseFilesSha256!==BASE_FILES_SHA256||gateRDigest(gateRCanonicalJson(baseFiles))!==BASE_FILES_SHA256)fail('sealed R2 baseline identity');
 if(!Array.isArray(a.deltas))fail('delta array');gateRPathRows(a.deltas,'bridge deltas');
 const result=new Map(baseFiles.map(row=>[row.path,row]));
 for(const row of a.deltas){exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);if(row.mode!=='100644'||row.beforeBlobSha!==(result.get(row.path)?.blobSha??null)||!/^[a-f0-9]{40}$/.test(row.afterBlobSha)||row.afterBlobSha===row.beforeBlobSha)fail('delta source identity');}
 if(!gateRCanonicalJson(a.deltas.map(({path,sourceItemIds})=>({path,sourceItemIds}))).equals(gateRCanonicalJson(admitted)))fail('literal path and source-family coverage');
 if(gateRDigest(gateRCanonicalJson(a))!==REGISTRY_BRIDGE_SOURCE_ADMISSION_SHA256)fail('sealed bridge candidate source identity');
 for(const row of a.deltas)result.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});
 return [...result.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
