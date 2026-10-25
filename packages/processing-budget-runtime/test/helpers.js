'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const cp = require('node:child_process');
const packageRoot = path.resolve(__dirname, '..');
function loadRuntime(moduleName = 'index') {
  if (!['generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','index'].includes(moduleName)) throw new Error('unknown runtime module');
  const entry = path.join(packageRoot,'out',moduleName+'.js');
  if (!fs.existsSync(entry)) throw new Error('processing budget build required');
  return require(entry);
}
function freshArtifactRoot(label) {
  if (!/^[a-z0-9-]+$/.test(label)) throw new Error('invalid artifact label');
  const parent = fs.realpathSync(process.env.PROCESSING_BUDGET_ARTIFACT_ROOT || os.tmpdir());
  const root = fs.mkdtempSync(path.join(parent, 'bob-processing-budget-ledger-' + label + '-'));
  fs.writeFileSync(path.join(root,'location.json'), JSON.stringify({absolute:root,physical:fs.realpathSync(root)},null,2)+'\n', {flag:'wx'});
  return root;
}

function byteBinding(file) {
  const bytes = fs.readFileSync(file);
  return {path:file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length};
}

function verifyBinding(binding) {
  const actual = byteBinding(binding.path);
  if (actual.sha256 !== binding.sha256 || actual.bytes !== binding.bytes) throw new Error('artifact binding mismatch');
}

function runNode(args, cwd) {
  const result = cp.spawnSync(process.execPath,args,{cwd,encoding:'utf8',maxBuffer:1024*1024,env:{...process.env,NODE_PATH:'',NODE_OPTIONS:''}});
  if (result.error || result.status !== 0) throw new Error('child verification failed: '+(result.error?.message || result.stderr || result.stdout));
  return result.stdout;
}

function npmCli() {
  const candidates = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
  const cli = candidates.find(p=>p && fs.existsSync(p));
  if (!cli) throw new Error('npm CLI unavailable');
  return cli;
}

const consumerNames = ['workflow-register','bob-bazaar-review','bob-code-consistency-review'];
const runtimeResult = {state:'passed',entry:'out/index.js',checks:['constructor','reserve_commit','release','snapshot','bounded_read','validated_ooxml','deep_import_rejected']};
function expectedPayload() {
  const files=['package.json','README.md','contracts/processing-budget-definition.v1.json','schema/processing-budget-profile.v1.schema.json'];
  for(const name of ['index','generatedProcessingBudgetDefinition','processingBudgetError','processingBudgetProfile','processingBudgetLedger','boundedDocumentError','boundedDocumentRequest','boundedDocumentFile','boundedDocumentIo','ooxmlPreflight','ooxmlParserInput','validatedOoxml']) {
    for(const suffix of ['js','d.ts','js.map']) files.push('out/'+name+'.'+suffix);
  }
  return files.sort();
}

function packAndInstall(root, outputRoot) {
  root=fs.realpathSync(root);outputRoot=fs.realpathSync(outputRoot);
  const config=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
  if(config.name!=='@bob/processing-budget-runtime'||Object.keys(config.dependencies||{}).length) throw new Error('unexpected package dependencies');
  const cache=path.join(outputRoot,'npm-cache');
  const packed=JSON.parse(runNode([npmCli(),'pack','--json','--ignore-scripts','--offline','--cache',cache,'--pack-destination',outputRoot],root));
  if(packed.length!==1||path.basename(packed[0].filename)!==packed[0].filename)throw new Error('unexpected pack result');
  const manifest=packed[0].files.map(x=>x.path).sort();
  if(JSON.stringify(manifest)!==JSON.stringify(expectedPayload()))throw new Error('unexpected package payload');
  const tarball=byteBinding(path.join(outputRoot,packed[0].filename));
  const consumerRoot=path.join(outputRoot,'consumer');fs.mkdirSync(consumerRoot);
  fs.writeFileSync(path.join(consumerRoot,'package.json'),JSON.stringify({name:'processing-budget-proof',version:'0.0.0',private:true})+'\n',{flag:'wx'});
  runNode([npmCli(),'install','--offline','--ignore-scripts','--no-audit','--no-fund','--cache',cache,tarball.path],consumerRoot);
  const consumerResults=[];
  for(const consumer of consumerNames){
    const name=consumer+'-consumer.ts';
    const original=fs.readFileSync(path.join(packageRoot,'test/fixtures',name),'utf8');
    if(!original.includes('from "../.."'))throw new Error('consumer import unavailable');
    fs.writeFileSync(path.join(consumerRoot,name),original.replaceAll('from "../.."','from "@bob/processing-budget-runtime"').replaceAll('from "../../out/validatedOoxml"','from "@bob/processing-budget-runtime/validated-ooxml"'),{flag:'wx'});
    const configPath=path.join(consumerRoot,consumer+'.tsconfig.json');
    const tsconfig=JSON.parse(fs.readFileSync(path.join(packageRoot,'test/fixtures/tsconfig.json'),'utf8'));
    delete tsconfig.include;tsconfig.files=[name];tsconfig.compilerOptions.typeRoots=[path.join(packageRoot,'node_modules/@types')];
    fs.writeFileSync(configPath,JSON.stringify(tsconfig),{flag:'wx'});
    runNode([path.join(packageRoot,'node_modules/typescript/bin/tsc'),'-p',configPath,'--noEmit'],consumerRoot);
    consumerResults.push({consumer,typecheck:'passed'});
  }
  const zip=require('fflate').zipSync({'[Content_Types].xml':Buffer.from('types'),'word/document.xml':Buffer.from('document')});
  fs.writeFileSync(path.join(consumerRoot,'source.docx'),zip,{flag:'wx'});
  const probe=`const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
    const entry=fs.realpathSync(require.resolve('@bob/processing-budget-runtime'));
    (async()=>{
    const installed=fs.realpathSync(path.resolve('node_modules/@bob/processing-budget-runtime'));
    assert.ok(entry.startsWith(installed+path.sep));
    const {ProcessingBudgetLedger}=require(entry),ledger=new ProcessingBudgetLedger();
    const p=ledger.reserveForTarget('single_document_bytes','packed',12);p.commit(7);
    ledger.reserve('raw_diff_bytes',5).release();const report=ledger.snapshot();
    assert.equal(report.schema_version,'processing-budget-ledger-report/v1');
    assert.equal(report.categories.find(x=>x.category==='total_operation_input_bytes').committed,7);
    assert.equal(report.categories.find(x=>x.category==='raw_diff_bytes').used,0);
    assert.ok(Object.isFrozen(report));
    const runtime=require(entry),filePath=path.resolve('source.docx'),rootPath=process.cwd(),maximumFileBytes=1024;
    const bounded=await runtime.readBoundedDocumentFile({filePath,rootPath,maximumFileBytes,target:'read',ledger:new ProcessingBudgetLedger()});assert.ok(bounded.copyBytes().equals(fs.readFileSync(filePath)));
    const expectedFingerprint=await runtime.fingerprintBoundedDocumentFile({filePath,rootPath,maximumFileBytes});
    const {withValidatedOoxmlParserInput}=require('@bob/processing-budget-runtime/validated-ooxml');let calls=0;
    const result=await withValidatedOoxmlParserInput({filePath,rootPath,maximumFileBytes,target:'parse',ledger:new ProcessingBudgetLedger(),expectedFingerprint,documentKind:'docx',structuralLimits:{maxEntries:5000,maxExpandedBytes:250*1048576},loadXlsxCodec:async()=>{throw Error('unexpected codec');}},async({parserInput})=>{calls++;assert.ok(parserInput.equals(fs.readFileSync(filePath)));return 'parsed';});
    assert.equal(result,'parsed');assert.equal(calls,1);assert.throws(()=>require('@bob/processing-budget-runtime/out/ooxmlParserInput'),e=>e.code==='ERR_PACKAGE_PATH_NOT_EXPORTED');
    process.stdout.write(JSON.stringify({entry}));})().catch(e=>{console.error(e);process.exitCode=1;});`;
  const installedResolvedPath=JSON.parse(runNode(['-e',probe],consumerRoot)).entry;
  const receiptPath=path.join(outputRoot,'pack-proof.json');
  fs.writeFileSync(receiptPath,JSON.stringify({schemaVersion:'bob-builtin-analyze/processing-budget-pack-proof/v1',node:process.version,tarball,manifest,consumerResults,runtimeResult,installedResolvedPath},null,2)+'\n',{flag:'wx'});
  return {tarball,manifest,consumerRoot,receipt:byteBinding(receiptPath)};
}

function publishCiArtifacts({head,tree,os:runnerOs,proof,outputRoot}) {
  if(!/^[0-9a-f]{40}$/.test(head)||!/^[0-9a-f]{40}$/.test(tree)||typeof runnerOs!=='string'||!runnerOs)throw new Error('invalid CI identity');
  verifyBinding(proof.tarball);verifyBinding(proof.receipt);
  const local=JSON.parse(fs.readFileSync(proof.receipt.path,'utf8'));
  if(JSON.stringify(local.tarball)!==JSON.stringify(proof.tarball)||JSON.stringify(local.manifest)!==JSON.stringify(proof.manifest))throw new Error('proof binding mismatch');
  if(JSON.stringify(local.manifest)!==JSON.stringify(expectedPayload())||JSON.stringify(local.runtimeResult)!==JSON.stringify(runtimeResult)||JSON.stringify(local.consumerResults)!==JSON.stringify(consumerNames.map(consumer=>({consumer,typecheck:'passed'}))))throw new Error('incomplete package proof');
  const output=path.join(fs.realpathSync(outputRoot),'publish');fs.mkdirSync(output);
  fs.copyFileSync(proof.tarball.path,path.join(output,'runtime.tgz'),fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(output,'package-manifest.json'),JSON.stringify(proof.manifest,null,2)+'\n',{flag:'wx'});
  const files=['runtime.tgz','package-manifest.json'].map(name=>({...byteBinding(path.join(output,name)),path:name}));
  const receipt={schemaVersion:'bob-builtin-analyze/processing-budget-ci-evidence/v1',sourceHeadSha:head,sourceTreeSha:tree,os:runnerOs,files,consumerResults:local.consumerResults,runtimeResult:local.runtimeResult};
  fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  return output;
}
module.exports={packageRoot,loadRuntime,freshArtifactRoot,packAndInstall,publishCiArtifacts};
