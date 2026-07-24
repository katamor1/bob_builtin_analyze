const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { test } = require('node:test')

function digest(character) {
  return `sha256:${character.repeat(64)}`
}

function rawPackage(overrides = {}) {
  return Object.freeze({
    publication: 'published',
    workflowId: 'minimal',
    generation: digest('a'),
    packageDigest: digest('a'),
    files: Object.freeze([]),
    ...overrides
  })
}

function diagnostic() {
  return Object.freeze({
    code: 'WF2_LOCK_MISMATCH',
    severity: 'error',
    message: 'Workflow package lock does not match compiled evidence.',
    location: Object.freeze({ path: 'workflow.lock.json', pointer: '/environmentDigest' }),
    relatedLocations: Object.freeze([])
  })
}

function slot(overrides = {}) {
  return Object.freeze({
    collectionId: '.bob/workflows',
    collectionRoot: '/workspace/.bob/workflows',
    workflowId: 'minimal',
    ...overrides
  })
}

function subject() {
  return require('../out/workflowContractV2Entrypoint.js')
}

test('all product consumers share one current-generation handle and one failure diagnostic contract', async () => {
  const handle = Object.freeze({
    planDigest: digest('p'),
    plan: Object.freeze({
      workflowId: 'minimal',
      packageDigest: digest('a'),
      environmentDigest: digest('e')
    })
  })
  const environment = Object.freeze({})
  const loaded = rawPackage()
  const calls = []
  const entrypoint = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async (input) => {
      calls.push(['loadCurrent', input])
      return loaded
    },
    loadGeneration: async () => { throw new Error('explicit generation loader must not run') },
    getOrCompile: async (input) => {
      calls.push(['getOrCompile', input])
      return handle
    },
    acquire: async () => { throw new Error('lease path must not run') },
    invalidate: () => { throw new Error('invalidation must not run') }
  })

  const consumerNames = [
    'validation',
    'workspace-registration',
    'run-creation',
    'bob-adapter',
    'operation-hub',
    'command-validation'
  ]
  const results = []
  for (const consumer of consumerNames) {
    const result = await entrypoint.compileCurrent({ slot: slot(), consumer })
    assert.equal(result.ok, true)
    results.push(result.handle)
  }
  assert.equal(results.every((value) => value === handle), true)
  assert.equal(calls.filter(([name]) => name === 'loadCurrent').length, consumerNames.length)
  assert.equal(calls.filter(([name]) => name === 'getOrCompile').length, consumerNames.length)
  for (const [, input] of calls.filter(([name]) => name === 'getOrCompile')) {
    assert.equal(input.environment, environment)
    assert.equal(input.rawPackage, loaded)
    assert.equal(input.collectionId, '.bob/workflows')
    assert.equal(input.workflowId, 'minimal')
  }

  const failureDiagnostics = Object.freeze([diagnostic()])
  const { WorkflowPlanCompilationError } = require('../out/core/contractV2/planStore.js')
  const failing = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async () => loaded,
    loadGeneration: async () => loaded,
    getOrCompile: async () => { throw new WorkflowPlanCompilationError(failureDiagnostics) },
    acquire: async () => { throw new Error('lease path must not run') },
    invalidate: () => undefined
  })
  for (const consumer of consumerNames) {
    const result = await failing.compileCurrent({ slot: slot(), consumer })
    assert.equal(result.ok, false)
    assert.deepEqual(result.diagnostics, failureDiagnostics)
    assert.equal(Object.isFrozen(result.diagnostics), true)
  }
})

test('run creation acquires the same handle and explicit generation never consults current', async () => {
  const handle = Object.freeze({ planDigest: digest('p'), plan: Object.freeze({ workflowId: 'minimal' }) })
  const lease = Object.freeze({ handle, released: false, release() {} })
  const environment = Object.freeze({})
  let currentCalls = 0
  let generationCalls = 0
  let acquireCalls = 0
  const loaded = rawPackage()
  const entrypoint = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async () => { currentCalls += 1; return loaded },
    loadGeneration: async (input) => { generationCalls += 1; assert.equal(input.generation, digest('a')); return loaded },
    getOrCompile: async () => handle,
    acquire: async (input) => { acquireCalls += 1; assert.equal(input.environment, environment); return lease },
    invalidate: () => undefined
  })

  const acquired = await entrypoint.acquireCurrent({ slot: slot(), consumer: 'run-creation' })
  assert.equal(acquired.ok, true)
  assert.equal(acquired.lease, lease)
  assert.equal(acquired.lease.handle, handle)

  const explicit = await entrypoint.compileGeneration({
    slot: slot(),
    generation: digest('a'),
    expectedPackageDigest: digest('a'),
    consumer: 'resume'
  })
  assert.equal(explicit.ok, true)
  assert.equal(explicit.handle, handle)
  assert.equal(currentCalls, 1)
  assert.equal(generationCalls, 1)
  assert.equal(acquireCalls, 1)
})

test('entrypoint input rejects proxy and accessor records without invoking behavior', async () => {
  const environment = Object.freeze({})
  let traps = 0
  const proxy = new Proxy({ slot: slot(), consumer: 'validation' }, {
    get() { traps += 1; throw new Error('must not read proxy') },
    ownKeys() { traps += 1; throw new Error('must not inspect proxy') }
  })
  const entrypoint = subject().createWorkflowContractV2Entrypoint({
    environment,
    loadCurrent: async () => rawPackage(),
    loadGeneration: async () => rawPackage(),
    getOrCompile: async () => Object.freeze({}),
    acquire: async () => Object.freeze({}),
    invalidate: () => undefined
  })
  await assert.rejects(entrypoint.compileCurrent(proxy), TypeError)
  assert.equal(traps, 0)

  let getterCalls = 0
  const accessor = { consumer: 'validation' }
  Object.defineProperty(accessor, 'slot', {
    enumerable: true,
    get() { getterCalls += 1; return slot() }
  })
  await assert.rejects(entrypoint.compileCurrent(accessor), TypeError)
  assert.equal(getterCalls, 0)
})

test('transitional legacy imports are exact and v2 consumers do not reach compiler internals', () => {
  const root = path.join(__dirname, '..')
  const allowlistPath = path.join(
    __dirname,
    'fixtures',
    'workflow-contract-v2',
    'transitional-legacy-import-allowlist.json'
  )
  const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8'))
  const allowed = new Set(allowlist.map((entry) => `${entry.path}\u0000${entry.import}`))
  const targets = [
    'src/workflowDiscovery.ts',
    'src/workflowDefinitionLoader.ts',
    'src/core/workflowValidator.ts',
    'src/workflowRegistrationService.ts',
    'src/bobWorkflowFactory.ts',
    'src/gui/operationHubProvider.ts',
    'src/commands/validateWorkflow.ts'
  ]
  const forbidden = /(?:yamlDocument|jsonSchema(?:Catalog|Role)?|predicate|providerRegistry|bobProfile|workflowLock|packageLoader|packageRoot|packageFileSystem)/
  const seenLegacy = new Set()
  for (const relative of targets) {
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1])
    for (const imported of imports) {
      const key = `${relative}\u0000${imported}`
      if (allowed.has(key)) {
        seenLegacy.add(key)
        continue
      }
      assert.equal(forbidden.test(imported), false, `${relative} imports forbidden v2 internal ${imported}`)
      assert.equal(imported.includes('workflowCompiler') || imported.includes('workflowAdapter'), false, `${relative} widened legacy import ${imported}`)
    }
  }
  assert.deepEqual([...seenLegacy].sort(), [...allowed].sort())
})
