import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows,readGateRContainedFile} from './gateRData.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ADMISSION='tools/main-consolidation/bounded-document-source-admission.json';
const COVERAGE='docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json';
const POLICY='tools/main-consolidation/boundedDocumentAdmissionPolicy.mjs';
const BASE='0e806d48dfdd3136f47f36218b72fba1cfb4c4fd',TREE='7623f90470a16145cdcb8d641959e18856820f67';
// Literal constants below are sealed from the reviewed T14 scope, never caller supplied.
export const BOUNDED_DOCUMENT_SOURCE_ADMISSION_SHA256="b34713b990e77558528d57e2550044439b24726079ceebc93e9032c35b646cd1";
export const BOUNDED_DOCUMENT_SOURCE_COVERAGE_SHA256="c41248daa674ff298ff324a890d45f1eae5f91dc4657f7c148b315ffb57be1b2";
export const BOUNDED_DOCUMENT_HISTORICAL_BINDINGS=Object.freeze({
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
  }
});
const BASE_FILES_DIGESTS={
  "gateRDiscovery": "b611481d7cc00f46bb040bbc4d89620f971ee39e94cba1dd009f5d435d3012f0",
  "processingBudgetT13": "06e8a58e3cdbf447d9cf0238c8979adf6f8117373e872079f47062b92056d50d"
};
const SOURCE_IDS=[
  "source-081690cb9b343e0e4fd86aaa",
  "source-0f84fc23754230d796e0a5b3",
  "source-115f8910d0fd986cd859a0cb",
  "source-116947d48756a2313f259d67",
  "source-11c6eda712b2f301761a6dd5",
  "source-122cdfe84d37c5f2d7462bdc",
  "source-15ac07e0adbade462b24c3d7",
  "source-212b25dd59af07e1690b14f0",
  "source-55668c6c4fc0ac2d3e153762",
  "source-61060f515b48c9284440815f",
  "source-6e47fdc9c880c66578479d9e",
  "source-757ca93020f46db1d64ffa69",
  "source-766a64b493cd8b3b12542bb6",
  "source-77efe876583486afd84bc446",
  "source-79eaa2908653365204363bca",
  "source-88eaed95118bf51f812a1b91",
  "source-8921fb578f27dc51782bedbb",
  "source-8bc8f4d403d2a239104b230b",
  "source-8c8b935c16fbfd490ffaed7c",
  "source-8e4006e199b552802bd3321e",
  "source-92c9c09c80024b9a183e6a25",
  "source-9364e198f4b4e13273dfe750",
  "source-98d63195b541433bc119f411",
  "source-9c736d36f51e003acd61ec67",
  "source-9e6d125b619471c4637173cb",
  "source-a2f4e841de98c10855985c8d",
  "source-a7bc4d9c841743268ccca70c",
  "source-b4ab7cc1ae4820e5605f057e",
  "source-c4a71884a59c961e40fd6866",
  "source-c7840f4d1fe2e382e974f73a",
  "source-d2c3714904c50e0fe41bbb09",
  "source-da39f68ce042cc7d54b5e92b",
  "source-db0dcef3635a43637cc9c2f3",
  "source-e056445cbc6911cd4866e520",
  "source-e1425c0445b88a037b0c09af",
  "source-e6b932cf56ceda58b85a155f",
  "source-e8f3a56005a262a9606c1e60",
  "source-e9d5a1e9d34f3ddaa30417cb",
  "source-f67f10f4f0b705f9399609cd"
];
const SOURCE_PATHS=[
  "extensions/bob-bazaar-review/README.md",
  "extensions/bob-bazaar-review/package-lock.json",
  "extensions/bob-bazaar-review/package.json",
  "extensions/bob-bazaar-review/scripts/build-shared-runtime.js",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlArchive.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlPreflight.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts",
  "extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts",
  "extensions/bob-bazaar-review/test/dependencyPolicy.test.js",
  "extensions/bob-bazaar-review/test/extensionSourceLayout.test.js",
  "extensions/bob-bazaar-review/test/helpers/sharedOoxmlTestAdapter.js",
  "extensions/bob-bazaar-review/test/ruleAuthoringHeavyDependencyLoading.test.js",
  "extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js",
  "extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js",
  "extensions/bob-bazaar-review/test/ruleConfiguredOoxmlLimitForwarding.test.js",
  "extensions/bob-bazaar-review/test/ruleDocumentExtraction.test.js",
  "extensions/bob-bazaar-review/test/ruleNoLegacyOoxmlPreflight.test.js",
  "extensions/bob-bazaar-review/test/ruleOoxmlPreflight.test.js",
  "extensions/bob-bazaar-review/test/ruleSourceHash.test.js",
  "extensions/bob-bazaar-review/test/ruleXlsxExtraction.test.js",
  "extensions/bob-code-consistency-review/README.md",
  "extensions/bob-code-consistency-review/package-lock.json",
  "extensions/bob-code-consistency-review/package.json",
  "extensions/bob-code-consistency-review/scripts/build-shared-runtime.js",
  "extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts",
  "extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts",
  "extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts",
  "extensions/bob-code-consistency-review/src/commands/reviewInputCommands.ts",
  "extensions/bob-code-consistency-review/src/core/reviewInputAiDraftProvider.ts",
  "extensions/bob-code-consistency-review/src/core/reviewInputDiscovery.ts",
  "extensions/bob-code-consistency-review/src/core/traceabilityAiDraftProvider.ts",
  "extensions/bob-code-consistency-review/src/reviewProcessingConfiguration.ts",
  "extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts",
  "extensions/bob-code-consistency-review/src/traceabilityCommands.ts",
  "extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts",
  "extensions/bob-code-consistency-review/test/dependencyPolicy.test.js",
  "extensions/bob-code-consistency-review/test/discoveryProcessingLimitsWiring.test.js",
  "extensions/bob-code-consistency-review/test/documentBoundedInput.test.js",
  "extensions/bob-code-consistency-review/test/documentSourceLimitDescription.test.js",
  "extensions/bob-code-consistency-review/test/heavyDependencyLoading.test.js",
  "extensions/bob-code-consistency-review/test/reviewInputDiscovery.test.js",
  "extensions/bob-code-consistency-review/test/reviewProcessingConfiguration.test.js",
  "extensions/bob-code-consistency-review/test/sizeLimits.test.js",
  "packages/processing-budget-runtime/README.md",
  "packages/processing-budget-runtime/package-lock.json",
  "packages/processing-budget-runtime/package.json",
  "packages/processing-budget-runtime/scripts/build-runtime.js",
  "packages/processing-budget-runtime/scripts/check-document-boundary.js",
  "packages/processing-budget-runtime/scripts/copy-extension-runtime.js",
  "packages/processing-budget-runtime/scripts/runtime-payload.js",
  "packages/processing-budget-runtime/src/boundedDocumentError.ts",
  "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
  "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
  "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
  "packages/processing-budget-runtime/src/index.ts",
  "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
  "packages/processing-budget-runtime/src/ooxmlPreflight.ts",
  "packages/processing-budget-runtime/src/validatedOoxml.ts",
  "packages/processing-budget-runtime/test/baseline/m2-ooxmlArchive.ts",
  "packages/processing-budget-runtime/test/baseline/m2-ooxmlPreflight.ts",
  "packages/processing-budget-runtime/test/baseline/m2-ruleAuthoringLimits.ts",
  "packages/processing-budget-runtime/test/baseline/m2-ruleOoxmlPreflight.test.js",
  "packages/processing-budget-runtime/test/baseline/m2-ruleSourceHash.ts",
  "packages/processing-budget-runtime/test/baseline/m2-storedZipFixture.js",
  "packages/processing-budget-runtime/test/boundedArchiveInputLimit.test.js",
  "packages/processing-budget-runtime/test/boundedDocumentIo.test.js",
  "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
  "packages/processing-budget-runtime/test/boundedDocumentRuntime.test.js",
  "packages/processing-budget-runtime/test/boundedZipRetention.test.js",
  "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
  "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/tsconfig.json",
  "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
  "packages/processing-budget-runtime/test/helpers.js",
  "packages/processing-budget-runtime/test/helpers/boundedDocumentFixtures.js",
  "packages/processing-budget-runtime/test/helpers/m2OoxmlBaseline.js",
  "packages/processing-budget-runtime/test/ooxmlMigrationParity.test.js",
  "packages/processing-budget-runtime/test/ooxmlParserInput.test.js",
  "packages/processing-budget-runtime/test/packageContract.test.js",
  "packages/processing-budget-runtime/test/processingBudgetContracts.test.js"
];
const CONTROL_PATHS=[
  ".gitattributes",
  ".github/workflows/code-consistency-review-scaffold.yml",
  ".github/workflows/extensions-quality.yml",
  ".github/workflows/processing-budget-runtime.yml",
  "docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json",
  "docs/superpowers/plans/2026-10-24-proc-t14-bounded-doc.md",
  "docs/superpowers/specs/2026-10-24-proc-t14-bounded-doc-design.md",
  "scripts/exact-head-ci-contract.test.js",
  "scripts/extension-host-smoke-contract.test.js",
  "scripts/processing-runtime-build-workflow.test.js",
  "scripts/t14-bounded-document-installed-extension-host.test.js",
  "scripts/t14-bounded-document-installed-smoke.mjs",
  "scripts/t14-bounded-document-installed-smoke.test.mjs",
  "scripts/three-extension-ui-contract-workflow.test.js",
  "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
  "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
  "tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs",
  "tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs",
  "tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs"
];
const DOMAIN_PATHS={
  "gate_r_shipping": [
    "extensions/bob-bazaar-review/README.md",
    "extensions/bob-bazaar-review/package-lock.json",
    "extensions/bob-bazaar-review/package.json",
    "extensions/bob-bazaar-review/scripts/build-shared-runtime.js",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlArchive.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/ooxmlPreflight.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts",
    "extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts",
    "extensions/bob-bazaar-review/test/dependencyPolicy.test.js",
    "extensions/bob-bazaar-review/test/extensionSourceLayout.test.js",
    "extensions/bob-bazaar-review/test/helpers/sharedOoxmlTestAdapter.js",
    "extensions/bob-bazaar-review/test/ruleAuthoringHeavyDependencyLoading.test.js",
    "extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js",
    "extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js",
    "extensions/bob-bazaar-review/test/ruleConfiguredOoxmlLimitForwarding.test.js",
    "extensions/bob-bazaar-review/test/ruleDocumentExtraction.test.js",
    "extensions/bob-bazaar-review/test/ruleNoLegacyOoxmlPreflight.test.js",
    "extensions/bob-bazaar-review/test/ruleOoxmlPreflight.test.js",
    "extensions/bob-bazaar-review/test/ruleSourceHash.test.js",
    "extensions/bob-bazaar-review/test/ruleXlsxExtraction.test.js",
    "extensions/bob-code-consistency-review/README.md",
    "extensions/bob-code-consistency-review/package-lock.json",
    "extensions/bob-code-consistency-review/package.json",
    "extensions/bob-code-consistency-review/scripts/build-shared-runtime.js",
    "extensions/bob-code-consistency-review/src/analyzers/documentDocxExtractor.ts",
    "extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts",
    "extensions/bob-code-consistency-review/src/analyzers/documentXlsxExtractor.ts",
    "extensions/bob-code-consistency-review/src/commands/reviewInputCommands.ts",
    "extensions/bob-code-consistency-review/src/core/reviewInputAiDraftProvider.ts",
    "extensions/bob-code-consistency-review/src/core/reviewInputDiscovery.ts",
    "extensions/bob-code-consistency-review/src/core/traceabilityAiDraftProvider.ts",
    "extensions/bob-code-consistency-review/src/reviewProcessingConfiguration.ts",
    "extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts",
    "extensions/bob-code-consistency-review/src/traceabilityCommands.ts",
    "extensions/bob-code-consistency-review/src/webview/consistencyReviewWizard.ts",
    "extensions/bob-code-consistency-review/test/dependencyPolicy.test.js",
    "extensions/bob-code-consistency-review/test/discoveryProcessingLimitsWiring.test.js",
    "extensions/bob-code-consistency-review/test/documentBoundedInput.test.js",
    "extensions/bob-code-consistency-review/test/documentSourceLimitDescription.test.js",
    "extensions/bob-code-consistency-review/test/heavyDependencyLoading.test.js",
    "extensions/bob-code-consistency-review/test/reviewInputDiscovery.test.js",
    "extensions/bob-code-consistency-review/test/reviewProcessingConfiguration.test.js",
    "extensions/bob-code-consistency-review/test/sizeLimits.test.js"
  ],
  "processing_budget": [
    ".gitattributes",
    ".github/workflows/code-consistency-review-scaffold.yml",
    ".github/workflows/extensions-quality.yml",
    ".github/workflows/processing-budget-runtime.yml",
    "docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json",
    "docs/superpowers/plans/2026-10-24-proc-t14-bounded-doc.md",
    "docs/superpowers/specs/2026-10-24-proc-t14-bounded-doc-design.md",
    "packages/processing-budget-runtime/README.md",
    "packages/processing-budget-runtime/package-lock.json",
    "packages/processing-budget-runtime/package.json",
    "packages/processing-budget-runtime/scripts/build-runtime.js",
    "packages/processing-budget-runtime/scripts/check-document-boundary.js",
    "packages/processing-budget-runtime/scripts/copy-extension-runtime.js",
    "packages/processing-budget-runtime/scripts/runtime-payload.js",
    "packages/processing-budget-runtime/src/boundedDocumentError.ts",
    "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
    "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
    "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
    "packages/processing-budget-runtime/src/index.ts",
    "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
    "packages/processing-budget-runtime/src/ooxmlPreflight.ts",
    "packages/processing-budget-runtime/src/validatedOoxml.ts",
    "packages/processing-budget-runtime/test/baseline/m2-ooxmlArchive.ts",
    "packages/processing-budget-runtime/test/baseline/m2-ooxmlPreflight.ts",
    "packages/processing-budget-runtime/test/baseline/m2-ruleAuthoringLimits.ts",
    "packages/processing-budget-runtime/test/baseline/m2-ruleOoxmlPreflight.test.js",
    "packages/processing-budget-runtime/test/baseline/m2-ruleSourceHash.ts",
    "packages/processing-budget-runtime/test/baseline/m2-storedZipFixture.js",
    "packages/processing-budget-runtime/test/boundedArchiveInputLimit.test.js",
    "packages/processing-budget-runtime/test/boundedDocumentIo.test.js",
    "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
    "packages/processing-budget-runtime/test/boundedDocumentRuntime.test.js",
    "packages/processing-budget-runtime/test/boundedZipRetention.test.js",
    "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
    "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
    "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
    "packages/processing-budget-runtime/test/fixtures/tsconfig.json",
    "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
    "packages/processing-budget-runtime/test/helpers.js",
    "packages/processing-budget-runtime/test/helpers/boundedDocumentFixtures.js",
    "packages/processing-budget-runtime/test/helpers/m2OoxmlBaseline.js",
    "packages/processing-budget-runtime/test/ooxmlMigrationParity.test.js",
    "packages/processing-budget-runtime/test/ooxmlParserInput.test.js",
    "packages/processing-budget-runtime/test/packageContract.test.js",
    "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
    "scripts/exact-head-ci-contract.test.js",
    "scripts/extension-host-smoke-contract.test.js",
    "scripts/processing-runtime-build-workflow.test.js",
    "scripts/t14-bounded-document-installed-extension-host.test.js",
    "scripts/t14-bounded-document-installed-smoke.mjs",
    "scripts/t14-bounded-document-installed-smoke.test.mjs",
    "scripts/three-extension-ui-contract-workflow.test.js",
    "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
    "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
    "tools/main-consolidation/test/boundedDocumentAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/gateRMainAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/processingBudgetAdmissionPolicy.test.mjs"
  ]
};
const fail=reason=>{throw new TypeError('bounded document admission: '+reason);};
const digest=value=>gateRDigest(gateRCanonicalJson(value));
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('literal exact fields');}
function data(root,relative){return JSON.parse(readGateRContainedFile(root,relative));}
function bindings(rows,expectedPaths){
 if(!Array.isArray(rows)||JSON.stringify(rows.map(row=>row.path))!==JSON.stringify(expectedPaths))fail('literal paths');
 gateRPathRows(rows,'bounded document literal paths');
 for(const row of rows){exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);if(row.mode!=='100644'||(row.beforeBlobSha!==null&&!/^[0-9a-f]{40}$/.test(row.beforeBlobSha))||!/^[0-9a-f]{40}$/.test(row.afterBlobSha)||!Array.isArray(row.sourceItemIds)||row.sourceItemIds.some((id,index)=>!SOURCE_IDS.includes(id)||(index>0&&row.sourceItemIds[index-1]>=id)))fail('literal row identity');}
}
export function validateBoundedDocumentCoverage(input){
 const c=gateRInputData(input,'bounded document coverage');
 exact(c,['schemaVersion','baseMainSha','baseTreeSha','sourceUniverseSha256','selectionLedgerSha256','items','additionalCurrentMainPrerequisites','preservedBaselines','adaptationDecisions','remainderClosure']);
 if(c.schemaVersion!=='bob-builtin-analyze/proc-t14-bounded-doc-source-coverage/v1'||c.baseMainSha!==BASE||c.baseTreeSha!==TREE||digest(c)!==BOUNDED_DOCUMENT_SOURCE_COVERAGE_SHA256)fail('literal coverage identity');
 if(!Array.isArray(c.items)||JSON.stringify(c.items.map(item=>item.sourceItemId))!==JSON.stringify(SOURCE_IDS)||c.remainderClosure.total!==675||c.remainderClosure.items.length!==675||c.remainderClosure.unassigned!==0)fail('literal complete coverage');
 return true;
}
export function validateBoundedDocumentSourceAdmission(input){
 const a=gateRInputData(input,'bounded document source admission');
 exact(a,['schemaVersion','baseMainSha','baseTreeSha','baseFilesDigests','sourceRows','controlRows','sourceCoverageDigest']);exact(a.baseFilesDigests,['gateRDiscovery','processingBudgetT13']);
 if(a.schemaVersion!=='bob-builtin-analyze/bounded-document-source-admission/v1'||a.baseMainSha!==BASE||a.baseTreeSha!==TREE||a.sourceCoverageDigest!==BOUNDED_DOCUMENT_SOURCE_COVERAGE_SHA256||JSON.stringify(a.baseFilesDigests)!==JSON.stringify(BASE_FILES_DIGESTS))fail('literal baseline identity');
 bindings(a.sourceRows,SOURCE_PATHS);bindings(a.controlRows,CONTROL_PATHS);
 if(digest(a)!==BOUNDED_DOCUMENT_SOURCE_ADMISSION_SHA256)fail('literal admission seal');
 return true;
}
export function applyBoundedDocumentSourceAdmission(input,options){
 validateBoundedDocumentSourceAdmission(input);const a=gateRInputData(input,'bounded document source admission'),settings=gateRInputData(options,'bounded document projection');exact(settings,['domain','baseFiles']);
 const baselineKey=settings.domain==='gate_r_shipping'?'gateRDiscovery':settings.domain==='processing_budget'?'processingBudgetT13':undefined;
 if(!baselineKey)fail('unknown domain');if(!Array.isArray(settings.baseFiles)||digest(settings.baseFiles)!==BASE_FILES_DIGESTS[baselineKey])fail('domain baseline identity');
 const files=new Map(settings.baseFiles.map(row=>[row.path,{...row}])),scope=new Set(DOMAIN_PATHS[settings.domain]);
 for(const row of [...a.sourceRows,...a.controlRows])if(scope.has(row.path)){
  const before=files.get(row.path);if(before&&(before.mode!==row.mode||before.blobSha!==row.beforeBlobSha))fail('literal before blob mismatch');
  // Previously unprojected M2 files have independently sealed before blobs in this exact layer.
  files.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});
 }
 return [...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function validateBoundedDocumentRepository(repositoryRoot=ROOT){
 const root=path.resolve(repositoryRoot);if(fs.lstatSync(root).isSymbolicLink()||!fs.lstatSync(root).isDirectory())fail('repository root alias');
 const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8',maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 for(const [relative,binding]of Object.entries(BOUNDED_DOCUMENT_HISTORICAL_BINDINGS)){
  const bytes=readGateRContainedFile(root,relative);if(!binding.rawSha256.includes(gateRDigest(bytes)))fail('historical raw bytes: '+relative);
 }
 const a=data(root,ADMISSION),c=data(root,COVERAGE);validateBoundedDocumentSourceAdmission(a);validateBoundedDocumentCoverage(c);
 const universe=data(root,'tools/main-consolidation/feature-selection-source-universe.json');
 if(JSON.stringify(c.remainderClosure.items.map(item=>item.sourceItemId))!==JSON.stringify(universe.items.map(item=>item.sourceItemId)))fail('complete675 partition');
 for(const item of c.items){const source=universe.items.find(row=>row.sourceItemId===item.sourceItemId);if(!source?.origins.some(origin=>origin.commitSha===item.origin.commitSha&&origin.blobSha===item.origin.blobSha&&origin.path===item.origin.path))fail('origin binding');}
 const rows=[...a.sourceRows,...a.controlRows],required=[...new Set([...Object.keys(BOUNDED_DOCUMENT_HISTORICAL_BINDINGS),...rows.map(row=>row.path),ADMISSION,POLICY])].sort();
 // Validate containment before Git reads; batch the identical plumbing operations so
 // repeated Gate R checks do not launch hundreds of processes per repository replay.
 for(const relative of required)readGateRContainedFile(root,relative);
 const indexLines=git(['ls-files','--stage','--',...required]).split('\n'),index=new Map();
 for(const line of indexLines){const match=/^100644 ([0-9a-f]{40}) 0\t(.+)$/.exec(line);if(!match||index.has(match[2]))fail('index identity');index.set(match[2],match[1]);}
 const measured=git(['hash-object','--stdin-paths'],required.join('\n')+'\n').split('\n');if(measured.length!==required.length)fail('working inventory');
 const working=new Map(required.map((relative,position)=>[relative,measured[position]]));
 function identity(relative,expected){if(index.get(relative)!==expected)fail('index identity: '+relative);if(working.get(relative)!==expected)fail('working identity: '+relative);}
 for(const [relative,binding]of Object.entries(BOUNDED_DOCUMENT_HISTORICAL_BINDINGS))identity(relative,binding.blobSha);
 for(const row of rows)identity(row.path,row.afterBlobSha);
 for(const relative of [ADMISSION,POLICY]){
  if(!index.has(relative))fail('independent control index');identity(relative,index.get(relative));
 }
 const old=data(root,'tools/main-consolidation/processing-budget-source-admission.json'),expected=new Set([...old.sourceRows,...old.controlRows,...rows].map(row=>row.path).filter(relative=>relative.startsWith('packages/processing-budget-runtime/'))),actual=[];
 function inventory(directory,relative){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const name=relative+entry.name,file=path.join(directory,entry.name);if(entry.isSymbolicLink())fail('package alias');
  if(relative==='packages/processing-budget-runtime/'&&['node_modules','out'].includes(entry.name)){if(!entry.isDirectory())fail('generated directory');continue;}
  if(entry.isDirectory())inventory(file,name+'/');else if(entry.isFile())actual.push(name);else fail('special package entry');
 }}
 inventory(path.join(root,'packages/processing-budget-runtime'),'packages/processing-budget-runtime/');
 if(JSON.stringify(actual.sort())!==JSON.stringify([...expected].sort()))fail('unknown package inventory');
 for(const item of c.additionalCurrentMainPrerequisites)if(!rows.some(row=>row.path===item.path&&row.sourceItemIds.length===0)&&![ADMISSION,POLICY].includes(item.path))fail('unbound prerequisite');
}
