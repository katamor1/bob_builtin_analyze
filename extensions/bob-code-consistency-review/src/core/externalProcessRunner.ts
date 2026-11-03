import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"
import { createCancellationScope, cancellationKindFromSignal, type SharedAbsoluteDeadline } from "../sharedProcessingBudgetRuntime"

type ExternalProcessChild = ChildProcessByStdio<null, Readable, Readable>
export type ExternalProcessErrorKind = "timeout" | "cancelled" | "bufferExceeded" | "spawnFailure" | "nonZeroExit"
export type ExternalProcessTerminationCause = "deadline" | "user" | "stdout_limit" | "stderr_limit" | "spawn_failure" | "non_zero_exit"
export type ExternalProcessCleanupStatus = "controller_settled" | "best_effort_failure" | "bounded_wait_expired" | "not_required"
export interface ExternalProcessOptions {
  command: string
  args: string[]
  cwd: string
  env?: NodeJS.ProcessEnv
  maxStdoutBytes: number
  deadline: SharedAbsoluteDeadline
  allowedExitCodes?: number[]
  signal?: AbortSignal
}
export interface ExternalProcessResult { stdout: Buffer; stderr: Buffer; exitCode: number }
function causeFor(kind: ExternalProcessErrorKind, stream?: "stdout" | "stderr"): ExternalProcessTerminationCause {
  switch (kind) {
    case "timeout": return "deadline"
    case "cancelled": return "user"
    case "bufferExceeded": return stream === "stderr" ? "stderr_limit" : "stdout_limit"
    case "spawnFailure": return "spawn_failure"
    case "nonZeroExit": return "non_zero_exit"
  }
}
export class ExternalProcessError extends Error {
  constructor(message: string, readonly kind: ExternalProcessErrorKind, readonly command: string,
    readonly args: string[], readonly cwd: string, readonly stdout: Buffer = Buffer.alloc(0),
    readonly stderr: Buffer = Buffer.alloc(0), readonly exitCode?: number,
    readonly outputStream?: "stdout" | "stderr",
    readonly terminationCause: ExternalProcessTerminationCause = causeFor(kind, outputStream),
    readonly cleanupStatus: ExternalProcessCleanupStatus = "not_required") {
    super(message)
    this.name = "ExternalProcessError"
  }
}
const PROCESS_TERMINATION_WAIT_MS = 2000
const PROCESS_GROUP_POLL_MS = 25
export const EXTERNAL_PROCESS_STDERR_MAX_BYTES = 256 * 1024

export function runExternalProcess(options: ExternalProcessOptions): Promise<ExternalProcessResult> {
  if (!Number.isSafeInteger(options.maxStdoutBytes) || options.maxStdoutBytes <= 0) throw new Error("maxStdoutBytes must be a positive finite number and safe integer.")
  const allowedExitCodes = new Set(options.allowedExitCodes ?? [0])
  const scope = createCancellationScope({ deadline: options.deadline, signal: options.signal })
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [], stderrChunks: Buffer[] = []
    let stdoutBytes = 0, stderrBytes = 0, chosen = false, child: ExternalProcessChild | undefined
    const cleanup = (): void => {
      scope.dispose()
      scope.signal.removeEventListener("abort", onAbort)
      child?.stdout.removeListener("data", onStdout)
      child?.stderr.removeListener("data", onStderr)
    }
    const fail = (kind: ExternalProcessErrorKind, message: string, exitCode?: number, outputStream?: "stdout" | "stderr"): void => {
      if (chosen) return
      chosen = true
      cleanup()
      const stdout = Buffer.concat(stdoutChunks), stderr = Buffer.concat(stderrChunks)
      const complete = (status: ExternalProcessCleanupStatus): void => reject(new ExternalProcessError(message, kind, options.command, [...options.args], options.cwd, stdout, stderr, exitCode, outputStream, causeFor(kind, outputStream), status))
      if (!child) { complete("not_required"); return }
      void terminateProcessTree(child).then(complete, () => complete("best_effort_failure"))
    }
    const check = (): boolean => {
      if (chosen) return true
      const kind = cancellationKindFromSignal(scope.signal)
      if (kind === undefined) return false
      fail(kind === "deadline" ? "timeout" : "cancelled", kind === "deadline" ? `Command deadline reached: ${options.command}` : `Command cancelled: ${options.command}`)
      return true
    }
    const onAbort = (): void => { check() }
    const collect = (target: Buffer[], chunk: Buffer | string, stream: "stdout" | "stderr", maximum: number): void => {
      if (check()) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const used = stream === "stdout" ? stdoutBytes : stderrBytes
      const retained = Math.min(buffer.length, Math.max(0, maximum - used))
      if (retained > 0) {
        target.push(Buffer.from(buffer.subarray(0, retained)))
        if (stream === "stdout") stdoutBytes += retained
        else stderrBytes += retained
      }
      if (retained < buffer.length) fail("bufferExceeded", `Command ${stream} exceeded ${maximum} bytes: ${options.command}`, undefined, stream)
    }
    const onStdout = (chunk: Buffer | string): void => collect(stdoutChunks, chunk, "stdout", options.maxStdoutBytes)
    const onStderr = (chunk: Buffer | string): void => collect(stderrChunks, chunk, "stderr", EXTERNAL_PROCESS_STDERR_MAX_BYTES)
    if (check()) return
    try {
      // No consumer duration is re-normalized between the last check and spawn.
      if (check()) return
      child = spawn(options.command, options.args, { cwd: options.cwd, env: options.env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] })
    } catch (error) {
      if (!check()) fail("spawnFailure", `Failed to start command ${options.command}: ${error instanceof Error ? error.message : "spawn failed"}`)
      return
    }
    child.stdout.on("data", onStdout)
    child.stderr.on("data", onStderr)
    child.on("error", error => { if (!check()) fail("spawnFailure", `Command failed to start ${options.command}: ${error.message}`) })
    child.on("close", code => {
      if (check()) return
      const exitCode = typeof code === "number" ? code : -1
      if (!allowedExitCodes.has(exitCode)) { fail("nonZeroExit", `Command exited with code ${exitCode}: ${options.command}`, exitCode); return }
      chosen = true
      cleanup()
      resolve({ stdout: Buffer.concat(stdoutChunks), stderr: Buffer.concat(stderrChunks), exitCode })
    })
    scope.signal.addEventListener("abort", onAbort, { once: true })
    check()
  })
}

function terminateProcessTree(child: ExternalProcessChild): Promise<ExternalProcessCleanupStatus> {
  return process.platform === "win32" ? terminateWindowsProcessTree(child) : terminatePosixProcessTree(child)
}
function terminateWindowsProcessTree(child: ExternalProcessChild): Promise<ExternalProcessCleanupStatus> {
  return new Promise(resolve => {
    let finished = false, childFinished = child.exitCode !== null || child.signalCode !== null
    let killerFinished = false, killerSucceeded = false, killer: ChildProcess | undefined
    const finish = (status: ExternalProcessCleanupStatus): void => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      child.removeListener("exit", onChildFinished); child.removeListener("close", onChildFinished)
      killer?.removeListener("error", onKillerError); killer?.removeListener("close", onKillerClose)
      resolve(status)
    }
    const fallback = (): void => { try { child.kill("SIGKILL") } catch { /* Bounded best effort. */ } }
    const maybeFinish = (): void => {
      if (killerSucceeded) finish("controller_settled")
      else if (killerFinished && childFinished) finish("best_effort_failure")
    }
    const onChildFinished = (): void => { childFinished = true; maybeFinish() }
    const completeKiller = (succeeded: boolean): void => {
      if (killerFinished) return
      killerFinished = true; killerSucceeded = succeeded
      if (!succeeded) fallback()
      maybeFinish()
    }
    const onKillerError = (): void => completeKiller(false)
    const onKillerClose = (code: number | null): void => completeKiller(code === 0)
    const timeout = setTimeout(() => {
      try { killer?.kill("SIGKILL") } catch { /* Bounded best effort. */ }
      fallback(); finish("bounded_wait_expired")
    }, PROCESS_TERMINATION_WAIT_MS)
    child.once("exit", onChildFinished); child.once("close", onChildFinished)
    // Parent exit alone says nothing about descendants, so still attempt /T.
    if (!child.pid) { completeKiller(false); return }
    try {
      killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" })
      killer.once("error", onKillerError); killer.once("close", onKillerClose)
    } catch { completeKiller(false) }
  })
}
function terminatePosixProcessTree(child: ExternalProcessChild): Promise<ExternalProcessCleanupStatus> {
  return new Promise(resolve => {
    let finished = false, childFinished = child.exitCode !== null || child.signalCode !== null, failed = false
    let poll: ReturnType<typeof setTimeout> | undefined
    const finish = (status: ExternalProcessCleanupStatus): void => {
      if (finished) return
      finished = true; clearTimeout(timeout); clearTimeout(poll)
      child.removeListener("exit", onChildFinished); child.removeListener("close", onChildFinished)
      resolve(status)
    }
    const fallback = (): void => { try { child.kill("SIGKILL") } catch { /* Bounded best effort. */ } }
    const observe = (): void => {
      if (finished) return
      clearTimeout(poll)
      let groupAbsent = !child.pid
      if (child.pid) {
        try { process.kill(-child.pid, 0) }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") groupAbsent = true; else failed = true }
      }
      if (childFinished && groupAbsent) { finish(failed ? "best_effort_failure" : "controller_settled"); return }
      poll = setTimeout(observe, PROCESS_GROUP_POLL_MS)
    }
    const onChildFinished = (): void => { childFinished = true; observe() }
    const timeout = setTimeout(() => { fallback(); finish("bounded_wait_expired") }, PROCESS_TERMINATION_WAIT_MS)
    child.once("exit", onChildFinished); child.once("close", onChildFinished)
    if (child.pid) {
      try { process.kill(-child.pid, "SIGKILL") }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") { failed = true; fallback() } }
    } else { failed = true; fallback() }
    observe()
  })
}
