import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { buildProgramIndex, canonicalJson, validateProgramIndex } from './featureIntegrationProgramPolicy.mjs'

const INDEX_PATH = fileURLToPath(new URL('./feature-integration-program-index.json', import.meta.url))

export function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 1 || (argv[0] !== '--check' && argv[0] !== '--print')) {
    throw new Error('exactly one --check or --print flag is required')
  }
  return { mode: argv[0].slice(2) }
}

export function renderProgramIndex() {
  const index = buildProgramIndex()
  validateProgramIndex(index)
  return canonicalJson(index)
}

export async function runGenerator(argv, { readFile: readIndex, writeStdout } = {}) {
  const { mode } = parseArguments(argv)
  if (typeof readIndex !== 'function' || typeof writeStdout !== 'function') throw new TypeError('read-only I/O is required')
  const bytes = renderProgramIndex()
  if (mode === 'print') {
    writeStdout(bytes)
    return
  }
  const existing = Buffer.from(await readIndex(INDEX_PATH))
  if (!existing.equals(bytes)) throw new Error('program index drift')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await runGenerator(process.argv.slice(2), { readFile, writeStdout: (bytes) => process.stdout.write(bytes) })
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
