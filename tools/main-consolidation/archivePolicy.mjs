import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { lstatSync } from 'node:fs'
import { lstat, open } from 'node:fs/promises'
import path from 'node:path'

const MANIFEST_SCHEMA = 'bob-builtin-analyze/main-consolidation-archive-manifest/v1'
const SUMMARY_SCHEMA = 'bob-builtin-analyze/main-consolidation-archive/v1'
const SHA256 = /^[0-9a-f]{64}$/u

export function validateArchiveRequest({ repoRoot, archiveRoot, expectedLeaf, inventory }) {
  const repository = path.resolve(repoRoot)
  const target = path.resolve(archiveRoot)
  const relative = path.relative(repository, target)
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    throw new Error('archive root must stay outside the repository')
  }
  if (path.basename(target) !== expectedLeaf) throw new Error('archive root leaf does not match the approved name')
  if (inventory?.readyForArchive !== true) throw new Error('inventory is not ready for archive')
  return true
}

export function assertArchiveDestinationAvailable({ archiveRoot, lstat: inspect = lstatSync }) {
  try {
    inspect(archiveRoot)
  } catch (error) {
    if (error?.code === 'ENOENT') return true
    throw error
  }
  throw new Error(`archive root already exists: ${archiveRoot}`)
}

export async function hashFile(filePath) {
  const { contents } = await readStableRegularFile(filePath)
  return hashBytes(contents)
}

export function buildArchiveManifest(entries, { generatedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(entries)) throw new Error('archive manifest entries must be an array')
  const normalized = entries.map((entry) => normalizeManifestEntry(entry))
  normalized.sort((left, right) => compareText(left.path, right.path))
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].path === normalized[index].path) throw new Error(`duplicate archive manifest path: ${normalized[index].path}`)
  }
  return { schemaVersion: MANIFEST_SCHEMA, generatedAt, entries: normalized }
}

export async function copyVerifiedFile({ sourcePath, destinationPath, expected }, dependencies = {}) {
  const source = path.resolve(sourcePath)
  const destination = path.resolve(destinationPath)
  const { contents, before } = await readStableRegularFile(source, {
    afterRead: async () => dependencies.afterSourceRead?.({ sourcePath: source, destinationPath: destination })
  })
  const sourceHash = hashBytes(contents)
  if (expected) assertExpectedHash(sourceHash, expected, 'source')

  let destinationHandle
  try {
    destinationHandle = await (dependencies.open ?? open)(destination, 'wx')
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`archive destination already exists: ${destination}`)
    throw error
  }
  try {
    await destinationHandle.writeFile(contents)
    await destinationHandle.sync()
  } finally {
    await destinationHandle.close()
  }
  const destinationHash = await hashFile(destination)
  assertExpectedHash(destinationHash, sourceHash, 'destination')
  return { ...sourceHash, sourceStat: before }
}

export async function verifyExistingArchive({ archiveRoot, manifest }, dependencies = {}) {
  const root = path.resolve(archiveRoot)
  const rootStats = await (dependencies.lstat ?? lstat)(root)
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) throw new Error('archive root is not a regular directory')
  if (await existsByLstat(path.join(root, '.archive-incomplete'), dependencies.lstat ?? lstat)) throw new Error('archive is incomplete')
  if (manifest?.schemaVersion !== MANIFEST_SCHEMA || !Array.isArray(manifest.entries)) throw new Error('unsupported archive manifest schema')
  const canonical = buildArchiveManifest(manifest.entries, { generatedAt: manifest.generatedAt })
  if (JSON.stringify(canonical) !== JSON.stringify(manifest)) throw new Error('archive manifest is not canonical')

  const verifiedEntries = []
  const bundleHeads = []
  for (const entry of canonical.entries) {
    const archivePath = resolveManifestPath(root, entry.path)
    await assertArchivePathComponents({ archiveRoot: root, relativePath: entry.path }, dependencies)
    const actual = await hashFile(archivePath)
    assertExpectedHash(actual, entry, `archive entry ${entry.path}`)
    verifiedEntries.push({ ...entry })
    if (entry.path.startsWith('bundles/') && entry.path.endsWith('.bundle')) {
      runChecked(dependencies.run ?? defaultRun, 'git', ['bundle', 'verify', archivePath], 'bundle verify')
      const heads = runChecked(dependencies.run ?? defaultRun, 'git', ['bundle', 'list-heads', archivePath], 'bundle list-heads')
      bundleHeads.push({ path: entry.path, heads: nonEmptyLines(heads) })
    }
  }
  return {
    schemaVersion: SUMMARY_SCHEMA,
    generatedAt: dependencies.now ? dependencies.now().toISOString() : new Date().toISOString(),
    archiveRoot: root,
    verified: true,
    entryCount: verifiedEntries.length,
    bundleCount: bundleHeads.length,
    bundleHeads
  }
}

export async function assertArchivePathComponents({ archiveRoot, relativePath }, dependencies = {}) {
  const root = path.resolve(archiveRoot)
  const normalized = normalizeArchivePath(relativePath)
  const inspect = dependencies.lstat ?? lstat
  const segments = normalized.split('/')
  let current = root
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index])
    const metadata = await inspect(current)
    if (metadata.isSymbolicLink()) throw new Error(`archive path contains a symbolic link or reparse point: ${normalized}`)
    if (index < segments.length - 1 && !metadata.isDirectory()) throw new Error(`archive path component is not a directory: ${normalized}`)
    if (index === segments.length - 1 && !metadata.isFile()) throw new Error(`archive path is not a regular file: ${normalized}`)
  }
  return true
}

async function readStableRegularFile(filePath, { afterRead } = {}) {
  const fileStats = await lstat(filePath, { bigint: true })
  if (fileStats.isSymbolicLink() || !fileStats.isFile()) throw new Error(`archive source is not a regular file: ${filePath}`)
  const handle = await open(filePath, 'r')
  try {
    const before = await handle.stat({ bigint: true })
    assertSameIdentity(fileStats, before, filePath)
    const contents = await handle.readFile()
    await afterRead?.()
    const after = await handle.stat({ bigint: true })
    const current = await lstat(filePath, { bigint: true })
    if (current.isSymbolicLink() || !current.isFile()) throw new Error(`archive source changed during archive copy: ${filePath}`)
    assertSameIdentity(before, after, filePath)
    assertSameIdentity(after, current, filePath)
    if (BigInt(contents.byteLength) !== before.size) throw new Error(`archive source changed during archive copy: ${filePath}`)
    return { contents, before }
  } finally {
    await handle.close()
  }
}

function assertSameIdentity(left, right, filePath) {
  const keys = ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs']
  if (keys.some((key) => left[key] !== right[key])) throw new Error(`archive source changed during archive copy: ${filePath}`)
}

function hashBytes(contents) {
  return {
    byteSize: contents.byteLength,
    sha256: createHash('sha256').update(contents).digest('hex')
  }
}

function assertExpectedHash(actual, expected, label) {
  if (actual.byteSize !== Number(expected.byteSize) || actual.sha256 !== expected.sha256) throw new Error(`${label} hash mismatch`)
}

function normalizeManifestEntry(entry) {
  const archivePath = normalizeArchivePath(entry?.path)
  if (!Number.isSafeInteger(entry?.byteSize) || entry.byteSize < 0 || !SHA256.test(entry?.sha256 ?? '')) throw new Error(`invalid archive manifest entry: ${archivePath}`)
  return { path: archivePath, byteSize: entry.byteSize, sha256: entry.sha256 }
}

function normalizeArchivePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.includes('\0') || path.posix.isAbsolute(value)) {
    throw new Error('unsafe manifest path')
  }
  const normalized = path.posix.normalize(value)
  if (normalized !== value || normalized === '.' || normalized === '..' || normalized.startsWith('../')) throw new Error('unsafe manifest path')
  return normalized
}

function resolveManifestPath(root, archivePath) {
  const normalized = normalizeArchivePath(archivePath)
  const resolved = path.resolve(root, ...normalized.split('/'))
  const relative = path.relative(root, resolved)
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('unsafe manifest path')
  return resolved
}

async function existsByLstat(filePath, inspect) {
  try {
    await inspect(filePath)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

function runChecked(run, command, args, operation) {
  const result = normalizeRunResult(run(command, args))
  if (result.status !== 0) throw new Error(`${operation} failed: ${sanitize(result.stderr || result.stdout)}`)
  return result.stdout
}

function normalizeRunResult(result) {
  if (typeof result === 'string') return { status: 0, stdout: result, stderr: '' }
  if (!result || !Number.isInteger(result.status)) throw new Error('invalid command runner result')
  return { status: result.status, stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
}

function defaultRun(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return { status: result.status ?? 1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
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

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}
