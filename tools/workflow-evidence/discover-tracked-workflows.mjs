import {isEvidenceCliMain,runEvidenceCli} from './lib/cli.mjs';
if(import.meta.main??isEvidenceCliMain(import.meta.url))process.exitCode=await runEvidenceCli(process.argv.slice(2),{mode:'discover'});
