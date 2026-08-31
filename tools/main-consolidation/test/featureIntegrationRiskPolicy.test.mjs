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
    observedSource: proposalScope.source,
    observedTargetSet: proposalScope.targetSet,
    observedImpact: proposalScope.impact,
    observedRollback: proposalScope.rollback,
    checks: checks(),
    ...structuredClone(overrides)
  }
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
  model.beginOperation(eventFor(pending, candidate, 'update_main', { checks: checks(['leaseSatisfied']) }))
  assert.equal(model.recordOutcome({ operationId: 'operation-1', idempotencyKey: 'idem-1', outcome: 'confirmed_no_mutation' }).state, 'approved')
  const second = model.beginOperation(eventFor(pending, candidate, 'update_main', { operationId: 'operation-2', idempotencyKey: null, checks: checks(['leaseSatisfied']) }))
  assert.equal(second.state, 'executing')
  assert.equal(model.recordOutcome({ operationId: 'operation-2', idempotencyKey: null, outcome: 'applied' }).state, 'consumed')
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
