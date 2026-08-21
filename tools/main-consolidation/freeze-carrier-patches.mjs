import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { link, mkdir, mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { carrierPatchName, validateCarrier } from './carrierPatchPolicy.mjs'

const PATCH_MANIFEST_SCHEMA = 'bob-builtin-analyze/carrier-patches/v1'
const SHA = /^[0-9a-f]{40}$/u

export async function verifyPatchedTree({ fromSha, toSha, patchPath, run = defaultRun, temporaryIndex, repoRoot = process.cwd() }) {
  if (!SHA.test(fromSha ?? '') || !SHA.test(toSha ?? '') || fromSha === toSha) throw new Error('invalid carrier patch range')
  if (!path.isAbsolute(patchPath ?? '') || !path.isAbsolute(temporaryIndex ?? '')) throw new Error('patch and temporary index paths must be absolute')
  assertOutsideRepository(repoRoot, temporaryIndex, 'temporary index')

  const options = (extra = {}) => ({ cwd: repoRoot, shell: false, ...extra })
  const indexOptions = options({ env: { ...process.env, GIT_INDEX_FILE: temporaryIndex } })
  try {
    runChecked(run, 'git', ['read-tree', fromSha], 'read carrier base tree', indexOptions)
    runChecked(run, 'git', ['apply', '--cached', patchPath], 'apply carrier patch', indexOptions)
    const reconstructedTreeSha = runChecked(run, 'git', ['write-tree'], 'write reconstructed carrier tree', indexOptions).trim()
    const targetTreeSha = runChecked(run, 'git', ['rev-parse', `${toSha}^{tree}`], 'resolve carrier target tree', options()).trim()
    if (!SHA.test(reconstructedTreeSha) || !SHA.test(targetTreeSha) || reconstructedTreeSha !== targetTreeSha) {
      throw new Error('reconstructed tree does not match carrier target tree')
    }
    return { reconstructedTreeSha, targetTreeSha }
  } finally {
    await rm(temporaryIndex, { force: true })
  }
}

export async function freezeCarrierPatches({ map, repoRoot, carrierDirectory, run = defaultRun }) {
  if (!Array.isArray(map?.carriers) || map.carriers.length === 0) throw new Error('carrier map is empty')
  if (!path.isAbsolute(repoRoot ?? '') || !path.isAbsolute(carrierDirectory ?? '')) throw new Error('repository and carrier directory paths must be absolute')
  assertOutsideRepository(repoRoot, carrierDirectory, 'carrier directory')
  await mkdir(carrierDirectory, { recursive: true })

  const options = (extra = {}) => ({ cwd: repoRoot, shell: false, ...extra })
  const statusArguments = ['status', '--porcelain=v1', '-z', '--untracked-files=all']
  const statusBefore = runBytes(run, 'git', statusArguments, 'repository status before carrier freeze', options({ encoding: 'buffer' }))
  const evidence = []
  try {
    for (const carrier of map.carriers) {
      validateCarrier(carrier)
      runChecked(run, 'git', ['cat-file', '-e', `${carrier.fromSha}^{commit}`], 'resolve carrier base commit', options())
      runChecked(run, 'git', ['cat-file', '-e', `${carrier.toSha}^{commit}`], 'resolve carrier target commit', options())
      runChecked(run, 'git', ['merge-base', '--is-ancestor', carrier.fromSha, carrier.toSha], 'validate carrier ancestry', options())

      const patchName = carrierPatchName(carrier.id)
      const targetPatch = path.join(carrierDirectory, patchName)
      const temporaryPatch = path.join(carrierDirectory, `.${patchName}.${process.pid}.${randomUUID()}.tmp`)
      await reserveFile(temporaryPatch)
      let temporaryDirectory
      try {
        runChecked(run, 'git', ['diff', '--binary', '--full-index', `--output=${temporaryPatch}`, carrier.fromSha, carrier.toSha], 'create carrier patch', options())
        temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), 'bob-carrier-index-'))
        const temporaryIndex = path.join(temporaryDirectory, 'index')
        const treeEvidence = await verifyPatchedTree({
          fromSha: carrier.fromSha,
          toSha: carrier.toSha,
          patchPath: temporaryPatch,
          run,
          temporaryIndex,
          repoRoot
        })
        const patch = await readFile(temporaryPatch)
        const commitCount = parseCount(runChecked(run, 'git', ['rev-list', '--count', `${carrier.fromSha}..${carrier.toSha}`], 'count carrier commits', options()), 'commit')
        const paths = nonEmptyLines(runChecked(run, 'git', ['diff', '--name-only', carrier.fromSha, carrier.toSha], 'count carrier paths', options()))
        const targetTreeSha = runChecked(run, 'git', ['rev-parse', `${carrier.toSha}^{tree}`], 'resolve carrier target tree', options()).trim()
        if (targetTreeSha !== treeEvidence.targetTreeSha) throw new Error('carrier target tree changed during patch freeze')

        const entry = {
          id: carrier.id,
          patch: patchName,
          fromSha: carrier.fromSha,
          toSha: carrier.toSha,
          pullRequests: [...(carrier.pullRequests ?? [])],
          prerequisiteBranches: carrier.prerequisiteBranches ?? (carrier.branches ?? [])
            .filter((branch) => branch.pullRequest === undefined)
            .map((branch) => branch.branch),
          sha256: createHash('sha256').update(patch).digest('hex'),
          byteSize: patch.byteLength,
          commitCount,
          pathCount: paths.length,
          reconstructedTreeSha: treeEvidence.reconstructedTreeSha,
          targetTreeSha: treeEvidence.targetTreeSha
        }
        await publishExclusive(temporaryPatch, targetPatch)
        evidence.push(entry)
      } finally {
        await rm(temporaryPatch, { force: true })
        if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
      }
    }

    const manifestPath = path.join(carrierDirectory, 'carrier-patches.json')
    await writeFile(manifestPath, `${JSON.stringify({ schemaVersion: PATCH_MANIFEST_SCHEMA, carriers: evidence }, null, 2)}\n`, { flag: 'wx' })
    return evidence
  } finally {
    const statusAfter = runBytes(run, 'git', statusArguments, 'repository status after carrier freeze', options({ encoding: 'buffer' }))
    if (!statusBefore.equals(statusAfter)) throw new Error('repository status changed during carrier patch freeze')
  }
}

async function reserveFile(filePath) {
  let handle
  try {
    handle = await open(filePath, 'wx')
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`temporary carrier patch already exists: ${path.basename(filePath)}`)
    throw error
  } finally {
    await handle?.close()
  }
}

async function publishExclusive(source, destination) {
  try {
    await link(source, destination)
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`carrier patch already exists: ${path.basename(destination)}`)
    throw error
  }
  await rm(source)
}

function assertOutsideRepository(repoRoot, candidate, label) {
  const repository = path.resolve(repoRoot)
  const target = path.resolve(candidate)
  const relative = path.relative(repository, target)
  if (relative === '' || relative === '..' || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))) {
    throw new Error(`${label} must stay outside the repository working tree`)
  }
}

function runChecked(run, command, args, operation, options) {
  const result = normalizeRunResult(run(command, args, options))
  if (result.status !== 0) throw new Error(`${operation} failed: ${sanitize(result.stderr.length ? result.stderr : result.stdout)}`)
  return result.stdout.toString('utf8')
}

function runBytes(run, command, args, operation, options) {
  const result = normalizeRunResult(run(command, args, options))
  if (result.status !== 0) throw new Error(`${operation} failed: ${sanitize(result.stderr.length ? result.stderr : result.stdout)}`)
  return result.stdout
}

function normalizeRunResult(result) {
  if (typeof result === 'string' || Buffer.isBuffer(result)) return { status: 0, stdout: toBuffer(result), stderr: Buffer.alloc(0) }
  if (!result || !Number.isInteger(result.status)) throw new Error('invalid command runner result')
  return { status: result.status, stdout: toBuffer(result.stdout), stderr: toBuffer(result.stderr) }
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value
  return Buffer.from(String(value ?? ''), 'utf8')
}

function parseCount(value, label) {
  const count = Number(value.trim())
  if (!Number.isSafeInteger(count) || count < 0) throw new Error(`invalid carrier ${label} count`)
  return count
}

function nonEmptyLines(value) {
  return String(value).split(/\r?\n/u).filter((line) => line.length > 0)
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

function sanitize(value) {
  return String(value)
    .replace(/([a-z][a-z0-9+.-]*):\/\/[^/\s:@]+:[^@\s/]+@/giu, '$1://***@')
    .replace(/(^|[\s'"(])[A-Za-z]:[\\/][^\s'"\)]*/gu, '$1[path]')
    .replace(/(^|[\s'"(])\\\\(?:\?\\)?[^\s'"\)]*/gu, '$1[path]')
    .trim()
}
