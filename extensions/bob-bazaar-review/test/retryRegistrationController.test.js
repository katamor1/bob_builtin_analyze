const assert = require("node:assert/strict")
const { test } = require("node:test")
const { startRetryRegistrationController } = require("../out/workflow/retryRegistrationController")

const tick = () => new Promise((resolve) => setImmediate(resolve))

function deferred() {
  let resolve
  const promise = new Promise((next) => { resolve = next })
  return { promise, resolve }
}

function disposable(label, disposed) {
  return { dispose: () => disposed.push(label) }
}

test("retry controller keeps registrations when the workflow API identity is unchanged", async () => {
  const api = {}
  const disposed = []
  let listener = () => {}
  let registerCalls = 0
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => {
      registerCalls += 1
      return { registered: true, api, registrations: [disposable("provider", disposed)] }
    },
    currentApi: () => api,
    subscribeChanges: (next) => {
      listener = next
      return disposable("listener", disposed)
    },
    own: () => {},
    reportError: assert.fail
  })

  await tick()
  listener()
  await tick()

  assert.equal(registerCalls, 1)
  assert.deepEqual(disposed, [])
  controller.dispose()
})

test("retry controller discards stale registrations after an API generation change", async () => {
  const first = deferred()
  const api1 = { id: 1 }
  const api2 = { id: 2 }
  let currentApi = api1
  let listener = () => {}
  let registerCalls = 0
  const disposed = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => {
      registerCalls += 1
      if (registerCalls === 1) return first.promise
      return { registered: true, api: api2, registrations: [disposable("new", disposed)] }
    },
    currentApi: () => currentApi,
    subscribeChanges: (next) => {
      listener = next
      return disposable("listener", disposed)
    },
    own: () => {},
    reportError: assert.fail
  })

  currentApi = api2
  listener()
  await tick()
  first.resolve({ registered: true, api: api1, registrations: [disposable("stale", disposed)] })
  await tick()

  assert.equal(registerCalls, 2)
  assert.ok(disposed.includes("stale"))
  assert.ok(!disposed.includes("new"))
  controller.dispose()
  assert.ok(disposed.includes("new"))
})

test("retry controller disposes a registration that completes after deactivation", async () => {
  const pending = deferred()
  const disposed = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: () => pending.promise,
    currentApi: () => undefined,
    subscribeChanges: () => disposable("listener", disposed),
    own: () => {},
    reportError: assert.fail
  })

  controller.dispose()
  pending.resolve({ registered: true, api: {}, registrations: [disposable("late", disposed)] })
  await tick()

  assert.ok(disposed.includes("late"))
}
