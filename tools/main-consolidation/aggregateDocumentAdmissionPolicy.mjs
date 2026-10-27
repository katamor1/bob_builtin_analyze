import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateBoundedDocumentCoverage,validateBoundedDocumentSourceAdmission} from './boundedDocumentAdmissionPolicy.mjs';
import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows,readGateRContainedFile} from './gateRData.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ADMISSION='tools/main-consolidation/aggregate-document-source-admission.json',COVERAGE='docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json',POLICY='tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs';
const T14_ADMISSION='tools/main-consolidation/bounded-document-source-admission.json',T14_COVERAGE='docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json',T13_ADMISSION='tools/main-consolidation/processing-budget-source-admission.json';
const BASE='a826dc20c0e71f472401adf644ca8cc777b74c58',TREE='fa3a7ed1ea9aca00965ebe16d786096033d5f39e';
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
// Literal reviewed M2 before/after and historical bindings; never caller supplied.
export const AGGREGATE_DOCUMENT_SOURCE_ADMISSION_SHA256="ed1fcbc2785bc132e82812f06c10680adf6b7ad04c5f97ea0412d34e989f3b4d";
export const AGGREGATE_DOCUMENT_SOURCE_COVERAGE_SHA256="b586e3e95941d74248335611124961738d5dc6e85de49145eb1c46afe4d295d3";
export const AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS=freeze({
  "tools/main-consolidation/registry-bridge-source-admission.json": {
    "blobSha": "c03c3477038bb1a96aa339e9c9a0b4868055cc85",
    "rawSha256": [
      "1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4"
    ]
  },
  "tools/main-consolidation/registry-discovery-source-admission.json": {
    "blobSha": "ac86711efd9d3cba2d1df9eccddb4d7595c4c5c0",
    "rawSha256": [
      "c3a311ce9fb9948532234a0460b8643a93c1149bb1a10f92a737e1b71d6fd816"
    ]
  },
  "tools/main-consolidation/registry-discovery-upstream-main-admission.json": {
    "blobSha": "9cbd493773e733a83817b71d03bbefa9ee966a11",
    "rawSha256": [
      "61be4ae3c383573d3075149d02c9ef9ac5955dc0243980b48538dcb7f07f3bd7"
    ]
  },
  "tools/main-consolidation/processing-budget-source-admission.json": {
    "blobSha": "6957d9cff8bff75007d1f25d2cac7fa69bf47df0",
    "rawSha256": [
      "6c7b3e89feaa67976449c9deb04d3456968566b38b9be390015790f30f7e666a",
      "2d8f1228f4f46f1c46f91e3c1595ff9f25b1eba39117db5414fd96fa2c65abb2"
    ]
  },
  "tools/main-consolidation/gate-r-main-admission.json": {
    "blobSha": "e56b29e7b4c814f7669196a89833abba83bd5c75",
    "rawSha256": [
      "156633d3e71cbf13ea8d081f4aa4e3bcf984208a7705ed2eaf83578896098bdc"
    ]
  },
  "tools/main-consolidation/feature-selection-source-universe.json": {
    "blobSha": "f499a9dad103136011a3a42a65346320a37da590",
    "rawSha256": [
      "c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79"
    ]
  },
  "docs/release-evidence/feature-selection-ledger-2026-08-23.json": {
    "blobSha": "76488c14d9dc631dcd094ee2d1bc03bda5edfa61",
    "rawSha256": [
      "e7603655a9f356d36938fc6d722061aa9a616fcfd8258bde05ad6c30ac9ae894"
    ]
  },
  "docs/release-evidence/reg-bridge-discovery-source-coverage-2026-10-20.json": {
    "blobSha": "57ff772b0722f8c6f2db7019226f34096018ec2c",
    "rawSha256": [
      "100c0c53e6764e08685c81a5f92c0d193e798b675de1c8da8c8b7ea44d3560d9"
    ]
  },
  "docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json": {
    "blobSha": "b922e6d08e6ec862bae02f63ac56dbfbe2f7c965",
    "rawSha256": [
      "a85e14013887aa28bf07c3c9c86c92761d9376ccd89a4a904a45d147b9b6a0f8",
      "59f005f702323855b17d9581d87c2fd0086ed83d3a594678d7858a392b410823"
    ]
  },
  "docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json": {
    "blobSha": "9438c6044ed0291886803c247dfecfd6d587a013",
    "rawSha256": [
      "af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c"
    ]
  },
  "docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json": {
    "blobSha": "49b7cb400a67227c3bcddc9fc4f07eb352c385ea",
    "rawSha256": [
      "84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e"
    ]
  },
  "docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json": {
    "blobSha": "d3deec5eaae372d28dd6e194d245a31036a7968b",
    "rawSha256": [
      "043031f1dca349602e86de34ae039561c9c0b09255ffca5c4e9fb10e66b21c8b"
    ]
  },
  "packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json": {
    "blobSha": "c214ebbe61e7574544549fb2905fa93032807462",
    "rawSha256": [
      "1961b8ecf4023dbaaf7fb1ac60754491400479fc95bffcb91e60ad57cb904dfc"
    ]
  },
  "packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts": {
    "blobSha": "51cdd750e659e42842b1bf1c4967c0073913fb23",
    "rawSha256": [
      "cd21d3bdc8d13821c8ca7d1dd83c3b9e3b5663ee0b156d1fea5bf8821ca3276d"
    ]
  },
  "packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json": {
    "blobSha": "5b4fd485f969411791d2bf1aa14216bc9c184699",
    "rawSha256": [
      "f5f9d82688d9ffe8c47506426866c78249cbbe9c2a415bf107444b0afd80a94c"
    ]
  },
  "tools/main-consolidation/bounded-document-source-admission.json": {
    "blobSha": "271ae9bb2aa3c810c91d4d1cdc846f0050dbf4d9",
    "rawSha256": [
      "b34713b990e77558528d57e2550044439b24726079ceebc93e9032c35b646cd1"
    ]
  },
  "docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json": {
    "blobSha": "d6a6e4ef6b488825d34e9403dd9f77b70f7b3e85",
    "rawSha256": [
      "c41248daa674ff298ff324a890d45f1eae5f91dc4657f7c148b315ffb57be1b2"
    ]
  },
  "tools/main-consolidation/boundedDocumentAdmissionPolicy.mjs": {
    "blobSha": "e3c54634c47832e38f7f5ccf25afcf80edd84836",
    "rawSha256": [
      "8b9c05f82de626b2b0e7140676d3c92f0dea461cbd66a801a8ac00981b8f6b80",
      "9ac9ee3397f3d21b75b63a8c6a710969c09e9b87b7f039e26ed1ef81abb39f5a"
    ]
  },
  "scripts/t14-bounded-document-installed-smoke.mjs": {
    "blobSha": "8689bc7c037f586dc0787699adb5da439b25061d",
    "rawSha256": [
      "92736fb353682d7ade35b480b67512d8e25712ea11641f7c25a97885d94fd237",
      "936f8091edfce2972539f0dcdeea87540f1d527106f0541a838d2968c4e60f56"
    ]
  },
  "scripts/t14-bounded-document-installed-smoke.test.mjs": {
    "blobSha": "bc912e16ab743e019f55218374d70f0b02e366cb",
    "rawSha256": [
      "38b69a80c46fb7cd2d46a2a1197a52be3fd6890a4c86f47a29b9a9cf09a035b5",
      "53ad231712ddd0971285bbe19359cb74237338547c86b9df4a454580802fb353"
    ]
  },
  "scripts/t14-bounded-document-installed-extension-host.test.js": {
    "blobSha": "89f37df8cecc75d93d6eb21f674b5bcb952133ec",
    "rawSha256": [
      "53c1441f8d83ba4bb9e0f44d1522f8d1c90d6429b40fbbcc9eb6d180683fec82",
      "5de8ee5d6bd322ec3a209bd4081c0ae6b990f908e1b11eb497200ea515c4fda7"
    ]
  },
  "docs/release-evidence/proc-t14-bounded-doc-completion-2026-10-24.json": {
    "blobSha": "7442d1eef837105bcba4b0bcf769be02a78a0f60",
    "rawSha256": [
      "380ced2e392014619b0b71499e0247291505867d94955e04e0d47f9ab2316209"
    ]
  }
});
const BASE_FILES_DIGESTS=freeze({
  "gateRBoundedDocument": "3b78cfabe581b58b82e4d2fe0e4e5bcc9a573033f27f50bb60fb2fc93267a075",
  "processingBudgetT14": "da25057b7ada3dbd13e116376409a7e8de0a961e52855f01cf9445dbb2bbe0a6"
});
const SOURCE_IDS=freeze([
  "source-0079608c934fd2c8521b4c4b",
  "source-0209178d37fa1d85d707a3b7",
  "source-029c3450e572ca500b56d997",
  "source-0b1db8b46876527efe49b608",
  "source-0dc3160ff443203c1012c332",
  "source-13c44626c0be971142e83fc1",
  "source-2cc51fa85468ac0ed1130ba8",
  "source-308b45cdc82376d66646f04c",
  "source-51bcaeb41bc1a68cec561182",
  "source-54284087d47d7b028ce71bb0",
  "source-59393027dc9303c0772d3255",
  "source-70fef9b583863580a47ddc75",
  "source-7b83c4602a45112783d66e76",
  "source-933f4d876b1f1a77bdef2c3d",
  "source-a454f8df9fcade23d410f8f9",
  "source-a542dff0e366e0cd08fb9506",
  "source-af2bee558009aa5c69c8e766",
  "source-b11e3d49cc49cbfcfc612cea",
  "source-b9febf9c1b199ac9a861df0a",
  "source-bb1f1886f02fe1d15e4ddf67",
  "source-bc1c6595fef769aedee758f4",
  "source-c07e349e46e5969f9dd00866",
  "source-d00fdc4453525c52ab2e44a2",
  "source-d4a33aff27a5fdfe2ef009b7",
  "source-d4e08dcfed03d4704221716b",
  "source-d869381edc302fee73a78b09",
  "source-dc1308461f2b82bbe709d2a9",
  "source-df389420fc16a7c3191f1011",
  "source-e4aab2d934795fa338eb336a",
  "source-ebbc80adbe86accc7deb0bb0"
]);
const SOURCE_PATHS=freeze([
  "extensions/bob-bazaar-review/.vscodeignore",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlArchive.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts",
  "extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts",
  "extensions/bob-bazaar-review/test/dependencyPolicy.test.js",
  "extensions/bob-bazaar-review/test/ooxmlPreCancelled.test.js",
  "extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js",
  "extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js",
  "extensions/bob-bazaar-review/test/ruleConfiguredOoxmlLimitForwarding.test.js",
  "extensions/bob-bazaar-review/test/ruleDocumentAggregateBudget.test.js",
  "extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js",
  "extensions/bob-code-consistency-review/.vscodeignore",
  "extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts",
  "extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts",
  "extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts",
  "extensions/bob-code-consistency-review/src/core/pipeline.ts",
  "extensions/bob-code-consistency-review/src/core/reviewInputValidator.ts",
  "extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts",
  "extensions/bob-code-consistency-review/test/dependencyPolicy.test.js",
  "extensions/bob-code-consistency-review/test/documentAggregateBudget.test.js",
  "extensions/bob-code-consistency-review/test/documentBoundedInput.test.js",
  "extensions/bob-code-consistency-review/test/documentXlsxCancellationOrder.test.js",
  "extensions/bob-code-consistency-review/test/pipelineDocumentCancellation.test.js",
  "packages/processing-budget-runtime/README.md",
  "packages/processing-budget-runtime/scripts/build-runtime.js",
  "packages/processing-budget-runtime/scripts/check-document-boundary.js",
  "packages/processing-budget-runtime/scripts/runtime-payload.js",
  "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
  "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
  "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
  "packages/processing-budget-runtime/src/documentBudget.ts",
  "packages/processing-budget-runtime/src/index.ts",
  "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
  "packages/processing-budget-runtime/src/validatedOoxml.ts",
  "packages/processing-budget-runtime/src/workbookBudget.ts",
  "packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js",
  "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
  "packages/processing-budget-runtime/test/documentAdmission.test.js",
  "packages/processing-budget-runtime/test/documentAggregateBudget.test.js",
  "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
  "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
  "packages/processing-budget-runtime/test/helpers.js",
  "packages/processing-budget-runtime/test/packageContract.test.js",
  "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
  "packages/processing-budget-runtime/test/workbookBudget.test.js",
  "packages/processing-budget-runtime/test/xlsxWorkbookBudget.test.js"
]);
const CONTROL_PATHS=freeze([
  ".gitattributes",
  ".github/workflows/processing-budget-runtime.yml",
  "docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json",
  "docs/superpowers/plans/2026-10-26-proc-t15-aggregate.md",
  "docs/superpowers/specs/2026-10-26-proc-t15-aggregate-design.md",
  "scripts/exact-head-ci-contract.test.js",
  "scripts/extension-host-smoke-contract.test.js",
  "scripts/processing-runtime-build-workflow.test.js",
  "scripts/t15-aggregate-installed-extension-host.test.js",
  "scripts/t15-aggregate-installed-smoke.mjs",
  "scripts/t15-aggregate-installed-smoke.test.mjs",
  "scripts/three-extension-ui-contract-workflow.test.js",
  "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
  "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
  "tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs",
  "tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs",
  "tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs",
  "tools/main-consolidation/test/helpers/aggregateAdmissionFixture.mjs",
  "tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs"
]);
const DOMAIN_PATHS=freeze({
  "gate_r_shipping": [
    ".gitattributes",
    ".github/workflows/processing-budget-runtime.yml",
    "docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json",
    "docs/superpowers/plans/2026-10-26-proc-t15-aggregate.md",
    "docs/superpowers/specs/2026-10-26-proc-t15-aggregate-design.md",
    "extensions/bob-bazaar-review/.vscodeignore",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlArchive.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts",
    "extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts",
    "extensions/bob-bazaar-review/test/dependencyPolicy.test.js",
    "extensions/bob-bazaar-review/test/ooxmlPreCancelled.test.js",
    "extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js",
    "extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js",
    "extensions/bob-bazaar-review/test/ruleConfiguredOoxmlLimitForwarding.test.js",
    "extensions/bob-bazaar-review/test/ruleDocumentAggregateBudget.test.js",
    "extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js",
    "extensions/bob-code-consistency-review/.vscodeignore",
    "extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts",
    "extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts",
    "extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts",
    "extensions/bob-code-consistency-review/src/core/pipeline.ts",
    "extensions/bob-code-consistency-review/src/core/reviewInputValidator.ts",
    "extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts",
    "extensions/bob-code-consistency-review/test/dependencyPolicy.test.js",
    "extensions/bob-code-consistency-review/test/documentAggregateBudget.test.js",
    "extensions/bob-code-consistency-review/test/documentBoundedInput.test.js",
    "extensions/bob-code-consistency-review/test/documentXlsxCancellationOrder.test.js",
    "extensions/bob-code-consistency-review/test/pipelineDocumentCancellation.test.js",
    "scripts/exact-head-ci-contract.test.js",
    "scripts/extension-host-smoke-contract.test.js",
    "scripts/processing-runtime-build-workflow.test.js",
    "scripts/t15-aggregate-installed-extension-host.test.js",
    "scripts/t15-aggregate-installed-smoke.mjs",
    "scripts/t15-aggregate-installed-smoke.test.mjs",
    "scripts/three-extension-ui-contract-workflow.test.js",
    "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
    "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
    "tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/helpers/aggregateAdmissionFixture.mjs",
    "tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs"
  ],
  "processing_budget": [
    ".gitattributes",
    ".github/workflows/processing-budget-runtime.yml",
    "docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json",
    "docs/superpowers/plans/2026-10-26-proc-t15-aggregate.md",
    "docs/superpowers/specs/2026-10-26-proc-t15-aggregate-design.md",
    "packages/processing-budget-runtime/README.md",
    "packages/processing-budget-runtime/scripts/build-runtime.js",
    "packages/processing-budget-runtime/scripts/check-document-boundary.js",
    "packages/processing-budget-runtime/scripts/runtime-payload.js",
    "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
    "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
    "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
    "packages/processing-budget-runtime/src/documentBudget.ts",
    "packages/processing-budget-runtime/src/index.ts",
    "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
    "packages/processing-budget-runtime/src/validatedOoxml.ts",
    "packages/processing-budget-runtime/src/workbookBudget.ts",
    "packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js",
    "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
    "packages/processing-budget-runtime/test/documentAdmission.test.js",
    "packages/processing-budget-runtime/test/documentAggregateBudget.test.js",
    "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
    "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
    "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
    "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
    "packages/processing-budget-runtime/test/helpers.js",
    "packages/processing-budget-runtime/test/packageContract.test.js",
    "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
    "packages/processing-budget-runtime/test/workbookBudget.test.js",
    "packages/processing-budget-runtime/test/xlsxWorkbookBudget.test.js",
    "scripts/exact-head-ci-contract.test.js",
    "scripts/extension-host-smoke-contract.test.js",
    "scripts/processing-runtime-build-workflow.test.js",
    "scripts/t15-aggregate-installed-extension-host.test.js",
    "scripts/t15-aggregate-installed-smoke.mjs",
    "scripts/t15-aggregate-installed-smoke.test.mjs",
    "scripts/three-extension-ui-contract-workflow.test.js",
    "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
    "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
    "tools/main-consolidation/test/aggregateDocumentAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/helpers/aggregateAdmissionFixture.mjs",
    "tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs"
  ]
});

const fail=reason=>{throw new TypeError('aggregate document admission: '+reason);};
const digest=value=>gateRDigest(gateRCanonicalJson(value));
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('literal exact fields');}
function data(root,relative){return JSON.parse(readGateRContainedFile(root,relative));}
function bindings(rows,expectedPaths){
 if(!Array.isArray(rows)||JSON.stringify(rows.map(row=>row.path))!==JSON.stringify(expectedPaths))fail('literal paths');gateRPathRows(rows,'aggregate document literal paths');
 for(const row of rows){exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);if(row.mode!=='100644'||(row.beforeBlobSha!==null&&!/^[0-9a-f]{40}$/.test(row.beforeBlobSha))||!/^[0-9a-f]{40}$/.test(row.afterBlobSha)||!Array.isArray(row.sourceItemIds)||row.sourceItemIds.some((id,index)=>!SOURCE_IDS.includes(id)||(index>0&&row.sourceItemIds[index-1]>=id)))fail('literal row identity');}
}
export function validateAggregateDocumentCoverage(input){
 const c=gateRInputData(input,'aggregate document coverage');exact(c,['schemaVersion','baseMainSha','baseTreeSha','sourceUniverseSha256','selectionLedgerSha256','items','additionalCurrentMainPrerequisites','preservedBaselines','adaptationDecisions','remainderClosure']);
 if(c.schemaVersion!=='bob-builtin-analyze/proc-t15-aggregate-source-coverage/v1'||c.baseMainSha!==BASE||c.baseTreeSha!==TREE||digest(c)!==AGGREGATE_DOCUMENT_SOURCE_COVERAGE_SHA256)fail('literal coverage identity');
 if(!Array.isArray(c.items)||JSON.stringify(c.items.map(row=>row.sourceItemId))!==JSON.stringify(SOURCE_IDS)||new Set(c.items.map(row=>row.origin.path)).size!==25||new Set(c.items.map(row=>row.origin.blobSha)).size!==23||c.items.some(row=>row.origin.commitSha!=='7fc7a371e6506290d8626d06e9b12c2a67888b47')||c.remainderClosure.total!==675||c.remainderClosure.items.length!==675||c.remainderClosure.unassigned!==0)fail('literal complete coverage');
 return true;
}
export function validateAggregateDocumentSourceAdmission(input){
 const a=gateRInputData(input,'aggregate document source admission');exact(a,['schemaVersion','baseMainSha','baseTreeSha','baseFilesDigests','sourceRows','controlRows','sourceCoverageDigest']);exact(a.baseFilesDigests,['gateRBoundedDocument','processingBudgetT14']);
 if(a.schemaVersion!=='bob-builtin-analyze/aggregate-document-source-admission/v1'||a.baseMainSha!==BASE||a.baseTreeSha!==TREE||a.sourceCoverageDigest!==AGGREGATE_DOCUMENT_SOURCE_COVERAGE_SHA256||JSON.stringify(a.baseFilesDigests)!==JSON.stringify(BASE_FILES_DIGESTS))fail('literal baseline identity');bindings(a.sourceRows,SOURCE_PATHS);bindings(a.controlRows,CONTROL_PATHS);if(digest(a)!==AGGREGATE_DOCUMENT_SOURCE_ADMISSION_SHA256)fail('literal admission seal');
 const rows=[...a.sourceRows,...a.controlRows].map(row=>row.path).sort(),union=[...new Set([...DOMAIN_PATHS.gate_r_shipping,...DOMAIN_PATHS.processing_budget])].sort();if(JSON.stringify(rows)!==JSON.stringify(union))fail('domain union inventory');
 return true;
}
export function applyAggregateDocumentSourceAdmission(input,options){
 validateAggregateDocumentSourceAdmission(input);const a=gateRInputData(input,'aggregate document source admission'),settings=gateRInputData(options,'aggregate document projection');exact(settings,['domain','baseFiles']);const key=settings.domain==='gate_r_shipping'?'gateRBoundedDocument':settings.domain==='processing_budget'?'processingBudgetT14':undefined;
 if(!key)fail('unknown domain');if(!Array.isArray(settings.baseFiles)||digest(settings.baseFiles)!==BASE_FILES_DIGESTS[key])fail('domain baseline identity');
 const files=new Map(settings.baseFiles.map(row=>[row.path,{...row}])),scope=new Set(DOMAIN_PATHS[settings.domain]);
 for(const row of [...a.sourceRows,...a.controlRows])if(scope.has(row.path)){const before=files.get(row.path);if(before&&(before.mode!==row.mode||before.blobSha!==row.beforeBlobSha))fail('literal T14 before blob mismatch');files.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});}
 return [...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function validateAggregateDocumentRepository(repositoryRoot=ROOT){
 const root=path.resolve(repositoryRoot);if(fs.lstatSync(root).isSymbolicLink()||!fs.lstatSync(root).isDirectory())fail('repository root alias');
 const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 for(const [relative,binding]of Object.entries(AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS))if(!binding.rawSha256.includes(gateRDigest(readGateRContainedFile(root,relative))))fail('historical raw bytes: '+relative);
 const bounded=readGateRContainedFile(root,T14_ADMISSION),boundedCoverage=readGateRContainedFile(root,T14_COVERAGE);validateBoundedDocumentSourceAdmission(bounded);validateBoundedDocumentCoverage(boundedCoverage);
 const rawAdmission=readGateRContainedFile(root,ADMISSION),rawCoverage=readGateRContainedFile(root,COVERAGE);validateAggregateDocumentSourceAdmission(rawAdmission);validateAggregateDocumentCoverage(rawCoverage);const a=gateRInputData(rawAdmission,'aggregate document admission'),c=gateRInputData(rawCoverage,'aggregate document coverage');
 const old=data(root,T13_ADMISSION),t14=gateRInputData(bounded,'bounded document admission'),prior=new Map([...old.sourceRows.map(row=>({path:row.path,mode:row.mode,blobSha:row.afterBlobSha})),...old.controlRows,...t14.sourceRows.map(row=>({path:row.path,mode:row.mode,blobSha:row.afterBlobSha})),...t14.controlRows.map(row=>({path:row.path,mode:row.mode,blobSha:row.afterBlobSha}))].map(row=>[row.path,row]));
 const rows=[...a.sourceRows,...a.controlRows];for(const row of rows){const before=prior.get(row.path);if(before&&(before.mode!==row.mode||before.blobSha!==row.beforeBlobSha))fail('T14 after to T15 before chain');}
 const universe=data(root,'tools/main-consolidation/feature-selection-source-universe.json');if(JSON.stringify(c.remainderClosure.items.map(row=>row.sourceItemId))!==JSON.stringify(universe.items.map(row=>row.sourceItemId)))fail('complete675 partition');
 for(const item of c.items){const source=universe.items.find(row=>row.sourceItemId===item.sourceItemId);if(source?.primaryOwner!=='PROC-T15-AGGREGATE'||!source.origins.some(origin=>origin.commitSha===item.origin.commitSha&&origin.blobSha===item.origin.blobSha&&origin.path===item.origin.path))fail('origin binding');}
 const required=[...new Set([...Object.keys(AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS),...rows.map(row=>row.path),ADMISSION,POLICY])].sort();for(const relative of required)readGateRContainedFile(root,relative);
 const index=new Map();for(const line of git(['ls-files','--stage','--',...required]).split('\n')){const match=/^100644 ([0-9a-f]{40}) 0\t(.+)$/.exec(line);if(!match||index.has(match[2]))fail('index identity');index.set(match[2],match[1]);}
 const measured=git(['hash-object','--stdin-paths'],required.join('\n')+'\n').split('\n');if(measured.length!==required.length)fail('working inventory');const working=new Map(required.map((relative,position)=>[relative,measured[position]]));
 function identity(relative,expected){if(index.get(relative)!==expected)fail('index identity: '+relative);if(working.get(relative)!==expected)fail('working identity: '+relative);}
 for(const [relative,binding]of Object.entries(AGGREGATE_DOCUMENT_HISTORICAL_BINDINGS))identity(relative,binding.blobSha);for(const row of rows)identity(row.path,row.afterBlobSha);for(const relative of [ADMISSION,POLICY]){if(!index.has(relative))fail('independent control index');identity(relative,index.get(relative));}
 const packagePrefix='packages/processing-budget-runtime/',expected=new Set([...old.sourceRows,...old.controlRows,...t14.sourceRows,...t14.controlRows,...rows].map(row=>row.path).filter(relative=>relative.startsWith(packagePrefix))),actual=[];
 function inventory(directory,relative){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=relative+entry.name,file=path.join(directory,entry.name);if(entry.isSymbolicLink())fail('package alias');if(relative===packagePrefix&&['node_modules','out'].includes(entry.name)){if(!entry.isDirectory())fail('generated directory');continue;}if(entry.isDirectory())inventory(file,name+'/');else if(entry.isFile())actual.push(name);else fail('special package entry');}}
 inventory(path.join(root,packagePrefix),packagePrefix);if(JSON.stringify(actual.sort())!==JSON.stringify([...expected].sort()))fail('unknown package inventory');
 for(const item of c.additionalCurrentMainPrerequisites)if(!rows.some(row=>row.path===item.path&&row.sourceItemIds.length===0)&&![ADMISSION,POLICY].includes(item.path))fail('unbound prerequisite');
 const attributes=readGateRContainedFile(root,'.gitattributes').toString('utf8').split(/\r?\n/);for(const relative of [ADMISSION,COVERAGE,'docs/release-evidence/proc-t15-aggregate-completion-2026-10-26.json'])if(!attributes.includes(relative+' text eol=lf'))fail('literal LF rule');
}
