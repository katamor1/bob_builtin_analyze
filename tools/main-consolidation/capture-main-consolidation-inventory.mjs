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
    records.push({ path: record.path, head: record.head, branch: record.branch, status: [] })
    record = undefined
  }
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line) {
      flush()
      continue
    }
    if (line.startsWith('worktree ')) {
      flush()
      record = { path: line.slice('worktree '.length), branch: null }
      continue
    }
    if (!record) throw new Error('invalid worktree record')
    if (line.startsWith('HEAD ')) {
      record.head = line.slice('HEAD '.length)
    } else if (line.startsWith('branch ')) {
      record.branch = line.slice('branch '.length)
    } else if (line === 'detached' || line === 'bare' || line === 'locked' || line === 'prunable' || line.startsWith('locked ') || line.startsWith('prunable ')) {
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
  topology,
  primaryStatus,
  currentWorktreeStatus = [],
  worktrees,
  externalRepositories,
  artifacts,
  processRefs = [],
  generatedAt = new Date().toISOString()
}) {
  if (topology?.readyForArchive !== true) throw new Error('topology is not ready for archive')
  const normalizedPrimaryStatus = normalizeStatus(primaryStatus)
  const normalizedCurrentStatus = normalizeStatus(currentWorktreeStatus)
  const normalizedWorktrees = normalizeRepositories(worktrees, 'worktree')
  const normalizedExternalRepositories = normalizeRepositories(externalRepositories, 'external repository', true)
  const normalizedArtifacts = normalizeArtifacts(artifacts)
  const primaryDirty = !isAllowedPrimaryStatus(normalizedPrimaryStatus)
  const dirtyWorktrees = normalizedWorktrees.some((worktree) => worktree.status.length > 0)
  const dirtyExternalRepositories = normalizedExternalRepositories.some((repository) => repository.status.length > 0)
  const currentWorktreeDirty = !isAllowedPrimaryStatus(normalizedCurrentStatus)
  return {
    schemaVersion: INVENTORY_SCHEMA,
    repository: topology.repository,
    generatedAt,
    auditedMainSha: topology.mainSha,
    readyForArchive: !(primaryDirty || currentWorktreeDirty || dirtyWorktrees || dirtyExternalRepositories),
    topology: {
      legacyHeadCount: topology.legacyHeadCount,
      processHeadCount: topology.processHeadCount,
      openPullRequestCount: topology.openPullRequestCount
    },
    processRefs: normalizeProcessRefs(processRefs),
    primaryStatus: normalizedPrimaryStatus,
    currentWorktreeStatus: normalizedCurrentStatus,
    worktrees: normalizedWorktrees,
    externalRepositories: normalizedExternalRepositories,
    artifacts: normalizedArtifacts
  }
}

export function renderInventoryMarkdown(evidence) {
  const lines = [
    '# Main Consolidation Inventory',
    '',
    `- Repository: \`${escapeMarkdown(evidence.repository)}\``,
    `- Generated: \`${escapeMarkdown(evidence.generatedAt)}\``,
    `- Audited main: \`${escapeMarkdown(evidence.auditedMainSha)}\``,
    `- Ready for archive: **${evidence.readyForArchive ? 'yes' : 'no'}**`,
    `- Legacy heads: ${evidence.topology.legacyHeadCount}`,
    `- Open pull requests: ${evidence.topology.openPullRequestCount}`,
    '',
    '## Repository state',
    '',
    `- Primary root: ${isAllowedPrimaryStatus(evidence.primaryStatus) ? 'allowed untracked integration clone' : evidence.primaryStatus.length === 0 ? 'clean' : 'dirty'}`,
    `- Invoking worktree: ${evidence.currentWorktreeStatus.length === 0 ? 'clean' : 'dirty'}`,
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
  lines.push('', '## Process branches', '', '| Branch | Remote HEAD | Local HEAD |', '| --- | --- | --- |')
  for (const processRef of evidence.processRefs) {
    lines.push(`| \`${escapeMarkdown(processRef.branch)}\` | \`${escapeMarkdown(processRef.remoteSha)}\` | \`${escapeMarkdown(processRef.localSha ?? 'absent')}\` |`)
  }
  lines.push('', '## Artifacts', '', '| Label | File | Bytes | SHA-256 |', '| --- | --- | ---: | --- |')
  for (const artifact of evidence.artifacts) {
    lines.push(`| \`${escapeMarkdown(artifact.label)}\` | \`${escapeMarkdown(artifact.fileName)}\` | ${artifact.size} | \`${escapeMarkdown(artifact.sha256)}\` |`)
  }
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
  const map = JSON.parse(String(await read(args.map, 'utf8')))
  validateConsolidationMap(map)
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
    externalRepositories.push({ label: external.label, path: external.path, status })
  }
  const artifacts = []
  for (const artifact of args.artifacts) artifacts.push(await inspectArtifact(artifact, { read, stat }))

  const processRefs = new Map()
  for (const branch of map.processBranches) {
    if (remoteRefs.has(branch)) processRefs.set(branch, remoteRefs.get(branch))
  }
  const topology = assessTopology({ map, mainSha, baselineIsAncestor, remoteRefs, openPullRequests, processRefs })
  topology.repository = map.repository
  const evidence = inventoryFromObservations({
    topology,
    primaryStatus: primary.status,
    currentWorktreeStatus: invokingWorktreeStatus,
    worktrees: worktrees.map((worktree) => worktree === primary ? { ...worktree, status: [] } : worktree),
    externalRepositories,
    artifacts,
    processRefs: [...processRefs].map(([branch, remoteSha]) => ({ branch, remoteSha, localSha: localRefs.get(branch) ?? null })),
    generatedAt
  })
  await write(args.json, `${JSON.stringify(evidence, null, 2)}\n`)
  await write(args.markdown, renderInventoryMarkdown(evidence))
  return { exitCode: evidence.readyForArchive ? 0 : 2, evidence, localRefs }
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
    fileName: path.basename(artifact.path),
    size: before.size,
    sha256: createHash('sha256').update(contents).digest('hex')
  }
}

function normalizeRepositories(entries, kind, labeled = false) {
  if (!Array.isArray(entries)) throw new Error(`invalid ${kind} observations`)
  return entries.map((entry) => {
    if ((!labeled && typeof entry?.path !== 'string') || typeof entry?.path !== 'undefined' && typeof entry.path !== 'string' || typeof entry?.head !== 'string' && entry?.head !== undefined) throw new Error(`invalid ${kind} observation`)
    if (entry.head !== undefined && !SHA.test(entry.head)) throw new Error(`invalid ${kind} head`)
    if (labeled && (!LABEL.test(entry.label ?? '') || entry.path !== undefined && !path.isAbsolute(entry.path))) throw new Error(`invalid ${kind} observation`)
    return { ...entry, status: normalizeStatus(entry.status) }
  })
}

function normalizeArtifacts(artifacts) {
  if (!Array.isArray(artifacts)) throw new Error('invalid artifacts')
  return artifacts.map((artifact) => {
    if (!LABEL.test(artifact?.label ?? '') || !path.isAbsolute(artifact.sourcePath ?? '') || typeof artifact.fileName !== 'string' || !Number.isSafeInteger(artifact.size) || artifact.size < 0 || !/^[0-9a-f]{64}$/u.test(artifact.sha256 ?? '')) {
      throw new Error('invalid artifact observation')
    }
    return { ...artifact }
  })
}

function normalizeProcessRefs(processRefs) {
  if (!Array.isArray(processRefs)) throw new Error('invalid process refs')
  return processRefs.map((processRef) => {
    if (typeof processRef?.branch !== 'string' || !SHA.test(processRef.remoteSha ?? '') || processRef.localSha !== null && processRef.localSha !== undefined && !SHA.test(processRef.localSha)) {
      throw new Error('invalid process ref observation')
    }
    return { ...processRef, localSha: processRef.localSha ?? null }
  }).sort((left, right) => left.branch.localeCompare(right.branch))
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
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${sanitize(result.stderr || result.stdout)}`)
  return result.stdout
}

function runStatus(run, command, args) {
  return invokeRunner(run, command, args).status
}

function invokeRunner(run, command, args) {
  try {
    return normalizeRunResult(run(command, args))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${command} ${args.join(' ')} failed: ${sanitize(message)}`)
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
    .replace(/https?:\/\/[^/\s:@]+:[^@\s/]+@/gu, (match) => `${match.startsWith('https://') ? 'https' : 'http'}://***@`)
    .replace(/(?:gh[opsu]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/gu, '***')
    .trim()
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
