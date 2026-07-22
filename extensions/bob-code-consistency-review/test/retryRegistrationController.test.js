const assert = require("node:assert/strict")
const { test } = require("node:test")
const { startRetryRegistrationController } = require("../out/retryRegistrationController")

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

test("retry controller rolls back partial registrations from an unsuccessful attempt", async () => {
  const disposed = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => ({
      registered: false,
      registrations: [disposable("partial", disposed)]
    }),
    currentApi: () => undefined,
    subscribeChanges: () => disposable("listener", disposed),
    own: () => {},
    reportError: assert.fail
  })

  await tick()
  assert.deepEqual(disposed, ["partial"])
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
})

test("retry controller rejects a successful result without API identity", async () => {
  const disposed = []
  const errors = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => ({
      registered: true,
      registrations: [disposable("missing-api", disposed)]
    }),
    currentApi: () => undefined,
    subscribeChanges: () => disposable("listener", disposed),
    own: () => {},
    reportError: (error) => errors.push(error)
  })

  await tick()

  assert.ok(disposed.includes("missing-api"))
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /API identity/)
  controller.dispose()
})

test("retry controller exclusively owns provider registrations", async () => {
  const api = {}
  const disposed = []
  const owned = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => ({
      registered: true,
      api,
      registrations: [disposable("provider", disposed)]
    }),
    currentApi: () => api,
    subscribeChanges: () => disposable("listener", disposed),
    own: (...disposables) => owned.push(...disposables),
    reportError: assert.fail
  })

  await tick()

  assert.equal(owned.length, 1)
  assert.equal(owned[0], controller)
  controller.dispose()
  for (const ownedDisposable of owned) ownedDisposable.dispose()
  assert.deepEqual(disposed, ["provider", "listener"])
})

test("retry controller disposes every registration in reverse order and always detaches its listener", async () => {
  const api = {}
  const disposed = []
  const errors = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => ({
      registered: true,
      api,
      registrations: [
        disposable("first", disposed),
        { dispose: () => { disposed.push("middle"); throw new Error("middle cleanup failed") } },
        disposable("last", disposed)
      ]
    }),
    currentApi: () => api,
    subscribeChanges: () => disposable("listener", disposed),
    own: () => {},
    reportError: (error) => errors.push(error)
  })

  await tick()
  controller.dispose()

  assert.deepEqual(disposed, ["last", "middle", "first", "listener"])
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /middle cleanup failed/)
})

test("API generation change reports cleanup failure but still registers the next generation", async () => {
  const firstApi = { id: "first" }
  const secondApi = { id: "second" }
  let currentApi = firstApi
  let listener = () => {}
  let attempts = 0
  const disposed = []
  const errors = []
  const controller = startRetryRegistrationController({
    retryDelaysMs: [],
    register: async () => {
      attempts += 1
      if (attempts === 1) {
        return {
          registered: true,
          api: firstApi,
          registrations: [{ dispose: () => { disposed.push("first-provider"); throw new Error("old generation cleanup failed") } }]
        }
      }
      return { registered: true, api: secondApi, registrations: [disposable("second-provider", disposed)] }
    },
    currentApi: () => currentApi,
    subscribeChanges: (next) => {
      listener = next
      return disposable("listener", disposed)
    },
    own: () => {},
    reportError: (error) => errors.push(error)
  })

  await tick()
  currentApi = secondApi
  listener()
  await tick()

  assert.equal(attempts, 2)
  assert.deepEqual(disposed, ["first-provider"])
  assert.equal(errors.length, 1)
  assert.match(String(errors[0]), /old generation cleanup failed/)
  controller.dispose()
  assert.deepEqual(disposed, ["first-provider", "second-provider", "listener"])
})
