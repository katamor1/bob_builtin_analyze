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
function subjectWithFakeCompiler(options = {}) {
  const compiler = require('../out/core/contractV2/compiler.js')
  const plan = require('../out/core/contractV2/compiledPlan.js')
  const path = require('node:path').resolve(__dirname, '../out/core/contractV2/planStore.js')
  assert.ok(require('node:fs').existsSync(path), 'P5 plan store API is not implemented')
  const original = compiler.compileWorkflowPackage
  let calls = 0
  compiler.compileWorkflowPackage = ({ rawPackage, environment }) => {
    calls += 1
    options.inspect?.({ rawPackage, environment })
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
    await assert.rejects(store.acquire(input(raw, environment('evidence'))), TypeError)
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
    assert.equal(Object.isFrozen(lease), true)
    assert.equal(lease.planDigest, handle.planDigest)
    assert.equal(lease.packageDigest, handle.plan.packageDigest)
    assert.equal(lease.environmentDigest, handle.plan.environmentDigest)
    assert.equal(typeof store.release, 'undefined')

    lease.release()
    assert.equal(lease.released, true)
    lease.release()
    assert.equal(lease.released, true)
    for (const key of ['handle', 'planDigest', 'packageDigest', 'environmentDigest']) {
      assert.throws(() => lease[key], { name: 'TypeError', message: 'Workflow plan lease has been released.' })
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
    lockFile.digest = digestBytes(lockFile.bytes)
    broken.packageDigest = digestBytes(Buffer.from(canonicalText({ files: broken.files.map(({ path, digest }) => ({ path, digest })) })))
    broken.generation = broken.packageDigest
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
      promiseThen: Promise.prototype.then,
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
      const stack = (new Error().stack ?? '').replaceAll('\\', '/')
      const fromStore = Reflect.apply(originals.includes, stack, ['/out/core/contractV2/planStore.js'])
        || Reflect.apply(originals.includes, stack, ['/out/core/contractV2/planStoreInput.js'])
      if (fromStore) {
        throw new Error(`plan store used live ${name}`)
      }
      return Reflect.apply(original, this, args)
    }
    Promise.resolve = guarded(originals.promiseResolve, 'Promise.resolve')
    Promise.prototype.then = guarded(originals.promiseThen, 'Promise.prototype.then')
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
      const lease = await store.acquire(request)
      store.invalidateSlot('captured', 'minimal')
      lease.release()
      lease.release()
      assert.equal(lease.released, true)
      assert.equal(counted.calls(), 1)
    } finally {
      Promise.resolve = originals.promiseResolve
      Promise.prototype.then = originals.promiseThen
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

const { createLockedRawPackage, createBobProfile, emptyBobBinding, workflowYamlText } = require('./workflowContractV2CompilerTestSupport')
const { rawPackageFromFiles } = require('./workflowContractV2LockTestSupport')
const DIALECT = "https://json-schema.org/draft/2020-12/schema"

function schema(id, extra = {}) {
  return { $schema: DIALECT, $id: id, type: "object", ...extra }
}
function canonicalSchemaEvidence(value) {
  const bytes = Buffer.from(canonicalText(value), "utf8")
  return { id: value.$id, bytes: bytes.byteLength, digest: digestBytes(bytes) }
}
function workflow(outputSchema = "schemas/output.json") {
  return {
    schemaVersion: "workflow-register/v2",
    id: "minimal",
    name: "Provider workflow",
    description: "Runs a bound provider.",
    inputs: [],
    steps: [{
      id: "execute",
      title: "Execute",
      type: "command",
      required: true,
      provider: "example.provider",
      input: { source: "literal", value: {} },
      output: { kind: "value", id: "result", schema: outputSchema, maxBytes: 4096 },
      artifacts: []
    }],
    requiredArtifacts: [],
    resumePolicy: { mode: "fail-closed", maxAttempts: 1, retainCommittedOutputs: false, allowArtifactReuse: false },
    providers: [{
      id: "example.provider",
      version: "^1.0.0",
      inputSchema: "schemas/input.json",
      output: { kind: "value", schema: "schemas/output.json" },
      errorSchema: "schemas/error.json",
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: []
    }],
    bob: { profile: "bob/2.0.1", requiredCapabilities: [], taskCapabilities: [] }
  }
}

function registerProvider(registry, version, documents, options = {}) {
  return registry.register({
    sourceId: options.sourceId ?? `test-${version}`,
    contract: {
      id: "example.provider",
      version,
      inputSchema: canonicalSchemaEvidence(documents.input),
      output: options.unit
        ? { kind: "unit" }
        : { kind: "value", schema: canonicalSchemaEvidence(options.output ?? documents.output) },
      errorSchema: canonicalSchemaEvidence(documents.error),
      sideEffect: "none",
      idempotency: "idempotent",
      requiredCapabilities: [],
      dispatch: options.dispatch ?? (() => { throw new Error("compiler must not dispatch") })
    }
  })
}

function providerFixture(options = {}) {
  const input = schema("schemas/input.json")
  const output = schema("schemas/output.json")
  const error = schema("schemas/error.json")
  const documents = { input, output, error }
  const { WorkflowProviderRegistry, bindWorkflowProvider } = require("../out/core/contractV2/providerRegistry.js")
  const registry = new WorkflowProviderRegistry()
  let dispatchCalls = 0
  const registration = registerProvider(registry, options.version ?? "1.2.3", documents, {
    dispatch() { dispatchCalls += 1; return {} }
  })
  if (options.extraProvider) options.extraProvider(registry, documents)
  const catalog = registry.snapshot()
  const requirement = {
    id: "example.provider",
    version: "^1.0.0",
    inputSchema: canonicalSchemaEvidence(input),
    output: { kind: "value", schema: canonicalSchemaEvidence(output) },
    errorSchema: canonicalSchemaEvidence(error),
    sideEffect: "none",
    idempotency: "idempotent",
    requiredCapabilities: []
  }
  const bound = bindWorkflowProvider({
    catalog,
    requirement,
    location: { path: "workflow.yaml", pointer: "/providers/0" }
  })
  if (!bound.ok) throw new Error("test provider did not bind")
  const files = {
    "workflow.yaml": Buffer.from(`${workflowYamlText(workflow())}`, "utf8"),
    "workflow.lock.json": Buffer.from("{}", "utf8"),
    "schemas/input.json": Buffer.from(`${JSON.stringify(input)}\n`, "utf8"),
    "schemas/output.json": Buffer.from(`${JSON.stringify(output)}\n`, "utf8"),
    "schemas/error.json": Buffer.from(`${JSON.stringify(error)}\n`, "utf8")
  }
  const lockModule = require("../out/core/contractV2/workflowLock.js")
  const initial = rawPackageFromFiles(files)
  const lock = lockModule.generateWorkflowPackageLock({
    rawPackage: initial,
    providers: [bound.lockEvidence],
    bob: emptyBobBinding()
  })
  files["workflow.lock.json"] = lockModule.encodeWorkflowPackageLock(lock)
  return {
    catalog,
    dispatchCalls: () => dispatchCalls,
    documents,
    lock,
    rawPackage: rawPackageFromFiles(files),
    registration,
    registry
  }
}


function providerEnvironment(catalog) {
  return require('../out/core/contractV2/compilerEnvironment.js').createAuditedWorkflowCompilerEnvironment({ purpose: 'runtime', providerCatalog: catalog, bobProfile: createBobProfile() })
}

test('plan request snapshots caller-owned bytes and identity before scheduling compilation', async () => {
  let seen
  const counted = subjectWithFakeCompiler({ inspect: value => { seen = value.rawPackage } })
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const raw = rawPackage('Detached request')
    const callerBytes = raw.files[0].bytes
    const originalByteCopy = Uint8Array.from(callerBytes)
    const originalGeneration = raw.generation
    const pending = store.getOrCompile(input(raw, environment(), { collectionId: 'snapshot' }))
    callerBytes.fill(0xff)
    raw.publication = 'staging'
    raw.generation = '.staging-mutated'
    const handle = await pending
    assert.deepEqual(seen.files[0].bytes, originalByteCopy)
    assert.notEqual(seen.files[0].bytes, callerBytes)
    assert.equal(seen.publication, 'published')
    assert.equal(seen.generation, originalGeneration)
    assert.equal(handle.plan.packageDigest, originalGeneration)
  } finally { counted.restore() }
})

test('slot invalidation reaches every environment namespace but preserves other slots', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const raw = rawPackage('Namespace invalidation')
    const firstEnvironment = environment()
    const secondEnvironment = environment()
    const request = env => input(raw, env, { collectionId: 'all-namespaces' })
    const first = await store.getOrCompile(request(firstEnvironment))
    const second = await store.getOrCompile(request(secondEnvironment))
    const other = await store.getOrCompile(input(raw, firstEnvironment, { collectionId: 'other-slot' }))
    store.invalidateSlot('all-namespaces', 'minimal')
    assert.notEqual(await store.getOrCompile(request(firstEnvironment)), first)
    assert.notEqual(await store.getOrCompile(request(secondEnvironment)), second)
    assert.equal(await store.getOrCompile(input(raw, firstEnvironment, { collectionId: 'other-slot' })), other)
    assert.equal(counted.calls(), 5)
  } finally { counted.restore() }
})

test('store rejects hostile nested identity records without executing user behavior', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    let traps = 0
    let getters = 0
    const proxy = value => new Proxy(value, {
      get() { traps += 1; throw new Error('unexpected proxy read') },
      ownKeys() { traps += 1; throw new Error('unexpected proxy inspection') }
    })
    const cases = []
    const rawProxy = input(rawPackage()); rawProxy.rawPackage = proxy(rawProxy.rawPackage); cases.push(rawProxy)
    const envProxy = input(rawPackage()); envProxy.environment = proxy(envProxy.environment); cases.push(envProxy)
    const fileProxy = input(rawPackage()); fileProxy.rawPackage.files[0] = proxy(fileProxy.rawPackage.files[0]); cases.push(fileProxy)
    for (const key of ['publication', 'generation', 'files']) {
      const request = input(rawPackage())
      Object.defineProperty(request.rawPackage, key, { enumerable: true, get() { getters += 1; throw new Error('unexpected getter') } })
      cases.push(request)
    }
    const byteAccessor = input(rawPackage())
    Object.defineProperty(byteAccessor.rawPackage.files[0], 'bytes', { enumerable: true, get() { getters += 1; throw new Error('unexpected bytes getter') } })
    cases.push(byteAccessor)
    const symbolField = input(rawPackage()); symbolField[Symbol('extra')] = 1; cases.push(symbolField)
    const unknownField = input(rawPackage()); unknownField.extra = 1; cases.push(unknownField)
    const hiddenField = input(rawPackage()); Object.defineProperty(hiddenField, 'extra', { value: 1 }); cases.push(hiddenField)
    const mismatch = input(rawPackage()); mismatch.workflowId = 'different'; cases.push(mismatch)
    for (const request of cases) await assert.rejects(store.getOrCompile(request))
    assert.equal(traps, 0)
    assert.equal(getters, 0)
    assert.equal(counted.calls(), 0)
  } finally { counted.restore() }
})

test('slot identity validation rejects unsafe or oversized names without invalidating valid slots', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    for (const collectionId of ['', '/leading', 'trailing/', 'double//slash', 'a/../b', 'a/./b', 'a'.repeat(241)]) {
      assert.throws(() => store.invalidateSlot(collectionId, 'minimal'), TypeError)
    }
    for (const workflowId of ['', '1invalid', 'a..b', 'a'.repeat(129)]) {
      assert.throws(() => store.invalidateSlot('repository', workflowId), TypeError)
    }
    const request = input(rawPackage(), environment(), { collectionId: 'a'.repeat(240) })
    const old = await store.getOrCompile(request)
    store.invalidateSlot(request.collectionId, 'minimal')
    assert.notEqual(await store.getOrCompile(request), old)
    assert.equal(counted.calls(), 2)
  } finally { counted.restore() }
})

test('lease release remains idempotent after its owner callback throws', async () => {
  const counted = subjectWithFakeCompiler()
  try {
    const store = new counted.subject.WorkflowPlanStore()
    const handle = await store.getOrCompile(input(rawPackage(), environment(), { collectionId: 'throw-release' }))
    const { createWorkflowPlanLease } = require('../out/core/contractV2/planLease.js')
    let callbackCalls = 0
    const failure = new Error('owner failure')
    const lease = createWorkflowPlanLease({ handle, onRelease() { callbackCalls += 1; throw failure } })
    assert.throws(() => lease.release(), error => error === failure)
    assert.equal(lease.released, true)
    lease.release()
    assert.equal(callbackCalls, 1)
    for (const key of ['handle', 'planDigest', 'packageDigest', 'environmentDigest']) {
      assert.throws(() => lease[key], { name: 'TypeError', message: 'Workflow plan lease has been released.' })
    }
    assert.throws(() => createWorkflowPlanLease({ handle: {}, onRelease() {} }), TypeError)
    let traps = 0
    const hostileCallback = new Proxy(() => {}, { apply() { traps += 1 } })
    assert.throws(() => createWorkflowPlanLease({ handle, onRelease: hostileCallback }), TypeError)
    assert.equal(traps, 0)
  } finally { counted.restore() }
})

test('equal provider evidence across re-registration never shares a private handle', async () => {
  const { WorkflowPlanStore } = require('../out/core/contractV2/planStore.js')
  const { requireCompiledWorkflowPlanState } = require('../out/core/contractV2/compiledPlan.js')
  const fixture = providerFixture()
  const store = new WorkflowPlanStore()
  const originalEnvironment = providerEnvironment(fixture.catalog)
  const originalLease = await store.acquire(input(fixture.rawPackage, originalEnvironment, { collectionId: 'provider-generation' }))
  const original = originalLease.handle
  const originalDispatchHandle = requireCompiledWorkflowPlanState(original).providers[0].dispatchHandle
  fixture.registration.dispose()
  let replacementDispatchCalls = 0
  const replacementRegistration = registerProvider(fixture.registry, '1.2.3', fixture.documents, { dispatch() { replacementDispatchCalls += 1 } })
  try {
    const replacementEnvironment = providerEnvironment(fixture.registry.snapshot())
    const replacement = await store.getOrCompile(input(fixture.rawPackage, replacementEnvironment, { collectionId: 'provider-generation' }))
    assert.notEqual(replacement, original)
    assert.equal(replacement.planDigest, original.planDigest)
    assert.equal(replacement.plan.environmentDigest, original.plan.environmentDigest)
    assert.notEqual(requireCompiledWorkflowPlanState(replacement).providers[0].dispatchHandle, originalDispatchHandle)
    assert.equal(originalLease.handle, original)
    assert.equal(fixture.dispatchCalls(), 0)
    assert.equal(replacementDispatchCalls, 0)
  } finally { originalLease.release(); replacementRegistration.dispose() }
})

test('pinned generation reload ignores current pointer and fails closed on missing generation or exact binding', async () => {
  const { WorkflowPlanStore, WorkflowPlanCompilationError } = require('../out/core/contractV2/planStore.js')
  const { MemoryPackageFileSystem, installPublished, rootSubject, subject } = require('./workflowContractV2PackageLoaderTestSupport')
  const a = createLockedRawPackage()
  const document = require('js-yaml').load(a.files['workflow.yaml'].toString('utf8'))
  document.name = 'Pinned generation B'
  const b = createLockedRawPackage({ 'workflow.yaml': workflowYamlText(document) })
  const fileSystem = new MemoryPackageFileSystem()
  const installedA = installPublished(fileSystem, 'minimal', a.files)
  const collectionRoot = rootSubject().createWorkflowPackageRoot(fileSystem, {})
  const store = new WorkflowPlanStore()
  const env = environment()
  const loadPinned = async () => store.acquire(input(await subject().loadWorkflowPackageGeneration({
    fileSystem, collectionRoot, workflowId: 'minimal', generation: installedA.digest, expectedPackageDigest: installedA.digest
  }), env, { collectionId: 'pinned' }))
  const first = await loadPinned()
  const original = first.handle
  const installedB = installPublished(fileSystem, 'minimal', b.files)
  assert.notEqual(installedB.digest, installedA.digest)
  assert.equal((await subject().loadCurrentWorkflowPackage({ fileSystem, collectionRoot, workflowId: 'minimal' })).packageDigest, installedB.digest)
  store.invalidateSlot('pinned', 'minimal')
  first.release()
  fileSystem.remove(['minimal', 'current.json'])
  const before = fileSystem.calls.length
  const resumed = await loadPinned()
  assert.notEqual(resumed.handle, original)
  assert.equal(resumed.packageDigest, installedA.digest)
  assert.equal(resumed.planDigest, original.planDigest)
  assert.deepEqual(resumed.handle.plan, original.plan)
  assert.equal(fileSystem.calls.slice(before).some(([, p]) => p.endsWith('current.json')), false)
  resumed.release()
  fileSystem.remove(installedA.base)
  await assert.rejects(loadPinned())
  const fixture = providerFixture()
  try {
    const bound = await store.acquire(input(fixture.rawPackage, providerEnvironment(fixture.catalog), { collectionId: 'pinned-binding' }))
    store.invalidateSlot('pinned-binding', 'minimal')
    await assert.rejects(store.acquire(input(fixture.rawPackage, environment(), { collectionId: 'pinned-binding' })), error =>
      error instanceof WorkflowPlanCompilationError && error.diagnostics.some(d => d.code === 'WF2_PROVIDER_CONTRACT_MISMATCH'))
    assert.equal(bound.handle.plan.packageDigest, fixture.rawPackage.packageDigest)
    assert.equal(fixture.dispatchCalls(), 0)
    bound.release()
  } finally { fixture.registration.dispose() }
})

for (const operation of ['getOrCompile', 'acquire']) {
  test('last continuation rejects invalidation after inner cache check for ' + operation, async () => {
    const counted = subjectWithFakeCompiler()
    try {
      const store = new counted.subject.WorkflowPlanStore()
      const request = input(rawPackage('Last continuation'), environment(), { collectionId: 'last-' + operation })
      await store.getOrCompile(request)
      const pending = store[operation](request)
      queueMicrotask(() => store.invalidateSlot(request.collectionId, request.workflowId))
      await assert.rejects(pending, counted.subject.WorkflowPlanInvalidatedError)
      assert.equal(counted.calls(), 1)
    } finally { counted.restore() }
  })
}
