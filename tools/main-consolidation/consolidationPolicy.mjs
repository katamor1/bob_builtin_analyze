const MAP_SCHEMA = 'bob-builtin-analyze/main-consolidation-map/v1'
const REPOSITORY = 'katamor1/bob_builtin_analyze'
const SHA = /^[0-9a-f]{40}$/u
const CARRIER_IDS = new Set(['workflow-a', 'workflow-b', 'workflow-c', 'processing-a', 'processing-b', 'processing-c'])
const PROCESS_BRANCH = 'codex/main-consolidation-control-plane'

function assertSha(value, label) {
  if (!SHA.test(value ?? '')) throw new Error(`invalid SHA for ${label}`)
}

function assertLegacyEntry(entry) {
  if (typeof entry?.branch !== 'string' || entry.branch.length === 0) throw new Error('invalid legacy branch')
  assertSha(entry.expectedSha, entry.branch)
  if (typeof entry.owner !== 'string' || entry.owner.length === 0) throw new Error(`invalid owner for ${entry.branch}`)
}

function sortedNumbers(values) {
  return [...values].sort((left, right) => left - right)
}

export function flattenLegacyHeads(map) {
  return [
    ...(map?.carriers ?? []).flatMap((carrier) => (carrier.branches ?? []).map(({ branch, expectedSha }) => ({
      branch,
      expectedSha,
      owner: carrier.id
    }))),
    ...(map?.checkpoints ?? []),
    ...(map?.independentTriage ?? []),
    ...(map?.mergedXlsx ?? [])
  ]
}

export function validateConsolidationMap(map) {
  if (map?.schemaVersion !== MAP_SCHEMA) throw new Error('unsupported consolidation map schema')
  if (map.repository !== REPOSITORY) throw new Error('unexpected repository')
  assertSha(map.baselineMain, 'baseline main')
  if (!Array.isArray(map.processBranches) || map.processBranches.length !== 1 || map.processBranches[0] !== PROCESS_BRANCH) {
    throw new Error('unexpected process branch allowlist')
  }
  if (!Array.isArray(map.carriers) || map.carriers.length !== 6) throw new Error('exactly six carriers are required')
  if (new Set(map.carriers.map((carrier) => carrier?.id)).size !== 6 || !map.carriers.every((carrier) => CARRIER_IDS.has(carrier?.id))) {
    throw new Error('unexpected carrier IDs')
  }

  const ownedPullRequests = []
  for (const carrier of map.carriers) {
    assertSha(carrier.fromSha, `${carrier.id} from`)
    assertSha(carrier.toSha, `${carrier.id} to`)
    if (carrier.fromSha === carrier.toSha) throw new Error(`carrier range must be distinct: ${carrier.id}`)
    if (!Array.isArray(carrier.branches) || carrier.branches.length === 0) throw new Error(`carrier has no branches: ${carrier.id}`)
    if (!Array.isArray(carrier.pullRequests)) throw new Error(`carrier has no pull request list: ${carrier.id}`)

    const branchPullRequests = []
    for (const entry of carrier.branches) {
      if (typeof entry?.branch !== 'string' || entry.branch.length === 0) throw new Error(`invalid carrier branch for ${carrier.id}`)
      assertSha(entry.expectedSha, entry.branch)
      if (typeof entry.baseBranch !== 'string' || entry.baseBranch.length === 0) throw new Error(`invalid base branch for ${entry.branch}`)
      if (entry.pullRequest !== undefined) {
        if (!Number.isInteger(entry.pullRequest) || entry.pullRequest <= 0) throw new Error(`invalid pull request for ${entry.branch}`)
        branchPullRequests.push(entry.pullRequest)
      }
    }
    if (JSON.stringify(sortedNumbers(branchPullRequests)) !== JSON.stringify(sortedNumbers(carrier.pullRequests))) {
      throw new Error(`carrier pull request mapping mismatch: ${carrier.id}`)
    }
    ownedPullRequests.push(...carrier.pullRequests)
  }
  if (new Set(ownedPullRequests).size !== ownedPullRequests.length) throw new Error('duplicate pull request ownership')

  for (const category of ['checkpoints', 'independentTriage', 'mergedXlsx']) {
    if (!Array.isArray(map[category])) throw new Error(`missing ${category}`)
    for (const entry of map[category]) assertLegacyEntry(entry)
  }

  const heads = flattenLegacyHeads(map)
  if (heads.length !== 30) throw new Error('exactly 30 legacy remote heads are required')
  if (new Set(heads.map((entry) => entry.branch)).size !== heads.length) throw new Error('duplicate legacy branch')
  for (const entry of heads) assertSha(entry.expectedSha, entry.branch)
  return map
}

export function assessTopology({ map, mainSha, baselineIsAncestor, remoteRefs, openPullRequests, processRefs }) {
  validateConsolidationMap(map)
  if (!SHA.test(mainSha ?? '') || baselineIsAncestor !== true) throw new Error('main does not contain the approved baseline')
  if (remoteRefs.get('main') !== mainSha) throw new Error('remote main observation does not match the audited main SHA')

  const expected = new Map(flattenLegacyHeads(map).map((entry) => [entry.branch, entry]))
  for (const [name, sha] of processRefs) {
    if (!map.processBranches.includes(name)) throw new Error(`unexpected process branch: ${name}`)
    if (remoteRefs.get(name) !== sha) throw new Error(`process branch observation mismatch: ${name}`)
  }

  const allowed = new Set(['main', ...expected.keys(), ...processRefs.keys()])
  for (const name of remoteRefs.keys()) if (!allowed.has(name)) throw new Error(`unexpected remote branch: ${name}`)
  for (const [name, entry] of expected) {
    if (remoteRefs.get(name) !== entry.expectedSha) throw new Error(`remote branch moved or disappeared: ${name}`)
  }

  const expectedPrs = sortedNumbers(map.carriers.flatMap((carrier) => carrier.pullRequests))
  const observedPrs = sortedNumbers(openPullRequests.map((pullRequest) => pullRequest.number))
  if (new Set(observedPrs).size !== observedPrs.length || JSON.stringify(expectedPrs) !== JSON.stringify(observedPrs)) {
    throw new Error('open pull request set does not match the frozen map')
  }

  const mappedPrs = new Map(map.carriers.flatMap((carrier) => carrier.branches
    .filter((entry) => Number.isInteger(entry.pullRequest))
    .map((entry) => [entry.pullRequest, entry])))
  for (const pullRequest of openPullRequests) {
    const mapped = mappedPrs.get(pullRequest.number)
    if (!mapped || pullRequest.headRefName !== mapped.branch || pullRequest.headRefOid !== mapped.expectedSha || pullRequest.baseRefName !== mapped.baseBranch) {
      throw new Error(`pull request mapping mismatch: #${pullRequest.number}`)
    }
  }

  return {
    readyForArchive: true,
    mainSha,
    legacyHeadCount: expected.size,
    processHeadCount: processRefs.size,
    openPullRequestCount: observedPrs.length
  }
}
