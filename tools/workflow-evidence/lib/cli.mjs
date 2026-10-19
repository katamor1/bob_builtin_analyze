import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {canonicalBytes,snapshotClosedData,reject,WorkflowEvidenceError} from './primitives.mjs';
import {captureEvidenceInputFile} from './vsixCapture.mjs';
import {publishEvidenceDirectory,publicationFailureReceipt} from './publishEvidence.mjs';
const require=createRequire(import.meta.url);
function parseArguments(input,mode){
 const argv=snapshotClosedData(input);if(!Array.isArray(argv)||!['discover','report'].includes(mode))reject('evidence.cli.invalid');
 const value={check:false},seen=new Set(),names=new Map([['--commit','commitSha'],['--subjects','subjects'],['--provider-catalog','providerCatalogPath'],['--collections','collectionsPath'],['--output-directory','outputDirectory']]);
 for(let i=0;i<argv.length;i++){const flag=argv[i];if(typeof flag!=='string'||seen.has(flag))reject('evidence.cli.invalid');seen.add(flag);if(flag==='--check'){value.check=true;continue;}const name=names.get(flag),argument=argv[++i];if(!name||typeof argument!=='string'||!argument||argument.startsWith('--'))reject('evidence.cli.invalid');value[name]=argument;}
 if(!/^[0-9a-f]{40}$/.test(value.commitSha??'')||!value.subjects||!value.providerCatalogPath||!value.collectionsPath||((mode==='report'||value.check)&&!value.outputDirectory))reject('evidence.cli.invalid');return value;
}
export async function runEvidenceCli(argv,{mode}={}){
 try{
  const options=parseArguments(argv,mode),{parseStrictJson}=require('../../../extensions/workflow-register/out/core/contractV2/packageLoaderInput.js');
  const [{captureWorkflowEvidenceSubject},{generateEvidenceBytes}]=await Promise.all([import('./evidenceSubject.mjs'),import('./contractReport.mjs')]);
  const descriptor=await captureEvidenceInputFile(options.subjects),bytes=descriptor.readBytes(),subjects=snapshotClosedData(parseStrictJson(bytes,'VSIX subjects'));if(!bytes.equals(canonicalBytes(subjects)))reject('evidence.cli.invalid');
  const subject=await captureWorkflowEvidenceSubject({commitSha:options.commitSha,vsixSubjects:subjects,providerCatalogPath:options.providerCatalogPath,collectionsPath:options.collectionsPath}),files=await generateEvidenceBytes(subject);
  if(options.outputDirectory){const receipt=await publishEvidenceDirectory({outputDirectory:options.outputDirectory,files,check:options.check});process.stdout.write(JSON.stringify({schemaVersion:'workflow-evidence-run-receipt/v1',commitSha:options.commitSha,sourceTreeSha:JSON.parse(files['report.json']).sourceTreeSha,publication:receipt})+'\n');}
  else process.stdout.write(files['discovery.json']);
  return 0;
 }catch(error){const safe=error instanceof WorkflowEvidenceError?error:new WorkflowEvidenceError(error?.code==='MODULE_NOT_FOUND'?'evidence.build.required':'evidence.cli.failed'),publication=publicationFailureReceipt(error);if(publication)process.stdout.write(JSON.stringify({schemaVersion:'workflow-evidence-run-receipt/v1',publication})+'\n');process.stderr.write(JSON.stringify({code:safe.code,diagnostics:safe.diagnostics})+'\n');return 1;}
}
export function isEvidenceCliMain(url){return Boolean(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(url));}
