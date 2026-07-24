"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const { EventEmitter } = require("node:events")
const { performance } = require("node:perf_hooks")
const test = require("node:test")

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

test("POSIX rejection waits until the entire process group is gone after the parent exits", async () => {
  const modulePath = require.resolve("../out/bazaar/externalProcessRunner")
  const originalSpawn = childProcess.spawn
  const originalKill = process.kill
  const primary = new FakeChild(4321)
  let groupExists = true
  let groupKillCalls = 0

  childProcess.spawn = () => primary
  process.kill = (pid, signal) => {
    assert.equal(pid, -4321)
    if (signal === "SIGKILL") {
      groupKillCalls += 1
      return true
    }
    assert.equal(signal, 0)
    if (groupExists) return true
    const error = new Error("no such process group")
    error.code = "ESRCH"
    throw error
  }
  delete require.cache[modulePath]

  try {
    const { ExternalProcessError, runExternalProcess } = require(modulePath)
    const running = runExternalProcess({
      command: "fake-command",
      args: [],
      cwd: process.cwd(),
      maxStdoutBytes: 1024,
      deadline: Object.freeze({ expires_at_monotonic_ms: performance.now() + 1_000 })
    })
    let settled = false
    void running.then(() => { settled = true }, () => { settled = true })

    primary.exitCode = 7
    primary.emit("close", 7)
    await tick()
    assert.equal(groupKillCalls, 1)
    assert.equal(settled, false, "parent close must not settle while its process group still exists")

    groupExists = false
    await assert.rejects(running, (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "nonZeroExit")
      assert.equal(error.terminationCause, "non_zero_exit")
      return true
    })
  } finally {
    childProcess.spawn = originalSpawn
    process.kill = originalKill
    delete require.cache[modulePath]
  }
})
