import { spawn, type ChildProcess, type ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"
import {
  cancellationKindFromSignal,
  createCancellationScope,
  type SharedAbsoluteDeadline
} from "../sharedProcessingBudgetRuntime"

type ExternalProcessChild = ChildProcessByStdio<null, Readable, Readable>

export type ExternalProcessErrorKind =
  | "timeout"
  | "cancelled"
  | "bufferExceeded"
  | "spawnFailure"
  | "nonZeroExit"

export type ExternalProcessTerminationCause =
  | "deadline"
  | "user"
  | "stdout_limit"
  | "stderr_limit"
  | "spawn_failure"
  | "non_zero_exit"

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

export interface ExternalProcessResult {
  stdout: Buffer
  stderr: Buffer
  exitCode: number
}

export class ExternalProcessError extends Error {
  constructor(
    message: string,
    readonly kind: ExternalProcessErrorKind,
    readonly command: string,
    readonly args: string[],
    readonly cwd: string,
    readonly stdout: Buffer = Buffer.alloc(0),
    readonly stderr: Buffer = Buffer.alloc(0),
    readonly exitCode?: number,
    readonly terminationCause?: ExternalProcessTerminationCause
  ) {
    super(message)
    this.name = "ExternalProcessError"
  }
}

const MIN_EXTERNAL_PROCESS_TIMEOUT_MS = 1_000
const MAX_EXTERNAL_PROCESS_TIMEOUT_MS = 600_000
const PROCESS_TERMINATION_WAIT_MS = 2_000
const PROCESS_TERMINATION_POLL_MS = 25
export const EXTERNAL_PROCESS_STDERR_MAX_BYTES = 256 * 1024

export function runExternalProcess(options: ExternalProcessOptions): Promise<ExternalProcessResult> {
  const maxStdoutBytes = positiveInteger(options.maxStdoutBytes, "maxStdoutBytes")
  const allowedExitCodes = new Set(options.allowedExitCodes ?? [0])
  const cancellation = createCancellationScope({
    deadline: options.deadline,
    signal: options.signal
  })

  if (cancellation.signal.aborted) {
    const cause = cancellationKindFromSignal(cancellation.signal)
    cancellation.dispose()
    return Promise.reject(new ExternalProcessError(
      cause === "deadline"
        ? `Command deadline expired before start: ${options.command}`
        : `Command cancelled before start: ${options.command}`,
      cause === "deadline" ? "timeout" : "cancelled",
      options.command,
      [...options.args],
      options.cwd,
      Buffer.alloc(0),
      Buffer.alloc(0),
      undefined,
      cause === "deadline" ? "deadline" : "user"
    ))
  }

  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = []
    const stderrChunks: Buffer[] = []
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false
    let child: ExternalProcessChild

    const stdout = (): Buffer => Buffer.concat(stdoutChunks)
    const stderr = (): Buffer => Buffer.concat(stderrChunks)

    const cleanup = (): void => {
      cancellation.signal.removeEventListener?.("abort", onAbort)
      cancellation.dispose()
    }

    const fail = (
      kind: ExternalProcessErrorKind,
      message: string,
      terminationCause: ExternalProcessTerminationCause,
      exitCode?: number
    ): void => {
      if (settled) return
      settled = true
      cleanup()
      const error = new ExternalProcessError(
        message,
        kind,
        options.command,
        [...options.args],
        options.cwd,
        stdout(),
        stderr(),
        exitCode,
        terminationCause
      )
      void terminateProcessTree(child).then(
        () => reject(error),
        () => reject(error)
      )
    }

    const onAbort = (): void => {
      const cause = cancellationKindFromSignal(cancellation.signal)
      fail(
        cause === "deadline" ? "timeout" : "cancelled",
        cause === "deadline"
          ? `Command deadline expired: ${options.command}`
          : `Command cancelled: ${options.command}`,
        cause === "deadline" ? "deadline" : "user"
      )
    }

    const abortIfCancelled = (): boolean => {
      try {
        cancellation.throwIfCancelled()
        return false
      } catch {
        onAbort()
        return true
      }
    }

    try {
      child = spawn(options.command, options.args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"]
      })
    } catch (error) {
      settled = true
      cleanup()
      reject(new ExternalProcessError(
        `Failed to start command ${options.command}: ${error instanceof Error ? error.message : String(error)}`,
        "spawnFailure",
        options.command,
        [...options.args],
        options.cwd,
        Buffer.alloc(0),
        Buffer.alloc(0),
        undefined,
        "spawn_failure"
      ))
      return
    }

    const collect = (
      target: Buffer[],
      chunk: Buffer | string,
      stream: "stdout" | "stderr",
      maximumBytes: number
    ): void => {
      if (settled || abortIfCancelled()) return
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      const usedBytes = stream === "stdout" ? stdoutBytes : stderrBytes
      const remainingBytes = maximumBytes - usedBytes
      const retainedBytes = Math.min(buffer.length, Math.max(0, remainingBytes))
      if (retainedBytes > 0) {
        target.push(buffer.subarray(0, retainedBytes))
        if (stream === "stdout") stdoutBytes += retainedBytes
        else stderrBytes += retainedBytes
      }
      if (retainedBytes < buffer.length) {
        fail(
          "bufferExceeded",
          `Command ${stream} exceeded ${maximumBytes} bytes: ${options.command}`,
          stream === "stdout" ? "stdout_limit" : "stderr_limit"
        )
      }
    }

    child.stdout.on("data", (chunk) => collect(stdoutChunks, chunk, "stdout", maxStdoutBytes))
    child.stderr.on("data", (chunk) => collect(
      stderrChunks,
      chunk,
      "stderr",
      EXTERNAL_PROCESS_STDERR_MAX_BYTES
    ))
    child.on("error", (error) => {
      if (settled || abortIfCancelled()) return
      fail(
        "spawnFailure",
        `Command failed to start ${options.command}: ${error.message}`,
        "spawn_failure"
      )
    })
    child.on("close", (code) => {
      if (settled || abortIfCancelled()) return
      const exitCode = typeof code === "number" ? code : -1
      if (allowedExitCodes.has(exitCode)) {
        settled = true
        cleanup()
        resolve({ stdout: stdout(), stderr: stderr(), exitCode })
        return
      }
      fail(
        "nonZeroExit",
        `Command exited with code ${exitCode}: ${options.command}`,
        "non_zero_exit",
        exitCode
      )
    })

    cancellation.signal.addEventListener?.("abort", onAbort, { once: true })
    abortIfCancelled()
  })
}

function positiveInteger(value: number | undefined, label: string): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    throw new Error(`${label} must be a positive finite number.`)
  }
  return Math.floor(value)
}

export function normalizeExternalProcessTimeoutMs(value: number): number {
  const timeout = positiveInteger(value, "timeoutMs")
  return Math.max(MIN_EXTERNAL_PROCESS_TIMEOUT_MS, Math.min(MAX_EXTERNAL_PROCESS_TIMEOUT_MS, timeout))
}

function terminateProcessTree(child: ExternalProcessChild): Promise<void> {
  return process.platform === "win32"
    ? terminateWindowsProcessTree(child)
    : terminatePosixProcessTree(child)
}

function terminateWindowsProcessTree(child: ExternalProcessChild): Promise<void> {
  return new Promise((resolve) => {
    let finished = false
    let childFinished = child.exitCode !== null || child.signalCode !== null
    let treeKillerFinished = false
    let treeKillerSucceeded = false
    let treeKiller: ChildProcess | undefined
    let timeout: ReturnType<typeof setTimeout>

    const finish = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      child.removeListener("exit", onChildFinished)
      child.removeListener("close", onChildFinished)
      treeKiller?.removeListener("error", onTreeKillerError)
      treeKiller?.removeListener("close", onTreeKillerClose)
      resolve()
    }

    const fallbackKillChild = (): void => {
      try {
        child.kill("SIGKILL")
      } catch {
        // Best effort: the process may already be gone.
      }
    }

    const maybeFinish = (): void => {
      if (treeKillerSucceeded || (treeKillerFinished && childFinished)) finish()
    }

    const onChildFinished = (): void => {
      childFinished = true
      maybeFinish()
    }

    const completeTreeKiller = (succeeded: boolean): void => {
      if (treeKillerFinished) return
      treeKillerFinished = true
      treeKillerSucceeded = succeeded
      if (!succeeded) fallbackKillChild()
      maybeFinish()
    }

    const onTreeKillerError = (): void => completeTreeKiller(false)
    const onTreeKillerClose = (code: number | null): void => completeTreeKiller(code === 0)

    timeout = setTimeout(() => {
      try {
        treeKiller?.kill("SIGKILL")
      } catch {
        // Best effort: taskkill may already be gone.
      }
      fallbackKillChild()
      finish()
    }, PROCESS_TERMINATION_WAIT_MS)

    child.once("exit", onChildFinished)
    child.once("close", onChildFinished)

    const pid = child.pid
    if (!pid) {
      treeKillerFinished = true
      fallbackKillChild()
      finish()
      return
    }

    try {
      treeKiller = spawn("taskkill", ["/pid", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore"
      })
      treeKiller.once("error", onTreeKillerError)
      treeKiller.once("close", onTreeKillerClose)
    } catch {
      completeTreeKiller(false)
    }
  })
}

function terminatePosixProcessTree(child: ExternalProcessChild): Promise<void> {
  return new Promise((resolve) => {
    let finished = false
    let childFinished = child.exitCode !== null || child.signalCode !== null
    let processGroupGone = false
    let timeout: ReturnType<typeof setTimeout>
    let poll: ReturnType<typeof setTimeout> | undefined

    const finish = (): void => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      if (poll !== undefined) clearTimeout(poll)
      child.removeListener("exit", onChildFinished)
      child.removeListener("close", onChildFinished)
      resolve()
    }

    const fallbackKill = (): void => {
      try {
        child.kill("SIGKILL")
      } catch {
        // Best effort: the process may already be gone.
      }
    }

    const maybeFinish = (): void => {
      if (childFinished && processGroupGone) finish()
    }

    const onChildFinished = (): void => {
      childFinished = true
      maybeFinish()
    }

    timeout = setTimeout(() => {
      fallbackKill()
      finish()
    }, PROCESS_TERMINATION_WAIT_MS)

    child.once("exit", onChildFinished)
    child.once("close", onChildFinished)

    const pid = child.pid
    if (!pid) {
      fallbackKill()
      finish()
      return
    }

    const pollProcessGroup = (): void => {
      if (finished) return
      processGroupGone = !posixProcessGroupExists(pid)
      if (processGroupGone) {
        maybeFinish()
        return
      }
      poll = setTimeout(pollProcessGroup, PROCESS_TERMINATION_POLL_MS)
    }

    try {
      process.kill(-pid, "SIGKILL")
    } catch {
      fallbackKill()
    }
    pollProcessGroup()
  })
}

function posixProcessGroupExists(pid: number): boolean {
  try {
    process.kill(-pid, 0)
    return true
  } catch (error) {
    return !(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { readonly code?: unknown }).code === "ESRCH"
    )
  }
}
