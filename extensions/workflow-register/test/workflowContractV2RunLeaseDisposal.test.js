const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR1, privateModule, runForProvenance } = require('./workflowContractV2RunPlanTestSupport')
const context = () => privateModule('core/contractV2/runPlanLeaseContext')

test('R1_all_private_retained_leases_release_once', async () => {
  const c = context(); assert.equal(typeof c.releaseAllWorkflowContractV2RunPlanLeases, 'function')
  const f = await fixtureR1(), counts = [0, 0, 0], leases = []
  for (let index = 0; index < 3; index++) {
    // Genuine P5 callback instrumentation; no production lifecycle/Bob server claim.
    const lease = require('../out/core/contractV2/planLease').createWorkflowPlanLease({ handle: f.result.handle, onRelease() { counts[index]++; c.releaseAllWorkflowContractV2RunPlanLeases(); if (index === 0) throw Error('release failure') } }); leases.push(lease)
    await c.runWithWorkflowContractV2PlanLease(lease, () => {
      const run = { ...runForProvenance(c.createWorkflowContractV2RunPlanProvenance(lease)), runId: 'run-' + index }
      c.bindWorkflowContractV2RunPlanLease(run, lease); c.prepareWorkflowContractV2RunPlanLeaseForWrite('/workspace', run); c.adoptWorkflowContractV2RunPlanLease('/workspace', run)
    })
  }
  assert.throws(() => c.releaseAllWorkflowContractV2RunPlanLeases(), /release failure/)
  assert.deepEqual(counts, [1, 1, 1]); assert.ok(leases.every(lease => lease.released))
  c.releaseAllWorkflowContractV2RunPlanLeases(); assert.deepEqual(counts, [1, 1, 1])
})

test('R1_operation_error_precedes_release_error_after_all_cleanup', async () => {
  const c = context(), f = await fixtureR1(), original = Error('operation first'); let releases = 0
  const lease = require('../out/core/contractV2/planLease').createWorkflowPlanLease({ handle: f.result.handle, onRelease() { releases++; throw Error('cleanup later') } })
  await assert.rejects(c.runWithWorkflowContractV2PlanLease(lease, () => { throw original }), error => error === original)
  assert.equal(releases, 1); assert.equal(lease.released, true); c.releaseAllWorkflowContractV2RunPlanLeases()
})
