import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { link as fsLink, lstat, mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createMainConsolidationArchive as createProductionArchive } from '../create-main-consolidation-archive.mjs'

const EXPECTED_LEAF = '2026-08-21-main-consolidation'
const sourceMap = JSON.parse(await readFile(new URL('../consolidation-map.json', import.meta.url), 'utf8'))

function createMainConsolidationArchive(argv, dependencies = {}) {
  return createProductionArchive(argv, {
    validateConsolidationMap: (candidate) => {
      const normalized = structuredClone(candidate)
      normalized.carriers.forEach((carrier, index) => {
        carrier.fromSha = sourceMap.carriers[index].fromSha
        carrier.toSha = sourceMap.carriers[index].toSha
      })
      assert.deepEqual(normalized, sourceMap, 'test fixture map SHA-256 mismatch')
    },
    validateArchiveInventory: () => {},
    ...dependencies
  })
}

test('creates a staged archive whose real bundle restores every branch head', async () => {
  const fixture = await createFixture()
  try {
    await addLinkedWorktreeBoundary(fixture)
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
    assert.equal(manifestPaths.length, 24)
    assert.equal((await treeSnapshot(fixture.archiveRoot)).length, 26)
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

    assert.equal(result.summary.bundleHeads.length, 3)
    const primaryHeads = result.summary.bundleHeads.find((entry) => entry.path === 'bundles/repository-all-refs.bundle').heads
    const integrationHeads = result.summary.bundleHeads.find((entry) => entry.path === 'bundles/integration-xlsx-on-prereq-all-refs.bundle').heads
    const acceptedHeads = result.summary.bundleHeads.find((entry) => entry.path === 'bundles/accepted-main-all-refs.bundle').heads
    assert.ok(primaryHeads.some((line) => line.endsWith(' refs/codex/turn-diffs/archive-test/base')))
    assert.ok(primaryHeads.some((line) => / worktrees\/[^/]+\/HEAD$/u.test(line)))
    assert.ok(integrationHeads.some((line) => line.endsWith(' refs/heads/local-only-integration')))
    assert.ok(acceptedHeads.some((line) => line.endsWith(' refs/heads/local-only-accepted')))
    for (const [index, bundle] of result.summary.bundleHeads.entries()) {
      const restored = path.join(fixture.root, `restored-${index}`)
      restoreEveryAdvertisedHead(path.join(fixture.archiveRoot, ...bundle.path.split('/')), bundle.heads, restored)
    }
    assert.throws(() => restoreEveryAdvertisedHead(
      path.join(fixture.archiveRoot, ...result.summary.bundleHeads[0].path.split('/')),
      result.summary.bundleHeads[0].heads.map((line, index) => index === 0 ? `${'f'.repeat(40)} ${line.slice(41)}` : line),
      path.join(fixture.root, 'restored-mismatch')
    ), /advertised bundle heads mismatch/u)
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

test('invalid or hash-replaced maps fail before archive staging', async (t) => {
  for (const mutation of ['invalid', 'hash-replaced']) {
    await t.test(mutation, async () => {
      const fixture = await createFixture()
      try {
        const changed = structuredClone(fixture.map)
        if (mutation === 'invalid') changed.carriers[0].pullRequests = []
        else changed.baselineMain = 'f'.repeat(40)
        await writeFile(fixture.mapPath, `${JSON.stringify(changed, null, 2)}\n`)
        await assert.rejects(createMainConsolidationArchive(fixture.args, {
          randomUUID: () => `map-${mutation}`
        }), /map|carrier pull request mapping|SHA-256/u)
        assert.equal(existsSync(fixture.archiveRoot), false)
        assert.equal(existsSync(fixture.stagingRootFor(`map-${mutation}`)), false)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }
})

test('verify-existing rejects a canonical manifest that omits the fixed carrier patch set', async () => {
  const fixture = await createFixture()
  try {
    await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'missing-carriers' })
    const manifestPath = path.join(fixture.archiveRoot, 'archive-manifest.json')
    const detachedPath = path.join(fixture.archiveRoot, 'archive-manifest.sha256')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    manifest.entries = manifest.entries.filter((entry) => !entry.path.startsWith('carrier-patches/'))
    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
    await writeFile(manifestPath, manifestText)
    await writeFile(detachedPath, `${createHash('sha256').update(manifestText).digest('hex')}\n`)
    await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /carrier patch set/u)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('verify-existing requires the exact bundles, artifacts, snapshots, and no extra entries', async (t) => {
  const omissions = [
    ['bundle', 'bundles/repository-all-refs.bundle'],
    ['artifact', 'artifacts/operator-result/operator-result.json'],
    ['snapshot', 'inventory/remote-heads-before.txt']
  ]
  for (const [name, omittedPath] of omissions) {
    await t.test(`omitted ${name}`, async () => {
      const fixture = await createFixture()
      try {
        await createMainConsolidationArchive(fixture.args, { randomUUID: () => `omitted-${name}` })
        await rewriteManifest(fixture, (manifest) => {
          manifest.entries = manifest.entries.filter((entry) => entry.path !== omittedPath)
        })
        await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /required archive entry set/u)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
  }

  await t.test('extra re-signed entry', async () => {
    const fixture = await createFixture()
    try {
      await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'extra-entry' })
      const extraPath = path.join(fixture.archiveRoot, 'extra.txt')
      await writeFile(extraPath, 'extra')
      const extraBytes = await readFile(extraPath)
      await rewriteManifest(fixture, (manifest) => {
        manifest.entries.push({
          path: 'extra.txt',
          byteSize: extraBytes.byteLength,
          sha256: createHash('sha256').update(extraBytes).digest('hex')
        })
        manifest.entries.sort((left, right) => left.path.localeCompare(right.path))
      })
      await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /required archive entry set/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })
})

test('verify-existing binds artifacts, snapshots, bundle heads, and prior summary identity', async (t) => {
  await t.test('artifact metadata differs from inventory', async () => {
    const fixture = await createFixture()
    try {
      await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'artifact-binding' })
      const inventory = JSON.parse(await readFile(fixture.inventoryPath, 'utf8'))
      inventory.artifacts.find((entry) => entry.label === 'operator-result').sha256 = 'a'.repeat(64)
      await writeFile(fixture.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
      await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /artifact.*inventory|inventory.*artifact/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('inventory snapshot binding differs', async () => {
    const fixture = await createFixture()
    try {
      await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'snapshot-binding' })
      const inventory = JSON.parse(await readFile(fixture.inventoryPath, 'utf8'))
      inventory.remoteHeads[0].owner = 'changed-owner'
      await writeFile(fixture.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
      await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /snapshot.*inventory|inventory.*snapshot/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('valid swapped and re-signed bundle has wrong owned heads', async () => {
    const fixture = await createFixture()
    try {
      await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'swapped-bundle' })
      const repositoryBundle = path.join(fixture.archiveRoot, 'bundles', 'repository-all-refs.bundle')
      const externalBundle = path.join(fixture.archiveRoot, 'bundles', 'accepted-main-all-refs.bundle')
      await writeFile(repositoryBundle, await readFile(externalBundle))
      const replacement = await readFile(repositoryBundle)
      await rewriteManifest(fixture, (manifest) => {
        const entry = manifest.entries.find((candidate) => candidate.path === 'bundles/repository-all-refs.bundle')
        entry.byteSize = replacement.byteLength
        entry.sha256 = createHash('sha256').update(replacement).digest('hex')
      })
      await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /bundle.*heads/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('prior summary inventory identity differs', async () => {
    const fixture = await createFixture()
    try {
      await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'summary-binding' })
      const summary = JSON.parse(await readFile(fixture.summaryJson, 'utf8'))
      summary.inventorySha256 = 'b'.repeat(64)
      await writeFile(fixture.summaryJson, `${JSON.stringify(summary, null, 2)}\n`)
      await assert.rejects(createMainConsolidationArchive([...fixture.args, '--verify-existing']), /summary.*inventory|inventory.*summary/u)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

})

test('verify-existing rejects a prior summary carrier patch count that differs from verified evidence', async () => {
  const fixture = await createFixture()
  try {
    await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'summary-carrier-count' })
    const summary = JSON.parse(await readFile(fixture.summaryJson, 'utf8'))
    summary.carrierPatchCount = 5
    await writeFile(fixture.summaryJson, `${JSON.stringify(summary, null, 2)}\n`)
    await assert.rejects(
      createMainConsolidationArchive([...fixture.args, '--verify-existing']),
      /summary.*carrier patch|carrier patch.*summary/u
    )
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('verify-existing binds verification to the inventory map hash before reading the archive', async () => {
  const fixture = await createFixture()
  try {
    await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'verify-map-binding' })
    const changed = structuredClone(fixture.map)
    changed.baselineMain = 'e'.repeat(40)
    await writeFile(fixture.mapPath, `${JSON.stringify(changed, null, 2)}\n`)
    await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /map.*SHA-256|SHA-256.*map/u)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('verify-existing rejects canonical carrier evidence that disagrees with the bound map, patch hash, or target tree', async (t) => {
  const fixture = await createFixture()
  try {
    await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'carrier-evidence-mutation' })
    const evidencePath = path.join(fixture.archiveRoot, 'carrier-patches', 'carrier-patches.json')
    const manifestPath = path.join(fixture.archiveRoot, 'archive-manifest.json')
    const detachedPath = path.join(fixture.archiveRoot, 'archive-manifest.sha256')
    const originalEvidence = JSON.parse(await readFile(evidencePath, 'utf8'))
    const originalManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const firstPatchPath = path.join(fixture.archiveRoot, 'carrier-patches', originalEvidence.carriers[0].patch)
    const originalPatch = await readFile(firstPatchPath)
    const mutations = {
      range: (entry) => { entry.fromSha = 'd'.repeat(40) },
      'patch-hash': (entry) => { entry.sha256 = 'c'.repeat(64) },
      tree: (entry) => { entry.reconstructedTreeSha = 'b'.repeat(40) }
    }
    for (const [name, mutate] of Object.entries(mutations)) {
      await t.test(name, async () => {
        const evidence = structuredClone(originalEvidence)
        mutate(evidence.carriers[0])
        const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`
        await writeFile(evidencePath, evidenceText)
        const manifest = structuredClone(originalManifest)
        const evidenceEntry = manifest.entries.find((entry) => entry.path === 'carrier-patches/carrier-patches.json')
        evidenceEntry.byteSize = Buffer.byteLength(evidenceText)
        evidenceEntry.sha256 = createHash('sha256').update(evidenceText).digest('hex')
        const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
        await writeFile(manifestPath, manifestText)
        await writeFile(detachedPath, `${createHash('sha256').update(manifestText).digest('hex')}\n`)
        await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /carrier patch|target tree/u)
      })
    }
    await t.test('patch-bytes', async () => {
      const changedPatch = originalPatch.subarray(0, Math.max(1, Math.floor(originalPatch.byteLength / 2)))
      await writeFile(firstPatchPath, changedPatch)
      const evidence = structuredClone(originalEvidence)
      evidence.carriers[0].byteSize = changedPatch.byteLength
      evidence.carriers[0].sha256 = createHash('sha256').update(changedPatch).digest('hex')
      const evidenceText = `${JSON.stringify(evidence, null, 2)}\n`
      await writeFile(evidencePath, evidenceText)
      const manifest = structuredClone(originalManifest)
      const patchEntry = manifest.entries.find((entry) => entry.path === `carrier-patches/${evidence.carriers[0].patch}`)
      patchEntry.byteSize = changedPatch.byteLength
      patchEntry.sha256 = evidence.carriers[0].sha256
      const evidenceEntry = manifest.entries.find((entry) => entry.path === 'carrier-patches/carrier-patches.json')
      evidenceEntry.byteSize = Buffer.byteLength(evidenceText)
      evidenceEntry.sha256 = createHash('sha256').update(evidenceText).digest('hex')
      const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
      await writeFile(manifestPath, manifestText)
      await writeFile(detachedPath, `${createHash('sha256').update(manifestText).digest('hex')}\n`)
      await assert.rejects(createMainConsolidationArchive(verifyArguments(fixture)), /carrier patch|apply|reconstruct/u)
    })
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

test('primary all-refs bundle preserves stable auxiliary refs and linked-worktree pseudo HEADs', async () => {
  const fixture = await createFixture()
  try {
    await addLinkedWorktreeBoundary(fixture)
    const result = await createMainConsolidationArchive(fixture.args, { randomUUID: () => 'stable-linked-worktrees' })
    const repositoryBundle = result.summary.bundleHeads.find((entry) => entry.path === 'bundles/repository-all-refs.bundle')
    const expected = [
      `${git(['-C', fixture.repositoryRoot, 'rev-parse', 'refs/stash']).trim()} refs/stash`,
      `${fixture.mainSha} refs/codex/turn-diffs/archive-test/base`,
      ...fixture.linkedWorktrees.map((worktree) => `${worktree.head} worktrees/${worktree.adminId}/HEAD`)
    ]
    for (const line of expected) assert.ok(repositoryBundle.heads.includes(line), `missing bundle-visible boundary ref: ${line}`)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('primary bundle rejects linked-worktree add, remove, move, and admin identity changes during creation', async (t) => {
  const scenarios = [
    {
      name: 'added',
      mutate: (fixture) => git(['-C', fixture.repositoryRoot, 'worktree', 'add', '--detach', path.join(fixture.root, 'linked-added'), fixture.mainSha])
    },
    {
      name: 'removed',
      mutate: (fixture) => git(['-C', fixture.repositoryRoot, 'worktree', 'remove', fixture.linkedWorktrees[0].path])
    },
    {
      name: 'moved',
      mutate: (fixture) => git(['-C', fixture.repositoryRoot, 'worktree', 'move', fixture.linkedWorktrees[0].path, path.join(fixture.root, 'linked-moved')])
    },
    {
      name: 'admin identity changed',
      mutate: (fixture) => renameLinkedWorktreeAdmin(fixture.repositoryRoot, fixture.linkedWorktrees[0].path)
    }
  ]
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const fixture = await createFixture()
      try {
        await addLinkedWorktreeBoundary(fixture)
        let mutated = false
        const run = (command, args) => {
          const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
          if (!mutated && command === 'git' && args.includes(fixture.repositoryRoot) && args.includes('bundle') && args.includes('create')) {
            mutated = true
            scenario.mutate(fixture)
          }
          return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
        }
        await assert.rejects(
          createMainConsolidationArchive(fixture.args, { run }),
          /primary repository worktree boundary changed during bundle creation/
        )
        assert.equal(existsSync(fixture.archiveRoot), false)
      } finally {
        await rm(fixture.root, { recursive: true, force: true })
      }
    })
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

test('publish transfer failure preserves incomplete markers in staging and the claimed final root', async () => {
  const fixture = await createFixture()
  try {
    await assert.rejects(createMainConsolidationArchive(fixture.args, {
      randomUUID: () => 'transfer-failure-test',
      link: async () => { throw new Error('synthetic transfer failure') }
    }), /synthetic transfer failure/)
    assert.equal(existsSync(path.join(fixture.archiveRoot, '.archive-incomplete')), true)
    assert.equal(existsSync(path.join(fixture.stagingRootFor('transfer-failure-test'), '.archive-incomplete')), true)
  } finally {
    await rm(fixture.root, { recursive: true, force: true })
  }
})

test('exclusive publication refuses raced final roots and top-level children without overwriting sentinels', async (t) => {
  await t.test('raced final root before claim', async () => {
    const fixture = await createFixture()
    try {
      await assert.rejects(createMainConsolidationArchive(fixture.args, {
        randomUUID: () => 'raced-root',
        beforePublish: async () => {
          await mkdir(fixture.archiveRoot)
          await writeFile(path.join(fixture.archiveRoot, 'sentinel.txt'), 'keep')
        }
      }), /already exists|exclusive archive claim/u)
      assert.equal(await readFile(path.join(fixture.archiveRoot, 'sentinel.txt'), 'utf8'), 'keep')
      assert.equal(existsSync(path.join(fixture.stagingRootFor('raced-root'), '.archive-incomplete')), true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('raced top-level child after claim', async () => {
    const fixture = await createFixture()
    try {
      await assert.rejects(createMainConsolidationArchive(fixture.args, {
        randomUUID: () => 'raced-child',
        afterArchiveRootClaim: async () => {
          const raced = path.join(fixture.archiveRoot, 'bundles')
          await mkdir(raced)
          await writeFile(path.join(raced, 'sentinel.txt'), 'keep')
        }
      }), /archive publication child already exists/u)
      assert.equal(await readFile(path.join(fixture.archiveRoot, 'bundles', 'sentinel.txt'), 'utf8'), 'keep')
      assert.equal(existsSync(path.join(fixture.archiveRoot, '.archive-incomplete')), true)
      assert.equal(existsSync(path.join(fixture.stagingRootFor('raced-child'), '.archive-incomplete')), true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('raced regular file immediately before transfer', async () => {
    const fixture = await createFixture()
    const sentinel = 'keep-raced-file'
    try {
      await assert.rejects(createMainConsolidationArchive(fixture.args, {
        randomUUID: () => 'raced-file-transfer',
        beforeArchiveEntryTransfer: async ({ relativePath, kind, destination }) => {
          if (relativePath === 'archive-manifest.json' && kind === 'file') await writeFile(destination, sentinel)
        }
      }), /archive publication child already exists/u)
      assert.equal(await readFile(path.join(fixture.archiveRoot, 'archive-manifest.json'), 'utf8'), sentinel)
      assert.equal(existsSync(path.join(fixture.archiveRoot, '.archive-incomplete')), true)
      assert.equal(existsSync(path.join(fixture.stagingRootFor('raced-file-transfer'), '.archive-incomplete')), true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('raced directory immediately before transfer', async () => {
    const fixture = await createFixture()
    try {
      await assert.rejects(createMainConsolidationArchive(fixture.args, {
        randomUUID: () => 'raced-directory-transfer',
        beforeArchiveEntryTransfer: async ({ relativePath, kind, destination }) => {
          if (relativePath === 'bundles' && kind === 'directory') {
            await mkdir(destination)
            await writeFile(path.join(destination, 'sentinel.txt'), 'keep-raced-directory')
          }
        }
      }), /archive publication child already exists/u)
      assert.equal(await readFile(path.join(fixture.archiveRoot, 'bundles', 'sentinel.txt'), 'utf8'), 'keep-raced-directory')
      assert.equal(existsSync(path.join(fixture.archiveRoot, '.archive-incomplete')), true)
      assert.equal(existsSync(path.join(fixture.stagingRootFor('raced-directory-transfer'), '.archive-incomplete')), true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })
})

test('exclusive publication preserves incomplete markers when claim marking or entry transfer fails', async (t) => {
  await t.test('final marker creation fails', async () => {
    const fixture = await createFixture()
    try {
      await assert.rejects(createMainConsolidationArchive(fixture.args, {
        randomUUID: () => 'marker-failure',
        writeFile: async (destination, contents, options) => {
          if (destination === path.join(fixture.archiveRoot, '.archive-incomplete')) throw new Error('synthetic final marker failure')
          return writeFile(destination, contents, options)
        }
      }), /synthetic final marker failure/u)
      assert.equal(existsSync(fixture.archiveRoot), false)
      assert.equal(existsSync(path.join(fixture.stagingRootFor('marker-failure'), '.archive-incomplete')), true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })

  await t.test('entry transfer fails after claim', async () => {
    const fixture = await createFixture()
    try {
      let transfers = 0
      await assert.rejects(createMainConsolidationArchive(fixture.args, {
        randomUUID: () => 'transfer-failure',
        link: async (source, destination) => {
          transfers += 1
          if (transfers === 2) throw new Error('synthetic entry transfer failure')
          return fsLink(source, destination)
        }
      }), /synthetic entry transfer failure/u)
      assert.equal(existsSync(path.join(fixture.archiveRoot, '.archive-incomplete')), true)
      assert.equal(existsSync(path.join(fixture.stagingRootFor('transfer-failure'), '.archive-incomplete')), true)
    } finally {
      await rm(fixture.root, { recursive: true, force: true })
    }
  })
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
  const artifactDirectory = path.join(root, 'artifact-sources')
  await mkdir(artifactDirectory)
  const artifactDefinitions = [
    ['accepted-vsix', 'accepted.vsix'],
    ['bazaar-core-log', 'bazaar-core.log'],
    ['fixture-docx', 'project-review-rules.docx'],
    ['fixture-manifest', 'document-fixture-manifest.json'],
    ['fixture-pdf', 'system-review-guidelines.pdf'],
    ['fixture-xlsx', 'review-traceability-ledger.xlsx'],
    ['old-vsix', 'old.vsix'],
    ['operator-result', 'operator-result.json'],
    ['pra-win-001-evidence', 'PRA-WIN-001-evidence.json'],
    ['scenario-manifest', 'scenario-manifest.json']
  ]
  const artifacts = []
  for (const [label, name] of artifactDefinitions) {
    const sourcePath = path.join(artifactDirectory, name)
    const contents = Buffer.from(`accepted evidence for ${label}\n`)
    await writeFile(sourcePath, contents)
    artifacts.push({ label, sourcePath, byteSize: contents.byteLength, sha256: createHash('sha256').update(contents).digest('hex') })
  }
  const artifactPath = artifacts.find((entry) => entry.label === 'operator-result').sourcePath
  initRepository(repositoryRoot, true)
  initRepository(externalOne)
  initRepository(externalTwo)
  addLocalOnlyCommit(externalOne, 'local-only-integration')
  addLocalOnlyCommit(externalTwo, 'local-only-accepted')
  const mainSha = git(['-C', repositoryRoot, 'rev-parse', 'main']).trim()
  const featureSha = git(['-C', repositoryRoot, 'rev-parse', 'feature']).trim()
  git(['-C', repositoryRoot, 'update-ref', 'refs/remotes/origin/main', mainSha])
  git(['-C', repositoryRoot, 'update-ref', 'refs/remotes/origin/feature', featureSha])
  git(['-C', repositoryRoot, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main'])
  const carrierMap = {
    ...structuredClone(sourceMap),
    carriers: sourceMap.carriers.map((carrier) => ({ ...structuredClone(carrier), fromSha: mainSha, toSha: featureSha }))
  }
  const mapText = `${JSON.stringify(carrierMap, null, 2)}\n`
  const inventory = {
    schemaVersion: 'bob-builtin-analyze/main-consolidation-inventory/v1',
    generatedAt: '2026-08-21T00:00:00.000Z',
    repository: 'katamor1/bob_builtin_analyze',
    consolidationMapSha256: createHash('sha256').update(mapText).digest('hex'),
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
    artifacts,
    blockers: []
  }
  const inventoryPath = path.join(root, 'inventory.json')
  const mapPath = path.join(root, 'map.json')
  const archiveRoot = path.join(root, 'archives', EXPECTED_LEAF)
  const summaryJson = path.join(root, 'archive-summary.json')
  const summaryMarkdown = path.join(root, 'archive-summary.md')
  await writeFile(inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
  await writeFile(mapPath, mapText)
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
    map: carrierMap,
    mapPath,
    inventoryPath,
    args,
    stagingRoot: path.join(path.dirname(archiveRoot), `.${EXPECTED_LEAF}.staging-${process.pid}-archive-test`),
    stagingRootFor: (suffix) => path.join(path.dirname(archiveRoot), `.${EXPECTED_LEAF}.staging-${process.pid}-${suffix}`)
  }
}

async function rewriteManifest(fixture, mutate) {
  const manifestPath = path.join(fixture.archiveRoot, 'archive-manifest.json')
  const detachedPath = path.join(fixture.archiveRoot, 'archive-manifest.sha256')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  mutate(manifest)
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(manifestPath, manifestText)
  await writeFile(detachedPath, `${createHash('sha256').update(manifestText).digest('hex')}\n`)
}

async function addLinkedWorktreeBoundary(fixture) {
  const linked = [
    { name: 'linked-one', start: fixture.mainSha },
    { name: 'linked-two', start: fixture.featureSha }
  ]
  for (const entry of linked) {
    const worktreePath = path.join(fixture.root, entry.name)
    git(['-C', fixture.repositoryRoot, 'worktree', 'add', '-b', entry.name, worktreePath, entry.start])
  }
  writeFileSync(path.join(fixture.repositoryRoot, 'tracked.txt'), 'linked boundary stash\n')
  git(['-C', fixture.repositoryRoot, 'stash', 'push', '-m', 'linked boundary stash'])
  git(['-C', fixture.repositoryRoot, 'update-ref', 'refs/codex/turn-diffs/archive-test/base', fixture.mainSha])

  const inventory = JSON.parse(await readFile(fixture.inventoryPath, 'utf8'))
  fixture.linkedWorktrees = linked.map((entry) => {
    const worktreePath = path.join(fixture.root, entry.name)
    const head = git(['-C', worktreePath, 'rev-parse', 'HEAD']).trim()
    const adminDirectory = git(['-C', worktreePath, 'rev-parse', '--absolute-git-dir']).trim()
    inventory.localBranches.push({ branch: entry.name, sha: head })
    inventory.worktrees.push({ path: worktreePath, head, branch: `refs/heads/${entry.name}`, detached: false, status: [] })
    return { path: worktreePath, head, adminId: path.basename(adminDirectory) }
  })
  inventory.localBranches.sort((left, right) => left.branch.localeCompare(right.branch))
  inventory.worktrees.sort((left, right) => left.path.localeCompare(right.path))
  await writeFile(fixture.inventoryPath, `${JSON.stringify(inventory, null, 2)}\n`)
}

function renameLinkedWorktreeAdmin(repositoryRoot, worktreePath) {
  const branch = git(['-C', worktreePath, 'symbolic-ref', '--short', 'HEAD']).trim()
  const head = git(['-C', worktreePath, 'rev-parse', 'HEAD']).trim()
  const holder = path.join(path.dirname(worktreePath), 'admin-holder')
  const placeholder = path.join(holder, path.basename(worktreePath))
  git(['-C', repositoryRoot, 'worktree', 'remove', worktreePath])
  mkdirSync(holder, { recursive: true })
  git(['-C', repositoryRoot, 'worktree', 'add', '--detach', placeholder, head])
  git(['-C', repositoryRoot, 'worktree', 'add', worktreePath, branch])
  git(['-C', repositoryRoot, 'worktree', 'remove', placeholder])
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

function addLocalOnlyCommit(repository, branch) {
  git(['-C', repository, 'switch', '-c', branch])
  writeFileSync(path.join(repository, `${branch}.txt`), `${branch}\n`)
  git(['-C', repository, 'add', `${branch}.txt`])
  git(['-C', repository, 'commit', '-m', branch])
  git(['-C', repository, 'switch', 'main'])
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

function restoreEveryAdvertisedHead(bundlePath, expectedHeads, destination) {
  git(['init', '--bare', destination])
  const restoredHeads = git(['-C', destination, 'bundle', 'unbundle', bundlePath]).trim().split(/\r?\n/u).filter(Boolean)
  assert.deepEqual(restoredHeads, expectedHeads, 'advertised bundle heads mismatch')
  for (const [index, line] of restoredHeads.entries()) {
    const match = line.match(/^([0-9a-f]{40}) (.+)$/u)
    assert.ok(match, `invalid restored head: ${line}`)
    const restoredRef = `refs/restored/${String(index).padStart(3, '0')}`
    git(['-C', destination, 'update-ref', restoredRef, match[1]])
    assert.equal(git(['-C', destination, 'rev-parse', restoredRef]).trim(), match[1])
    git(['-C', destination, 'cat-file', '-e', `${match[1]}^{commit}`])
  }
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
