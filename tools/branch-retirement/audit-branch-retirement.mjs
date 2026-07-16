#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  evaluateRetirementEntry,
  summarizeRetirementAudit,
  validateRetirementMap
} from './retirementPolicy.mjs'

export function parseRemoteRefs(text) {
  const refs = new Map()
  for (const line of String(text).split(/\r?\n/u)) {
    if (!line.trim()) continue
    const match = line.match(/^([0-9a-f]{40})\s+refs\/heads\/(.+)$/u)
    if (!match) throw new Error(`invalid ls-remote line: ${line}`)
    refs.set(match[2], match[1])
  }
  return refs
}

export function auditFromObservations({
  map,
  currentMainSha,
  defaultBranch,
  remoteRefs,
  mergedPullRequests,
  mainPaths,
  openPrRefs,
  protectedBranches,
  baselineMainIsAncestor,
  generatedAt = new Date().toISOString()
}) {
  validateRetirementMap(map)
  if (!/^[0-9a-f]{40}$/u.test(currentMainSha)) throw new Error('current main SHA is invalid')
  if (defaultBranch !== 'main') throw new Error(`expected default branch main, got ${defaultBranch}`)
  if (baselineMainIsAncestor !== true) throw new Error('retirement-map baseline is not an ancestor of current main')
  const entries = map.entries.map((entry) => evaluateRetirementEntry({
    entry,
    remoteSha: remoteRefs.get(entry.branch),
    mergedPullRequests,
    mainPaths,
    openPrRefs,
    protectedBranches
  }))
  const summary = summarizeRetirementAudit(entries)
  return {
    schemaVersion: 'bob-builtin-analyze/branch-retirement-audit/v1',
    repository: map.repository,
    generatedAt,
    baselineMainSha: map.baselineMain,
    auditedMainSha: currentMainSha,
    defaultBranch,
    mainProtected: protectedBranches.has(defaultBranch),
    ready_for_deletion: summary.ready_for_deletion,
    blockedBranches: summary.blockedBranches,
    deletableBranches: summary.deletableBranches,
    alreadyAbsentBranches: summary.alreadyAbsentBranches,
    counts: summary.counts,
    openPrRefs: [...openPrRefs].sort(compareText),
    entries
  }
}

export function renderAuditMarkdown(audit) {
  const lines = [
    '# Branch Retirement Reconciliation',
    '',
    `- Repository: \`${audit.repository}\``,
    `- Generated: \`${audit.generatedAt}\``,
    `- Audited main: \`${audit.auditedMainSha}\``,
    `- Default branch: \`${audit.defaultBranch}\``,
    `- Main protected: **${audit.mainProtected ? 'yes' : 'no'}**`,
    `- Ready for deletion: **${audit.ready_for_deletion ? 'yes' : 'no'}**`,
    '',
    '| Branch | Expected | Observed | SHA | Deletable | Replacement PRs | Blockers |',
    '| --- | --- | --- | --- | --- | --- | --- |'
  ]
  for (const entry of audit.entries) {
    lines.push(`| \`${escapeCell(entry.branch)}\` | ${escapeCell(entry.expectedDisposition)} | ${escapeCell(entry.disposition)} | \`${entry.remoteSha ?? 'absent'}\` | ${entry.deletable ? 'yes' : 'no'} | ${entry.replacementPullRequests.map((pr) => `#${pr}`).join(', ')} | ${escapeCell(entry.blockers.join('; ') || '-')} |`)
  }
  lines.push('', '## Summary', '')
  lines.push(`- Deletable: ${audit.counts.deletable}`)
  lines.push(`- Already absent: ${audit.counts.alreadyAbsent}`)
  lines.push(`- Blocked: ${audit.counts.blocked}`)
  if (audit.blockedBranches.length > 0) {
    lines.push('', '## Blocked branches', '')
    for (const branch of audit.blockedBranches) lines.push(`- \`${branch}\``)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

export async function atomicWriteText(filePath, text) {
  await mkdir(path.dirname(filePath), { recursive: true })
  const temporary = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, filePath)
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const map = JSON.parse(await readFile(args.map, 'utf8'))
  validateRetirementMap(map)
  if (map.repository !== args.repository) throw new Error('map repository does not match --repository')

  run('git', ['fetch', '--no-tags', args.remote, args.base])
  const currentMainSha = run('git', ['rev-parse', `refs/remotes/${args.remote}/${args.base}`]).trim()
  const baselineMainIsAncestor = runStatus('git', ['merge-base', '--is-ancestor', map.baselineMain, currentMainSha]) === 0
  const remoteRefs = parseRemoteRefs(run('git', ['ls-remote', '--heads', args.remote]))
  const defaultBranch = run('gh', ['api', `repos/${args.repository}`, '--jq', '.default_branch']).trim()
  const protectedBranches = new Set(nonEmptyLines(run('gh', ['api', '--paginate', `repos/${args.repository}/branches?per_page=100`, '--jq', '.[] | select(.protected == true) | .name'])))
  const openPrRefs = new Set(nonEmptyLines(run('gh', ['api', '--paginate', `repos/${args.repository}/pulls?state=open&per_page=100`, '--jq', '.[] | .head.ref, .base.ref'])))
  const mergedPullRequests = new Set()
  const pullRequests = [...new Set(map.entries.flatMap((entry) => entry.replacementPullRequests))]
  for (const pr of pullRequests) {
    const merged = run('gh', ['api', `repos/${args.repository}/pulls/${pr}`, '--jq', '.merged']).trim()
    if (merged === 'true') mergedPullRequests.add(pr)
  }
  const mainPaths = new Set(nonEmptyLines(run('git', ['ls-tree', '-r', '--name-only', currentMainSha])))
  const audit = auditFromObservations({
    map,
    currentMainSha,
    defaultBranch,
    remoteRefs,
    mergedPullRequests,
    mainPaths,
    openPrRefs,
    protectedBranches,
    baselineMainIsAncestor
  })
  await atomicWriteText(args.json, `${JSON.stringify(audit, null, 2)}\n`)
  await atomicWriteText(args.markdown, renderAuditMarkdown(audit))
  process.stdout.write(`${JSON.stringify({ ready_for_deletion: audit.ready_for_deletion, counts: audit.counts })}\n`)
  if (!audit.ready_for_deletion) process.exitCode = 2
}

function parseArgs(argv) {
  const values = new Map()
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument '${token}'`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for '${token}'`)
    values.set(token.slice(2), value)
    index += 1
  }
  const required = ['repository', 'remote', 'base', 'map', 'json', 'markdown']
  for (const key of required) if (!values.has(key)) throw new Error(`--${key} is required`)
  return Object.fromEntries(required.map((key) => [key, values.get(key)]))
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${sanitize(result.stderr || result.stdout)}`)
  return result.stdout
}

function runStatus(command, args) {
  return spawnSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).status ?? 1
}

function sanitize(value) {
  return String(value).replace(/https?:\/\/[^\s/@]+:[^\s/@]+@/gu, 'https://***@').trim()
}

function nonEmptyLines(value) {
  return String(value).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
}

function escapeCell(value) {
  return String(value).replace(/\|/gu, '\\|').replace(/\r?\n/gu, ' ')
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
