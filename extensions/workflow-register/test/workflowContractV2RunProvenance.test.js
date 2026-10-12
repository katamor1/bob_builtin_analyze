const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path')
const { test } = require('node:test')
const { fixtureR1, privateModule, tempWorkspace } = require('./workflowContractV2RunPlanTestSupport')
const context = () => privateModule('core/contractV2/runPlanLeaseContext')
const Store = () => privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore
const snapshot = (root, runId) => { const dir = path.join(root, '.bob/workflows/runs', runId); return fs.readdirSync(dir).sort().map(file => [file, fs.readFileSync(path.join(dir, file)).toString('hex')]) }

test('R1_exact_provenance_and_stale_write_checks', async t => {
  const c = context(), Cls = Store(); assert.equal(typeof Cls, 'function')
  const root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), store = new Cls({ workspaceRoot: root })
  const owner = require('../out/core/runStateStore').FileRunStateStore.prototype, original = owner.createRun; let shell, allocatedInputs
  owner.createRun = async function(workflow, inputs) { shell = await original.call(this, workflow, inputs); allocatedInputs = shell.inputs; return shell }; t.after(() => { owner.createRun = original })
  const inputs = { nested: { value: 'before' } }; let run
  await c.runWithWorkflowContractV2PlanLease(lease, async () => {
    run = await store.createRunFromPlanLease(f.coreWorkflow, lease, inputs)
    assert.strictEqual(run, shell); assert.strictEqual(run.inputs, allocatedInputs); assert.notStrictEqual(run.inputs, inputs)
    inputs.nested.value = 'after'; assert.equal(run.inputs.nested.value, 'before')
    assert.equal(run.workflowSchemaVersion, 'workflow-register/v2'); assert.equal(run.planProvenance.providerExactBindings[0].exactVersion, '1.2.3')
    await store.saveRun(run); f.entrypoint.invalidateSlot(f.slot); assert.equal(lease.released, false)
    const one = await store.loadRun(run.runId), two = await store.loadRun(run.runId); assert.notStrictEqual(one, two)
    one.state.updated = 'first'; await store.saveRun(one); two.state.updated = 'stale'
    await assert.rejects(store.saveRun(two), /stale revision|changed since/)
  })
  assert.equal(f.counters.dispatch, 0); assert.equal(f.counters.generation, 0)
  await assert.rejects(store.loadRun(run.runId), /lease|context/i)
  console.log('R1_PROVENANCE_FIXTURE_BASE64=' + require('../out/core/contractV2/canonicalJson').canonicalJsonBytes(run.planProvenance).toString('base64'))
})

test('R1_same_target_creations_keep_current_owner_stale_revision', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), store = new (Store())({ workspaceRoot: root, now: () => '2026-10-12T00:00:00.000Z' })
  await c.runWithWorkflowContractV2PlanLease(lease, async () => {
    const crypto = require('node:crypto'), uuid = crypto.randomUUID; let a, b
    try { crypto.randomUUID = () => '00112233-4455-6677-8899-aabbccddeeff'; a = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); b = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}) } finally { crypto.randomUUID = uuid }
    assert.equal(a.runId, b.runId); assert.notStrictEqual(a, b); await store.saveRun(a)
    await assert.rejects(store.saveRun(b), /stale revision|changed since/)
  })
})

test('R1_first_save_failure_releases_and_unleased_journal_never_recovers', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(); let run
  const store = new (Store())({ workspaceRoot: root, durabilityFault: stage => { if (stage === 'afterJournal') throw Error('first save') } })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run) }), /first save/)
  assert.equal(lease.released, true); const before = snapshot(root, run.runId)
  await assert.rejects(new (Store())({ workspaceRoot: root }).loadRun(run.runId), /lease|context/i)
  assert.deepEqual(snapshot(root, run.runId), before); assert.equal(f.counters.generation, 0); assert.equal(f.counters.dispatch, 0)
})

test('R1_post_save_failure_removes_adoption_and_public_guard_stays_closed', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), Base = Store(); let run
  class Failing extends Base { async saveRun(value) { await super.saveRun(value); throw Error('post save') } }
  const store = new Failing({ workspaceRoot: root })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run) }), /post save/)
  assert.equal(lease.released, true); assert.equal(c.bindAvailableWorkflowContractV2RunPlanLease(root, run), undefined)
  const guarded = new (require('../out/workflowContractV2RunStateStore').ContractV2GuardedRunStateStore)({ workspaceRoot: root })
  await assert.rejects(guarded.loadRun(run.runId), error => error.name === 'WorkflowContractV2BoundaryError')
})

test('R1_unauthenticated_core_view_rejects_before_owner_allocation', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(); let allocations = 0
  const store = new (Store())({ workspaceRoot: root, now() { allocations++; return '2026-10-12T00:00:00.000Z' } })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, () => store.createRunFromPlanLease({ ...f.coreWorkflow }, lease, {})), /authentic|view/i)
  assert.equal(allocations, 0); assert.equal(lease.released, true)
})
