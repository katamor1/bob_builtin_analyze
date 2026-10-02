import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildProgramIndex, canonicalJson } from './featureIntegrationProgramPolicy.mjs'
import { buildSourceUniverse, validateSourceUniverse, parseCanonicalArtifact } from './featureSelectionSourcePolicy.mjs'
import { parseArguments } from './create-feature-integration-program-index.mjs'

const INPUT = fileURLToPath(new URL('./feature-selection-semantic-inventory.json', import.meta.url))
const OUTPUT = fileURLToPath(new URL('./feature-selection-source-universe.json', import.meta.url))
export function renderSourceUniverse(inputs) {
  const universe = buildSourceUniverse(inputs)
  const programIndex = buildProgramIndex()
  validateSourceUniverse(universe, { programIndex, archiveIdentities: programIndex.immutableArchives })
  return canonicalJson(universe)
}
export async function runGenerator(argv, { readFile: readInput, writeStdout }) {
  const { mode } = parseArguments(argv)
  const bytes = renderSourceUniverse(parseCanonicalArtifact(await readInput(INPUT), 'semantic inventory'))
  if (mode === 'print') return writeStdout(bytes)
  if (!Buffer.from(await readInput(OUTPUT)).equals(bytes)) throw new Error('source universe drift')
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { await runGenerator(process.argv.slice(2), { readFile, writeStdout: bytes => process.stdout.write(bytes) }) }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
}
