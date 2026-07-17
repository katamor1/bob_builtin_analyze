const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

function createDeterministicClock(values, label = "deterministic clock") {
  const sequence = [...values]
  let index = 0
  const clock = () => {
    if (index >= sequence.length) throw new Error(`${label} exhausted after ${index} calls.`)
    return sequence[index++]
  }
  clock.callCount = () => index
  clock.remaining = () => sequence.length - index
  return clock
}

function createDeterministicDateClock(values, label = "deterministic date clock") {
  const clock = createDeterministicClock(values, label)
  const dateClock = () => new Date(clock())
  dateClock.callCount = clock.callCount
  dateClock.remaining = clock.remaining
  return dateClock
}

function createUuidSequence(values, label = "UUID sequence") {
  const sequence = [...values]
  let index = 0
  const next = () => {
    if (index >= sequence.length) throw new Error(`${label} exhausted after ${index} calls.`)
    return sequence[index++]
  }
  next.callCount = () => index
  next.remaining = () => sequence.length - index
  return next
}

async function withMockedRandomUUID(values, operation) {
  const original = crypto.randomUUID
  const sequence = createUuidSequence(values, "crypto.randomUUID sequence")
  crypto.randomUUID = sequence
  try {
    return await operation(sequence)
  } finally {
    crypto.randomUUID = original
  }
}

async function withFixedDate(isoTimestamp, operation) {
  const OriginalDate = global.Date
  const timestamp = OriginalDate.parse(isoTimestamp)
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid fixed timestamp: ${isoTimestamp}`)
  class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length === 0 ? [timestamp] : args))
    }

    static now() {
      return timestamp
    }
  }
  global.Date = FixedDate
  try {
    return await operation()
  } finally {
    global.Date = OriginalDate
  }
}

function createTempRunRoot(t, prefix = "workflow-reproducible-runtime-") {
  const created = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  const root = fs.realpathSync.native?.(created) ?? fs.realpathSync(created)
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

function readExactBytes(root, ...segments) {
  return fs.readFileSync(path.join(root, ...segments))
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function waitForChildReady(child, expected = "READY\n", options = {}) {
  if (!child.stdout) throw new Error("Child process stdout must be piped for a readiness handshake.")
  const marker = Buffer.isBuffer(expected) ? expected : Buffer.from(expected)
  const timeoutMs = options.timeoutMs ?? 5_000
  const label = options.label ?? "child readiness"
  return new Promise((resolve, reject) => {
    let output = Buffer.alloc(0)
    const cleanup = () => {
      clearTimeout(timer)
      child.stdout.off("data", onData)
      child.stdout.off("error", onError)
      child.off("exit", onExit)
    }
    const onData = (chunk) => {
      output = Buffer.concat([output, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)])
      if (output.includes(marker)) {
        cleanup()
        resolve(output)
      }
    }
    const onError = (error) => {
      cleanup()
      reject(error)
    }
    const onExit = (code, signal) => {
      cleanup()
      reject(new Error(`${label} failed: child exited with code ${code} and signal ${signal}.`))
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`${label} timed out after ${timeoutMs}ms.`))
    }, timeoutMs)
    child.stdout.on("data", onData)
    child.stdout.once("error", onError)
    child.once("exit", onExit)
  })
}

async function childReadinessHandshake(child, options = {}) {
  const output = await waitForChildReady(child, options.ready ?? "READY\n", options)
  if (!child.stdin) throw new Error("Child process stdin must be piped for a readiness handshake.")
  await new Promise((resolve, reject) => {
    child.stdin.write(options.signal ?? "GO\n", (error) => error ? reject(error) : resolve())
  })
  return output
}

module.exports = {
  childReadinessHandshake,
  createDeterministicClock,
  createDeterministicDateClock,
  createTempRunRoot,
  createUuidSequence,
  readExactBytes,
  sha256,
  waitForChildReady,
  withFixedDate,
  withMockedRandomUUID
}
