import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {buildProgramIndex} from './featureIntegrationProgramPolicy.mjs'
import {renderIntegrationStatus} from './featureIntegrationStatusPolicy.mjs'
import {parseArguments} from './create-feature-integration-program-index.mjs'
import {parseCanonicalArtifact} from './featureSelectionSourcePolicy.mjs'
const LEDGER=fileURLToPath(new URL('../../docs/release-evidence/feature-selection-ledger-2026-08-23.json',import.meta.url))
const COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wave0a-completion-2026-10-01.json',import.meta.url))
const WAVE0B_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wave0b-completion-2026-10-03.json',import.meta.url))
const P4_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-p4-completion-2026-10-04.json',import.meta.url))
const OUTPUT=fileURLToPath(new URL('../../docs/release-evidence/feature-integration-status.json',import.meta.url))
export async function runGenerator(argv,{readFile:readInput,writeStdout}) {
 const {mode}=parseArguments(argv)
 const inputs={programIndex:buildProgramIndex(),ledger:parseCanonicalArtifact(await readInput(LEDGER)),completionObservations:[parseCanonicalArtifact(await readInput(COMPLETION)),parseCanonicalArtifact(await readInput(WAVE0B_COMPLETION)),parseCanonicalArtifact(await readInput(P4_COMPLETION))]}
 const bytes=renderIntegrationStatus(inputs)
 if(mode==='print') return writeStdout(bytes)
 if(!Buffer.from(await readInput(OUTPUT)).equals(bytes)) throw new Error('integration status drift')
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 try{await runGenerator(process.argv.slice(2),{readFile,writeStdout:bytes=>process.stdout.write(bytes)})}
 catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1}
}
