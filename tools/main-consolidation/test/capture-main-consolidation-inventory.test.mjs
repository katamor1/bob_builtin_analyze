import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  captureMainConsolidationInventory,
  inventoryFromObservations,
  parseRemoteRefs,
  parseWorktreePorcelain,
  renderInventoryMarkdown
} from '../capture-main-consolidation-inventory.mjs'
import { flattenLegacyHeads } from '../consolidationPolicy.mjs'

const mapUrl = new URL('../consolidation-map.json', import.meta.url)
const map = JSON.parse(await readFile(mapUrl, 'utf8'))
const mainSha = 'a'.repeat(40)
const processSha = 'b'.repeat(40)
const externalSha = 'c'.repeat(40)

test('parses exact heads without accepting symbolic or malformed refs', () => {
  assert.deepEqual([...parseRemoteRefs(`${'a'.repeat(40)}\trefs/heads/main\n`)], [['main', 'a'.repeat(40)]])
  assert.throws(() => parseRemoteRefs('ref: refs/heads/main\tHEAD\n'), /invalid remote head/)
  assert.throws(() => parseRemoteRefs(`${'a'.repeat(40)}\trefs/tags/v1\n`), /invalid remote head/)
  assert.throws(() => parseRemoteRefs(`${'a'.repeat(40)}\trefs/heads/main\n${'b'.repeat(40)}\trefs/heads/main\n`), /duplicate remote head/)
})

test('parses complete worktree porcelain records and rejects incomplete records', () => {
  assert.deepEqual(parseWorktreePorcelain(`worktree C:/repo\nHEAD ${mainSha}\nbranch refs/heads/main\n\n`), [
    { path: 'C:/repo', head: mainSha, branch: 'refs/heads/main', detached: false, status: [] }
  ])
  assert.throws(() => parseWorktreePorcelain('worktree C:/repo\nbranch refs/heads/main\n'), /invalid worktree record/)
})

test('only the primary root may contain the approved integration-clone entry', () => {
  const evidence = inventoryFromObservations({
    topology: validTopology(),
    primaryStatus: ['?? .integration-xlsx-on-prereq/'],
    currentWorktreeStatus: ['?? .integration-xlsx-on-prereq/'],
    worktrees: [{ path: 'C:/repo', head: mainSha, branch: 'refs/heads/main', detached: false, status: [] }],
    externalRepositories: [],
    artifacts: []
  })
  assert.equal(evidence.readyForArchive, false)
  assert.ok(evidence.blockers.some((blocker) => blocker.includes('invoking worktree is dirty')))
})

test('inventory records dirty state and blocks archive readiness', () => {
  const evidence = inventoryFromObservations({
    topology: { readyForArchive: true, mainSha, legacyHeadCount: 30, processHeadCount: 1, openPullRequestCount: 20 },
    primaryStatus: ['?? .integration-xlsx-on-prereq/'],
    worktrees: [{ path: 'C:/repo', head: mainSha, branch: 'refs/heads/main', detached: false, status: [] }],
    externalRepositories: [{ label: 'integration-xlsx-on-prereq', path: 'C:/external', head: 'b'.repeat(40), branch: 'codex/fix-bazaar-minimal-xlsx-final', status: [' M file.txt'] }],
    artifacts: []
  })
  assert.equal(evidence.readyForArchive, false)
  assert.match(renderInventoryMarkdown(evidence), /integration-xlsx-on-prereq.*dirty/u)
})

test('capture runs the approved read-only observations and atomically writes ready evidence', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'main-consolidation-inventory-'))
  try {
    const jsonPath = path.join(temporary, 'inventory.json')
    const markdownPath = path.join(temporary, 'inventory.md')
    const externalPath = path.join(temporary, 'external')
    const artifactPath = path.join(temporary, 'artifact.vsix')
    const calls = []
    const result = await captureMainConsolidationInventory(baseArguments({ jsonPath, markdownPath, externalPath, artifactPath }), {
      readFile: async (filePath) => filePath === mapUrl.pathname ? JSON.stringify(map) : Buffer.from('artifact'),
      lstat: async (filePath) => ({ isSymbolicLink: () => false, isDirectory: () => filePath === externalPath, isFile: () => filePath === artifactPath, size: 8 }),
      run(command, args) {
        calls.push([command, args])
        return observationFor(command, args)
      }
    })

    assert.equal(result.exitCode, 0)
    assert.equal(result.evidence.readyForArchive, true)
    assert.deepEqual(Object.keys(result.evidence), [
      'schemaVersion', 'generatedAt', 'repository', 'readyForArchive', 'topology', 'remoteHeads', 'openPullRequests', 'localBranches', 'worktrees', 'externalRepositories', 'artifacts', 'blockers'
    ])
    assert.deepEqual(result.evidence.topology, validTopology())
    assert.deepEqual(result.evidence.remoteHeads, expectedRemoteHeads())
    assert.deepEqual(result.evidence.openPullRequests, openPullRequests().map(({ number, headRefName, headRefOid, baseRefName, url }) => ({ number, headRefName, headRefOid, baseRefName, url })).sort((left, right) => left.number - right.number))
    assert.deepEqual(result.evidence.localBranches, [
      { branch: 'codex/main-consolidation-control-plane', sha: processSha },
      { branch: 'main', sha: mainSha }
    ])
    assert.deepEqual(result.evidence.worktrees, [{ path: 'C:/repo', head: mainSha, branch: 'refs/heads/main', detached: false, status: [] }])
    assert.deepEqual(result.evidence.externalRepositories, [{ label: 'integration-xlsx-on-prereq', path: externalPath, head: externalSha, branch: 'codex/fix-bazaar-minimal-xlsx-final', status: [] }])
    assert.deepEqual(result.evidence.artifacts, [{ label: 'old-vsix', sourcePath: artifactPath, byteSize: 8, sha256: 'c7c5c1d70c5dec4416ab6158afd0b223ef40c29b1dc1f97ed9428b94d4cadb1c' }])
    assert.deepEqual(result.evidence.blockers, [])
    assert.deepEqual(calls.slice(0, 8), [
      ['git', ['fetch', '--no-tags', 'origin', '+refs/heads/*:refs/remotes/origin/*']],
      ['git', ['rev-parse', 'refs/remotes/origin/main']],
      ['git', ['merge-base', '--is-ancestor', map.baselineMain, 'refs/remotes/origin/main']],
      ['git', ['ls-remote', '--heads', 'origin']],
      ['git', ['for-each-ref', '--sort=refname', '--format=%(refname:short)%09%(objectname)', 'refs/heads']],
      ['git', ['worktree', 'list', '--porcelain']],
      ['git', ['status', '--porcelain=v1']],
      ['gh', ['api', 'repos/katamor1/bob_builtin_analyze', '--jq', '.default_branch']]
    ])
    assert.ok(calls.some(([command, args]) => command === 'git' && args[0] === '-c' && args[1] === `safe.directory=${externalPath}`))
    assert.ok(calls.every(([command, args]) => command !== 'git' || !['config', 'push', 'checkout', 'reset', 'branch'].includes(args[0])))
    assert.equal(JSON.parse(await readFile(jsonPath, 'utf8')).readyForArchive, true)
    assert.match(await readFile(markdownPath, 'utf8'), /Ready for archive: \*\*yes\*\*/u)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('capture fails closed before writing ready evidence when remote heads mutate', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'main-consolidation-inventory-'))
  try {
    const jsonPath = path.join(temporary, 'inventory.json')
    const markdownPath = path.join(temporary, 'inventory.md')
    await assert.rejects(
      captureMainConsolidationInventory(baseArguments({
        jsonPath,
        markdownPath,
        externalPath: path.join(temporary, 'external'),
        artifactPath: path.join(temporary, 'artifact.vsix')
      }), {
        readFile: async (filePath) => filePath === mapUrl.pathname ? JSON.stringify(map) : Buffer.from('artifact'),
        lstat: async (filePath) => ({ isSymbolicLink: () => false, isDirectory: () => filePath.endsWith('external'), isFile: () => filePath.endsWith('artifact.vsix'), size: 8 }),
        run(command, args) {
          return observationFor(command, args, { unexpectedRemote: true })
        }
      }),
      /unexpected remote branch/
    )
    await assert.rejects(readFile(jsonPath, 'utf8'))
    await assert.rejects(readFile(markdownPath, 'utf8'))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('capture removes credentials from runner failures', async () => {
  await assert.rejects(
    captureMainConsolidationInventory(baseArguments({
      jsonPath: 'C:/safe/inventory.json',
      markdownPath: 'C:/safe/inventory.md',
      externalPath: 'C:/safe/external',
      artifactPath: 'C:/safe/artifact.vsix'
    }), {
      readFile: async () => JSON.stringify(map),
      lstat: async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 8 }),
      run: () => ({ status: 1, stderr: 'fatal: https://operator:supersecret@example.test/repo' })
    }),
    (error) => error instanceof Error && !error.message.includes('supersecret') && error.message.includes('https://***@')
  )
})

test('capture removes remote credentials and absolute argv paths from wrapped errors', async () => {
  const remote = 'https://operator:supersecret@example.test/repo'
  const externalPath = 'C:\\private\\integration-xlsx-on-prereq'
  await assert.rejects(
    captureMainConsolidationInventory(baseArguments({
      jsonPath: 'C:/safe/inventory.json',
      markdownPath: 'C:/safe/inventory.md',
      externalPath,
      artifactPath: 'C:/safe/artifact.vsix',
      remote
    }), {
      readFile: async () => JSON.stringify(map),
      lstat: async () => ({ isSymbolicLink: () => false, isDirectory: () => true, isFile: () => true, size: 8 }),
      run: () => ({ status: 1, stderr: 'fatal: fetch failed' })
    }),
    (error) => error instanceof Error && !error.message.includes('supersecret') && !error.message.includes(remote)
  )
  await assert.rejects(
    captureMainConsolidationInventory(baseArguments({
      jsonPath: 'C:/safe/inventory.json',
      markdownPath: 'C:/safe/inventory.md',
      externalPath,
      artifactPath: 'C:/safe/artifact.vsix'
    }), {
      readFile: async (filePath) => filePath === mapUrl.pathname ? JSON.stringify(map) : Buffer.from('artifact'),
      lstat: async (filePath) => ({ isSymbolicLink: () => false, isDirectory: () => filePath === externalPath, isFile: () => filePath !== externalPath, size: 8 }),
      run(command, args) {
        if (command === 'git' && args[0] === '-c') return { status: 1, stderr: `fatal: cannot access '${externalPath}'` }
        return observationFor(command, args)
      }
    }),
    (error) => error instanceof Error && !error.message.includes(externalPath) && !error.message.includes('C:\\private')
  )
})

test('capture removes credentials when the injected runner throws', async () => {
  await assert.rejects(
    captureMainConsolidationInventory(baseArguments({
      jsonPath: 'C:/safe/inventory.json',
      markdownPath: 'C:/safe/inventory.md',
      externalPath: 'C:/safe/external',
      artifactPath: 'C:/safe/artifact.vsix'
    }), {
      readFile: async () => JSON.stringify(map),
      lstat: async () => ({ isSymbolicLink: () => false, isFile: () => true, size: 8 }),
      run: () => { throw new Error('fatal: https://operator:supersecret@example.test/repo') }
    }),
    (error) => error instanceof Error && !error.message.includes('supersecret') && error.message.includes('https://***@')
  )
})

test('capture rejects an external repository symlink before running Git inside it', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'main-consolidation-inventory-'))
  try {
    const externalPath = path.join(temporary, 'external')
    await assert.rejects(
      captureMainConsolidationInventory(baseArguments({
        jsonPath: path.join(temporary, 'inventory.json'),
        markdownPath: path.join(temporary, 'inventory.md'),
        externalPath,
        artifactPath: path.join(temporary, 'artifact.vsix')
      }), {
        readFile: async (filePath) => filePath === mapUrl.pathname ? JSON.stringify(map) : Buffer.from('artifact'),
        lstat: async (filePath) => filePath === externalPath
          ? { isSymbolicLink: () => true, isDirectory: () => true, isFile: () => false, size: 0 }
          : { isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true, size: 8 },
        run(command, args) {
          return observationFor(command, args)
        }
      }),
      /external repository is not a directory/
    )
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

function baseArguments({ jsonPath, markdownPath, externalPath, artifactPath, remote = 'origin' }) {
  return [
    '--repository', 'katamor1/bob_builtin_analyze',
    '--remote', remote,
    '--map', mapUrl.pathname,
    '--external-repository', `integration-xlsx-on-prereq=${externalPath}`,
    '--artifact', `old-vsix=${artifactPath}`,
    '--json', jsonPath,
    '--markdown', markdownPath
  ]
}

function observationFor(command, args, { unexpectedRemote = false } = {}) {
  if (command === 'git' && args[0] === 'fetch') return { status: 0, stdout: '' }
  if (command === 'git' && args[0] === 'rev-parse') return { status: 0, stdout: `${mainSha}\n` }
  if (command === 'git' && args[0] === 'merge-base') return { status: 0, stdout: '' }
  if (command === 'git' && args[0] === 'ls-remote') return { status: 0, stdout: remoteRefsText({ unexpectedRemote }) }
  if (command === 'git' && args[0] === 'for-each-ref') return { status: 0, stdout: `main\t${mainSha}\ncodex/main-consolidation-control-plane\t${processSha}\n` }
  if (command === 'git' && args[0] === 'worktree') return { status: 0, stdout: `worktree C:/repo\nHEAD ${mainSha}\nbranch refs/heads/main\n\n` }
  if (command === 'git' && (args[0] === 'status' || args[0] === '-C')) return { status: 0, stdout: args[0] === '-C' ? '?? .integration-xlsx-on-prereq/\n' : '' }
  if (command === 'git' && args[0] === '-c' && args.includes('rev-parse')) return { status: 0, stdout: `${externalSha}\n` }
  if (command === 'git' && args[0] === '-c' && args.includes('symbolic-ref')) return { status: 0, stdout: 'codex/fix-bazaar-minimal-xlsx-final\n' }
  if (command === 'git' && args[0] === '-c') return { status: 0, stdout: '' }
  if (command === 'gh' && args[0] === 'api') return { status: 0, stdout: 'main\n' }
  if (command === 'gh' && args[0] === 'pr') return { status: 0, stdout: `${JSON.stringify(openPullRequests())}\n` }
  throw new Error(`unexpected test command: ${command} ${args.join(' ')}`)
}

function remoteRefsText({ unexpectedRemote }) {
  const rows = [
    `${mainSha}\trefs/heads/main`,
    `${processSha}\trefs/heads/codex/main-consolidation-control-plane`,
    ...flattenLegacyHeads(map).map((entry) => `${entry.expectedSha}\trefs/heads/${entry.branch}`)
  ]
  if (unexpectedRemote) rows.push(`${'c'.repeat(40)}\trefs/heads/unknown/branch`)
  return `${rows.join('\n')}\n`
}

function openPullRequests() {
  return map.carriers.flatMap((carrier) => carrier.branches
    .filter((entry) => Number.isInteger(entry.pullRequest))
    .map((entry) => ({
      number: entry.pullRequest,
      headRefName: entry.branch,
      headRefOid: entry.expectedSha,
      baseRefName: entry.baseBranch,
      url: `https://example.test/pull/${entry.pullRequest}`,
      title: `PR ${entry.pullRequest}`
    })))
}

function validTopology() {
  return { readyForArchive: true, mainSha, legacyHeadCount: 30, processHeadCount: 1, openPullRequestCount: 20 }
}

function expectedRemoteHeads() {
  return [
    { branch: 'codex/main-consolidation-control-plane', sha: processSha, owner: 'process' },
    ...flattenLegacyHeads(map).map(({ branch, expectedSha, owner }) => ({ branch, sha: expectedSha, owner })),
    { branch: 'main', sha: mainSha, owner: 'main' }
  ].sort((left, right) => left.branch.localeCompare(right.branch))
}
