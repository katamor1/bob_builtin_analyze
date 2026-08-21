import { spawnSync } from 'node:child_process'
import { createHash, randomUUID as nodeRandomUUID } from 'node:crypto'
import { link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, rmdir, unlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertArchivePathComponents,
  assertArchiveDestinationAvailable,
  assertExactArchiveTree,
  buildArchiveManifest,
  copyVerifiedFile,
  hashFile,
  validateArchiveRequest,
  verifyExistingArchive
} from './archivePolicy.mjs'
import { freezeCarrierPatches, verifyPatchedTree } from './freeze-carrier-patches.mjs'
import { carrierPatchName } from './carrierPatchPolicy.mjs'
import { validateArchiveInventory, validateConsolidationMap } from './consolidationPolicy.mjs'
import { parseWorktreePorcelain } from './capture-main-consolidation-inventory.mjs'

const EXPECTED_ARCHIVE_LEAF = '2026-08-21-main-consolidation'
const ARCHIVE_SCHEMA = 'bob-builtin-analyze/main-consolidation-archive/v1'
const INVENTORY_SCHEMA = 'bob-builtin-analyze/main-consolidation-inventory/v1'
const LABEL = /^[a-z0-9][a-z0-9-]*$/u
const SHA1 = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const APPROVED_ARTIFACT_LABELS = [
  'accepted-vsix',
  'bazaar-core-log',
  'fixture-docx',
  'fixture-manifest',
  'fixture-pdf',
  'fixture-xlsx',
  'old-vsix',
  'operator-result',
  'pra-win-001-evidence',
  'scenario-manifest'
]
const REQUIRED_BUNDLE_PATHS = [
  'bundles/accepted-main-all-refs.bundle',
  'bundles/integration-xlsx-on-prereq-all-refs.bundle',
  'bundles/repository-all-refs.bundle'
]

export async function createMainConsolidationArchive(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArguments(argv)
  const read = dependencies.readFile ?? readFile
  const inventoryText = String(await read(args.inventory, 'utf8'))
  const inventory = parseJson(inventoryText, 'inventory')
  const rawMap = await read(args.map)
  const mapBytes = Buffer.isBuffer(rawMap) ? rawMap : Buffer.from(String(rawMap), 'utf8')
  const map = parseJson(mapBytes.toString('utf8'), 'map')
  const validateMap = dependencies.validateConsolidationMap ?? validateConsolidationMap
  validateMap(map)
  validateInventoryMapBinding(inventory, mapBytes)
  const run = dependencies.run ?? defaultRun
  const observeAncestry = dependencies.observeBaselineAncestry ?? observeBaselineAncestry
  const baselineIsAncestor = observeAncestry({
    repositoryRoot: args.repositoryRoot,
    baselineMain: map.baselineMain,
    mainSha: inventory?.topology?.mainSha,
    run
  })
  const validateInventory = dependencies.validateArchiveInventory ?? validateArchiveInventory
  validateInventory(inventory, map, { baselineIsAncestor })
  validateArchiveRequest({
    repoRoot: args.repositoryRoot,
    archiveRoot: args.archiveRoot,
    expectedLeaf: EXPECTED_ARCHIVE_LEAF,
    inventory
  })
  assertSummaryDestinations(args)

  if (args.verifyExisting) return verifyPublishedArchive({ args, inventory, inventoryText, map, dependencies })

  assertArchiveDestinationAvailable({ archiveRoot: args.archiveRoot, lstat: dependencies.lstatSync })
  await prepareArchiveParent(args, dependencies)
  assertArchiveDestinationAvailable({ archiveRoot: args.archiveRoot, lstat: dependencies.lstatSync })
  validateExplicitSources(args, inventory)

  const generatedAt = dependencies.now ? dependencies.now().toISOString() : new Date().toISOString()
  const stagingRoot = path.join(
    path.dirname(args.archiveRoot),
    `.${EXPECTED_ARCHIVE_LEAF}.staging-${process.pid}-${(dependencies.randomUUID ?? nodeRandomUUID)()}`
  )
  await (dependencies.mkdir ?? mkdir)(stagingRoot)
  const markerPath = path.join(stagingRoot, '.archive-incomplete')
  const markerContents = `${generatedAt}\n`
  await writeExclusive(markerPath, markerContents, dependencies)
  const stagingMarkerOwnership = await captureMarkerOwnership(markerPath, markerContents, dependencies)

  const manifestEntries = []
  const repositories = [
    { label: 'repository', sourcePath: args.repositoryRoot, expectedHead: inventory.topology?.mainSha, safeDirectory: false },
    ...args.bundleRepositories.map((repository) => ({
      label: repository.label,
      sourcePath: repository.path,
      expectedHead: inventory.externalRepositories.find((entry) => entry.label === repository.label)?.head,
      expectedBranch: inventory.externalRepositories.find((entry) => entry.label === repository.label)?.branch,
      safeDirectory: true
    }))
  ]
  const bundleHeads = []
  for (const repository of repositories) {
    await validateRepositorySource(repository, { lstat: dependencies.lstat ?? lstat, run })
    const repositoryBoundary = repository.label === 'repository'
      ? {
          kind: 'primary',
          snapshot: observeAndValidatePrimaryRefs({
            repository,
            inventory,
            run,
            mismatchMessage: 'primary repository refs do not match inventory',
            worktreeMismatchMessage: 'primary repository worktrees do not match inventory'
          })
        }
      : {
          kind: 'external',
          snapshot: observeAndValidateExternalRefs({
            repository,
            run,
            mismatchMessage: `external repository refs do not match inventory: ${repository.label}`
          })
        }
    const relativePath = `bundles/${repository.label}-all-refs.bundle`
    const bundlePath = path.join(stagingRoot, ...relativePath.split('/'))
    await mkdirOwned(path.dirname(bundlePath), dependencies)
    await createBundle(repository, bundlePath, { run, createBundle: dependencies.createBundle })
    const heads = verifyBundle(bundlePath, run)
    if (repositoryBoundary.kind === 'primary') {
      const after = observeAndValidatePrimaryRefs({
        repository,
        inventory,
        run,
        mismatchMessage: 'primary repository refs changed during bundle creation',
        worktreeMismatchMessage: 'primary repository worktree boundary changed during bundle creation'
      })
      if (JSON.stringify(after.ownedRefs) !== JSON.stringify(repositoryBoundary.snapshot.ownedRefs) ||
          JSON.stringify(after.symbolicRemoteHead) !== JSON.stringify(repositoryBoundary.snapshot.symbolicRemoteHead) ||
          JSON.stringify(after.head) !== JSON.stringify(repositoryBoundary.snapshot.head)) {
        throw new Error('primary repository refs changed during bundle creation')
      }
      if (JSON.stringify(after.otherRefs) !== JSON.stringify(repositoryBoundary.snapshot.otherRefs)) {
        throw new Error('primary repository other refs changed during bundle creation')
      }
      if (JSON.stringify(after.worktreeHeads) !== JSON.stringify(repositoryBoundary.snapshot.worktreeHeads)) {
        throw new Error('primary repository worktree boundary changed during bundle creation')
      }
      validatePrimaryBundleHeads(heads, repositoryBoundary.snapshot)
    } else {
      const after = observeAndValidateExternalRefs({
        repository,
        run,
        mismatchMessage: `external repository refs changed during bundle creation: ${repository.label}`
      })
      if (JSON.stringify(after) !== JSON.stringify(repositoryBoundary.snapshot)) {
        throw new Error(`external repository refs changed during bundle creation: ${repository.label}`)
      }
      validateExternalBundleHeads(heads, repositoryBoundary.snapshot, repository.label)
    }
    bundleHeads.push({ path: relativePath, heads })
    manifestEntries.push({ path: relativePath, ...(await hashFile(bundlePath)) })
  }

  for (const artifact of inventory.artifacts) {
    const relativePath = `artifacts/${artifact.label}/${path.basename(artifact.sourcePath)}`
    const destinationPath = path.join(stagingRoot, ...relativePath.split('/'))
    await mkdirOwned(path.dirname(destinationPath), dependencies)
    const copy = dependencies.copyVerifiedFile ?? copyVerifiedFile
    const copied = await copy({ sourcePath: artifact.sourcePath, destinationPath, expected: artifact }, {
      afterSourceRead: dependencies.afterSourceRead
    })
    manifestEntries.push({ path: relativePath, byteSize: copied.byteSize, sha256: copied.sha256 })
  }

  if (!Array.isArray(map?.carriers) || map.carriers.length !== 6) throw new Error('archive requires exactly six carriers')
  const carrierDirectory = path.join(stagingRoot, 'carrier-patches')
  const freeze = dependencies.freezeCarrierPatches ?? freezeCarrierPatches
  const carrierEvidence = await freeze({ map, repoRoot: args.repositoryRoot, carrierDirectory, run })
  validateCarrierEvidence(map.carriers, carrierEvidence)
  const carrierManifestPath = path.join(carrierDirectory, 'carrier-patches.json')
  const carrierManifest = parseJson(String(await readFile(carrierManifestPath, 'utf8')), 'carrier patch manifest')
  if (carrierManifest.schemaVersion !== 'bob-builtin-analyze/carrier-patches/v1' ||
      JSON.stringify(carrierManifest.carriers) !== JSON.stringify(carrierEvidence)) {
    throw new Error('carrier patch manifest does not match verified evidence')
  }
  for (const name of ['carrier-patches.json', ...carrierEvidence.map((entry) => entry.patch)]) {
    const relativePath = `carrier-patches/${name}`
    const actual = await hashFile(path.join(carrierDirectory, name))
    if (name !== 'carrier-patches.json') {
      const entry = carrierEvidence.find((candidate) => candidate.patch === name)
      if (!entry || entry.byteSize !== actual.byteSize || entry.sha256 !== actual.sha256) throw new Error(`carrier patch hash mismatch: ${name}`)
    }
    manifestEntries.push({ path: relativePath, ...actual })
  }

  const inventoryFiles = inventorySnapshots(inventory)
  for (const [name, contents] of Object.entries(inventoryFiles)) {
    const relativePath = `inventory/${name}`
    const destinationPath = path.join(stagingRoot, ...relativePath.split('/'))
    await mkdirOwned(path.dirname(destinationPath), dependencies)
    await writeExclusive(destinationPath, contents, dependencies)
    manifestEntries.push({ path: relativePath, ...(await hashFile(destinationPath)) })
  }

  const manifest = buildArchiveManifest(manifestEntries, { generatedAt })
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`
  const manifestHash = createHash('sha256').update(manifestText).digest('hex')
  await writeExclusive(path.join(stagingRoot, 'archive-manifest.json'), manifestText, dependencies)
  await writeExclusive(path.join(stagingRoot, 'archive-manifest.sha256'), `${manifestHash}\n`, dependencies)
  await dependencies.beforePublish?.()
  assertArchiveDestinationAvailable({ archiveRoot: args.archiveRoot, lstat: dependencies.lstatSync })
  await publishArchiveExclusively({
    stagingRoot,
    archiveRoot: args.archiveRoot,
    markerPath,
    markerContents,
    stagingMarkerOwnership,
    manifest,
    dependencies
  })

  const summary = archiveSummary({
    archiveRoot: args.archiveRoot,
    generatedAt,
    inventory,
    inventoryText,
    manifest,
    manifestHash,
    bundleHeads: bundleHeads.sort((left, right) => compareText(left.path, right.path)),
    carrierEvidence
  })
  await writeSummaries(args, summary, dependencies)
  return { exitCode: 0, summary, manifest }
}

export function renderArchiveMarkdown(summary) {
  return [
    '# Main Consolidation Archive',
    '',
    `- Generated: \`${summary.generatedAt}\``,
    `- Archive root: \`${escapeMarkdown(summary.archiveRoot)}\``,
    `- Manifest SHA-256: \`${summary.manifestSha256}\``,
    `- Entries: ${summary.entryCount}`,
    `- Bundles: ${summary.bundleCount}`,
    `- Verified: **${summary.verified ? 'yes' : 'no'}**`,
    ''
  ].join('\n')
}

async function verifyPublishedArchive({ args, inventory, inventoryText, map, dependencies }) {
  let rootMetadata
  try {
    rootMetadata = await (dependencies.lstat ?? lstat)(args.archiveRoot)
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('existing archive root is required for --verify-existing')
    throw error
  }
  if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) throw new Error('archive root is not a regular directory')
  const manifestPath = path.join(args.archiveRoot, 'archive-manifest.json')
  await assertArchivePathComponents({ archiveRoot: args.archiveRoot, relativePath: 'archive-manifest.json' }, { lstat: dependencies.lstat })
  await assertArchivePathComponents({ archiveRoot: args.archiveRoot, relativePath: 'archive-manifest.sha256' }, { lstat: dependencies.lstat })
  const manifestText = String(await (dependencies.readFile ?? readFile)(manifestPath, 'utf8'))
  const manifest = parseJson(manifestText, 'archive manifest')
  assertRequiredArchiveContract(manifest, inventory, map)
  const manifestHash = createHash('sha256').update(manifestText).digest('hex')
  const inventoryHash = createHash('sha256').update(inventoryText).digest('hex')
  const priorSummary = await readExistingSummary(args.summaryJson, dependencies)
  const verified = await verifyExistingArchive({ archiveRoot: args.archiveRoot, manifest }, {
    run: dependencies.run,
    now: dependencies.now,
    lstat: dependencies.lstat,
    readdir: dependencies.readdir,
    readFile: dependencies.readFile
  })
  validateVerifiedBundleHeads(verified.bundleHeads, inventory)
  const carrierPatchCount = await verifyArchivedCarrierEvidence({
    archiveRoot: args.archiveRoot,
    repoRoot: args.repositoryRoot,
    manifest,
    map,
    dependencies
  })
  if (priorSummary) validatePriorSummary(priorSummary, {
    archiveRoot: args.archiveRoot,
    generatedAt: manifest.generatedAt,
    inventoryGeneratedAt: inventory.generatedAt,
    inventoryHash,
    manifestHash,
    entryCount: manifest.entries.length,
    bundleHeads: verified.bundleHeads,
    carrierPatchCount
  })
  const summaryGeneratedAt = priorSummary?.generatedAt ?? manifest.generatedAt
  const summary = {
    ...verified,
    generatedAt: summaryGeneratedAt,
    inventoryGeneratedAt: inventory.generatedAt,
    inventorySha256: inventoryHash,
    manifestSha256: manifestHash,
    carrierPatchCount
  }
  await writeSummaries(args, summary, dependencies)
  return { exitCode: 0, summary, manifest }
}

async function prepareArchiveParent(args, dependencies) {
  const parent = path.dirname(args.archiveRoot)
  const repositoryReal = await (dependencies.realpath ?? realpath)(args.repositoryRoot)
  const existingAncestor = await findExistingAncestor(parent, dependencies.lstat ?? lstat)
  const ancestorReal = await (dependencies.realpath ?? realpath)(existingAncestor)
  const prospectiveParent = path.resolve(ancestorReal, path.relative(existingAncestor, parent))
  validateArchiveRequest({
    repoRoot: repositoryReal,
    archiveRoot: path.join(prospectiveParent, path.basename(args.archiveRoot)),
    expectedLeaf: EXPECTED_ARCHIVE_LEAF,
    inventory: { readyForArchive: true }
  })
  await (dependencies.mkdir ?? mkdir)(parent, { recursive: true })
  const parentReal = await (dependencies.realpath ?? realpath)(parent)
  validateArchiveRequest({
    repoRoot: repositoryReal,
    archiveRoot: path.join(parentReal, path.basename(args.archiveRoot)),
    expectedLeaf: EXPECTED_ARCHIVE_LEAF,
    inventory: { readyForArchive: true }
  })
}

async function publishArchiveExclusively({ stagingRoot, archiveRoot, markerPath, markerContents, stagingMarkerOwnership, manifest, dependencies }) {
  const makeDirectory = dependencies.mkdir ?? mkdir
  const remove = dependencies.rm ?? rm
  const removeDirectory = dependencies.rmdir ?? rmdir
  const inspect = dependencies.lstat ?? lstat
  const list = dependencies.readdir ?? readdir
  const finalMarker = path.join(archiveRoot, '.archive-incomplete')
  let claimed = false
  let finalMarkerCreated = false
  let stagingMarkerRemoved = false
  let finalMarkerOwnership
  try {
    try {
      await makeDirectory(archiveRoot)
      claimed = true
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error('exclusive archive claim refused an existing destination')
      throw error
    }
    try {
      await writeExclusive(finalMarker, markerContents, dependencies)
      finalMarkerCreated = true
      finalMarkerOwnership = await captureMarkerOwnership(finalMarker, markerContents, dependencies)
    } catch (error) {
      const children = await list(archiveRoot)
      if (children.length === 0) {
        await removeDirectory(archiveRoot)
        claimed = false
      }
      throw error
    }
    await dependencies.afterArchiveRootClaim?.()
    await assertMarkerOwnership(stagingMarkerOwnership, dependencies)
    await assertMarkerOwnership(finalMarkerOwnership, dependencies)
    await assertExactArchiveTree({ archiveRoot: stagingRoot, manifest, requireIncompleteMarker: true }, {
      lstat: dependencies.lstat,
      readdir: dependencies.readdir
    })
    await assertMarkerOwnership(stagingMarkerOwnership, dependencies)
    await assertMarkerOwnership(finalMarkerOwnership, dependencies)
    const children = (await list(stagingRoot)).filter((name) => name !== path.basename(markerPath)).sort(compareText)
    for (const name of children) {
      await transferArchiveEntryNoReplace({
        source: path.join(stagingRoot, name),
        destination: path.join(archiveRoot, name),
        relativePath: name,
        dependencies
      })
    }
    await verifyTransferredArchive({ archiveRoot, manifest, dependencies })
    await assertMarkerOwnership(stagingMarkerOwnership, dependencies)
    await assertMarkerOwnership(finalMarkerOwnership, dependencies)
    await assertExactArchiveTree({ archiveRoot, manifest, requireIncompleteMarker: true }, {
      lstat: dependencies.lstat,
      readdir: dependencies.readdir
    })
    await assertMarkerOwnership(stagingMarkerOwnership, dependencies)
    await assertMarkerOwnership(finalMarkerOwnership, dependencies)
    const remaining = (await list(stagingRoot)).sort(compareText)
    if (JSON.stringify(remaining) !== JSON.stringify([path.basename(markerPath)])) throw new Error('archive staging is not empty after publication transfer')
    await dependencies.beforeArchiveMarkerRemoval?.({ stagingMarker: markerPath, finalMarker })
    await assertMarkerOwnership(stagingMarkerOwnership, dependencies)
    await assertMarkerOwnership(finalMarkerOwnership, dependencies)
    await remove(markerPath)
    stagingMarkerRemoved = true
    await removeDirectory(stagingRoot)
    await assertMarkerOwnership(finalMarkerOwnership, dependencies)
    await remove(finalMarker)
    finalMarkerCreated = false
  } catch (error) {
    if (stagingMarkerRemoved && await existsByLstat(stagingRoot, inspect) && !await existsByLstat(markerPath, inspect)) {
      await writeExclusive(markerPath, markerContents, dependencies)
    }
    if (claimed && finalMarkerCreated && !await existsByLstat(finalMarker, inspect)) {
      await writeExclusive(finalMarker, markerContents, dependencies)
    }
    throw error
  }
}

async function captureMarkerOwnership(markerPath, markerContents, dependencies) {
  const expectedBytes = Buffer.from(markerContents, 'utf8')
  const observed = await readStableMarker(markerPath, dependencies)
  const expectedHash = createHash('sha256').update(expectedBytes).digest('hex')
  if (!observed.bytes.equals(expectedBytes) || observed.hash !== expectedHash) {
    throw new Error('archive incomplete marker contents changed during ownership capture')
  }
  return Object.freeze({ markerPath, bytes: expectedBytes, hash: expectedHash, identity: observed.identity })
}

async function assertMarkerOwnership(ownership, dependencies) {
  if (!ownership) throw new Error('archive incomplete marker ownership was not captured')
  const observed = await readStableMarker(ownership.markerPath, dependencies)
  if (observed.identity !== ownership.identity || observed.hash !== ownership.hash || !observed.bytes.equals(ownership.bytes)) {
    throw new Error('archive incomplete marker ownership changed')
  }
}

async function readStableMarker(markerPath, dependencies) {
  const openFile = dependencies.open ?? open
  const inspect = dependencies.lstat ?? lstat
  let handle
  try {
    handle = await openFile(markerPath, 'r')
    const before = await handle.stat({ bigint: true })
    if (!before.isFile()) throw new Error('archive incomplete marker is not a regular file')
    const bytes = await handle.readFile()
    const after = await handle.stat({ bigint: true })
    const pathMetadata = await inspect(markerPath, { bigint: true })
    if (pathMetadata.isSymbolicLink() || !pathMetadata.isFile() ||
        markerIdentity(before) !== markerIdentity(after) || markerIdentity(after) !== markerIdentity(pathMetadata)) {
      throw new Error('archive incomplete marker ownership changed')
    }
    return {
      bytes,
      hash: createHash('sha256').update(bytes).digest('hex'),
      identity: markerIdentity(after)
    }
  } catch (error) {
    if (/^archive incomplete marker/u.test(error?.message ?? '')) throw error
    throw new Error('archive incomplete marker ownership changed')
  } finally {
    await handle?.close()
  }
}

function markerIdentity(metadata) {
  return JSON.stringify(['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].map((key) => String(metadata[key] ?? '')))
}

function observeBaselineAncestry({ repositoryRoot, baselineMain, mainSha, run }) {
  if (!path.isAbsolute(repositoryRoot ?? '') || !SHA1.test(baselineMain ?? '') || !SHA1.test(mainSha ?? '')) {
    throw new Error('invalid baseline ancestry observation request')
  }
  const result = normalizeRunResult(run('git', [
    '-C', repositoryRoot,
    'merge-base', '--is-ancestor', baselineMain, mainSha
  ]))
  if (result.status === 0) return true
  if (result.status === 1) return false
  throw new Error(`baseline ancestry observation failed: ${sanitize(result.stderr || result.stdout)}`)
}

async function transferArchiveEntryNoReplace({ source, destination, relativePath, dependencies }) {
  const inspect = dependencies.lstat ?? lstat
  const makeDirectory = dependencies.mkdir ?? mkdir
  const list = dependencies.readdir ?? readdir
  const createLink = dependencies.link ?? link
  const removeFile = dependencies.unlink ?? unlink
  const removeDirectory = dependencies.rmdir ?? rmdir
  const before = await inspect(source, { bigint: true })
  if (before.isSymbolicLink()) throw new Error(`archive publication source contains a symbolic link or reparse point: ${relativePath}`)
  const kind = before.isFile() ? 'file' : before.isDirectory() ? 'directory' : null
  if (kind === null) throw new Error(`archive publication source is not a regular file or directory: ${relativePath}`)

  if (await existsByLstat(destination, inspect)) throw new Error(`archive publication child already exists: ${relativePath}`)
  await dependencies.beforeArchiveEntryTransfer?.({ source, destination, relativePath, kind })

  if (kind === 'file') {
    try {
      await createLink(source, destination)
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error(`archive publication child already exists: ${relativePath}`)
      throw error
    }
    const [sourceAfter, destinationAfter] = await Promise.all([
      inspect(source, { bigint: true }),
      inspect(destination, { bigint: true })
    ])
    if (sourceAfter.isSymbolicLink() || destinationAfter.isSymbolicLink() || !sourceAfter.isFile() || !destinationAfter.isFile() ||
        sourceAfter.dev !== destinationAfter.dev || sourceAfter.ino !== destinationAfter.ino ||
        before.dev !== sourceAfter.dev || before.ino !== sourceAfter.ino) {
      throw new Error(`archive publication source changed during transfer: ${relativePath}`)
    }
    await removeFile(source)
    return
  }

  try {
    await makeDirectory(destination)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`archive publication child already exists: ${relativePath}`)
    throw error
  }
  const sourceAfterClaim = await inspect(source, { bigint: true })
  if (sourceAfterClaim.isSymbolicLink() || !sourceAfterClaim.isDirectory() ||
      before.dev !== sourceAfterClaim.dev || before.ino !== sourceAfterClaim.ino) {
    throw new Error(`archive publication source changed during transfer: ${relativePath}`)
  }
  for (const name of (await list(source)).sort(compareText)) {
    await transferArchiveEntryNoReplace({
      source: path.join(source, name),
      destination: path.join(destination, name),
      relativePath: `${relativePath}/${name}`,
      dependencies
    })
  }
  if ((await list(source)).length !== 0) throw new Error(`archive publication source directory is not empty after transfer: ${relativePath}`)
  await removeDirectory(source)
}

async function verifyTransferredArchive({ archiveRoot, manifest, dependencies }) {
  for (const entry of manifest.entries) {
    await assertArchivePathComponents({ archiveRoot, relativePath: entry.path }, { lstat: dependencies.lstat })
    const actual = await hashFile(path.join(archiveRoot, ...entry.path.split('/')))
    if (actual.byteSize !== entry.byteSize || actual.sha256 !== entry.sha256) throw new Error(`published archive entry hash mismatch: ${entry.path}`)
  }
  for (const name of ['archive-manifest.json', 'archive-manifest.sha256']) {
    await assertArchivePathComponents({ archiveRoot, relativePath: name }, { lstat: dependencies.lstat })
  }
}

async function findExistingAncestor(start, inspect) {
  let current = path.resolve(start)
  while (true) {
    try {
      await inspect(current)
      return current
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
    const parent = path.dirname(current)
    if (parent === current) throw new Error('archive parent has no existing ancestor')
    current = parent
  }
}

function validateExplicitSources(args, inventory) {
  if (!Array.isArray(inventory.externalRepositories) || !Array.isArray(inventory.artifacts)) throw new Error('inventory source lists are invalid')
  const requested = new Map(args.bundleRepositories.map((entry) => [entry.label, path.resolve(entry.path)]))
  if (requested.size !== args.bundleRepositories.length || requested.size !== inventory.externalRepositories.length) throw new Error('bundle repository list does not match inventory')
  for (const entry of inventory.externalRepositories) {
    if (!LABEL.test(entry?.label ?? '') || !path.isAbsolute(entry?.path ?? '') || !samePath(requested.get(entry.label), entry.path)) {
      throw new Error('bundle repository list does not match inventory')
    }
  }
  const artifactLabels = new Set()
  for (const artifact of inventory.artifacts) {
    if (!LABEL.test(artifact?.label ?? '') || artifactLabels.has(artifact.label) || !path.isAbsolute(artifact?.sourcePath ?? '')) throw new Error('inventory artifact list is invalid')
    artifactLabels.add(artifact.label)
  }
  if (JSON.stringify([...artifactLabels].sort(compareText)) !== JSON.stringify(APPROVED_ARTIFACT_LABELS)) throw new Error('inventory artifact list is invalid')
}

async function validateRepositorySource(repository, dependencies) {
  const metadata = await dependencies.lstat(repository.sourcePath)
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`bundle repository is not a regular directory: ${repository.label}`)
  const prefix = repository.safeDirectory ? ['-c', `safe.directory=${repository.sourcePath}`] : []
  const status = nonEmptyLines(runChecked(dependencies.run, 'git', [...prefix, '-C', repository.sourcePath, 'status', '--porcelain=v1'], 'repository status'))
  const allowedPrimary = repository.label === 'repository' && (status.length === 0 || status.length === 1 && status[0] === '?? .integration-xlsx-on-prereq/')
  if (status.length > 0 && !allowedPrimary) throw new Error(`${repository.label === 'repository' ? 'repository' : 'external repository'} is dirty: ${repository.label}`)
  const head = runChecked(dependencies.run, 'git', [...prefix, '-C', repository.sourcePath, 'rev-parse', 'HEAD'], 'repository head').trim()
  if (head !== repository.expectedHead) throw new Error(`repository head does not match inventory: ${repository.label}`)
}

function observeAndValidatePrimaryRefs({ repository, inventory, run, mismatchMessage, worktreeMismatchMessage }) {
  const expected = expectedPrimaryRefs(inventory)
  const observed = parsePrimaryRefs(runChecked(
    run,
    'git',
    ['-C', repository.sourcePath, 'for-each-ref', '--sort=refname', '--format=%(refname)%09%(objectname)%09%(symref)', 'refs'],
    'primary repository refs'
  ))
  const headTarget = runChecked(run, 'git', ['-C', repository.sourcePath, 'symbolic-ref', '--quiet', 'HEAD'], 'primary symbolic HEAD').trim()
  if (!expected.has(headTarget)) throw new Error(mismatchMessage)
  const worktreeHeads = observeAndValidatePrimaryWorktrees({ repository, inventory, run, mismatchMessage: worktreeMismatchMessage })

  const regular = new Map()
  const otherRefs = []
  let symbolicRemoteHead = null
  for (const entry of observed) {
    const inventoryOwned = entry.ref.startsWith('refs/heads/') || entry.ref.startsWith('refs/remotes/origin/')
    if (!inventoryOwned) {
      otherRefs.push(entry)
      continue
    }
    if (entry.symref) {
      if (entry.ref !== 'refs/remotes/origin/HEAD' || entry.symref !== 'refs/remotes/origin/main' || expected.get(entry.symref) !== entry.sha) throw new Error(mismatchMessage)
      symbolicRemoteHead = { ref: entry.ref, sha: entry.sha, target: entry.symref }
      continue
    }
    if (!expected.has(entry.ref) || expected.get(entry.ref) !== entry.sha || regular.has(entry.ref)) throw new Error(mismatchMessage)
    regular.set(entry.ref, entry.sha)
  }
  if (regular.size !== expected.size || [...expected].some(([ref, sha]) => regular.get(ref) !== sha)) throw new Error(mismatchMessage)
  return {
    ownedRefs: [...regular].map(([ref, sha]) => ({ ref, sha })),
    otherRefs,
    symbolicRemoteHead,
    head: { ref: 'HEAD', sha: expected.get(headTarget), target: headTarget },
    worktreeHeads
  }
}

function observeAndValidatePrimaryWorktrees({ repository, inventory, run, mismatchMessage }) {
  if (!Array.isArray(inventory.worktrees) || inventory.worktrees.length === 0) throw new Error(mismatchMessage)
  const observed = parseWorktreePorcelain(runChecked(
    run,
    'git',
    ['-C', repository.sourcePath, 'worktree', 'list', '--porcelain'],
    'primary repository worktrees'
  ))
  if (observed.length !== inventory.worktrees.length) throw new Error(mismatchMessage)

  const inventoryByPath = new Map()
  for (const entry of inventory.worktrees) {
    if (!path.isAbsolute(entry?.path ?? '') || !SHA1.test(entry?.head ?? '') ||
        (entry.branch !== null && !/^refs\/heads\/[^\s]+$/u.test(entry.branch ?? '')) || typeof entry.detached !== 'boolean') {
      throw new Error(mismatchMessage)
    }
    const key = normalizedPathKey(entry.path)
    if (inventoryByPath.has(key)) throw new Error(mismatchMessage)
    inventoryByPath.set(key, entry)
  }

  const primaryGitDirectory = path.resolve(runChecked(
    run,
    'git',
    ['-C', repository.sourcePath, 'rev-parse', '--absolute-git-dir'],
    'primary repository git directory'
  ).trim())
  const adminRoot = path.join(primaryGitDirectory, 'worktrees')
  const seenPaths = new Set()
  const seenAdminIds = new Set()
  const worktreeHeads = []
  let primaryFound = false

  for (const entry of observed) {
    const key = normalizedPathKey(entry.path)
    const approved = inventoryByPath.get(key)
    if (!approved || seenPaths.has(key) || entry.head !== approved.head || entry.branch !== approved.branch || entry.detached !== approved.detached) {
      throw new Error(mismatchMessage)
    }
    seenPaths.add(key)
    const gitDirectory = path.resolve(runChecked(
      run,
      'git',
      ['-C', entry.path, 'rev-parse', '--absolute-git-dir'],
      'primary worktree git directory'
    ).trim())
    if (samePath(entry.path, repository.sourcePath)) {
      if (primaryFound || !samePath(gitDirectory, primaryGitDirectory)) throw new Error(mismatchMessage)
      primaryFound = true
      continue
    }
    const relativeAdmin = path.relative(adminRoot, gitDirectory)
    if (!relativeAdmin || path.isAbsolute(relativeAdmin) || relativeAdmin === '..' || relativeAdmin.startsWith(`..${path.sep}`) ||
        relativeAdmin.includes(path.sep) || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(relativeAdmin) || seenAdminIds.has(relativeAdmin)) {
      throw new Error(mismatchMessage)
    }
    seenAdminIds.add(relativeAdmin)
    worktreeHeads.push({ ref: `worktrees/${relativeAdmin}/HEAD`, sha: entry.head, path: path.resolve(entry.path), adminId: relativeAdmin })
  }
  if (!primaryFound || seenPaths.size !== inventoryByPath.size) throw new Error(mismatchMessage)
  return worktreeHeads.sort((left, right) => left.ref.localeCompare(right.ref))
}

function observeAndValidateExternalRefs({ repository, run, mismatchMessage }) {
  const prefix = repository.safeDirectory ? ['-c', `safe.directory=${repository.sourcePath}`] : []
  const observed = parsePrimaryRefs(runChecked(
    run,
    'git',
    [...prefix, '-C', repository.sourcePath, 'for-each-ref', '--sort=refname', '--format=%(refname)%09%(objectname)%09%(symref)', 'refs'],
    'external repository refs'
  ))
  const headTarget = runOptional(run, 'git', [...prefix, '-C', repository.sourcePath, 'symbolic-ref', '--quiet', 'HEAD'], 'external symbolic HEAD')
  const headSha = runChecked(run, 'git', [...prefix, '-C', repository.sourcePath, 'rev-parse', 'HEAD'], 'external repository boundary head').trim()
  if (headSha !== repository.expectedHead) throw new Error(mismatchMessage)
  if (repository.expectedBranch === null) {
    if (headTarget !== null) throw new Error(mismatchMessage)
  } else {
    const expectedTarget = `refs/heads/${repository.expectedBranch}`
    const branch = observed.find((entry) => entry.ref === expectedTarget)
    if (headTarget !== expectedTarget || !branch || branch.symref || branch.sha !== repository.expectedHead) throw new Error(mismatchMessage)
  }
  return {
    refs: observed,
    head: { ref: 'HEAD', sha: headSha, target: headTarget }
  }
}

function expectedPrimaryRefs(inventory) {
  if (!Array.isArray(inventory.localBranches) || !Array.isArray(inventory.remoteHeads)) throw new Error('inventory primary ref lists are invalid')
  const expected = new Map()
  for (const entry of inventory.localBranches) addExpectedRef(expected, `refs/heads/${entry.branch}`, entry.sha)
  for (const entry of inventory.remoteHeads) addExpectedRef(expected, `refs/remotes/origin/${entry.branch}`, entry.sha)
  return expected
}

function addExpectedRef(expected, ref, sha) {
  if (!/^refs\/(?:heads|remotes\/origin)\/.+/u.test(ref) || !/^[0-9a-f]{40}$/u.test(sha ?? '') || expected.has(ref)) throw new Error('inventory primary ref lists are invalid')
  expected.set(ref, sha)
}

function parsePrimaryRefs(text) {
  const entries = []
  const seen = new Set()
  for (const line of nonEmptyLines(text)) {
    const fields = line.split('\t')
    if (fields.length < 2 || fields.length > 3 || !/^refs\/[^\s]+$/u.test(fields[0]) || !/^[0-9a-f]{40}$/u.test(fields[1]) ||
        (fields[2] && !/^refs\/[^\s]+$/u.test(fields[2])) || seen.has(fields[0])) {
      throw new Error('invalid primary repository ref observation')
    }
    seen.add(fields[0])
    entries.push({ ref: fields[0], sha: fields[1], symref: fields[2] ?? '' })
  }
  return entries
}

function validatePrimaryBundleHeads(lines, boundary) {
  const expected = new Map([...boundary.ownedRefs, ...boundary.otherRefs, ...boundary.worktreeHeads].map(({ ref, sha }) => [ref, sha]))
  if (boundary.symbolicRemoteHead) expected.set(boundary.symbolicRemoteHead.ref, boundary.symbolicRemoteHead.sha)
  expected.set('HEAD', boundary.head.sha)
  const observed = new Map()
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{40}) (.+)$/u)
    if (!match || observed.has(match[2]) || !expected.has(match[2]) || expected.get(match[2]) !== match[1]) {
      throw new Error('primary bundle refs do not match captured boundary')
    }
    observed.set(match[2], match[1])
  }
  if (observed.size !== expected.size || [...expected].some(([ref, sha]) => observed.get(ref) !== sha)) throw new Error('primary bundle refs do not match captured boundary')
}

function validateExternalBundleHeads(lines, boundary, label) {
  const expected = new Map(boundary.refs.map(({ ref, sha }) => [ref, sha]))
  expected.set('HEAD', boundary.head.sha)
  const observed = parseBundleHeads(lines, `external bundle refs do not match captured boundary: ${label}`)
  if (observed.size !== expected.size || [...expected].some(([ref, sha]) => observed.get(ref) !== sha)) {
    throw new Error(`external bundle refs do not match captured boundary: ${label}`)
  }
}

function parseBundleHeads(lines, mismatchMessage) {
  const observed = new Map()
  for (const line of lines) {
    const match = line.match(/^([0-9a-f]{40}) (.+)$/u)
    if (!match || observed.has(match[2])) throw new Error(mismatchMessage)
    observed.set(match[2], match[1])
  }
  return observed
}

async function createBundle(repository, bundlePath, dependencies) {
  if (dependencies.createBundle) return dependencies.createBundle({ repository, bundlePath })
  const prefix = repository.safeDirectory ? ['-c', `safe.directory=${repository.sourcePath}`] : []
  runChecked(dependencies.run, 'git', [...prefix, '-C', repository.sourcePath, 'bundle', 'create', bundlePath, '--all'], 'bundle create')
}

function verifyBundle(bundlePath, run) {
  runChecked(run, 'git', ['bundle', 'verify', bundlePath], 'bundle verify')
  return nonEmptyLines(runChecked(run, 'git', ['bundle', 'list-heads', bundlePath], 'bundle list-heads'))
}

function inventorySnapshots(inventory) {
  return {
    'remote-heads-before.txt': `${inventory.remoteHeads.map((entry) => `${entry.sha}\trefs/heads/${entry.branch}\t${entry.owner}`).join('\n')}\n`,
    'local-branches-before.txt': `${inventory.localBranches.map((entry) => `${entry.sha}\trefs/heads/${entry.branch}`).join('\n')}\n`,
    'worktrees-before.txt': `${inventory.worktrees.map((entry) => `${entry.head}\t${entry.branch ?? '(detached)'}\t${entry.path}`).join('\n')}\n`,
    'open-prs-before.json': `${JSON.stringify(inventory.openPullRequests, null, 2)}\n`
  }
}

function archiveSummary({ archiveRoot, generatedAt, inventory, inventoryText, manifest, manifestHash, bundleHeads, carrierEvidence }) {
  return {
    schemaVersion: ARCHIVE_SCHEMA,
    generatedAt,
    archiveRoot: path.resolve(archiveRoot),
    inventoryGeneratedAt: inventory.generatedAt,
    inventorySha256: createHash('sha256').update(inventoryText).digest('hex'),
    manifestSha256: manifestHash,
    verified: true,
    entryCount: manifest.entries.length,
    bundleCount: bundleHeads.length,
    bundleHeads,
    carrierPatchCount: carrierEvidence.length
  }
}

function validateCarrierEvidence(carriers, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 6) throw new Error('carrier patch freeze did not produce exactly six entries')
  const expected = new Map(carriers.map((carrier) => [carrier.id, carrier]))
  const paths = new Set()
  for (const entry of evidence) {
    const carrier = expected.get(entry?.id)
    const expectedPrerequisites = (carrier?.prerequisiteBranches ?? (carrier?.branches ?? [])
      .filter((branch) => branch.pullRequest === undefined)
      .map((branch) => branch.branch))
    if (!carrier || entry.fromSha !== carrier.fromSha || entry.toSha !== carrier.toSha ||
        JSON.stringify(entry.pullRequests) !== JSON.stringify(carrier.pullRequests ?? []) ||
        JSON.stringify(entry.prerequisiteBranches) !== JSON.stringify(expectedPrerequisites) ||
        !SHA1.test(entry.reconstructedTreeSha ?? '') || entry.reconstructedTreeSha !== entry.targetTreeSha) {
      throw new Error(`carrier patch evidence does not match target tree: ${entry?.id ?? 'unknown'}`)
    }
    if (entry.patch !== `${entry.id}.patch` || paths.has(entry.patch) || !SHA256.test(entry.sha256 ?? '') ||
        !Number.isSafeInteger(entry.byteSize) || entry.byteSize <= 0 ||
        !Number.isSafeInteger(entry.commitCount) || entry.commitCount <= 0 ||
        !Number.isSafeInteger(entry.pathCount) || entry.pathCount <= 0) throw new Error('invalid carrier patch evidence')
    paths.add(entry.patch)
  }
}

function validateInventoryMapBinding(inventory, mapBytes) {
  if (inventory?.schemaVersion !== INVENTORY_SCHEMA || !SHA256.test(inventory?.consolidationMapSha256 ?? '')) {
    throw new Error('inventory is missing a valid consolidation map SHA-256')
  }
  const actual = createHash('sha256').update(mapBytes).digest('hex')
  if (inventory.consolidationMapSha256 !== actual) throw new Error('inventory consolidation map SHA-256 mismatch')
}

function assertRequiredArchiveContract(manifest, inventory, map) {
  if (!Array.isArray(manifest?.entries)) throw new Error('archive manifest does not contain the required archive entry set')
  const expectedCarrierPaths = new Set([
    'carrier-patches/carrier-patches.json',
    ...map.carriers.map((carrier) => `carrier-patches/${carrierPatchName(carrier.id)}`)
  ])
  const observedCarrierPaths = manifest.entries.map((entry) => entry?.path).filter((entry) => typeof entry === 'string' && entry.startsWith('carrier-patches/'))
  if (observedCarrierPaths.length !== expectedCarrierPaths.size || new Set(observedCarrierPaths).size !== expectedCarrierPaths.size ||
      observedCarrierPaths.some((entry) => !expectedCarrierPaths.has(entry))) {
    throw new Error('archive manifest does not contain the fixed carrier patch set')
  }
  const artifactEntries = expectedArtifactEntries(inventory)
  const snapshots = inventorySnapshots(inventory)
  const expected = new Set([
    ...REQUIRED_BUNDLE_PATHS,
    ...artifactEntries.keys(),
    ...Object.keys(snapshots).map((name) => `inventory/${name}`),
    ...expectedCarrierPaths
  ])
  const observed = manifest.entries.map((entry) => entry?.path)
  if (expected.size !== 24 || observed.length !== expected.size || new Set(observed).size !== expected.size || observed.some((entry) => !expected.has(entry))) {
    throw new Error('archive manifest does not contain the required archive entry set')
  }
  const manifestByPath = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  for (const [archivePath, artifact] of artifactEntries) {
    const archived = manifestByPath.get(archivePath)
    if (archived?.byteSize !== artifact.byteSize || archived?.sha256 !== artifact.sha256) throw new Error('archive artifact does not match bound inventory')
  }
  for (const [name, contents] of Object.entries(snapshots)) {
    const bytes = Buffer.from(contents, 'utf8')
    const archived = manifestByPath.get(`inventory/${name}`)
    if (archived?.byteSize !== bytes.byteLength || archived?.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
      throw new Error('archive inventory snapshot does not match bound inventory')
    }
  }
}

function expectedArtifactEntries(inventory) {
  if (!Array.isArray(inventory?.artifacts)) throw new Error('inventory artifact list is invalid')
  const entries = new Map()
  const labels = []
  for (const artifact of inventory.artifacts) {
    if (!LABEL.test(artifact?.label ?? '') || !path.isAbsolute(artifact?.sourcePath ?? '') || !Number.isSafeInteger(artifact?.byteSize) ||
        artifact.byteSize < 0 || !SHA256.test(artifact?.sha256 ?? '') || entries.has(artifact.label)) throw new Error('inventory artifact list is invalid')
    labels.push(artifact.label)
    entries.set(`artifacts/${artifact.label}/${path.basename(artifact.sourcePath)}`, artifact)
  }
  if (JSON.stringify(labels.sort(compareText)) !== JSON.stringify(APPROVED_ARTIFACT_LABELS)) throw new Error('inventory artifact list is invalid')
  return entries
}

function validateVerifiedBundleHeads(bundleHeads, inventory) {
  const observedBundles = new Map(bundleHeads.map((entry) => [entry.path, parseBundleHeads(entry.heads, `archive bundle heads do not match bound inventory: ${entry.path}`)]))
  if (observedBundles.size !== REQUIRED_BUNDLE_PATHS.length || REQUIRED_BUNDLE_PATHS.some((bundlePath) => !observedBundles.has(bundlePath))) {
    throw new Error('archive bundle heads do not match bound inventory')
  }
  if (!Array.isArray(inventory?.localBranches) || !Array.isArray(inventory?.remoteHeads) || !Array.isArray(inventory?.externalRepositories)) {
    throw new Error('archive bundle heads do not match bound inventory')
  }
  const primary = observedBundles.get('bundles/repository-all-refs.bundle')
  const requiredPrimary = new Map()
  for (const [ref, sha] of [
    ...inventory.localBranches.map((entry) => [`refs/heads/${entry.branch}`, entry.sha]),
    ...inventory.remoteHeads.map((entry) => [`refs/remotes/origin/${entry.branch}`, entry.sha]),
    ['HEAD', inventory.topology?.mainSha],
    ['refs/remotes/origin/HEAD', inventory.topology?.mainSha]
  ]) {
    if (requiredPrimary.has(ref)) throw new Error('archive primary bundle heads do not match bound inventory')
    requiredPrimary.set(ref, sha)
  }
  assertRequiredHeads(primary, requiredPrimary, 'archive primary bundle heads do not match bound inventory')
  const externalByLabel = new Map(inventory.externalRepositories.map((entry) => [entry.label, entry]))
  if (externalByLabel.size !== 2 || externalByLabel.size !== inventory.externalRepositories.length) throw new Error('archive external bundle heads do not match bound inventory')
  for (const label of ['accepted-main', 'integration-xlsx-on-prereq']) {
    const external = externalByLabel.get(label)
    if (!external || !SHA1.test(external.head ?? '')) throw new Error('archive external bundle heads do not match bound inventory')
    const required = new Map([['HEAD', external.head]])
    if (external.branch !== null) required.set(`refs/heads/${external.branch}`, external.head)
    assertRequiredHeads(observedBundles.get(`bundles/${label}-all-refs.bundle`), required, 'archive external bundle heads do not match bound inventory')
  }
}

function assertRequiredHeads(observed, required, message) {
  for (const [ref, sha] of required) if (!SHA1.test(sha ?? '') || observed.get(ref) !== sha) throw new Error(message)
}

async function readExistingSummary(summaryPath, dependencies) {
  let metadata
  try {
    metadata = await (dependencies.lstat ?? lstat)(summaryPath)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error('existing archive summary is not a regular file')
  return parseJson(String(await (dependencies.readFile ?? readFile)(summaryPath, 'utf8')), 'existing archive summary')
}

function validatePriorSummary(summary, expected) {
  if (!isCanonicalUtcTimestamp(expected.generatedAt)) throw new Error('archive manifest generatedAt is not a canonical UTC timestamp')
  if (!isCanonicalUtcTimestamp(summary?.generatedAt) || Date.parse(summary.generatedAt) < Date.parse(expected.generatedAt)) {
    throw new Error('existing archive summary generatedAt is invalid or predates the archive manifest')
  }
  if (summary?.schemaVersion !== ARCHIVE_SCHEMA || !samePath(summary.archiveRoot, expected.archiveRoot) || summary.verified !== true ||
      summary.inventoryGeneratedAt !== expected.inventoryGeneratedAt ||
      summary.inventorySha256 !== expected.inventoryHash || summary.manifestSha256 !== expected.manifestHash ||
      summary.entryCount !== expected.entryCount || summary.bundleCount !== expected.bundleHeads.length) {
    throw new Error('existing archive summary identity, inventory, or manifest does not match')
  }
  if (JSON.stringify(summary.bundleHeads) !== JSON.stringify(expected.bundleHeads)) throw new Error('existing archive summary bundle heads do not match')
  if (summary.carrierPatchCount !== expected.carrierPatchCount) throw new Error('existing archive summary carrier patch count does not match verified evidence')
}

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string') return false
  const timestamp = new Date(value)
  return !Number.isNaN(timestamp.valueOf()) && timestamp.toISOString() === value
}

async function verifyArchivedCarrierEvidence({ archiveRoot, repoRoot, manifest, map, dependencies }) {
  const relativePath = 'carrier-patches/carrier-patches.json'
  await assertArchivePathComponents({ archiveRoot, relativePath }, { lstat: dependencies.lstat })
  const evidenceDocument = parseJson(String(await (dependencies.readFile ?? readFile)(path.join(archiveRoot, ...relativePath.split('/')), 'utf8')), 'carrier patch manifest')
  if (evidenceDocument.schemaVersion !== 'bob-builtin-analyze/carrier-patches/v1') throw new Error('unsupported carrier patch manifest schema')
  validateCarrierEvidence(map.carriers, evidenceDocument.carriers)
  const manifestEntries = new Map(manifest.entries.map((entry) => [entry.path, entry]))
  for (const entry of evidenceDocument.carriers) {
    const archived = manifestEntries.get(`carrier-patches/${entry.patch}`)
    if (!archived || archived.sha256 !== entry.sha256 || archived.byteSize !== entry.byteSize) throw new Error(`carrier patch hash mismatch: ${entry.patch}`)
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'bob-verify-carrier-index-'))
    try {
      const verifiedTree = await verifyPatchedTree({
        fromSha: entry.fromSha,
        toSha: entry.toSha,
        patchPath: path.join(archiveRoot, 'carrier-patches', entry.patch),
        run: dependencies.run ?? defaultRun,
        temporaryIndex: path.join(temporaryDirectory, 'index'),
        repoRoot
      })
      if (verifiedTree.reconstructedTreeSha !== entry.reconstructedTreeSha || verifiedTree.targetTreeSha !== entry.targetTreeSha) {
        throw new Error(`carrier patch tree evidence mismatch: ${entry.patch}`)
      }
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true })
    }
  }
  return evidenceDocument.carriers.length
}

async function writeSummaries(args, summary, dependencies) {
  const write = dependencies.atomicWriteText ?? atomicWriteText
  await write(args.summaryJson, `${JSON.stringify(summary, null, 2)}\n`)
  await write(args.summaryMarkdown, renderArchiveMarkdown(summary))
}

async function atomicWriteText(destination, contents) {
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${process.pid}.${nodeRandomUUID()}.tmp`)
  await writeFile(temporary, contents, { flag: 'wx' })
  await rename(temporary, destination)
}

async function mkdirOwned(directory, dependencies) {
  await (dependencies.mkdir ?? mkdir)(directory, { recursive: true })
}

async function writeExclusive(destination, contents, dependencies) {
  await (dependencies.writeFile ?? writeFile)(destination, contents, { flag: 'wx' })
}

function assertSummaryDestinations(args) {
  if (samePath(args.summaryJson, args.summaryMarkdown)) throw new Error('archive summary outputs must differ')
  for (const output of [args.summaryJson, args.summaryMarkdown]) {
    const relative = path.relative(args.archiveRoot, path.resolve(output))
    if (relative === '' || relative === '..' || !relative.startsWith(`..${path.sep}`)) throw new Error('archive summaries must stay outside the archive root')
  }
}

function parseArguments(argv) {
  const values = new Map()
  const bundleRepositories = []
  let verifyExisting = false
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--verify-existing') {
      if (verifyExisting) throw new Error('duplicate argument: --verify-existing')
      verifyExisting = true
      continue
    }
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${sanitize(token)}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${token}`)
    const key = token.slice(2)
    if (key === 'bundle-repository') bundleRepositories.push(parseLabeledPath(value))
    else if (['inventory', 'map', 'archive-root', 'repository-root', 'summary-json', 'summary-markdown'].includes(key)) {
      if (values.has(key)) throw new Error(`duplicate argument: --${key}`)
      values.set(key, value)
    } else throw new Error(`unexpected argument: ${token}`)
    index += 1
  }
  for (const key of ['inventory', 'map', 'archive-root', 'repository-root', 'summary-json', 'summary-markdown']) {
    if (!values.has(key)) throw new Error(`--${key} is required`)
  }
  for (const key of ['inventory', 'map', 'archive-root', 'repository-root', 'summary-json', 'summary-markdown']) {
    if (!path.isAbsolute(values.get(key))) throw new Error(`--${key} must be absolute`)
  }
  if (new Set(bundleRepositories.map((entry) => entry.label)).size !== bundleRepositories.length) throw new Error('duplicate bundle repository label')
  return {
    inventory: path.resolve(values.get('inventory')),
    map: path.resolve(values.get('map')),
    archiveRoot: path.resolve(values.get('archive-root')),
    repositoryRoot: path.resolve(values.get('repository-root')),
    summaryJson: path.resolve(values.get('summary-json')),
    summaryMarkdown: path.resolve(values.get('summary-markdown')),
    bundleRepositories,
    verifyExisting
  }
}

function parseLabeledPath(value) {
  const separator = value.indexOf('=')
  const label = value.slice(0, separator)
  const sourcePath = value.slice(separator + 1)
  if (separator <= 0 || !LABEL.test(label) || !path.isAbsolute(sourcePath)) throw new Error('invalid bundle repository argument')
  return { label, path: path.resolve(sourcePath) }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`invalid ${label} JSON`)
  }
}

function runChecked(run, command, args, operation) {
  const result = normalizeRunResult(run(command, args))
  if (result.status !== 0) throw new Error(`${operation} failed: ${sanitize(result.stderr || result.stdout)}`)
  return result.stdout
}

function runOptional(run, command, args, operation) {
  const result = normalizeRunResult(run(command, args))
  if (result.status === 0) return result.stdout.trim()
  if (result.status === 1) return null
  throw new Error(`${operation} failed: ${sanitize(result.stderr || result.stdout)}`)
}

function normalizeRunResult(result) {
  if (typeof result === 'string') return { status: 0, stdout: result, stderr: '' }
  if (!result || !Number.isInteger(result.status)) throw new Error('invalid command runner result')
  return { status: result.status, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
}

function defaultRun(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    encoding: options.encoding === 'buffer' ? 'buffer' : 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function samePath(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false
  const normalizedLeft = path.resolve(left)
  const normalizedRight = path.resolve(right)
  return process.platform === 'win32' ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase() : normalizedLeft === normalizedRight
}

function normalizedPathKey(value) {
  const resolved = path.resolve(value)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

async function existsByLstat(filePath, inspect = lstat) {
  try {
    await inspect(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function nonEmptyLines(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
}

function sanitize(value) {
  return String(value)
    .replace(/([a-z][a-z0-9+.-]*):\/\/[^/\s:@]+:[^@\s/]+@/giu, '$1://***@')
    .replace(/(^|[\s'"(])[A-Za-z]:[\\/][^\s'"\)]*/gu, '$1[path]')
    .replace(/(^|[\s'"(])\\\\(?:\?\\)?[^\s'"\)]*/gu, '$1[path]')
    .trim()
}

function escapeMarkdown(value) {
  return String(value).replace(/[|`]/gu, '\\$&').replace(/\r?\n/gu, ' ')
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  createMainConsolidationArchive().then(({ summary }) => {
    process.stdout.write(`${JSON.stringify({ archiveRoot: summary.archiveRoot, verified: summary.verified, manifestSha256: summary.manifestSha256 })}\n`)
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? sanitize(error.message) : 'archive operation failed'}\n`)
    process.exitCode = 1
  })
}
