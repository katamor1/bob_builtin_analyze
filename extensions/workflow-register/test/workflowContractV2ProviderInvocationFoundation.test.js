'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, staging, invoke, requireR2, privateModule } = require('./workflowContractV2ProviderInvocationTestSupport')

// Scenario: 'saved nonempty runtime lease is the sole attempt authority'
test('R2_authentic_retained_run_and_attempt_foundation', async t => {
  requireR2()

    const f = await fixtureR2(t), before = f.snapshotRunFiles()
    assert.ok(before.length > 0); assert.equal(f.lease.handle.plan.providerBindings.length, 1)
    assert.throws(() => f.createAttempt(), TypeError)
    await f.withScope(async () => {
      const attempt = f.createAttempt(); assert.equal(Object.isFrozen(attempt), true)
      assert.throws(() => f.createAttempt(), TypeError)
      assert.throws(() => f.createAttempt({ stepId: 'missing' }), TypeError)
      assert.throws(() => f.createAttempt({ run: { ...f.run, runId: 'other' } }), TypeError)
      assert.throws(() => f.createAttempt({ workspaceRoot: f.workspaceRoot + '-other' }), TypeError)
      for (const attemptId of ['', 'x'.repeat(129), 'bad/path']) assert.throws(() => f.createAttempt({ attemptId }), TypeError)
      for (const lease of [{ ...f.lease }, f.lease.handle, {}, new Proxy(f.lease, {})]) await assert.rejects(invoke(f, attempt, { lease }), TypeError)
      for (const forged of [{ ...attempt }, {}, new Proxy(attempt, {})]) await assert.rejects(invoke(f, forged), TypeError)
      await assert.rejects(invoke(f, attempt, { stepId: 'other' }), TypeError)
      assert.equal(f.counters.dispatch, 0)
      assert.equal((await invoke(f, attempt)).ok, true)
    })
    assert.deepEqual(f.snapshotRunFiles(), before); assert.equal(f.lease.released, false)
  })

// Scenario: 'equal public digests from a separate compiler environment do not grant authority'
test('equal public digests from a separate compiler environment do not grant authority', async t => {
  requireR2()

    const a = await fixtureR2(t), b = await fixtureR2(t)
    assert.equal(a.lease.planDigest, b.lease.planDigest); assert.notStrictEqual(a.environment, b.environment)
    await a.withScope(async () => { const attempt = a.createAttempt(); await assert.rejects(invoke(a, attempt, { lease: b.lease }), TypeError); assert.equal(a.counters.dispatch, 0) })
  })

// Scenario: 'released or downgraded run evidence cannot invoke'
test('released or downgraded run evidence cannot invoke', async t => {
  requireR2()

    const f = await fixtureR2(t)
    await f.withScope(async () => {
      const attempt = f.createAttempt(); delete f.run.planProvenance
      await assert.rejects(invoke(f, attempt), TypeError); assert.equal(f.counters.dispatch, 0)
    })
    const g = await fixtureR2(t); let attempt
    await g.withScope(() => { attempt = g.createAttempt() })
    privateModule('core/contractV2/runPlanLeaseContext').releaseWorkflowContractV2RunPlanLease(g.workspaceRoot, g.run.runId)
    await assert.rejects(invoke(g, attempt), TypeError); assert.equal(g.counters.dispatch, 0)
  })

// Scenario: 'closed wrappers refuse traps, accessors, extra fields and signal lookalikes'
test('closed wrappers refuse traps, accessors, extra fields and signal lookalikes', async t => {
  requireR2()

    const f = await fixtureR2(t); let traps = 0
    await f.withScope(async () => {
      const base = { workspaceRoot: f.workspaceRoot, run: f.run, stepId: f.stepId, attemptId: f.attemptId }
      for (const input of [{ ...base, extra: true }, { ...base, [Symbol()]: 1 }, Object.defineProperty({ ...base }, 'run', { get() { traps++; return f.run } }), new Proxy(base, { ownKeys() { traps++; return [] } })]) assert.throws(() => staging().createWorkflowAttemptStaging(input), TypeError)
      const attempt = f.createAttempt()
      for (const signal of [undefined, null, { aborted: false }, new Proxy(f.signal, {})]) await assert.rejects(invoke(f, attempt, { signal }), TypeError)
      const call = { lease: f.lease, stepId: f.stepId, value: {}, signal: f.signal, attempt }
      const api = privateModule('core/contractV2/providerInvocation').invokeCompiledWorkflowProvider
      for (const input of [{ ...call, key: 'caller-key' }, { ...call, [Symbol()]: 1 }, Object.defineProperty({ ...call }, 'value', { get() { traps++; return {} } }), new Proxy(call, { ownKeys() { traps++; return [] } })]) await assert.rejects(api(input), TypeError)
      assert.equal(traps, 0); assert.equal(f.counters.dispatch, 0); assert.equal(Object.isFrozen(f.signal), false)
    })
  })
