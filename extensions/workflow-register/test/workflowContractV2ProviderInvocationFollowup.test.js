'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, validation } = require('./workflowContractV2ProviderInvocationTestSupport')
const retry = { mode: 'restart-step', maxAttempts: 2, retainCommittedOutputs: false, allowArtifactReuse: false }

test('R2_snapshot_dispatch_and_retry_identity', async t => {
  requireR2()
  await t.test('all nine bound effect and idempotency combinations have closed frozen ABI', async t => {
    for (const sideEffect of ['none', 'workspace-write', 'external']) for (const idempotency of ['idempotent', 'key-required', 'non-idempotent']) {
      let seen; const f = await fixtureR2(t, { sideEffect, idempotency, dispatch(input) { seen = input; return {} } })
      await f.withScope(async () => { assert.equal((await invoke(f, f.createAttempt())).ok, true) })
      assert.deepEqual(Object.keys(seen).sort(), ['effect', 'idempotency', 'signal', 'value'])
      for (const v of [seen, seen.effect, seen.idempotency]) assert.equal(Object.isFrozen(v), true)
      assert.equal(Object.isFrozen(seen.signal), false); assert.equal(seen.effect.kind, sideEffect); assert.equal(seen.idempotency.mode, idempotency)
      assert.deepEqual(Object.keys(seen.effect).sort(), sideEffect === 'workspace-write' ? ['artifacts', 'kind'] : ['kind'])
      if (sideEffect === 'workspace-write') { assert.deepEqual(Object.keys(seen.effect.artifacts), ['writeArtifact']); assert.equal(Object.isFrozen(seen.effect.artifacts), true) }
      if (idempotency === 'key-required') assert.match(seen.idempotency.key, /^sha256:[a-f0-9]{64}$/)
      else assert.deepEqual(Object.keys(seen.idempotency), ['mode'])
    }
  })
  await t.test('dispose and re-register cannot replace captured dispatch', async t => {
    let old = 0, replacement = 0
    const f = await fixtureR2(t, { dispatch() { old++; return {} } })
    f.registration.dispose()
    const evidence = f.catalog.evidence.providers[0], contract = { ...evidence, dispatch() { replacement++; return {} } }; delete contract.contractDigest
    f.registry.register({ sourceId: 'replacement', contract })
    await f.withScope(async () => { assert.equal((await invoke(f, f.createAttempt())).ok, true) })
    assert.equal(old, 1); assert.equal(replacement, 0); assert.equal(f.counters.dispatch, 1)
  })
  await t.test('manual retry preserves input digest and runtime key and stops at policy limit', async t => {
    for (const idempotency of ['idempotent', 'key-required']) {
      const inputs = [], f = await fixtureR2(t, { idempotency, resumePolicy: retry, dispatch(input) { inputs.push(input); throw { reason: 'retry' } } })
      await f.withScope(async () => { const attempt = f.createAttempt(); for (let i = 0; i < 2; i++) assert.equal((await invoke(f, attempt, { value: { a: 1 } })).failure, 'provider-error'); await assert.rejects(invoke(f, attempt, { value: { a: 1 } }), TypeError) })
      assert.equal(f.counters.dispatch, 2); assert.deepEqual(inputs[0].idempotency, inputs[1].idempotency)
    }
    const f = await fixtureR2(t, { idempotency: 'key-required', resumePolicy: retry, dispatch() { throw {} } })
    await f.withScope(async () => { const attempt = f.createAttempt(); await invoke(f, attempt); await assert.rejects(invoke(f, attempt, { value: { changed: true } }), TypeError); assert.equal(f.counters.dispatch, 1) })
  })
  await t.test('non-idempotent, fail-closed, accepted and invalid error outcomes are terminal', async t => {
    for (const options of [{ idempotency: 'non-idempotent', resumePolicy: retry, dispatch() { throw {} } }, { dispatch() { throw {} } }, { resumePolicy: retry }, { resumePolicy: retry, dispatch() { throw Error('ambiguous') } }]) {
      const f = await fixtureR2(t, options)
      await f.withScope(async () => { const attempt = f.createAttempt(), r = await invoke(f, attempt); if (options.dispatch && !options.idempotency && options.resumePolicy) validation(r, 'WF2_PROVIDER_ERROR_INVALID'); await assert.rejects(invoke(f, attempt), TypeError); assert.equal(f.counters.dispatch, 1) })
    }
  })
})
