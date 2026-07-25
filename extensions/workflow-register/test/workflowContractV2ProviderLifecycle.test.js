const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

function fakeRegistry() {
  const active = new Map()
  return {
    active,
    registerWorkflowProviderContract(input) {
      const key = `${input.contract.id}@${input.contract.version}`
      if (active.has(key)) throw new Error(`duplicate ${key}`)
      active.set(key, input)
      let disposed = false
      return Object.freeze({
        dispose() {
          if (disposed) return
          disposed = true
          active.delete(key)
        }
      })
    }
  }
}

function input(id, version = '1.0.0') {
  return Object.freeze({
    sourceId: `source.${id}`,
    contract: Object.freeze({ id, version })
  })
}

test('provider registration and disposal rotate the current compiler entrypoint exactly once', () => {
  const registry = fakeRegistry()
  const changes = []
  let serial = 0
  const subject = require('../out/workflowContractV2ProviderLifecycle.js')
  const lifecycle = new subject.WorkflowContractV2ProviderLifecycle({
    actionRegistry: registry,
    createEntrypoint: () => Object.freeze({ serial: serial++, providers: [...registry.active.keys()].sort() }),
    onChanged: () => changes.push(lifecycle.current().serial)
  })

  assert.deepEqual(lifecycle.current(), { serial: 0, providers: [] })
  const registration = lifecycle.register(input('sample'))
  assert.deepEqual(lifecycle.current(), { serial: 1, providers: ['sample@1.0.0'] })
  assert.deepEqual(changes, [1])

  registration.dispose()
  assert.deepEqual(lifecycle.current(), { serial: 2, providers: [] })
  assert.deepEqual(changes, [1, 2])
  registration.dispose()
  assert.deepEqual(changes, [1, 2])
})

test('failed environment rotation rolls back a new provider registration and retains the prior gateway', () => {
  const registry = fakeRegistry()
  let fail = false
  const subject = require('../out/workflowContractV2ProviderLifecycle.js')
  const lifecycle = new subject.WorkflowContractV2ProviderLifecycle({
    actionRegistry: registry,
    createEntrypoint: () => {
      if (fail) throw new Error('environment failed')
      return Object.freeze({ providers: [...registry.active.keys()].sort() })
    }
  })
  const before = lifecycle.current()
  fail = true
  assert.throws(() => lifecycle.register(input('broken')), /environment failed/)
  assert.equal(lifecycle.current(), before)
  assert.equal(registry.active.size, 0)
})

test('lifecycle disposal revokes registrations, makes wrappers idempotent, and fails closed', () => {
  const registry = fakeRegistry()
  const subject = require('../out/workflowContractV2ProviderLifecycle.js')
  const lifecycle = new subject.WorkflowContractV2ProviderLifecycle({
    actionRegistry: registry,
    createEntrypoint: () => Object.freeze({ providers: [...registry.active.keys()].sort() })
  })
  const first = lifecycle.register(input('first'))
  const second = lifecycle.register(input('second'))
  assert.equal(registry.active.size, 2)

  lifecycle.dispose()
  assert.equal(registry.active.size, 0)
  assert.throws(() => lifecycle.current(), /disposed/i)
  assert.throws(() => lifecycle.register(input('later')), /disposed/i)
  first.dispose()
  second.dispose()
  lifecycle.dispose()
})

test('registry accessors are rejected without invocation and captured Set clear survives replacement', () => {
  const modulePath = require.resolve('../out/workflowContractV2ProviderLifecycle.js')
  delete require.cache[modulePath]
  const subject = require(modulePath)
  let getterCalls = 0
  const hostile = {}
  Object.defineProperty(hostile, 'registerWorkflowProviderContract', {
    get() { getterCalls += 1; throw new Error('must not invoke registry getter') }
  })
  assert.throws(() => new subject.WorkflowContractV2ProviderLifecycle({
    actionRegistry: hostile,
    createEntrypoint: () => Object.freeze({})
  }), TypeError)
  assert.equal(getterCalls, 0)

  const registry = fakeRegistry()
  const lifecycle = new subject.WorkflowContractV2ProviderLifecycle({
    actionRegistry: registry,
    createEntrypoint: () => Object.freeze({})
  })
  lifecycle.register(input('captured'))
  const originalClear = Set.prototype.clear
  Set.prototype.clear = function replacedClear() { throw new Error('ambient Set.clear must not run') }
  try {
    assert.doesNotThrow(() => lifecycle.dispose())
    assert.equal(registry.active.size, 0)
  } finally {
    Set.prototype.clear = originalClear
    delete require.cache[modulePath]
  }
})

test('public service API rotates the v2 gateway for provider contract registration lifecycle', () => {
  const root = path.join(__dirname, '..', 'src')
  const service = fs.readFileSync(path.join(root, 'workflowRegisterService.ts'), 'utf8')
  const extension = fs.readFileSync(path.join(root, 'extension.ts'), 'utf8')
  const actions = fs.readFileSync(path.join(root, 'core', 'actionRegistry.ts'), 'utf8')

  assert.match(actions, /WorkflowProviderRegistrationInput/)
  assert.match(actions, /WorkflowProviderRegistration/)
  assert.match(service, /WorkflowContractV2ProviderLifecycle/)
  assert.match(service, /registerWorkflowProviderContract\(/)
  assert.match(service, /this\.contractV2Providers\.current\(\)/)
  assert.match(extension, /registerWorkflowProviderContract:/)
  assert.match(extension, /service\.registerWorkflowProviderContract\(input\)/)
})
