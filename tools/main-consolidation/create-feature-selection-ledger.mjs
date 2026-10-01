import {readFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {buildProgramIndex} from './featureIntegrationProgramPolicy.mjs'
import {renderSelectionLedgerMarkdown,validateSelectionLedger,checkSelectionLedgerArtifacts} from './featureSelectionLedgerPolicy.mjs'
import {parseArguments} from './create-feature-integration-program-index.mjs'
const UNIVERSE=fileURLToPath(new URL('./feature-selection-source-universe.json',import.meta.url))
const LEDGER=fileURLToPath(new URL('../../docs/release-evidence/feature-selection-ledger-2026-08-23.json',import.meta.url))
const MARKDOWN=fileURLToPath(new URL('../../docs/release-evidence/feature-selection-ledger-2026-08-23.md',import.meta.url))
export async function runGenerator(argv,{readFile:readInput,writeStdout}) {
 const {mode}=parseArguments(argv)
 const universe=JSON.parse(await readInput(UNIVERSE)); const programIndex=buildProgramIndex()
 const ledgerBytes=Buffer.from(await readInput(LEDGER)); const ledger=JSON.parse(ledgerBytes)
 validateSelectionLedger(ledger,{universe,programIndex})
 if(mode==='print') return writeStdout(renderSelectionLedgerMarkdown(ledger))
 checkSelectionLedgerArtifacts({ledgerBytes,markdownBytes:Buffer.from(await readInput(MARKDOWN)),universe,programIndex})
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
 try {await runGenerator(process.argv.slice(2),{readFile,writeStdout:bytes=>process.stdout.write(bytes)})}
 catch(error){process.stderr.write(`${error.message}\n`);process.exitCode=1}
}
