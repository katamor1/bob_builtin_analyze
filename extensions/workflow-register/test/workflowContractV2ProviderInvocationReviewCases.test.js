'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, staging, deferred, privateModule } = require('./workflowContractV2ProviderInvocationTestSupport')

test('R2_closed_scope_and_concurrent_attempt_refusal', async t => {
  requireR2()
  await t.test('detached pending work cannot accept after the R1 scope closes', async t => {
    const gate = deferred(); let pending, attempt, writer
    const f = await fixtureR2(t, { sideEffect: 'workspace-write', dispatch({ effect }) { writer = effect.artifacts; return gate.promise } }), before = f.snapshotRunFiles()
    await f.withScope(() => { attempt = f.createAttempt(); pending = invoke(f, attempt); pending.catch(() => {}) })
    assert.equal(f.lease.released, false); gate.resolve({})
    await assert.rejects(pending, TypeError); assert.equal(f.counters.dispatch, 1)
    await assert.rejects(writer.writeArtifact({ id: 'artifact0', bytes: new Uint8Array([1]) })); assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), TypeError)
    await f.withScope(async () => { await assert.rejects(invoke(f, attempt), TypeError) })
    assert.deepEqual(f.snapshotRunFiles(), before)
  })
  await t.test('release, abort and changed run identity during await prohibit acceptance', async t => {
    for (const kind of ['release', 'abort', 'run-id', 'provenance']) {
      const gate = deferred(), controller = new AbortController()
      const f = await fixtureR2(t, { dispatch: () => gate.promise }), before = f.snapshotRunFiles()
      await f.withScope(async () => {
        const attempt = f.createAttempt(), pending = invoke(f, attempt, { signal: controller.signal })
        if (kind === 'release') privateModule('core/contractV2/runPlanLeaseContext').releaseWorkflowContractV2RunPlanLease(f.workspaceRoot, f.run.runId)
        if (kind === 'abort') controller.abort()
        if (kind === 'run-id') f.run.runId = 'different'
        if (kind === 'provenance') f.run.planProvenance = { ...f.run.planProvenance, planDigest: 'sha256:' + '0'.repeat(64) }
        gate.resolve({}); await assert.rejects(pending, kind === 'abort' ? { name: 'AbortError' } : TypeError)
        assert.throws(() => staging().readWorkflowAttemptStagedArtifacts(attempt), kind === 'abort' ? { name: 'AbortError' } : TypeError)
      })
      assert.equal(f.counters.dispatch, 1); assert.deepEqual(f.snapshotRunFiles(), before)
    }
  })
  await t.test('concurrent and reentrant invocations never duplicate dispatch or corrupt the first result', async t => {
    const gate = deferred(), f = await fixtureR2(t, { dispatch: () => gate.promise })
    await f.withScope(async () => {
      const attempt = f.createAttempt(), pending = invoke(f, attempt)
      await assert.rejects(invoke(f, attempt), TypeError); assert.equal(f.counters.dispatch, 1)
      gate.resolve({}); assert.equal((await pending).ok, true)
    })
    let g, attempt, reentrant
    g = await fixtureR2(t, { dispatch() { reentrant = invoke(g, attempt); reentrant.catch(() => {}); return {} } })
    await g.withScope(async () => { attempt = g.createAttempt(); assert.equal((await invoke(g, attempt)).ok, true); await assert.rejects(reentrant, TypeError); assert.equal(g.counters.dispatch, 1) })
  })
})
