const AUDIT_SCHEMA = 'bob-builtin-analyze/branch-retirement-audit/v1'
const SHA_PATTERN = /^[0-9a-f]{40}$/

export function validateDeletionInputs({
  manifest,
  repository,
  remote,
  defaultBranch,
  currentMainSha,
  auditedMainIsAncestor,
  protectedBranches,
  openPrRefs,
  remoteRefs,
  executionBranch
}) {
  if (!manifest || manifest.schemaVersion !== AUDIT_SCHEMA) throw new Error('unsupported or missing retirement audit manifest')
  if (manifest.repository !== repository) throw new Error('manifest repository does not match requested repository')
  if (manifest.ready_for_deletion !== true) throw new Error('manifest is not ready for deletion')
  if (!Array.isArray(manifest.blockedBranches) || manifest.blockedBranches.length > 0) throw new Error('manifest contains blocked branches')
  if (!Array.isArray(manifest.entries)) throw new Error('manifest entries must be an array')
  if (!/^[^/\s]+\/[^/\s]+$/.test(repository ?? '')) throw new Error('repository must use owner/name form')
  if (typeof remote !== 'string' || !remote) throw new Error('remote is required')
  if (defaultBranch !== 'main') throw new Error(`expected default branch main, got ${String(defaultBranch)}`)
  if (!SHA_PATTERN.test(currentMainSha ?? '')) throw new Error('current main SHA is invalid')
  if (!SHA_PATTERN.test(manifest.auditedMainSha ?? '')) throw new Error('audited main SHA is invalid')
  if (auditedMainIsAncestor !== true) throw new Error('audited main is not an ancestor of current main')
  if (!(protectedBranches instanceof Set)) throw new Error('protectedBranches must be a Set')
  if (!(openPrRefs instanceof Set)) throw new Error('openPrRefs must be a Set')
  if (!(remoteRefs instanceof Map)) throw new Error('remoteRefs must be a Map')

  const seen = new Set()
  for (const entry of manifest.entries) {
    if (!entry || typeof entry.branch !== 'string') throw new Error('manifest entry has no branch')
    if (seen.has(entry.branch)) throw new Error(`duplicate manifest branch '${entry.branch}'`)
    seen.add(entry.branch)
    if (entry.branch === defaultBranch || entry.branch === 'master') throw new Error(`default branch '${entry.branch}' cannot be deleted`)
    if (entry.branch === executionBranch) throw new Error('execution branch cannot be included in the main deletion batch')
    if (entry.disposition === 'already-absent') {
      if (remoteRefs.has(entry.branch)) throw new Error(`branch '${entry.branch}' reappeared after audit`)
      continue
    }
    if (entry.deletable !== true) throw new Error(`branch '${entry.branch}' is not deletable`)
    if (!SHA_PATTERN.test(entry.remoteSha ?? '')) throw new Error(`branch '${entry.branch}' has no valid audited SHA`)
    if (protectedBranches.has(entry.branch)) throw new Error(`branch '${entry.branch}' is protected`)
    if (openPrRefs.has(entry.branch)) throw new Error(`branch '${entry.branch}' is referenced by an open pull request`)
    const current = remoteRefs.get(entry.branch)
    if (current !== entry.remoteSha) throw new Error(`branch '${entry.branch}' moved or disappeared after audit`)
  }
  return true
}

export function buildAtomicDeletionPlan({ manifest, repository, remote, currentMainSha, remoteRefs }) {
  if (!manifest || !Array.isArray(manifest.entries)) throw new Error('manifest entries are required')
  const branches = manifest.entries
    .filter((entry) => entry.deletable === true && remoteRefs.get(entry.branch) === entry.remoteSha)
    .map((entry) => ({
      branch: entry.branch,
      expectedSha: entry.remoteSha,
      disposition: entry.disposition,
      replacementPullRequests: [...(entry.replacementPullRequests ?? [])]
    }))
  const alreadyAbsent = manifest.entries
    .filter((entry) => entry.disposition === 'already-absent')
    .map((entry) => entry.branch)
  const command = branches.length === 0
    ? []
    : [
        'git', 'push', '--atomic',
        ...branches.map((entry) => `--force-with-lease=refs/heads/${entry.branch}:${entry.expectedSha}`),
        remote,
        ...branches.map((entry) => `:refs/heads/${entry.branch}`)
      ]
  return {
    repository,
    remote,
    auditedMainSha: manifest.auditedMainSha,
    currentMainSha,
    branches,
    alreadyAbsent,
    command
  }
}

export function summarizeDeletionResult({ planned, remaining, deleted, currentMainSha, status }) {
  const unresolved = [...(remaining ?? [])]
  return {
    status: status ?? (unresolved.length === 0 ? 'success' : 'verification_failed'),
    currentMainSha: currentMainSha ?? null,
    planned: [...(planned ?? [])],
    deleted: [...(deleted ?? (unresolved.length === 0 ? planned ?? [] : []))],
    remaining: unresolved
  }
}
