import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createMainConsolidationArchive } from '../create-main-consolidation-archive.mjs'

const EXPECTED_LEAF = '2026-08-21-main-consolidation'

test('creates a staged archive whose real bundle restores every branch head', async () => {
  const fixture = await createFixture()
  try {
    const beforeArtifact = await fileSnapshot(fixture.artifactPath)
    const result = await createMainConsolidationArchive(fixture.args, {
      now: () => new Date('2026-08-21T00:00:00.000Z'),
      randomUUID: () => 'archive-test'
    })

    assert.equal(result.summary.schemaVersion, 'bob-builtin-analyze/main-consolidation-archive/v1')
    assert.equal(result.summary.verified, true)
    assert.equal(existsSync(path.join(fixture.archiveRoot, '.archive-incomplete')), false)
    assert.equal(existsSync(fixture.archiveRoot), true)
    assert.equal(existsSync(fixture.stagingRoot), false)
    assert.deepEqual(await fileSnapshot(fixture.artifactPath), beforeArtifact)
    assert.deepEqual(JSON.parse(await readFile(fixture.summaryJson, 'utf8')), result.summary)
    assert.match(await readFile(fixture.summaryMarkdown, 'utf8'), /Verified: \*\*yes\*\*/u)

    const manifestText = await readFile(path.join(fixture.archiveRoot, 'archive-manifest.json'), 'utf8')
    const manifest = JSON.parse(manifestText)
    const manifestPaths = manifest.entries.map((entry) => entry.path)
    assert.deepEqual(manifestPaths, [...manifestPaths].sort())
    assert.deepEqual(manifest.entries.filter((entry) => entry.path.endsWith('.bundle')).map((entry) => entry.path), [
      'bundles/accepted-main-all-refs.bundle',
      'bundles/integration-xlsx-on-prereq-all-refs.bundle',
      'bundles/repository-all-refs.bundle'
    ])
    assert.equal(
      (await readFile(path.join(fixture.archiveRoot, 'archive-manifest.sha256'), 'utf8')).trim(),
      createHash('sha256').update(manifestText).digest('hex')
    )
    assert.deepEqual(await readdir(path.join(fixture.archiveRoot, 'inventory')), [
      'local-branches-before.txt',
      'open-prs-before.json',
      'remote-heads-before.txt',
      'worktrees-before.txt'
    ])
    const carrierEvidence = JSON.parse(await readFile(path.join(fixture.archiveRoot, 'carrier-patches', 'carrier-patches.json'), 'utf8'))
    assert.equal(carrierEvidence.carriers.length, 6)
    assert.equal(result.summary.carrierPatchCount, 6)
    assert.deepEqual(await readdir(path.join(fixture.archiveRoot, 'carrier-patches')), [
      'carrier-patches.json',
      'processing-a.patch',
      'processing-b.patch',
      'processing-c.patch',
      'workflow-a.patch',
      'workflow-b.patch',
      'workflow-c.patch'
    ])
    assert.equal(manifestPaths.filter((entry) => entry.startsWith('carrier-patches/')).length, 7)

    const restored = path.join(fixture.root, 'restored')
    git(['clone', path.join(fixture.archiveRoot, 'bundles', 'repository-all-refs.bundle'), restored])
    assert.equal(git(['-C', restored, 'rev-parse', 'refs/heads/main']).trim(), fixture.mainSha)
    assert.equal(git(['-C', restored, 'rev-parse', 'refs/remotes/origin/feature']).trim(), fixture.featureSha)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('carrier target-tree mismatch prevents final publication and retains incomplete staging', async () => {
  const fixture = await createFixture()
  try {
    await assert.rejects(createMainConsolidationArchive(fixture.args, {
      randomUUID: () => 'carrier-tree-mismatch',
      freezeCarrierPatches: async ({ map }) => map.carriers.map((carrier, index) => ({
        id: carrier.id,
        patch: `${carrier.id}.patch`,
        fromSha: carrier.fromSha,
        toSha: carrier.toSha,
        reconstructedTreeSha: index === 0 ? 'a'.repeat(40) : 'b'.repeat(40),
        targetTreeSha: 'b'.repeat(40)
      }))
    }), /target tree/u)
    assert.equal(existsSync(fixture.archiveRoot), false)
    assert.equal(existsSync(path.join(fixture.stagingRootFor('carrier-tree-mismatch'), '.archive-incomplete')), true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('normal creation refuses an existing final archive without changing it', async () => {
  const fixture = await createFixture()
  try {
    await mkdir(fixture.archiveRoot, { recursive: true })
    await writeFile(path.join(fixture.archiveRoot, 'sentinel.txt'), 'keep')
    await assert.rejects(createMainConsolidationArchive(fixture.args), /already exists/)
    assert.equal(await readFile(path.join(fixture.archiveRoot, 'sentinel.txt'), 'utf8'), 'keep')
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('normal creation treats a dangling final-root junction as existing', async (t) => {
  const fixture = await createFixture()
  try {
    await mkdir(path.dirname(fixture.archiveRoot), { recursive: true })
    try {
      await symlink(path.join(fixture.root, 'missing-archive-target'), fixture.archiveRoot, 'junction')
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('junction creation is not permitted on this host')
      throw error
    }
    await assert.rejects(createMainConsolidationArchive(fixture.args), /already exists/)
    assert.equal((await lstat(fixture.archiveRoot)).isSymbolicLink(), true)
    assert.deepEqual((await readdir(path.dirname(fixture.archiveRoot))).sort(), [EXPECTED_LEAF])
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('primary bundle rejects moved, disappeared, and newly appeared refs since inventory', async (t) => {
  const cases = [
    ['non-HEAD local ref moved', (fixture) => git(['-C', fixture.repositoryRoot, 'update-ref', 'refs/heads/feature', fixture.mainSha])],
    ['approved remote ref disappeared', (fixture) => git(['-C', fixture.repositoryRoot, 'update-ref', '-d', 'refs/remotes/origin/feature'])],
    ['unexpected local ref appeared', (fixture) => git(['-C', fixture.repositoryRoot, 'update-ref', 'refs/heads/unexpected', fixture.mainSha])]
  ]
  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = await createFixture()
      try {
        mutate(fixture)
        await assert.rejects(createMainConsolidationArchive(fixture.args), /primary repository refs do not match inventory/)
        assert.equal(existsSync(fixture.archiveRoot), false)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
})

test('primary bundle rejects a non-HEAD ref mutation during bundle creation', async () => {
  const fixture = await createFixture()
  try {
    let mutated = false
    const run = (command, args) => {
      const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      if (!mutated && command === 'git' && args.includes('bundle') && args.includes('create') && args.includes(fixture.repositoryRoot)) {
        mutated = true
        git(['-C', fixture.repositoryRoot, 'update-ref', 'refs/heads/feature', fixture.mainSha])
      }
      return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
    }
    await assert.rejects(createMainConsolidationArchive(fixture.args, { run }), /primary repository refs changed during bundle creation/)
    assert.equal(existsSync(fixture.archiveRoot), false)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('primary all-refs bundle preserves stable stash, tag, and notes namespaces', async () => {
  const fixture = await createFixture()
  try {
    writeFileSync(path.join(fixture.repositoryRoot, 'tracked.txt'), 'stashed change\n')
    git(['-C', fixture.repositoryRoot, 'stash', 'push', '-m', 'stable archive stash'])
    git(['-C', fixture.repositoryRoot, 'tag', 'stable-archive-tag', fixture.mainSha])
    git(['-C', fixture.repositoryRoot, 'notes', 'add', '-m', 'stable archive note', fixture.mainSha])
    const expected = [
      `${git(['-C', fixture.repositoryRoot, 'rev-parse', 'refs/notes/commits']).trim()} refs/notes/commits`,
      `${git(['-C', fixture.repositoryRoot, 'rev-parse', 'refs/stash']).trim()} refs/stash`,
      `${git(['-C', fixture.repositoryRoot, 'rev-parse', 'refs/tags/stable-archive-tag']).trim()} refs/tags/stable-archive-tag`
    ]

    const result = await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'stable-other-refs' })
    const repositoryBundle = result.summary.bundleHeads.find((entry) => entry.path === 'bundles/repository-all-refs.bundle')
    for (const line of expected) assert.ok(repositoryBundle.heads.includes(line), `missing archived ref: ${line}`)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('primary bundle rejects movement, disappearance, and appearance in other ref namespaces during creation', async (t) => {
  const cases = [
    {
      name: 'tag moved',
      prepare: (fixture) => git(['-C', fixture.repositoryRoot, 'tag', 'boundary-tag', fixture.mainSha]),
      mutate: (fixture) => git(['-C', fixture.repositoryRoot, 'update-ref', 'refs/tags/boundary-tag', fixture.featureSha])
    },
    {
      name: 'tag disappeared',
      prepare: (fixture) => git(['-C', fixture.repositoryRoot, 'tag', 'boundary-tag', fixture.mainSha]),
      mutate: (fixture) => git(['-C', fixture.repositoryRoot, 'update-ref', '-d', 'refs/tags/boundary-tag'])
    },
    {
      name: 'notes ref appeared',
      prepare: () => {},
      mutate: (fixture) => git(['-C', fixture.repositoryRoot, 'notes', 'add', '-m', 'late note', fixture.mainSha])
    }
  ]
  for (const scenario of cases) {
    await t.test(scenario.name, async () => {
      const fixture = await createFixture()
      try {
        scenario.prepare(fixture)
        let mutated = false
        const run = (command, args) => {
          const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
          if (!mutated && command === 'git' && args.includes('bundle') && args.includes('create') && args.includes(fixture.repositoryRoot)) {
            mutated = true
            scenario.mutate(fixture)
          }
          return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
        }
        await assert.rejects(
          createMainConsolidationArchive(fixture.args, { run }),
          /primary repository other refs changed during bundle creation/
        )
        assert.equal(existsSync(fixture.archiveRoot), false)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
})

test('external repositories reject inventory-owned branch and HEAD movement across bundle boundaries', async (t) => {
  const scenarios = [
    { label: 'integration-xlsx-on-prereq', timing: 'after-validation', pathKey: 'externalOne' },
    { label: 'accepted-main', timing: 'during-bundle', pathKey: 'externalTwo' }
  ]
  for (const scenario of scenarios) {
    await t.test(`${scenario.label} ${scenario.timing}`, async () => {
      const fixture = await createFixture()
      try {
        const repositoryPath = fixture[scenario.pathKey]
        const oldHead = git(['-C', repositoryPath, 'rev-parse', 'HEAD']).trim()
        const tree = git(['-C', repositoryPath, 'rev-parse', 'HEAD^{tree}']).trim()
        const movedHead = git(['-C', repositoryPath, 'commit-tree', tree, '-p', oldHead, '-m', 'moved during archive'])
          .trim()
        const calls = []
        let mutated = false
        const run = (command, args) => {
          calls.push([command, [...args]])
          const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
          const afterValidation = scenario.timing === 'after-validation' && args.includes(repositoryPath) && args.includes('rev-parse') && args.at(-1) === 'HEAD'
          const duringBundle = scenario.timing === 'during-bundle' && args.includes(repositoryPath) && args.includes('bundle') && args.includes('create')
          if (!mutated && command === 'git' && (afterValidation || duringBundle)) {
            mutated = true
            git(['-C', repositoryPath, 'update-ref', 'refs/heads/main', movedHead, oldHead])
          }
          return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
        }
        await assert.rejects(
          createMainConsolidationArchive(fixture.args, { run }),
          /external repository refs (?:do not match inventory|changed during bundle creation)/
        )
        assert.equal(existsSync(fixture.archiveRoot), false)
        if (scenario.label === 'integration-xlsx-on-prereq') {
          const sourceCalls = calls.filter(([command, args]) => command === 'git' && args.includes(repositoryPath))
          assert.ok(sourceCalls.length > 0)
          assert.ok(sourceCalls.every(([, args]) => args[0] === '-c' && args[1] === `safe.directory=${repositoryPath}`))
        }
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
})

test('dirty external repositories fail closed and retain only the diagnostic staging directory', async () => {
  const fixture = await createFixture()
  try {
    await writeFile(path.join(fixture.externalOne, 'dirty.txt'), 'dirty')
    await assert.rejects(createMainConsolidationArchive(fixture.args, {
      randomUUID: () => 'dirty-test'
    }), /external repository is dirty/)
    assert.equal(existsSync(fixture.archiveRoot), false)
    assert.equal(existsSync(fixture.stagingRootFor('dirty-test')), true)
    assert.equal(existsSync(path.join(fixture.stagingRootFor('dirty-test'), '.archive-incomplete')), true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('artifact mutation after hashing prevents publication and leaves the source untouched by the copier', async () => {
  const fixture = await createFixture()
  try {
    await assert.rejects(createMainConsolidationArchive(fixture.args, {
      randomUUID: () => 'mutation-test',
      afterSourceRead: async ({ sourcePath }) => {
        if (sourcePath === fixture.artifactPath) await writeFile(sourcePath, 'mutated!')
      }
    }), /changed during archive copy/)
    assert.equal(existsSync(fixture.archiveRoot), false)
    assert.equal(existsSync(fixture.stagingRootFor('mutation-test')), true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('bundle verification failure prevents final publication and preserves staging', async () => {
  const fixture = await createFixture()
  try {
    const realRun = (command, args) => {
      if (command === 'git' && args.includes('verify')) return { status: 1, stdout: '', stderr: 'synthetic verify failure' }
      const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
    }
    await assert.rejects(createMainConsolidationArchive(fixture.args, {
      randomUUID: () => 'verify-failure-test',
      run: realRun
    }), /bundle verify failed/)
    assert.equal(existsSync(fixture.archiveRoot), false)
    assert.equal(existsSync(fixture.stagingRootFor('verify-failure-test')), true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('publish rename failure restores the incomplete marker in retained staging', async () => {
  const fixture = await createFixture()
  try {
    await assert.rejects(createMainConsolidationArchive(fixture.args, {
      randomUUID: () => 'rename-failure-test',
      rename: async () => { throw new Error('synthetic rename failure') }
    }), /synthetic rename failure/)
    assert.equal(existsSync(fixture.archiveRoot), false)
    assert.equal(existsSync(path.join(fixture.stagingRootFor('rename-failure-test'), '.archive-incomplete')), true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('canonical path validation rejects a symlink ancestor before creating directories in the repository', async (t) => {
  const fixture = await createFixture()
  try {
    const linkedParent = path.join(fixture.root, 'linked-parent')
    try {
      await symlink(fixture.repositoryRoot, linkedParent, 'junction')
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('junction creation is not permitted on this host')
      throw error
    }
    const unsafeArchive = path.join(linkedParent, 'must-not-be-created', EXPECTED_LEAF)
    const unsafeArgs = replaceArgument(fixture.args, '--archive-root', unsafeArchive)
    await assert.rejects(createMainConsolidationArchive(unsafeArgs), /outside the repository/)
    assert.equal(existsSync(path.join(fixture.repositoryRoot, 'must-not-be-created')), false)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('verify-existing rehashes and verifies without copy, bundle creation, rename, or archive deletion', async () => {
  const fixture = await createFixture()
  try {
    const initial = await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'initial' })
    const before = await treeSnapshot(fixture.archiveRoot)
    const verifySummaryJson = path.join(fixture.root, 'verified-summary.json')
    const verifySummaryMarkdown = path.join(fixture.root, 'verified-summary.md')
    const verifyArgs = [
      ...fixture.args.filter((_, index, values) => !['--summary-json', '--summary-markdown'].includes(values[index - 1]) && !['--summary-json', '--summary-markdown'].includes(values[index])),
      '--summary-json', verifySummaryJson,
      '--summary-markdown', verifySummaryMarkdown,
      '--verify-existing'
    ]
    const result = await createMainConsolidationArchive(verifyArgs, {
      copyVerifiedFile: async () => { throw new Error('copy must not run') },
      createBundle: async () => { throw new Error('bundle create must not run') },
      rename: async () => { throw new Error('rename must not run') },
      rm: async () => { throw new Error('delete must not run') }
    })
    assert.equal(result.summary.verified, true)
    assert.deepEqual(result.summary.bundleHeads, initial.summary.bundleHeads)
    assert.deepEqual(await treeSnapshot(fixture.archiveRoot), before)
    assert.equal(JSON.parse(await readFile(verifySummaryJson, 'utf8')).verified, true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('verify-existing rejects symlinked manifest and detached-hash files with matching bytes', async (t) => {
  for (const archiveFile of ['archive-manifest.json', 'archive-manifest.sha256']) {
    await t.test(archiveFile, async (subtest) => {
      const fixture = await createFixture()
      try {
        await createMainConsolidationArchive(fixture.args, { randomUUID: () => `link-${archiveFile}` })
        const archivedPath = path.join(fixture.archiveRoot, archiveFile)
        const externalPath = path.join(fixture.root, `external-${archiveFile}`)
        await writeFile(externalPath, await readFile(archivedPath))
        await rm(archivedPath)
        try {
          await symlink(externalPath, archivedPath, 'file')
        } catch (error) {
          if (error?.code === 'EPERM') return subtest.skip('file symlink creation is not permitted on this host')
          throw error
        }
        await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /symbolic link|reparse/u)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
})

async function createFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'main-consolidation-archive-'))
  const repositoryRoot = path.join(root, 'repository')
  const externalOne = path.join(root, 'integration-xlsx-on-prereq')
  const externalTwo = path.join(root, 'accepted-main')
  const artifactPath = path.join(root, 'operator-result.json')
  initRepository(repositoryRoot, true)
  initRepository(externalOne)
  initRepository(externalTwo)
  const mainSha = git(['-C', repositoryRoot, 'rev-parse', 'main']).trim()
  const featureSha = git(['-C', repositoryRoot, 'rev-parse', 'feature']).trim()
  git(['-C', repositoryRoot, 'update-ref', 'refs/remotes/origin/main', mainSha])
  git(['-C', repositoryRoot, 'update-ref', 'refs/remotes/origin/feature', featureSha])
  git(['-C', repositoryRoot, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'])
  await writeFile(artifactPath, 'accepted evidence')
  const artifactBytes = await readFile(artifactPath)
  const inventory = {
    schemaVersion: 'bob-builtin-analyze/main-consolidation-inventory/v1',
    generatedAt: '2026-08-21T00:00:00.000Z',
    repository: 'katamor1/bob_builtin_analyze',
    readyForArchive: true,
    topology: { readyForArchive: true, mainSha, legacyHeadCount: 30, processHeadCount: 1, openPullRequestCount: 1 },
    remoteHeads: [{ branch: 'main', sha: mainSha, owner: 'main' }, { branch: 'feature', sha: featureSha, owner: 'test' }],
    openPullRequests: [{ number: 1, headRefName: 'feature', headRefOid: featureSha, baseRefName: 'main', url: 'https://example.test/pull/1' }],
    localBranches: [{ branch: 'feature', sha: featureSha }, { branch: 'main', sha: mainSha }],
    worktrees: [{ path: repositoryRoot, head: mainSha, branch: 'refs/heads/main', detached: false, status: [] }],
    externalRepositories: [
      { label: 'accepted-main', path: externalTwo, head: git(['-C', externalTwo, 'rev-parse', 'HEAD']).trim(), branch: 'main', status: [] },
      { label: 'integration-xlsx-on-prereq', path: externalOne, head: git(['-C', externalOne, 'rev-parse', 'HEAD']).trim(), branch: 'main', status: [] }
    ],
    artifacts: [{
      label: 'operator-result',
      sourcePath: artifactPath,
      byteSize: artifactBytes.byteLength,
      sha256: createHash('sha256').update(artifactBytes).digest('hex')
    }],
    blockers: []
  }
  const inventoryPath = path.join(root, 'inventory.json')
  const mapPath = path.join(root, 'map.json')
  const archiveRoot = path.join(root, 'archives', EXPECTED_LEAF)
  const summaryJson = path.join(root, 'archive-summary.json')
  const summaryMarkdown = path.join(root, 'archive-summary.md')
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  const carrierIds = ['workflow-a', 'workflow-b', 'workflow-c', 'processing-a', 'processing-b', 'processing-c']
  await writeFile(mapPath, `${JSON.stringify({
    schemaVersion: 'bob-builtin-analyze/main-consolidation-map/v1',
    carriers: carrierIds.map((id, index) => ({ id, fromSha: mainSha, toSha: featureSha, pullRequests: [index + 1] }))
  }, null, 2)}\n`)
  const args = [
    '--inventory', inventoryPath,
    '--map', mapPath,
    '--archive-root', archiveRoot,
    '--repository-root', repositoryRoot,
    '--bundle-repository', `integration-xlsx-on-prereq=${externalOne}`,
    '--bundle-repository', `accepted-main=${externalTwo}`,
    '--summary-json', summaryJson,
    '--summary-markdown', summaryMarkdown
  ]
  return {
    root,
    repositoryRoot,
    externalOne,
    externalTwo,
    artifactPath,
    archiveRoot,
    summaryJson,
    summaryMarkdown,
    mainSha,
    featureSha,
    args,
    stagingRoot: path.join(path.dirname(archiveRoot), `.${EXPECTED_LEAF}.staging-${process.pid}-archive-test`),
    stagingRootFor: (suffix) => path.join(path.dirname(archiveRoot), `.${EXPECTED_LEAF}.staging-${process.pid}-${suffix}`)
  }
}

function verifyArguments(fixture) {
  const summaryJson = path.join(fixture.root, 'verified-link-summary.json')
  const summaryMarkdown = path.join(fixture.root, 'verified-link-summary.md')
  return [
    ...fixture.args.filter((_, index, values) => !['--summary-json', '--summary-markdown'].includes(values[index - 1]) && !['--summary-json', '--summary-markdown'].includes(values[index])),
    '--summary-json', summaryJson,
    '--summary-markdown', summaryMarkdown,
    '--verify-existing'
  ]
}

function replaceArgument(argv, flag, value) {
  const copy = [...argv]
  const index = copy.indexOf(flag)
  copy[index + 1] = value
  return copy
}

function initRepository(repository, withFeature = false) {
  git(['init', '--initial-branch=main', repository])
  git(['-C', repository, 'config', 'user.email', 'archive-test@example.test'])
  git(['-C', repository, 'config', 'user.name', 'Archive Test'])
  writeFileSync(path.join(repository, 'tracked.txt'), 'main\n')
  git(['-C', repository, 'add', 'tracked.txt'])
  git(['-C', repository, 'commit', '-m', 'main'])
  if (!withFeature) return
  git(['-C', repository, 'switch', '-c', 'feature'])
  writeFileSync(path.join(repository, 'feature.txt'), 'feature\n')
  git(['-C', repository, 'add', 'feature.txt'])
  git(['-C', repository, 'commit', '-m', 'feature'])
  git(['-C', repository, 'switch', 'main'])
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

async function fileSnapshot(filePath) {
  const metadata = await stat(filePath, { bigint: true })
  return {
    bytes: (await readFile(filePath)).toString('hex'),
    size: metadata.size.toString(),
    mtimeNs: metadata.mtimeNs.toString()
  }
}

async function treeSnapshot(root) {
  const result = []
  async function visit(current, relative = '') {
    for (const name of (await readdir(current)).sort()) {
      const absolute = path.join(current, name)
      const childRelative = path.posix.join(relative, name)
      const metadata = await stat(absolute, { bigint: true })
      if (metadata.isDirectory()) await visit(absolute, childRelative)
      else result.push({ path: childRelative, ...(await fileSnapshot(absolute)) })
    }
  }
  await visit(root)
  return result
}
