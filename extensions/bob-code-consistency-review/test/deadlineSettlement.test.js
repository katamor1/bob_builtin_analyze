"use strict"

const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
const { EventEmitter } = require("node:events")
const test = require("node:test")

class FakeChild extends EventEmitter {
  constructor() {
    super()
    this.pid = undefined
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

test("an allowed exit cannot settle after the absolute deadline when its timer callback is delayed", async () => {
  const runnerPath = require.resolve("../out/core/externalProcessRunner")
  const sharedPath = require.resolve("../out/sharedProcessingBudgetRuntime")
  const originalSpawn = childProcess.spawn
  const originalShared = require.cache[sharedPath]
  const child = new FakeChild()
  const signal = {
    aborted: false,
    reason: undefined,
    addEventListener() {},
    removeEventListener() {}
  }
  let expired = false
  let checked = 0
  const deadlineReason = Object.assign(new Error("deadline"), {
    code: "processing_cancelled",
    kind: "deadline"
  })

  require.cache[sharedPath] = {
    id: sharedPath,
    filename: sharedPath,
    loaded: true,
    exports: {
      createCancellationScope: () => ({
        signal,
        throwIfCancelled() {
          checked += 1
          if (!expired) return
          signal.aborted = true
          signal.reason = deadlineReason
          throw deadlineReason
        },
        dispose() {}
      }),
      cancellationKindFromSignal: () => signal.aborted ? "deadline" : undefined
    },
    children: [],
    paths: []
  }
  childProcess.spawn = () => child
  delete require.cache[runnerPath]

  try {
    const { ExternalProcessError, runExternalProcess } = require(runnerPath)
    const running = runExternalProcess({
      command: "fake-command",
      args: [],
      cwd: process.cwd(),
      maxStdoutBytes: 1024,
      deadline: Object.freeze({ expires_at_monotonic_ms: Number.MAX_SAFE_INTEGER })
    })
    expired = true
    child.exitCode = 0
    child.emit("close", 0)

    await assert.rejects(running, (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "timeout")
      assert.equal(error.terminationCause, "deadline")
      return true
    })
    assert.ok(checked >= 2, `expected initial and terminal cancellation checks, got ${checked}`)
  } finally {
    childProcess.spawn = originalSpawn
    delete require.cache[runnerPath]
    if (originalShared) require.cache[sharedPath] = originalShared
    else delete require.cache[sharedPath]
  }
})
