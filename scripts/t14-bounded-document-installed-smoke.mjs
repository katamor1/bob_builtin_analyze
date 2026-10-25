import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {validateVsixArchive} from '../tools/workflow-evidence/lib/vsixArchive.mjs';

const require=createRequire(import.meta.url),repositoryRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {assertInstalledRuntimePaths}=require('./t14-bounded-document-installed-extension-host.test.js');
export {assertInstalledRuntimePaths};
const names=['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml'];
const compiledNames=names.flatMap(name=>['js','d.ts','js.map'].map(suffix=>name+'.'+suffix)).sort();
const ids=['local.bob-bazaar-review','local.bob-code-consistency-review'];
const fixtureNames=['normal.docx','normal.xlsx','missing-both.xlsx','bad-crc.docx','source.md'];
const requiredCases=['normal_docx','normal_xlsx','missing_both_xlsx','crc_rejected','oversize_rejected','mutation_discarded','locators_preserved','source_unchanged','installed_gui_error_is_logged_once_and_queue_recovers'];
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fail(reason){throw Error('artifact verification: '+reason);}
function exactObject(input,keys){if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(Object.keys(input).sort())!==JSON.stringify([...keys].sort()))fail('closed object required');}
function noAlias(file){const absolute=path.resolve(file),root=path.parse(absolute).root;let current=root;for(const part of absolute.slice(root.length).split(path.sep).filter(Boolean)){current=path.join(current,part);if(fs.lstatSync(current).isSymbolicLink())fail('path alias');}return absolute;}
function row(input,expectedName){
 exactObject(input,['path','bytes','sha256']);if(typeof input.path!=='string'||(expectedName!==undefined&&input.path!==expectedName)||!Number.isSafeInteger(input.bytes)||input.bytes<=0||typeof input.sha256!=='string'||!/^[0-9a-f]{64}$/.test(input.sha256))fail('invalid positive byte binding');
 return{path:input.path,bytes:input.bytes,sha256:input.sha256};
}
function readBinding(binding,maximum){
 row(binding);if(!path.isAbsolute(binding.path)||binding.bytes>maximum)fail('invalid artifact path or size');const file=noAlias(binding.path),before=fs.statSync(file);if(!before.isFile()||before.size!==binding.bytes)fail('artifact size mismatch');const bytes=fs.readFileSync(file);if(bytes.length!==binding.bytes||sha(bytes)!==binding.sha256)fail('artifact hash mismatch');return bytes;
}
function binding(file){const bytes=fs.readFileSync(noAlias(file));return{path:fs.realpathSync(file),bytes:bytes.length,sha256:sha(bytes)};}
function compiledRows(rows){if(!Array.isArray(rows)||rows.length!==compiledNames.length)fail('compiled inventory');return rows.map((input,index)=>row(input,compiledNames[index]));}
function verifyCopy(archive,expected){
 const prefix='extension/out/shared-processing-budget-runtime/',entries=archive.entries.filter(entry=>entry.path.startsWith(prefix)&&entry.kind==='file'),allowed=new Set([...compiledNames,'manifest.json']);
 if(entries.some(entry=>!allowed.has(entry.path.slice(prefix.length))))fail('unknown installed runtime file');
 for(const name of [...names.map(name=>name+'.js'),'manifest.json'])if(!entries.some(entry=>entry.path===prefix+name))fail('missing installed runtime module');
 const manifest=JSON.parse(archive.readEntry(prefix+'manifest.json').toString('utf8'));exactObject(manifest,['schemaVersion','sourceInputDigest','payload']);
 if(manifest.schemaVersion!=='bob-builtin-analyze/processing-runtime-copy/v1'||typeof manifest.sourceInputDigest!=='string'||!/^[0-9a-f]{64}$/.test(manifest.sourceInputDigest))fail('invalid runtime manifest');
 if(JSON.stringify(compiledRows(manifest.payload))!==JSON.stringify(expected))fail('compiled binding mismatch');
 for(const entry of entries.filter(entry=>!entry.path.endsWith('/manifest.json'))){const expectedRow=expected.find(row=>row.path===entry.path.slice(prefix.length));if(entry.bytes!==expectedRow.bytes||entry.sha256!==expectedRow.sha256)fail('installed runtime hash mismatch');}
 return manifest.sourceInputDigest;
}
// Source-fixed parser payloads: clean npm-ci bytes matched every shipped parser file.
// Regenerate only with reviewed parser/lock changes; callers cannot supply these expectations.
const parserIdentities={
 "local.bob-bazaar-review": [
  {
   "name": "cheerio",
   "version": "1.2.0",
   "integrity": "sha512-WDrybc/gKFpTYQutKIK6UvfcuxijIZfMfXaYm8NMsPQxSYvf+13fXUJ4rztGGbJcBQ/GF55gvrZ0Bc0bj/mqvg==",
   "specifier": "cheerio",
   "payload": [
    {
     "path": "node_modules/cheerio/LICENSE",
     "bytes": 1081,
     "sha256": "61c1e21d3a8ff20f9b69abe15104a75584688080febc22f60a4cbf3854becf4e"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/attributes.js",
     "bytes": 20215,
     "sha256": "89620b464dd95fcf9c63781320f039fd41771ebafd783af6e86a80dde738a146"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/css.js",
     "bytes": 3187,
     "sha256": "3bd12911368c6050dce487f0d9b7f968667acaa8f444079f59cbe7230a71ecd5"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/extract.js",
     "bytes": 1479,
     "sha256": "8f7d64a42aadbfd6425d99eb3c8403d57e9d3b642a2828458f76345a5614fb97"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/forms.js",
     "bytes": 3103,
     "sha256": "ebd229e85d8084206668484e0dd6faeb04c9b7755e62a3c90a485563c7e1e848"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/manipulation.js",
     "bytes": 24918,
     "sha256": "877dacf83b86235653955b788f6dc9bd628f3e26a36fd3a327116bfa55aec7fd"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/traversing.js",
     "bytes": 24708,
     "sha256": "408e7c2bf26afbf64efb285380f4911489f7e0be7cb151a4b2c86b98a60cbf4a"
    },
    {
     "path": "node_modules/cheerio/dist/browser/cheerio.js",
     "bytes": 2013,
     "sha256": "58fc2469df9fbdc4217db17b6f2a2993fc6861aae11697b04f1d608b8496d9c9"
    },
    {
     "path": "node_modules/cheerio/dist/browser/index.js",
     "bytes": 122,
     "sha256": "c6d78ab54623001a3bb2a6ae4942cd4af04ceb44bb8ef4df23317ee6373d2794"
    },
    {
     "path": "node_modules/cheerio/dist/browser/load-parse.js",
     "bytes": 1354,
     "sha256": "9e6d9e2d9fc3a8f321816e9d2b974c9048644875e902a31400700bdfe6ae0a0e"
    },
    {
     "path": "node_modules/cheerio/dist/browser/load.js",
     "bytes": 5588,
     "sha256": "ae6937526f54c08cac2b4733008b0cfecd12f6900e17e7960ffa8d344da83586"
    },
    {
     "path": "node_modules/cheerio/dist/browser/options.js",
     "bytes": 901,
     "sha256": "9819b83080b190e2bdf2bd98e2763a29fcd5af9fffbd62fe660500f0a3b37fb1"
    },
    {
     "path": "node_modules/cheerio/dist/browser/package.json",
     "bytes": 23,
     "sha256": "3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a"
    },
    {
     "path": "node_modules/cheerio/dist/browser/parse.js",
     "bytes": 2224,
     "sha256": "62e53212119504ee3e97bf1940cba725a2b58ed4feef74848d8f8906e94214bb"
    },
    {
     "path": "node_modules/cheerio/dist/browser/parsers/parse5-adapter.js",
     "bytes": 1963,
     "sha256": "8fbabf110ebe5e20724900990f0bb73dcca1c62a92782586686018e7a8234345"
    },
    {
     "path": "node_modules/cheerio/dist/browser/slim.js",
     "bytes": 836,
     "sha256": "78e11e59173f67eb390ff6b6ac4791a558084aa33efe3eed747c21c9a4b386c2"
    },
    {
     "path": "node_modules/cheerio/dist/browser/static.js",
     "bytes": 6131,
     "sha256": "43780fa999cb63bc08211604c9bdc8847172377d81d8e702495e6eb3452c47bb"
    },
    {
     "path": "node_modules/cheerio/dist/browser/types.js",
     "bytes": 102,
     "sha256": "052dfc79ac1c253cc2cfb79c47804d31c2fbf63724e70c541aa14c470dd4b8ac"
    },
    {
     "path": "node_modules/cheerio/dist/browser/utils.js",
     "bytes": 2578,
     "sha256": "6c41ea99c8e06821fbc5a4683fca4bb8f89c18895cbe874773367da7aa309f2f"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/attributes.js",
     "bytes": 21078,
     "sha256": "417098df8357232e142d0c4b5308890c0245e900ebd8e67f791f30622f24e72c"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/css.js",
     "bytes": 3340,
     "sha256": "7746c87d752a58d3482228ba0ab2993d38817cab7c0c0771cc4042ee0a060b5f"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/extract.js",
     "bytes": 1576,
     "sha256": "522682022079cf724fc03316d1e8e313331aeb454f969b9bca3f284f40362a88"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/forms.js",
     "bytes": 3264,
     "sha256": "faf527df7eee6195b39aac346c231ef9f406862a1c1be10df9e7d9fc889e12e5"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/manipulation.js",
     "bytes": 25956,
     "sha256": "cabef68a59a6e5e0e8bed5c3c240ab57ff2f382658f09bf61fc1afbdefdac517"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/traversing.js",
     "bytes": 27020,
     "sha256": "540c5d31023bf7b793121da0f693aae62605ec4578555b3e6e964d422e244b92"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/cheerio.js",
     "bytes": 3579,
     "sha256": "f0fd733ff299a0ec5073b6016d940c918073542c1e3b83e816abae842170d91b"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/index.js",
     "bytes": 9916,
     "sha256": "ed43f738462a3ce5f277d8626dad1a0210464e38331064b3b43e1083b1ffd494"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/load-parse.js",
     "bytes": 1676,
     "sha256": "1be8b4e33874844978e2f4ba497f9dc290add220add5328b245465df7cfb5356"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/load.js",
     "bytes": 7230,
     "sha256": "7092336c1f5ce35750ad55bd1db1f8dfa85565ea49b0dc3eac35cb349db8d148"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/options.js",
     "bytes": 1012,
     "sha256": "f99e50683a7c223ddbe6cf397708fac2d3a653c7d68a3e8e7ec278caf2c09ce5"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/package.json",
     "bytes": 25,
     "sha256": "8005a3491db7d92f36ac66369861589f9c47123d3a7c71e643fc2c06168cd45a"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/parse.js",
     "bytes": 2354,
     "sha256": "7dcddf49df71915325218ae2ab3194b5021c0b1d961513ff234561130e581812"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/parsers/parse5-adapter.js",
     "bytes": 2175,
     "sha256": "08fe0e537e3c8d91f3a6f54dbf4f69f891170b7bca3571f7e26e3a9e213da5fb"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/slim.js",
     "bytes": 1430,
     "sha256": "edefd5b653583c0800bd5a1f08571fc1496ead27c77c3f37015bd070ce2ab5bc"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/static.js",
     "bytes": 6358,
     "sha256": "7b8ef6def93b427cde71dcfb7f4009fbe572a6dad5047b5dbe6c879856ed0e9c"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/types.js",
     "bytes": 168,
     "sha256": "24d24dca97cee756cf72233d188840328f8b73cd83b5dc762cd304204626f49b"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/utils.js",
     "bytes": 2761,
     "sha256": "654bafd7ebb53616b23afe8d840b941dfa8fbf9fcb66e47fcd57e537c121f2df"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/attributes.js",
     "bytes": 20215,
     "sha256": "89620b464dd95fcf9c63781320f039fd41771ebafd783af6e86a80dde738a146"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/css.js",
     "bytes": 3187,
     "sha256": "3bd12911368c6050dce487f0d9b7f968667acaa8f444079f59cbe7230a71ecd5"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/extract.js",
     "bytes": 1479,
     "sha256": "8f7d64a42aadbfd6425d99eb3c8403d57e9d3b642a2828458f76345a5614fb97"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/forms.js",
     "bytes": 3103,
     "sha256": "ebd229e85d8084206668484e0dd6faeb04c9b7755e62a3c90a485563c7e1e848"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/manipulation.js",
     "bytes": 24918,
     "sha256": "877dacf83b86235653955b788f6dc9bd628f3e26a36fd3a327116bfa55aec7fd"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/traversing.js",
     "bytes": 24708,
     "sha256": "408e7c2bf26afbf64efb285380f4911489f7e0be7cb151a4b2c86b98a60cbf4a"
    },
    {
     "path": "node_modules/cheerio/dist/esm/cheerio.js",
     "bytes": 2013,
     "sha256": "58fc2469df9fbdc4217db17b6f2a2993fc6861aae11697b04f1d608b8496d9c9"
    },
    {
     "path": "node_modules/cheerio/dist/esm/index.js",
     "bytes": 7435,
     "sha256": "19dd79731dc5cce760b9a506389aa51c088cf780bd73ba1f5fc76235a48ff72d"
    },
    {
     "path": "node_modules/cheerio/dist/esm/load-parse.js",
     "bytes": 1354,
     "sha256": "9e6d9e2d9fc3a8f321816e9d2b974c9048644875e902a31400700bdfe6ae0a0e"
    },
    {
     "path": "node_modules/cheerio/dist/esm/load.js",
     "bytes": 5588,
     "sha256": "ae6937526f54c08cac2b4733008b0cfecd12f6900e17e7960ffa8d344da83586"
    },
    {
     "path": "node_modules/cheerio/dist/esm/options.js",
     "bytes": 901,
     "sha256": "9819b83080b190e2bdf2bd98e2763a29fcd5af9fffbd62fe660500f0a3b37fb1"
    },
    {
     "path": "node_modules/cheerio/dist/esm/package.json",
     "bytes": 23,
     "sha256": "3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a"
    },
    {
     "path": "node_modules/cheerio/dist/esm/parse.js",
     "bytes": 2224,
     "sha256": "62e53212119504ee3e97bf1940cba725a2b58ed4feef74848d8f8906e94214bb"
    },
    {
     "path": "node_modules/cheerio/dist/esm/parsers/parse5-adapter.js",
     "bytes": 1963,
     "sha256": "8fbabf110ebe5e20724900990f0bb73dcca1c62a92782586686018e7a8234345"
    },
    {
     "path": "node_modules/cheerio/dist/esm/slim.js",
     "bytes": 836,
     "sha256": "78e11e59173f67eb390ff6b6ac4791a558084aa33efe3eed747c21c9a4b386c2"
    },
    {
     "path": "node_modules/cheerio/dist/esm/static.js",
     "bytes": 6131,
     "sha256": "43780fa999cb63bc08211604c9bdc8847172377d81d8e702495e6eb3452c47bb"
    },
    {
     "path": "node_modules/cheerio/dist/esm/types.js",
     "bytes": 102,
     "sha256": "052dfc79ac1c253cc2cfb79c47804d31c2fbf63724e70c541aa14c470dd4b8ac"
    },
    {
     "path": "node_modules/cheerio/dist/esm/utils.js",
     "bytes": 2578,
     "sha256": "6c41ea99c8e06821fbc5a4683fca4bb8f89c18895cbe874773367da7aa309f2f"
    },
    {
     "path": "node_modules/cheerio/package.json",
     "bytes": 4843,
     "sha256": "026f4c64a6a1d210e59ad0b6f66988857fc65e3485c24af3358a4196046e8f0c"
    },
    {
     "path": "node_modules/cheerio/src/index-browser.mts",
     "bytes": 213,
     "sha256": "8a47899f28b2257a504805e66776b82827f67fa6ed7a2dd0e201cf015f0e29e7"
    }
   ]
  },
  {
   "name": "fflate",
   "version": "0.8.3",
   "integrity": "sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==",
   "specifier": "fflate",
   "payload": [
    {
     "path": "node_modules/fflate/LICENSE",
     "bytes": 1069,
     "sha256": "0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551"
    },
    {
     "path": "node_modules/fflate/esm/browser.js",
     "bytes": 90922,
     "sha256": "b7ca4450b19559a1d50eb381adcee94b82449674be4cd17789d9beba7e6122a1"
    },
    {
     "path": "node_modules/fflate/esm/index.d.mts",
     "bytes": 53488,
     "sha256": "985db2599e33d85a70a6da5f2b7b6f1b0bf9b9119781b684573a1a9b463e0cc4"
    },
    {
     "path": "node_modules/fflate/esm/index.mjs",
     "bytes": 91765,
     "sha256": "8d75534a30a0580608e1271c13d70943ed4cd3589fddff7b1197748036a5116e"
    },
    {
     "path": "node_modules/fflate/lib/browser.cjs",
     "bytes": 91611,
     "sha256": "cbe7f75f83e0ca95ec7f3854fcdc8f854f488485d0ecf03c3a0a7ff29765c690"
    },
    {
     "path": "node_modules/fflate/lib/browser.d.cts",
     "bytes": 53488,
     "sha256": "985db2599e33d85a70a6da5f2b7b6f1b0bf9b9119781b684573a1a9b463e0cc4"
    },
    {
     "path": "node_modules/fflate/lib/index.cjs",
     "bytes": 91005,
     "sha256": "36967d6a4576f414f5a3611cfc866fa4245c05582048332ac139a174c63d56e0"
    },
    {
     "path": "node_modules/fflate/lib/node-worker.cjs",
     "bytes": 1405,
     "sha256": "69fe824fc1ecdcbd3f4ea0c8718b57bd91c84e202944034a2f0a5cb71be850f7"
    },
    {
     "path": "node_modules/fflate/lib/node.cjs",
     "bytes": 92380,
     "sha256": "befa44cd80a1da830179db9e57930050a2e460ca3df13f0b05f83f52b1491818"
    },
    {
     "path": "node_modules/fflate/lib/node.d.cts",
     "bytes": 53488,
     "sha256": "985db2599e33d85a70a6da5f2b7b6f1b0bf9b9119781b684573a1a9b463e0cc4"
    },
    {
     "path": "node_modules/fflate/lib/worker.cjs",
     "bytes": 636,
     "sha256": "7e04279c47bfcfb60cee1d86b250f6cffce89e922a0bdf959258713a30e0e46a"
    },
    {
     "path": "node_modules/fflate/package.json",
     "bytes": 3543,
     "sha256": "5922d8150b307bc0e4e441491c779c45379e9913d348848fca8d5cf02db4d134"
    },
    {
     "path": "node_modules/fflate/umd/index.js",
     "bytes": 33044,
     "sha256": "462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83"
    }
   ]
  },
  {
   "name": "mammoth",
   "version": "1.12.0",
   "integrity": "sha512-cwnK1RIcRdDMi2HRx2EXGYlxqIEh0Oo3bLhorgnsVJi2UkbX1+jKxuBNR9PC5+JaX7EkmJxFPmo6mjLpqShI2w==",
   "specifier": "mammoth",
   "payload": [
    {
     "path": "node_modules/mammoth/LICENSE",
     "bytes": 1307,
     "sha256": "6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1"
    },
    {
     "path": "node_modules/mammoth/NEWS",
     "bytes": 12171,
     "sha256": "bdbcbeaa95bae1dfa91a2f2fb8d0dc95d5317cac6b09f0725324b4608ef71ec2"
    },
    {
     "path": "node_modules/mammoth/bin/mammoth",
     "bytes": 1032,
     "sha256": "a622f9c8831310bc4d1c92749b3d35e3b654ee8d7b4e2eb54259fda4cae90ef5"
    },
    {
     "path": "node_modules/mammoth/browser/docx/files.js",
     "bytes": 304,
     "sha256": "3c9880809af2bc8485662667b8d20562c6ea3b504ddb4eb2f7bc635b9aeeaab6"
    },
    {
     "path": "node_modules/mammoth/browser/unzip.js",
     "bytes": 349,
     "sha256": "88bb0cb36ed990dc71b186dbf3a493a4dcd8369984b324ae2208ea21dba9edcb"
    },
    {
     "path": "node_modules/mammoth/lib/document-to-html.js",
     "bytes": 15861,
     "sha256": "5be590f92058512897cc96dc6aeee78834863ccd14b96b7ba1333845bf1c1ad3"
    },
    {
     "path": "node_modules/mammoth/lib/documents.js",
     "bytes": 6437,
     "sha256": "1a0df4ae1f94b43bac105cfad77a7b6d7cab96e335ec05521b9af3536f0702e3"
    },
    {
     "path": "node_modules/mammoth/lib/docx/body-reader.js",
     "bytes": 28262,
     "sha256": "69fa5528b3e6b0afb90ad426f60222921e1132977d0c96375a57b57f6f5763ea"
    },
    {
     "path": "node_modules/mammoth/lib/docx/comments-reader.js",
     "bytes": 976,
     "sha256": "5bb668b0c20bbb8811782b99a1c778589aea7ab7a6983d66d0244ca91de43a53"
    },
    {
     "path": "node_modules/mammoth/lib/docx/content-types-reader.js",
     "bytes": 1768,
     "sha256": "5c17d44ed357765aa18d40878dfc27b7205bf80a5aa256bc654b9dedb8bfd49e"
    },
    {
     "path": "node_modules/mammoth/lib/docx/document-xml-reader.js",
     "bytes": 864,
     "sha256": "f994322465fef91568372184e274b0fac9f7c6eff2672eaedac69941757563cb"
    },
    {
     "path": "node_modules/mammoth/lib/docx/docx-reader.js",
     "bytes": 8302,
     "sha256": "f0f96f96e78561665176a6c4b3b55df7ed21dc656bb9383a9c8d99d9bfeba1c8"
    },
    {
     "path": "node_modules/mammoth/lib/docx/files.js",
     "bytes": 2248,
     "sha256": "5a11b408a9bcf56e7ca11e9bfe0b403d9d6688e48e452cce7619eb20630c5159"
    },
    {
     "path": "node_modules/mammoth/lib/docx/notes-reader.js",
     "bytes": 984,
     "sha256": "958fe26314d4e75b8cedfff2e8a4b29b05cb1860b95823b1d8a6dff5fa1bce4c"
    },
    {
     "path": "node_modules/mammoth/lib/docx/numbering-xml.js",
     "bytes": 3623,
     "sha256": "1c65dd5256999d575212178f05ee2160aaf9fafcc6f473dab3e2c894b6499b0e"
    },
    {
     "path": "node_modules/mammoth/lib/docx/office-xml-reader.js",
     "bytes": 2454,
     "sha256": "72f1f41e54c9074b22c960357855857dea16231bea40722a920bc928d6c2ebbd"
    },
    {
     "path": "node_modules/mammoth/lib/docx/relationships-reader.js",
     "bytes": 1356,
     "sha256": "a0307641538d131cdf520f2c5d360404ff60a746630f4a48fcc64e15df938db7"
    },
    {
     "path": "node_modules/mammoth/lib/docx/style-map.js",
     "bytes": 2714,
     "sha256": "27337d30e7ed15957be14cb93b868221e7c6e3b31d64a3797682561ce428700f"
    },
    {
     "path": "node_modules/mammoth/lib/docx/styles-reader.js",
     "bytes": 2828,
     "sha256": "821c39f1ded8c2d61d90ba848ed49ff36d5dfe517000976342251e5cdab4c3a7"
    },
    {
     "path": "node_modules/mammoth/lib/docx/uris.js",
     "bytes": 596,
     "sha256": "eccc6620d9cdde9055bfd0b217caec01b74fbc7f1c9b23f45be5a060ce4b9a3d"
    },
    {
     "path": "node_modules/mammoth/lib/html/ast.js",
     "bytes": 1082,
     "sha256": "c96bfbb1fbb3b84d1a94d9f14c1e4dbb16928d154c5138576fe8e36c4d9e53bd"
    },
    {
     "path": "node_modules/mammoth/lib/html/index.js",
     "bytes": 984,
     "sha256": "fc8eb36474dc85c7aa98154ebfa2e0f722894b82b12d2d342f1319b779b2db66"
    },
    {
     "path": "node_modules/mammoth/lib/html/simplify.js",
     "bytes": 2019,
     "sha256": "f5daa8169ebf6be7fdd92d0c27b84be412798c18f2b29669cd3619cebd3c9507"
    },
    {
     "path": "node_modules/mammoth/lib/images.js",
     "bytes": 867,
     "sha256": "caf7da5007bba9f4ec0aa6d81a10daf273f01c3ec3a93538260b7c880a82a1d5"
    },
    {
     "path": "node_modules/mammoth/lib/index.js",
     "bytes": 3686,
     "sha256": "ca86526cdfc8b572e0637f61312e78d434a454c60ee39131bfcb719d7fdbe380"
    },
    {
     "path": "node_modules/mammoth/lib/main.js",
     "bytes": 2073,
     "sha256": "cb36279b0592f202496040f946f55356a6863951377c6b5688e668b5050e8d72"
    },
    {
     "path": "node_modules/mammoth/lib/options-reader.js",
     "bytes": 3497,
     "sha256": "e0030270cdb7d64bcf1aabd382ff69b8ac1e73b44572d6f1979736a33e3a3629"
    },
    {
     "path": "node_modules/mammoth/lib/promises.js",
     "bytes": 1120,
     "sha256": "4033c847437a3e034d7480831be9feeb962634e13d631a563d635f9a8a2b9191"
    },
    {
     "path": "node_modules/mammoth/lib/raw-text.js",
     "bytes": 456,
     "sha256": "1c02e81738b056456071a03e3205e142fe4c07c474b6cd794168c421e5183b5a"
    },
    {
     "path": "node_modules/mammoth/lib/results.js",
     "bytes": 1713,
     "sha256": "99555347dd5caff7f57a110ad2f16266cafe0ccf2ebe7ca38baa5426998b9bda"
    },
    {
     "path": "node_modules/mammoth/lib/style-reader.js",
     "bytes": 11481,
     "sha256": "bb2956ba0c304b62607025274604abceaa4b269d012dcac13c3b30e16a45ef43"
    },
    {
     "path": "node_modules/mammoth/lib/styles/document-matchers.js",
     "bytes": 2966,
     "sha256": "44cc23b1cd5c2089912163ae7b5da66c008260ddf284ab21e28cb2f269cbf812"
    },
    {
     "path": "node_modules/mammoth/lib/styles/html-paths.js",
     "bytes": 1911,
     "sha256": "40ced07c166dbf8d74225c9a331e097c8335ff0495dd851b22580b92f8cce8b8"
    },
    {
     "path": "node_modules/mammoth/lib/styles/parser/tokeniser.js",
     "bytes": 1156,
     "sha256": "dab7743a1917972f00616c42253d7a4b443f9f1e222fd6df4330a9e8b752e747"
    },
    {
     "path": "node_modules/mammoth/lib/transforms.js",
     "bytes": 1514,
     "sha256": "a15297cb64e09f5ebf49ba6b1726a92e6c412b140df9e1fae41e0e2720cc602f"
    },
    {
     "path": "node_modules/mammoth/lib/underline.js",
     "bytes": 239,
     "sha256": "e26a23dbbb981833c6949239db22578e4eb265e4318638161480ac9c02df20a8"
    },
    {
     "path": "node_modules/mammoth/lib/unzip.js",
     "bytes": 581,
     "sha256": "c14f31229c6e6280fe9d2ee24a0f3ab212c547921088a8e436f795b4687caf2d"
    },
    {
     "path": "node_modules/mammoth/lib/writers/html-writer.js",
     "bytes": 3505,
     "sha256": "73a28204e519bcb3ec137c21e9cab3e600f2c4a9682938c133d2ffb04bdfd664"
    },
    {
     "path": "node_modules/mammoth/lib/writers/index.js",
     "bytes": 329,
     "sha256": "9d0cd2a3ddba4792549ee32228536255be3afb11844ba8bfa0706162465ca5b9"
    },
    {
     "path": "node_modules/mammoth/lib/writers/markdown-writer.js",
     "bytes": 3954,
     "sha256": "0514786cb056e6f77616523e14f479390b057b1e6c940645df3eefc5b462b1fd"
    },
    {
     "path": "node_modules/mammoth/lib/xml/index.js",
     "bytes": 277,
     "sha256": "cf16ea96fd39383139d9f88c4c600b4917edcad5da90a0cdf4bda9877d7ccd59"
    },
    {
     "path": "node_modules/mammoth/lib/xml/nodes.js",
     "bytes": 1670,
     "sha256": "c78143c3b63efcc5e2b9d6d2f2c681bafeff8979e68e75b9c1dc8f4eba36037f"
    },
    {
     "path": "node_modules/mammoth/lib/xml/reader.js",
     "bytes": 1982,
     "sha256": "feb6b634ee0ffd42d7614e9b7d653017d351e7960eae1f5954bc59d957dc4f9a"
    },
    {
     "path": "node_modules/mammoth/lib/xml/writer.js",
     "bytes": 1640,
     "sha256": "3e6f3e0edc285c49a3ac13d89c87059ca108f9a7ed70d323ec162e54f382f61b"
    },
    {
     "path": "node_modules/mammoth/lib/xml/xmldom.js",
     "bytes": 566,
     "sha256": "d75c75e303ebd8bf126b5bb2bb7a2ead247f870d8eb01e0dbd0c37afb67231c1"
    },
    {
     "path": "node_modules/mammoth/lib/zipfile.js",
     "bytes": 1890,
     "sha256": "9eb35456e709d32769da9474c840d6eb9bf501e7a9920ea869d1387b22a9afe9"
    },
    {
     "path": "node_modules/mammoth/mammoth.browser.js",
     "bytes": 884760,
     "sha256": "d5cfd45fda6292d6955bc538b7ac95357847f9ab0794fa501839c878397ce60c"
    },
    {
     "path": "node_modules/mammoth/mammoth.browser.min.js",
     "bytes": 635882,
     "sha256": "5d4c0e7c9165d70b78f789c5274a2c7846d9e1c06ec19b69afa6ef45f789a3b9"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/LICENSE",
     "bytes": 1079,
     "sha256": "c8442419dc614089ea022b3da6bfc089b41a58fb7b9030d1e651f2f36189dce2"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/index.js",
     "bytes": 59,
     "sha256": "190d2c0b07376e8dd3bbf2001b20d27b8929245b0b731d79e222edb0944f58f5"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action.js",
     "bytes": 4659,
     "sha256": "773b4e9300210321067744f4023cde58d299de00fb87e9e55ddbcd78978a525c"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/append.js",
     "bytes": 1565,
     "sha256": "f5750834298717715d5e7b9e3f32cbe81d6d7a33ef74dad82915c53d7c0e13f0"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/append/constant.js",
     "bytes": 1430,
     "sha256": "5f8f444bdd4acd75659eeeaadf6b14bd60b33c7d6f7c19797c4bf8c87a742c71"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/count.js",
     "bytes": 1036,
     "sha256": "3f9c9c87f0d880101e7957436eb876a2b9352f40d0f9b19b34bf597ba90b6128"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/help.js",
     "bytes": 1120,
     "sha256": "4a802a6b28e77c44af2ca359370b4674e19ab36eac8b512785c6867971c11da9"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store.js",
     "bytes": 1350,
     "sha256": "3ed24a4d6d56e50d972e82b866ade25192e004d08d55cb4d5a17bf3a7c239b1a"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store/constant.js",
     "bytes": 1332,
     "sha256": "260804d0d1019d89910ca2f861af4f21c41d132ffec692fef40052db28efa827"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store/false.js",
     "bytes": 704,
     "sha256": "92aed2410134bf56b27f29250cbc85a4617a956539ece74ce1c579e9830587ef"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store/true.js",
     "bytes": 693,
     "sha256": "abc51942ffc474caaa5a8c7f2bfd7363963955b131e0574657e012d14818c2b9"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/subparsers.js",
     "bytes": 3590,
     "sha256": "6c3f8933c4e526f2cab647a77f222e282f8fd72c6da774e5ae6e1fb9cea666f1"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/version.js",
     "bytes": 1244,
     "sha256": "02ef8cd757582d809cf163251f16e3915f548f1d3b8e97c3aa9f206751627c27"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action_container.js",
     "bytes": 15055,
     "sha256": "4d594dd87587d58d3cada83e0d3bc105fbc9f48cab72daf72d8c77632bc5b9ab"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argparse.js",
     "bytes": 618,
     "sha256": "33c1269d0e69f0bb3f5cc54dded402d0e1abcd2b7ff39ef6956234bd29de0757"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument/error.js",
     "bytes": 1183,
     "sha256": "2af0d562361cc46b5958d87edef28f23661903674e2484f7347057d3d45fa251"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument/exclusive.js",
     "bytes": 1589,
     "sha256": "cd81ce86f7e98ad6699a4d3ee86abdbdd762db25b03c4a7ad8521a64bd5fc5b2"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument/group.js",
     "bytes": 2330,
     "sha256": "4cab0c3ee28ac94fe0a37c4cffb6cb27c675b8dd7f266268d5107083141425ec"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument_parser.js",
     "bytes": 35223,
     "sha256": "e9158c6cc41fd1b8525cd061362f4df7f175bc7767db6e589a1d17daf3ced276"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/const.js",
     "bytes": 340,
     "sha256": "719d122368d1ead2b1027e54bae88920f2334b552ebc72054698630a87e24c0a"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/help/added_formatters.js",
     "bytes": 2647,
     "sha256": "204100289ecc4ecfe0d61cd98839e39698d9b2b0347db7d91dbcf3485649aeb5"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/help/formatter.js",
     "bytes": 22025,
     "sha256": "dbe0569259647ae9b8a8fe7db70b542219027ec7d7b7a80e6edd973fd01ee19a"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/namespace.js",
     "bytes": 1824,
     "sha256": "b8a67a6abf6043d22a2a7976d1ff8476af62ee413349eb330e4798de8d798afc"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/utils.js",
     "bytes": 1281,
     "sha256": "4a1146a5ae0694946b7063779c1522c95439050e41bafdd2a703c785625fe0c8"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/package.json",
     "bytes": 638,
     "sha256": "48b848e56c31eda738f76fb8573ae1fe0012c4b1ec9d9cfe8783517a142e9531"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/LICENSE",
     "bytes": 1080,
     "sha256": "8ad16994acb18814fcd2ff6d0b559906b842047b995baf33fd0c55e4d24cbac8"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/appveyor.yml",
     "bytes": 350,
     "sha256": "61c5843bd8738abd5dccbf2ee22f09bb3535c34c25f2c56db52c61578a3e0ab8"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/Utility.js",
     "bytes": 2149,
     "sha256": "8905bc5d2bf8f61bc5085bd218fc861d30a1346871722573c415443cf32aaa05"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLAttribute.js",
     "bytes": 1149,
     "sha256": "3c5e80221fa9a96fc4144addc1be177bcb8669f41daf3e666718ef7e70089857"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLCData.js",
     "bytes": 1031,
     "sha256": "4b82373fb3ba1e3c1867f8066bb7db8acfbc76645da5d607088833509e5a691b"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLComment.js",
     "bytes": 1053,
     "sha256": "016eebc46a08fc7089ddd261d0596eb5b86942d35fa8501bb70fe14954dd26f5"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDTDAttList.js",
     "bytes": 2244,
     "sha256": "be12abc3cbfaecb705516ab22dbbc1707d0e16a83c737599223866fa8d96b7ec"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDTDElement.js",
     "bytes": 1202,
     "sha256": "9c0c2bbd4ced69c61d97fdac3d34f7029cf909accf758a5c8b43b5a95b604b17"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDTDEntity.js",
     "bytes": 2124,
     "sha256": "8fe9ef1c5d3679f18cb4ef3d583ffad2164bed1daeab2fd82446f60c772244fc"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDTDNotation.js",
     "bytes": 1381,
     "sha256": "8a6800bff9b96e3308f1b6d3b6fdfec0fc20e215a7edcc0f62dc9e0bc5355522"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDeclaration.js",
     "bytes": 1399,
     "sha256": "846ad092eef7526733a39e661c634c90f399fa642b65c27351a9539cdca9e892"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDocType.js",
     "bytes": 3399,
     "sha256": "b845b4fc4097f625530eae8ed75da771799e0d99fc9ccd95a2700ab0b16eba2a"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDocument.js",
     "bytes": 1591,
     "sha256": "d690ecced49b47795f4bd446c2cecb6946f034ada6547f446f26799f9a8c11d7"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDocumentCB.js",
     "bytes": 13039,
     "sha256": "2fbb3305da2c14604a1cf0d90e5f1da2ed4344724339526b5d5007dcf31055bf"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLDummy.js",
     "bytes": 862,
     "sha256": "43d0ef068bf8f60a1ccd86da161976eee8533b48c1261e0b07bc938c6663500d"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLElement.js",
     "bytes": 3472,
     "sha256": "d0ae25a34e82311927c56c853432fb9d1335edc1baf8b2ca5130268499c323f4"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLNode.js",
     "bytes": 14628,
     "sha256": "2a2597699300eebd23ac567bc332f3d71d35912c2e09c73f9964cfe8d1ced8d7"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLProcessingInstruction.js",
     "bytes": 1282,
     "sha256": "5a19762a2c0ca78f43ba9f2961b67c6de4b84159feeca80dc2e673a03fbf297f"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLRaw.js",
     "bytes": 1010,
     "sha256": "267d9454411ebf47a19e1e9151996bd73a3e1762ba44b5171b8d0fbbf6b120db"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLStreamWriter.js",
     "bytes": 10470,
     "sha256": "22ee6284af1dcc437c1b32bf9384efbef1aff851b58201f06c14f04200ce1c99"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLStringWriter.js",
     "bytes": 11624,
     "sha256": "0e58f6fec24923cd196203c94d9107f9b89113722a26ef5ed7d6dd8e82be4283"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLStringifier.js",
     "bytes": 4596,
     "sha256": "0a7ce99c2b8cf9371691b60cd1f3d0b2f8f18e0462c89e5800dcb4a3bd220be9"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLText.js",
     "bytes": 1027,
     "sha256": "64d9ea98ff7257a25dc779131454b995e9ea4b9f30fa4a3eb7e0fd3a3fc995f9"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/XMLWriterBase.js",
     "bytes": 2888,
     "sha256": "808a2351bf6aaced0900a1a232abcf1af574dfd822b20fa713e3c1e69d0d6309"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/lib/index.js",
     "bytes": 1463,
     "sha256": "7a07804aa2c1cc10a478e22a9949c3c1490e168ae8ac1a2c510d9eafc0707200"
    },
    {
     "path": "node_modules/mammoth/node_modules/xmlbuilder/package.json",
     "bytes": 872,
     "sha256": "d4b3e78b4745ddaf746ded56d100c96fce674e80195bf0e943480b164583f01c"
    },
    {
     "path": "node_modules/mammoth/package.json",
     "bytes": 1507,
     "sha256": "10ec1fa953a258ef6b6c883abee0301d2a66d3ca94c1b59c4e5d2f185fe8978b"
    }
   ]
  },
  {
   "name": "read-excel-file",
   "version": "9.3.1",
   "integrity": "sha512-yzC1vJ/yl3PGJfCDrOI6/rBagF0bRm/CK1NTNXYdomB+13mDB9SFyoRibsDXxDAFrwCANfuRqzuUWDljkkSEuQ==",
   "specifier": "read-excel-file/node",
   "payload": [
    {
     "path": "node_modules/read-excel-file/.gitlab-ci.yml",
     "bytes": 206,
     "sha256": "28ea97bf6ce3617e1325c774123f05caacdcc8307436653aa0e8d24377b30616"
    },
    {
     "path": "node_modules/read-excel-file/LICENSE",
     "bytes": 1103,
     "sha256": "8cf9b31947daf7adb4a7a00a037459e58241af050cd0a603bfcf1756e533f75e"
    },
    {
     "path": "node_modules/read-excel-file/browser/index.cjs",
     "bytes": 633,
     "sha256": "daf81f36ee6aa7013ae299241f8346e281ff5dcb1f49e9769d1cd79786eaf68e"
    },
    {
     "path": "node_modules/read-excel-file/browser/index.js",
     "bytes": 535,
     "sha256": "983e7a05824860b6e4b8a6736f249ea88cce86978dd5936ec3fa3d6d935085ee"
    },
    {
     "path": "node_modules/read-excel-file/browser/package.json",
     "bytes": 345,
     "sha256": "c977275b88b2e36906d9d380056ef8637aa1419a369b1bfff6d0a44de9372ddc"
    },
    {
     "path": "node_modules/read-excel-file/bundle/read-excel-file.min.js",
     "bytes": 37686,
     "sha256": "9f2c26e44c7fdb69d8ea70f05e44eb64de152c084e15d245b114d0f8cf77db73"
    },
    {
     "path": "node_modules/read-excel-file/bundle/read-excel-file.min.old.js",
     "bytes": 26889,
     "sha256": "b8415c50bdcbd9e167b668689a1a5558dc1cf9199e403fb75a1a3f2ccb7f5ee4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/convertInputToNodeStream.js",
     "bytes": 3300,
     "sha256": "1a8590c6ab6fe1cebbd5e18d16539ea65f138dd105cf4db628a56d4d2812d5e8"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/convertValuesFromUint8ArraysToStrings.js",
     "bytes": 874,
     "sha256": "a7b16d8637eea8c4b3374ea57c2331aa71a63bb723b44fc8594bdfce64ab8f3a"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/filterZipArchiveEntry.js",
     "bytes": 632,
     "sha256": "5130c9a0d34827bea44eb8b9b8046017d14c61b86f1a5e1055e79e63761724d7"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/parseSheet.js",
     "bytes": 3267,
     "sha256": "9b9d1693678c04d3f125d6f707c4f0c77cb38e12b517a37b33759631b31b4436"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetBrowser.js",
     "bytes": 1302,
     "sha256": "78cf8750b1387a98667dc33352a5c439d3c7159edfc3491118b0fb388583b092"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetNode.js",
     "bytes": 1296,
     "sha256": "f71e4406e5dd580e171a7c1ff242ad4ee56d2df362b7d94cb21f5c75e4cdde09"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetUniversal.js",
     "bytes": 1830,
     "sha256": "9abd210eb62c7805adb57965de5015558636f0bb70e9a46de4ea73ad8e279fa8"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetWebWorker.js",
     "bytes": 1638,
     "sha256": "292e3da3d097e8ae7c38ca544f177b164c1d75c6eebf885306bd291096408bd0"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileBrowser.js",
     "bytes": 1029,
     "sha256": "535ed2aa4167d4ee88ca6e589b4b3bafaa33c681cb4543ae21236690604eb2e3"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileNode.js",
     "bytes": 1018,
     "sha256": "ba68d83715e7424bba9eaf2870fd08ddf44ea1800bb1a77acb67555ef50f963e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileUniversal.js",
     "bytes": 1552,
     "sha256": "257c4a7584de59f99b45a197062b77920d34b2526728449944fc610e386d2fd2"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileWebWorker.js",
     "bytes": 1358,
     "sha256": "e9d1be8e05f5d5776404bd949afad955ef0969f843c5256d452860c869494d1a"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileBrowser.js",
     "bytes": 4425,
     "sha256": "37040dacbafbbf4e4864889552ab54c12729388263bafbd2b4d3d3bfdd9fb2fb"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileNode.js",
     "bytes": 2820,
     "sha256": "d1cf5446893716f289eb6d4c951c520b16cfee51956986c0b3f432d911b8c99d"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileUniversal.js",
     "bytes": 3008,
     "sha256": "58fb3fad5f3996e9ee284a772d558df5428aa1198491f41256c8e41fc5576125"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileWebWorker.js",
     "bytes": 463,
     "sha256": "57e0cff84d4752a21824bf2bbb35db0133727d5dd8ef846c130ce8c76839db68"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/package.json",
     "bytes": 81,
     "sha256": "8a8b3c2a546941e9214b5183dc494a2dfca78dab5cadbe8422652c276cd73417"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/InvalidError.js",
     "bytes": 5528,
     "sha256": "0abb50eb10c9cb6d53a19cbd7783b2f2633094009f1c34ead5034edbb878c598"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/parseSheetData.js",
     "bytes": 33083,
     "sha256": "f6231699fa78624ff412fc49772a256c15f83cb89d615694c36238e9bb42ec7a"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/Boolean.js",
     "bytes": 467,
     "sha256": "f218314154a17f19ccc4a86f60e72fd67043cce42fb3e8af2728cd27b710a55f"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/Date.js",
     "bytes": 733,
     "sha256": "a5c1301982532c154b646eabda8ed5b8f48e5594d2443e3e4d334c6f4f1bd95e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/Number.js",
     "bytes": 1457,
     "sha256": "2b776b393cf3fa7e5e22a8dd42b24b574156b851b57a43842bc6a398762115ba"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/String.js",
     "bytes": 1467,
     "sha256": "4a8b7f52d60b117edefaba7ff5dad3e9bb970ec0c44a1fb7baa2d3a7fe2c0ef2"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/additional/Email.js",
     "bytes": 697,
     "sha256": "b7f1f620e620d598f8bfaa45d8fcfbf5f79cb5b8df896d4af1370febd477d320"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/additional/Integer.js",
     "bytes": 745,
     "sha256": "22e8ffaaa93b19af28a4038b29b19a6d990baf2492add2c7ff8949c14cf05a19"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/additional/URL.js",
     "bytes": 1936,
     "sha256": "4c10ac53196960357862ff6b38d5c7c9d789df17455376d5751e175daa3f62bf"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/utility/checkpoint.js",
     "bytes": 1296,
     "sha256": "eb833d2bdd3a49d541f4d31204a54e9134eaa35b3bd6dc58351fa7464fcf420a"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/utility/isObject.js",
     "bytes": 486,
     "sha256": "e3a9eb77c3aeb944095917f6dc7fbac4a9c3be99ab2a95ce2f36a2adc220e273"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/utility/isPromise.js",
     "bytes": 805,
     "sha256": "15293961bd4ca321009075109b632ea426d3ef4d6cbab7d8d3c2765193a3b437"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/convertCellsToData2dArray.js",
     "bytes": 4858,
     "sha256": "10c7a8884c1e19f819b5d3ef464dba41be8bffaf5c4a14298ae39096c2b26432"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/dropEmptyColumns.js",
     "bytes": 2156,
     "sha256": "5dc3fac7bf931fb17a320f9cde335f0dbd5b854ce4a330742aec34809436e946"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/dropEmptyRows.js",
     "bytes": 2283,
     "sha256": "b60e5c382c9a9b393916d9287f3cc19a31d81c140f7c639f11c087f0a296e9a4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/isDateFormat.js",
     "bytes": 5449,
     "sha256": "207bb94105e06ccd019511879f5cb40547f18cd7488449bef49bc3458a1893e8"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/isDateFormatStyle.js",
     "bytes": 5874,
     "sha256": "727b6fa3517df7e4ee7d9cbc596bb8a2a918d63ac808c47dfda701b3a46c3502"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCell.js",
     "bytes": 5930,
     "sha256": "fb932385248c99d162e330b1b1247799782bfd2894acb2c51c02c3b471ea598b"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCellAddress.js",
     "bytes": 3134,
     "sha256": "245cdf4f46be1959afd4f50a91ba5451fa2233ecbaad52159063fc03dff40ccf"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCellValue.js",
     "bytes": 6935,
     "sha256": "e795f2ca3b799bb2cf68a875211d21fbaafacbf4b80c8f141eec1e2a5b65db58"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseExcelDate.js",
     "bytes": 8298,
     "sha256": "bbbdbbbea2c5d011e0c0ba9fae24ab1eb176e98a26601ecdfa2ef80249300a80"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseFilePaths.js",
     "bytes": 2909,
     "sha256": "3feb7fe9160f003e907c8d4389b9893deaeb7d1e8c091722c8948341596b31d5"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseNumber.js",
     "bytes": 699,
     "sha256": "cc9be9591325bd280ac06bac882a59ccdbae5bcdeb15bd061be8d00e80d84251"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSharedString.js",
     "bytes": 2868,
     "sha256": "4d90f92604931a1b2c8a6188014264abd2ac71da5be741df46bab8086594850a"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSharedStrings.js",
     "bytes": 1727,
     "sha256": "21d631488b3e329d2cfa9246ea4fd9424435c56a586e4edbbe56befa474f02e9"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSheet.js",
     "bytes": 6919,
     "sha256": "acb0a2fd9789f87c35080caf0047b3b15ab0f569f1210858260a4da5e814d99f"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSheetData.js",
     "bytes": 3862,
     "sha256": "d6b332f0f4b398a5449d74f9d2a69f798ca0388b255c0b177e01d4e6aba25e9b"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSpreadsheetContents.js",
     "bytes": 18147,
     "sha256": "691f17eb0f3713203d121bb8945a340ee775952c931bc26fa761d6f9817b6175"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSpreadsheetInfo.js",
     "bytes": 3106,
     "sha256": "ec5ebce9d29a1cf2e2d1bdbc5cd02cb83b9966bb375717050126617dbb0748cc"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseStyles.js",
     "bytes": 6760,
     "sha256": "627499bacd038c05c2072c9f50b660bbe6f895bf5db7077f86b2442933e1744f"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/reconstructSheetDimensionsFromSheetCells.js",
     "bytes": 760,
     "sha256": "b9f9ae6ae1b3891310ec9d7b2c94cc019edd659ee3de9ebe41efb0bf31107415"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/dom.js",
     "bytes": 3325,
     "sha256": "a5a127e44681b4fac1c0f81e63830b84c6a43ef505e8b55d60ab02545cdff19e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/parseXmlStream.js",
     "bytes": 449,
     "sha256": "3148b0ae47bdf44ae26ffa6267c1eaba9f516c91eb3ca0a832e0ddf711441805"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/parseXmlStream.sax.js",
     "bytes": 3621,
     "sha256": "dc235617a3250dac191d4ac82f8f529b17f6e38286eebb6721788a24b44f95f4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/parseXmlStream.saxen.code.js",
     "bytes": 26219,
     "sha256": "cb6381028744196b21b28de4440ba225324d70614237f30897285d7354968c4b"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/parseXmlStream.saxen.js",
     "bytes": 3147,
     "sha256": "8fc1363e6be9aae45b2c1cef3d21227b86b0b351917af7b5b34af31938e6850d"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xlsx.js",
     "bytes": 5963,
     "sha256": "8325b63c8ef070d49f141b13981daeb8267f451b8dd1f686a8df8fd8b472fcbe"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromArrayBuffer.js",
     "bytes": 2591,
     "sha256": "f3f2df7fe81972fe1cb79ceffa68ac3bdabd493a0d18001b37aace02ee0fb8bf"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromArrayBufferSync.js",
     "bytes": 1585,
     "sha256": "307b7440148d2ebac744e4418c2384029f2405d7f72df14d8a114179db68ae08"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromStream.fflate.js",
     "bytes": 16401,
     "sha256": "d2b0118305a17b5c245a655248ee2f27d17fc26db5bc5d701e6f9b4487462132"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromStream.js",
     "bytes": 462,
     "sha256": "9b6a96f6599303100e745ed79eedb1f4e545fd438b67b6553f61b2a94ca088da"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromStream.unzipper.js",
     "bytes": 5420,
     "sha256": "b51e8fc1d679d19118be6c2553dfdfee7509ab6766655bba9fc782d8f96acfc6"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/convertInputToNodeStream.js",
     "bytes": 1499,
     "sha256": "d2c2d7fb4b0118751c387e45651c62abd01b4128c4ca183ea6a96b743ae97866"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/convertValuesFromUint8ArraysToStrings.js",
     "bytes": 597,
     "sha256": "2f672bd336b3e4395ef1a0a3b0b46cc4748c9eb2e93ddb5615a2e2cdb890ff68"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/filterZipArchiveEntry.js",
     "bytes": 523,
     "sha256": "c2c64d870f2c1e3838206a28c90229b10e7608327f8674c0c3ae426225eb39d9"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/parseSheet.js",
     "bytes": 2982,
     "sha256": "3d2cbad8551f0cfc352c9faff4905cc5ef02cd5a8f6bd535c099f69da0219f57"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetBrowser.js",
     "bytes": 963,
     "sha256": "c429fd450a943acc6413dff6a5b628952d9ff4f6ef8b2f361ee2fdd8e49f2c20"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetNode.js",
     "bytes": 963,
     "sha256": "f3beabaa7f3d750b6ca7917fd491efaa8885fe39dc5471a3f28a98cee6d4488c"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetUniversal.js",
     "bytes": 1488,
     "sha256": "66c142e01936ca9b20f33b07387152e3f66b925966ed0837aeb368b2054a64f5"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetWebWorker.js",
     "bytes": 1300,
     "sha256": "64e6c99ad05b6f9a3d66a3579fa91804d0e505f487856a1f966d466cfa2b3acc"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileBrowser.js",
     "bytes": 687,
     "sha256": "2cb09cdacaf7df7cc51070079e157c639a90f26f5076bc2b78e6885b455185e8"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileNode.js",
     "bytes": 682,
     "sha256": "8961f7bf5fcc6993393a212ccb904710e8a586c79acd70978fb3f54c9f47fc1b"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileUniversal.js",
     "bytes": 1207,
     "sha256": "f02949589be5e3f7b9513ac1cf4c33e8d347976be34d516f8ed6cfe3a87d2766"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileWebWorker.js",
     "bytes": 1017,
     "sha256": "616cdb158f0c32d3f7ffb66a4ec8db656b3f2b765d32c22a0fe388d8810072fb"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileBrowser.js",
     "bytes": 2591,
     "sha256": "8529ca0653ac489298a15f05dcd5bdb66a6f9cf932f8c4ad910e3af86c19c517"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileNode.js",
     "bytes": 942,
     "sha256": "79fca1f73ab974080ea1edf5e04567137227caef3d9f4f480a5f9423f943284a"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileUniversal.js",
     "bytes": 1175,
     "sha256": "a835fe91b5a537301ea7847a43db619dec55d6c2d4828b0e69dc191f78cc16d0"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileWebWorker.js",
     "bytes": 351,
     "sha256": "6c02f29562dd56419ef96a1ad2b43bddf28ddf996570fa349df33949f4b831fa"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/InvalidError.js",
     "bytes": 5434,
     "sha256": "dff099bdbe6c2ff8ed70679f47a2204141f8274d08bd92aa5decdea0fec48f50"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/parseSheetData.js",
     "bytes": 32448,
     "sha256": "2754624710c5181d31e0897942cf9a9c289533aa1f378eb467242625f15efcc4"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/Boolean.js",
     "bytes": 230,
     "sha256": "024ff8ff1099c19e558f7f72b7ab215f57199b1d4298fdae4c4136d9ca08aa9c"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/Date.js",
     "bytes": 487,
     "sha256": "a5948bcfce180472bcb177923bec3a0493b6aca8b457152f1029a89beaca511b"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/Number.js",
     "bytes": 1185,
     "sha256": "2867c4eed648028967d699ee5336bca3ff308c48cdacaae9643c1cfe55dd49b8"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/String.js",
     "bytes": 1207,
     "sha256": "f0d6e0ae50ae4c4fc1a4961f8d4b6be067baae5e38cdd03ba4745f3db726091b"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/additional/Email.js",
     "bytes": 434,
     "sha256": "da55764c75bf9fee49d0ef9a6f574a5fa394aa86b9c9489ef8b7265ae160edc8"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/additional/Integer.js",
     "bytes": 451,
     "sha256": "203b9cf151514cd18fcf78da40a093ced152581a5498217fc5efb4bf8198131e"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/additional/URL.js",
     "bytes": 1679,
     "sha256": "6247b81c488c58d9de65fed6dbce3e9c7e2c0c9550e98d17627843b0e7c08aa2"
    },
    {
     "path": "node_modules/read-excel-file/modules/utility/checkpoint.js",
     "bytes": 1053,
     "sha256": "e1c0e4d5e7658b8dfe3de228d0ab7c748499333fc542b8f624441ea98829adea"
    },
    {
     "path": "node_modules/read-excel-file/modules/utility/isObject.js",
     "bytes": 390,
     "sha256": "1824e7a78908fa18703a20038af7481663d5298dbe46e4e0c1a4ffe842e7cd30"
    },
    {
     "path": "node_modules/read-excel-file/modules/utility/isPromise.js",
     "bytes": 708,
     "sha256": "57ec08e9beda1a49a41dfd8e9925c1a9de78f49eb0bb496502c466b70e7384be"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/convertCellsToData2dArray.js",
     "bytes": 4557,
     "sha256": "0932a0a80cbb9f3d5c227c6ec2ff8931c249ba5bf27cef052a86072f78f684d4"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/dropEmptyColumns.js",
     "bytes": 2052,
     "sha256": "e65e29b4e578cf8b5361c0bf957ede817e504551303889a2f8ac234478500cc8"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/dropEmptyRows.js",
     "bytes": 2182,
     "sha256": "b1178c2441561b3368fffb85cbd71e937d3d14e3a739691a1b7a2a4855383777"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/isDateFormat.js",
     "bytes": 5343,
     "sha256": "22a92b561d8cb2dd4e88f452a1f977d478c70e5838cc510be6524f7cfe527c24"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/isDateFormatStyle.js",
     "bytes": 5626,
     "sha256": "9b754497022997085e9c836cfcd771b00805ad861770c6941af695716de64b03"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCell.js",
     "bytes": 5486,
     "sha256": "1c950994d3881b9adfacd3f27c6aeb85664243797379647111a7ded726a32e90"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCellAddress.js",
     "bytes": 3030,
     "sha256": "d189039cd0391bdf992f13e55edb92d661c2fac59557573864b6512b86a58fa3"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCellValue.js",
     "bytes": 6589,
     "sha256": "05c9f0913cc48d8e65b4ef4a514fed52a54c8f549ce8904d1a0e4363b1a20508"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseExcelDate.js",
     "bytes": 8196,
     "sha256": "9be257c1c968fd9d4b8d49b9991b94abccaa2bdf48ad84c5a4987231597be7ad"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseFilePaths.js",
     "bytes": 2807,
     "sha256": "d200717932e4afabde962af754f038d17ece02eb03a0d9472c537e79eb619067"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseNumber.js",
     "bytes": 600,
     "sha256": "abb1fc2c122aa4f6f97a10a61313af862eb52f5a329631386644a3a005cc588a"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSharedString.js",
     "bytes": 2566,
     "sha256": "41013dbe74e5784f01d37769ba890255137bf436505789f7a725c7b369ec077a"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSharedStrings.js",
     "bytes": 1614,
     "sha256": "caa20828148084af7d7be39ed92381cb3a3d0e5a0edee7f355e8168495f9162f"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSheet.js",
     "bytes": 5096,
     "sha256": "6d72bbf41a6f8cda579ebdc06478d57cdc2664417927e6439139319761a7834a"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSheetData.js",
     "bytes": 2064,
     "sha256": "4f06a1f991f5c7299f1c7d79ea1512eeb494e27cb525a9767cf4fd3908dc75be"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSpreadsheetContents.js",
     "bytes": 16405,
     "sha256": "6aeccdd96ea8f7e2ab414d36c1cd35533a17c4b4592e150e0fbceb17763ec6d7"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSpreadsheetInfo.js",
     "bytes": 2998,
     "sha256": "601991248d6de2d18c2540cbb4e6add01a85f80f58d69490d3ccab4d0f14d293"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseStyles.js",
     "bytes": 6661,
     "sha256": "c8779054c8626d8d05f82982121937203916e54b15626ae79da6b05597eea3a5"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/reconstructSheetDimensionsFromSheetCells.js",
     "bytes": 632,
     "sha256": "49d7e22edda220012f290441b4db8040bef7f660c333bd20a1ea5a0fd511364b"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/dom.js",
     "bytes": 3035,
     "sha256": "004aa2a0eeafaebf15666d831b453a87371f448fb620417f69eade21282ccfe5"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/parseXmlStream.js",
     "bytes": 997,
     "sha256": "1706cd8917c75e8032419141f8fecb9ef7a9c5676ee4c4ab468c0aa7b8b17ec8"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/parseXmlStream.sax.js",
     "bytes": 3356,
     "sha256": "9abc5e340de280238581e1446ff58c246bd15fe4e2d6df0457bf478f8b774db0"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/parseXmlStream.saxen.code.js",
     "bytes": 26121,
     "sha256": "ac0b7bca3ebb1c341648d3aedf509e88f541d8f3710b667a1fd2098862262576"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/parseXmlStream.saxen.js",
     "bytes": 3039,
     "sha256": "628607431275ecf50b1dde2c5bfce21b68fbd36e3d011491895c02b629b2ccf5"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xlsx.js",
     "bytes": 5327,
     "sha256": "f92a7eec761de66dd0ecc76d76439b88ddc938b0b3e7f19f5b2e245ea8e84272"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromArrayBuffer.js",
     "bytes": 2397,
     "sha256": "08f16470d62691133f879e669abaccf0a0ed34d34c5ae49a840c013ee77472be"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromArrayBufferSync.js",
     "bytes": 1454,
     "sha256": "ab97bd322a89fe7a75f6b4239bbb97d649b5059f8cb5aaa1b591726846715ee1"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromStream.fflate.js",
     "bytes": 16119,
     "sha256": "6fcafb3970e3a8b2123e90cc6dac684993d790b44dd074b2a75182476921af5c"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromStream.js",
     "bytes": 4051,
     "sha256": "6cb6f2a4c3084750fb2eb1fc19032d83b8934c5c375563ccd5ebc61845f20893"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromStream.unzipper.js",
     "bytes": 5286,
     "sha256": "7173aacd95df043b9b941b158c67efae1273fe1fadc0af87551e591909fbe81e"
    },
    {
     "path": "node_modules/read-excel-file/node/index.cjs",
     "bytes": 624,
     "sha256": "a2007ede75221ca661c1208edf336299d128b98b155d07aa4aba1e515d01e2d6"
    },
    {
     "path": "node_modules/read-excel-file/node/index.js",
     "bytes": 529,
     "sha256": "7bc99af654b46cb5d3e6b35980abb4a79aa3ca78cfa247832344b87f46ad9cbe"
    },
    {
     "path": "node_modules/read-excel-file/node/package.json",
     "bytes": 342,
     "sha256": "31f7905db00a44adde4d9bf29e5f64f3dab9929851f8daeafc7b7f67dccb0e60"
    },
    {
     "path": "node_modules/read-excel-file/package.json",
     "bytes": 3160,
     "sha256": "5efaa605dc91a26a7833f8ae351318ef70c7ab3bb18d808a8cc8d553add01584"
    },
    {
     "path": "node_modules/read-excel-file/universal/index.cjs",
     "bytes": 639,
     "sha256": "f1268e8a4bd3005db8925796100e5b873a0945a204030b6b3b923c35b9ed3d26"
    },
    {
     "path": "node_modules/read-excel-file/universal/index.js",
     "bytes": 539,
     "sha256": "942ced4c4cb994d0c6927e21d2da5441c2b379304b87836d553b880651dda0e6"
    },
    {
     "path": "node_modules/read-excel-file/universal/package.json",
     "bytes": 347,
     "sha256": "7fb6e340f86bb7368b09579dbf54db8ed18f9a0465b29790090b0ee8e4fa5d49"
    },
    {
     "path": "node_modules/read-excel-file/web-worker/index.cjs",
     "bytes": 639,
     "sha256": "b789a568f31305d0c6af928abc6381f7b638ca4c661e25424610e081889d3518"
    },
    {
     "path": "node_modules/read-excel-file/web-worker/index.js",
     "bytes": 537,
     "sha256": "64fbccb192edefffc13ef920d514ffece4900d50c467ac68075dd8235bd26fca"
    },
    {
     "path": "node_modules/read-excel-file/web-worker/package.json",
     "bytes": 348,
     "sha256": "25d1505b0639097e39543940204ac893ff08845b4df5fdcc6d3eaedca1eaf36f"
    }
   ]
  }
 ],
 "local.bob-code-consistency-review": [
  {
   "name": "cheerio",
   "version": "1.2.0",
   "integrity": "sha512-WDrybc/gKFpTYQutKIK6UvfcuxijIZfMfXaYm8NMsPQxSYvf+13fXUJ4rztGGbJcBQ/GF55gvrZ0Bc0bj/mqvg==",
   "specifier": "cheerio",
   "payload": [
    {
     "path": "node_modules/cheerio/LICENSE",
     "bytes": 1081,
     "sha256": "61c1e21d3a8ff20f9b69abe15104a75584688080febc22f60a4cbf3854becf4e"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/attributes.js",
     "bytes": 20215,
     "sha256": "89620b464dd95fcf9c63781320f039fd41771ebafd783af6e86a80dde738a146"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/css.js",
     "bytes": 3187,
     "sha256": "3bd12911368c6050dce487f0d9b7f968667acaa8f444079f59cbe7230a71ecd5"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/extract.js",
     "bytes": 1479,
     "sha256": "8f7d64a42aadbfd6425d99eb3c8403d57e9d3b642a2828458f76345a5614fb97"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/forms.js",
     "bytes": 3103,
     "sha256": "ebd229e85d8084206668484e0dd6faeb04c9b7755e62a3c90a485563c7e1e848"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/manipulation.js",
     "bytes": 24918,
     "sha256": "877dacf83b86235653955b788f6dc9bd628f3e26a36fd3a327116bfa55aec7fd"
    },
    {
     "path": "node_modules/cheerio/dist/browser/api/traversing.js",
     "bytes": 24708,
     "sha256": "408e7c2bf26afbf64efb285380f4911489f7e0be7cb151a4b2c86b98a60cbf4a"
    },
    {
     "path": "node_modules/cheerio/dist/browser/cheerio.js",
     "bytes": 2013,
     "sha256": "58fc2469df9fbdc4217db17b6f2a2993fc6861aae11697b04f1d608b8496d9c9"
    },
    {
     "path": "node_modules/cheerio/dist/browser/index.js",
     "bytes": 122,
     "sha256": "c6d78ab54623001a3bb2a6ae4942cd4af04ceb44bb8ef4df23317ee6373d2794"
    },
    {
     "path": "node_modules/cheerio/dist/browser/load-parse.js",
     "bytes": 1354,
     "sha256": "9e6d9e2d9fc3a8f321816e9d2b974c9048644875e902a31400700bdfe6ae0a0e"
    },
    {
     "path": "node_modules/cheerio/dist/browser/load.js",
     "bytes": 5588,
     "sha256": "ae6937526f54c08cac2b4733008b0cfecd12f6900e17e7960ffa8d344da83586"
    },
    {
     "path": "node_modules/cheerio/dist/browser/options.js",
     "bytes": 901,
     "sha256": "9819b83080b190e2bdf2bd98e2763a29fcd5af9fffbd62fe660500f0a3b37fb1"
    },
    {
     "path": "node_modules/cheerio/dist/browser/package.json",
     "bytes": 23,
     "sha256": "3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a"
    },
    {
     "path": "node_modules/cheerio/dist/browser/parse.js",
     "bytes": 2224,
     "sha256": "62e53212119504ee3e97bf1940cba725a2b58ed4feef74848d8f8906e94214bb"
    },
    {
     "path": "node_modules/cheerio/dist/browser/parsers/parse5-adapter.js",
     "bytes": 1963,
     "sha256": "8fbabf110ebe5e20724900990f0bb73dcca1c62a92782586686018e7a8234345"
    },
    {
     "path": "node_modules/cheerio/dist/browser/slim.js",
     "bytes": 836,
     "sha256": "78e11e59173f67eb390ff6b6ac4791a558084aa33efe3eed747c21c9a4b386c2"
    },
    {
     "path": "node_modules/cheerio/dist/browser/static.js",
     "bytes": 6131,
     "sha256": "43780fa999cb63bc08211604c9bdc8847172377d81d8e702495e6eb3452c47bb"
    },
    {
     "path": "node_modules/cheerio/dist/browser/types.js",
     "bytes": 102,
     "sha256": "052dfc79ac1c253cc2cfb79c47804d31c2fbf63724e70c541aa14c470dd4b8ac"
    },
    {
     "path": "node_modules/cheerio/dist/browser/utils.js",
     "bytes": 2578,
     "sha256": "6c41ea99c8e06821fbc5a4683fca4bb8f89c18895cbe874773367da7aa309f2f"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/attributes.js",
     "bytes": 21078,
     "sha256": "417098df8357232e142d0c4b5308890c0245e900ebd8e67f791f30622f24e72c"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/css.js",
     "bytes": 3340,
     "sha256": "7746c87d752a58d3482228ba0ab2993d38817cab7c0c0771cc4042ee0a060b5f"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/extract.js",
     "bytes": 1576,
     "sha256": "522682022079cf724fc03316d1e8e313331aeb454f969b9bca3f284f40362a88"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/forms.js",
     "bytes": 3264,
     "sha256": "faf527df7eee6195b39aac346c231ef9f406862a1c1be10df9e7d9fc889e12e5"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/manipulation.js",
     "bytes": 25956,
     "sha256": "cabef68a59a6e5e0e8bed5c3c240ab57ff2f382658f09bf61fc1afbdefdac517"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/api/traversing.js",
     "bytes": 27020,
     "sha256": "540c5d31023bf7b793121da0f693aae62605ec4578555b3e6e964d422e244b92"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/cheerio.js",
     "bytes": 3579,
     "sha256": "f0fd733ff299a0ec5073b6016d940c918073542c1e3b83e816abae842170d91b"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/index.js",
     "bytes": 9916,
     "sha256": "ed43f738462a3ce5f277d8626dad1a0210464e38331064b3b43e1083b1ffd494"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/load-parse.js",
     "bytes": 1676,
     "sha256": "1be8b4e33874844978e2f4ba497f9dc290add220add5328b245465df7cfb5356"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/load.js",
     "bytes": 7230,
     "sha256": "7092336c1f5ce35750ad55bd1db1f8dfa85565ea49b0dc3eac35cb349db8d148"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/options.js",
     "bytes": 1012,
     "sha256": "f99e50683a7c223ddbe6cf397708fac2d3a653c7d68a3e8e7ec278caf2c09ce5"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/package.json",
     "bytes": 25,
     "sha256": "8005a3491db7d92f36ac66369861589f9c47123d3a7c71e643fc2c06168cd45a"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/parse.js",
     "bytes": 2354,
     "sha256": "7dcddf49df71915325218ae2ab3194b5021c0b1d961513ff234561130e581812"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/parsers/parse5-adapter.js",
     "bytes": 2175,
     "sha256": "08fe0e537e3c8d91f3a6f54dbf4f69f891170b7bca3571f7e26e3a9e213da5fb"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/slim.js",
     "bytes": 1430,
     "sha256": "edefd5b653583c0800bd5a1f08571fc1496ead27c77c3f37015bd070ce2ab5bc"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/static.js",
     "bytes": 6358,
     "sha256": "7b8ef6def93b427cde71dcfb7f4009fbe572a6dad5047b5dbe6c879856ed0e9c"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/types.js",
     "bytes": 168,
     "sha256": "24d24dca97cee756cf72233d188840328f8b73cd83b5dc762cd304204626f49b"
    },
    {
     "path": "node_modules/cheerio/dist/commonjs/utils.js",
     "bytes": 2761,
     "sha256": "654bafd7ebb53616b23afe8d840b941dfa8fbf9fcb66e47fcd57e537c121f2df"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/attributes.js",
     "bytes": 20215,
     "sha256": "89620b464dd95fcf9c63781320f039fd41771ebafd783af6e86a80dde738a146"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/css.js",
     "bytes": 3187,
     "sha256": "3bd12911368c6050dce487f0d9b7f968667acaa8f444079f59cbe7230a71ecd5"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/extract.js",
     "bytes": 1479,
     "sha256": "8f7d64a42aadbfd6425d99eb3c8403d57e9d3b642a2828458f76345a5614fb97"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/forms.js",
     "bytes": 3103,
     "sha256": "ebd229e85d8084206668484e0dd6faeb04c9b7755e62a3c90a485563c7e1e848"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/manipulation.js",
     "bytes": 24918,
     "sha256": "877dacf83b86235653955b788f6dc9bd628f3e26a36fd3a327116bfa55aec7fd"
    },
    {
     "path": "node_modules/cheerio/dist/esm/api/traversing.js",
     "bytes": 24708,
     "sha256": "408e7c2bf26afbf64efb285380f4911489f7e0be7cb151a4b2c86b98a60cbf4a"
    },
    {
     "path": "node_modules/cheerio/dist/esm/cheerio.js",
     "bytes": 2013,
     "sha256": "58fc2469df9fbdc4217db17b6f2a2993fc6861aae11697b04f1d608b8496d9c9"
    },
    {
     "path": "node_modules/cheerio/dist/esm/index.js",
     "bytes": 7435,
     "sha256": "19dd79731dc5cce760b9a506389aa51c088cf780bd73ba1f5fc76235a48ff72d"
    },
    {
     "path": "node_modules/cheerio/dist/esm/load-parse.js",
     "bytes": 1354,
     "sha256": "9e6d9e2d9fc3a8f321816e9d2b974c9048644875e902a31400700bdfe6ae0a0e"
    },
    {
     "path": "node_modules/cheerio/dist/esm/load.js",
     "bytes": 5588,
     "sha256": "ae6937526f54c08cac2b4733008b0cfecd12f6900e17e7960ffa8d344da83586"
    },
    {
     "path": "node_modules/cheerio/dist/esm/options.js",
     "bytes": 901,
     "sha256": "9819b83080b190e2bdf2bd98e2763a29fcd5af9fffbd62fe660500f0a3b37fb1"
    },
    {
     "path": "node_modules/cheerio/dist/esm/package.json",
     "bytes": 23,
     "sha256": "3ca9d4afd21425087cf31893b8f9f63c81b0b8408db5e343ca76e5f8aa26ab9a"
    },
    {
     "path": "node_modules/cheerio/dist/esm/parse.js",
     "bytes": 2224,
     "sha256": "62e53212119504ee3e97bf1940cba725a2b58ed4feef74848d8f8906e94214bb"
    },
    {
     "path": "node_modules/cheerio/dist/esm/parsers/parse5-adapter.js",
     "bytes": 1963,
     "sha256": "8fbabf110ebe5e20724900990f0bb73dcca1c62a92782586686018e7a8234345"
    },
    {
     "path": "node_modules/cheerio/dist/esm/slim.js",
     "bytes": 836,
     "sha256": "78e11e59173f67eb390ff6b6ac4791a558084aa33efe3eed747c21c9a4b386c2"
    },
    {
     "path": "node_modules/cheerio/dist/esm/static.js",
     "bytes": 6131,
     "sha256": "43780fa999cb63bc08211604c9bdc8847172377d81d8e702495e6eb3452c47bb"
    },
    {
     "path": "node_modules/cheerio/dist/esm/types.js",
     "bytes": 102,
     "sha256": "052dfc79ac1c253cc2cfb79c47804d31c2fbf63724e70c541aa14c470dd4b8ac"
    },
    {
     "path": "node_modules/cheerio/dist/esm/utils.js",
     "bytes": 2578,
     "sha256": "6c41ea99c8e06821fbc5a4683fca4bb8f89c18895cbe874773367da7aa309f2f"
    },
    {
     "path": "node_modules/cheerio/package.json",
     "bytes": 4843,
     "sha256": "026f4c64a6a1d210e59ad0b6f66988857fc65e3485c24af3358a4196046e8f0c"
    },
    {
     "path": "node_modules/cheerio/src/index-browser.mts",
     "bytes": 213,
     "sha256": "8a47899f28b2257a504805e66776b82827f67fa6ed7a2dd0e201cf015f0e29e7"
    }
   ]
  },
  {
   "name": "fflate",
   "version": "0.8.3",
   "integrity": "sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==",
   "specifier": "fflate",
   "payload": [
    {
     "path": "node_modules/fflate/LICENSE",
     "bytes": 1069,
     "sha256": "0a1df3a083d0c010560aa342e87959c8c1070e6fd54545741f083f22d0c8b551"
    },
    {
     "path": "node_modules/fflate/esm/browser.js",
     "bytes": 90922,
     "sha256": "b7ca4450b19559a1d50eb381adcee94b82449674be4cd17789d9beba7e6122a1"
    },
    {
     "path": "node_modules/fflate/esm/index.d.mts",
     "bytes": 53488,
     "sha256": "985db2599e33d85a70a6da5f2b7b6f1b0bf9b9119781b684573a1a9b463e0cc4"
    },
    {
     "path": "node_modules/fflate/esm/index.mjs",
     "bytes": 91765,
     "sha256": "8d75534a30a0580608e1271c13d70943ed4cd3589fddff7b1197748036a5116e"
    },
    {
     "path": "node_modules/fflate/lib/browser.cjs",
     "bytes": 91611,
     "sha256": "cbe7f75f83e0ca95ec7f3854fcdc8f854f488485d0ecf03c3a0a7ff29765c690"
    },
    {
     "path": "node_modules/fflate/lib/browser.d.cts",
     "bytes": 53488,
     "sha256": "985db2599e33d85a70a6da5f2b7b6f1b0bf9b9119781b684573a1a9b463e0cc4"
    },
    {
     "path": "node_modules/fflate/lib/index.cjs",
     "bytes": 91005,
     "sha256": "36967d6a4576f414f5a3611cfc866fa4245c05582048332ac139a174c63d56e0"
    },
    {
     "path": "node_modules/fflate/lib/node-worker.cjs",
     "bytes": 1405,
     "sha256": "69fe824fc1ecdcbd3f4ea0c8718b57bd91c84e202944034a2f0a5cb71be850f7"
    },
    {
     "path": "node_modules/fflate/lib/node.cjs",
     "bytes": 92380,
     "sha256": "befa44cd80a1da830179db9e57930050a2e460ca3df13f0b05f83f52b1491818"
    },
    {
     "path": "node_modules/fflate/lib/node.d.cts",
     "bytes": 53488,
     "sha256": "985db2599e33d85a70a6da5f2b7b6f1b0bf9b9119781b684573a1a9b463e0cc4"
    },
    {
     "path": "node_modules/fflate/lib/worker.cjs",
     "bytes": 636,
     "sha256": "7e04279c47bfcfb60cee1d86b250f6cffce89e922a0bdf959258713a30e0e46a"
    },
    {
     "path": "node_modules/fflate/package.json",
     "bytes": 3543,
     "sha256": "5922d8150b307bc0e4e441491c779c45379e9913d348848fca8d5cf02db4d134"
    },
    {
     "path": "node_modules/fflate/umd/index.js",
     "bytes": 33044,
     "sha256": "462ef8041fc970e3615a20a9dd2b2e3047a073b2da729ef4f02b634bba8b7b83"
    }
   ]
  },
  {
   "name": "mammoth",
   "version": "1.12.0",
   "integrity": "sha512-cwnK1RIcRdDMi2HRx2EXGYlxqIEh0Oo3bLhorgnsVJi2UkbX1+jKxuBNR9PC5+JaX7EkmJxFPmo6mjLpqShI2w==",
   "specifier": "mammoth",
   "payload": [
    {
     "path": "node_modules/mammoth/LICENSE",
     "bytes": 1307,
     "sha256": "6663bbd049205d38a496ccacb412a151980b444627d38de218b3b809aef330f1"
    },
    {
     "path": "node_modules/mammoth/NEWS",
     "bytes": 12171,
     "sha256": "bdbcbeaa95bae1dfa91a2f2fb8d0dc95d5317cac6b09f0725324b4608ef71ec2"
    },
    {
     "path": "node_modules/mammoth/bin/mammoth",
     "bytes": 1032,
     "sha256": "a622f9c8831310bc4d1c92749b3d35e3b654ee8d7b4e2eb54259fda4cae90ef5"
    },
    {
     "path": "node_modules/mammoth/browser/docx/files.js",
     "bytes": 304,
     "sha256": "3c9880809af2bc8485662667b8d20562c6ea3b504ddb4eb2f7bc635b9aeeaab6"
    },
    {
     "path": "node_modules/mammoth/browser/unzip.js",
     "bytes": 349,
     "sha256": "88bb0cb36ed990dc71b186dbf3a493a4dcd8369984b324ae2208ea21dba9edcb"
    },
    {
     "path": "node_modules/mammoth/lib/document-to-html.js",
     "bytes": 15861,
     "sha256": "5be590f92058512897cc96dc6aeee78834863ccd14b96b7ba1333845bf1c1ad3"
    },
    {
     "path": "node_modules/mammoth/lib/documents.js",
     "bytes": 6437,
     "sha256": "1a0df4ae1f94b43bac105cfad77a7b6d7cab96e335ec05521b9af3536f0702e3"
    },
    {
     "path": "node_modules/mammoth/lib/docx/body-reader.js",
     "bytes": 28262,
     "sha256": "69fa5528b3e6b0afb90ad426f60222921e1132977d0c96375a57b57f6f5763ea"
    },
    {
     "path": "node_modules/mammoth/lib/docx/comments-reader.js",
     "bytes": 976,
     "sha256": "5bb668b0c20bbb8811782b99a1c778589aea7ab7a6983d66d0244ca91de43a53"
    },
    {
     "path": "node_modules/mammoth/lib/docx/content-types-reader.js",
     "bytes": 1768,
     "sha256": "5c17d44ed357765aa18d40878dfc27b7205bf80a5aa256bc654b9dedb8bfd49e"
    },
    {
     "path": "node_modules/mammoth/lib/docx/document-xml-reader.js",
     "bytes": 864,
     "sha256": "f994322465fef91568372184e274b0fac9f7c6eff2672eaedac69941757563cb"
    },
    {
     "path": "node_modules/mammoth/lib/docx/docx-reader.js",
     "bytes": 8302,
     "sha256": "f0f96f96e78561665176a6c4b3b55df7ed21dc656bb9383a9c8d99d9bfeba1c8"
    },
    {
     "path": "node_modules/mammoth/lib/docx/files.js",
     "bytes": 2248,
     "sha256": "5a11b408a9bcf56e7ca11e9bfe0b403d9d6688e48e452cce7619eb20630c5159"
    },
    {
     "path": "node_modules/mammoth/lib/docx/notes-reader.js",
     "bytes": 984,
     "sha256": "958fe26314d4e75b8cedfff2e8a4b29b05cb1860b95823b1d8a6dff5fa1bce4c"
    },
    {
     "path": "node_modules/mammoth/lib/docx/numbering-xml.js",
     "bytes": 3623,
     "sha256": "1c65dd5256999d575212178f05ee2160aaf9fafcc6f473dab3e2c894b6499b0e"
    },
    {
     "path": "node_modules/mammoth/lib/docx/office-xml-reader.js",
     "bytes": 2454,
     "sha256": "72f1f41e54c9074b22c960357855857dea16231bea40722a920bc928d6c2ebbd"
    },
    {
     "path": "node_modules/mammoth/lib/docx/relationships-reader.js",
     "bytes": 1356,
     "sha256": "a0307641538d131cdf520f2c5d360404ff60a746630f4a48fcc64e15df938db7"
    },
    {
     "path": "node_modules/mammoth/lib/docx/style-map.js",
     "bytes": 2714,
     "sha256": "27337d30e7ed15957be14cb93b868221e7c6e3b31d64a3797682561ce428700f"
    },
    {
     "path": "node_modules/mammoth/lib/docx/styles-reader.js",
     "bytes": 2828,
     "sha256": "821c39f1ded8c2d61d90ba848ed49ff36d5dfe517000976342251e5cdab4c3a7"
    },
    {
     "path": "node_modules/mammoth/lib/docx/uris.js",
     "bytes": 596,
     "sha256": "eccc6620d9cdde9055bfd0b217caec01b74fbc7f1c9b23f45be5a060ce4b9a3d"
    },
    {
     "path": "node_modules/mammoth/lib/html/ast.js",
     "bytes": 1082,
     "sha256": "c96bfbb1fbb3b84d1a94d9f14c1e4dbb16928d154c5138576fe8e36c4d9e53bd"
    },
    {
     "path": "node_modules/mammoth/lib/html/index.js",
     "bytes": 984,
     "sha256": "fc8eb36474dc85c7aa98154ebfa2e0f722894b82b12d2d342f1319b779b2db66"
    },
    {
     "path": "node_modules/mammoth/lib/html/simplify.js",
     "bytes": 2019,
     "sha256": "f5daa8169ebf6be7fdd92d0c27b84be412798c18f2b29669cd3619cebd3c9507"
    },
    {
     "path": "node_modules/mammoth/lib/images.js",
     "bytes": 867,
     "sha256": "caf7da5007bba9f4ec0aa6d81a10daf273f01c3ec3a93538260b7c880a82a1d5"
    },
    {
     "path": "node_modules/mammoth/lib/index.js",
     "bytes": 3686,
     "sha256": "ca86526cdfc8b572e0637f61312e78d434a454c60ee39131bfcb719d7fdbe380"
    },
    {
     "path": "node_modules/mammoth/lib/main.js",
     "bytes": 2073,
     "sha256": "cb36279b0592f202496040f946f55356a6863951377c6b5688e668b5050e8d72"
    },
    {
     "path": "node_modules/mammoth/lib/options-reader.js",
     "bytes": 3497,
     "sha256": "e0030270cdb7d64bcf1aabd382ff69b8ac1e73b44572d6f1979736a33e3a3629"
    },
    {
     "path": "node_modules/mammoth/lib/promises.js",
     "bytes": 1120,
     "sha256": "4033c847437a3e034d7480831be9feeb962634e13d631a563d635f9a8a2b9191"
    },
    {
     "path": "node_modules/mammoth/lib/raw-text.js",
     "bytes": 456,
     "sha256": "1c02e81738b056456071a03e3205e142fe4c07c474b6cd794168c421e5183b5a"
    },
    {
     "path": "node_modules/mammoth/lib/results.js",
     "bytes": 1713,
     "sha256": "99555347dd5caff7f57a110ad2f16266cafe0ccf2ebe7ca38baa5426998b9bda"
    },
    {
     "path": "node_modules/mammoth/lib/style-reader.js",
     "bytes": 11481,
     "sha256": "bb2956ba0c304b62607025274604abceaa4b269d012dcac13c3b30e16a45ef43"
    },
    {
     "path": "node_modules/mammoth/lib/styles/document-matchers.js",
     "bytes": 2966,
     "sha256": "44cc23b1cd5c2089912163ae7b5da66c008260ddf284ab21e28cb2f269cbf812"
    },
    {
     "path": "node_modules/mammoth/lib/styles/html-paths.js",
     "bytes": 1911,
     "sha256": "40ced07c166dbf8d74225c9a331e097c8335ff0495dd851b22580b92f8cce8b8"
    },
    {
     "path": "node_modules/mammoth/lib/styles/parser/tokeniser.js",
     "bytes": 1156,
     "sha256": "dab7743a1917972f00616c42253d7a4b443f9f1e222fd6df4330a9e8b752e747"
    },
    {
     "path": "node_modules/mammoth/lib/transforms.js",
     "bytes": 1514,
     "sha256": "a15297cb64e09f5ebf49ba6b1726a92e6c412b140df9e1fae41e0e2720cc602f"
    },
    {
     "path": "node_modules/mammoth/lib/underline.js",
     "bytes": 239,
     "sha256": "e26a23dbbb981833c6949239db22578e4eb265e4318638161480ac9c02df20a8"
    },
    {
     "path": "node_modules/mammoth/lib/unzip.js",
     "bytes": 581,
     "sha256": "c14f31229c6e6280fe9d2ee24a0f3ab212c547921088a8e436f795b4687caf2d"
    },
    {
     "path": "node_modules/mammoth/lib/writers/html-writer.js",
     "bytes": 3505,
     "sha256": "73a28204e519bcb3ec137c21e9cab3e600f2c4a9682938c133d2ffb04bdfd664"
    },
    {
     "path": "node_modules/mammoth/lib/writers/index.js",
     "bytes": 329,
     "sha256": "9d0cd2a3ddba4792549ee32228536255be3afb11844ba8bfa0706162465ca5b9"
    },
    {
     "path": "node_modules/mammoth/lib/writers/markdown-writer.js",
     "bytes": 3954,
     "sha256": "0514786cb056e6f77616523e14f479390b057b1e6c940645df3eefc5b462b1fd"
    },
    {
     "path": "node_modules/mammoth/lib/xml/index.js",
     "bytes": 277,
     "sha256": "cf16ea96fd39383139d9f88c4c600b4917edcad5da90a0cdf4bda9877d7ccd59"
    },
    {
     "path": "node_modules/mammoth/lib/xml/nodes.js",
     "bytes": 1670,
     "sha256": "c78143c3b63efcc5e2b9d6d2f2c681bafeff8979e68e75b9c1dc8f4eba36037f"
    },
    {
     "path": "node_modules/mammoth/lib/xml/reader.js",
     "bytes": 1982,
     "sha256": "feb6b634ee0ffd42d7614e9b7d653017d351e7960eae1f5954bc59d957dc4f9a"
    },
    {
     "path": "node_modules/mammoth/lib/xml/writer.js",
     "bytes": 1640,
     "sha256": "3e6f3e0edc285c49a3ac13d89c87059ca108f9a7ed70d323ec162e54f382f61b"
    },
    {
     "path": "node_modules/mammoth/lib/xml/xmldom.js",
     "bytes": 566,
     "sha256": "d75c75e303ebd8bf126b5bb2bb7a2ead247f870d8eb01e0dbd0c37afb67231c1"
    },
    {
     "path": "node_modules/mammoth/lib/zipfile.js",
     "bytes": 1890,
     "sha256": "9eb35456e709d32769da9474c840d6eb9bf501e7a9920ea869d1387b22a9afe9"
    },
    {
     "path": "node_modules/mammoth/mammoth.browser.js",
     "bytes": 884760,
     "sha256": "d5cfd45fda6292d6955bc538b7ac95357847f9ab0794fa501839c878397ce60c"
    },
    {
     "path": "node_modules/mammoth/mammoth.browser.min.js",
     "bytes": 635882,
     "sha256": "5d4c0e7c9165d70b78f789c5274a2c7846d9e1c06ec19b69afa6ef45f789a3b9"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/LICENSE",
     "bytes": 1079,
     "sha256": "c8442419dc614089ea022b3da6bfc089b41a58fb7b9030d1e651f2f36189dce2"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/index.js",
     "bytes": 59,
     "sha256": "190d2c0b07376e8dd3bbf2001b20d27b8929245b0b731d79e222edb0944f58f5"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action.js",
     "bytes": 4659,
     "sha256": "773b4e9300210321067744f4023cde58d299de00fb87e9e55ddbcd78978a525c"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/append.js",
     "bytes": 1565,
     "sha256": "f5750834298717715d5e7b9e3f32cbe81d6d7a33ef74dad82915c53d7c0e13f0"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/append/constant.js",
     "bytes": 1430,
     "sha256": "5f8f444bdd4acd75659eeeaadf6b14bd60b33c7d6f7c19797c4bf8c87a742c71"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/count.js",
     "bytes": 1036,
     "sha256": "3f9c9c87f0d880101e7957436eb876a2b9352f40d0f9b19b34bf597ba90b6128"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/help.js",
     "bytes": 1120,
     "sha256": "4a802a6b28e77c44af2ca359370b4674e19ab36eac8b512785c6867971c11da9"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store.js",
     "bytes": 1350,
     "sha256": "3ed24a4d6d56e50d972e82b866ade25192e004d08d55cb4d5a17bf3a7c239b1a"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store/constant.js",
     "bytes": 1332,
     "sha256": "260804d0d1019d89910ca2f861af4f21c41d132ffec692fef40052db28efa827"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store/false.js",
     "bytes": 704,
     "sha256": "92aed2410134bf56b27f29250cbc85a4617a956539ece74ce1c579e9830587ef"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/store/true.js",
     "bytes": 693,
     "sha256": "abc51942ffc474caaa5a8c7f2bfd7363963955b131e0574657e012d14818c2b9"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/subparsers.js",
     "bytes": 3590,
     "sha256": "6c3f8933c4e526f2cab647a77f222e282f8fd72c6da774e5ae6e1fb9cea666f1"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action/version.js",
     "bytes": 1244,
     "sha256": "02ef8cd757582d809cf163251f16e3915f548f1d3b8e97c3aa9f206751627c27"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/action_container.js",
     "bytes": 15055,
     "sha256": "4d594dd87587d58d3cada83e0d3bc105fbc9f48cab72daf72d8c77632bc5b9ab"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argparse.js",
     "bytes": 618,
     "sha256": "33c1269d0e69f0bb3f5cc54dded402d0e1abcd2b7ff39ef6956234bd29de0757"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument/error.js",
     "bytes": 1183,
     "sha256": "2af0d562361cc46b5958d87edef28f23661903674e2484f7347057d3d45fa251"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument/exclusive.js",
     "bytes": 1589,
     "sha256": "cd81ce86f7e98ad6699a4d3ee86abdbdd762db25b03c4a7ad8521a64bd5fc5b2"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument/group.js",
     "bytes": 2330,
     "sha256": "4cab0c3ee28ac94fe0a37c4cffb6cb27c675b8dd7f266268d5107083141425ec"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/argument_parser.js",
     "bytes": 35223,
     "sha256": "e9158c6cc41fd1b8525cd061362f4df7f175bc7767db6e589a1d17daf3ced276"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/const.js",
     "bytes": 340,
     "sha256": "719d122368d1ead2b1027e54bae88920f2334b552ebc72054698630a87e24c0a"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/help/added_formatters.js",
     "bytes": 2647,
     "sha256": "204100289ecc4ecfe0d61cd98839e39698d9b2b0347db7d91dbcf3485649aeb5"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/help/formatter.js",
     "bytes": 22025,
     "sha256": "dbe0569259647ae9b8a8fe7db70b542219027ec7d7b7a80e6edd973fd01ee19a"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/namespace.js",
     "bytes": 1824,
     "sha256": "b8a67a6abf6043d22a2a7976d1ff8476af62ee413349eb330e4798de8d798afc"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/lib/utils.js",
     "bytes": 1281,
     "sha256": "4a1146a5ae0694946b7063779c1522c95439050e41bafdd2a703c785625fe0c8"
    },
    {
     "path": "node_modules/mammoth/node_modules/argparse/package.json",
     "bytes": 638,
     "sha256": "48b848e56c31eda738f76fb8573ae1fe0012c4b1ec9d9cfe8783517a142e9531"
    },
    {
     "path": "node_modules/mammoth/package.json",
     "bytes": 1507,
     "sha256": "10ec1fa953a258ef6b6c883abee0301d2a66d3ca94c1b59c4e5d2f185fe8978b"
    }
   ]
  },
  {
   "name": "read-excel-file",
   "version": "9.2.0",
   "integrity": "sha512-jwSi8Q9oCmswrYMkuiKvJ6VdHbAXGQnANSOaHBNQZEm2XvaXx8d0t/V7oepgHqT9YWxlQE3HEuCtDZq8BZBmvw==",
   "specifier": "read-excel-file/node",
   "payload": [
    {
     "path": "node_modules/read-excel-file/.gitlab-ci.yml",
     "bytes": 206,
     "sha256": "5b08671c9acb06da911ac2aab3694bdaef2c9e50e2bf85f7b0bf9c6104d7a16b"
    },
    {
     "path": "node_modules/read-excel-file/LICENSE",
     "bytes": 1103,
     "sha256": "8cf9b31947daf7adb4a7a00a037459e58241af050cd0a603bfcf1756e533f75e"
    },
    {
     "path": "node_modules/read-excel-file/browser/index.cjs",
     "bytes": 633,
     "sha256": "daf81f36ee6aa7013ae299241f8346e281ff5dcb1f49e9769d1cd79786eaf68e"
    },
    {
     "path": "node_modules/read-excel-file/browser/index.js",
     "bytes": 535,
     "sha256": "983e7a05824860b6e4b8a6736f249ea88cce86978dd5936ec3fa3d6d935085ee"
    },
    {
     "path": "node_modules/read-excel-file/browser/package.json",
     "bytes": 345,
     "sha256": "c977275b88b2e36906d9d380056ef8637aa1419a369b1bfff6d0a44de9372ddc"
    },
    {
     "path": "node_modules/read-excel-file/bundle/read-excel-file.min.js",
     "bytes": 26889,
     "sha256": "b8415c50bdcbd9e167b668689a1a5558dc1cf9199e403fb75a1a3f2ccb7f5ee4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/convertInputToNodeStream.js",
     "bytes": 3300,
     "sha256": "1a8590c6ab6fe1cebbd5e18d16539ea65f138dd105cf4db628a56d4d2812d5e8"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/convertValuesFromUint8ArraysToStrings.js",
     "bytes": 638,
     "sha256": "74dff5546d623dec5411df8ea535461d8808fc155b3d7591b7c3eb4d38032c48"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/filterZipArchiveEntry.js",
     "bytes": 632,
     "sha256": "5130c9a0d34827bea44eb8b9b8046017d14c61b86f1a5e1055e79e63761724d7"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/parseSheet.js",
     "bytes": 3086,
     "sha256": "0578504fb84f1aaebde84693cebe68c3f36c7b9b69adad5776894ab14ba6bac4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetBrowser.js",
     "bytes": 1173,
     "sha256": "b253992e1b970909ddcf23b6027f72d1abcd134e4e20aa3e3d011e6ca8ede09f"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetNode.js",
     "bytes": 1149,
     "sha256": "9847d582e1766ee2adc879ea1f84d7aa65efec14582788898b96a6d91f7707b0"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetUniversal.js",
     "bytes": 1160,
     "sha256": "54354e959df0e58d9fd4fe6882e9fc524f8208b8832c11459b4305e7a68dfc74"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readSheetWebWorker.js",
     "bytes": 1159,
     "sha256": "aec1039d481ba156abef2da8bddfa27e0904a406eb7fb48c7a25e2428b9e6153"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileBrowser.js",
     "bytes": 900,
     "sha256": "94e9e5bd869d39b1e4f36b78309dc0f2fe1b6b8d9dd1d01192650d6fc5faf124"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileNode.js",
     "bytes": 871,
     "sha256": "fb3c8509bd0563d760a25a8184b8f67d4defdfe052463c746170a70d21c62d55"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileUniversal.js",
     "bytes": 882,
     "sha256": "a6e077d18f3aa9b7a22af420766c2e72e80c67bdd764a55b3ba73eadc78fa14b"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/readXlsxFileWebWorker.js",
     "bytes": 879,
     "sha256": "38294be60eb64babbffa4d7eb78d9b4ab08daa1d694c8570d26a328f67d4ba04"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileBrowser.js",
     "bytes": 1764,
     "sha256": "4fd5f77828c50abc7f16abd617e63414a26f56f4fe49464d1f043aaaf0fc414d"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileNode.js",
     "bytes": 1188,
     "sha256": "b2dcbf6bfa05636a36ba621540278ff64c0a16857ce6717bba7f951b35fadb8e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/export/unpackXlsxFileUniversal.js",
     "bytes": 1376,
     "sha256": "54803ea65802e24018840deb230ec3d4902d08e7208f29bf0289e6c6b44f5b5a"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/package.json",
     "bytes": 81,
     "sha256": "8a8b3c2a546941e9214b5183dc494a2dfca78dab5cadbe8422652c276cd73417"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/InvalidError.js",
     "bytes": 5528,
     "sha256": "0abb50eb10c9cb6d53a19cbd7783b2f2633094009f1c34ead5034edbb878c598"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/parseSheetData.js",
     "bytes": 32957,
     "sha256": "94e20d93af367f85d76cd4d8b2e274c41fa6cb0d6d0437857cbcf5b03f218cf1"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/Boolean.js",
     "bytes": 467,
     "sha256": "f218314154a17f19ccc4a86f60e72fd67043cce42fb3e8af2728cd27b710a55f"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/Date.js",
     "bytes": 733,
     "sha256": "a5c1301982532c154b646eabda8ed5b8f48e5594d2443e3e4d334c6f4f1bd95e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/Number.js",
     "bytes": 1457,
     "sha256": "2b776b393cf3fa7e5e22a8dd42b24b574156b851b57a43842bc6a398762115ba"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/String.js",
     "bytes": 1467,
     "sha256": "4a8b7f52d60b117edefaba7ff5dad3e9bb970ec0c44a1fb7baa2d3a7fe2c0ef2"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/additional/Email.js",
     "bytes": 697,
     "sha256": "b7f1f620e620d598f8bfaa45d8fcfbf5f79cb5b8df896d4af1370febd477d320"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/additional/Integer.js",
     "bytes": 745,
     "sha256": "22e8ffaaa93b19af28a4038b29b19a6d990baf2492add2c7ff8949c14cf05a19"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/parseSheetData/types/additional/URL.js",
     "bytes": 1936,
     "sha256": "4c10ac53196960357862ff6b38d5c7c9d789df17455376d5751e175daa3f62bf"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/convertCellsToData2dArray.js",
     "bytes": 5063,
     "sha256": "fadf53176130534122f186b9dbe2fd20f662fa885750f620e2bc1e83870a15a1"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/dropEmptyColumns.js",
     "bytes": 2156,
     "sha256": "5dc3fac7bf931fb17a320f9cde335f0dbd5b854ce4a330742aec34809436e946"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/dropEmptyRows.js",
     "bytes": 2283,
     "sha256": "b60e5c382c9a9b393916d9287f3cc19a31d81c140f7c639f11c087f0a296e9a4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/isDateFormat.js",
     "bytes": 5449,
     "sha256": "207bb94105e06ccd019511879f5cb40547f18cd7488449bef49bc3458a1893e8"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/isDateFormatStyle.js",
     "bytes": 5868,
     "sha256": "b474329ec0d2ef29dde9c59eb2873ce14f8e2b74ee82627c02d340eb2a34ced5"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCell.js",
     "bytes": 2296,
     "sha256": "7f4ee4f639fe7507a35b32d4edf3a0313dd28a012b33f04fad8ae5bd74b03996"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCellCoordinates.js",
     "bytes": 2911,
     "sha256": "a003c6a696cf8d8d78afe958a984eb6c5c46e717d9f1b73253bda4e9be7655c4"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCellValue.js",
     "bytes": 7604,
     "sha256": "58ad319fae3ce0a4447c161a44c35378a5186dc2ad63674896ecfd36fb3a3e42"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseCells.js",
     "bytes": 1526,
     "sha256": "a3f329f88c57c0d985ae838ec33df4bc0499d1518d9c5a9581104c5fe70cffdf"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseExcelDate.js",
     "bytes": 8298,
     "sha256": "bbbdbbbea2c5d011e0c0ba9fae24ab1eb176e98a26601ecdfa2ef80249300a80"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseFilePaths.js",
     "bytes": 2925,
     "sha256": "53d59c8558d572b7dfc051d76ed8f28df11959816d2b1773fa938cb2137cbe55"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSharedStrings.js",
     "bytes": 356,
     "sha256": "ba584c149b8ec84957054e1d243fd2d277ab650d851a835158961fb132dd7403"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSheet.js",
     "bytes": 1282,
     "sha256": "d97c02cd371b8ecf1d84ac06d0971b160f88cc23ba6c6f181a3095a04e6d6bb0"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSheetDimensions.js",
     "bytes": 3046,
     "sha256": "ff9969e950f83f4443dcf73787dbce92de45d6b7a34d804a290bcf8fbdbdce01"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSpreadsheetContents.js",
     "bytes": 5343,
     "sha256": "17c2c2985ba14a70c963bc74f89f7d67b83c38b575b03751138631810d98d57e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseSpreadsheetInfo.js",
     "bytes": 2729,
     "sha256": "936399e775c6019f2bb6d559eef737b8809d10c5784db60516bc19e8dfceb00b"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/parseStyles.js",
     "bytes": 3771,
     "sha256": "5f97e1ad52215a799d003d299770b9aba9e5fe1eb3a80c4e80b2c7eadd8c3b8c"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xlsx/reconstructSheetDimensionsFromSheetCells.js",
     "bytes": 760,
     "sha256": "b9f9ae6ae1b3891310ec9d7b2c94cc019edd659ee3de9ebe41efb0bf31107415"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/dom.js",
     "bytes": 3268,
     "sha256": "96c4656e240cef61714b5b8972fe5eda1198d14a090438f8c870cf58c517515e"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xlsx.js",
     "bytes": 4431,
     "sha256": "8fc5fee3e3b5ae6b4564fd9e6e5d704c619242284a698a26b84f4c8906cef736"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xml.js",
     "bytes": 352,
     "sha256": "c5065a0f38783af5d71674f6255925d4cfa57ee32c0bf69be99d544f72c8e264"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xmlBrowser.js",
     "bytes": 520,
     "sha256": "5c59ff7c0b4b1c3d75af6329712aa1e61935a4dc8d5687f8b8ab570dacbfd1e8"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xpath/xlsx-xpath.js",
     "bytes": 4421,
     "sha256": "6e5a540000406cf3d8cdb8353e53b578f05f421bae634102e24b3b60d05441df"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xpath/xpathBrowser.js",
     "bytes": 1246,
     "sha256": "354bb3c030b6bd72308bb8f2ed93fcbb1b2632b400f7cc00b6e76ca2d3e20509"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/xml/xpath/xpathNode.js",
     "bytes": 576,
     "sha256": "801a0f5923a4dd52a1caabb5c1b66927df9bceefe1ec9c72350115aa0e6cbe57"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromArrayBuffer.js",
     "bytes": 3137,
     "sha256": "817e951a5c08d86c32741ae057285f2093429a0050661fe4a7f69835fac21b51"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromArrayBufferSync.js",
     "bytes": 1585,
     "sha256": "307b7440148d2ebac744e4418c2384029f2405d7f72df14d8a114179db68ae08"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromStream.fflate.js",
     "bytes": 8438,
     "sha256": "864ed0a4697e512c17baf436bc4ea9ed9d1b3398691e8292c5761dde1d7ca617"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromStream.js",
     "bytes": 462,
     "sha256": "9b6a96f6599303100e745ed79eedb1f4e545fd438b67b6553f61b2a94ca088da"
    },
    {
     "path": "node_modules/read-excel-file/commonjs/zip/unzipFromStream.unzipper.js",
     "bytes": 5344,
     "sha256": "086e9ce2be1bf9d193e7d5a77730f2dba8b2245c42447722953b23d962c08593"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/convertInputToNodeStream.js",
     "bytes": 1499,
     "sha256": "d2c2d7fb4b0118751c387e45651c62abd01b4128c4ca183ea6a96b743ae97866"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/convertValuesFromUint8ArraysToStrings.js",
     "bytes": 504,
     "sha256": "3e0d1b1b99e41fec98acd55bcfbaf6998b7cdc012f271685988ab07b17954775"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/filterZipArchiveEntry.js",
     "bytes": 523,
     "sha256": "c2c64d870f2c1e3838206a28c90229b10e7608327f8674c0c3ae426225eb39d9"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/parseSheet.js",
     "bytes": 2801,
     "sha256": "96653d3e64ffc2504cc02c80f2e1ef48792f2da01aa1fb7afa7894dc8152e79e"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetBrowser.js",
     "bytes": 821,
     "sha256": "38d98f60304510534b49d7107bf986b4286c10f0e71a767ba31a60ed2b6b00e1"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetNode.js",
     "bytes": 817,
     "sha256": "829efda5fff479a5535426304043af246979e24b42cbb5468a3df054390eda8d"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetUniversal.js",
     "bytes": 818,
     "sha256": "a2e4c9121d4f43a7f84c65fb1e43394a2db41dfcca63312cbfd823284947db39"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readSheetWebWorker.js",
     "bytes": 821,
     "sha256": "63e6fed801dd540e0c53595916c49517ad8a5851fa57e133e56b598143e63eba"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileBrowser.js",
     "bytes": 545,
     "sha256": "554a92ef53c2259174772e1251cb81df1d1662c93b7dcead289fd2fbbdfa51be"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileNode.js",
     "bytes": 536,
     "sha256": "56ab6f666d74907d44e37a103603bce23504fed3a58a1c742d96239f255679c6"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileUniversal.js",
     "bytes": 537,
     "sha256": "3037456da7fdc765bc096f95afcdaefbd2ca64da8099ba8e83dcddbc2591e4cf"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/readXlsxFileWebWorker.js",
     "bytes": 538,
     "sha256": "28fb9e62ef622e3dba56fe6a2146f126bb326578eb6de1949a99c5500dac4a78"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileBrowser.js",
     "bytes": 1439,
     "sha256": "f0a677d5365ec433d33133321ba9fc5f1439c32b737d6f8afbca85d7fc674a8d"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileNode.js",
     "bytes": 819,
     "sha256": "3d06cf4c954449c719211443a858bcf27190cf4deefaef4d7b744893d560d53a"
    },
    {
     "path": "node_modules/read-excel-file/modules/export/unpackXlsxFileUniversal.js",
     "bytes": 1052,
     "sha256": "39f27803669e548fdff263e5a9c0606edde14be497a7cba85ed6441933f0ee4b"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/InvalidError.js",
     "bytes": 5434,
     "sha256": "dff099bdbe6c2ff8ed70679f47a2204141f8274d08bd92aa5decdea0fec48f50"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/parseSheetData.js",
     "bytes": 32446,
     "sha256": "7ac6eaf7b9dbe299d62f2ee8b72ac294790becac1eb4bdd21e900ae494aa936f"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/Boolean.js",
     "bytes": 230,
     "sha256": "024ff8ff1099c19e558f7f72b7ab215f57199b1d4298fdae4c4136d9ca08aa9c"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/Date.js",
     "bytes": 487,
     "sha256": "a5948bcfce180472bcb177923bec3a0493b6aca8b457152f1029a89beaca511b"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/Number.js",
     "bytes": 1185,
     "sha256": "2867c4eed648028967d699ee5336bca3ff308c48cdacaae9643c1cfe55dd49b8"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/String.js",
     "bytes": 1207,
     "sha256": "f0d6e0ae50ae4c4fc1a4961f8d4b6be067baae5e38cdd03ba4745f3db726091b"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/additional/Email.js",
     "bytes": 434,
     "sha256": "da55764c75bf9fee49d0ef9a6f574a5fa394aa86b9c9489ef8b7265ae160edc8"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/additional/Integer.js",
     "bytes": 451,
     "sha256": "203b9cf151514cd18fcf78da40a093ced152581a5498217fc5efb4bf8198131e"
    },
    {
     "path": "node_modules/read-excel-file/modules/parseSheetData/types/additional/URL.js",
     "bytes": 1679,
     "sha256": "6247b81c488c58d9de65fed6dbce3e9c7e2c0c9550e98d17627843b0e7c08aa2"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/convertCellsToData2dArray.js",
     "bytes": 4762,
     "sha256": "21e202e6b628969f35592104dad8ce52f7f750628db3c34574087c7eda38d3d8"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/dropEmptyColumns.js",
     "bytes": 2052,
     "sha256": "e65e29b4e578cf8b5361c0bf957ede817e504551303889a2f8ac234478500cc8"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/dropEmptyRows.js",
     "bytes": 2182,
     "sha256": "b1178c2441561b3368fffb85cbd71e937d3d14e3a739691a1b7a2a4855383777"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/isDateFormat.js",
     "bytes": 5343,
     "sha256": "22a92b561d8cb2dd4e88f452a1f977d478c70e5838cc510be6524f7cfe527c24"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/isDateFormatStyle.js",
     "bytes": 5620,
     "sha256": "3c643ee1f5b980d383eb6a6ce9edc8f78064d9e33e322bfcd7ebae64863a32fc"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCell.js",
     "bytes": 2029,
     "sha256": "f05d2d798a52f8126e341cd26f35fbd79deb954d79623f183e5e9694371d8ceb"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCellCoordinates.js",
     "bytes": 2803,
     "sha256": "18f432368936727ef5266c59deaa73f4fc9b97279864e5b2a4d12f6dad26f37d"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCellValue.js",
     "bytes": 7315,
     "sha256": "c5769b07c2d4f331035316f927b96ed501b7df85935972e49bbba703069042d4"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseCells.js",
     "bytes": 1285,
     "sha256": "575e751835e034548664190d259802669588a52b6455f365316d0fb264357286"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseExcelDate.js",
     "bytes": 8196,
     "sha256": "9be257c1c968fd9d4b8d49b9991b94abccaa2bdf48ad84c5a4987231597be7ad"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseFilePaths.js",
     "bytes": 2825,
     "sha256": "426e07b80c55cbb7473f463b5fdd7ba31271e5fbcdc0868bbbb04c3e071a6139"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSharedStrings.js",
     "bytes": 251,
     "sha256": "8a7eae0e4a4f6d0337c5b189ddd8e7dc6a1ac1bdbacf8f075c5208b79787e54c"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSheet.js",
     "bytes": 906,
     "sha256": "4255b07163e7c88fddd6a586173134f99897f24a17e7f8f38e69097023cc61c3"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSheetDimensions.js",
     "bytes": 2799,
     "sha256": "c1485cc0c58bd99791a3c386e6e8c2374c9d48b65a9ea831495f37848e81fea3"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSpreadsheetContents.js",
     "bytes": 4908,
     "sha256": "2d200593ec765e6a14786b04c2fbc1033492b85d333015ddea66d5f4b68e07b0"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseSpreadsheetInfo.js",
     "bytes": 2628,
     "sha256": "b7cb21649b2f5b245912bc0d9624a4aad8f8aa774d3ede21c9cb089dfdf206e9"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/parseStyles.js",
     "bytes": 3682,
     "sha256": "ab0c535c8779b82e5811d6a95f36bc98e82f3d04df727a5fbd51857b4d66bc82"
    },
    {
     "path": "node_modules/read-excel-file/modules/xlsx/reconstructSheetDimensionsFromSheetCells.js",
     "bytes": 632,
     "sha256": "49d7e22edda220012f290441b4db8040bef7f660c333bd20a1ea5a0fd511364b"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/dom.js",
     "bytes": 2978,
     "sha256": "2028f721132ff0b641d44ef7d04ce5f8cea787ce750449a22ca3529ccc3923e4"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xlsx.js",
     "bytes": 3700,
     "sha256": "cf4c3e8d3b963c74951cc82c3fd31f00558ed1679ff843213ed3ff65c96f2264"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xml.js",
     "bytes": 217,
     "sha256": "757bbc137979823ec21a5d7f967dbed5c3b46fc62d8aecee962056eb563c1be1"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xmlBrowser.js",
     "bytes": 390,
     "sha256": "1e1aa59b9db991e1b295bb4239d8b4ced71ed871af0d5a0e4f90a52524f65f30"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xpath/xlsx-xpath.js",
     "bytes": 3481,
     "sha256": "7b1389a7ed73e24f3f11703c9253a3dbd091c332c6ce1166c688096abf05629d"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xpath/xpathBrowser.js",
     "bytes": 1153,
     "sha256": "c76bd2a032c342915f6ae2940a2406e1df1b3d17ef7590061b35009583a012fc"
    },
    {
     "path": "node_modules/read-excel-file/modules/xml/xpath/xpathNode.js",
     "bytes": 334,
     "sha256": "1bceb512884d0a194a2615064dd7e06e80b4244ba293e64b3dc2d371026952ee"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromArrayBuffer.js",
     "bytes": 2943,
     "sha256": "4eed2db5335e8efa058da4421f7bbf234d5f1c3b0f8c1e9e2dcd9b74e2d6f82f"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromArrayBufferSync.js",
     "bytes": 1454,
     "sha256": "ab97bd322a89fe7a75f6b4239bbb97d649b5059f8cb5aaa1b591726846715ee1"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromStream.fflate.js",
     "bytes": 8316,
     "sha256": "f69051fed492e352a63c9a82f12269f06a710ab4132ef7e9c59c727a8a0be01e"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromStream.js",
     "bytes": 503,
     "sha256": "7a9838f8e243cc38f04c9c03936df71b85c3613283f735e8e5536a69edd005b8"
    },
    {
     "path": "node_modules/read-excel-file/modules/zip/unzipFromStream.unzipper.js",
     "bytes": 5209,
     "sha256": "cdcd9fe86915a37f14755dc2e04176ba59fd76089b3007387326d61ee8acd65c"
    },
    {
     "path": "node_modules/read-excel-file/node/index.cjs",
     "bytes": 624,
     "sha256": "a2007ede75221ca661c1208edf336299d128b98b155d07aa4aba1e515d01e2d6"
    },
    {
     "path": "node_modules/read-excel-file/node/index.js",
     "bytes": 529,
     "sha256": "7bc99af654b46cb5d3e6b35980abb4a79aa3ca78cfa247832344b87f46ad9cbe"
    },
    {
     "path": "node_modules/read-excel-file/node/package.json",
     "bytes": 342,
     "sha256": "31f7905db00a44adde4d9bf29e5f64f3dab9929851f8daeafc7b7f67dccb0e60"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/LICENSE",
     "bytes": 1298,
     "sha256": "4da724fc305d81606b245b324d4d2586916b9d248b23d82183df753ace0fdf71"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/conventions.js",
     "bytes": 13399,
     "sha256": "da57fbe2b07f5a4aaee9217b49778936c11a1108da1761b2f24f356a900ff124"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/dom-parser.js",
     "bytes": 20276,
     "sha256": "4188e24b953e2c70b66150306c66547495ad968d040e31dd65f22a7b3485da28"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/dom.js",
     "bytes": 133234,
     "sha256": "bea9ba89adfec227e9e572ee934a48223a170c5cf96b7087d7e3d3023ac47be3"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/entities.js",
     "bytes": 44533,
     "sha256": "ef333b680379392e8ee120e1cc77e0a8ff99a135e3b365b048f69c0df5f571f9"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/errors.js",
     "bytes": 6817,
     "sha256": "3e97f9c4f0a189346e2621b29c7c5a3899cd7375d1d15cbfbddd044fb781cb9f"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/grammar.js",
     "bytes": 23776,
     "sha256": "144f27b46adfb4a139adeb7483820def568b3940a6893194c03f5a71a94babc0"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/index.js",
     "bytes": 1595,
     "sha256": "418c42598a45290498f4350b6b6f531ceeb25e8d4d9a107db2448a1c0b5b784e"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/lib/sax.js",
     "bytes": 32465,
     "sha256": "324e8a0c7b475c645efcd1736b634733e133150849bff741fa0e2215e7017d02"
    },
    {
     "path": "node_modules/read-excel-file/node_modules/@xmldom/xmldom/package.json",
     "bytes": 2253,
     "sha256": "b61c2dd342e0e1abb800302ec62c0b06ae7a07cd9b907c88428ff80100f64c6a"
    },
    {
     "path": "node_modules/read-excel-file/package.json",
     "bytes": 3245,
     "sha256": "c25ac56f9b486ced8a50d5a5bf2ce824602264fd509665ab248ab28d6d4dc32e"
    },
    {
     "path": "node_modules/read-excel-file/universal/index.cjs",
     "bytes": 639,
     "sha256": "f1268e8a4bd3005db8925796100e5b873a0945a204030b6b3b923c35b9ed3d26"
    },
    {
     "path": "node_modules/read-excel-file/universal/index.js",
     "bytes": 539,
     "sha256": "942ced4c4cb994d0c6927e21d2da5441c2b379304b87836d553b880651dda0e6"
    },
    {
     "path": "node_modules/read-excel-file/universal/package.json",
     "bytes": 347,
     "sha256": "7fb6e340f86bb7368b09579dbf54db8ed18f9a0465b29790090b0ee8e4fa5d49"
    },
    {
     "path": "node_modules/read-excel-file/web-worker/index.cjs",
     "bytes": 639,
     "sha256": "b789a568f31305d0c6af928abc6381f7b638ca4c661e25424610e081889d3518"
    },
    {
     "path": "node_modules/read-excel-file/web-worker/index.js",
     "bytes": 537,
     "sha256": "64fbccb192edefffc13ef920d514ffece4900d50c467ac68075dd8235bd26fca"
    },
    {
     "path": "node_modules/read-excel-file/web-worker/package.json",
     "bytes": 348,
     "sha256": "25d1505b0639097e39543940204ac893ff08845b4df5fdcc6d3eaedca1eaf36f"
    }
   ]
  }
 ]
};

export function expectedParserIdentities(id){if(!Object.hasOwn(parserIdentities,id))fail('parser extension identity');return structuredClone(parserIdentities[id]);}
function verifyParsers(archive,id){
 const parsers=expectedParserIdentities(id);
 for(const parser of parsers){
  const prefix='extension/node_modules/'+parser.name+'/',entries=archive.entries.filter(entry=>entry.kind==='file'&&entry.path.startsWith(prefix)).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  if(JSON.stringify(entries.map(entry=>entry.path.slice('extension/'.length)))!==JSON.stringify(parser.payload.map(row=>row.path)))fail('parser inventory mismatch');
  const metadata=JSON.parse(archive.readEntry(prefix+'package.json').toString('utf8'));if(metadata.name!==parser.name||metadata.version!==parser.version)fail('parser version mismatch');
  for(let index=0;index<entries.length;index++)if(entries[index].bytes!==parser.payload[index].bytes||entries[index].sha256!==parser.payload[index].sha256)fail('parser payload mismatch');
 }
 return parsers;
}
function verifySourceParserIdentities(sourceRoot){
 for(const id of ids){const folder=path.join(sourceRoot,'extensions',id.slice('local.'.length)),lock=JSON.parse(fs.readFileSync(noAlias(path.join(folder,'package-lock.json')),'utf8'));
  for(const parser of expectedParserIdentities(id)){
   const locked=lock.packages['node_modules/'+parser.name];if(locked?.version!==parser.version||locked.integrity!==parser.integrity)fail('source parser lock mismatch');
   for(const expected of parser.payload){const bytes=fs.readFileSync(noAlias(path.join(folder,expected.path)));if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256)fail('source parser payload mismatch');}
  }
 }
}

export async function validateArtifactManifest(manifest){
 try{
  exactObject(manifest,['schemaVersion','sourceHeadSha','sourceTreeSha','compiledModules','extensions','fixtures']);
  if(manifest.schemaVersion!=='bob-builtin-analyze/t14-installed-artifacts/v1'||!/^[0-9a-f]{40}$/.test(manifest.sourceHeadSha)||!/^[0-9a-f]{40}$/.test(manifest.sourceTreeSha))fail('source identity');
  const compiled=compiledRows(manifest.compiledModules);if(!Array.isArray(manifest.extensions)||manifest.extensions.length!==2)fail('extension inventory');
  const archives=manifest.extensions.map((item,index)=>{exactObject(item,['id','vsix']);if(item.id!==ids[index])fail('extension identity');const archive=validateVsixArchive(readBinding(item.vsix,index===0?12000000:11000000));const pkg=JSON.parse(archive.readEntry('extension/package.json').toString('utf8'));if(pkg.publisher+'.'+pkg.name!==item.id||pkg.main!=='./out/extension.js')fail('installed extension manifest');return{archive,digest:verifyCopy(archive,compiled),parsers:verifyParsers(archive,item.id)};});
  if(archives[0].digest!==archives[1].digest)fail('extensions copied different builds');
  if(!Array.isArray(manifest.fixtures)||manifest.fixtures.length!==fixtureNames.length)fail('fixture inventory');
  const fixtures=manifest.fixtures.map((input,index)=>{exactObject(input,['name','path','bytes','sha256']);if(input.name!==fixtureNames[index])fail('fixture name');const positive=row({path:input.path,bytes:input.bytes,sha256:input.sha256});return{name:input.name,bytes:readBinding(positive,25*1048576),binding:positive};});
  return{manifest,compiled,archives,fixtures};
 }catch(error){if(error.message?.startsWith('artifact verification:'))throw error;fail('invalid artifact input');}
}
function claimRoot(directory){
 if(typeof directory!=='string'||!path.isAbsolute(directory))fail('absolute fresh evidence root required');const absolute=path.resolve(directory);
 const workbench=path.join(absolute,'vscode-cache/vscode-win32-x64-archive-1.106.1/resources/app/out/vs/code/electron-browser/workbench/workbench.html');
 if(process.platform==='win32'&&workbench.length>=260)fail('Windows renderer path exceeds 259 characters; choose a shorter fresh physical evidence root');
 if(fs.existsSync(absolute)){noAlias(absolute);if(!fs.statSync(absolute).isDirectory()||fs.readdirSync(absolute).length)fail('evidence root must be fresh and empty');}else{noAlias(path.dirname(absolute));fs.mkdirSync(absolute);}
 fs.writeFileSync(path.join(absolute,'owned.json'),JSON.stringify({schemaVersion:'bob-builtin-analyze/t14-owned-root/v1',pid:process.pid})+'\n',{flag:'wx'});return fs.realpathSync(absolute);
}
function freshChild(parent,prefix){noAlias(parent);const created=fs.mkdtempSync(path.toNamespacedPath(path.join(parent,prefix)));return path.join(parent,path.basename(created));}
export async function createArtifactManifest(sourceRoot,evidenceParent){
 if(!path.isAbsolute(sourceRoot)||!path.isAbsolute(evidenceParent))fail('absolute preparation paths required');noAlias(sourceRoot);noAlias(evidenceParent);
 verifySourceParserIdentities(sourceRoot);
 const inputRoot=freshChild(evidenceParent,'artifact-inputs-'),build=require(path.join(sourceRoot,'packages/processing-budget-runtime/scripts/build-runtime.js')).verifiedBuild();
 const extensions=ids.map(id=>{const name=id.slice('local.'.length),folder=path.join(sourceRoot,'extensions',name),pkg=JSON.parse(fs.readFileSync(path.join(folder,'package.json'),'utf8')),target=path.join(inputRoot,name+'.vsix');fs.copyFileSync(noAlias(path.join(folder,name+'-'+pkg.version+'.vsix')),target,fs.constants.COPYFILE_EXCL);return{id,vsix:binding(target)};});
 const fixtures=require(path.join(sourceRoot,'extensions/bob-bazaar-review/test/helpers/ruleDocumentFixtures.js'));
 const fixtureBytes=[fixtures.createDocxFixture(),fixtures.createXlsxFixture(),fixtures.createXlsxFixture({omitStyles:true}),fixtures.createDocxFixture({additionalEntries:[{name:'custom/bad-crc.bin',data:Buffer.from('tampered'),crc32:0}]}),Buffer.from('# REQ-ARTIFACT-001\nsource must remain intact\n')];
 const rows=fixtureNames.map((name,index)=>{const file=path.join(inputRoot,name);fs.writeFileSync(file,fixtureBytes[index],{flag:'wx'});return{name,...binding(file)};});
 const git=(...args)=>cp.execFileSync('git',args,{cwd:sourceRoot,encoding:'utf8',env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}}).trim();
 const manifest={schemaVersion:'bob-builtin-analyze/t14-installed-artifacts/v1',sourceHeadSha:git('rev-parse','HEAD'),sourceTreeSha:git('rev-parse','HEAD^{tree}'),compiledModules:build.payload,extensions,fixtures:rows};
 await validateArtifactManifest(manifest);const manifestPath=path.join(inputRoot,'manifest.json');fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifestPath;
}
export async function prepareInstalledArtifacts(manifest,evidenceRoot){
 const checked=await validateArtifactManifest(manifest),root=claimRoot(evidenceRoot),artifactsRoot=path.join(root,'artifacts'),workspaceRoot=path.join(root,'workspace'),probeRoot=path.join(root,'probe'),logsRoot=path.join(root,'logs');
 for(const directory of [artifactsRoot,workspaceRoot,probeRoot,logsRoot,path.join(root,'user-data'),path.join(root,'extensions'),path.join(root,'vscode-cache')])fs.mkdirSync(directory);
 const extensions=checked.archives.map(({archive},index)=>{
  const target=path.join(artifactsRoot,ids[index].slice('local.'.length));fs.mkdirSync(target);
  for(const entry of archive.entries.filter(entry=>entry.path.startsWith('extension/')&&entry.kind==='file')){const relative=entry.path.slice('extension/'.length),output=path.resolve(target,relative);if(!output.startsWith(target+path.sep))fail('extraction escape');fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,archive.readEntry(entry.path),{flag:'wx'});}
  return{id:ids[index],root:fs.realpathSync(target),parsers:checked.archives[index].parsers};
 });
 for(const item of checked.fixtures)fs.writeFileSync(path.join(workspaceRoot,item.name),item.bytes,{flag:'wx'});
 const config={sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,extensions,workspaceRoot,fixtures:manifest.fixtures,hostReceiptPath:path.join(logsRoot,'host-receipt.json')};
 fs.copyFileSync(path.join(repositoryRoot,'scripts/t14-bounded-document-installed-extension-host.test.js'),path.join(probeRoot,'test.js'),fs.constants.COPYFILE_EXCL);
 fs.writeFileSync(path.join(probeRoot,'config.json'),JSON.stringify(config,null,2)+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(probeRoot,'package.json'),JSON.stringify({name:'t14-artifact-probe',publisher:'local',version:'0.0.0',engines:{vscode:'^1.106.1'},main:'./main.js',activationEvents:[]})+'\n',{flag:'wx'});
 fs.writeFileSync(path.join(probeRoot,'main.js'),'exports.activate = () => {};\n',{flag:'wx'});
 return{root,config,probeRoot};
}
function pinnedHostRuntime(){
 const folder=path.join(repositoryRoot,'extensions/bob-bazaar-review/node_modules');
 for(const [name,version]of [['@vscode/test-cli','0.0.12'],['@vscode/test-electron','2.5.2']]){const dir=noAlias(path.join(folder,name));if(JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8')).version!==version)fail('pinned host tooling required after packaging');}
 return createRequire(path.join(repositoryRoot,'extensions/bob-bazaar-review/package.json'))('@vscode/test-electron');
}
export async function runInstalledSmoke(manifestPath,evidenceRoot){
 const manifest=JSON.parse(fs.readFileSync(noAlias(manifestPath),'utf8'));
 if(process.env.CI_VERIFIED_HEAD_SHA&&manifest.sourceHeadSha!==process.env.CI_VERIFIED_HEAD_SHA)fail('checkout guard identity changed');
 const prepared=await prepareInstalledArtifacts(manifest,evidenceRoot),{root,config,probeRoot}=prepared;
 const receipt={schemaVersion:'bob-builtin-analyze/t14-installed-smoke/v1',state:'failed',sourceHeadSha:manifest.sourceHeadSha,sourceTreeSha:manifest.sourceTreeSha,os:process.platform,developmentPayloadFiles:36,shippedRuntimeFilesPerExtension:12,artifacts:manifest.extensions,hostExit:null,productActivationProbe:'not_run',productDeactivationProbe:'not_run'};
 let failure;
 try{
  const {runTests}=pinnedHostRuntime();
  receipt.hostExit=await runTests({version:'1.106.1',cachePath:path.join(root,'vscode-cache'),extensionDevelopmentPath:[...config.extensions.map(item=>item.root),probeRoot],extensionTestsPath:path.join(probeRoot,'test.js'),reuseMachineInstall:false,launchArgs:[config.workspaceRoot,'--user-data-dir='+path.join(root,'user-data'),'--extensions-dir='+path.join(root,'extensions'),'--disable-telemetry','--disable-gpu'],extensionTestsEnv:{NODE_PATH:'',NODE_OPTIONS:'',ELECTRON_RUN_AS_NODE:undefined}});
  const host=JSON.parse(fs.readFileSync(config.hostReceiptPath,'utf8'));
  if(receipt.hostExit!==0||host.state!=='passed'||host.sourceHeadSha!==manifest.sourceHeadSha||host.sourceTreeSha!==manifest.sourceTreeSha||host.vscode!=='1.106.1'||JSON.stringify(host.cases.map(item=>item.name))!==JSON.stringify(requiredCases)||host.cases.some(item=>item.state!=='passed')||host.loadedModules.length!==24)fail('native host proof incomplete');
  for(const item of config.extensions){const actual=host.loadedModules.filter(row=>row.extensionRoot===item.root);if(actual.length!==12)fail('native module inventory');assertInstalledRuntimePaths(item.root,actual.map(row=>row.path));for(const loaded of actual){const expected=manifest.compiledModules.find(row=>row.path===path.basename(loaded.path)),bytes=fs.readFileSync(noAlias(loaded.path));if(!expected||bytes.length!==expected.bytes||sha(bytes)!==expected.sha256||loaded.bytes!==expected.bytes||loaded.sha256!==expected.sha256)fail('native module binding');}}
  if(!Array.isArray(host.parserIdentities)||host.parserIdentities.length!==8)fail('native parser inventory');
  for(const item of config.extensions){const loaded=host.parserIdentities.filter(row=>row.extensionRoot===item.root);if(loaded.length!==4)fail('native parser identity');for(const parser of item.parsers){const actual=loaded.find(row=>row.name===parser.name),expected=parser.payload.find(row=>row.path===actual?.relativePath);if(!actual||actual.version!==parser.version||actual.integrity!==parser.integrity||!expected)fail('native parser binding');const bytes=fs.readFileSync(noAlias(actual.path));if(bytes.length!==expected.bytes||sha(bytes)!==expected.sha256||actual.bytes!==expected.bytes||actual.sha256!==expected.sha256)fail('native parser hash');}}
  receipt.parserIdentities=host.parserIdentities;receipt.hostReceipt=binding(config.hostReceiptPath);receipt.state='passed';
 }catch(error){failure=error;receipt.failure=String(error?.message??error).slice(0,512);}
 fs.writeFileSync(path.join(root,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
 if(failure)throw failure;return receipt;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{if(process.argv.length!==6||process.argv[2]!=='--artifacts'||process.argv[4]!=='--evidence-root')fail('expected --artifacts and --evidence-root');const result=await runInstalledSmoke(path.resolve(process.argv[3]),process.argv[5]);process.stdout.write(JSON.stringify({state:result.state,hostExit:result.hostExit,sourceHeadSha:result.sourceHeadSha})+'\n');}
 catch(error){process.stderr.write(String(error?.message??error)+'\n');process.exitCode=1;}
}
