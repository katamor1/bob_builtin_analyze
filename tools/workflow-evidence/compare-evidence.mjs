import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {WorkflowEvidenceError} from './lib/primitives.mjs';
export async function runEvidenceComparison(argv){
 try{if(!Array.isArray(argv)||argv.length!==2||argv.some(x=>typeof x!=='string'||!x||x.startsWith('--')))throw new WorkflowEvidenceError('evidence.ci.invalid');const {compareCiEvidenceDirectories}=await import('./lib/ciSubjects.mjs');process.stdout.write(JSON.stringify(await compareCiEvidenceDirectories(...argv))+'\n');return 0;}catch(e){process.stderr.write(JSON.stringify({code:e instanceof WorkflowEvidenceError?e.code:'evidence.ci.failed'})+'\n');return 1;}
}
if(import.meta.main??Boolean(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)))process.exitCode=await runEvidenceComparison(process.argv.slice(2));
