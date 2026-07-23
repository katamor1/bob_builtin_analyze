const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { test } = require("node:test")

const {
  EXTERNAL_PROCESS_STDERR_MAX_BYTES,
  ExternalProcessError,
  normalizeExternalProcessTimeoutMs,
  runExternalProcess
} = require("../out/bazaar/externalProcessRunner")

const cwd = process.cwd()

function runNode(script, options = {}) {
  return runExternalProcess({
    command: process.execPath,
    args: ["-e", script],
    cwd,
    maxStdoutBytes: 1024 * 1024,
    timeoutMs: 10000,
    allowedExitCodes: [0],
    ...options
  })
}

async function rejectsWithKind(promise, kind) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ExternalProcessError)
    assert.equal(error.kind, kind)
    return true
  })
}

test("external process runner terminates commands that exceed the hard timeout", async () => {
  const startedAt = Date.now()
  await rejectsWithKind(
    runNode("setInterval(() => {}, 1000)", { timeoutMs: 50 }),
    "timeout"
  )
  assert.ok(Date.now() - startedAt < 3000)
})

test("external process runner clamps timeouts to the safety range", () => {
  assert.equal(normalizeExternalProcessTimeoutMs(1), 1000)
  assert.equal(normalizeExternalProcessTimeoutMs(1000), 1000)
  assert.equal(normalizeExternalProcessTimeoutMs(600000), 600000)
  assert.equal(normalizeExternalProcessTimeoutMs(Number.MAX_SAFE_INTEGER), 600000)
})

test("external process runner propagates AbortSignal cancellation", async () => {
  const controller = new AbortController()
  const running = runNode("setInterval(() => {}, 1000)", { signal: controller.signal })
  setTimeout(() => controller.abort(), 50)
  await rejectsWithKind(running, "cancelled")
})

test("external process runner closes the preflight-to-listener cancellation race", async () => {
  let abortedReads = 0
  const signal = {
    get aborted() {
      abortedReads += 1
      return abortedReads >= 2
    },
    addEventListener() {},
    removeEventListener() {}
  }

  await rejectsWithKind(
    runNode("setInterval(() => {}, 1000)", { signal, timeoutMs: 100 }),
    "cancelled"
  )
  assert.ok(abortedReads >= 2)
})

test("external process runner fixes the stderr limit at 256 KiB", () => {
  assert.equal(EXTERNAL_PROCESS_STDERR_MAX_BYTES, 256 * 1024)
})

test("external process runner accepts stdout exactly at its configured limit", async () => {
  const result = await runNode("process.stdout.write('x'.repeat(1024))", { maxStdoutBytes: 1024 })
  assert.equal(result.stdout.length, 1024)
})

test("external process runner rejects stdout limit plus one and bounds retained stdout", async () => {
  await assert.rejects(
    runNode("process.stdout.write('x'.repeat(1025))", { maxStdoutBytes: 1024 }),
    (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "bufferExceeded")
      assert.equal(error.stdout.length, 1024)
      assert.ok(error.stderr.length <= EXTERNAL_PROCESS_STDERR_MAX_BYTES)
      return true
    }
  )
})

test("external process runner accepts stderr exactly at 256 KiB", async () => {
  const result = await runNode(`process.stderr.write('y'.repeat(${256 * 1024}))`, { maxStdoutBytes: 1024 })
  assert.equal(result.stderr.length, 256 * 1024)
})

test("external process runner rejects stderr limit plus one and bounds retained stderr", async () => {
  await assert.rejects(
    runNode(`process.stderr.write('y'.repeat(${256 * 1024 + 1}))`, { maxStdoutBytes: 1024 }),
    (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "bufferExceeded")
      assert.ok(error.stdout.length <= 1024)
      assert.equal(error.stderr.length, 256 * 1024)
      return true
    }
  )
})

test("external process runner maintains independent stdout and stderr budgets", async () => {
  const result = await runNode(
    `process.stdout.write('x'.repeat(1024)); process.stderr.write('y'.repeat(${256 * 1024}))`,
    { maxStdoutBytes: 1024 }
  )
  assert.equal(result.stdout.length, 1024)
  assert.equal(result.stderr.length, 256 * 1024)
})

test("external process runner rejects invalid stdout limits before spawning", () => {
  assert.throws(
    () => runNode("", { maxStdoutBytes: 0 }),
    /maxStdoutBytes.*positive finite number/i
  )
})

test("process runner settles only after an output-limit child exits", async () => {
  const pidFile = path.join(os.tmpdir(), `external-runner-${process.pid}-${Date.now()}.pid`)
  try {
    await assert.rejects(
      runNode(
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(process.pid)); ` +
          "process.stdout.write('x'.repeat(65536)); setInterval(() => {}, 1000)",
        { maxStdoutBytes: 1024 }
      ),
      (error) => error instanceof ExternalProcessError && error.kind === "bufferExceeded"
    )
    const pid = Number(fs.readFileSync(pidFile, "utf8"))
    assert.equal(isProcessAlive(pid), false, `child ${pid} was still alive after rejection`)
  } finally {
    fs.rmSync(pidFile, { force: true })
  }
})

test("external process runner accepts explicitly allowed non-zero exit codes", async () => {
  const result = await runNode("process.exit(1)", { allowedExitCodes: [0, 1] })
  assert.equal(result.exitCode, 1)
})

test("external process runner classifies disallowed exit codes", async () => {
  await assert.rejects(
    runNode("process.stderr.write('failed'); process.exit(7)"),
    (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "nonZeroExit")
      assert.equal(error.exitCode, 7)
      assert.match(error.stderr.toString("utf8"), /failed/)
      return true
    }
  )
})

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
