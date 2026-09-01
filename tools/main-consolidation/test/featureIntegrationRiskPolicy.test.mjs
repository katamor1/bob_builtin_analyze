import assert from 'node:assert/strict'
import test from 'node:test'
import * as policy from '../featureIntegrationRiskPolicy.mjs'

const NO_EFFECTS = Object.freeze({ repository: 'none', filesystem: 'none', network: 'none', credentials: 'none', publication: 'none', cost: 'none', nonPublicData: 'none' })
const CHECK_NAMES = ['scopeContained', 'targetAbsent', 'isolatedTarget', 'endpointAllowed', 'credentialsAbsent', 'identityStable', 'parentBoundaryStable', 'leaseSatisfied', 'provenanceSatisfied']
const checks = (verified = []) => Object.fromEntries(CHECK_NAMES.map((name) => [name, verified.includes(name) ? 'verified' : 'not_applicable']))

function scope(overrides = {}) {
  const value = {
    purpose: 'Constrained local change',
    repository: 'C:/repos/project',
    worktree: 'C:/repos/project/.worktrees/risk',
    branch: 'feature/risk',
    allowedActions: ['run_local_test'],
    allowedPaths: ['C:/repos/project/.worktrees/risk/src'],
    outputRoots: [],
    freshResources: { branches: [], worktrees: [], fixtureRoots: [], requireAbsent: false, requireIsolated: false },
    allowedPublicEndpoints: [],
    effects: { ...NO_EFFECTS },
    exclusions: ['No remote publication'],
    source: null,
    targetSet: null,
    impact: null,
    rollback: null
  }
  return { ...value, ...structuredClone(overrides) }
}

function tierCScope(overrides = {}) {
  return scope({
    allowedActions: ['update_main'],
    source: { kind: 'artifact', canonicalId: 'artifact:release-candidate', displayFingerprint: 'candidate-7f3a', verification: 'verified' },
    targetSet: { kind: 'git_refs', canonicalIds: ['ref:main', 'ref:release'], displayExpectedVersions: ['main@display-1', 'release@display-2'], targetCount: 2 },
    impact: { operations: ['update_main'], primaryDiffSummary: 'two refs advance', primaryDiffFingerprint: 'diff-92ab', affectedCount: 2, totalBytes: '10', byteCap: '10', irreversible: false },
    rollback: { mode: 'direct', summary: 'restore prior refs' },
    ...overrides
  })
}

function eventFor(modelSnapshot, proposalScope, action, overrides = {}) {
  return {
    proposalId: modelSnapshot.proposalId,
    taskId: 'task-1',
    operationId: 'operation-1',
    idempotencyKey: 'idem-1',
    action,
    repository: proposalScope.repository,
    worktree: proposalScope.worktree,
    branch: proposalScope.branch,
    paths: proposalScope.allowedPaths,
    outputRoots: proposalScope.outputRoots,
    freshResources: proposalScope.freshResources,
    finalPublicEndpoints: proposalScope.allowedPublicEndpoints,
    observedSource: modelSnapshot.scope.source,
    observedTargetSet: modelSnapshot.scope.targetSet,
    observedImpact: modelSnapshot.scope.impact,
    observedRollback: modelSnapshot.scope.rollback,
    checks: checks(),
    ...structuredClone(overrides)
  }
}

function beginApproved(candidate, action, verified) {
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const pending = model.open(candidate)
  model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' })
  return model.beginOperation(eventFor(pending, candidate, action, { checks: checks(verified) }))
}

function scopeForAction(action) {
  if (action === 'create_local_branch') return scope({ allowedActions: [action], freshResources: { branches: ['feature/new'], worktrees: [], fixtureRoots: [], requireAbsent: true, requireIsolated: true } })
  if (action === 'create_local_worktree') return scope({ allowedActions: [action], freshResources: { branches: [], worktrees: [{ canonicalPath: 'C:/repos/project/.worktrees/new', branch: 'feature/new' }], fixtureRoots: [], requireAbsent: true, requireIsolated: true } })
  if (action === 'create_fresh_fixture') return scope({ allowedActions: [action], outputRoots: ['C:/approved-output'], freshResources: { branches: [], worktrees: [], fixtureRoots: ['C:/approved-output/fixture'], requireAbsent: true, requireIsolated: true } })
  if (action === 'public_dependency_read') return scope({ allowedActions: [action], allowedPublicEndpoints: ['https://registry.npmjs.org'] })
  const tierC = ['update_main', 'rewrite_history', 'push_remote', 'create_or_update_pr', 'merge_pr', 'delete_branch', 'delete_worktree', 'overwrite_existing_data', 'delete_existing_data', 'write_external_service', 'publish', 'sign', 'use_credentials', 'incur_cost', 'send_nonpublic_data']
  if (tierC.includes(action)) return tierCScope({ allowedActions: [action], source: { ...tierCScope().source, kind: 'git_revision' }, impact: { ...tierCScope().impact, operations: [action] } })
  return scope({ allowedActions: [action] })
}

function assertExactChecks(candidate, action, expected, label) {
  assert.equal(beginApproved(candidate, action, expected).state, 'executing', label)
  if (expected.length > 0) assert.throws(() => beginApproved(candidate, action, expected.slice(0, -1)), TypeError, `${label}: missing required`)
  const nonrequired = CHECK_NAMES.find(name => !expected.includes(name))
  if (nonrequired) assert.throws(() => beginApproved(candidate, action, [...expected, nonrequired]), TypeError, `${label}: nonrequired verified`)
}

test('classifyRisk assigns every known action its minimum risk tier', () => {
  const cases = [
    ['inspect', 'A'], ['review', 'A'], ['dry_run', 'A'], ['render_in_chat', 'A'],
    ['edit_scoped_files', 'B'], ['run_local_test', 'B'], ['build_local_package', 'B'], ['local_commit', 'B'], ['write_generated_output', 'B'], ['create_fresh_fixture', 'B'], ['create_local_branch', 'B'], ['create_local_worktree', 'B'], ['public_dependency_read', 'B'],
    ['update_main', 'C'], ['rewrite_history', 'C'], ['push_remote', 'C'], ['create_or_update_pr', 'C'], ['merge_pr', 'C'], ['delete_branch', 'C'], ['delete_worktree', 'C'], ['overwrite_existing_data', 'C'], ['delete_existing_data', 'C'], ['write_external_service', 'C'], ['publish', 'C'], ['sign', 'C'], ['use_credentials', 'C'], ['incur_cost', 'C'], ['send_nonpublic_data', 'C']
  ]
  for (const [action, expected] of cases) {
    let candidate = scope({ allowedActions: [action] })
    if (action === 'create_local_branch') candidate = scope({ allowedActions: [action], freshResources: { branches: ['feature/new'], worktrees: [], fixtureRoots: [], requireAbsent: true, requireIsolated: true } })
    if (action === 'create_local_worktree') candidate = scope({ allowedActions: [action], freshResources: { branches: [], worktrees: [{ canonicalPath: 'C:/repos/project/.worktrees/new', branch: 'feature/new' }], fixtureRoots: [], requireAbsent: true, requireIsolated: true } })
    if (action === 'create_fresh_fixture') candidate = scope({ allowedActions: [action], outputRoots: ['C:/approved-output'], freshResources: { branches: [], worktrees: [], fixtureRoots: ['C:/approved-output/fixture'], requireAbsent: true, requireIsolated: true } })
    if (action === 'public_dependency_read') candidate = scope({ allowedActions: [action], allowedPublicEndpoints: ['https://registry.npmjs.org'] })
    if (expected === 'C') candidate = tierCScope({ allowedActions: [action], impact: { ...tierCScope().impact, operations: [action] } })
    assert.equal(policy.classifyRisk(candidate), expected, action)
  }
})

test('classifyRisk elevates by effects and rejects unknown closed values', () => {
  assert.equal(policy.classifyRisk(tierCScope({ allowedActions: ['run_local_test'], effects: { ...NO_EFFECTS, credentials: 'use_secret' }, impact: { ...tierCScope().impact, operations: ['run_local_test'] } })), 'C')
  assert.equal(policy.classifyRisk(scope({ allowedActions: ['inspect'], effects: { ...NO_EFFECTS, filesystem: 'fresh_output' } })), 'B')
  assert.throws(() => policy.classifyRisk(scope({ allowedActions: ['unknown_action'] })), TypeError)
  assert.throws(() => policy.classifyRisk(scope({ effects: { ...NO_EFFECTS, network: 'private_read' } })), TypeError)
  assert.throws(() => policy.classifyRisk(scope({ purpose: '', extra: true })), TypeError)
})

test('Tier B scopes pin fresh targets and public endpoints before classification', () => {
  const fresh = scope({
    allowedActions: ['create_local_branch', 'create_local_worktree', 'create_fresh_fixture', 'public_dependency_read'],
    outputRoots: ['C:/approved-output'],
    freshResources: { branches: ['feature/new'], worktrees: [{ canonicalPath: 'C:/repos/project/.worktrees/new', branch: 'feature/new' }], fixtureRoots: ['C:/approved-output/fixture'], requireAbsent: true, requireIsolated: true },
    allowedPublicEndpoints: ['https://registry.npmjs.org']
  })
  assert.equal(policy.classifyRisk(fresh), 'B')
  assert.throws(() => policy.classifyRisk(scope({ allowedActions: ['create_local_branch'], freshResources: { ...fresh.freshResources, requireAbsent: false } })), TypeError)
  assert.throws(() => policy.classifyRisk(scope({ allowedActions: ['public_dependency_read'], allowedPublicEndpoints: ['https://*.example.test'] })), TypeError)
  assert.throws(() => policy.classifyRisk(scope({ allowedActions: ['public_dependency_read'], allowedPublicEndpoints: ['http://127.0.0.1'] })), TypeError)
})

test('Tier B public reads reject private IPv6 literal endpoints', () => {
  for (const endpoint of ['https://[::1]', 'https://[::]', 'https://[fe80::1]', 'https://[fc00::1]']) {
    assert.throws(() => policy.classifyRisk(scope({ allowedActions: ['public_dependency_read'], allowedPublicEndpoints: [endpoint] })), TypeError, endpoint)
  }
})

test('canonical absolute paths reject duplicate separators, dot aliases, and Windows-equivalent duplicates', () => {
  for (const path of [
    'C:/repos//project/.worktrees/risk/src',
    'C:/repos/project/.worktrees/risk/src/..',
    'C:/repos/project/.worktrees/risk/src/.',
    'C:/repos/project/.worktrees/risk/src. ',
    'C:/repos/project/.worktrees/risk/src.'
  ]) assert.throws(() => policy.classifyRisk(scope({ allowedPaths: [path] })), TypeError, path)

  assert.throws(() => policy.classifyRisk(scope({ allowedPaths: ['C:/repos/project/.worktrees/risk/src', 'C:/REPOS/PROJECT/.worktrees/risk/SRC'] })), TypeError)
  assert.throws(() => policy.classifyRisk(scope({ outputRoots: ['C:/approved-output', 'C:/APPROVED-OUTPUT'] })), TypeError)
})

test('canonical containment uses Windows path identity instead of case-sensitive text prefixes', () => {
  const mixedCase = scope({
    repository: 'C:/REPOS/PROJECT',
    worktree: 'C:/repos/project/.worktrees/risk',
    allowedActions: ['create_fresh_fixture'],
    outputRoots: ['C:/APPROVED-OUTPUT'],
    freshResources: { branches: [], worktrees: [], fixtureRoots: ['C:/approved-output/fixture'], requireAbsent: true, requireIsolated: true }
  })
  assert.equal(policy.classifyRisk(mixedCase), 'B')
  assert.throws(() => policy.classifyRisk(scope({
    allowedActions: ['create_local_worktree'],
    freshResources: { branches: [], worktrees: [{ canonicalPath: 'C:/REPOS/PROJECT/.WORKTREES/RISK', branch: 'feature/new' }], fixtureRoots: [], requireAbsent: true, requireIsolated: true }
  })), TypeError)
})

test('Windows path identity folds non-ASCII ordinal case aliases', () => {
  assert.throws(() => policy.classifyRisk(scope({
    allowedPaths: ['C:/repos/project/.worktrees/risk/Å-data', 'C:/repos/project/.worktrees/risk/å-data']
  })), TypeError, 'duplicate alias')

  assert.equal(policy.classifyRisk(scope({
    repository: 'C:/repos/Å-project',
    worktree: 'C:/repos/å-project/.worktrees/risk',
    allowedPaths: ['C:/repos/å-project/.worktrees/risk/src']
  })), 'B', 'containment alias')

  assert.throws(() => policy.classifyRisk(scope({
    worktree: 'C:/repos/project/.worktrees/Å-risk',
    allowedPaths: ['C:/repos/project/.worktrees/Å-risk/src'],
    allowedActions: ['create_local_worktree'],
    freshResources: { branches: [], worktrees: [{ canonicalPath: 'C:/repos/project/.worktrees/å-risk', branch: 'feature/new' }], fixtureRoots: [], requireAbsent: true, requireIsolated: true }
  })), TypeError, 'fresh worktree overlap alias')
})

test('preflight action matrix derives exact required checks for every mutable action', () => {
  const rows = [
    ['edit_scoped_files', []], ['run_local_test', []], ['build_local_package', []], ['local_commit', ['leaseSatisfied']],
    ['write_generated_output', ['targetAbsent', 'parentBoundaryStable']],
    ['create_fresh_fixture', ['scopeContained', 'targetAbsent', 'isolatedTarget', 'parentBoundaryStable']],
    ['create_local_branch', ['targetAbsent', 'isolatedTarget', 'leaseSatisfied']],
    ['create_local_worktree', ['targetAbsent', 'isolatedTarget', 'parentBoundaryStable']],
    ['public_dependency_read', ['endpointAllowed', 'credentialsAbsent']],
    ['update_main', ['leaseSatisfied']], ['rewrite_history', ['leaseSatisfied']], ['push_remote', ['leaseSatisfied']],
    ['create_or_update_pr', ['leaseSatisfied']], ['merge_pr', ['leaseSatisfied', 'provenanceSatisfied']], ['delete_branch', ['leaseSatisfied']],
    ['delete_worktree', ['identityStable', 'parentBoundaryStable']],
    ['overwrite_existing_data', ['identityStable', 'parentBoundaryStable']], ['delete_existing_data', ['identityStable', 'parentBoundaryStable']],
    ['write_external_service', []], ['publish', ['provenanceSatisfied']], ['sign', ['provenanceSatisfied']], ['use_credentials', []], ['incur_cost', []], ['send_nonpublic_data', []]
  ]
  for (const [action, expected] of rows) assertExactChecks(scopeForAction(action), action, expected, action)
})

test('preflight effect matrix derives exact required checks for every effect arm', () => {
  const rows = [
    ['repository', 'none', []], ['repository', 'scoped_worktree', []], ['repository', 'main_or_history', ['leaseSatisfied']],
    ['filesystem', 'none', []], ['filesystem', 'fresh_output', ['targetAbsent', 'parentBoundaryStable']],
    ['filesystem', 'existing_external_write', ['identityStable', 'parentBoundaryStable']],
    ['filesystem', 'existing_external_delete', ['identityStable', 'parentBoundaryStable']],
    ['filesystem', 'existing_worktree_delete', ['identityStable', 'parentBoundaryStable']],
    ['network', 'none', []], ['network', 'public_read', ['endpointAllowed', 'credentialsAbsent']], ['network', 'external_write', []],
    ['credentials', 'none', []], ['credentials', 'use_secret', []], ['publication', 'none', []], ['publication', 'publish', ['provenanceSatisfied']],
    ['cost', 'none', []], ['cost', 'may_incur', []], ['nonPublicData', 'none', []], ['nonPublicData', 'send', []]
  ]
  for (const [dimension, arm, expected] of rows) {
    const effects = { ...NO_EFFECTS, [dimension]: arm }
    const tierCArm = ['main_or_history', 'existing_external_write', 'existing_external_delete', 'existing_worktree_delete', 'external_write', 'use_secret', 'publish', 'may_incur', 'send'].includes(arm)
    const candidate = tierCArm
      ? tierCScope({ allowedActions: ['run_local_test'], effects, source: { ...tierCScope().source, kind: 'git_revision' }, impact: { ...tierCScope().impact, operations: ['run_local_test'] } })
      : scope({ allowedActions: ['run_local_test'], effects, ...(arm === 'public_read' ? { allowedPublicEndpoints: ['https://registry.npmjs.org'] } : {}), ...(arm === 'fresh_output' ? { outputRoots: ['C:/approved-output'] } : {}) })
    assertExactChecks(candidate, 'run_local_test', expected, `${dimension}:${arm}`)
  }
})

test('preflight source matrix requires provenance only for artifact consumption', () => {
  for (const [kind, expected] of [['git_revision', []], ['artifact', ['provenanceSatisfied']], ['filesystem_identity', []], ['external_version', []]]) {
    const candidate = tierCScope({ allowedActions: ['write_external_service'], source: { ...tierCScope().source, kind }, impact: { ...tierCScope().impact, operations: ['write_external_service'] } })
    assertExactChecks(candidate, 'write_external_service', expected, kind)
  }
})

test('Tier C scopes require every closed binding and coherent counts, bytes, and rollback', () => {
  const cases = [
    ['source', (value) => { value.source = null }],
    ['target set', (value) => { value.targetSet.canonicalIds = ['ref:main', 'ref:main'] }],
    ['versions', (value) => { value.targetSet.displayExpectedVersions = ['main@display-1'] }],
    ['target count', (value) => { value.targetSet.targetCount = 1 }],
    ['impact operation', (value) => { value.impact.operations = [] }],
    ['bytes', (value) => { value.impact.byteCap = '9' }],
    ['rollback', (value) => { value.rollback = null }],
    ['irreversible rollback', (value) => { value.impact.irreversible = false; value.rollback.mode = 'none' }]
  ]
  for (const [name, mutate] of cases) {
    const candidate = tierCScope()
    mutate(candidate)
    assert.throws(() => policy.classifyRisk(candidate), TypeError, name)
  }
  assert.equal(policy.classifyRisk(tierCScope()), 'C')
})

test('Tier A cannot open a proposal and a proposal binds one task and one active scope', () => {
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  assert.throws(() => model.open(scope({ allowedActions: ['inspect'] })), TypeError)
  const pending = model.open(scope())
  assert.equal(pending.state, 'pending')
  assert.throws(() => model.open(scope()), TypeError)
  assert.throws(() => model.recordDecision({ taskId: 'other-task', proposalId: pending.proposalId, decision: 'approved' }), TypeError)
  assert.equal(model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' }).state, 'approved')
  const declinedModel = policy.createTaskProposalModel({ taskId: 'task-1' })
  const declined = declinedModel.open(scope())
  assert.equal(declinedModel.recordDecision({ taskId: 'task-1', proposalId: declined.proposalId, decision: 'declined' }).state, 'invalidated')
  assert.equal(declinedModel.snapshot().invalidatedReason, 'declined')
})

test('Tier B remains approved after a known operation and only completes once', () => {
  const candidate = scope()
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const pending = model.open(candidate)
  model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' })
  const executing = model.beginOperation(eventFor(pending, candidate, 'run_local_test'))
  assert.equal(executing.state, 'executing')
  assert.equal(model.recordOutcome({ operationId: 'operation-1', idempotencyKey: 'idem-1', outcome: 'applied' }).state, 'approved')
  assert.equal(model.completeScope().state, 'consumed')
  assert.throws(() => model.completeScope(), TypeError)
})

test('Tier C consumes applied operations but returns to approved after confirmed no mutation', () => {
  const candidate = tierCScope()
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const pending = model.open(candidate)
  model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' })
  model.beginOperation(eventFor(pending, candidate, 'update_main', { checks: checks(['leaseSatisfied', 'provenanceSatisfied']) }))
  assert.equal(model.recordOutcome({ operationId: 'operation-1', idempotencyKey: 'idem-1', outcome: 'confirmed_no_mutation' }).state, 'approved')
  const second = model.beginOperation(eventFor(pending, candidate, 'update_main', { operationId: 'operation-2', idempotencyKey: null, checks: checks(['leaseSatisfied', 'provenanceSatisfied']) }))
  assert.equal(second.state, 'executing')
  assert.equal(model.recordOutcome({ operationId: 'operation-2', idempotencyKey: null, outcome: 'applied' }).state, 'consumed')
})

test('Tier C preflight uses only retained display bindings after full identities are supplied', () => {
  const candidate = tierCScope({
    source: { kind: 'artifact', canonicalId: 'sha256:full-host-only-digest', displayFingerprint: 'candidate-7f3a', verification: 'verified' },
    targetSet: { kind: 'git_refs', canonicalIds: ['refs/heads/main@host-evidence'], displayExpectedVersions: ['main@display-1'], targetCount: 1 },
    impact: { ...tierCScope().impact, affectedCount: 1 }
  })
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const pending = model.open(candidate)
  model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' })
  const preflight = eventFor(pending, candidate, 'update_main', {
    observedSource: pending.scope.source,
    observedTargetSet: pending.scope.targetSet,
    observedImpact: pending.scope.impact,
    observedRollback: pending.scope.rollback,
    checks: checks(['leaseSatisfied', 'provenanceSatisfied'])
  })
  assert.equal(Object.hasOwn(preflight.observedSource, 'canonicalId'), false)
  assert.equal(Object.hasOwn(preflight.observedTargetSet, 'canonicalIds'), false)
  assert.equal(model.beginOperation(preflight).state, 'executing')
})

test('reconciliation follows tier transitions and unknown outcomes block further events', () => {
  const candidate = scope()
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const pending = model.open(candidate)
  model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' })
  model.beginOperation(eventFor(pending, candidate, 'run_local_test'))
  assert.equal(model.recordOutcome({ operationId: 'operation-1', idempotencyKey: 'idem-1', outcome: 'unknown' }).state, 'reconciling')
  assert.throws(() => model.beginOperation(eventFor(pending, candidate, 'run_local_test', { operationId: 'operation-2' })), TypeError)
  assert.equal(model.recordReconciliation({ operationId: 'operation-1', idempotencyKey: 'idem-1', outcome: 'confirmed_no_mutation' }).state, 'approved')
})

test('preflight rejects drift and check mismatches, invalidating scope crossings', () => {
  const candidate = scope()
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const pending = model.open(candidate)
  model.recordDecision({ taskId: 'task-1', proposalId: pending.proposalId, decision: 'approved' })
  assert.throws(() => model.beginOperation(eventFor(pending, candidate, 'run_local_test', { paths: ['C:/outside'] })), TypeError)
  assert.equal(model.snapshot().state, 'invalidated')
  assert.equal(model.snapshot().invalidatedReason, 'scope_drift')

  const fresh = scope({ allowedActions: ['create_fresh_fixture'], outputRoots: ['C:/approved-output'], freshResources: { branches: [], worktrees: [], fixtureRoots: ['C:/approved-output/fixture'], requireAbsent: true, requireIsolated: true } })
  const freshModel = policy.createTaskProposalModel({ taskId: 'task-1' })
  const freshPending = freshModel.open(fresh)
  freshModel.recordDecision({ taskId: 'task-1', proposalId: freshPending.proposalId, decision: 'approved' })
  assert.throws(() => freshModel.beginOperation(eventFor(freshPending, fresh, 'create_fresh_fixture', { checks: checks(['targetAbsent', 'isolatedTarget', 'parentBoundaryStable']) })), TypeError)
  assert.equal(freshModel.snapshot().state, 'approved')
})

test('snapshots are defensive and expose neither decision material nor authority surface', () => {
  assert.deepEqual(Object.keys(policy).sort(), ['classifyRisk', 'createTaskProposalModel'])
  const candidate = tierCScope({ source: { kind: 'artifact', canonicalId: 'sha256:full-secret-digest', displayFingerprint: 'candidate-7f3a', verification: 'verified' } })
  const model = policy.createTaskProposalModel({ taskId: 'task-1' })
  const snapshot = model.open(candidate)
  snapshot.scope.purpose = 'tampered'
  assert.equal(model.snapshot().scope.purpose, 'Constrained local change')
  assert.equal(JSON.stringify(model.snapshot()).includes('full-secret-digest'), false)
  assert.equal(Object.hasOwn(model, 'hydrate'), false)
  assert.equal(Object.hasOwn(model, 'restore'), false)
  assert.equal(policy.createTaskProposalModel({ taskId: 'task-1' }).snapshot(), null)
})
