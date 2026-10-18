'use strict'
const assert = require('node:assert/strict')
const { test } = require('node:test')
const { fixtureR2, invoke, requireR2, validation, privateModule } = require('./workflowContractV2ProviderInvocationTestSupport')

// Scenario: 'captured bridge preserves this, synchronous return and promise identity'
test('R2_compiled_input_output_error_contract', async t => {
  requireR2()

    const bridge = privateModule('core/contractV2/providerRegistry').invokeBoundWorkflowProviderDispatch
    assert.equal(typeof bridge, 'function')
    for (const result of [{ answer: 42 }, Promise.resolve({ answer: 42 })]) {
      let receiver = 'unset', inputSeen
      const f = await fixtureR2(t, { dispatch: function (input) { receiver = this; inputSeen = input; return result } })
      const state = privateModule('core/contractV2/compiledPlan').requireCompiledWorkflowPlanState(f.lease.handle)
      const input = { value: {}, signal: f.signal, idempotency: { mode: 'idempotent' }, effect: { kind: 'none' } }
      assert.strictEqual(bridge(state.providers[0].dispatchHandle, input), result)
      assert.strictEqual(receiver, undefined); assert.strictEqual(f.counters.receiver, undefined); assert.strictEqual(inputSeen, input); assert.equal(f.counters.dispatch, 1)
      assert.throws(() => bridge({}, input), TypeError); assert.equal(f.counters.dispatch, 1)
    }
  })

// Scenario: 'input snapshot and validated output never modify persisted run data'
test('input snapshot and validated output never modify persisted run data', async t => {
  requireR2()

    let seen; const source = { nested: { n: 1 } }, output = { answer: 42 }
    const f = await fixtureR2(t, { dispatch(input) { seen = input.value; return output } }), before = f.snapshotRunFiles()
    await f.withScope(async () => {
      const result = await invoke(f, f.createAttempt(), { value: source })
      assert.equal(result.ok, true); assert.equal(result.output.kind, 'value'); assert.notStrictEqual(result.output.value, output)
      assert.notStrictEqual(seen, source); assert.equal(Object.isFrozen(seen.nested), true)
      source.nested.n = 2; output.answer = 0; assert.equal(seen.nested.n, 1); assert.equal(result.output.value.answer, 42)
      assert.equal(Object.isFrozen(result.output), true); assert.equal(Object.isFrozen(result.output.value), true)
    })
    assert.deepEqual(f.snapshotRunFiles(), before); assert.equal(f.run.status, 'running'); assert.equal(f.counters.dispatch, 1)
  })

// Scenario: 'schema-invalid input never dispatches and terminal validation blocks reuse'
test('schema-invalid input never dispatches and terminal validation blocks reuse', async t => {
  requireR2()

    const f = await fixtureR2(t, { inputSchema: { type: 'object', required: ['n'], properties: { n: { type: 'integer' } }, additionalProperties: false } })
    await f.withScope(async () => { const attempt = f.createAttempt(); validation(await invoke(f, attempt), 'WF2_PROVIDER_INPUT_INVALID'); await assert.rejects(invoke(f, attempt, { value: { n: 1 } }), TypeError); assert.equal(f.counters.dispatch, 0) })
  })

// Scenario: 'unit accepts exactly undefined and value uses the compiled schema and byte cap'
test('unit accepts exactly undefined and value uses the compiled schema and byte cap', async t => {
  requireR2()

    for (const value of [undefined, null, true, 0, '', [], {}]) {
      const f = await fixtureR2(t, { outputKind: 'unit', dispatch: () => value })
      await f.withScope(async () => { const r = await invoke(f, f.createAttempt()); if (value === undefined) assert.deepEqual(r.output, { kind: 'unit' }); else validation(r, 'WF2_PROVIDER_OUTPUT_INVALID') })
    }
    for (const [value, valid] of [['abc', true], ['abcd', false], [42, false]]) {
      const f = await fixtureR2(t, { outputSchema: { type: 'string' }, maxBytes: 5, dispatch: () => value })
      await f.withScope(async () => { const attempt = f.createAttempt(), r = await invoke(f, attempt); if (valid) assert.equal(r.ok, true); else validation(r, 'WF2_PROVIDER_OUTPUT_INVALID'); await assert.rejects(invoke(f, attempt), TypeError) })
    }
  })

// Scenario: 'raw thrown or rejected JSON is typed; exotic errors are redacted'
test('raw thrown or rejected JSON is typed; exotic errors are redacted', async t => {
  requireR2()

    for (const rejected of [false, true]) for (const error of [{ reason: 'allowed' }, new Error('secret C:/private/token'), { secret: 'bad', toJSON() { throw Error('must never execute') } }]) {
      const f = await fixtureR2(t, { errorSchema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } }, additionalProperties: false }, dispatch() { if (rejected) return Promise.reject(error); throw error } })
      await f.withScope(async () => { const r = await invoke(f, f.createAttempt()); if (error.reason) { assert.equal(r.failure, 'provider-error'); assert.notStrictEqual(r.error, error); assert.equal(r.error.reason, 'allowed'); assert.equal(Object.isFrozen(r.error), true) } else { validation(r, 'WF2_PROVIDER_ERROR_INVALID'); assert.doesNotMatch(JSON.stringify(r), /secret|private|token|stack|must never/); assert.equal(r.diagnostics[0].location.path, 'workflow.yaml') } })
      assert.equal(f.counters.dispatch, 1)
    }
  })
