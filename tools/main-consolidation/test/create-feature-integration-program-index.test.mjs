import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import * as generator from '../create-feature-integration-program-index.mjs'
import { buildProgramIndex, canonicalJson, validateProgramIndex } from '../featureIntegrationProgramPolicy.mjs'

const GENERATOR = fileURLToPath(new URL('../create-feature-integration-program-index.mjs', import.meta.url))
const INDEX = fileURLToPath(new URL('../feature-integration-program-index.json', import.meta.url))
const canonical = canonicalJson(buildProgramIndex())
const rejected = /exactly one|unknown|duplicate|positional|flag|argument/i
const ALLOWED_IMPORTS = [
  "import { readFile } from 'node:fs/promises'",
  "import { fileURLToPath } from 'node:url'",
  "import { buildProgramIndex, canonicalJson, validateProgramIndex } from './featureIntegrationProgramPolicy.mjs'"
]

function assertFixedLocalSourceBoundary(source) {
  assert.deepEqual(source.match(/^import .+$/gmu) ?? [], ALLOWED_IMPORTS)
  assert.doesNotMatch(source, /\b(?:import|require)\s*\(/u)
  assert.doesNotMatch(source, /\b(?:appendFile|copyFile|createWriteStream|mkdir|rename|rm|rmdir|symlink|truncate|unlink|writeFile)\b/u)
  assert.doesNotMatch(source, /\b(?:child_process|exec(?:File|Sync)?|fork|spawn|git|native(?:Bridge)?|bridge|powershell)\b/iu)
  assert.doesNotMatch(source, /\b(?:approval|transcript|provider|private)\b|process\.env|\bGIT_[A-Z_]*\b/u)
}

test('exports only the fixed local generator APIs', () => {
  assert.deepEqual(Object.keys(generator).sort(), ['parseArguments', 'renderProgramIndex', 'runGenerator'])
})

test('accepts exactly one read-only mode and rejects legacy selectors before I/O', async () => {
  assert.deepEqual(generator.parseArguments(['--check']), { mode: 'check' })
  assert.deepEqual(generator.parseArguments(['--print']), { mode: 'print' })
  const rejectedArgv = [
    [], ['--check', '--print'], ['--check', '--check'], ['--print', '--print'],
    ['output.json'], ['--check', 'output.json'], ['--write'], ['--approval-instruction', 'x'],
    ['--transcript', 'x'], ['--provider', 'x'], ['--private-path', 'x'], ['--repository-root', 'x']
  ]
  for (const argv of rejectedArgv) {
    let reads = 0
    let writes = 0
    await assert.rejects(() => generator.runGenerator(argv, {
      readFile: async () => { reads += 1; throw Error('unexpected read') },
      writeStdout: () => { writes += 1; throw Error('unexpected write') }
    }), rejected)
    assert.equal(reads, 0, argv.join(' '))
    assert.equal(writes, 0, argv.join(' '))
  }
})

test('renders the validated v2 program index as canonical bytes', () => {
  const bytes = generator.renderProgramIndex()
  assert.ok(Buffer.isBuffer(bytes))
  assert.deepEqual(bytes, canonical)
  assert.deepEqual(validateProgramIndex(JSON.parse(bytes)), JSON.parse(bytes))
})

test('print writes canonical bytes exactly once without reading', async () => {
  let reads = 0
  const writes = []
  await generator.runGenerator(['--print'], {
    readFile: async () => { reads += 1; throw Error('print must not read') },
    writeStdout: (bytes) => { writes.push(bytes) }
  })
  assert.equal(reads, 0)
  assert.equal(writes.length, 1)
  assert.deepEqual(writes[0], canonical)
})

test('check reads only the fixed sibling index and compares bytes without writing', async () => {
  const writes = []
  const reads = []
  await generator.runGenerator(['--check'], {
    readFile: async (path) => { reads.push(path); return canonical },
    writeStdout: (bytes) => { writes.push(bytes) }
  })
  assert.deepEqual(reads, [INDEX])
  assert.deepEqual(writes, [])
  await assert.rejects(() => generator.runGenerator(['--check'], {
    readFile: async () => Buffer.from('drift\n'),
    writeStdout: () => { throw Error('check must not write') }
  }), /drift/i)
})

test('source has only readFile filesystem access and no mutable or dynamic import boundary', () => {
  assertFixedLocalSourceBoundary(readFileSync(GENERATOR, 'utf8'))
  for (const api of ['appendFile', 'copyFile', 'createWriteStream', 'mkdir', 'rename', 'rm', 'rmdir', 'symlink', 'truncate', 'unlink', 'writeFile']) {
    assert.throws(() => assertFixedLocalSourceBoundary(`${ALLOWED_IMPORTS.join('\n')}\nimport { ${api} } from 'node:fs/promises'`), api)
  }
  assert.throws(() => assertFixedLocalSourceBoundary(`${ALLOWED_IMPORTS.join('\n')}\nawait import('node:fs')`), /import/u)
})

test('source boundary rejects execution, authority, and environment selectors', () => {
  for (const unsafe of ["import { spawn } from 'node:child_process'", "const command = 'git status'", 'const nativeBridge = true', 'const approval = process.env.APPROVAL', 'const selector = process.env.GIT_DIR']) {
    assert.throws(() => assertFixedLocalSourceBoundary(`${ALLOWED_IMPORTS.join('\n')}\n${unsafe}`))
  }
})

test('CLI print and check are read-only and match the checked-in canonical bytes', () => {
  const print = spawnSync(process.execPath, [GENERATOR, '--print'], { encoding: 'buffer' })
  assert.equal(print.status, 0, print.stderr.toString())
  assert.deepEqual(print.stdout, canonical)
  const check = spawnSync(process.execPath, [GENERATOR, '--check'], { encoding: 'buffer' })
  assert.equal(check.status, 0, check.stderr.toString())
  assert.deepEqual(readFileSync(INDEX), canonical)
})
