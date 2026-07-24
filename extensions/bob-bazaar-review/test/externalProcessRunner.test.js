const assert = require("node:assert/strict")
const childProcess = require("node:child_process")
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
const { createAbsoluteDeadline } = require("../out/sharedProcessingBudgetRuntime")

const cwd = process.cwd()

function runNode(script, options = {}) {
  return runExternalProcess({
    command: process.execPath,
    args: ["-e", script],
    cwd,
    maxStdoutBytes: 1024 * 1024,
    deadline: createAbsoluteDeadline(10_000),
    allowedExitCodes: [0],
    ...options
  })
}

async function rejectsWithKind(promise, kind, terminationCause) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof ExternalProcessError)
    assert.equal(error.kind, kind)
    if (terminationCause) assert.equal(error.terminationCause, terminationCause)
    return true
  })
}

test("external process runner terminates commands when the absolute deadline expires", async () => {
  const startedAt = Date.now()
  await rejectsWithKind(
    runNode("setInterval(() => {}, 1000)", { deadline: createAbsoluteDeadline(50) }),
    "timeout",
    "deadline"
  )
  assert.ok(Date.now() - startedAt < 3000)
})

test("external process runner rejects a pre-expired deadline before spawning", async () => {
  await rejectsWithKind(
    runNode("process.exit(99)", { deadline: Object.freeze({ expires_at_monotonic_ms: 0 }) }),
    "timeout",
    "deadline"
  )
})

test("external process timeout configuration clamps only at the operation boundary", () => {
  assert.equal(normalizeExternalProcessTimeoutMs(1), 1000)
  assert.equal(normalizeExternalProcessTimeoutMs(1000), 1000)
  assert.equal(normalizeExternalProcessTimeoutMs(600000), 600000)
  assert.equal(normalizeExternalProcessTimeoutMs(Number.MAX_SAFE_INTEGER), 600000)
})

test("external process runner preserves user cancellation as the termination cause", async () => {
  const controller = new AbortController()
  const running = runNode("setInterval(() => {}, 1000)", { signal: controller.signal })
  setTimeout(() => controller.abort(new Error("operator cancelled")), 50)
  await rejectsWithKind(running, "cancelled", "user")
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
    runNode("setInterval(() => {}, 1000)", { signal }),
    "cancelled",
    "user"
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

test("external process runner rejects stdout limit plus one and records stdout_limit", async () => {
  await assert.rejects(
    runNode("process.stdout.write('x'.repeat(1025))", { maxStdoutBytes: 1024 }),
    (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "bufferExceeded")
      assert.equal(error.terminationCause, "stdout_limit")
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

test("external process runner rejects stderr limit plus one and records stderr_limit", async () => {
  await assert.rejects(
    runNode(`process.stderr.write('y'.repeat(${256 * 1024 + 1}))`, { maxStdoutBytes: 1024 }),
    (error) => {
      assert.ok(error instanceof ExternalProcessError)
      assert.equal(error.kind, "bufferExceeded")
      assert.equal(error.terminationCause, "stderr_limit")
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
      (error) => error instanceof ExternalProcessError
        && error.kind === "bufferExceeded"
        && error.terminationCause === "stdout_limit"
    )
    const pid = Number(fs.readFileSync(pidFile, "utf8"))
    assert.equal(isProcessAlive(pid), false, `child ${pid} was still alive after rejection`)
  } finally {
    fs.rmSync(pidFile, { force: true })
  }
})

test("POSIX deadline termination kills descendants in the command process group", { skip: process.platform === "win32" }, async (t) => {
  const pidFile = path.join(os.tmpdir(), `external-descendant-${process.pid}-${Date.now()}.pid`)
  t.after(() => fs.rmSync(pidFile, { force: true }))
  const parentScript = [
    "const cp=require('node:child_process')",
    `const child=cp.spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'})`,
    `require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid))`,
    "setInterval(()=>{},1000)"
  ].join(";")

  await rejectsWithKind(
    runNode(parentScript, { deadline: createAbsoluteDeadline(100) }),
    "timeout",
    "deadline"
  )
  const descendantPid = Number(fs.readFileSync(pidFile, "utf8"))
  await waitForDeath(descendantPid)
  assert.equal(isProcessAlive(descendantPid), false, `descendant ${descendantPid} survived process-tree termination`)
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
      assert.equal(error.terminationCause, "non_zero_exit")
      assert.equal(error.exitCode, 7)
      assert.match(error.stderr.toString("utf8"), /failed/)
      return true
    }
  )
})

async function waitForDeath(pid) {
  const deadline = Date.now() + 2000
  while (Date.now() < deadline && isProcessAlive(pid)) {
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
