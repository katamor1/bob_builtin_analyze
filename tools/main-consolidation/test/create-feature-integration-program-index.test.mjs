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

test('source has no executor, provider, authorization, or filesystem-write boundary', () => {
  const source = readFileSync(GENERATOR, 'utf8')
  assert.doesNotMatch(source, /node:child_process/u)
  assert.doesNotMatch(source, /\b(?:spawn|execFile|writeFile|renderAuthenticated|collectExitedProcess)\b/u)
  assert.doesNotMatch(source, /\b(?:approval|transcript|provider|private)\b/iu)
})

test('CLI print and check are read-only and match the checked-in canonical bytes', () => {
  const print = spawnSync(process.execPath, [GENERATOR, '--print'], { encoding: 'buffer' })
  assert.equal(print.status, 0, print.stderr.toString())
  assert.deepEqual(print.stdout, canonical)
  const check = spawnSync(process.execPath, [GENERATOR, '--check'], { encoding: 'buffer' })
  assert.equal(check.status, 0, check.stderr.toString())
  assert.deepEqual(readFileSync(INDEX), canonical)
})
