const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { test } = require('node:test')

function digestBytes(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`
}
function canonicalText(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`).join(',')}}`
}
function packageDigest(files) {
  const evidence = Object.entries(files)
    .map(([path, bytes]) => ({ path, digest: digestBytes(bytes) }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return digestBytes(Buffer.from(canonicalText({ files: evidence }), 'utf8'))
}
function rawPackage(description = 'Plan store fixture', overrides = {}) {
  const files = {
    'workflow.yaml': Buffer.from(`description: ${description}\n`, 'utf8'),
    'workflow.lock.json': Buffer.from('{}', 'utf8')
  }
  const digest = packageDigest(files)
  return {
    publication: 'published',
    workflowId: 'minimal',
    generation: digest,
    packageDigest: digest,
    files: Object.keys(files).sort().map((path) => {
      const bytes = Uint8Array.from(files[path])
      return { path, bytes, byteLength: bytes.byteLength, digest: digestBytes(bytes) }
    }),
    ...overrides
  }
}
function environment(purpose = 'runtime') {
  const { WorkflowProviderRegistry } = require('../out/core/contractV2/providerRegistry.js')
  const { snapshotBobContractProfile } = require('../out/core/contractV2/bobProfile.js')
  return require('../out/core/contractV2/compilerEnvironment.js').createAuditedWorkflowCompilerEnvironment({
    purpose,
    providerCatalog: new WorkflowProviderRegistry().snapshot(),
    bobProfile: snapshotBobContractProfile({ registerSource() {} })
  })
}
function input(raw, env = environment(), overrides = {}) {
  return {
    collectionId: 'repository',
    workflowId: 'minimal',
    rawPackage: raw,
    environment: env,
    ...overrides
  }
}
function subjectWithFakeCompiler() {
  const compiler = require('../out/core/contractV2/compiler.js')
  const plan = require('../out/core/contractV2/compiledPlan.js')
  const path = require.resolve('../out/core/contractV2/planStore.js')
  const original = compiler.compileWorkflowPackage
  let calls = 0
  compiler.compileWorkflowPackage = ({ rawPackage, environment }) => {
    calls += 1
    const lock = rawPackage.files.find((entry) => entry.path === 'workflow.lock.json')
    if (lock?.bytes[0] === 0xff) {
      return {
        ok: false,
        diagnostics: Object.freeze([Object.freeze({
          code: 'WF2_LOCK_MISMATCH',
          severity: 'error',
          message: 'Workflow package lock does not match.',
          location: Object.freeze({ path: 'workflow.lock.json', pointer: '' }),
          relatedLocations: Object.freeze([])
        })])
      }
    }
    const environmentDigest = `sha256:${'e'.repeat(64)}`
    const handle = plan.createCompiledWorkflowPlanHandle({
      environment,
      publication: rawPackage.publication,
      generation: rawPackage.generation,
      plan: {
        schemaVersion: 'workflow-compiled-plan/v2',
        compilerContractVersion: 'workflow-register-compiler/v2',
        policyVersions: {},
        workflowId: rawPackage.workflowId,
        packageDigest: rawPackage.packageDigest,
        lockfileDigest: lock?.digest ?? `sha256:${'l'.repeat(64)}`,
        environmentDigest,
        workflow: { schemaVersion: 'workflow-compiled-workflow/v2', id: rawPackage.workflowId, name: 'Minimal', description: 'Test', inputs: [], steps: [], resumePolicy: {} },
        prompts: [],
        schemas: [],
        schemaCatalogDigest: `sha256:${'s'.repeat(64)}`,
        predicates: [],
        providerBindings: [],
        bobProfileBinding: {},
        requiredArtifacts: []
      },
      prompts: [],
      schemas: [],
      providers: []
    })
    return { ok: true, handle, diagnostics: Object.freeze([]) }
  }
  delete require.cache[path]
  const subject = require(path)
  return {
    subject,
    calls: () => calls,
    restore() {
      compiler.compileWorkflowPackage = original
      delete require.cache[path]
    }
  }
}

test('same environment coalesces concurrent compilation and distinct environments never share handles', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const raw = rawPackage()
    const shared = environment()
    const [a, b, c] = await Promise.all([
      store.getOrCompile(input(raw, shared)),
      store.getOrCompile(input(raw, shared)),
      store.getOrCompile(input(raw, shared))
    ])
    assert.equal(a, b)
    assert.equal(b, c)
    assert.equal(counted.calls(), 1)

    const other = await store.getOrCompile(input(raw, environment()))
    assert.notEqual(other, a)
    assert.deepEqual(other.plan, a.plan)
    assert.equal(other.planDigest, a.planDigest)
    assert.equal(counted.calls(), 2)
  } finally {
    counted.restore()
  }
})

test('getOrCompile supports every purpose while acquire is runtime-only before compilation', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const raw = rawPackage()
    for (const purpose of ['runtime', 'authoring-validation', 'evidence']) {
      const handle = await store.getOrCompile(input(raw, environment(purpose)))
      assert.equal(handle.plan.workflowId, 'minimal')
    }
    const before = counted.calls()
    await assert.rejects(
      store.acquire(input(raw, environment('authoring-validation'))),
      /runtime|lease/i
    )
    assert.equal(counted.calls(), before)
  } finally {
    counted.restore()
  }
})

test('runtime leases expose evidence until one idempotent release and then fail closed', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const lease = await store.acquire(input(rawPackage()))
    const handle = lease.handle
    assert.equal(lease.released, false)
    assert.equal(lease.planDigest, handle.planDigest)
    assert.equal(lease.packageDigest, handle.plan.packageDigest)
    assert.equal(lease.environmentDigest, handle.plan.environmentDigest)
    assert.equal(typeof store.release, 'undefined')

    lease.release()
    assert.equal(lease.released, true)
    lease.release()
    assert.equal(lease.released, true)
    for (const key of ['handle', 'planDigest', 'packageDigest', 'environmentDigest']) {
      assert.throws(() => lease[key], /released|lease/i)
    }
  } finally {
    counted.restore()
  }
})

test('slot invalidation recompiles unleased entries while preserving a live lease', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const raw = rawPackage()
    const env = environment()
    const oldLease = await store.acquire(input(raw, env))
    const oldHandle = oldLease.handle
    assert.equal(counted.calls(), 1)

    store.invalidateSlot('repository', 'minimal')
    const replacement = await store.getOrCompile(input(raw, env))
    assert.notEqual(replacement, oldHandle)
    assert.deepEqual(replacement.plan, oldHandle.plan)
    assert.equal(counted.calls(), 2)
    assert.equal(oldLease.handle, oldHandle)

    oldLease.release()
    assert.equal(oldLease.released, true)
  } finally {
    counted.restore()
  }
})

test('a failed recompile never falls back to stale success and failures are not cached', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const env = environment()
    await store.getOrCompile(input(rawPackage(), env))
    store.invalidateSlot('repository', 'minimal')

    const broken = rawPackage('Changed after invalidation')
    const lockFile = broken.files.find((entry) => entry.path === 'workflow.lock.json')
    lockFile.bytes[0] = 0xff
    await assert.rejects(store.getOrCompile(input(broken, env)), /compilation|diagnostic|lock/i)
    await assert.rejects(store.getOrCompile(input(broken, env)), /compilation|diagnostic|lock/i)
    assert.equal(counted.calls(), 3)
  } finally {
    counted.restore()
  }
})

test('staging packages may compile but cannot acquire a runtime lease', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const staging = rawPackage('Staging', {
      publication: 'staging',
      generation: '.staging-authoring-abc123'
    })
    const env = environment()
    const handle = await store.getOrCompile(input(staging, env))
    assert.equal(handle.plan.workflowId, 'minimal')
    await assert.rejects(store.acquire(input(staging, env)), /published|lease|staging/i)
    assert.equal(counted.calls(), 1)
  } finally {
    counted.restore()
  }
})

test('store requests reject proxy and accessor inputs without behavior invocation', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const request = input(rawPackage())
    let traps = 0
    const proxy = new Proxy(request, {
      get() { traps += 1; throw new Error('must not read proxy') },
      ownKeys() { traps += 1; throw new Error('must not inspect proxy') }
    })
    await assert.rejects(store.getOrCompile(proxy), TypeError)
    assert.equal(traps, 0)

    let getterCalls = 0
    const accessor = { ...request }
    Object.defineProperty(accessor, 'rawPackage', {
      enumerable: true,
      get() { getterCalls += 1; throw new Error('must not read accessor') }
    })
    await assert.rejects(store.getOrCompile(accessor), TypeError)
    assert.equal(getterCalls, 0)
    assert.equal(counted.calls(), 0)
  } finally {
    counted.restore()
  }
})

test('slot epochs are process-wide across store instances', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const firstStore = new counted.subject.WorkflowPlanStore()
    const secondStore = new counted.subject.WorkflowPlanStore()
    const raw = rawPackage('Process-wide epoch')
    const env = environment()
    const first = await firstStore.getOrCompile(input(raw, env, { collectionId: 'shared-epoch' }))
    secondStore.invalidateSlot('shared-epoch', 'minimal')
    const second = await firstStore.getOrCompile(input(raw, env, { collectionId: 'shared-epoch' }))
    assert.notEqual(second, first)
    assert.equal(counted.calls(), 2)
  } finally {
    counted.restore()
  }
})

test('in-flight invalidation rejects the pending result instead of publishing stale success', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const request = input(rawPackage('In-flight invalidation'), environment(), { collectionId: 'in-flight' })
    const pending = store.getOrCompile(request)
    store.invalidateSlot('in-flight', 'minimal')
    await assert.rejects(pending, /invalidated/i)
    assert.equal(counted.calls(), 1)
    const replacement = await store.getOrCompile(request)
    assert.equal(replacement.plan.workflowId, 'minimal')
    assert.equal(counted.calls(), 2)
  } finally {
    counted.restore()
  }
})

test('published and staging identities with identical bytes never share private handles', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const published = rawPackage('Same bytes')
    const staging = {
      ...published,
      publication: 'staging',
      generation: '.staging-one'
    }
    const env = environment()
    const publishedHandle = await store.getOrCompile(input(published, env, { collectionId: 'identity' }))
    const stagingHandle = await store.getOrCompile(input(staging, env, { collectionId: 'identity' }))
    assert.notEqual(stagingHandle, publishedHandle)
    assert.deepEqual(stagingHandle.plan, publishedHandle.plan)
    assert.equal(counted.calls(), 2)
    await assert.rejects(
      store.acquire(input(staging, env, { collectionId: 'identity' })),
      /published|lease|staging/i
    )

    const secondStaging = { ...staging, generation: '.staging-two' }
    const secondStagingHandle = await store.getOrCompile(input(secondStaging, env, { collectionId: 'identity' }))
    assert.notEqual(secondStagingHandle, stagingHandle)
    assert.equal(counted.calls(), 3)
  } finally {
    counted.restore()
  }
})

test('multiple leases share one handle and release counts never underflow', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const env = environment()
    const request = input(rawPackage('Multiple leases'), env, { collectionId: 'multiple' })
    const first = await store.acquire(request)
    const second = await store.acquire(request)
    assert.equal(first.handle, second.handle)
    assert.equal(counted.calls(), 1)
    store.invalidateSlot('multiple', 'minimal')
    first.release()
    assert.equal(first.released, true)
    assert.equal(second.released, false)
    assert.equal(second.handle.plan.workflowId, 'minimal')
    second.release()
    second.release()
    assert.equal(second.released, true)
    const replacement = await store.getOrCompile(request)
    assert.equal(replacement.plan.workflowId, 'minimal')
    assert.equal(counted.calls(), 2)
  } finally {
    counted.restore()
  }
})

test('lease factory rejects proxy and accessor input without invoking behavior', () => {
  const leaseModule = require('../out/core/contractV2/planLease.js')
  let traps = 0
  const proxy = new Proxy({}, {
    get() { traps += 1; throw new Error('must not read proxy') },
    ownKeys() { traps += 1; throw new Error('must not inspect proxy') }
  })
  assert.throws(() => leaseModule.createWorkflowPlanLease(proxy), TypeError)
  assert.equal(traps, 0)

  let getterCalls = 0
  const accessor = { onRelease() {} }
  Object.defineProperty(accessor, 'handle', {
    enumerable: true,
    get() { getterCalls += 1; throw new Error('must not read accessor') }
  })
  assert.throws(() => leaseModule.createWorkflowPlanLease(accessor), TypeError)
  assert.equal(getterCalls, 0)
})

test('plan store uses captured Promise and collection intrinsics after module load', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const request = input(rawPackage('Captured intrinsics'), environment(), { collectionId: 'captured' })
    const originals = {
      promiseResolve: Promise.resolve,
      mapGet: Map.prototype.get,
      mapSet: Map.prototype.set,
      mapDelete: Map.prototype.delete,
      mapForEach: Map.prototype.forEach,
      weakMapGet: WeakMap.prototype.get,
      weakMapSet: WeakMap.prototype.set,
      includes: String.prototype.includes,
      split: String.prototype.split,
      regexpTest: RegExp.prototype.test,
      bufferFrom: Buffer.from
    }
    const guarded = (original, name) => function (...args) {
      const stack = new Error().stack ?? ''
      const fromStore = Reflect.apply(originals.includes, stack, ['/out/core/contractV2/planStore.js'])
        || Reflect.apply(originals.includes, stack, ['/out/core/contractV2/planStoreInput.js'])
      if (fromStore) {
        throw new Error(`plan store used live ${name}`)
      }
      return Reflect.apply(original, this, args)
    }
    Promise.resolve = guarded(originals.promiseResolve, 'Promise.resolve')
    Map.prototype.get = guarded(originals.mapGet, 'Map.prototype.get')
    Map.prototype.set = guarded(originals.mapSet, 'Map.prototype.set')
    Map.prototype.delete = guarded(originals.mapDelete, 'Map.prototype.delete')
    Map.prototype.forEach = guarded(originals.mapForEach, 'Map.prototype.forEach')
    WeakMap.prototype.get = guarded(originals.weakMapGet, 'WeakMap.prototype.get')
    WeakMap.prototype.set = guarded(originals.weakMapSet, 'WeakMap.prototype.set')
    String.prototype.includes = guarded(originals.includes, 'String.prototype.includes')
    String.prototype.split = guarded(originals.split, 'String.prototype.split')
    RegExp.prototype.test = guarded(originals.regexpTest, 'RegExp.prototype.test')
    Buffer.from = guarded(originals.bufferFrom, 'Buffer.from')
    try {
      const handle = await store.getOrCompile(request)
      assert.equal(handle.plan.workflowId, 'minimal')
      assert.equal(counted.calls(), 1)
    } finally {
      Promise.resolve = originals.promiseResolve
      Map.prototype.get = originals.mapGet
      Map.prototype.set = originals.mapSet
      Map.prototype.delete = originals.mapDelete
      Map.prototype.forEach = originals.mapForEach
      WeakMap.prototype.get = originals.weakMapGet
      WeakMap.prototype.set = originals.weakMapSet
      String.prototype.includes = originals.includes
      String.prototype.split = originals.split
      RegExp.prototype.test = originals.regexpTest
      Buffer.from = originals.bufferFrom
    }
  } finally {
    counted.restore()
  }
})

test('cache-hit invalidation before getOrCompile continuation rejects the stale handle', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const env = environment()
    const request = input(rawPackage('Post-await get'), env, { collectionId: 'post-await-get' })
    await store.getOrCompile(request)
    assert.equal(counted.calls(), 1)

    const pending = store.getOrCompile(request)
    store.invalidateSlot('post-await-get', 'minimal')
    await assert.rejects(pending, /invalidated/i)
    assert.equal(counted.calls(), 1)
  } finally {
    counted.restore()
  }
})

test('cache-hit invalidation before acquire continuation never creates a stale lease', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const env = environment()
    const request = input(rawPackage('Post-await lease'), env, { collectionId: 'post-await-lease' })
    await store.getOrCompile(request)
    assert.equal(counted.calls(), 1)

    const pending = store.acquire(request)
    store.invalidateSlot('post-await-lease', 'minimal')
    await assert.rejects(pending, /invalidated/i)
    assert.equal(counted.calls(), 1)
  } finally {
    counted.restore()
  }
})
