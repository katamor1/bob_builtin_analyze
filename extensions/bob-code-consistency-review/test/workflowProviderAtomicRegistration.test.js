const assert = require('node:assert/strict'), { test } = require('node:test')
const { kind, id, installed, manifest, completeApi, environment, tick } = require('./providerRegistryBridgeTestSupport')
for (const mutation of ['missing-version', 'missing-negotiate', 'missing-register', 'wrong-version', 'wrong-result', 'throw']) {
  test('atomic bridge refuses incompatible host ' + mutation + ' before any registration', async t => {
    const { api, calls } = completeApi()
    let legacy = 0; api.registerActionProvider = () => { legacy++; return { dispose() {} } }
    if (mutation === 'missing-version') delete api.apiVersion
    if (mutation === 'missing-negotiate') delete api.negotiateProviderRegistry
    if (mutation === 'missing-register') delete api.registerContributionSet
    if (mutation === 'wrong-version') api.apiVersion = 'provider-registry/v2'
    if (mutation === 'wrong-result') api.negotiateProviderRegistry = () => 'provider-registry/v2'
    if (mutation === 'throw') api.negotiateProviderRegistry = () => { throw Error('unsupported') }
    t.mock.method(console, 'warn', () => {})
    const e = environment(api); t.after(e.stop)
    try { await e.register() } catch (error) { assert.equal(error.message, 'unsupported') }
    assert.equal(calls.length, 0); assert.equal(legacy, 0)
  })
}
for (const mismatch of ['id', 'version', 'root']) {
  test('atomic bridge rejects installed context ' + mismatch + ' mismatch without publication', async t => {
    const { api, calls } = completeApi(), e = environment(api); t.after(e.stop); t.mock.method(console, 'warn', () => {})
    e.context.extension = { ...installed, packageJSON: { ...installed.packageJSON } }
    if (mismatch === 'id') e.context.extension.id = 'fixture.wrong'
    if (mismatch === 'version') e.context.extension.packageJSON.version = '99.0.0'
    if (mismatch === 'root') e.context.extensionPath += '-wrong'
    try { await e.register() } catch (error) { assert(error instanceof Error) }
    assert.equal(calls.length, 0)
  })
}
test('atomic bridge publishes all declared actions once with one owned disposable and preserved handler ABI', async t => {
  let disposed = 0
  const { api, calls } = completeApi(() => ({ dispose() { disposed++ } })), e = environment(api); t.after(e.stop)
  const result = await e.register(); await tick()
  assert.equal(calls.length, 1)
  const [actual, provenance, handlers] = calls[0]
  assert.deepEqual(actual, manifest); assert.deepEqual(provenance, { id, version: installed.packageJSON.version, extensionRoot: installed.extensionPath })
  assert.deepEqual([...handlers.actionProviders.keys()].sort(), manifest.action_providers.map(row => row.id).sort())
  assert.equal(handlers.actionProviders.size, kind === 'bazaar' ? 11 : 16)
  assert.equal(handlers.preflightChecks.size, 0); assert.equal(handlers.resultSinks.size, 0)
  for (const provider of handlers.actionProviders.values()) assert.equal(provider.sourceId, id)
  const input = { args: { outDir: 'result' }, inputs: {}, state: {}, workflowRoot: 'fixture-root', runId: 'fixture-run' }
  const actionId = kind === 'bazaar' ? 'bobBazaar.collectReviewContext' : 'bobCodeConsistency.preprocess'
  const value = await handlers.actionProviders.get(actionId).execute(input)
  assert.deepEqual(value, { value: kind === 'bazaar' ? 'collectReviewContext' : actionId })
  assert.equal(e.calls.length, 1)
  if (kind === 'bazaar') assert.equal(e.calls[0].args[0], input)
  else { assert.equal(e.calls[0].args[0].outDir, 'result'); assert.equal(e.calls[0].args[0].workflowRoot, 'fixture-root'); assert.equal(e.calls[0].args[0].workflowRunId, 'fixture-run'); assert.equal(result.api, api); assert.equal(result.registrations.length, 1); result.registrations[0].dispose() }
  if (kind === 'bazaar') e.stop()
  assert.equal(disposed, 1)
})
test('atomic bridge never accepts a registration result without a disposable', async t => {
  const { api, calls } = completeApi(() => undefined), e = environment(api); t.after(e.stop)
  const errors = []; t.mock.method(console, 'warn', (...args) => errors.push(args))
  if (kind === 'bazaar') { await e.register(); assert.equal(errors.length, 1) }
  else await assert.rejects(e.register(), /disposable/i)
  assert.equal(calls.length, 1)
})

test('native root casing follows platform path identity and retains native provenance', async t => {
  const { api, calls } = completeApi(), e = environment(api); t.after(e.stop); t.mock.method(console, 'warn', () => {})
  const nativeRoot = installed.extensionPath
  const alternate = process.platform === 'win32' ? nativeRoot[0].toLowerCase() + nativeRoot.slice(1) : nativeRoot.toUpperCase()
  assert.notEqual(alternate, nativeRoot)
  e.context.extension = { ...installed, extensionPath: alternate }
  e.context.extensionPath = alternate
  try { const result = await e.register(); if (result?.registered) for (const registration of result.registrations) registration.dispose() } catch (error) { assert(error instanceof Error) }
  assert.equal(calls.length, process.platform === 'win32' ? 1 : 0)
  if (calls.length) assert.equal(calls[0][1].extensionRoot, nativeRoot)
})
