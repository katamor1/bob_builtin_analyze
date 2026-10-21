import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WorkflowEvidenceError,canonicalBytes} from './lib/primitives.mjs';
export async function runCiEvidence(argv){
 try{
  if(!Array.isArray(argv)||argv.some(x=>typeof x!=='string'||!x||x.startsWith('--')&&x!=='--bundles'))throw new WorkflowEvidenceError('evidence.ci.invalid');
  const api=await import('./lib/ciSubjects.mjs'),[mode,first,...rest]=argv,commitSha=await api.checkedOutCommit();
  if(mode==='prepare'&&first){
   let paths=rest,receipts=[];
   if(rest[0]==='--bundles'){
    if(rest.length!==4)throw new WorkflowEvidenceError('evidence.ci.invalid');
    const inputs=await Promise.all(rest.slice(1).map(d=>api.readCiSubjectBundle(d,commitSha,false)));if(inputs.some(x=>x.receipt.vsix.length!==1))throw new WorkflowEvidenceError('evidence.ci.invalid');receipts=inputs.map(x=>x.receipt);paths=inputs.flatMap(x=>x.subjects.map(row=>row.path));
   }
   if(![1,3].includes(paths.length))throw new WorkflowEvidenceError('evidence.ci.invalid');
   const bundle=await api.captureCiSubjects({commitSha,vsixPaths:paths,providerCatalogPath:api.CI_PROVIDER_CATALOG,collectionsPath:api.CI_COLLECTIONS});
   for(const receipt of receipts){const subset={...bundle.receipt,vsix:bundle.receipt.vsix.filter(row=>receipt.vsix.some(x=>x.owner.id===row.owner.id))};if(!canonicalBytes(receipt).equals(canonicalBytes(subset)))throw new WorkflowEvidenceError('evidence.ci.invalid');}
   await api.writeCiSubjectBundle(first,bundle);process.stdout.write(JSON.stringify(bundle.receipt)+'\n');return 0;
  }
  if(mode==='generate'&&first&&rest.length===1){const result=await api.generateCiEvidence({subjectDirectory:first,outputDirectory:rest[0],expectedCommitSha:commitSha});process.stdout.write(JSON.stringify(result)+'\n');return 0;}
  throw new WorkflowEvidenceError('evidence.ci.invalid');
 }catch(e){process.stderr.write(JSON.stringify({code:e instanceof WorkflowEvidenceError?e.code:e?.code==='MODULE_NOT_FOUND'?'evidence.build.required':'evidence.ci.failed'})+'\n');return 1;}
}
if(import.meta.main??Boolean(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)))process.exitCode=await runCiEvidence(process.argv.slice(2));
