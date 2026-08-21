import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  assertArchiveDestinationAvailable,
  buildArchiveManifest,
  copyVerifiedFile,
  hashFile,
  validateArchiveRequest,
  verifyExistingArchive
} from '../archivePolicy.mjs'

const EXPECTED_LEAF = '2026-08-21-main-consolidation'

async function writeArchiveControls(archiveRoot, manifest) {
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  await writeFile(path.join(archiveRoot, 'archive-manifest.json'), manifestText)
  await writeFile(path.join(archiveRoot, 'archive-manifest.sha256'), `${createHash('sha256').update(manifestText).digest('hex')}\n`)
}

test('archive root must be outside the repository and use the exact leaf', () => {
  const repoRoot = path.resolve('repo')
  assert.throws(() => validateArchiveRequest({
    repoRoot,
    archiveRoot: path.join(repoRoot, 'archive'),
    expectedLeaf: EXPECTED_LEAF,
    inventory: { readyForArchive: true }
  }), /outside the repository/)
  assert.throws(() => validateArchiveRequest({
    repoRoot,
    archiveRoot: path.resolve('archives', 'wrong-leaf'),
    expectedLeaf: EXPECTED_LEAF,
    inventory: { readyForArchive: true }
  }), /leaf does not match/)
  assert.throws(() => validateArchiveRequest({
    repoRoot,
    archiveRoot: path.resolve('archives', EXPECTED_LEAF),
    expectedLeaf: EXPECTED_LEAF,
    inventory: { readyForArchive: false }
  }), /not ready/)
})

test('archive creation refuses an existing final root', () => {
  assert.throws(() => assertArchiveDestinationAvailable({
    archiveRoot: path.resolve('archives', EXPECTED_LEAF),
    lstat: () => ({ isDirectory: () => true })
  }), /already exists/)
})

test('hashFile reports exact bytes and SHA-256', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-hash-'))
  try {
    const source = path.join(temporary, 'evidence.bin')
    await writeFile(source, Buffer.from([0, 1, 2, 255]))
    assert.deepEqual(await hashFile(source), {
      byteSize: 4,
      sha256: '3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56'
    })
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('archive manifest is path-sorted and deterministic with an injected timestamp', () => {
  const entries = [
    { path: 'z/last.bin', byteSize: 2, sha256: 'b'.repeat(64) },
    { path: 'a/first.bin', byteSize: 1, sha256: 'a'.repeat(64) }
  ]
  const expected = {
    schemaVersion: 'bob-builtin-analyze/main-consolidation-archive-manifest/v1',
    generatedAt: '2026-08-21T00:00:00.000Z',
    entries: [entries[1], entries[0]]
  }
  assert.deepEqual(buildArchiveManifest(entries, { generatedAt: expected.generatedAt }), expected)
  assert.deepEqual(buildArchiveManifest([...entries].reverse(), { generatedAt: expected.generatedAt }), expected)
})

test('verified copy rejects destination collisions and source mutation', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-copy-'))
  try {
    const source = path.join(temporary, 'source.bin')
    const destination = path.join(temporary, 'destination.bin')
    await writeFile(source, 'original')
    await writeFile(destination, 'collision')
    await assert.rejects(copyVerifiedFile({ sourcePath: source, destinationPath: destination }), /already exists|exclusive/u)
    assert.equal(await readFile(destination, 'utf8'), 'collision')

    await rm(destination)
    await assert.rejects(copyVerifiedFile({ sourcePath: source, destinationPath: destination }, {
      afterSourceRead: async () => writeFile(source, 'mutated!')
    }), /changed during archive copy/)
    await assert.rejects(readFile(destination))
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('verified copy rejects symlink sources', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-link-'))
  try {
    const real = path.join(temporary, 'real.bin')
    const link = path.join(temporary, 'link.bin')
    await writeFile(real, 'real')
    try {
      await symlink(real, link, 'file')
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('symlink creation is not permitted on this host')
      throw error
    }
    await assert.rejects(copyVerifiedFile({ sourcePath: link, destinationPath: path.join(temporary, 'copy.bin') }), /regular file/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('verifyExistingArchive rejects path traversal and changed bytes', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-verify-'))
  try {
    await mkdir(path.join(temporary, 'artifacts'), { recursive: true })
    const archived = path.join(temporary, 'artifacts', 'evidence.bin')
    await writeFile(archived, 'evidence')
    const hashed = await hashFile(archived)
    await assert.rejects(verifyExistingArchive({
      archiveRoot: temporary,
      manifest: {
        schemaVersion: 'bob-builtin-analyze/main-consolidation-archive-manifest/v1',
        generatedAt: '2026-08-21T00:00:00.000Z',
        entries: [{ path: '../escape.bin', ...hashed }]
      }
    }), /unsafe manifest path/)
    const changedManifest = buildArchiveManifest([{ path: 'artifacts/evidence.bin', ...hashed }], { generatedAt: '2026-08-21T00:00:00.000Z' })
    await writeArchiveControls(temporary, changedManifest)
    await writeFile(archived, 'changed!')
    await assert.rejects(verifyExistingArchive({
      archiveRoot: temporary,
      manifest: changedManifest
    }), /hash mismatch/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('verifyExistingArchive rejects an incomplete archive marker', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-incomplete-'))
  try {
    await writeFile(path.join(temporary, '.archive-incomplete'), 'incomplete\n')
    await assert.rejects(verifyExistingArchive({
      archiveRoot: temporary,
      manifest: buildArchiveManifest([], { generatedAt: '2026-08-21T00:00:00.000Z' })
    }), /incomplete/)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('verifyExistingArchive rejects a symlinked entry ancestor even when target bytes match', async (t) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-entry-link-'))
  try {
    const archiveRoot = path.join(temporary, 'archive')
    const external = path.join(temporary, 'external')
    await mkdir(archiveRoot)
    await mkdir(external)
    const target = path.join(external, 'evidence.bin')
    await writeFile(target, 'matching evidence')
    try {
      await symlink(external, path.join(archiveRoot, 'artifacts'), 'junction')
    } catch (error) {
      if (error?.code === 'EPERM') return t.skip('junction creation is not permitted on this host')
      throw error
    }
    const hashed = await hashFile(target)
    await assert.rejects(verifyExistingArchive({
      archiveRoot,
      manifest: buildArchiveManifest([{ path: 'artifacts/evidence.bin', ...hashed }], { generatedAt: '2026-08-21T00:00:00.000Z' })
    }), /symbolic link|reparse/u)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})

test('archive tree validation requires only manifest files and its two control files', async (t) => {
  async function createExactTree() {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-exact-tree-'))
    await mkdir(path.join(temporary, 'artifacts'))
    const entryPath = path.join(temporary, 'artifacts', 'evidence.bin')
    await writeFile(entryPath, 'evidence')
    const manifest = buildArchiveManifest([
      { path: 'artifacts/evidence.bin', ...(await hashFile(entryPath)) }
    ], { generatedAt: '2026-08-21T00:00:00.000Z' })
    await writeArchiveControls(temporary, manifest)
    return { temporary, manifest }
  }

  await t.test('exact tree succeeds', async () => {
    const fixture = await createExactTree()
    try {
      const verified = await verifyExistingArchive({ archiveRoot: fixture.temporary, manifest: fixture.manifest })
      assert.equal(verified.verified, true)
    } finally {
      await rm(fixture.temporary, { recursive: true, force: true })
    }
  })

  for (const [name, addUnexpected] of [
    ['unexpected file', async (root) => writeFile(path.join(root, 'unexpected.txt'), 'unexpected')],
    ['unexpected directory', async (root) => mkdir(path.join(root, 'unexpected-directory'))]
  ]) {
    await t.test(name, async () => {
      const fixture = await createExactTree()
      try {
        await addUnexpected(fixture.temporary)
        await assert.rejects(
          verifyExistingArchive({ archiveRoot: fixture.temporary, manifest: fixture.manifest }),
          /archive tree does not match the manifest/u
        )
      } finally {
        await rm(fixture.temporary, { recursive: true, force: true })
      }
    })
  }

  await t.test('unexpected symlink or reparse point', async (t) => {
    const fixture = await createExactTree()
    try {
      try {
        await symlink(path.join(fixture.temporary, 'artifacts'), path.join(fixture.temporary, 'unexpected-link'), 'junction')
      } catch (error) {
        if (error?.code === 'EPERM') return t.skip('junction creation is not permitted on this host')
        throw error
      }
      await assert.rejects(
        verifyExistingArchive({ archiveRoot: fixture.temporary, manifest: fixture.manifest }),
        /symbolic link|reparse/u
      )
    } finally {
      await rm(fixture.temporary, { recursive: true, force: true })
    }
  })
})

test('verifyExistingArchive detects an entry injected after either root listing', async (t) => {
  for (const [name, injectAfterListing] of [['first scan', 0], ['final scan', 1]]) {
    await t.test(name, async () => {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-second-scan-'))
      const unexpected = path.join(temporary, 'late-unexpected.txt')
      let rootListings = 0
      try {
        await mkdir(path.join(temporary, 'artifacts'))
        const entryPath = path.join(temporary, 'artifacts', 'evidence.bin')
        await writeFile(entryPath, 'evidence')
        const manifest = buildArchiveManifest([
          { path: 'artifacts/evidence.bin', ...(await hashFile(entryPath)) }
        ], { generatedAt: '2026-08-21T00:00:00.000Z' })
        await writeArchiveControls(temporary, manifest)
        await assert.rejects(verifyExistingArchive({ archiveRoot: temporary, manifest }, {
          readdir: async (directory) => {
            const names = await readdir(directory)
            if (path.resolve(directory) === path.resolve(temporary) && rootListings++ === injectAfterListing) {
              await writeFile(unexpected, 'keep-late-unexpected')
            }
            return names
          }
        }), /archive tree does not match the manifest|archive tree changed/u)
        assert.equal(await readFile(unexpected, 'utf8'), 'keep-late-unexpected')
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })
  }
})

test('verifyExistingArchive binds canonical manifest bytes and the exact detached hash', async (t) => {
  for (const [name, mutateControl] of [
    ['semantically equivalent non-canonical manifest bytes', async (root, manifest) => {
      await writeFile(path.join(root, 'archive-manifest.json'), `${JSON.stringify(manifest)}\n`)
    }],
    ['wrong detached hash bytes', async (root) => {
      await writeFile(path.join(root, 'archive-manifest.sha256'), `${'b'.repeat(64)}\n`)
    }]
  ]) {
    await t.test(name, async () => {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-control-binding-'))
      try {
        await mkdir(path.join(temporary, 'artifacts'))
        const entryPath = path.join(temporary, 'artifacts', 'evidence.bin')
        await writeFile(entryPath, 'evidence')
        const manifest = buildArchiveManifest([
          { path: 'artifacts/evidence.bin', ...(await hashFile(entryPath)) }
        ], { generatedAt: '2026-08-21T00:00:00.000Z' })
        await writeArchiveControls(temporary, manifest)
        await mutateControl(temporary, manifest)
        await assert.rejects(
          verifyExistingArchive({ archiveRoot: temporary, manifest }),
          /physical archive manifest|detached hash/u
        )
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })
  }
})

test('verifyExistingArchive rejects invalid and non-canonical manifest generatedAt values', async (t) => {
  for (const [name, generatedAt] of [
    ['invalid', 'not-a-timestamp'],
    ['non-canonical', '2026-08-21T17:00:58.750+00:00']
  ]) {
    await t.test(name, async () => {
      const temporary = await mkdtemp(path.join(os.tmpdir(), 'archive-policy-manifest-time-'))
      try {
        await mkdir(path.join(temporary, 'artifacts'))
        const entryPath = path.join(temporary, 'artifacts', 'evidence.bin')
        await writeFile(entryPath, 'evidence')
        const manifest = buildArchiveManifest([
          { path: 'artifacts/evidence.bin', ...(await hashFile(entryPath)) }
        ], { generatedAt: '2026-08-21T17:00:58.750Z' })
        manifest.generatedAt = generatedAt
        await writeArchiveControls(temporary, manifest)
        await assert.rejects(
          verifyExistingArchive({ archiveRoot: temporary, manifest }),
          /manifest generatedAt.*canonical UTC timestamp/u
        )
      } finally {
        await rm(temporary, { recursive: true, force: true })
      }
    })
  }
})
