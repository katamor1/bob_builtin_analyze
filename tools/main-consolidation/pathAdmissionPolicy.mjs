import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {gateRCanonicalJson,gateRDigest,gateRInputData,gateRPathRows,readGateRContainedFile} from './gateRData.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='cf96788dbdd6836b449b7a31ecd3bae4ee4302a4';
const tree='4955685da8d99efbb7424efcf278be3262d34dac';
const owner='7ea786afd5715d841526000a402c831d6c2a203c';
const universePath='tools/main-consolidation/feature-selection-source-universe.json';
const ledgerPath='docs/release-evidence/feature-selection-ledger-2026-08-23.json';
const coveragePath='docs/release-evidence/proc-t17-path-source-coverage-2026-11-04.json';
const admissionPath='tools/main-consolidation/path-source-admission.json';
const policyPath='tools/main-consolidation/pathAdmissionPolicy.mjs';
const independentControls=[admissionPath,policyPath].sort();
const metadataPaths=new Set([
 'docs/release-evidence/proc-t17-path-completion-2026-11-04.json',
 'docs/release-evidence/feature-integration-status.json',
 'tools/main-consolidation/create-feature-integration-status.mjs',
 'tools/main-consolidation/featureIntegrationStatusPolicy.mjs',
 'tools/main-consolidation/test/featureIntegrationStatusPolicy.test.mjs'
]);
const domains=['gate_r_shipping','processing_budget'];
const oid=/^[a-f0-9]{40}$/;
const sha256=/^[a-f0-9]{64}$/;
const digest=value=>gateRDigest(gateRCanonicalJson(value));
const equal=(left,right)=>gateRCanonicalJson(left).equals(gateRCanonicalJson(right));
const compare=(a,b)=>a<b?-1:a>b?1:0;

/* Seals generated from measured source, control and immutable Git subjects. */
export const PATH_SOURCE_COVERAGE_SHA256="f6c5502d59deec05d0bc44709bfad85942639291a3db310d8384b516c5305970";
export const PATH_SOURCE_ADMISSION_SHA256="2d126a92a714560867a6126c9ba1bbdb3b6e9277be9d671991def076994e3c3d";
const PATH_COVERAGE_RAW_SHA256="f6c5502d59deec05d0bc44709bfad85942639291a3db310d8384b516c5305970";
const PATH_ADMISSION_RAW_SHA256="2d126a92a714560867a6126c9ba1bbdb3b6e9277be9d671991def076994e3c3d";
const PATH_OWNER_TREE="a80e1e77d9020481de3cd26be204a5ec8e556f0c";
export const PATH_HISTORICAL_BINDINGS=Object.freeze(Object.fromEntries(Object.entries({
 "docs/release-evidence/feature-selection-ledger-2026-08-23.json": {
  "kind": "data",
  "blobSha": "76488c14d9dc631dcd094ee2d1bc03bda5edfa61",
  "bytes": 233499,
  "rawSha256": "e7603655a9f356d36938fc6d722061aa9a616fcfd8258bde05ad6c30ac9ae894"
 },
 "docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json": {
  "kind": "completion",
  "blobSha": "d3deec5eaae372d28dd6e194d245a31036a7968b",
  "bytes": 100480,
  "rawSha256": "043031f1dca349602e86de34ae039561c9c0b09255ffca5c4e9fb10e66b21c8b"
 },
 "docs/release-evidence/proc-t13-ledger-source-coverage-2026-10-23.json": {
  "kind": "data",
  "blobSha": "b922e6d08e6ec862bae02f63ac56dbfbe2f7c965",
  "bytes": 358933,
  "rawSha256": "a85e14013887aa28bf07c3c9c86c92761d9376ccd89a4a904a45d147b9b6a0f8",
  "checkoutSha256": "59f005f702323855b17d9581d87c2fd0086ed83d3a594678d7858a392b410823"
 },
 "docs/release-evidence/proc-t14-bounded-doc-completion-2026-10-24.json": {
  "kind": "completion",
  "blobSha": "7442d1eef837105bcba4b0bcf769be02a78a0f60",
  "bytes": 387343,
  "rawSha256": "380ced2e392014619b0b71499e0247291505867d94955e04e0d47f9ab2316209"
 },
 "docs/release-evidence/proc-t14-bounded-doc-source-coverage-2026-10-24.json": {
  "kind": "data",
  "blobSha": "d6a6e4ef6b488825d34e9403dd9f77b70f7b3e85",
  "bytes": 437196,
  "rawSha256": "c41248daa674ff298ff324a890d45f1eae5f91dc4657f7c148b315ffb57be1b2"
 },
 "docs/release-evidence/proc-t15-aggregate-completion-2026-10-26.json": {
  "kind": "completion",
  "blobSha": "48f680257a8fa6966e951cd9f0296326ca9c661b",
  "bytes": 521391,
  "rawSha256": "59606e5e39ee9143e9a0fb63e1f4040bea68ab20fd8dd2376e73ebbcf21216aa"
 },
 "docs/release-evidence/proc-t15-aggregate-source-coverage-2026-10-26.json": {
  "kind": "data",
  "blobSha": "fd54aa05aee8c94aa32a41ce14bad11acedf8e1b",
  "bytes": 437377,
  "rawSha256": "cd3a294a3b15523c68167affec00700c198a6eff4d27230d19ff2b3e0197ba3f"
 },
 "docs/release-evidence/proc-t16-input-process-completion-2026-10-31.json": {
  "kind": "completion",
  "blobSha": "c1ecc522495e89ac5ef8885d25029cea9a02275a",
  "bytes": 459242,
  "rawSha256": "0de29738494e0835a09c034e64d32ccdc56a7027208372b03cbae57638fac9d5"
 },
 "docs/release-evidence/proc-t16-input-process-source-coverage-2026-10-31.json": {
  "kind": "data",
  "blobSha": "ea2fcd7be34a1c3d5e2fb3309a2fdcc5b68d9a2a",
  "bytes": 447065,
  "rawSha256": "f604bcca0c863bf1e43bf6d2217fb7fcf1446d48380dbe40da8e3eff7294f73f"
 },
 "docs/release-evidence/proc-t17-deadline-completion-2026-11-02.json": {
  "kind": "completion",
  "blobSha": "6b546c2e126f1891bb990212fc2123df88d52985",
  "bytes": 468689,
  "rawSha256": "ae9a2c39049d8ae44a4f82e81a8286693e4f4cf24bfa951c776463ae4130e5a9"
 },
 "docs/release-evidence/proc-t17-deadline-source-coverage-2026-11-02.json": {
  "kind": "data",
  "blobSha": "825b3e921bbb9d1d3f34ea34615d49cd7091ab68",
  "bytes": 657075,
  "rawSha256": "92e4d751a96ec04ba843892e087c7315c9392a7e6ede55383ff15465134761f5"
 },
 "docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json": {
  "kind": "completion",
  "blobSha": "49b7cb400a67227c3bcddc9fc4f07eb352c385ea",
  "bytes": 69032,
  "rawSha256": "84af4a7937314e940277ef5965367818ab1cccdbe46b1f18d8edd41fd8b01e0e"
 },
 "docs/release-evidence/reg-bridge-discovery-source-coverage-2026-10-20.json": {
  "kind": "data",
  "blobSha": "57ff772b0722f8c6f2db7019226f34096018ec2c",
  "bytes": 382822,
  "rawSha256": "100c0c53e6764e08685c81a5f92c0d193e798b675de1c8da8c8b7ea44d3560d9"
 },
 "docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json": {
  "kind": "completion",
  "blobSha": "9438c6044ed0291886803c247dfecfd6d587a013",
  "bytes": 72700,
  "rawSha256": "af004f545e7f88dbb4d53df7c81460bf153a40bd56627758aaf8c5f02e59f57c"
 },
 "docs/release-evidence/wave0a-completion-2026-10-01.json": {
  "kind": "completion",
  "blobSha": "32e2f9c8ba806ced658821bb9142a586342291be",
  "bytes": 34339,
  "rawSha256": "440528d404edf754f0480306526307088054dee7d1b72506370d8c22872cc99b"
 },
 "docs/release-evidence/wave0b-completion-2026-10-03.json": {
  "kind": "completion",
  "blobSha": "e2b755d352ac64bcf3983167af29b85ed4c99cbe",
  "bytes": 36350,
  "rawSha256": "df2f2dbfeef64c65fafcf9834998c914949b5c19ba539dccd8dfcd8dac9a91ae"
 },
 "docs/release-evidence/wf2-gate-p-completion-2026-10-11.json": {
  "kind": "completion",
  "blobSha": "1e945fef35a1792847f744f931613def68d99384",
  "bytes": 951005,
  "rawSha256": "cc316f2c59dcdd37db17c20561067249b235ad84043906d89b547e2c3f965a44"
 },
 "docs/release-evidence/wf2-gate-r-completion-2026-10-12.json": {
  "kind": "completion",
  "blobSha": "165b5d6edacbd2cf198ba1b5aaf058d44ed3606a",
  "bytes": 442727,
  "rawSha256": "983a10ba98a58811b86550866bca5e6b7b0f6d32966a12c84195e77d3c584d22"
 },
 "docs/release-evidence/wf2-p4-completion-2026-10-04.json": {
  "kind": "completion",
  "blobSha": "e034b8720e7f420a8a67817546df5b0ff20831bf",
  "bytes": 84867,
  "rawSha256": "16c1144e7b27cf0edc91fe63f202fa9cb2cce40eafbd1ce9e07af6664fd81081"
 },
 "docs/release-evidence/wf2-p5-completion-2026-10-05.json": {
  "kind": "completion",
  "blobSha": "ba19e703a8cb08cf1bf1213ca11db1080adf344d",
  "bytes": 147240,
  "rawSha256": "50edb7589256b8154477db5970c0f3960dc3513d6c887ec7564b4efb58638532"
 },
 "docs/release-evidence/wf2-p6-completion-2026-10-08.json": {
  "kind": "completion",
  "blobSha": "7317f45c6d2b8a82f03ad2619a6a7fa93cf0976e",
  "bytes": 788067,
  "rawSha256": "0a8f01068b306f387e3e72d185024ab5ab0ce4f04f68b8afe3a4471956937399"
 },
 "docs/release-evidence/wf2-p7-completion-2026-10-11.json": {
  "kind": "completion",
  "blobSha": "1a06fec954aebc54fd724c402bfd4912dc929497",
  "bytes": 957322,
  "rawSha256": "fe7fc94423170da5ec8838c45cf9636953e16766a70a445064195445a566507e"
 },
 "docs/release-evidence/wf2-r1-completion-2026-10-17.json": {
  "kind": "completion",
  "blobSha": "efcb9a1bdcebd7b1cc94dae90a7d160069636b89",
  "bytes": 283287,
  "rawSha256": "e1583bebaea4bcc2909bfd0db320cc6c633d136176d767c0958802db22eaf5fd"
 },
 "docs/release-evidence/wf2-r2-completion-2026-10-18.json": {
  "kind": "completion",
  "blobSha": "1fffd74a25ccbce0914bee85772cf0c9e9324926",
  "bytes": 942667,
  "rawSha256": "6782c1e797fcf7d76090e39a1afd735f3449efe59a9d521c375d4c360e0de04c"
 },
 "packages/processing-budget-runtime/contracts/processing-budget-definition.v1.json": {
  "kind": "data",
  "blobSha": "c214ebbe61e7574544549fb2905fa93032807462",
  "bytes": 3221,
  "rawSha256": "1961b8ecf4023dbaaf7fb1ac60754491400479fc95bffcb91e60ad57cb904dfc"
 },
 "packages/processing-budget-runtime/schema/processing-budget-profile.v1.schema.json": {
  "kind": "data",
  "blobSha": "5b4fd485f969411791d2bf1aa14216bc9c184699",
  "bytes": 2510,
  "rawSha256": "f5f9d82688d9ffe8c47506426866c78249cbbe9c2a415bf107444b0afd80a94c"
 },
 "packages/processing-budget-runtime/src/generatedProcessingBudgetDefinition.ts": {
  "kind": "code",
  "blobSha": "51cdd750e659e42842b1bf1c4967c0073913fb23",
  "bytes": 6306,
  "rawSha256": "cd21d3bdc8d13821c8ca7d1dd83c3b9e3b5663ee0b156d1fea5bf8821ca3276d"
 },
 "scripts/t14-bounded-document-installed-extension-host.test.js": {
  "kind": "code",
  "blobSha": "89f37df8cecc75d93d6eb21f674b5bcb952133ec",
  "bytes": 14189,
  "rawSha256": "53c1441f8d83ba4bb9e0f44d1522f8d1c90d6429b40fbbcc9eb6d180683fec82",
  "checkoutSha256": "5de8ee5d6bd322ec3a209bd4081c0ae6b990f908e1b11eb497200ea515c4fda7"
 },
 "scripts/t14-bounded-document-installed-smoke.mjs": {
  "kind": "code",
  "blobSha": "8689bc7c037f586dc0787699adb5da439b25061d",
  "bytes": 127841,
  "rawSha256": "936f8091edfce2972539f0dcdeea87540f1d527106f0541a838d2968c4e60f56",
  "checkoutSha256": "92736fb353682d7ade35b480b67512d8e25712ea11641f7c25a97885d94fd237"
 },
 "scripts/t14-bounded-document-installed-smoke.test.mjs": {
  "kind": "code",
  "blobSha": "bc912e16ab743e019f55218374d70f0b02e366cb",
  "bytes": 8611,
  "rawSha256": "53ad231712ddd0971285bbe19359cb74237338547c86b9df4a454580802fb353",
  "checkoutSha256": "38b69a80c46fb7cd2d46a2a1197a52be3fd6890a4c86f47a29b9a9cf09a035b5"
 },
 "scripts/t15-aggregate-installed-extension-host.test.js": {
  "kind": "code",
  "blobSha": "76f0518495d052efa06c06a8f113d267dcbe0df2",
  "bytes": 16091,
  "rawSha256": "c98a07fa4bd9375d69bc158fb1edfcb9378aac62526edde6fdd595bd25906005",
  "checkoutSha256": "ff8348e8104ed7f21681cc0d9e5d54475bb2dbc5a701dc3a13674742be2e0c80"
 },
 "scripts/t15-aggregate-installed-smoke.mjs": {
  "kind": "code",
  "blobSha": "d7b406f099c406f4e41a16d55bdab4a0b1520cf0",
  "bytes": 20744,
  "rawSha256": "858f8baeadcfde970746aef29d29d923f257ac9648797945a3dc8c69ba9d7966",
  "checkoutSha256": "a036c6898202a99ba2e777149c75b7d7ae71efcd56e0c3d08d8bc93c15607747"
 },
 "scripts/t15-aggregate-installed-smoke.test.mjs": {
  "kind": "code",
  "blobSha": "6dc9cbf1e58b1f5739956553c5ff2a4354540986",
  "bytes": 12761,
  "rawSha256": "e1e3a187bda555ab6f9cdbb68d55b5b2bb36c622fd3c3b99a2034574cc5d81a8",
  "checkoutSha256": "6c1d444e694ad6e40043ca73d42420ffd98f8a314ac50c7681d282c2cee66174"
 },
 "scripts/t17-deadline-installed-baseline-cases.js": {
  "kind": "code",
  "blobSha": "f483caa75536f1239c4854f436e3740cc87adff7",
  "bytes": 43905,
  "rawSha256": "e12312a0cd27675b711f5ac11841dec0fb10fd1e3a5ad98ad6bd83b30a477aa3"
 },
 "scripts/t17-deadline-installed-extension-host.test.js": {
  "kind": "code",
  "blobSha": "9a274b5d9bb0b067d342b65e7c8540ce1a5b0382",
  "bytes": 17231,
  "rawSha256": "a3cfc627abc7376007c81664d42cd70683f242b184eee3c2b4efac45af714ce8"
 },
 "scripts/t17-deadline-installed-smoke.mjs": {
  "kind": "code",
  "blobSha": "f46223f8f4aec446b7c109a506735f7ac6c6cf61",
  "bytes": 30902,
  "rawSha256": "1003741f4e872afc60ae8f370ec4fa5e8f6f373b893cb5256641b30b20840fd7"
 },
 "scripts/t17-deadline-installed-smoke.test.mjs": {
  "kind": "code",
  "blobSha": "b7a5925a5a8f40d7de76ecf309fcfad3294ab26d",
  "bytes": 19418,
  "rawSha256": "1d7cb940cbee58db1a691c6eaa86061c103daa748c9cd586edee87c080ccfb42"
 },
 "tools/main-consolidation/aggregate-document-source-admission.json": {
  "kind": "data",
  "blobSha": "3ccebd11388600fa913e831c156107cd9f7ef47c",
  "bytes": 20627,
  "rawSha256": "0b1f28b85b4544e391e79654d2d48e1508557d6b4d1bce7d3b5ce49f8964b626"
 },
 "tools/main-consolidation/aggregateDocumentAdmissionPolicy.mjs": {
  "kind": "code",
  "blobSha": "f0294f5bbf5a59e74f4a08c47e0777efc37a637d",
  "bytes": 28971,
  "rawSha256": "fef83042235ef44aaea8ee44371f5dce6519b64f1d5048fa24d5ef1d06dd7e7c",
  "checkoutSha256": "ff99eb65b5bf2ce32c1e0af0bd5a8b7bd02a0d5485db9ba9cc02f71c30f5c6f5"
 },
 "tools/main-consolidation/bounded-document-source-admission.json": {
  "kind": "data",
  "blobSha": "271ae9bb2aa3c810c91d4d1cdc846f0050dbf4d9",
  "bytes": 29385,
  "rawSha256": "b34713b990e77558528d57e2550044439b24726079ceebc93e9032c35b646cd1"
 },
 "tools/main-consolidation/boundedDocumentAdmissionPolicy.mjs": {
  "kind": "code",
  "blobSha": "e3c54634c47832e38f7f5ccf25afcf80edd84836",
  "bytes": 29092,
  "rawSha256": "8b9c05f82de626b2b0e7140676d3c92f0dea461cbd66a801a8ac00981b8f6b80",
  "checkoutSha256": "9ac9ee3397f3d21b75b63a8c6a710969c09e9b87b7f039e26ed1ef81abb39f5a"
 },
 "tools/main-consolidation/deadline-source-admission.json": {
  "kind": "data",
  "blobSha": "aafb642592a6bfecc87567db70b045ebd2cdb9dd",
  "bytes": 40330,
  "rawSha256": "16d19440857b42e53daa55f37762fa5ab13c88192c846b638c4661bd822f4a4c"
 },
 "tools/main-consolidation/deadlineAdmissionPolicy.mjs": {
  "kind": "code",
  "blobSha": "ee262941a4f8c06c8817b4b4288a708ec91b5658",
  "bytes": 53044,
  "rawSha256": "ce2fc3af4275dc6d3062e7487a577e54d6893dea31db8e4868208bcaf384e246"
 },
 "tools/main-consolidation/feature-selection-source-universe.json": {
  "kind": "data",
  "blobSha": "f499a9dad103136011a3a42a65346320a37da590",
  "bytes": 1081350,
  "rawSha256": "c69adc6b82d1d6d40719e10c116e985890f17d45ee4b99e0feabe76b00d08c79"
 },
 "tools/main-consolidation/gate-r-main-admission.json": {
  "kind": "data",
  "blobSha": "e56b29e7b4c814f7669196a89833abba83bd5c75",
  "bytes": 217808,
  "rawSha256": "156633d3e71cbf13ea8d081f4aa4e3bcf984208a7705ed2eaf83578896098bdc"
 },
 "tools/main-consolidation/input-process-source-admission.json": {
  "kind": "data",
  "blobSha": "bab597bea28f472d7ccd0a4949778214e55b59e4",
  "bytes": 20509,
  "rawSha256": "6509faf09ff9652aa8b9bb32df4e0d252b484a71b0a3baa6d650c30819116720"
 },
 "tools/main-consolidation/inputProcessAdmissionPolicy.mjs": {
  "kind": "code",
  "blobSha": "51d285fbdd4c40d8448fa142220aab7789a8f8d0",
  "bytes": 40580,
  "rawSha256": "4bf09c8884851f0e088aa7af58b3252e1bb003c61bcf1b3b227b3fe0d3da4022",
  "checkoutSha256": "716e5bdcba4d1f7578d7da5f31f4af069ffe759a558ae92f5d4af70e36f8a845"
 },
 "tools/main-consolidation/processing-budget-source-admission.json": {
  "kind": "data",
  "blobSha": "6957d9cff8bff75007d1f25d2cac7fa69bf47df0",
  "bytes": 7820,
  "rawSha256": "6c7b3e89feaa67976449c9deb04d3456968566b38b9be390015790f30f7e666a",
  "checkoutSha256": "2d8f1228f4f46f1c46f91e3c1595ff9f25b1eba39117db5414fd96fa2c65abb2"
 },
 "tools/main-consolidation/registry-bridge-source-admission.json": {
  "kind": "data",
  "blobSha": "c03c3477038bb1a96aa339e9c9a0b4868055cc85",
  "bytes": 18298,
  "rawSha256": "1665c66acd04a535b08116e639f5119b98e03609d9bb4d5f8efacc9bba37b5a4"
 },
 "tools/main-consolidation/registry-discovery-source-admission.json": {
  "kind": "data",
  "blobSha": "ac86711efd9d3cba2d1df9eccddb4d7595c4c5c0",
  "bytes": 10082,
  "rawSha256": "c3a311ce9fb9948532234a0460b8643a93c1149bb1a10f92a737e1b71d6fd816"
 },
 "tools/main-consolidation/registry-discovery-upstream-main-admission.json": {
  "kind": "data",
  "blobSha": "9cbd493773e733a83817b71d03bbefa9ee966a11",
  "bytes": 6825,
  "rawSha256": "61be4ae3c383573d3075149d02c9ef9ac5955dc0243980b48538dcb7f07f3bd7"
 }
}).map(([name,row])=>[name,Object.freeze(row)])));

function fail(message){throw new TypeError('path admission: '+message);}
function input(value,label){
 try{return gateRInputData(value,label);}
 catch(error){fail(error.message);}
}
function exact(value,keys){
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length
  ||keys.some(key=>!Object.hasOwn(value,key)))fail('closed record');
}
function pathRows(rows,label){
 if(!Array.isArray(rows))fail(label+' inventory');
 gateRPathRows(rows,label);
}

export function validatePathCoverage(value){
 const c=input(value,'path coverage');
 exact(c,['schemaVersion','baseMainSha','baseTreeSha','sourceUniverseSha256','selectionLedgerSha256','items',
  'additionalCurrentMainPrerequisites','preservedBaselines','adaptationDecisions','remainderClosure']);
 if(c.schemaVersion!=='bob-builtin-analyze/path-source-coverage/v1'||c.baseMainSha!==base||c.baseTreeSha!==tree
  ||digest(c)!==PATH_SOURCE_COVERAGE_SHA256)fail('literal coverage identity');
 if(!sha256.test(c.sourceUniverseSha256)||!sha256.test(c.selectionLedgerSha256)
  ||c.items.length!==22||new Set(c.items.map(row=>row.origin.path)).size!==22
  ||new Set(c.items.map(row=>row.origin.blobSha)).size!==21||c.items.some(row=>row.origin.commitSha!==owner)
  ||c.remainderClosure.total!==675||c.remainderClosure.unassigned!==0||c.remainderClosure.items.length!==675
  ||new Set(c.remainderClosure.items.map(row=>row.sourceItemId)).size!==675)fail('22 origins and 675 assignments');
 for(const item of c.items){
  if(!item.targets.length||!item.testCases.length||!item.adaptation
   ||!equal(item.symbolReceipts.map(row=>row.originSymbol).sort(),[...new Set(item.originSymbols)].sort())
   ||item.symbolReceipts.some(row=>!row.targets.length||!row.reason||!row.disposition))fail('source symbol/test receipt');
 }
 return true;
}

export function validatePathSourceAdmission(value){
 const a=input(value,'path source admission');
 exact(a,['schemaVersion','baseMainSha','baseTreeSha','baseFilesDigests','sourceRows','controlRows',
  'independentControls','domainPaths','sourceCoverageDigest']);
 if(a.schemaVersion!=='bob-builtin-analyze/path-source-admission/v1'||a.baseMainSha!==base||a.baseTreeSha!==tree
  ||a.sourceCoverageDigest!==PATH_SOURCE_COVERAGE_SHA256||!equal(a.independentControls,independentControls)
  ||digest(a)!==PATH_SOURCE_ADMISSION_SHA256)fail('literal admission identity');
 exact(a.baseFilesDigests,domains);
 exact(a.domainPaths,domains);
 const rows=[...a.sourceRows,...a.controlRows].sort((a,b)=>compare(a.path,b.path));
 pathRows(rows,'PATH delta rows');
 for(const row of rows){
  exact(row,['path','mode','beforeBlobSha','afterBlobSha','sourceItemIds']);
  if(row.mode!=='100644'||(row.beforeBlobSha!==null&&!oid.test(row.beforeBlobSha))
   ||!oid.test(row.afterBlobSha)||row.beforeBlobSha===row.afterBlobSha
   ||row.sourceItemIds.some((id,index)=>!/^source-[a-f0-9]{24}$/.test(id)||index&&row.sourceItemIds[index-1]>=id))
   fail('source/control delta row');
 }
 if(a.sourceRows.some(row=>!row.sourceItemIds.length)||a.controlRows.some(row=>row.sourceItemIds.length))fail('source/control partition');
 return true;
}

export function applyPathSourceAdmission(value,options){
 validatePathSourceAdmission(value);
 const a=input(value,'path source admission'),settings=input(options,'path projection');
 exact(settings,['domain','baseFiles']);
 if(!domains.includes(settings.domain)||digest(settings.baseFiles)!==a.baseFilesDigests[settings.domain])fail('domain baseline identity');
 const files=new Map(settings.baseFiles.map(row=>[row.path,{...row}]));
 const rows=new Map([...a.sourceRows,...a.controlRows].map(row=>[row.path,row]));
 for(const relative of a.domainPaths[settings.domain]){
  const row=rows.get(relative),before=files.get(relative);
  if(!row||(before&&(before.mode!==row.mode||before.blobSha!==row.beforeBlobSha)))fail('domain before blob');
  files.set(relative,{path:relative,mode:row.mode,blobSha:row.afterBlobSha});
 }
 return [...files.values()].sort((a,b)=>compare(a.path,b.path));
}

function parseTree(text){
 const files=new Map();
 for(const line of text.split('\0').filter(Boolean)){
  const row=/^(\d+) blob ([0-9a-f]{40})\t(.+)$/.exec(line);
  if(row)files.set(row[3],{mode:row[1],blobSha:row[2]});
 }
 return files;
}

function verifyOrigins(target,items){
 const bindings=new Map(items.map(item=>[item.origin.blobSha,item.originEvidence]));
 const raw=execFileSync('git',['cat-file','--batch'],{
  cwd:target,input:[...bindings.keys()].join('\n')+'\n',maxBuffer:16*1048576,stdio:['pipe','pipe','pipe'],
  env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}
 });
 let offset=0;
 for(const [blob,binding] of bindings){
  const end=raw.indexOf(10,offset);
  if(end<0||raw.subarray(offset,end).toString('ascii')!==blob+' blob '+binding.bytes)fail('origin Git object header');
  const content=raw.subarray(end+1,end+1+binding.bytes);
  if(content.length!==binding.bytes||gateRDigest(content)!==binding.sha256||raw[end+1+binding.bytes]!==10)fail('origin Git object bytes');
  offset=end+2+binding.bytes;
 }
 if(offset!==raw.length)fail('origin Git object inventory');
}

export function validatePathRepository(repositoryRoot=root){
 const target=path.resolve(repositoryRoot);
 if(!fs.lstatSync(target).isDirectory()||fs.lstatSync(target).isSymbolicLink())fail('physical repository root');
 const read=relative=>readGateRContainedFile(target,relative);
 const git=(args,stdin)=>execFileSync('git',args,{
  cwd:target,input:stdin,encoding:'utf8',maxBuffer:32*1048576,stdio:['pipe','pipe','pipe'],
  env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}
 });
 const rawAdmission=read(admissionPath),rawCoverage=read(coveragePath);
 if(gateRDigest(rawAdmission)!==PATH_ADMISSION_RAW_SHA256||gateRDigest(rawCoverage)!==PATH_COVERAGE_RAW_SHA256)fail('raw admission/coverage byte seal');
 validatePathSourceAdmission(rawAdmission);
 validatePathCoverage(rawCoverage);
 const a=JSON.parse(rawAdmission),c=JSON.parse(rawCoverage);
 const universeBytes=read(universePath),ledgerBytes=read(ledgerPath),universe=JSON.parse(universeBytes);
 if(gateRDigest(universeBytes)!==c.sourceUniverseSha256||gateRDigest(ledgerBytes)!==c.selectionLedgerSha256)fail('selection authority bytes');
 if(!equal(c.remainderClosure.items.map(row=>[row.sourceItemId,row.primaryOwner]),
  universe.items.map(row=>[row.sourceItemId,row.primaryOwner])))fail('675 assignments');
 const selected=universe.items.filter(row=>row.primaryOwner==='PROC-T17-PATH');
 if(!equal(c.items.map(row=>row.sourceItemId),selected.map(row=>row.sourceItemId)))fail('selected source IDs');
 if(git(['rev-parse','--verify',base+'^{tree}']).trim()!==tree
  ||git(['rev-parse','--verify',owner+'^{tree}']).trim()!==PATH_OWNER_TREE)fail('immutable authority trees');
 const prior=parseTree(git(['ls-tree','-r','-z',base]));
 const origins=parseTree(git(['ls-tree','-r','-z',owner]));
 verifyOrigins(target,c.items);
 const rows=new Map([...a.sourceRows,...a.controlRows].map(row=>[row.path,row]));
 const expected=new Map();
 for(const [relative,binding] of Object.entries(PATH_HISTORICAL_BINDINGS)){
  const bytes=read(relative);
  const historical=binding.kind==='code'?Buffer.from(bytes.toString('utf8').replaceAll('\r\n','\n')):bytes;
  const matchesBlob=historical.length===binding.bytes&&gateRDigest(historical)===binding.rawSha256;
  const matchesHistoricalCheckout=binding.checkoutSha256===gateRDigest(bytes);
  if(prior.get(relative)?.blobSha!==binding.blobSha||(!matchesBlob&&!matchesHistoricalCheckout))
   fail('historical raw bytes: '+relative);
  expected.set(relative,binding.blobSha);
 }
 for(const row of rows.values()){
  if((prior.get(row.path)?.blobSha??null)!==row.beforeBlobSha
   ||(prior.has(row.path)&&prior.get(row.path).mode!==row.mode))fail('M0 before blob: '+row.path);
  expected.set(row.path,row.afterBlobSha);
 }
 for(const relative of independentControls){read(relative);expected.set(relative,null);}
 const actualDelta=git(['diff','--cached','--no-renames','--name-only','-z',base]).split('\0').filter(Boolean);
 const delta=new Set([...rows.keys(),...independentControls]);
 const futureMetadata=actualDelta.filter(relative=>metadataPaths.has(relative)&&!delta.has(relative));
 if(actualDelta.some(relative=>!delta.has(relative)&&!metadataPaths.has(relative))
  ||[...delta].some(relative=>!actualDelta.includes(relative))
  ||futureMetadata.length>0&&futureMetadata.length!==metadataPaths.size)fail('complete M0 delta inventory');
 const text=new Map();
 function source(relative){
  if(!text.has(relative))text.set(relative,read(relative).toString('utf8'));
  return text.get(relative);
 }
 for(const [index,item] of c.items.entries()){
  const original=selected[index],binding=item.origin;
  if(original.kind!==item.kind||original.family!==item.family||!original.origins.some(origin=>equal(origin,binding))
   ||origins.get(binding.path)?.blobSha!==binding.blobSha
   ||!equal([...new Set(original.symbols)].sort(),[...new Set(item.originSymbols)].sort()))fail('owner source binding');
  for(const target of item.targets){
   const row=rows.get(target.path);
   if(row?.afterBlobSha!==target.blobSha||row.mode!==target.mode||!row.sourceItemIds.includes(item.sourceItemId))fail('coverage target: '+target.path);
  }
  for(const check of item.testCases)if(!source(check.path).includes(check.name))fail('coverage test: '+check.name);
  for(const receipt of item.symbolReceipts)for(const target of receipt.targets){
   if(!source(target.path).includes(target.symbol))fail('actual symbol: '+target.symbol);
  }
 }
 if(!equal(c.additionalCurrentMainPrerequisites.map(row=>row.path),[...a.controlRows.map(row=>row.path).filter(relative=>relative!==coveragePath),...independentControls].sort()))
  fail('complete current prerequisites');
 const required=[...expected.keys()].sort();
 const index=new Map();
 for(const line of git(['ls-files','--stage','-z','--',...required]).split('\0').filter(Boolean)){
  const match=/^100644 ([a-f0-9]{40}) 0\t(.+)$/.exec(line);
  if(!match||index.has(match[2]))fail('index row');
  index.set(match[2],match[1]);
 }
 for(const relative of required)read(relative);
 const working=git(['hash-object','--stdin-paths'],required.join('\n')+'\n').trim().split(/\r?\n/);
 if(working.length!==required.length)fail('working inventory');
 for(const [position,relative] of required.entries()){
  const observed=index.get(relative),sealed=expected.get(relative);
  if(!observed||(sealed&&sealed!==observed)||observed!==working[position])fail('index/working blob: '+relative);
 }
 const attributes=read('.gitattributes').toString('utf8').split(/\r?\n/);
 for(const relative of [admissionPath,coveragePath,...[...metadataPaths].filter(relative=>relative.endsWith('2026-11-04.json'))]){
  if(!attributes.includes(relative+' text eol=lf'))fail('explicit LF rule: '+relative);
 }
 return true;
}
