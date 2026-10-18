import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows} from './gateRData.mjs';
const fail=reason=>{throw new TypeError('Registry bridge source admission: '+reason)};
export const REGISTRY_BRIDGE_SOURCE_ADMISSION_SHA256='11d57bd1b3a1938439474cd2eb701173e4691b30addcf2271465f0ef12255b53';
const BASE_FILES_SHA256='44557aa00c8d4e846afac1b4bf286851d66a7594fe0360b9b9858cc8226e1b46';
const admitted=[
  {
    "path": "extensions/bob-bazaar-review/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-71443e2d19d7a40e05e396e8"
    ]
  },
  {
    "path": "extensions/bob-code-consistency-review/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-2cd5d697cee371e3948b8f33"
    ]
  },
  {
    "path": "extensions/workflow-register/contracts/workflow-contributions.json",
    "sourceItemIds": [
      "source-79bd38ef5563e7b3aec53fd6"
    ]
  },
  {
    "path": "extensions/workflow-register/schema/workflow-contributions.v1.schema.json",
    "sourceItemIds": [
      "source-06c5f2cc5db5e4f92b0cf2cc"
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
    "path": "extensions/workflow-register/test/contributionTestSupport.js",
    "sourceItemIds": [
      "source-a3fd41a350be7f1b0dea1bc7"
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
