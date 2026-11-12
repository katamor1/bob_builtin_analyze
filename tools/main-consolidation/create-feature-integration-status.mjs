import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {buildProgramIndex} from './featureIntegrationProgramPolicy.mjs'
import {renderIntegrationStatus} from './featureIntegrationStatusPolicy.mjs'
import {parseArguments} from './create-feature-integration-program-index.mjs'
import {digest,parseCanonicalArtifact} from './featureSelectionSourcePolicy.mjs'
const LEDGER=fileURLToPath(new URL('../../docs/release-evidence/feature-selection-ledger-2026-08-23.json',import.meta.url))
const COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wave0a-completion-2026-10-01.json',import.meta.url))
const WAVE0B_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wave0b-completion-2026-10-03.json',import.meta.url))
const P4_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-p4-completion-2026-10-04.json',import.meta.url))
const P5_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-p5-completion-2026-10-05.json',import.meta.url))
const P6_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-p6-completion-2026-10-08.json',import.meta.url))
const P7_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-p7-completion-2026-10-11.json',import.meta.url))
const GATE_P_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-gate-p-completion-2026-10-11.json',import.meta.url))
const GATE_R_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-gate-r-completion-2026-10-12.json',import.meta.url))
const R1_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-r1-completion-2026-10-17.json',import.meta.url))
const R2_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/wf2-r2-completion-2026-10-18.json',import.meta.url))
const OWNER_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/reg-bridge-owner-version-lifecycle-completion-2026-10-19.json',import.meta.url))
const DISCOVERY_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/reg-bridge-discovery-evidence-completion-2026-10-20.json',import.meta.url))
const T13_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/proc-t13-ledger-completion-2026-10-23.json',import.meta.url))
const T14_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/proc-t14-bounded-doc-completion-2026-10-24.json',import.meta.url))
const T15_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/proc-t15-aggregate-completion-2026-10-26.json',import.meta.url))
// Retain the source capture's original bytes, including its pretty JSON format.
function parseT15Source(bytes){const literal=Buffer.from(bytes);if(digest(literal)!=='59606e5e39ee9143e9a0fb63e1f4040bea68ab20fd8dd2376e73ebbcf21216aa')throw new TypeError('T15 literal source completion drift');return JSON.parse(literal)}
const T16_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/proc-t16-input-process-completion-2026-10-31.json',import.meta.url))
function parseT16Source(bytes){const literal=Buffer.from(bytes);if(digest(literal)!=='0de29738494e0835a09c034e64d32ccdc56a7027208372b03cbae57638fac9d5')throw new TypeError('T16 literal source completion drift');return JSON.parse(literal)}
const T17_DEADLINE_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/proc-t17-deadline-completion-2026-11-02.json',import.meta.url))
function parseT17DeadlineSource(bytes){const literal=Buffer.from(bytes);if(digest(literal)!=='ae9a2c39049d8ae44a4f82e81a8286693e4f4cf24bfa951c776463ae4130e5a9')throw new TypeError('T17 deadline literal source completion drift');return JSON.parse(literal)}
const T17_PATH_COMPLETION=fileURLToPath(new URL('../../docs/release-evidence/proc-t17-path-completion-2026-11-04.json',import.meta.url))
function parseT17PathSource(bytes){const literal=Buffer.from(bytes);if(digest(literal)!=='dd18d20dd09b5b12a1ccde9d18d774e8b97bf726af65d66e6bc51a84e96a7f94')throw new TypeError('T17 PATH literal source completion drift');return JSON.parse(literal)}
const OUTPUT=fileURLToPath(new URL('../../docs/release-evidence/feature-integration-status.json',import.meta.url))
export async function runGenerator(argv,{readFile:readInput,writeStdout}) {
 const {mode}=parseArguments(argv)
 const inputs={programIndex:buildProgramIndex(),ledger:parseCanonicalArtifact(await readInput(LEDGER)),completionObservations:[parseCanonicalArtifact(await readInput(COMPLETION)),parseCanonicalArtifact(await readInput(WAVE0B_COMPLETION)),parseCanonicalArtifact(await readInput(P4_COMPLETION)),parseCanonicalArtifact(await readInput(P5_COMPLETION)),parseCanonicalArtifact(await readInput(P6_COMPLETION)),parseCanonicalArtifact(await readInput(P7_COMPLETION)),parseCanonicalArtifact(await readInput(GATE_P_COMPLETION)),parseCanonicalArtifact(await readInput(GATE_R_COMPLETION)),parseCanonicalArtifact(await readInput(R1_COMPLETION)),parseCanonicalArtifact(await readInput(R2_COMPLETION)),parseCanonicalArtifact(await readInput(OWNER_COMPLETION)),parseCanonicalArtifact(await readInput(DISCOVERY_COMPLETION)),parseCanonicalArtifact(await readInput(T13_COMPLETION)),parseCanonicalArtifact(await readInput(T14_COMPLETION)),parseT15Source(await readInput(T15_COMPLETION)),parseT16Source(await readInput(T16_COMPLETION)),parseT17DeadlineSource(await readInput(T17_DEADLINE_COMPLETION)),parseT17PathSource(await readInput(T17_PATH_COMPLETION))]}
 const bytes=renderIntegrationStatus(inputs)
 if(mode==='print') return writeStdout(bytes)
 if(!Buffer.from(await readInput(OUTPUT)).equals(bytes)) throw new Error('integration status drift')
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 try{await runGenerator(process.argv.slice(2),{readFile,writeStdout:bytes=>process.stdout.write(bytes)})}
 catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1}
}
