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
const futureDeadline = () => Object.freeze({ expires_at_monotonic_ms: performance.now() + 1000 })

async function withWindowsRunner(run) {
  const modulePath = require.resolve("../out/bazaar/externalProcessRunner")
  const originalSpawn = childProcess.spawn
  const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")
  Object.defineProperty(process, "platform", { ...originalPlatform, value: "win32" })
  delete require.cache[modulePath]
  try {
    return await run({ modulePath, originalSpawn })
  } finally {
    childProcess.spawn = originalSpawn
    Object.defineProperty(process, "platform", originalPlatform)
    delete require.cache[modulePath]
  }
}

test("Windows cancellation waits for taskkill tree completion after the parent exits", async () => {
  await withWindowsRunner(async ({ modulePath }) => {
    const primary = new FakeChild(4321)
    const treeKiller = new FakeChild(9876)
    let spawnCalls = 0
    childProcess.spawn = (command, args) => {
      spawnCalls += 1
      if (spawnCalls === 1) return primary
      assert.equal(command, "taskkill")
      assert.deepEqual(args, ["/pid", "4321", "/T", "/F"])
      return treeKiller
    }

    const { ExternalProcessError, runExternalProcess } = require(modulePath)
    const controller = new AbortController()
    const running = runExternalProcess({
      command: "fake-command",
      args: [],
      cwd: process.cwd(),
      maxStdoutBytes: 1024,
      deadline: futureDeadline(),
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
  })
})

test("Windows non-zero failure invokes taskkill and waits after the parent already exited", async () => {
  await withWindowsRunner(async ({ modulePath }) => {
    const primary = new FakeChild(5432)
    const treeKiller = new FakeChild(9877)
    let spawnCalls = 0
    childProcess.spawn = (command, args) => {
      spawnCalls += 1
      if (spawnCalls === 1) return primary
      assert.equal(command, "taskkill")
      assert.deepEqual(args, ["/pid", "5432", "/T", "/F"])
      return treeKiller
    }

    const { ExternalProcessError, runExternalProcess } = require(modulePath)
    const running = runExternalProcess({
      command: "fake-command",
      args: [],
      cwd: process.cwd(),
      maxStdoutBytes: 1024,
      deadline: futureDeadline()
    })
    let settled = false
    void running.then(() => { settled = true }, () => { settled = true })

    primary.exitCode = 7
    primary.emit("close", 7)
    await tick()
    assert.equal(spawnCalls, 2)
    assert.equal(settled, false, "non-zero parent exit must wait for taskkill /T")

    treeKiller.emit("close", 0)
    await assert.rejects(running, (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "nonZeroExit")
      assert.equal(error.exitCode, 7)
      assert.equal(error.terminationCause, "non_zero_exit")
      return true
    })
  })
})
