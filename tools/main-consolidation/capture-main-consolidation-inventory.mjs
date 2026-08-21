#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { lstat, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicWriteText } from '../branch-retirement/audit-branch-retirement.mjs'
import { assessTopology, validateConsolidationMap } from './consolidationPolicy.mjs'

const INVENTORY_SCHEMA = 'bob-builtin-analyze/main-consolidation-inventory/v1'
const SHA = /^[0-9a-f]{40}$/u
const SHA256 = /^[0-9a-f]{64}$/u
const ALLOWED_PRIMARY_STATUS = '?? .integration-xlsx-on-prereq/'
const LABEL = /^[a-z0-9][a-z0-9-]*$/u

export function parseRemoteRefs(text) {
  const refs = new Map()
  for (const line of nonEmptyLines(text)) {
    const match = line.match(/^([0-9a-f]{40})\trefs\/heads\/([^\s]+)$/u)
    if (!match) throw new Error(`invalid remote head: ${sanitize(line)}`)
    if (refs.has(match[2])) throw new Error(`duplicate remote head: ${match[2]}`)
    refs.set(match[2], match[1])
  }
  return refs
}

export function parseWorktreePorcelain(text) {
  const records = []
  let record
  const flush = () => {
    if (!record) return
    if (typeof record.path !== 'string' || !SHA.test(record.head ?? '') || (record.branch !== null && !/^refs\/heads\/[^\s]+$/u.test(record.branch ?? ''))) {
      throw new Error('invalid worktree record')
    }
    records.push({ path: record.path, head: record.head, branch: record.branch, detached: record.detached, status: [] })
    record = undefined
  }
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line) {
      flush()
      continue
    }
    if (line.startsWith('worktree ')) {
      flush()
      record = { path: line.slice('worktree '.length), branch: null, detached: false }
      continue
    }
    if (!record) throw new Error('invalid worktree record')
    if (line.startsWith('HEAD ')) {
      record.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      record.branch = line.slice('branch '.length)
    } else if (line === 'detached') {
      record.detached = true
    } else if (line === 'bare' || line === 'locked' || line === 'prunable' || line.startsWith('locked ') || line.startsWith('prunable ')) {
      continue
    } else {
      throw new Error('invalid worktree record')
    }
  }
  flush()
  if (records.length === 0) throw new Error('invalid worktree record')
  return records
}

export function inventoryFromObservations({
  consolidationMapSha256,
  topology,
  primaryStatus,
  currentWorktreeStatus = [],
  worktrees,
  externalRepositories,
  artifacts,
  remoteHeads = [],
  openPullRequests = [],
  localBranches = [],
  repository = undefined,
  generatedAt = new Date().toISOString()
}) {
  if (topology?.readyForArchive !== true) throw new Error('topology is not ready for archive')
  if (!SHA256.test(consolidationMapSha256 ?? '')) throw new Error('invalid consolidation map SHA-256')
  const normalizedPrimaryStatus = normalizeStatus(primaryStatus)
  const normalizedCurrentStatus = normalizeStatus(currentWorktreeStatus)
  const normalizedWorktrees = normalizeWorktrees(worktrees)
  const normalizedExternalRepositories = normalizeExternalRepositories(externalRepositories)
  const normalizedArtifacts = normalizeArtifacts(artifacts)
  const blockers = []
  if (!isAllowedPrimaryStatus(normalizedPrimaryStatus)) blockers.push('primary root is dirty')
  if (normalizedCurrentStatus.length !== 0) blockers.push('invoking worktree is dirty')
  for (const worktree of normalizedWorktrees) if (worktree.status.length > 0) blockers.push(`registered worktree is dirty: ${worktree.branch ?? 'detached'}`)
  for (const external of normalizedExternalRepositories) if (external.status.length > 0) blockers.push(`external repository is dirty: ${external.label}`)
  return {
    schemaVersion: INVENTORY_SCHEMA,
    generatedAt,
    repository,
    consolidationMapSha256,
    readyForArchive: blockers.length === 0,
    topology: normalizeTopology(topology),
    remoteHeads: normalizeRemoteHeads(remoteHeads),
    openPullRequests: normalizeOpenPullRequests(openPullRequests),
    localBranches: normalizeLocalBranches(localBranches),
    worktrees: normalizedWorktrees,
    externalRepositories: normalizedExternalRepositories,
    artifacts: normalizedArtifacts,
    blockers: blockers.sort(compareText)
  }
}

export function renderInventoryMarkdown(evidence) {
  const lines = [
    '# Main Consolidation Inventory',
    '',
    `- Repository: \`${escapeMarkdown(evidence.repository)}\``,
    `- Generated: \`${escapeMarkdown(evidence.generatedAt)}\``,
    `- Audited main: \`${escapeMarkdown(evidence.topology.mainSha)}\``,
    `- Consolidation map SHA-256: \`${escapeMarkdown(evidence.consolidationMapSha256)}\``,
    `- Ready for archive: **${evidence.readyForArchive ? 'yes' : 'no'}**`,
    `- Legacy heads: ${evidence.topology.legacyHeadCount}`,
    `- Open pull requests: ${evidence.topology.openPullRequestCount}`,
    '',
    '## Registered worktrees',
    '',
    '| Branch | HEAD | State |',
    '| --- | --- | --- |'
  ]
  for (const worktree of evidence.worktrees) {
    lines.push(`| \`${escapeMarkdown(worktree.branch ?? 'detached')}\` | \`${escapeMarkdown(worktree.head)}\` | ${worktree.status.length === 0 ? 'clean' : 'dirty'} |`)
  }
  lines.push('', '## External repositories', '', '| Label | State |', '| --- | --- |')
  for (const repository of evidence.externalRepositories) {
    lines.push(`| \`${escapeMarkdown(repository.label)}\` | ${repository.status.length === 0 ? 'clean' : 'dirty'} |`)
  }
  lines.push('', '## Artifacts', '', '| Label | File | Bytes | SHA-256 |', '| --- | --- | ---: | --- |')
  for (const artifact of evidence.artifacts) {
    lines.push(`| \`${escapeMarkdown(artifact.label)}\` | \`${escapeMarkdown(path.basename(artifact.sourcePath))}\` | ${artifact.byteSize} | \`${escapeMarkdown(artifact.sha256)}\` |`)
  }
  if (evidence.blockers.length > 0) lines.push('', '## Blockers', '', ...evidence.blockers.map((blocker) => `- ${escapeMarkdown(blocker)}`))
  lines.push('')
  return `${lines.join('\n')}\n`
}

export async function captureMainConsolidationInventory(argv = process.argv.slice(2), dependencies = {}) {
  const args = parseArgs(argv)
  const run = dependencies.run ?? defaultRun
  const read = dependencies.readFile ?? readFile
  const stat = dependencies.lstat ?? lstat
  const write = dependencies.atomicWriteText ?? atomicWriteText
  const generatedAt = dependencies.now ? dependencies.now().toISOString() : new Date().toISOString()
  const rawMap = await read(args.map)
  const mapBytes = Buffer.isBuffer(rawMap) ? rawMap : Buffer.from(String(rawMap), 'utf8')
  const map = JSON.parse(mapBytes.toString('utf8'))
  validateConsolidationMap(map)
  const consolidationMapSha256 = createHash('sha256').update(mapBytes).digest('hex')
  if (map.repository !== args.repository) throw new Error('map repository does not match --repository')

  runChecked(run, 'git', ['fetch', '--no-tags', args.remote, '+refs/heads/*:refs/remotes/origin/*'])
  const mainSha = runChecked(run, 'git', ['rev-parse', `refs/remotes/${args.remote}/main`]).trim()
  const baselineIsAncestor = runStatus(run, 'git', ['merge-base', '--is-ancestor', map.baselineMain, `refs/remotes/${args.remote}/main`]) === 0
  const remoteRefs = parseRemoteRefs(runChecked(run, 'git', ['ls-remote', '--heads', args.remote]))
  const localRefs = parseLocalRefs(runChecked(run, 'git', ['for-each-ref', '--sort=refname', '--format=%(refname:short)%09%(objectname)', 'refs/heads']))
  const worktrees = parseWorktreePorcelain(runChecked(run, 'git', ['worktree', 'list', '--porcelain']))
  const invokingWorktreeStatus = statusLines(runChecked(run, 'git', ['status', '--porcelain=v1']))
  const defaultBranch = runChecked(run, 'gh', ['api', `repos/${args.repository}`, '--jq', '.default_branch']).trim()
  const openPullRequests = parseOpenPullRequests(runChecked(run, 'gh', ['pr', 'list', '--repo', args.repository, '--state', 'open', '--limit', '100', '--json', 'number,headRefName,headRefOid,baseRefName,url,title']))
  if (defaultBranch !== 'main') throw new Error(`unexpected default branch: ${sanitize(defaultBranch)}`)

  const primary = worktrees[0]
  for (const worktree of worktrees) {
    const status = statusLines(runChecked(run, 'git', ['-C', worktree.path, 'status', '--porcelain=v1']))
    if (worktree === primary) primary.status = status
    else worktree.status = status
  }
  const externalRepositories = []
  for (const external of args.externalRepositories) {
    const externalStats = await stat(external.path)
    if (externalStats.isSymbolicLink() || !externalStats.isDirectory()) throw new Error(`external repository is not a directory: ${external.label}`)
    const status = statusLines(runChecked(run, 'git', ['-c', `safe.directory=${external.path}`, '-C', external.path, 'status', '--porcelain=v1']))
    const head = runChecked(run, 'git', ['-c', `safe.directory=${external.path}`, '-C', external.path, 'rev-parse', 'HEAD']).trim()
    const branch = runOptional(run, 'git', ['-c', `safe.directory=${external.path}`, '-C', external.path, 'symbolic-ref', '--quiet', '--short', 'HEAD'])
    externalRepositories.push({ label: external.label, path: external.path, head, branch, status })
  }
  const artifacts = []
  for (const artifact of args.artifacts) artifacts.push(await inspectArtifact(artifact, { read, stat }))

  const processRefs = new Map()
  for (const branch of map.processBranches) {
    if (remoteRefs.has(branch)) processRefs.set(branch, remoteRefs.get(branch))
  }
  const topology = assessTopology({ map, mainSha, baselineIsAncestor, remoteRefs, openPullRequests, processRefs })
  const evidence = inventoryFromObservations({
    consolidationMapSha256,
    topology,
    primaryStatus: primary.status,
    currentWorktreeStatus: invokingWorktreeStatus,
    worktrees: worktrees.map((worktree) => worktree === primary ? { ...worktree, status: [] } : worktree),
    externalRepositories,
    artifacts,
    remoteHeads: buildRemoteHeads(map, remoteRefs),
    openPullRequests,
    localBranches: [...localRefs].map(([branch, sha]) => ({ branch, sha })),
    repository: map.repository,
    generatedAt
  })
  await write(args.json, `${JSON.stringify(evidence, null, 2)}\n`)
  await write(args.markdown, renderInventoryMarkdown(evidence))
  return { exitCode: evidence.readyForArchive ? 0 : 2, evidence }
}

function parseArgs(argv) {
  const values = new Map()
  const externalRepositories = []
  const artifacts = []
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${sanitize(token)}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for ${token}`)
    const key = token.slice(2)
    if (key === 'external-repository') externalRepositories.push(parseLabeledPath(value, 'external repository'))
    else if (key === 'artifact') artifacts.push(parseLabeledPath(value, 'artifact'))
    else if (['repository', 'remote', 'map', 'json', 'markdown'].includes(key)) {
      if (values.has(key)) throw new Error(`duplicate argument: --${key}`)
      values.set(key, value)
    } else throw new Error(`unexpected argument: ${token}`)
    index += 1
  }
  for (const key of ['repository', 'remote', 'map', 'json', 'markdown']) if (!values.has(key)) throw new Error(`--${key} is required`)
  assertUniqueLabels(externalRepositories, 'external repository')
  assertUniqueLabels(artifacts, 'artifact')
  if (values.get('json') === values.get('markdown')) throw new Error('JSON and Markdown outputs must differ')
  return {
    repository: values.get('repository'),
    remote: values.get('remote'),
    map: values.get('map'),
    json: values.get('json'),
    markdown: values.get('markdown'),
    externalRepositories,
    artifacts
  }
}

function parseLabeledPath(value, kind) {
  const separator = value.indexOf('=')
  const label = value.slice(0, separator)
  const sourcePath = value.slice(separator + 1)
  if (separator <= 0 || !LABEL.test(label) || !path.isAbsolute(sourcePath)) throw new Error(`invalid ${kind} argument`)
  return { label, path: sourcePath }
}

function assertUniqueLabels(entries, kind) {
  if (new Set(entries.map((entry) => entry.label)).size !== entries.length) throw new Error(`duplicate ${kind} label`)
}

function parseLocalRefs(text) {
  const refs = new Map()
  for (const line of nonEmptyLines(text)) {
    const match = line.match(/^([^\s]+)\t([0-9a-f]{40})$/u)
    if (!match || refs.has(match[1])) throw new Error('invalid local ref observation')
    refs.set(match[1], match[2])
  }
  return refs
}

function parseOpenPullRequests(text) {
  let pullRequests
  try {
    pullRequests = JSON.parse(text)
  } catch {
    throw new Error('invalid open pull request observation')
  }
  if (!Array.isArray(pullRequests)) throw new Error('invalid open pull request observation')
  for (const pullRequest of pullRequests) {
    if (!Number.isInteger(pullRequest?.number) || typeof pullRequest.headRefName !== 'string' || !SHA.test(pullRequest.headRefOid ?? '') || typeof pullRequest.baseRefName !== 'string') {
      throw new Error('invalid open pull request observation')
    }
  }
  return pullRequests
}

function buildRemoteHeads(map, remoteRefs) {
  const owners = new Map()
  for (const carrier of map.carriers) {
    for (const entry of carrier.branches) owners.set(entry.branch, carrier.id)
  }
  for (const entry of [...map.checkpoints, ...map.independentTriage, ...map.mergedXlsx]) owners.set(entry.branch, entry.owner)
  for (const branch of map.processBranches) owners.set(branch, 'process')
  owners.set('main', 'main')
  return [...remoteRefs].map(([branch, sha]) => ({ branch, sha, owner: owners.get(branch) ?? 'unexpected' }))
}

async function inspectArtifact(artifact, { read, stat }) {
  const before = await stat(artifact.path)
  if (before.isSymbolicLink() || !before.isFile()) throw new Error(`artifact is not a regular file: ${artifact.label}`)
  const contents = await read(artifact.path)
  const after = await stat(artifact.path)
  if (after.isSymbolicLink() || !after.isFile() || before.size !== after.size || Buffer.byteLength(contents) !== before.size) {
    throw new Error(`artifact changed during capture: ${artifact.label}`)
  }
  return {
    label: artifact.label,
    sourcePath: artifact.path,
    byteSize: before.size,
    sha256: createHash('sha256').update(contents).digest('hex')
  }
}

function normalizeTopology(topology) {
  if (!SHA.test(topology?.mainSha ?? '') || topology.legacyHeadCount !== 30 || !Number.isInteger(topology.processHeadCount) || !Number.isInteger(topology.openPullRequestCount)) {
    throw new Error('invalid topology assessment')
  }
  return {
    readyForArchive: true,
    mainSha: topology.mainSha,
    legacyHeadCount: topology.legacyHeadCount,
    processHeadCount: topology.processHeadCount,
    openPullRequestCount: topology.openPullRequestCount
  }
}

function normalizeRemoteHeads(remoteHeads) {
  if (!Array.isArray(remoteHeads)) throw new Error('invalid remote heads')
  return remoteHeads.map((head) => {
    if (typeof head?.branch !== 'string' || head.branch.length === 0 || !SHA.test(head.sha ?? '') || typeof head.owner !== 'string' || head.owner.length === 0) {
      throw new Error('invalid remote head observation')
    }
    return { branch: head.branch, sha: head.sha, owner: head.owner }
  }).sort((left, right) => compareText(left.branch, right.branch))
}

function normalizeOpenPullRequests(pullRequests) {
  if (!Array.isArray(pullRequests)) throw new Error('invalid open pull requests')
  return pullRequests.map((pullRequest) => {
    if (!Number.isInteger(pullRequest?.number) || typeof pullRequest.headRefName !== 'string' || !SHA.test(pullRequest.headRefOid ?? '') || typeof pullRequest.baseRefName !== 'string' || typeof pullRequest.url !== 'string') {
      throw new Error('invalid open pull request observation')
    }
    return {
      number: pullRequest.number,
      headRefName: pullRequest.headRefName,
      headRefOid: pullRequest.headRefOid,
      baseRefName: pullRequest.baseRefName,
      url: pullRequest.url
    }
  }).sort((left, right) => left.number - right.number)
}

function normalizeLocalBranches(localBranches) {
  if (!Array.isArray(localBranches)) throw new Error('invalid local branches')
  return localBranches.map((branch) => {
    if (typeof branch?.branch !== 'string' || branch.branch.length === 0 || !SHA.test(branch.sha ?? '')) throw new Error('invalid local branch observation')
    return { branch: branch.branch, sha: branch.sha }
  }).sort((left, right) => compareText(left.branch, right.branch))
}

function normalizeWorktrees(worktrees) {
  if (!Array.isArray(worktrees)) throw new Error('invalid worktree observations')
  return worktrees.map((worktree) => {
    if (typeof worktree?.path !== 'string' || !SHA.test(worktree.head ?? '') || (worktree.branch !== null && typeof worktree.branch !== 'string') || typeof worktree.detached !== 'boolean') {
      throw new Error('invalid worktree observation')
    }
    return { path: worktree.path, head: worktree.head, branch: worktree.branch, detached: worktree.detached, status: normalizeStatus(worktree.status) }
  }).sort((left, right) => compareText(left.path, right.path))
}

function normalizeExternalRepositories(repositories) {
  if (!Array.isArray(repositories)) throw new Error('invalid external repository observations')
  return repositories.map((repository) => {
    if (!LABEL.test(repository?.label ?? '') || !path.isAbsolute(repository.path ?? '') || !SHA.test(repository.head ?? '') || (repository.branch !== null && typeof repository.branch !== 'string')) {
      throw new Error('invalid external repository observation')
    }
    return { label: repository.label, path: repository.path, head: repository.head, branch: repository.branch, status: normalizeStatus(repository.status) }
  }).sort((left, right) => compareText(left.label, right.label))
}

function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new Error('invalid artifacts')
  return artifacts.map((artifact) => {
    if (!LABEL.test(artifact?.label ?? '') || !path.isAbsolute(artifact.sourcePath ?? '') || !Number.isSafeInteger(artifact.byteSize) || artifact.byteSize < 0 || !/^[0-9a-f]{64}$/u.test(artifact.sha256 ?? '')) {
      throw new Error('invalid artifact observation')
    }
    return { label: artifact.label, sourcePath: artifact.sourcePath, byteSize: artifact.byteSize, sha256: artifact.sha256 }
  }).sort((left, right) => compareText(left.label, right.label))
}

function normalizeStatus(status) {
  if (!Array.isArray(status) || !status.every((entry) => typeof entry === 'string' && entry.length > 0)) throw new Error('invalid repository status')
  return [...status].sort()
}

function isAllowedPrimaryStatus(status) {
  return status.length === 0 || status.length === 1 && status[0] === ALLOWED_PRIMARY_STATUS
}

function statusLines(text) {
  return nonEmptyLines(text)
}

function runChecked(run, command, args) {
  const result = invokeRunner(run, command, args)
  if (result.status !== 0) throw new Error(`${formatCommand(command, args)} failed: ${sanitizeCommandOutput(result.stderr || result.stdout, args)}`)
  return result.stdout
}

function runStatus(run, command, args) {
  return invokeRunner(run, command, args).status
}

function runOptional(run, command, args) {
  const result = invokeRunner(run, command, args)
  if (result.status === 0) return result.stdout.trim()
  if (result.status === 1) return null
  throw new Error(`${formatCommand(command, args)} failed: ${sanitizeCommandOutput(result.stderr || result.stdout, args)}`)
}

function invokeRunner(run, command, args) {
  try {
    return normalizeRunResult(run(command, args))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${formatCommand(command, args)} failed: ${sanitizeCommandOutput(message, args)}`)
  }
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
    .replace(/(^|[\s'"(])\/(?!\/)[^\s'"\)]*/gu, '$1[path]')
    .replace(/(?:gh[opsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/gu, '***')
    .trim()
}

function formatCommand(command, args) {
  return [command, ...args.map((arg) => sanitizeArgument(arg))].join(' ')
}

function sanitizeArgument(arg) {
  const value = String(arg)
  if (/^[a-z][a-z0-9+.-]*:\/\/[^/\s:@]+:[^@\s/]+@/iu.test(value)) return '[remote]'
  if (value.startsWith('safe.directory=')) return 'safe.directory=[path]'
  if (path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)) return '[path]'
  return sanitize(value)
}

function sanitizeCommandOutput(value, args) {
  let output = String(value)
  for (const arg of args) {
    const raw = String(arg)
    const redacted = sanitizeArgument(raw)
    if (redacted === raw) continue
    output = output.split(raw).join(redacted)
    if (raw.startsWith('safe.directory=')) output = output.split(raw.slice('safe.directory='.length)).join('[path]')
  }
  return sanitize(output)
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

function escapeMarkdown(value) {
  return String(value).replace(/[|`]/gu, '\\$&').replace(/\r?\n/gu, ' ')
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  captureMainConsolidationInventory().then(({ exitCode, evidence }) => {
    process.stdout.write(`${JSON.stringify({ readyForArchive: evidence.readyForArchive, topology: evidence.topology })}\n`)
    process.exitCode = exitCode
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? sanitize(error.message) : 'inventory capture failed'}\n`)
    process.exitCode = 1
  })
}
