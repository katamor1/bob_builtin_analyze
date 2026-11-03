function readPinnedGitBatch(root,specs){
 const raw=execFileSync('git',['cat-file','--batch'],{cwd:root,input:specs.join('\n')+'\n',maxBuffer:64*1048576,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}),rows=new Map();let offset=0;
 for(const spec of specs){const end=raw.indexOf(10,offset);if(end<offset)throw new TypeError('deadline Git batch header');const match=/^([a-f0-9]{40}) (commit|tree|blob) ([0-9]+)$/.exec(raw.subarray(offset,end).toString('ascii'));if(!match)throw new TypeError('deadline immutable Git object missing');const size=Number(match[3]);if(!Number.isSafeInteger(size)||size<0||end+1+size>=raw.length||raw[end+1+size]!==10)throw new TypeError('deadline Git batch size');rows.set(spec,{oid:match[1],type:match[2],bytes:raw.subarray(end+1,end+1+size)});offset=end+2+size;}
 if(offset!==raw.length)throw new TypeError('deadline Git batch trailing data');return rows;
}
import {createHash} from 'node:crypto';
import {validateInputProcessCoverage,validateInputProcessSourceAdmission} from './inputProcessAdmissionPolicy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {validateBoundedDocumentCoverage,validateBoundedDocumentSourceAdmission} from './boundedDocumentAdmissionPolicy.mjs';
import {validateAggregateDocumentCoverage,validateAggregateDocumentSourceAdmission} from './aggregateDocumentAdmissionPolicy.mjs';
import {gateRInputData,gateRCanonicalJson,gateRDigest,gateRPathRows,readGateRContainedFile} from './gateRData.mjs';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const ADMISSION="tools/main-consolidation/deadline-source-admission.json",COVERAGE="docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json",POLICY="tools/main-consolidation/deadlineAdmissionPolicy.mjs";
const BASE="6ce384313c1072e34ced342260304c9c7dd07e9e",TREE="8b2738d648aeff346be05167cd30d952e974686a",OWNER="7ea786afd5715d841526000a402c831d6c2a203c";
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;}
export const DEADLINE_SOURCE_ADMISSION_SHA256="f7bc1eddd81d5e6061c0f1dcab76a4cf9f36db4891bd831cbe0d4dd7dfe8f5b5";
export const DEADLINE_SOURCE_COVERAGE_SHA256="9e045f8f18855776dc67e6e1e2b702306febc9aa6748bd0638b5e63f817b063c";
export const DEADLINE_HISTORICAL_BINDINGS=freeze({
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
  },
  "tools/main-consolidation/aggregate-document-source-admission.json": {
    "blobSha": "3ccebd11388600fa913e831c156107cd9f7ef47c",
    "rawSha256": [
      "0b1f28b85b4544e391e79654d2d48e1508557d6b4d1bce7d3b5ce49f8964b626"
    ]
  },
  "docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json": {
    "blobSha": "fd54aa05aee8c94aa32a41ce14bad11acedf8e1b",
    "rawSha256": [
      "cd3a294a3b15523c68167affec00700c198a6eff4d27230d19ff2b3e0197ba3f"
    ]
  },
  "docs/release-evidence/proc-t15-aggregate-completion-2026-10-26.json": {
    "blobSha": "48f680257a8fa6966e951cd9f0296326ca9c661b",
    "rawSha256": [
      "59606e5e39ee9143e9a0fb63e1f4040bea68ab20fd8dd2376e73ebbcf21216aa"
    ]
  },
  "tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs": {
    "blobSha": "f0294f5bbf5a59e74f4a08c47e0777efc37a637d",
    "rawSha256": [
      "fef83042235ef44aaea8ee44371f5dce6519b64f1d5048fa24d5ef1d06dd7e7c",
      "ff99eb65b5bf2ce32c1e0af0bd5a8b7bd02a0d5485db9ba9cc02f71c30f5c6f5"
    ]
  },
  "scripts/t15-aggregate-installed-smoke.mjs": {
    "blobSha": "d7b406f099c406f4e41a16d55bdab4a0b1520cf0",
    "rawSha256": [
      "858f8baeadcfde970746aef29d29d923f257ac9648797945a3dc8c69ba9d7966",
      "a036c6898202a99ba2e777149c75b7d7ae71efcd56e0c3d08d8bc93c15607747"
    ]
  },
  "scripts/t15-aggregate-installed-extension-host.test.js": {
    "blobSha": "76f0518495d052efa06c06a8f113d267dcbe0df2",
    "rawSha256": [
      "c98a07fa4bd9375d69bc158fb1edfcb9378aac62526edde6fdd595bd25906005",
      "ff8348e8104ed7f21681cc0d9e5d54475bb2dbc5a701dc3a13674742be2e0c80"
    ]
  },
  "scripts/t15-aggregate-installed-smoke.test.mjs": {
    "blobSha": "6dc9cbf1e58b1f5739956553c5ff2a4354540986",
    "rawSha256": [
      "6c1d444e694ad6e40043ca73d42420ffd98f8a314ac50c7681d282c2cee66174",
      "e1e3a187bda555ab6f9cdbb68d55b5b2bb36c622fd3c3b99a2034574cc5d81a8"
    ]
  },
  "tools/main-consolidation/input-process-source-admission.json": {
    "blobSha": "bab597bea28f472d7ccd0a4949778214e55b59e4",
    "rawSha256": [
      "6509faf09ff9652aa8b9bb32df4e0d252b484a71b0a3baa6d650c30819116720"
    ]
  },
  "tools/main-consolidation/inputProcessAdmissionPolicy.mjs": {
    "blobSha": "51d285fbdd4c40d8448fa142220aab7789a8f8d0",
    "rawSha256": [
      "4bf09c8884851f0e088aa7af58b3252e1bb003c61bcf1b3b227b3fe0d3da4022",
      "716e5bdcba4d1f7578d7da5f31f4af069ffe759a558ae92f5d4af70e36f8a845"
    ]
  },
  "docs/release-evidence/proc-t16-input-process-source-coverage-2026-10-31.json": {
    "blobSha": "ea2fcd7be34a1c3d5e2fb3309a2fdcc5b68d9a2a",
    "rawSha256": [
      "f604bcca0c863bf1e43bf6d2217fb7fcf1446d48380dbe40da8e3eff7294f73f"
    ]
  },
  "docs/release-evidence/proc-t16-input-process-completion-2026-10-31.json": {
    "blobSha": "c1ecc522495e89ac5ef8885d25029cea9a02275a",
    "rawSha256": [
      "0de29738494e0835a09c034e64d32ccdc56a7027208372b03cbae57638fac9d5"
    ]
  }
});
const BASE_FILES_DIGESTS=freeze({
  "gateRInputProcess": "76a5d7b3b2695a3ef60cbcd698b5dd1080d2a9e66a0370b8d404f398b658cec9",
  "processingBudgetT16": "13006150039baa35c13e3e92451de58d2576390227ed15c4b0dcaaaafe2c8438"
});
const SOURCE_IDS=freeze([
  "source-01a9655f527e3c20b24c6835",
  "source-01f7821ee897fedfb488ca62",
  "source-0242818ae8483b31a38c73a6",
  "source-2b646d5d315a539415d3e73c",
  "source-2df85f46e62ea5d5fc8545f9",
  "source-3492db8bbbc56bda287a9055",
  "source-3af20d158a95f6e5eb6bc244",
  "source-3df4b118944857706a292a71",
  "source-401a97fced069da2bee6384b",
  "source-422ee5e3fe35e7ae1ca2f981",
  "source-48166ff553110df8983d5257",
  "source-4b4730055bf291daeb1a9b42",
  "source-4d3c8c1d47eea6437944309c",
  "source-4d84e287ca61db22836ab0d4",
  "source-4e660869aa1ada148aeb2bda",
  "source-5237c6af1c153c9400cd06cf",
  "source-5af29fd63ef8b7045a65ff67",
  "source-6b16cf78cbd9cf1ded5f9240",
  "source-6c4642fcb7b9c15c901d72c2",
  "source-6d627a871a7f238b34893ad7",
  "source-6e83ef7a0f958789ba1fa2ed",
  "source-6eeca2d26a9aa16ab8ef600e",
  "source-70c2dea15f32dc8ddf7a81e4",
  "source-730c5e064055f1b7adffeb69",
  "source-7d745b5944c1a7b68cfb1465",
  "source-84c0ecbeece6f1a6ebd7f215",
  "source-859cf9b394d1bc84511ef37d",
  "source-85b0b67dff73be4be2abfbd4",
  "source-9659ba5cde0d919ac0a0e8c8",
  "source-9909fe163821c8d49a50588a",
  "source-9ce8c736275573d2f95cb081",
  "source-a2b03f10fed5ed28286aed02",
  "source-ad09a42bee1d878c41fe9e79",
  "source-b335aea38d77e70867dbff68",
  "source-b81959ae019101dc335c9c98",
  "source-b8b9df65d1f3050c70c13f7c",
  "source-bb91584f71612f3e175e76f2",
  "source-bda3c142c71b53f9bbdd6e2d",
  "source-bf5a1d63ef4b8f946cc8f95b",
  "source-c22f6c70eb524373f02f229b",
  "source-c3ad921f37b6a82d27d7af4e",
  "source-c7836f19ab61ab5583ec71aa",
  "source-c84f819d75a53bfcc42d3531",
  "source-ca7404fcccfb8012f2637dd7",
  "source-cadf6df2cd6d0b41cd4b897f",
  "source-cdf15f7d0d73f91e0a022cfd",
  "source-d0917810045b5739bc8f6370",
  "source-d47d8a1ad7e651d178c4ecb1",
  "source-d51d0f0701cb68ddc04dc206",
  "source-d6e35ead5bdf9406a3ec4f01",
  "source-dd222a5fc261fb64b45fba8b",
  "source-e69de915da3b2c2508e9cb90",
  "source-ea3a1c93f1943b1e70e5990c",
  "source-ed1e49e2ede1bb77d9551e9d"
]);
const SOURCE_PATHS=freeze([
  "extensions/bob-bazaar-review/src/bazaar/bazaar.ts",
  "extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts",
  "extensions/bob-bazaar-review/src/mcp/tools.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts",
  "extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts",
  "extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts",
  "extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts",
  "extensions/bob-bazaar-review/test/bazaarClient.test.js",
  "extensions/bob-bazaar-review/test/bazaarOperationLifecycle.test.js",
  "extensions/bob-bazaar-review/test/deadlineSettlement.test.js",
  "extensions/bob-bazaar-review/test/externalProcessOptionContract.test.js",
  "extensions/bob-bazaar-review/test/externalProcessRunner.test.js",
  "extensions/bob-bazaar-review/test/externalProcessWiring.test.js",
  "extensions/bob-bazaar-review/test/mcpToolDeadline.test.js",
  "extensions/bob-bazaar-review/test/posixProcessTreeTermination.test.js",
  "extensions/bob-bazaar-review/test/ruleAuthoringGui.test.js",
  "extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js",
  "extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js",
  "extensions/bob-bazaar-review/test/ruleDocumentAggregateBudget.test.js",
  "extensions/bob-bazaar-review/test/ruleDocumentDeadline.test.js",
  "extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js",
  "extensions/bob-bazaar-review/test/rulePdfExtraction.test.js",
  "extensions/bob-bazaar-review/test/ruleSourceHash.test.js",
  "extensions/bob-bazaar-review/test/task17RuleAuthoringCancellation.test.js",
  "extensions/bob-bazaar-review/test/windowsProcessTreeTermination.test.js",
  "extensions/bob-code-consistency-review/package.json",
  "extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts",
  "extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts",
  "extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts",
  "extensions/bob-code-consistency-review/src/core/pipeline.ts",
  "extensions/bob-code-consistency-review/src/core/processingBudgetPipeline.ts",
  "extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts",
  "extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts",
  "extensions/bob-code-consistency-review/test/deadlineConfigurationContract.test.js",
  "extensions/bob-code-consistency-review/test/deadlinePipeline.test.js",
  "extensions/bob-code-consistency-review/test/deadlineSettlement.test.js",
  "extensions/bob-code-consistency-review/test/diffFixturePathBoundary.test.js",
  "extensions/bob-code-consistency-review/test/diffProcessingBudget.test.js",
  "extensions/bob-code-consistency-review/test/documentXlsxCancellationOrder.test.js",
  "extensions/bob-code-consistency-review/test/externalProcessOptionContract.test.js",
  "extensions/bob-code-consistency-review/test/externalProcessRunner.test.js",
  "extensions/bob-code-consistency-review/test/externalProcessWiring.test.js",
  "extensions/bob-code-consistency-review/test/pipelineDocumentCancellation.test.js",
  "extensions/bob-code-consistency-review/test/pipelineFinalCancellation.test.js",
  "extensions/bob-code-consistency-review/test/posixProcessTreeTermination.test.js",
  "extensions/bob-code-consistency-review/test/processingBudgetPipelineContract.test.js",
  "extensions/bob-code-consistency-review/test/repositorySymbolIndexProducer.test.js",
  "extensions/bob-code-consistency-review/test/windowsProcessTreeTermination.test.js",
  "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
  "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
  "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
  "packages/processing-budget-runtime/src/deadlineCancellation.ts",
  "packages/processing-budget-runtime/src/index.ts",
  "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
  "packages/processing-budget-runtime/src/ooxmlPreflight.ts",
  "packages/processing-budget-runtime/test/boundedArchiveCancellation.test.js",
  "packages/processing-budget-runtime/test/boundedDocumentIo.test.js",
  "packages/processing-budget-runtime/test/cancellationReasonPropagation.test.js",
  "packages/processing-budget-runtime/test/deadlineCancellation.test.js",
  "packages/processing-budget-runtime/test/deadlineLongTimer.test.js",
  "packages/processing-budget-runtime/test/deadlineOperation.test.js",
  "packages/processing-budget-runtime/test/deadlineReasonAuthentication.test.js",
  "packages/processing-budget-runtime/test/deadlineSynchronousExpiry.test.js",
  "packages/processing-budget-runtime/test/ooxmlCancellationWiring.test.js",
  "packages/processing-budget-runtime/test/synchronousBoundedDeadline.test.js",
  "packages/processing-budget-runtime/test/task17IntegrationContract.test.js",
  "packages/processing-budget-runtime/test/workbookBudget.test.js"
]);
const CONTROL_PATHS=freeze([
  ".gitattributes",
  ".github/workflows/processing-budget-runtime.yml",
  "docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json",
  "docs/superpowers/plans/2026-11-02-proc-t17-deadline.md",
  "docs/superpowers/specs/2026-11-02-proc-t17-deadline-design.md",
  "extensions/bob-bazaar-review/src/bazaar/bazaarReviewCommands.ts",
  "extensions/bob-bazaar-review/src/ui/reviewGui.ts",
  "extensions/bob-bazaar-review/test/bazaarReviewCommandWiring.test.js",
  "extensions/bob-bazaar-review/test/dependencyPolicy.test.js",
  "extensions/bob-bazaar-review/test/helpers/ruleAuthoringGuiHarness.js",
  "extensions/bob-bazaar-review/test/reviewGuiLifecycle.test.js",
  "extensions/bob-code-consistency-review/src/core/reviewInputValidator.ts",
  "extensions/bob-code-consistency-review/src/core/reviewPackageBuilder.ts",
  "extensions/bob-code-consistency-review/src/core/reviewPackageWriter.ts",
  "extensions/bob-code-consistency-review/src/core/stableReviewInput.ts",
  "extensions/bob-code-consistency-review/test/dependencyPolicy.test.js",
  "extensions/bob-code-consistency-review/test/helpers/deadlinePipelineHarness.js",
  "extensions/bob-code-consistency-review/test/processingBudgetPipelineProfile.test.js",
  "extensions/bob-code-consistency-review/test/vcsValidation.test.js",
  "packages/processing-budget-runtime/README.md",
  "packages/processing-budget-runtime/scripts/runtime-payload.js",
  "packages/processing-budget-runtime/src/documentBudget.ts",
  "packages/processing-budget-runtime/src/workbookBudget.ts",
  "packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js",
  "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
  "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
  "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
  "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
  "packages/processing-budget-runtime/test/helpers.js",
  "packages/processing-budget-runtime/test/helpers/deadlineClock.js",
  "packages/processing-budget-runtime/test/packageContract.test.js",
  "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
  "scripts/extension-host-smoke-contract.test.js",
  "scripts/processing-runtime-build-workflow.test.js",
  "scripts/t17-deadline-installed-baseline-cases.js",
  "scripts/t17-deadline-installed-extension-host.test.js",
  "scripts/t17-deadline-installed-smoke.mjs",
  "scripts/t17-deadline-installed-smoke.test.mjs",
  "scripts/three-extension-ui-contract-workflow.test.js",
  "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
  "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
  "tools/main-consolidation/test/deadlineAdmissionPolicy.test.mjs",
  "tools/main-consolidation/test/helpers/deadlineAdmissionFixture.mjs",
  "tools/main-consolidation/test/inputProcessAdmissionPolicy.test.mjs"
]);
const DOMAIN_PATHS=freeze({
  "gate_r_shipping": [
    ".gitattributes",
    ".github/workflows/processing-budget-runtime.yml",
    "docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json",
    "docs/superpowers/plans/2026-11-02-proc-t17-deadline.md",
    "docs/superpowers/specs/2026-11-02-proc-t17-deadline-design.md",
    "extensions/bob-bazaar-review/src/bazaar/bazaar.ts",
    "extensions/bob-bazaar-review/src/bazaar/bazaarReviewCommands.ts",
    "extensions/bob-bazaar-review/src/bazaar/externalProcessRunner.ts",
    "extensions/bob-bazaar-review/src/mcp/tools.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/documentExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/docxExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/pdfExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/extraction/xlsxExtractor.ts",
    "extensions/bob-bazaar-review/src/ruleAuthoring/ruleSourceHash.ts",
    "extensions/bob-bazaar-review/src/sharedProcessingBudgetRuntime.ts",
    "extensions/bob-bazaar-review/src/ui/reviewGui.ts",
    "extensions/bob-bazaar-review/src/ui/ruleAuthoringGui.ts",
    "extensions/bob-bazaar-review/test/bazaarClient.test.js",
    "extensions/bob-bazaar-review/test/bazaarOperationLifecycle.test.js",
    "extensions/bob-bazaar-review/test/bazaarReviewCommandWiring.test.js",
    "extensions/bob-bazaar-review/test/deadlineSettlement.test.js",
    "extensions/bob-bazaar-review/test/dependencyPolicy.test.js",
    "extensions/bob-bazaar-review/test/externalProcessOptionContract.test.js",
    "extensions/bob-bazaar-review/test/externalProcessRunner.test.js",
    "extensions/bob-bazaar-review/test/externalProcessWiring.test.js",
    "extensions/bob-bazaar-review/test/helpers/ruleAuthoringGuiHarness.js",
    "extensions/bob-bazaar-review/test/mcpToolDeadline.test.js",
    "extensions/bob-bazaar-review/test/posixProcessTreeTermination.test.js",
    "extensions/bob-bazaar-review/test/reviewGuiLifecycle.test.js",
    "extensions/bob-bazaar-review/test/ruleAuthoringGui.test.js",
    "extensions/bob-bazaar-review/test/ruleBoundedOoxmlExtraction.test.js",
    "extensions/bob-bazaar-review/test/ruleConfiguredFingerprintLimit.test.js",
    "extensions/bob-bazaar-review/test/ruleDocumentAggregateBudget.test.js",
    "extensions/bob-bazaar-review/test/ruleDocumentDeadline.test.js",
    "extensions/bob-bazaar-review/test/ruleDocumentSignalCompatibility.test.js",
    "extensions/bob-bazaar-review/test/rulePdfExtraction.test.js",
    "extensions/bob-bazaar-review/test/ruleSourceHash.test.js",
    "extensions/bob-bazaar-review/test/task17RuleAuthoringCancellation.test.js",
    "extensions/bob-bazaar-review/test/windowsProcessTreeTermination.test.js",
    "extensions/bob-code-consistency-review/package.json",
    "extensions/bob-code-consistency-review/src/analyzers/documentExtractor.ts",
    "extensions/bob-code-consistency-review/src/core/externalProcessRunner.ts",
    "extensions/bob-code-consistency-review/src/core/gitDiffCollector.ts",
    "extensions/bob-code-consistency-review/src/core/pipeline.ts",
    "extensions/bob-code-consistency-review/src/core/processingBudgetPipeline.ts",
    "extensions/bob-code-consistency-review/src/core/reviewInputValidator.ts",
    "extensions/bob-code-consistency-review/src/core/reviewPackageBuilder.ts",
    "extensions/bob-code-consistency-review/src/core/reviewPackageWriter.ts",
    "extensions/bob-code-consistency-review/src/core/stableReviewInput.ts",
    "extensions/bob-code-consistency-review/src/evidenceScope/repositorySymbolIndexProducer.ts",
    "extensions/bob-code-consistency-review/src/sharedProcessingBudgetRuntime.ts",
    "extensions/bob-code-consistency-review/test/deadlineConfigurationContract.test.js",
    "extensions/bob-code-consistency-review/test/deadlinePipeline.test.js",
    "extensions/bob-code-consistency-review/test/deadlineSettlement.test.js",
    "extensions/bob-code-consistency-review/test/dependencyPolicy.test.js",
    "extensions/bob-code-consistency-review/test/diffFixturePathBoundary.test.js",
    "extensions/bob-code-consistency-review/test/diffProcessingBudget.test.js",
    "extensions/bob-code-consistency-review/test/documentXlsxCancellationOrder.test.js",
    "extensions/bob-code-consistency-review/test/externalProcessOptionContract.test.js",
    "extensions/bob-code-consistency-review/test/externalProcessRunner.test.js",
    "extensions/bob-code-consistency-review/test/externalProcessWiring.test.js",
    "extensions/bob-code-consistency-review/test/helpers/deadlinePipelineHarness.js",
    "extensions/bob-code-consistency-review/test/pipelineDocumentCancellation.test.js",
    "extensions/bob-code-consistency-review/test/pipelineFinalCancellation.test.js",
    "extensions/bob-code-consistency-review/test/posixProcessTreeTermination.test.js",
    "extensions/bob-code-consistency-review/test/processingBudgetPipelineContract.test.js",
    "extensions/bob-code-consistency-review/test/processingBudgetPipelineProfile.test.js",
    "extensions/bob-code-consistency-review/test/repositorySymbolIndexProducer.test.js",
    "extensions/bob-code-consistency-review/test/vcsValidation.test.js",
    "extensions/bob-code-consistency-review/test/windowsProcessTreeTermination.test.js",
    "scripts/extension-host-smoke-contract.test.js",
    "scripts/processing-runtime-build-workflow.test.js",
    "scripts/t17-deadline-installed-baseline-cases.js",
    "scripts/t17-deadline-installed-extension-host.test.js",
    "scripts/t17-deadline-installed-smoke.mjs",
    "scripts/t17-deadline-installed-smoke.test.mjs",
    "scripts/three-extension-ui-contract-workflow.test.js",
    "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
    "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
    "tools/main-consolidation/test/deadlineAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/helpers/deadlineAdmissionFixture.mjs",
    "tools/main-consolidation/test/inputProcessAdmissionPolicy.test.mjs"
  ],
  "processing_budget": [
    ".gitattributes",
    ".github/workflows/processing-budget-runtime.yml",
    "docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json",
    "docs/superpowers/plans/2026-11-02-proc-t17-deadline.md",
    "docs/superpowers/specs/2026-11-02-proc-t17-deadline-design.md",
    "packages/processing-budget-runtime/README.md",
    "packages/processing-budget-runtime/scripts/runtime-payload.js",
    "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
    "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
    "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
    "packages/processing-budget-runtime/src/deadlineCancellation.ts",
    "packages/processing-budget-runtime/src/documentBudget.ts",
    "packages/processing-budget-runtime/src/index.ts",
    "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
    "packages/processing-budget-runtime/src/ooxmlPreflight.ts",
    "packages/processing-budget-runtime/src/workbookBudget.ts",
    "packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js",
    "packages/processing-budget-runtime/test/boundedArchiveCancellation.test.js",
    "packages/processing-budget-runtime/test/boundedDocumentIo.test.js",
    "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
    "packages/processing-budget-runtime/test/cancellationReasonPropagation.test.js",
    "packages/processing-budget-runtime/test/deadlineCancellation.test.js",
    "packages/processing-budget-runtime/test/deadlineLongTimer.test.js",
    "packages/processing-budget-runtime/test/deadlineOperation.test.js",
    "packages/processing-budget-runtime/test/deadlineReasonAuthentication.test.js",
    "packages/processing-budget-runtime/test/deadlineSynchronousExpiry.test.js",
    "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
    "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
    "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
    "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
    "packages/processing-budget-runtime/test/helpers.js",
    "packages/processing-budget-runtime/test/helpers/deadlineClock.js",
    "packages/processing-budget-runtime/test/ooxmlCancellationWiring.test.js",
    "packages/processing-budget-runtime/test/packageContract.test.js",
    "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
    "packages/processing-budget-runtime/test/synchronousBoundedDeadline.test.js",
    "packages/processing-budget-runtime/test/task17IntegrationContract.test.js",
    "packages/processing-budget-runtime/test/workbookBudget.test.js",
    "scripts/extension-host-smoke-contract.test.js",
    "scripts/processing-runtime-build-workflow.test.js",
    "scripts/t17-deadline-installed-baseline-cases.js",
    "scripts/t17-deadline-installed-extension-host.test.js",
    "scripts/t17-deadline-installed-smoke.mjs",
    "scripts/t17-deadline-installed-smoke.test.mjs",
    "scripts/three-extension-ui-contract-workflow.test.js",
    "tools/main-consolidation/gateRMainAdmissionPolicy.mjs",
    "tools/main-consolidation/processingBudgetAdmissionPolicy.mjs",
    "tools/main-consolidation/test/deadlineAdmissionPolicy.test.mjs",
    "tools/main-consolidation/test/helpers/deadlineAdmissionFixture.mjs",
    "tools/main-consolidation/test/inputProcessAdmissionPolicy.test.mjs"
  ]
});
const PACKAGE_BASE_FILES=freeze([
  {
    "path": "packages/processing-budget-runtime/README.md",
    "mode": "100644",
    "blobSha": "27588791371872d0256595e4d54f8859afbb2d1c"
  },
  {
    "path": "packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json",
    "mode": "100644",
    "blobSha": "c214ebbe61e7574544549fb2905fa93032807462"
  },
  {
    "path": "packages/processing-budget-runtime/package-lock.json",
    "mode": "100644",
    "blobSha": "6ec87b8000300cb4b261de8d09826cb8d1ffa892"
  },
  {
    "path": "packages/processing-budget-runtime/package.json",
    "mode": "100644",
    "blobSha": "893b52e182df9d25cf6fd29665d36529150aa596"
  },
  {
    "path": "packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json",
    "mode": "100644",
    "blobSha": "5b4fd485f969411791d2bf1aa14216bc9c184699"
  },
  {
    "path": "packages/processing-budget-runtime/scripts/build-runtime.js",
    "mode": "100644",
    "blobSha": "eb05f622676b9b741fe4ca9c83c945b015ba8ecc"
  },
  {
    "path": "packages/processing-budget-runtime/scripts/check-document-boundary.js",
    "mode": "100644",
    "blobSha": "eae45ca4905d27b958387616aa52b4c5747c7cf5"
  },
  {
    "path": "packages/processing-budget-runtime/scripts/copy-extension-runtime.js",
    "mode": "100644",
    "blobSha": "9aae44ca6d7573adc6840246835842a0f297ed41"
  },
  {
    "path": "packages/processing-budget-runtime/scripts/generate-processing-budget-contracts.js",
    "mode": "100644",
    "blobSha": "ec6e707f9e8a34f77ad2b8d99f8cd68189018b66"
  },
  {
    "path": "packages/processing-budget-runtime/scripts/runtime-payload.js",
    "mode": "100644",
    "blobSha": "1da5b2ad4547a1a9c0f6ec2f594a85dad3da1278"
  },
  {
    "path": "packages/processing-budget-runtime/src/boundedDocumentError.ts",
    "mode": "100644",
    "blobSha": "3bf3b67099e007d1094692c446f332d207cf1a1e"
  },
  {
    "path": "packages/processing-budget-runtime/src/boundedDocumentFile.ts",
    "mode": "100644",
    "blobSha": "ca7a785516a2c9a4edec34ffdb046ab7307f74af"
  },
  {
    "path": "packages/processing-budget-runtime/src/boundedDocumentIo.ts",
    "mode": "100644",
    "blobSha": "91d25df0573e7dd8b926a6321acfeb41db2cf081"
  },
  {
    "path": "packages/processing-budget-runtime/src/boundedDocumentRequest.ts",
    "mode": "100644",
    "blobSha": "bc97be88ceb382e38778a084457f7e6e5aac9317"
  },
  {
    "path": "packages/processing-budget-runtime/src/documentBudget.ts",
    "mode": "100644",
    "blobSha": "683fee6e6cd773a6c55d9b3c6f07da840186f3e7"
  },
  {
    "path": "packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts",
    "mode": "100644",
    "blobSha": "51cdd750e659e42842b1bf1c4967c0073913fb23"
  },
  {
    "path": "packages/processing-budget-runtime/src/index.ts",
    "mode": "100644",
    "blobSha": "7db63c6a9319d58b99b3e7c6f34f1757817513ea"
  },
  {
    "path": "packages/processing-budget-runtime/src/ooxmlParserInput.ts",
    "mode": "100644",
    "blobSha": "65395856e76877616d4c5e772cf72e9b0ef9062a"
  },
  {
    "path": "packages/processing-budget-runtime/src/ooxmlPreflight.ts",
    "mode": "100644",
    "blobSha": "3e7b96982cdc72a55f82b63dc60f18a0f10a805e"
  },
  {
    "path": "packages/processing-budget-runtime/src/processingBudgetError.ts",
    "mode": "100644",
    "blobSha": "3a92cd23f89f930779e4cefdf3ca3fe622257df9"
  },
  {
    "path": "packages/processing-budget-runtime/src/processingBudgetLedger.ts",
    "mode": "100644",
    "blobSha": "2433e7ded92150083f55973ceb40b0a07d26ca15"
  },
  {
    "path": "packages/processing-budget-runtime/src/processingBudgetProfile.ts",
    "mode": "100644",
    "blobSha": "0a21275333b65268193f20dacc432328cfcfb385"
  },
  {
    "path": "packages/processing-budget-runtime/src/validatedOoxml.ts",
    "mode": "100644",
    "blobSha": "a247c7a1448e2121e992d5d374a66e33ce0a3248"
  },
  {
    "path": "packages/processing-budget-runtime/src/workbookBudget.ts",
    "mode": "100644",
    "blobSha": "02c97632351c0552e169292d2ea29b10d1000d28"
  },
  {
    "path": "packages/processing-budget-runtime/test/aggregateIntegrationContract.test.js",
    "mode": "100644",
    "blobSha": "3726061b33f56ad2d385dbee55430ce655b8588d"
  },
  {
    "path": "packages/processing-budget-runtime/test/baseline/m2-ooxmlArchive.ts",
    "mode": "100644",
    "blobSha": "1c581f7ccfb3932115eb0f80f2770ab331c6c757"
  },
  {
    "path": "packages/processing-budget-runtime/test/baseline/m2-ooxmlPreflight.ts",
    "mode": "100644",
    "blobSha": "b6a7655698219250050023ac3c713da47074bbd9"
  },
  {
    "path": "packages/processing-budget-runtime/test/baseline/m2-ruleAuthoringLimits.ts",
    "mode": "100644",
    "blobSha": "dafc16b11602c6e914da53ca010deaa797ab0214"
  },
  {
    "path": "packages/processing-budget-runtime/test/baseline/m2-ruleOoxmlPreflight.test.js",
    "mode": "100644",
    "blobSha": "d649f7188f9d105884ac91e3e6151dc0bf573980"
  },
  {
    "path": "packages/processing-budget-runtime/test/baseline/m2-ruleSourceHash.ts",
    "mode": "100644",
    "blobSha": "8ebb7a7857955434d0a17cb37c8f5a8ce0dc2d65"
  },
  {
    "path": "packages/processing-budget-runtime/test/baseline/m2-storedZipFixture.js",
    "mode": "100644",
    "blobSha": "f40c9aa52d48aee3bcda236616b22d9a9a234b14"
  },
  {
    "path": "packages/processing-budget-runtime/test/boundedArchiveInputLimit.test.js",
    "mode": "100644",
    "blobSha": "b0aed8bdf122514a291f1fb44ada01448b4b0451"
  },
  {
    "path": "packages/processing-budget-runtime/test/boundedDocumentIo.test.js",
    "mode": "100644",
    "blobSha": "5f4bb9f247c36135414aad75cae8d025ecd62592"
  },
  {
    "path": "packages/processing-budget-runtime/test/boundedDocumentPackaging.test.js",
    "mode": "100644",
    "blobSha": "79baa0b9b2e15b5b0c61d26209f16cb3e352e3bd"
  },
  {
    "path": "packages/processing-budget-runtime/test/boundedDocumentRuntime.test.js",
    "mode": "100644",
    "blobSha": "af51ec7f65a0f1e32a2a1e8b3a893f17148f1cbc"
  },
  {
    "path": "packages/processing-budget-runtime/test/boundedZipRetention.test.js",
    "mode": "100644",
    "blobSha": "370659d459deef4706a0e600773271066cb912af"
  },
  {
    "path": "packages/processing-budget-runtime/test/documentAdmission.test.js",
    "mode": "100644",
    "blobSha": "7b68f9951f94312efeebd467b5ae2730c33dced5"
  },
  {
    "path": "packages/processing-budget-runtime/test/documentAggregateBudget.test.js",
    "mode": "100644",
    "blobSha": "7f08e01233faf03939531bc3bc28c257e44af785"
  },
  {
    "path": "packages/processing-budget-runtime/test/extensionIntegrationContract.test.js",
    "mode": "100644",
    "blobSha": "403468c5d6fc530c25d67f7a83879e22551e3d27"
  },
  {
    "path": "packages/processing-budget-runtime/test/fixtures/bob-bazaar-review-consumer.ts",
    "mode": "100644",
    "blobSha": "384c97698fe58d1edd41210b55f7f9cf74ad695f"
  },
  {
    "path": "packages/processing-budget-runtime/test/fixtures/bob-code-consistency-review-consumer.ts",
    "mode": "100644",
    "blobSha": "7e34560ab01f7141fe99b5f89ebffa8751e18fe5"
  },
  {
    "path": "packages/processing-budget-runtime/test/fixtures/tsconfig.json",
    "mode": "100644",
    "blobSha": "9c56c59080aa6de1df3495dc34d5590b77d1dcdd"
  },
  {
    "path": "packages/processing-budget-runtime/test/fixtures/workflow-register-consumer.ts",
    "mode": "100644",
    "blobSha": "7e34560ab01f7141fe99b5f89ebffa8751e18fe5"
  },
  {
    "path": "packages/processing-budget-runtime/test/helpers.js",
    "mode": "100644",
    "blobSha": "ac640de39e34c3ba67e53bf8908c42d0475e4546"
  },
  {
    "path": "packages/processing-budget-runtime/test/helpers/boundedDocumentFixtures.js",
    "mode": "100644",
    "blobSha": "db835053a6e0e15acce0569b0dc1e0ce7beb67aa"
  },
  {
    "path": "packages/processing-budget-runtime/test/helpers/m2OoxmlBaseline.js",
    "mode": "100644",
    "blobSha": "af580800d4af5cf058bf21e9f6f99fdd3c550208"
  },
  {
    "path": "packages/processing-budget-runtime/test/ooxmlMigrationParity.test.js",
    "mode": "100644",
    "blobSha": "402b3a4f5cc20799402c5aba25954141d59c5d78"
  },
  {
    "path": "packages/processing-budget-runtime/test/ooxmlParserInput.test.js",
    "mode": "100644",
    "blobSha": "3157f7b21ebd016a2c4c4b2b1fcd5a61464e9550"
  },
  {
    "path": "packages/processing-budget-runtime/test/packageContract.test.js",
    "mode": "100644",
    "blobSha": "88b2073d848b5ec3ab0ffad7d740088506d07440"
  },
  {
    "path": "packages/processing-budget-runtime/test/processingBudgetContracts.test.js",
    "mode": "100644",
    "blobSha": "05628f97cb206005da8fbd326a208c9752dc1d4d"
  },
  {
    "path": "packages/processing-budget-runtime/test/processingBudgetDefinition.test.js",
    "mode": "100644",
    "blobSha": "7599f45b04cdbb1090daaa8878cd3159da40170b"
  },
  {
    "path": "packages/processing-budget-runtime/test/processingBudgetLedger.test.js",
    "mode": "100644",
    "blobSha": "2f263bf8c52826027b2c54581d13a9aed618a871"
  },
  {
    "path": "packages/processing-budget-runtime/test/processingOperation.test.js",
    "mode": "100644",
    "blobSha": "e1fe7a360f5770bb90f5e002272978d9ccb6ea35"
  },
  {
    "path": "packages/processing-budget-runtime/test/workbookBudget.test.js",
    "mode": "100644",
    "blobSha": "e4d160f0e399cedae685f6d39a517dd81b599362"
  },
  {
    "path": "packages/processing-budget-runtime/test/xlsxWorkbookBudget.test.js",
    "mode": "100644",
    "blobSha": "a96f490857ad7d19653a64186a139451e2bc204e"
  },
  {
    "path": "packages/processing-budget-runtime/tsconfig.json",
    "mode": "100644",
    "blobSha": "03459330c00af5c445a858d932413f5b6bc8b36f"
  }
]);
const fail=reason=>{throw new TypeError('deadline admission: '+reason);};
const digest=value=>gateRDigest(gateRCanonicalJson(value));
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(key=>!Object.hasOwn(value,key)))fail('literal exact fields');}
function bindings(rows,expectedPaths){
 if(!Array.isArray(rows)||JSON.stringify(rows.map(row=>row.path))!==JSON.stringify(expectedPaths))fail('literal paths');gateRPathRows(rows,'deadline literal paths');
 for(const row of rows){exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);if(row.mode!=='100644'||(row.beforeBlobSha!==null&&!/^[0-9a-f]{40}$/.test(row.beforeBlobSha))||!/^[0-9a-f]{40}$/.test(row.afterBlobSha)||!Array.isArray(row.sourceItemIds)||row.sourceItemIds.some((id,index)=>!SOURCE_IDS.includes(id)||(index>0&&row.sourceItemIds[index-1]>=id)))fail('literal row identity');}
}
export function validateDeadlineCoverage(input){
 const c=gateRInputData(input,'deadline coverage');exact(c,['schemaVersion','baseMainSha','baseTreeSha','sourceUniverseSha256','selectionLedgerSha256','items','additionalCurrentMainPrerequisites','preservedBaselines','adaptationDecisions','remainderClosure']);
 if(c.schemaVersion!=='bob-builtin-analyze/proc-t17-deadline-source-coverage/v1'||c.baseMainSha!==BASE||c.baseTreeSha!==TREE||digest(c)!==DEADLINE_SOURCE_COVERAGE_SHA256)fail('literal coverage identity');
 if(!Array.isArray(c.items)||JSON.stringify(c.items.map(row=>row.sourceItemId))!==JSON.stringify(SOURCE_IDS)||new Set(c.items.map(row=>row.origin.path)).size!==54||new Set(c.items.map(row=>row.origin.blobSha)).size!==53||c.items.some(row=>row.origin.commitSha!==OWNER)||c.remainderClosure.total!==675||c.remainderClosure.items.length!==675||c.remainderClosure.unassigned!==0)fail('literal complete coverage');
 for(const item of c.items){if(!Array.isArray(item.targets)||!item.targets.length||!Array.isArray(item.testCases)||!item.testCases.length||!Array.isArray(item.testPaths)||!item.testPaths.length||typeof item.adaptation!=='string'||!item.adaptation||!Array.isArray(item.originSymbols)||!item.originSymbols.length||!Array.isArray(item.symbolReceipts)||JSON.stringify(item.symbolReceipts.map(row=>row.originSymbol).sort())!==JSON.stringify([...new Set(item.originSymbols)].sort()))fail('symbol/test receipt closure');for(const receipt of item.symbolReceipts)if(!receipt.targets?.length||!receipt.disposition||!receipt.reason)fail('empty symbol receipt');}
 return true;
}
export function validateDeadlineSourceAdmission(input){
 const a=gateRInputData(input,'deadline source admission');exact(a,['schemaVersion','baseMainSha','baseTreeSha','baseFilesDigests','sourceRows','controlRows','sourceCoverageDigest']);exact(a.baseFilesDigests,['gateRInputProcess','processingBudgetT16']);
 if(a.schemaVersion!=='bob-builtin-analyze/deadline-source-admission/v1'||a.baseMainSha!==BASE||a.baseTreeSha!==TREE||a.sourceCoverageDigest!==DEADLINE_SOURCE_COVERAGE_SHA256||JSON.stringify(a.baseFilesDigests)!==JSON.stringify(BASE_FILES_DIGESTS))fail('literal baseline identity');bindings(a.sourceRows,SOURCE_PATHS);bindings(a.controlRows,CONTROL_PATHS);if(digest(a)!==DEADLINE_SOURCE_ADMISSION_SHA256)fail('literal admission seal');
 const rows=[...a.sourceRows,...a.controlRows].map(row=>row.path).sort(),union=[...new Set([...DOMAIN_PATHS.gate_r_shipping,...DOMAIN_PATHS.processing_budget])].sort();if(JSON.stringify(rows)!==JSON.stringify(union))fail('domain union inventory');
 return true;
}
export function applyDeadlineSourceAdmission(input,options){
 validateDeadlineSourceAdmission(input);const a=gateRInputData(input,'deadline source admission'),settings=gateRInputData(options,'deadline projection');exact(settings,['domain','baseFiles']);const key=settings.domain==='gate_r_shipping'?'gateRInputProcess':settings.domain==='processing_budget'?'processingBudgetT16':undefined;
 if(!key)fail('unknown domain');if(!Array.isArray(settings.baseFiles)||digest(settings.baseFiles)!==BASE_FILES_DIGESTS[key])fail('domain baseline identity');
 const files=new Map(settings.baseFiles.map(row=>[row.path,{...row}])),scope=new Set(DOMAIN_PATHS[settings.domain]);
 for(const row of [...a.sourceRows,...a.controlRows])if(scope.has(row.path)){const before=files.get(row.path);if(before&&(before.mode!==row.mode||before.blobSha!==row.beforeBlobSha))fail('literal T16 before blob mismatch');files.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});}
 return [...files.values()].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function validateDeadlineRepository(repositoryRoot=ROOT){
 const root=path.resolve(repositoryRoot);if(fs.lstatSync(root).isSymbolicLink()||!fs.lstatSync(root).isDirectory())fail('repository root alias');
 const git=(args,input)=>execFileSync('git',args,{cwd:root,input,encoding:'utf8',maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe'],env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 for(const [relative,binding]of Object.entries(DEADLINE_HISTORICAL_BINDINGS))if(!binding.rawSha256.includes(gateRDigest(readGateRContainedFile(root,relative))))fail('historical raw bytes: '+relative);
 const t13=readGateRContainedFile(root,'tools/main-consolidation/processing-budget-source-admission.json'),t14=readGateRContainedFile(root,'tools/main-consolidation/bounded-document-source-admission.json');
 validateBoundedDocumentSourceAdmission(t14);validateBoundedDocumentCoverage(readGateRContainedFile(root,'docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json'));
 const t15=readGateRContainedFile(root,'tools/main-consolidation/aggregate-document-source-admission.json');validateAggregateDocumentSourceAdmission(t15);validateAggregateDocumentCoverage(readGateRContainedFile(root,'docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json'));
 const raw=readGateRContainedFile(root,ADMISSION),rawCoverage=readGateRContainedFile(root,COVERAGE);validateDeadlineSourceAdmission(raw);validateDeadlineCoverage(rawCoverage);const a=gateRInputData(raw,'deadline admission'),c=gateRInputData(rawCoverage,'deadline coverage'),universe=JSON.parse(readGateRContainedFile(root,'tools/main-consolidation/feature-selection-source-universe.json'));
 if(JSON.stringify(c.remainderClosure.items.map(row=>[row.sourceItemId,row.primaryOwner]))!==JSON.stringify(universe.items.map(row=>[row.sourceItemId,row.primaryOwner])))fail('complete675 partition');
 for(const item of c.items){const source=universe.items.find(row=>row.sourceItemId===item.sourceItemId);if(source?.primaryOwner!=='PROC-T17-DEADLINE'||!source.origins.some(origin=>origin.commitSha===item.origin.commitSha&&origin.blobSha===item.origin.blobSha&&origin.path===item.origin.path))fail('origin binding');}
 const t16=readGateRContainedFile(root,'tools/main-consolidation/input-process-source-admission.json');validateInputProcessSourceAdmission(t16);validateInputProcessCoverage(readGateRContainedFile(root,'docs/release-evidence/proc-t16-input-process-source-coverage-2026-10-31.json'));
 const rows=[...a.sourceRows,...a.controlRows],packageFiles=new Map(PACKAGE_BASE_FILES.map(row=>[row.path,{...row}]));
 const sourceSpecs=c.items.map(item=>OWNER+':'+item.origin.path),beforeSpecs=rows.filter(row=>row.beforeBlobSha!==null).map(row=>BASE+':'+row.path),afterSpecs=a.sourceRows.map(row=>row.afterBlobSha),specs=[...new Set([BASE,TREE,OWNER,'a80e1e77d9020481de3cd26be204a5ec8e556f0c',...sourceSpecs,...beforeSpecs,...afterSpecs])],objects=readPinnedGitBatch(root,specs);
 const objectHash=(type,bytes)=>createHash('sha1').update(Buffer.from(type+' '+bytes.length+'\0')).update(bytes).digest('hex');
 for(const object of objects.values())if(objectHash(object.type,object.bytes)!==object.oid)fail('immutable Git object content hash');
 for(const [subject,tree]of [[BASE,TREE],[OWNER,'a80e1e77d9020481de3cd26be204a5ec8e556f0c']])if(objects.get(subject).type!=='commit'||objects.get(subject).bytes.toString('utf8').split('\n')[0]!=='tree '+tree||objects.get(tree).type!=='tree')fail('immutable authority subject');
 const text=new Map(a.sourceRows.map(row=>{const object=objects.get(row.afterBlobSha);if(object.type!=='blob')fail('source object type');return[row.path,object.bytes.toString('utf8')];}));
 for(const item of c.items){const original=objects.get(OWNER+':'+item.origin.path);if(original.type!=='blob'||original.oid!==item.origin.blobSha)fail('immutable owner blob');const source=universe.items.find(row=>row.sourceItemId===item.sourceItemId);if(source.kind!==item.kind||source.family!==item.family||JSON.stringify([...new Set(source.symbols)].sort())!==JSON.stringify([...new Set(item.originSymbols)].sort()))fail('origin symbol identity');for(const receipt of item.symbolReceipts)for(const target of receipt.targets)if(!text.get(target.path)?.includes(target.symbol))fail('actual symbol receipt');for(const check of item.testCases)if(!text.get(check.path)?.includes(check.name))fail('actual test receipt');}
 for(const row of rows)if(row.beforeBlobSha!==null){const original=objects.get(BASE+':'+row.path);if(original.type!=='blob'||original.oid!==row.beforeBlobSha)fail('immutable M0 before blob');}
 for(const item of c.items)for(const target of item.targets){const row=rows.find(row=>row.path===target.path);if(!row||row.mode!==target.mode||row.afterBlobSha!==target.blobSha)fail('coverage target binding');}
 for(const row of rows)if(row.path.startsWith('packages/processing-budget-runtime/'))packageFiles.set(row.path,{path:row.path,mode:row.mode,blobSha:row.afterBlobSha});
 const required=[...new Set([...Object.keys(DEADLINE_HISTORICAL_BINDINGS),...rows.map(row=>row.path),...packageFiles.keys(),ADMISSION,POLICY])].sort();for(const relative of required)readGateRContainedFile(root,relative);
 const index=new Map();for(const line of git(['ls-files','--stage','--',...required]).split('\n')){const match=/^100644 ([0-9a-f]{40}) 0\t(.+)$/.exec(line);if(!match||index.has(match[2]))fail('index identity');index.set(match[2],match[1]);}
 const hashes=git(['hash-object','--stdin-paths'],required.join('\n')+'\n').split('\n');if(hashes.length!==required.length)fail('working inventory');const working=new Map(required.map((relative,index)=>[relative,hashes[index]]));
 function identity(relative,expected){if(index.get(relative)!==expected)fail('index identity: '+relative);if(working.get(relative)!==expected)fail('working identity: '+relative);}
 for(const [relative,binding]of Object.entries(DEADLINE_HISTORICAL_BINDINGS))identity(relative,binding.blobSha);for(const row of [...packageFiles.values(),...rows])identity(row.path,row.blobSha??row.afterBlobSha);for(const relative of [ADMISSION,POLICY]){if(!index.has(relative))fail('independent control index');identity(relative,index.get(relative));}
 const packagePrefix='packages/processing-budget-runtime/',actual=[];
 function inventory(directory,relative){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){const name=relative+entry.name,file=path.join(directory,entry.name);if(entry.isSymbolicLink())fail('package alias');if(relative===packagePrefix&&['node_modules','out'].includes(entry.name)){if(!entry.isDirectory())fail('generated directory');continue;}if(entry.isDirectory())inventory(file,name+'/');else if(entry.isFile())actual.push(name);else fail('special package entry');}}
 inventory(path.join(root,packagePrefix),packagePrefix);if(JSON.stringify(actual.sort())!==JSON.stringify([...packageFiles.keys()].sort()))fail('unknown package inventory');
 for(const item of c.additionalCurrentMainPrerequisites)if(!rows.some(row=>row.path===item.path&&row.sourceItemIds.length===0)&&![ADMISSION,POLICY].includes(item.path))fail('unbound prerequisite');
 const attributes=readGateRContainedFile(root,'.gitattributes').toString('utf8').split(/\r?\n/);for(const relative of [ADMISSION,COVERAGE,'docs/release-evidence/proc-t17-deadline-completion-2026-11-02.json'])if(!attributes.includes(relative+' text eol=lf'))fail('literal LF rule');
 // T13 raw admission is bound above, including its historical noncanonical form.
 if(!JSON.parse(t13).sourceRows)fail('historical T13 admission');
}
