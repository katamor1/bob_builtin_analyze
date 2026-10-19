const assert = require('node:assert/strict'), { test } = require('node:test')
const { api, installed, manifest, handlers, errorCode } = require('./contributionTestSupport')
function prepare(m = manifest(), h = handlers()) { return api('contributionRegistration').prepareContributionSet(m, installed(), h) }
test('prepared handlers are detached from mutable maps without executing callbacks', async () => {
  const calls = [], h = handlers(calls), m = manifest(), prepared = prepare(m, h)
  const data = api('contributionRegistration').readPreparedContributionSet(prepared)
  assert.equal(Object.isFrozen(prepared), true); assert.equal(Object.isFrozen(data.actionProviders), true)
  h.actionProviders.clear(); h.preflightChecks.clear(); h.resultSinks.clear(); h.agentProvider.run = () => 'changed'; m.owner.version = '9.0.0'
  assert.deepEqual(calls, []); assert.equal(data.manifest.owner.version, '1.2.3'); assert.equal(data.actionProviders.length, 1)
  assert.equal(data.actionProviders[0].execute({ inputs: {}, args: {} }), 'action-value')
  assert.equal(data.agentProvider.run({}), 'agent-value'); assert.deepEqual(calls, ['action', 'agent'])
})
test('forged prepared values never pass the internal registration brand', () => {
  const { readPreparedContributionSet } = api('contributionRegistration')
  assert.throws(() => readPreparedContributionSet(Object.freeze({})), errorCode('contribution.handlers.invalid'))
})
for (const [name, change] of [
  ['missing late handler', h => h.resultSinks.delete('fixture.sink')],
  ['extra handler', h => h.actionProviders.set('extra.action', { id: 'extra.action', execute() {} })],
  ['wrong action id', h => { h.actionProviders.get('fixture.action').id = 'wrong.id' }],
  ['wrong source owner', h => { h.actionProviders.get('fixture.action').sourceId = 'local.other' }],
  ['noncallable action', h => { h.actionProviders.get('fixture.action').execute = 1 }],
  ['noncallable preflight', h => h.preflightChecks.set('fixture.ready', 1)],
  ['noncallable sink', h => h.resultSinks.set('fixture.sink', 1)],
  ['missing agent', h => { delete h.agentProvider }],
  ['extra wrapper key', h => { h.unknown = 'SECRET' }],
  ['map subclass', h => { h.preflightChecks = new (class extends Map {})(h.preflightChecks) }]
]) test('handler preparation rejects ' + name + ' without modifying the inputs', () => {
  const h = handlers(); change(h); const before = [...h.actionProviders]
  assert.throws(() => prepare(manifest(), h), errorCode('contribution.handlers.invalid')); assert.deepEqual([...h.actionProviders], before)
})
test('descriptor-only handler preparation never invokes getters or proxy behavior', () => {
  const counters = { getter: 0, proxy: 0, handler: 0 }, variants = []
  const getter = handlers(); Object.defineProperty(getter.actionProviders.get('fixture.action'), 'execute', { enumerable: true, get() { counters.getter++; throw Error('SECRET') } }); variants.push(getter)
  const callable = handlers(); callable.preflightChecks.set('fixture.ready', new Proxy(() => { counters.handler++ }, { apply() { counters.proxy++; throw Error('SECRET') } })); variants.push(callable)
  const map = handlers(); map.resultSinks = new Proxy(map.resultSinks, { get() { counters.proxy++; throw Error('SECRET') } }); variants.push(map)
  for (const h of variants) assert.throws(() => prepare(manifest(), h), errorCode('contribution.handlers.invalid'))
  assert.deepEqual(counters, { getter: 0, proxy: 0, handler: 0 })
})
test('an undeclared agent is refused while an empty declared set is preparable', () => {
  const m = manifest(); delete m.agent_provider
  assert.throws(() => prepare(m, handlers()), errorCode('contribution.handlers.invalid'))
  for (const key of ['action_providers','preflight_checks','result_sinks','workflow_templates','schemas']) m[key] = []
  const h = { actionProviders: new Map(), preflightChecks: new Map(), resultSinks: new Map() }
  assert.equal(Object.isFrozen(prepare(m, h)), true)
})
