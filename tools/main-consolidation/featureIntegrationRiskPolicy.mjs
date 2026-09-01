import { isDeepStrictEqual } from 'node:util'

const ACTION_TIER = Object.freeze({
  inspect: 'A', review: 'A', dry_run: 'A', render_in_chat: 'A',
  edit_scoped_files: 'B', run_local_test: 'B', build_local_package: 'B', local_commit: 'B', write_generated_output: 'B', create_fresh_fixture: 'B', create_local_branch: 'B', create_local_worktree: 'B', public_dependency_read: 'B',
  update_main: 'C', rewrite_history: 'C', push_remote: 'C', create_or_update_pr: 'C', merge_pr: 'C', delete_branch: 'C', delete_worktree: 'C', overwrite_existing_data: 'C', delete_existing_data: 'C', write_external_service: 'C', publish: 'C', sign: 'C', use_credentials: 'C', incur_cost: 'C', send_nonpublic_data: 'C'
})
const TIER_VALUE = Object.freeze({ A: 1, B: 2, C: 3 })
const EFFECTS = Object.freeze({
  repository: Object.freeze({ none: 'A', scoped_worktree: 'B', main_or_history: 'C' }),
  filesystem: Object.freeze({ none: 'A', fresh_output: 'B', existing_external_write: 'C', existing_external_delete: 'C', existing_worktree_delete: 'C' }),
  network: Object.freeze({ none: 'A', public_read: 'B', external_write: 'C' }),
  credentials: Object.freeze({ none: 'A', use_secret: 'C' }),
  publication: Object.freeze({ none: 'A', publish: 'C' }),
  cost: Object.freeze({ none: 'A', may_incur: 'C' }),
  nonPublicData: Object.freeze({ none: 'A', send: 'C' })
})
const SCOPE_KEYS = ['purpose', 'repository', 'worktree', 'branch', 'allowedActions', 'allowedPaths', 'outputRoots', 'freshResources', 'allowedPublicEndpoints', 'effects', 'exclusions', 'source', 'targetSet', 'impact', 'rollback']
const FRESH_KEYS = ['branches', 'worktrees', 'fixtureRoots', 'requireAbsent', 'requireIsolated']
const CHECK_NAMES = ['scopeContained', 'targetAbsent', 'isolatedTarget', 'endpointAllowed', 'credentialsAbsent', 'identityStable', 'parentBoundaryStable', 'leaseSatisfied', 'provenanceSatisfied']
const PRE_FLIGHT_KEYS = ['proposalId', 'taskId', 'operationId', 'idempotencyKey', 'action', 'repository', 'worktree', 'branch', 'paths', 'outputRoots', 'freshResources', 'finalPublicEndpoints', 'observedSource', 'observedTargetSet', 'observedImpact', 'observedRollback', 'checks']
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u
const ACTION_CHECKS = Object.freeze({
  inspect: [], review: [], dry_run: [], render_in_chat: [],
  edit_scoped_files: [], run_local_test: [], build_local_package: [], local_commit: ['leaseSatisfied'],
  write_generated_output: ['targetAbsent', 'parentBoundaryStable'],
  create_fresh_fixture: ['targetAbsent', 'isolatedTarget', 'parentBoundaryStable', 'scopeContained'],
  create_local_branch: ['targetAbsent', 'isolatedTarget', 'leaseSatisfied'],
  create_local_worktree: ['targetAbsent', 'isolatedTarget', 'parentBoundaryStable'],
  public_dependency_read: ['endpointAllowed', 'credentialsAbsent'],
  update_main: ['leaseSatisfied'], rewrite_history: ['leaseSatisfied'], push_remote: ['leaseSatisfied'],
  create_or_update_pr: ['leaseSatisfied'], merge_pr: ['leaseSatisfied'], delete_branch: ['leaseSatisfied'],
  delete_worktree: ['identityStable', 'parentBoundaryStable'],
  overwrite_existing_data: ['identityStable', 'parentBoundaryStable'], delete_existing_data: ['identityStable', 'parentBoundaryStable'],
  write_external_service: [], publish: [], sign: [], use_credentials: [], incur_cost: [], send_nonpublic_data: []
})
const EFFECT_CHECKS = Object.freeze({
  repository: Object.freeze({ none: [], scoped_worktree: [], main_or_history: ['leaseSatisfied'] }),
  filesystem: Object.freeze({ none: [], fresh_output: ['targetAbsent', 'parentBoundaryStable'], existing_external_write: ['identityStable', 'parentBoundaryStable'], existing_external_delete: ['identityStable', 'parentBoundaryStable'], existing_worktree_delete: ['identityStable', 'parentBoundaryStable'] }),
  network: Object.freeze({ none: [], public_read: ['endpointAllowed', 'credentialsAbsent'], external_write: [] }),
  credentials: Object.freeze({ none: [], use_secret: [] }), publication: Object.freeze({ none: [], publish: [] }),
  cost: Object.freeze({ none: [], may_incur: [] }), nonPublicData: Object.freeze({ none: [], send: [] })
})
const SOURCE_CHECKS = Object.freeze({ git_revision: [], artifact: ['provenanceSatisfied'], filesystem_identity: [], external_version: [] })

function fail(message) { throw new TypeError(message) }
function assertPlain(value, keys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) fail(`invalid ${label}`)
  if (Reflect.ownKeys(value).some((key) => typeof key === 'symbol')) fail(`invalid ${label}`)
  const actual = Object.keys(value)
  if (actual.length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(`${label} exact keys mismatch`)
}
function assertArray(value, label) {
  if (!Array.isArray(value) || Object.keys(value).length !== value.length) fail(`invalid ${label}`)
}
function assertString(value, label) { if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) fail(`invalid ${label}`) }
function assertUnique(values, label) { if (new Set(values).size !== values.length) fail(`duplicate ${label}`) }
function pathIdentityKey(value) {
  if (/^[A-Z]:\//u.test(value)) return `windows:${value.replace(/[A-Z]/gu, character => character.toLowerCase())}`
  return `posix:${value}`
}
function samePath(left, right) { return pathIdentityKey(left) === pathIdentityKey(right) }
function assertCanonicalPath(value, label) {
  assertString(value, label)
  const windows = /^[A-Z]:\//u.test(value)
  if (value.normalize('NFC') !== value || value.includes('\\') || value.includes('//') || value.endsWith('/') || !(/^(?:[A-Z]:\/|\/)/u.test(value))) fail(`noncanonical ${label}`)
  const segments = value.slice(windows ? 3 : 1).split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..' || (windows && /[ .]$/u.test(segment)))) fail(`noncanonical ${label}`)
}
function assertCanonicalBranch(value, label) {
  assertString(value, label)
  if (value.includes('\\') || value.startsWith('/') || value.startsWith('refs/') || value.includes('..') || value.endsWith('.lock') || value.includes('@{')) fail(`noncanonical ${label}`)
}
function assertStringArray(value, label, validator = assertString) {
  assertArray(value, label); value.forEach((item) => validator(item, label)); assertUnique(value, label)
}
function assertCanonicalPathArray(value, label) {
  assertArray(value, label); value.forEach(item => assertCanonicalPath(item, label)); assertUnique(value.map(pathIdentityKey), label)
}
function under(child, parent) { return pathIdentityKey(child).startsWith(`${pathIdentityKey(parent)}/`) }
function assertEndpoint(value, label) {
  assertString(value, label)
  let parsed
  try { parsed = new URL(value) } catch { fail(`invalid ${label}`) }
  const host = parsed.hostname.toLowerCase()
  const ipv6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : null
  const privateIpv4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[0-1])\.)/u.test(host)
  const privateIpv6 = ipv6 !== null && (ipv6 === '::' || ipv6 === '::1' || /^fe[89ab][0-9a-f]*:/u.test(ipv6) || /^f[cd][0-9a-f]*:/u.test(ipv6) || ipv6.startsWith('::ffff:'))
  if (parsed.protocol !== 'https:' || parsed.origin !== value || parsed.username || parsed.password || host === 'localhost' || privateIpv4 || privateIpv6 || host.includes('*')) fail(`non-public ${label}`)
}
function tierAtLeast(current, candidate) { return TIER_VALUE[candidate] > TIER_VALUE[current] ? candidate : current }

function validateEffects(value) {
  assertPlain(value, Object.keys(EFFECTS), 'effects')
  let tier = 'A'
  for (const [effect, arms] of Object.entries(EFFECTS)) {
    if (!Object.hasOwn(arms, value[effect])) fail(`unknown ${effect} effect`)
    tier = tierAtLeast(tier, arms[value[effect]])
  }
  return tier
}
function validateFreshResources(value, scope) {
  assertPlain(value, FRESH_KEYS, 'freshResources')
  assertStringArray(value.branches, 'fresh branch', assertCanonicalBranch)
  assertArray(value.worktrees, 'fresh worktree')
  value.worktrees.forEach((item) => { assertPlain(item, ['canonicalPath', 'branch'], 'fresh worktree'); assertCanonicalPath(item.canonicalPath, 'fresh worktree path'); assertCanonicalBranch(item.branch, 'fresh worktree branch') })
  assertUnique(value.worktrees.map((item) => pathIdentityKey(item.canonicalPath)), 'fresh worktree path')
  assertUnique(value.worktrees.map((item) => item.branch), 'fresh worktree branch')
  assertCanonicalPathArray(value.fixtureRoots, 'fixture root')
  if (typeof value.requireAbsent !== 'boolean' || typeof value.requireIsolated !== 'boolean') fail('invalid fresh requirements')
  for (const item of value.worktrees) if (samePath(item.canonicalPath, scope.worktree) || under(scope.worktree, item.canonicalPath) || item.branch === scope.branch) fail('fresh worktree overlaps current worktree')
  for (const root of value.fixtureRoots) {
    if (samePath(root, scope.worktree) || under(root, scope.worktree) || under(root, scope.repository)) fail('fixture root overlaps repository')
    if (!scope.outputRoots.some((parent) => under(root, parent))) fail('fixture root outside output parent')
  }
}
function validateSource(value) {
  assertPlain(value, ['kind', 'canonicalId', 'displayFingerprint', 'verification'], 'source')
  if (!['git_revision', 'artifact', 'filesystem_identity', 'external_version'].includes(value.kind) || value.verification !== 'verified') fail('invalid source')
  assertString(value.canonicalId, 'source canonicalId'); assertString(value.displayFingerprint, 'source displayFingerprint')
}
function validateTargetSet(value) {
  assertPlain(value, ['kind', 'canonicalIds', 'displayExpectedVersions', 'targetCount'], 'targetSet')
  if (!['git_refs', 'pull_request', 'filesystem_paths', 'external_resources'].includes(value.kind)) fail('invalid targetSet')
  assertStringArray(value.canonicalIds, 'target canonicalId'); assertStringArray(value.displayExpectedVersions, 'target displayExpectedVersion')
  if (value.canonicalIds.length === 0 || value.canonicalIds.length !== value.displayExpectedVersions.length || !Number.isSafeInteger(value.targetCount) || value.targetCount !== value.canonicalIds.length) fail('invalid target count')
}
function validateImpact(value, actions) {
  assertPlain(value, ['operations', 'primaryDiffSummary', 'primaryDiffFingerprint', 'affectedCount', 'totalBytes', 'byteCap', 'irreversible'], 'impact')
  assertStringArray(value.operations, 'impact operation')
  if (value.operations.length === 0 || value.operations.some((action) => !Object.hasOwn(ACTION_TIER, action)) || !sameMembers(value.operations, actions)) fail('invalid impact operations')
  assertString(value.primaryDiffSummary, 'primaryDiffSummary'); assertString(value.primaryDiffFingerprint, 'primaryDiffFingerprint')
  if (!Number.isSafeInteger(value.affectedCount) || value.affectedCount < 0 || typeof value.irreversible !== 'boolean') fail('invalid impact')
  if ((value.totalBytes === null) !== (value.byteCap === null)) fail('incomplete byte limit')
  if (value.totalBytes !== null) {
    if (typeof value.totalBytes !== 'string' || typeof value.byteCap !== 'string' || !DECIMAL.test(value.totalBytes) || !DECIMAL.test(value.byteCap) || BigInt(value.totalBytes) > BigInt(value.byteCap)) fail('invalid byte limit')
  }
}
function validateRollback(value, irreversible) {
  assertPlain(value, ['mode', 'summary'], 'rollback')
  if (!['direct', 'compensating', 'recreate', 'none'].includes(value.mode) || (value.mode === 'none' && !irreversible)) fail('invalid rollback')
  assertString(value.summary, 'rollback summary')
}
function sameMembers(left, right) { return left.length === right.length && left.every((value) => right.includes(value)) }

function validateScope(input) {
  assertPlain(input, SCOPE_KEYS, 'scope')
  const value = structuredClone(input)
  assertString(value.purpose, 'purpose'); assertCanonicalPath(value.repository, 'repository'); assertCanonicalPath(value.worktree, 'worktree'); assertCanonicalBranch(value.branch, 'branch')
  if (!under(value.worktree, value.repository)) fail('worktree outside repository')
  assertStringArray(value.allowedActions, 'allowed action')
  if (value.allowedActions.length === 0 || value.allowedActions.some((action) => !Object.hasOwn(ACTION_TIER, action))) fail('unknown action')
  assertCanonicalPathArray(value.allowedPaths, 'allowed path'); assertCanonicalPathArray(value.outputRoots, 'output root')
  validateFreshResources(value.freshResources, value)
  assertStringArray(value.allowedPublicEndpoints, 'public endpoint', assertEndpoint)
  assertStringArray(value.exclusions, 'exclusion')
  const actionTier = value.allowedActions.reduce((tier, action) => tierAtLeast(tier, ACTION_TIER[action]), 'A')
  const effectTier = validateEffects(value.effects)
  const tier = tierAtLeast(actionTier, effectTier)
  const freshActions = new Set(value.allowedActions.filter((action) => ['create_local_branch', 'create_local_worktree', 'create_fresh_fixture'].includes(action)))
  if (freshActions.size > 0) {
    if (!value.freshResources.requireAbsent || !value.freshResources.requireIsolated) fail('fresh resources must be absent and isolated')
    if (freshActions.has('create_local_branch') && value.freshResources.branches.length === 0) fail('missing fresh branch')
    if (freshActions.has('create_local_worktree') && value.freshResources.worktrees.length === 0) fail('missing fresh worktree')
    if (freshActions.has('create_fresh_fixture') && value.freshResources.fixtureRoots.length === 0) fail('missing fixture root')
  } else if (value.freshResources.branches.length || value.freshResources.worktrees.length || value.freshResources.fixtureRoots.length || value.freshResources.requireAbsent || value.freshResources.requireIsolated) fail('unexpected fresh resources')
  const publicRead = value.allowedActions.includes('public_dependency_read') || value.effects.network === 'public_read'
  if (publicRead ? value.allowedPublicEndpoints.length === 0 : value.allowedPublicEndpoints.length !== 0) fail('public endpoint binding mismatch')
  if (tier === 'C') {
    if (value.source === null || value.targetSet === null || value.impact === null || value.rollback === null) fail('missing Tier C binding')
    validateSource(value.source); validateTargetSet(value.targetSet); validateImpact(value.impact, value.allowedActions); validateRollback(value.rollback, value.impact.irreversible)
  } else if (value.source !== null || value.targetSet !== null || value.impact !== null || value.rollback !== null) fail('unexpected Tier C binding')
  return { value: retainedScope(value), tier }
}

function presentationScope(scope) {
  const copy = structuredClone(scope)
  return copy
}
function retainedScope(scope) {
  const copy = structuredClone(scope)
  if (copy.source) copy.source = { kind: copy.source.kind, displayFingerprint: copy.source.displayFingerprint, verification: copy.source.verification }
  if (copy.targetSet) copy.targetSet = { kind: copy.targetSet.kind, displayExpectedVersions: copy.targetSet.displayExpectedVersions, targetCount: copy.targetSet.targetCount }
  return copy
}
function snapshot(proposal) {
  if (!proposal) return null
  return structuredClone({ proposalId: proposal.proposalId, tier: proposal.tier, state: proposal.state, invalidatedReason: proposal.invalidatedReason, scope: presentationScope(proposal.scope) })
}
function requiredChecks(action, effects, source) {
  const needed = new Set()
  for (const check of ACTION_CHECKS[action]) needed.add(check)
  for (const [dimension, arm] of Object.entries(effects)) for (const check of EFFECT_CHECKS[dimension][arm]) needed.add(check)
  if (source !== null) for (const check of SOURCE_CHECKS[source.kind]) needed.add(check)
  return needed
}
function assertEqualBinding(actual, expected, label) { if (!isDeepStrictEqual(actual, expected)) fail(`${label} drift`) }
function validatePreflight(event, proposal, taskId) {
  assertPlain(event, PRE_FLIGHT_KEYS, 'preflight')
  if (event.proposalId !== proposal.proposalId || event.taskId !== taskId || typeof event.operationId !== 'string' || event.operationId.length === 0 || (event.idempotencyKey !== null && (typeof event.idempotencyKey !== 'string' || event.idempotencyKey.length === 0))) fail('preflight identity mismatch')
  if (!proposal.scope.allowedActions.includes(event.action)) fail('preflight action outside scope')
  assertEqualBinding(event.repository, proposal.scope.repository, 'repository'); assertEqualBinding(event.worktree, proposal.scope.worktree, 'worktree'); assertEqualBinding(event.branch, proposal.scope.branch, 'branch')
  assertEqualBinding(event.paths, proposal.scope.allowedPaths, 'paths'); assertEqualBinding(event.outputRoots, proposal.scope.outputRoots, 'outputRoots'); assertEqualBinding(event.freshResources, proposal.scope.freshResources, 'freshResources'); assertEqualBinding(event.finalPublicEndpoints, proposal.scope.allowedPublicEndpoints, 'public endpoints')
  assertEqualBinding(event.observedSource, proposal.scope.source, 'source'); assertEqualBinding(event.observedTargetSet, proposal.scope.targetSet, 'targetSet'); assertEqualBinding(event.observedImpact, proposal.scope.impact, 'impact'); assertEqualBinding(event.observedRollback, proposal.scope.rollback, 'rollback')
  assertPlain(event.checks, CHECK_NAMES, 'checks')
  const required = requiredChecks(event.action, proposal.scope.effects, proposal.scope.source)
  for (const check of CHECK_NAMES) {
    const value = event.checks[check]
    if (!['verified', 'not_applicable'].includes(value) || (required.has(check) ? value !== 'verified' : value !== 'not_applicable')) fail('invalid preflight checks')
  }
}

export function classifyRisk(scope) { return validateScope(scope).tier }

export function createTaskProposalModel({ taskId }) {
  if (!taskId || typeof taskId !== 'string') fail('invalid taskId')
  let active = null
  let sequence = 0
  const terminal = () => active && ['consumed', 'invalidated', 'blocked'].includes(active.state)
  const requireActive = () => { if (!active) fail('no proposal'); return active }
  const requireProposal = (proposalId) => { const proposal = requireActive(); if (proposal.proposalId !== proposalId) fail('proposal mismatch'); return proposal }
  const invalidateForDrift = () => { active.state = 'invalidated'; active.invalidatedReason = 'scope_drift' }
  return Object.freeze({
    open(scope) {
      if (active && !terminal()) fail('active proposal exists')
      const { value, tier } = validateScope(scope)
      if (tier === 'A') fail('Tier A does not require a proposal')
      active = { proposalId: `proposal-${++sequence}`, tier, state: 'pending', invalidatedReason: null, scope: value, operation: null }
      return snapshot(active)
    },
    recordDecision(event) {
      assertPlain(event, ['taskId', 'proposalId', 'decision'], 'decision')
      const proposal = requireProposal(event.proposalId)
      if (event.taskId !== taskId || !['approved', 'declined'].includes(event.decision) || proposal.state !== 'pending') fail('invalid decision event')
      if (event.decision === 'approved') proposal.state = 'approved'
      else { proposal.state = 'invalidated'; proposal.invalidatedReason = 'declined' }
      return snapshot(proposal)
    },
    beginOperation(event) {
      const proposal = requireActive()
      if (proposal.state !== 'approved') fail('proposal is not approved')
      try { validatePreflight(event, proposal, taskId) } catch (error) {
        if (error instanceof TypeError && /drift|outside scope/u.test(error.message)) invalidateForDrift()
        throw error
      }
      proposal.operation = { operationId: event.operationId, idempotencyKey: event.idempotencyKey }
      proposal.state = 'executing'
      return snapshot(proposal)
    },
    recordOutcome(event) {
      assertPlain(event, ['operationId', 'idempotencyKey', 'outcome'], 'outcome')
      const proposal = requireActive()
      if (proposal.state !== 'executing' || !proposal.operation || event.operationId !== proposal.operation.operationId || event.idempotencyKey !== proposal.operation.idempotencyKey || !['applied', 'confirmed_no_mutation', 'unknown'].includes(event.outcome)) fail('invalid outcome event')
      if (event.outcome === 'unknown') proposal.state = 'reconciling'
      else if (proposal.tier === 'C' && event.outcome === 'applied') proposal.state = 'consumed'
      else proposal.state = 'approved'
      return snapshot(proposal)
    },
    recordReconciliation(event) {
      assertPlain(event, ['operationId', 'idempotencyKey', 'outcome'], 'reconciliation')
      const proposal = requireActive()
      if (proposal.state !== 'reconciling' || !proposal.operation || event.operationId !== proposal.operation.operationId || event.idempotencyKey !== proposal.operation.idempotencyKey || !['applied', 'confirmed_no_mutation', 'indeterminate'].includes(event.outcome)) fail('invalid reconciliation event')
      if (event.outcome === 'indeterminate') proposal.state = 'blocked'
      else if (proposal.tier === 'C' && event.outcome === 'applied') proposal.state = 'consumed'
      else proposal.state = 'approved'
      return snapshot(proposal)
    },
    completeScope() {
      const proposal = requireActive()
      if (proposal.tier !== 'B' || proposal.state !== 'approved') fail('scope cannot be completed')
      proposal.state = 'consumed'
      return snapshot(proposal)
    },
    invalidate(reason) {
      const proposal = requireActive()
      if (!['cancelled', 'scope_drift'].includes(reason) || !['pending', 'approved'].includes(proposal.state)) fail('scope cannot be invalidated')
      proposal.state = 'invalidated'; proposal.invalidatedReason = reason
      return snapshot(proposal)
    },
    snapshot() { return snapshot(active) }
  })
}
