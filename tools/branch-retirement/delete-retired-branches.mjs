#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { atomicWriteText, parseRemoteRefs } from './audit-branch-retirement.mjs'
import {
  buildAtomicDeletionPlan,
  summarizeDeletionResult,
  validateDeletionInputs
} from './deletionPolicy.mjs'

export function repositoryFromRemoteUrl(value) {
  const text = String(value).trim()
  const scp = text.match(/^[^@]+@[^:]+:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/u)
  if (scp) return `${scp[1]}/${scp[2]}`
  try {
    const url = new URL(text)
    const parts = url.pathname.replace(/^\/+|\/+$/gu, '').replace(/\.git$/u, '').split('/')
    if (parts.length >= 2) return `${parts.at(-2)}/${parts.at(-1)}`
  } catch {
    // handled below
  }
  throw new Error('origin remote does not identify an owner/name repository')
}

export function renderExecutionMarkdown(evidence) {
  const lines = [
    '# Branch Retirement Execution',
    '',
    `- Repository: \`${evidence.repository}\``,
    `- Mode: \`${evidence.mode}\``,
    `- Status: **${evidence.status}**`,
    `- Main SHA before: \`${evidence.mainShaBefore}\``,
    `- Main SHA after: \`${evidence.mainShaAfter}\``,
    `- Main protected: **${evidence.mainProtected ? 'yes' : 'no'}**`,
    '',
    '## Planned branches',
    ''
  ]
  for (const branch of evidence.planned) lines.push(`- \`${branch}\``)
  lines.push('', '## Deleted branches', '')
  for (const branch of evidence.deleted) lines.push(`- \`${branch}\``)
  lines.push('', '## Already absent', '')
  for (const branch of evidence.alreadyAbsent) lines.push(`- \`${branch}\``)
  if (evidence.remaining.length > 0) {
    lines.push('', '## Verification failures', '')
    for (const branch of evidence.remaining) lines.push(`- \`${branch}\` remains present`)
  }
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv)
  const manifest = JSON.parse(await readFile(args.manifest, 'utf8'))
  const apply = args.mode === 'apply'
  if (apply && args.confirmRepository !== args.repository) throw new Error('--apply requires an exact --confirm-repository match')

  const currentBranch = run('git', ['branch', '--show-current']).trim()
  if (apply && currentBranch !== 'integration/retire-superseded-branches-20260716') {
    throw new Error(`apply must run from integration/retire-superseded-branches-20260716, got '${currentBranch || '(detached)'}'`)
  }
  if (apply && run('git', ['status', '--porcelain=v1']).trim()) throw new Error('apply requires a clean worktree')
  const remoteUrl = run('git', ['remote', 'get-url', args.remote]).trim()
  if (repositoryFromRemoteUrl(remoteUrl) !== args.repository) throw new Error('origin remote does not match --repository')

  run('git', ['fetch', '--no-tags', args.remote, 'main'])
  const currentMainSha = run('git', ['rev-parse', `refs/remotes/${args.remote}/main`]).trim()
  const auditedMainIsAncestor = runStatus('git', ['merge-base', '--is-ancestor', manifest.auditedMainSha, currentMainSha]) === 0
  const remoteRefs = parseRemoteRefs(run('git', ['ls-remote', '--heads', args.remote]))
  const defaultBranch = run('gh', ['api', `repos/${args.repository}`, '--jq', '.default_branch']).trim()
  const protectedBranches = new Set(nonEmptyLines(run('gh', ['api', '--paginate', `repos/${args.repository}/branches?per_page=100`, '--jq', '.[] | select(.protected == true) | .name'])))
  const openPrRefs = new Set(nonEmptyLines(run('gh', ['api', '--paginate', `repos/${args.repository}/pulls?state=open&per_page=100`, '--jq', '.[] | .head.ref, .base.ref'])))

  validateDeletionInputs({
    manifest,
    repository: args.repository,
    remote: args.remote,
    defaultBranch,
    currentMainSha,
    auditedMainIsAncestor,
    protectedBranches,
    openPrRefs,
    remoteRefs,
    executionBranch: currentBranch
  })
  const plan = buildAtomicDeletionPlan({ manifest, repository: args.repository, remote: args.remote, currentMainSha, remoteRefs })

  if (apply && plan.command.length > 0) {
    const [command, ...commandArgs] = plan.command
    run(command, commandArgs)
  }

  const afterRefs = parseRemoteRefs(run('git', ['ls-remote', '--heads', args.remote]))
  const mainShaAfter = afterRefs.get('main')
  const planned = plan.branches.map((entry) => entry.branch)
  const remaining = apply ? planned.filter((branch) => afterRefs.has(branch)) : []
  const summary = summarizeDeletionResult({
    planned,
    remaining,
    deleted: apply ? planned.filter((branch) => !afterRefs.has(branch)) : [],
    currentMainSha: mainShaAfter,
    status: apply ? undefined : 'dry_run'
  })
  if (mainShaAfter !== currentMainSha) {
    summary.status = 'verification_failed'
    summary.mainChangedDuringDeletion = true
  }
  const evidence = {
    schemaVersion: 'bob-builtin-analyze/branch-retirement-execution/v1',
    repository: args.repository,
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    status: summary.status,
    mainShaBefore: currentMainSha,
    mainShaAfter: mainShaAfter ?? null,
    planned,
    deleted: summary.deleted,
    remaining: summary.remaining,
    alreadyAbsent: plan.alreadyAbsent,
    atomic: true,
    forceWithLease: true,
    mainProtected: protectedBranches.has(defaultBranch),
    mainProtectionSubstitute: protectedBranches.has(defaultBranch)
      ? null
      : 'Exact allowlist, explicit default-branch exclusion, per-ref force-with-lease, atomic push, and pre/post main SHA invariance.'
  }
  await atomicWriteText(args.executionJson, `${JSON.stringify(evidence, null, 2)}\n`)
  await atomicWriteText(args.executionMarkdown, renderExecutionMarkdown(evidence))
  process.stdout.write(`${JSON.stringify({ status: evidence.status, planned: planned.length, deleted: evidence.deleted.length })}\n`)
  if (apply && evidence.status !== 'success') process.exitCode = 3
}

function parseArgs(argv) {
  const values = new Map()
  let mode = 'dry-run'
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (token === '--dry-run') { mode = 'dry-run'; continue }
    if (token === '--apply') { mode = 'apply'; continue }
    if (!token.startsWith('--')) throw new Error(`unexpected argument '${token}'`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`missing value for '${token}'`)
    values.set(token.slice(2), value)
    index += 1
  }
  const required = ['repository', 'remote', 'manifest', 'execution-json', 'execution-markdown']
  for (const key of required) if (!values.has(key)) throw new Error(`--${key} is required`)
  return {
    repository: values.get('repository'),
    remote: values.get('remote'),
    manifest: values.get('manifest'),
    executionJson: values.get('execution-json'),
    executionMarkdown: values.get('execution-markdown'),
    confirmRepository: values.get('confirm-repository'),
    mode
  }
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

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
