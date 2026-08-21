import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { freezeCarrierPatches, verifyPatchedTree } from '../freeze-carrier-patches.mjs'

test('freezes a binary full-index patch and reconstructs text, mode, rename, delete, and binary changes', async () => {
  const fixture = await createCarrierFixture()
  try {
    const statusBefore = gitBuffer(fixture.repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    const calls = []
    const run = actualRunner(fixture.repository, calls)
    const evidence = await freezeCarrierPatches({
      map: { carriers: [fixture.carrier] },
      repoRoot: fixture.repository,
      carrierDirectory: fixture.carrierDirectory,
      run
    })

    assert.equal(evidence.length, 1)
    assert.deepEqual(evidence[0].pullRequests, [101])
    assert.equal(evidence[0].fromSha, fixture.fromSha)
    assert.equal(evidence[0].toSha, fixture.toSha)
    assert.equal(evidence[0].reconstructedTreeSha, fixture.targetTree)
    assert.equal(evidence[0].targetTreeSha, fixture.targetTree)
    assert.equal(evidence[0].commitCount, 1)
    assert.equal(evidence[0].pathCount, 6)
    assert.match(evidence[0].sha256, /^[0-9a-f]{64}$/u)
    assert.ok(evidence[0].byteSize > 0)
    assert.equal(existsSync(path.join(fixture.carrierDirectory, 'workflow-a.patch')), true)
    const manifest = JSON.parse(await readFile(path.join(fixture.carrierDirectory, 'carrier-patches.json'), 'utf8'))
    assert.equal(manifest.schemaVersion, 'bob-builtin-analyze/carrier-patches/v1')
    assert.deepEqual(manifest.carriers, evidence)
    assert.deepEqual(gitBuffer(fixture.repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all']), statusBefore)

    const patchCall = calls.find((call) => call.args[0] === 'diff' && call.args.some((value) => value.startsWith('--output=')))
    assert.match(patchCall.args[3], /^--output=.+\.tmp$/u)
    assert.deepEqual(calls.filter((call) => call.args[0] === 'diff').map((call) => call.args), [
      ['diff', '--binary', '--full-index', patchCall.args[3], fixture.fromSha, fixture.toSha],
      ['diff', '--name-only', fixture.fromSha, fixture.toSha]
    ])
    assert.equal(calls.every((call) => call.command === 'git' && call.options.shell !== true && call.options.cwd === fixture.repository), true)
    assert.equal(calls.filter((call) => call.args[0] === 'read-tree').length, 1)
    assert.equal(calls.filter((call) => call.args[0] === 'apply').length, 1)
    assert.equal(calls.filter((call) => call.args[0] === 'write-tree').length, 1)
    const indexFile = calls.find((call) => call.args[0] === 'read-tree').options.env.GIT_INDEX_FILE
    assert.equal(path.relative(fixture.repository, indexFile).startsWith('..'), true)
    assert.equal(existsSync(indexFile), false)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('fails closed when --binary is omitted, the range is reversed, or one patch byte is corrupted', async (t) => {
  for (const mutation of ['omit-binary', 'reverse-range', 'corrupt-byte']) {
    await t.test(mutation, async () => {
      const fixture = await createCarrierFixture()
      try {
        const run = mutatingRunner(fixture.repository, mutation)
        await assert.rejects(freezeCarrierPatches({
          map: { carriers: [fixture.carrier] },
          repoRoot: fixture.repository,
          carrierDirectory: fixture.carrierDirectory,
          run
        }), /patch|tree|apply|reconstruct/u)
        assert.equal(existsSync(path.join(fixture.carrierDirectory, 'workflow-a.patch')), false)
        assert.equal(existsSync(path.join(fixture.carrierDirectory, 'carrier-patches.json')), false)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
})

test('verifyPatchedTree rejects a reconstructed tree that differs from the target', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'carrier-tree-mismatch-'))
  const indexPath = path.join(root, 'index')
  const repositoryRoot = path.join(root, 'repository')
  const target = '1'.repeat(40)
  const reconstructed = '2'.repeat(40)
  const run = (_command, args) => {
    if (args[0] === 'write-tree') return { status: 0, stdout: `${reconstructed}\n`, stderr: '' }
    if (args[0] === 'rev-parse') return { status: 0, stdout: `${target}\n`, stderr: '' }
    return { status: 0, stdout: '', stderr: '' }
  }
  try {
    await assert.rejects(verifyPatchedTree({
      fromSha: 'a'.repeat(40),
      toSha: 'b'.repeat(40),
      patchPath: path.join(root, 'carrier.patch'),
      run,
      temporaryIndex: indexPath,
      repoRoot: repositoryRoot
    }), /reconstructed tree does not match/u)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('exclusive publication refuses an existing carrier patch without overwriting it', async () => {
  const fixture = await createCarrierFixture()
  try {
    await mkdir(fixture.carrierDirectory, { recursive: true })
    const target = path.join(fixture.carrierDirectory, 'workflow-a.patch')
    await writeFile(target, 'preserve-existing-patch')
    await assert.rejects(freezeCarrierPatches({
      map: { carriers: [fixture.carrier] },
      repoRoot: fixture.repository,
      carrierDirectory: fixture.carrierDirectory,
      run: actualRunner(fixture.repository)
    }), /already exists/u)
    assert.equal(await readFile(target, 'utf8'), 'preserve-existing-patch')
    assert.equal(existsSync(path.join(fixture.carrierDirectory, 'carrier-patches.json')), false)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

async function createCarrierFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'carrier-patch-'))
  const repository = path.join(root, 'repository')
  const carrierDirectory = path.join(root, 'archive-staging', 'carrier-patches')
  gitRaw(['init', '--initial-branch=main', repository])
  git(repository, ['config', 'user.email', 'carrier-test@example.test'])
  git(repository, ['config', 'user.name', 'Carrier Test'])
  await writeFile(path.join(repository, 'edited.txt'), 'before\n')
  await writeFile(path.join(repository, 'mode.sh'), '#!/bin/sh\necho before\n')
  await writeFile(path.join(repository, 'rename-me.txt'), 'rename content\n')
  await writeFile(path.join(repository, 'delete-me.txt'), 'delete content\n')
  await writeFile(path.join(repository, 'binary.bin'), Buffer.from([0, 1, 2, 3, 0, 255]))
  git(repository, ['add', '.'])
  git(repository, ['commit', '-m', 'base'])
  const fromSha = git(repository, ['rev-parse', 'HEAD']).trim()

  await writeFile(path.join(repository, 'edited.txt'), 'after\n')
  await writeFile(path.join(repository, 'mode.sh'), '#!/bin/sh\necho after\n')
  await chmod(path.join(repository, 'mode.sh'), 0o755)
  git(repository, ['update-index', '--chmod=+x', 'mode.sh'])
  git(repository, ['mv', 'rename-me.txt', 'renamed.txt'])
  git(repository, ['rm', 'delete-me.txt'])
  await writeFile(path.join(repository, 'binary.bin'), Buffer.from([0, 9, 8, 7, 0, 254, 253]))
  await writeFile(path.join(repository, 'added.txt'), 'added\n')
  git(repository, ['add', '.'])
  git(repository, ['commit', '-m', 'target'])
  const toSha = git(repository, ['rev-parse', 'HEAD']).trim()
  const targetTree = git(repository, ['rev-parse', `${toSha}^{tree}`]).trim()
  return {
    root,
    repository,
    carrierDirectory,
    fromSha,
    toSha,
    targetTree,
    carrier: { id: 'workflow-a', fromSha, toSha, pullRequests: [101] }
  }
}

function actualRunner(repository, calls = []) {
  return (command, args, options = {}) => {
    calls.push({ command, args: [...args], options })
    const result = spawnSync(command, args, {
      cwd: options.cwd ?? repository,
      env: options.env,
      shell: false,
      encoding: options.encoding ?? 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
    return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
  }
}

function mutatingRunner(repository, mutation) {
  const run = actualRunner(repository)
  return (command, originalArgs, options = {}) => {
    let args = [...originalArgs]
    const isPatchDiff = args[0] === 'diff' && args.some((value) => value.startsWith('--output='))
    if (isPatchDiff) {
      if (mutation === 'omit-binary') args = args.flatMap((value) => value === '--binary' ? ['--no-binary'] : [value])
      if (mutation === 'reverse-range') [args[args.length - 2], args[args.length - 1]] = [args[args.length - 1], args[args.length - 2]]
    }
    const result = run(command, args, options)
    const output = args.find((value) => value.startsWith('--output='))
    if (mutation === 'corrupt-byte' && result.status === 0 && output) {
      const patchPath = output.slice('--output='.length)
      const bytes = execFileSync(process.execPath, ['-e', `process.stdout.write(require('fs').readFileSync(${JSON.stringify(patchPath)}))`])
      writeFileSync(patchPath, bytes.subarray(0, Math.max(1, Math.floor(bytes.length / 2))))
    }
    return result
  }
}

function git(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function gitRaw(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function gitBuffer(repository, args) {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] })
}
