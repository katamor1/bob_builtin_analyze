const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR1, privateModule, tempWorkspace } = require('./workflowContractV2RunPlanTestSupport')
const context = () => privateModule('core/contractV2/runPlanLeaseContext')
const coordinate = (...args) => privateModule('core/contractV2/runLeaseExecutionCoordinator').coordinateWorkflowContractV2LeasedRunExecution(...args)

test('R1_terminal_release_follows_durable_hooks', async t => {
  const c = context(); assert.equal(typeof privateModule('core/contractV2/runLeaseExecutionCoordinator').coordinateWorkflowContractV2LeasedRunExecution, 'function')
  for (const status of ['completed', 'failed']) {
    const root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), Base = privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore
    let terminal = false, hooks = 0, run
    class Hooks extends Base { async saveRun(value) { await super.saveRun(value); if (terminal) { assert.equal(lease.released, false); hooks++ } } }
    const store = new Hooks({ workspaceRoot: root, durabilityFault: () => { assert.equal(lease.released, false) } })
    await c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run) })
    assert.equal(lease.released, false)
    await coordinate(store, run, 'terminal-' + status, async () => { terminal = true; const current = await store.loadRun(run.runId); current.status = status; await store.saveRun(current); assert.equal(lease.released, false); return { runId: 'unrelated', status: 'running' } })
    assert.equal(hooks, 1); assert.equal(lease.released, true)
  }
})

test('R1_nonterminal_durable_state_ignores_forged_terminal_return', async t => {
  const c = context()
  for (const status of ['running', 'paused', 'checkpoint', 'reviewing', 'held']) {
    const root = tempWorkspace(t), f = await fixtureR1(root), lease = await f.acquire(), store = new (privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore)({ workspaceRoot: root }); let run
    await c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); run.status = status; await store.saveRun(run) })
    await coordinate(store, run, 'fake-terminal', async () => ({ runId: run.runId, status: 'completed' }))
    assert.equal(lease.released, false, status); c.releaseWorkflowContractV2RunPlanLease(root, run.runId); assert.equal(lease.released, true)
  }
})

test('R1_overlapping_execution_uses_existing_single_flight_and_release_once', async t => {
  const c = context(), root = tempWorkspace(t), f = await fixtureR1(root); let releases = 0, run, operations = 0
  const lease = require('../out/core/contractV2/planLease').createWorkflowPlanLease({ handle: f.result.handle, onRelease() { releases++ } })
  const store = new (privateModule('workflowContractV2LeasedRunStateStore').ContractV2LeasedRunStateStore)({ workspaceRoot: root })
  await c.runWithWorkflowContractV2PlanLease(lease, async () => { run = await store.createRunFromPlanLease(f.coreWorkflow, lease, {}); await store.saveRun(run) })
  let finish; const barrier = new Promise(resolve => { finish = resolve })
  const operation = async () => { operations++; await barrier; const current = await store.loadRun(run.runId); current.status = 'completed'; await store.saveRun(current); return 'done' }
  const a = coordinate(store, run, 'same', operation), b = coordinate(store, run, 'same', operation); finish()
  assert.deepEqual(await Promise.all([a, b]), ['done', 'done']); assert.equal(operations, 1); assert.equal(releases, 1)
  c.releaseAllWorkflowContractV2RunPlanLeases(); assert.equal(releases, 1)
})
