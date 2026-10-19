const assert = require('node:assert/strict'), path = require('node:path'), { test } = require('node:test')
const bazaar = require('../../bob-bazaar-review/test/providerRegistryBridgeTestSupport')
const consistency = require('../../bob-code-consistency-review/test/providerRegistryBridgeTestSupport')
const { ActionRegistry } = require('../out/core/actionRegistry')
const { ProviderRegistryHost } = require('../out/api/providerRegistryApi')
const { registerWorkflowRegisterBuiltInContributions } = require('../out/builtInContributions')

test('three extensions converge across host restart and late completion', async t => {
  const self = { id: 'local.workflow-register', version: '0.1.0', extensionRoot: path.resolve(__dirname, '..') }
  const installed = new Map([self, ...[bazaar, consistency].map(x => ({ id: x.id, version: x.installed.packageJSON.version, extensionRoot: x.installed.extensionPath }))].map(x => [x.id, x]))
  const effects = { action: 0, bob: 0, model: 0 }, listeners = new Set()
  const makeHost = () => {
    const actions = new ActionRegistry(), host = new ProviderRegistryHost({ actionRegistry: actions, resolveInstalledExtension: id => installed.get(id) })
    actions.execute = () => { effects.action++; throw Error('registration cannot dispatch actions') }
    const builtIn = registerWorkflowRegisterBuiltInContributions(host, { installed: self, executeCommand: () => { effects.bob++; throw Error('registration cannot call commands') } })
    return { host, builtIn, actions }
  }
  const a = makeHost(); let current = { id: self.id, isActive: true, exports: a.host.api }
  const vscode = { extensions: {
    getExtension: id => id === self.id ? current : id === bazaar.id ? bazaar.installed : id === consistency.id ? consistency.installed : undefined,
    onDidChange: listener => { listeners.add(listener); return { dispose: () => listeners.delete(listener) } }
  } }
  const bzr = bazaar.environment(a.host.api, vscode), ccr = consistency.environment(a.host.api, vscode)
  let b
  t.after(() => { bzr.stop(); ccr.stop(); a.host.dispose(); b?.host.dispose() })
  const notify = () => { for (const listener of [...listeners]) listener() }
  bzr.start(); ccr.start(); await bazaar.tick()
  assert.equal(a.host.snapshot().ownedSetCount, 3)
  assert.equal(a.host.snapshot().actionProviders.length, 29)
  notify(); await bazaar.tick(); assert.equal(a.host.snapshot().ownedSetCount, 3)

  let completeOldActivation
  const pending = new Promise(resolve => { completeOldActivation = resolve })
  current = { id: self.id, isActive: false, activate: () => pending }
  notify(); await bazaar.tick(); assert.equal(a.host.snapshot().ownedSetCount, 1)
  b = makeHost(); a.builtIn.dispose()
  current = { id: self.id, isActive: true, exports: b.host.api }
  notify(); await bazaar.tick()
  assert.equal(a.host.snapshot().ownedSetCount, 0); assert.equal(b.host.snapshot().ownedSetCount, 3)

  completeOldActivation(a.host.api); await bazaar.tick()
  assert.equal(a.host.snapshot().ownedSetCount, 0); assert.equal(b.host.snapshot().ownedSetCount, 3)
  assert.equal(bzr.calls.length, 0); assert.equal(ccr.calls.length, 0)
  assert.deepEqual(effects, { action: 0, bob: 0, model: 0 })
  assert.deepEqual(a.actions.snapshotWorkflowProviderCatalog().evidence.providers, []); assert.deepEqual(b.actions.snapshotWorkflowProviderCatalog().evidence.providers, [])
  bzr.stop(); ccr.stop(); b.builtIn.dispose()
  assert.equal(a.host.snapshot().ownedSetCount, 0); assert.equal(b.host.snapshot().ownedSetCount, 0)
  assert.equal(listeners.size, 0)
})
