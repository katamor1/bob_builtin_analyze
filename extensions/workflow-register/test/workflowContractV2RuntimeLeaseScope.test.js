const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR1, privateModule, runForProvenance, tempWorkspace } = require('./workflowContractV2RunPlanTestSupport')
const subject = () => privateModule('core/contractV2/runPlanLeaseContext')

test('R1_closed_scope_blocks_detached_work', async t => {
  const c = subject(); assert.equal(typeof c.runWithWorkflowContractV2PlanLease, 'function')
  const root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(); let releaseDetached, detached, writes = 0, run
  const store = new (privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore)({ workspaceRoot: root, durabilityFault: () => { writes++ } })
  await c.runWithWorkflowContractV2PlanLease(lease, async () => {
    assert.strictEqual(c.currentWorkflowContractV2PlanLease(), lease)
    run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run)
    const before = writes
    detached = new Promise(resolve => { releaseDetached = resolve }).then(async () => {
      assert.equal(lease.released, false, 'retained lease must still be live when testing closed scope')
      assert.equal(c.currentWorkflowContractV2PlanLease(), undefined)
      await assert.rejects(store.saveRun(run), /context|scope/i); assert.equal(writes, before)
      await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, () => { throw Error('must not run') }), /closed/i)
    })
  })
  assert.equal(lease.released, false); assert.equal(c.currentWorkflowContractV2PlanLease(), undefined)
  releaseDetached(); await detached
  c.releaseWorkflowContractV2RunPlanLease(root, run.runId); assert.equal(lease.released, true)
})

test('R1_same_lease_nesting_keeps_outer_and_conflict_releases_only_new', async () => {
  const c = subject(), f = await fixtureR1(), outer = await f.acquire(), other = await f.acquire()
  await c.runWithWorkflowContractV2PlanLease(outer, async () => {
    await c.runWithWorkflowContractV2PlanLease(outer, () => { assert.strictEqual(c.currentWorkflowContractV2PlanLease(), outer) })
    assert.equal(outer.released, false)
    await assert.rejects(c.runWithWorkflowContractV2PlanLease(other, () => { throw Error('must not run') }), /conflict|different/i)
    assert.equal(other.released, true); assert.equal(outer.released, false)
  })
  assert.equal(outer.released, true)
})

test('R1_concurrent_scopes_isolate_exact_leases_and_preserve_other_owner', async () => {
  const c = subject(), f = await fixtureR1(), a = await f.acquire(), b = await f.acquire()
  let unlock; const barrier = new Promise(resolve => { unlock = resolve })
  const left = c.runWithWorkflowContractV2PlanLease(a, async () => { await barrier; assert.strictEqual(c.currentWorkflowContractV2PlanLease(), a) })
  const right = c.runWithWorkflowContractV2PlanLease(b, async () => { assert.strictEqual(c.currentWorkflowContractV2PlanLease(), b); unlock(); await barrier; assert.strictEqual(c.currentWorkflowContractV2PlanLease(), b) })
  await Promise.all([left, right]); assert.equal(a.released, true); assert.equal(b.released, true)
})

test('R1_provenance_matches_every_exact_live_handle_field', async () => {
  const c = subject(), f = await fixtureR1(), lease = await f.acquire()
  await c.runWithWorkflowContractV2PlanLease(lease, () => {
    const dto = c.createWorkflowContractV2RunPlanProvenance(lease)
    assert.equal(dto.providerExactBindings[0].exactVersion, '1.2.3'); assert.deepEqual(dto.bobProfileBinding.taskCapabilities, ['task.sendMessage'])
    c.assertWorkflowContractV2RunPlanProvenanceMatchesLease(dto, lease)
    for (const key of ['generation', 'planDigest', 'packageDigest', 'lockfileDigest', 'environmentDigest']) assert.throws(() => c.assertWorkflowContractV2RunPlanProvenanceMatchesLease({ ...dto, [key]: 'sha256:' + '0'.repeat(64) }, lease), /provenance|match/i)
    const provider = structuredClone(dto); provider.providerExactBindings[0].exactVersion = '1.2.4'; assert.throws(() => c.assertWorkflowContractV2RunPlanProvenanceMatchesLease(provider, lease), /provenance|match/i)
    const bob = structuredClone(dto); bob.bobProfileBinding.requiredCapabilities = []; bob.bobProfileBinding.taskCapabilities = []; assert.throws(() => c.assertWorkflowContractV2RunPlanProvenanceMatchesLease(bob, lease), /provenance|match/i)
  })
})

test('R1_one_lease_cannot_adopt_another_workspace_or_run', async () => {
  const c = subject(), f = await fixtureR1(), lease = await f.acquire()
  await c.runWithWorkflowContractV2PlanLease(lease, () => {
    const run = runForProvenance(c.createWorkflowContractV2RunPlanProvenance(lease)); c.bindWorkflowContractV2RunPlanLease(run, lease)
    c.prepareWorkflowContractV2RunPlanLeaseForWrite('/workspace', run); c.adoptWorkflowContractV2RunPlanLease('/workspace', run)
    assert.strictEqual(c.requireWorkflowContractV2RunPlanLease('/workspace/.', run), lease)
    assert.throws(() => c.prepareWorkflowContractV2RunPlanLeaseForWrite('/another', run), /owner|workspace|conflict/i)
    assert.throws(() => c.bindWorkflowContractV2RunPlanLease({ ...run, runId: 'different' }, lease), /owner|run|conflict/i)
  })
  assert.equal(lease.released, false); c.releaseWorkflowContractV2RunPlanLease('/workspace', 'r1'); assert.equal(lease.released, true)
})

test('R1_private_boundary_never_falls_back_after_a_V2_acquisition', async () => {
  const execute = privateModule('workflowContractV2RuntimeBoundary').executeWorkflowContractV2RuntimeBoundary
  assert.equal(typeof execute, 'function'); const f = await fixtureR1(), lease = await f.acquire(); let legacy = 0
  await assert.rejects(execute({ acquireLease: async () => lease, executeLegacy: async () => { legacy++ } }), /compiled|executor/i)
  assert.equal(lease.released, true); assert.equal(legacy, 0)
  assert.equal(await execute({ acquireLease: async () => undefined, executeLegacy: async () => { legacy++; return 'legacy' } }), 'legacy'); assert.equal(legacy, 1)
})
