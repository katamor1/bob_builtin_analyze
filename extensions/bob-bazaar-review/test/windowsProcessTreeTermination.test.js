const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const { EventEmitter } = require("node:events")
const { performance } = require("node:perf_hooks")
const { test } = require("node:test")

class FakeChild extends EventEmitter {
  constructor(pid) {
    super()
    this.pid = pid
    this.exitCode = null
    this.signalCode = null
    this.stdout = new EventEmitter()
    this.stderr = new EventEmitter()
    this.killSignals = []
  }

  kill(signal) {
    this.killSignals.push(signal)
    return true
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve))

test("Windows cancellation waits for taskkill tree completion after the parent exits", async () => {
  const modulePath = require.resolve("../out/bazaar/externalProcessRunner")
  const originalSpawn = childProcess.spawn
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
  const primary = new FakeChild(4321)
  const treeKiller = new FakeChild(9876)
  let spawnCalls = 0

  Object.defineProperty(process, "platform", { ...originalPlatform, value: "win32" })
  childProcess.spawn = (command, args) => {
    spawnCalls += 1
    if (spawnCalls === 1) return primary
    assert.equal(command, "taskkill")
    assert.deepEqual(args, ["/pid", "4321", "/T", "/F"])
    return treeKiller
  }
  delete require.cache[modulePath]

  try {
    const { ExternalProcessError, runExternalProcess } = require(modulePath)
    const controller = new AbortController()
    const running = runExternalProcess({
      command: "fake-command",
      args: [],
      cwd: process.cwd(),
      maxStdoutBytes: 1024,
      deadline: Object.freeze({ expires_at_monotonic_ms: performance.now() + 1000 }),
      signal: controller.signal
    })
    let settled = false
    void running.then(() => { settled = true }, () => { settled = true })

    controller.abort(new Error("operator cancelled"))
    await tick()
    assert.equal(spawnCalls, 2)

    primary.emit("exit", null, "SIGKILL")
    await tick()
    assert.equal(settled, false, "parent exit must not settle before taskkill /T completes")

    treeKiller.emit("close", 0)
    await assert.rejects(running, (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "cancelled")
      assert.equal(error.terminationCause, "user")
      return true
    })
  } finally {
    childProcess.spawn = originalSpawn
    Object.defineProperty(process, "platform", originalPlatform)
    delete require.cache[modulePath]
  }
})
