const MAP_SCHEMA = 'bob-builtin-analyze/branch-retirement-map/v1'
const SHA_PATTERN = /^[0-9a-f]{40}$/
const DISPOSITIONS = new Set([
  'merged-source',
  'superseded',
  'diagnostic-only',
  'temporary-automation'
])

export function validateRetirementMap(map) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error('retirement map must be an object')
  if (map.schemaVersion !== MAP_SCHEMA) throw new Error(`unsupported retirement map schema: ${String(map.schemaVersion)}`)
  if (!/^[^/\s]+\/[^/\s]+$/.test(map.repository ?? '')) throw new Error('repository must use owner/name form')
  if (!SHA_PATTERN.test(map.baselineMain ?? '')) throw new Error('baselineMain must be a 40-character lowercase SHA')
  if (!Array.isArray(map.entries) || map.entries.length === 0) throw new Error('retirement map entries must be a non-empty array')

  const branches = new Set()
  for (const entry of map.entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('retirement entry must be an object')
    const branch = entry.branch
    if (typeof branch !== 'string' || !branch.trim() || branch !== branch.trim()) throw new Error('branch must be a trimmed non-empty string')
    if (branch === 'main' || branch === 'master') throw new Error(`default branch '${branch}' cannot be retired`)
    if (branches.has(branch)) throw new Error(`duplicate branch '${branch}'`)
    branches.add(branch)
    if (!DISPOSITIONS.has(entry.expectedDisposition)) throw new Error(`unknown disposition '${String(entry.expectedDisposition)}' for '${branch}'`)
    if (!SHA_PATTERN.test(entry.expectedSha ?? '')) throw new Error(`expectedSha for '${branch}' must be a 40-character lowercase SHA`)
    if (!Array.isArray(entry.replacementPullRequests) || entry.replacementPullRequests.length === 0) {
      throw new Error(`replacementPullRequests are required for '${branch}'`)
    }
    if (entry.replacementPullRequests.some((value) => !Number.isInteger(value) || value <= 0)) {
      throw new Error(`replacementPullRequests for '${branch}' must contain positive integers`)
    }
    const required = stringArray(entry.requiredMainPaths, `${branch}.requiredMainPaths`)
    const forbidden = stringArray(entry.forbiddenMainPaths, `${branch}.forbiddenMainPaths`)
    const overlap = required.find((value) => forbidden.includes(value))
    if (overlap) throw new Error(`path '${overlap}' is both required and forbidden for '${branch}'`)
  }
  return map
}

export function evaluateRetirementEntry({
  entry,
  remoteSha,
  mergedPullRequests,
  mainPaths,
  openPrRefs,
  protectedBranches
}) {
  const base = {
    branch: entry.branch,
    expectedSha: entry.expectedSha,
    remoteSha: remoteSha ?? null,
    expectedDisposition: entry.expectedDisposition,
    replacementPullRequests: [...entry.replacementPullRequests],
    requiredMainPaths: [...(entry.requiredMainPaths ?? [])],
    forbiddenMainPaths: [...(entry.forbiddenMainPaths ?? [])]
  }
  if (remoteSha === undefined || remoteSha === null) {
    return { ...base, disposition: 'already-absent', deletable: false, blockers: [] }
  }

  const blockers = []
  if (!SHA_PATTERN.test(remoteSha)) blockers.push('remote head is not a valid 40-character SHA')
  if (remoteSha !== entry.expectedSha) blockers.push(`branch head moved from ${entry.expectedSha} to ${remoteSha}`)
  if (openPrRefs.has(entry.branch)) blockers.push('branch is referenced by an open pull request')
  if (protectedBranches.has(entry.branch)) blockers.push('branch is protected')

  for (const pr of entry.replacementPullRequests) {
    if (!mergedPullRequests.has(pr)) blockers.push(`replacement pull request #${pr} is not merged`)
  }
  for (const required of entry.requiredMainPaths ?? []) {
    if (!mainPaths.has(required)) blockers.push(`required main path is missing: ${required}`)
  }
  for (const forbidden of entry.forbiddenMainPaths ?? []) {
    if (mainPaths.has(forbidden)) blockers.push(`temporary or forbidden path remains on main: ${forbidden}`)
  }

  return {
    ...base,
    disposition: blockers.length === 0 ? entry.expectedDisposition : 'blocked-unique',
    deletable: blockers.length === 0,
    blockers
  }
}

export function summarizeRetirementAudit(entries) {
  if (!Array.isArray(entries)) throw new Error('audit entries must be an array')
  const blockedBranches = entries
    .filter((entry) => entry.disposition === 'blocked-unique' || (entry.disposition !== 'already-absent' && entry.deletable !== true))
    .map((entry) => entry.branch)
    .sort(compareText)
  const deletableBranches = entries.filter((entry) => entry.deletable === true).map((entry) => entry.branch)
  const alreadyAbsentBranches = entries.filter((entry) => entry.disposition === 'already-absent').map((entry) => entry.branch)
  return {
    ready_for_deletion: blockedBranches.length === 0,
    blockedBranches,
    deletableBranches,
    alreadyAbsentBranches,
    counts: {
      total: entries.length,
      deletable: deletableBranches.length,
      alreadyAbsent: alreadyAbsentBranches.length,
      blocked: blockedBranches.length
    }
  }
}

function stringArray(value, label) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const result = []
  const seen = new Set()
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim() || item !== item.trim()) throw new Error(`${label} must contain trimmed non-empty strings`)
    if (seen.has(item)) throw new Error(`${label} contains duplicate '${item}'`)
    seen.add(item)
    result.push(item)
  }
  return result
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0
}
