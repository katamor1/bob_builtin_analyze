import { createProcessingOperation, createAbsoluteDeadline, remainingDeadlineMilliseconds, type SharedAbsoluteDeadline } from "../sharedProcessingBudgetRuntime"
import {
  normalizeChangedFilePathStrict,
  resolveWorkspacePathStrict
} from "./fileSystem"
import { parseDiffFixtureText } from "./diffFixture"
import { classifyLanguageFromPath } from "./languageClassifier"
import { isUtf8 } from "node:buffer"
import { decodeTextBuffer, normalizeTextEncoding } from "./textEncoding"
import { assertDocumentNotCancelled, assertProcessingOperation, BoundedDocumentError, ProcessingBudgetError, createReviewDocumentProfile, type ProcessingOperation, type ProcessingBudgetReservation, type SharedProcessingBudgetLimits } from "../sharedProcessingBudgetRuntime"
import { readStableDiffFixtureText } from "./stableReviewInput"
import {
  maxVcsProcessBufferBytes,
  normalizeReviewProcessingLimits,
  truncateUtf8Text,
  type ReviewProcessingLimits
} from "./limits"
import { ExternalProcessError, runExternalProcess } from "./externalProcessRunner"
import type { DiffSummary } from "./diffTypes"
import type { ReviewInput } from "./reviewTypes"

type VcsKind = "git" | "bazaar"
const MAX_BAZAAR_REVISION_SPEC_LENGTH = 128
const MIN_VCS_COMMAND_TIMEOUT_MS = 1_000
const DEFAULT_VCS_COMMAND_TIMEOUT_MS = 120_000
const MAX_VCS_COMMAND_TIMEOUT_MS = 600_000

export interface CollectGitDiffOptions {
  workspaceRoot: string
  diffFixturePath?: string
  bzrPath?: string
  textEncoding?: string
  limits?: Partial<ReviewProcessingLimits>
  commandTimeoutMs?: number
  deadline?: SharedAbsoluteDeadline
  signal?: AbortSignal
  processingOperation?: ProcessingOperation
  processingBudgetLimits?: Readonly<Partial<SharedProcessingBudgetLimits>>
}
// Preserve unrelated already-rejected failures, including a synchronous spawn
// failure with no child. Controlled transport settlement still checks the owner.
function isSettledProcessFailure(error: unknown): error is ExternalProcessError {
  return error instanceof ExternalProcessError && (error.kind !== "spawnFailure" || error.cleanupStatus !== "not_required")
}
interface CollectedDiff { readonly diff: DiffSummary; readonly rawDiffOverflow: boolean }
interface BoundedCommandText { readonly text: string; readonly overflow: boolean }
const RAW_DIFF_TRUNCATION_SUFFIX = "\n\n[truncated: maxRawDiffBytes]\n"

export async function collectGitDiff(reviewInput: ReviewInput, options: CollectGitDiffOptions): Promise<DiffSummary> {
  const limits = normalizeReviewProcessingLimits(options.limits)
  const owned = options.processingOperation === undefined
  const operation = options.processingOperation ?? createProcessingOperation({ profile: createReviewDocumentProfile(limits, options.processingBudgetLimits), signal: options.signal, deadline: options.deadline ?? createAbsoluteDeadline(normalizeCommandTimeout(options.commandTimeoutMs)) })
  assertProcessingOperation(operation)
  try {
  if ((!owned && options.signal !== undefined && options.signal !== operation.signal)
    || JSON.stringify(operation.profile) !== JSON.stringify(createReviewDocumentProfile(limits, options.processingBudgetLimits))) {
    throw new BoundedDocumentError("bounded_document_input_invalid", { phase: "input" })
  }
  if (options.deadline !== undefined) {
    remainingDeadlineMilliseconds(options.deadline, 0)
    if (Object.getOwnPropertyDescriptor(options.deadline, "expires_at_monotonic_ms")?.value !== operation.deadline.expires_at_monotonic_ms) throw new BoundedDocumentError("bounded_document_input_invalid")
  }
  const signal = operation.signal
  assertDocumentNotCancelled(signal)
  if (options.diffFixturePath) {
    const fixturePath = resolveWorkspacePathStrict(options.workspaceRoot, options.diffFixturePath, "diffFixturePath")
    const parent = operation.snapshot().categories.find(row => row.category === "total_operation_input_bytes")
    if (!parent || parent.scope !== "operation") throw new ProcessingBudgetError("processing_budget_internal_invariant", "missing operation input budget")
    const maximumBytes = Math.min(maxVcsProcessBufferBytes(operation.profile.limits.raw_diff_bytes), parent.remaining)
    const fixtureText = await readStableDiffFixtureText({ filePath: fixturePath, maximumBytes, textEncoding: options.textEncoding ?? "auto", signal })
    assertDocumentNotCancelled(signal)
    const fixture = parseDiffFixtureText(fixtureText)
    return finalizeDiffProcessingBudget(fixture, operation)
  }
  const vcs = normalizeVcs(reviewInput.review.vcs)
  const vcsRoot = resolveVcsRoot(options.workspaceRoot, reviewInput.review.vcs_root)
  let collected: CollectedDiff
  try {
    collected = vcs === "bazaar"
      ? await collectBazaarDiff(reviewInput, { ...options, vcsRoot, limits, signal, deadline: operation.deadline, rawDiffLimit: operation.profile.limits.raw_diff_bytes })
      : await collectStandardGitDiff(reviewInput, { ...options, vcsRoot, limits, signal, deadline: operation.deadline, rawDiffLimit: operation.profile.limits.raw_diff_bytes })
  } catch (error) {
    // The transport has settled. Apply the operation reason outside raw-output
    // parsing, since an operator's Error can itself be a stdout-limit error.
    if (isSettledProcessFailure(error)) assertDocumentNotCancelled(signal)
    throw error
  }
  assertDocumentNotCancelled(signal)
  return finalizeDiffProcessingBudget(collected.diff, operation, collected.rawDiffOverflow)
  } catch (error) { if (isSettledProcessFailure(error)) operation.throwIfCancelled(); throw error }
  finally { if (owned) operation.dispose() }
}

async function collectStandardGitDiff(reviewInput: ReviewInput, options: {
  workspaceRoot: string
  vcsRoot: string
  textEncoding?: string
  limits: ReviewProcessingLimits
  deadline: SharedAbsoluteDeadline
  signal?: AbortSignal
  rawDiffLimit: number
}): Promise<CollectedDiff> {
  const base = await resolveGitRevision(reviewInput.review.base, options.vcsRoot, options.textEncoding, options.deadline, options.signal)
  const head = await resolveGitRevision(reviewInput.review.head, options.vcsRoot, options.textEncoding, options.deadline, options.signal)
  const processBufferBytes = maxVcsProcessBufferBytes(options.limits.maxRawDiffBytes)
  const nameStatus = await runGitText(["diff", "--find-renames", "--name-status", "-z", base, head], options.vcsRoot, processBufferBytes, options.textEncoding, options.deadline, options.signal)
  const numstat = await runGitText(["diff", "--find-renames", "--numstat", "-z", base, head], options.vcsRoot, processBufferBytes, options.textEncoding, options.deadline, options.signal)
  const unifiedDiff = await runGitTextAllowingOverflow(["diff", "--find-renames", "--unified=80", base, head], options.vcsRoot, options.rawDiffLimit, options.textEncoding, options.deadline, options.signal)

  const counts = parseNumstatZ(numstat)
  const files = parseNameStatusZ(nameStatus).map(({ statusToken, filePath }) => {
    const normalizedPath = normalizeChangedFilePathStrict(filePath)
    return buildChangedFile(normalizedPath, statusFromGit(statusToken), counts.get(normalizedPath))
  })

  return { diff: { vcs: "git", vcsRoot: options.vcsRoot, base, head, files, unifiedDiff: unifiedDiff.text, warnings: [] }, rawDiffOverflow: unifiedDiff.overflow }
}

async function collectBazaarDiff(reviewInput: ReviewInput, options: {
  workspaceRoot: string
  vcsRoot: string
  bzrPath?: string
  textEncoding?: string
  limits: ReviewProcessingLimits
  deadline: SharedAbsoluteDeadline
  signal?: AbortSignal
  rawDiffLimit: number
}): Promise<CollectedDiff> {
  const bzrPath = options.bzrPath?.trim() || "bzr"
  const base = validateBazaarRevision(reviewInput.review.base)
  const head = validateBazaarRevision(reviewInput.review.head)
  const revisionRange = `${base}..${head}`
  // Bazaar の alias は差分本文と副作用を変え得るため、収集系でも bzr --no-aliases を必ず先頭に置く。
  const unifiedDiff = await runCommandTextAllowingOverflow(
    bzrPath,
    ["--no-aliases", "diff", "-r", revisionRange],
    options.vcsRoot,
    options.rawDiffLimit,
    [0, 1],
    options.textEncoding,
    { BZR_PROGRESS_BAR: "none" },
    options.deadline,
    options.signal
  )
  if (unifiedDiff.overflow) throw new Error(`Bazaar diff exceeded raw_diff_bytes (${options.rawDiffLimit}); complete changed-file metadata is unavailable`)
  const files = parseBazaarDiffFiles(unifiedDiff.text)
  return { diff: { vcs: "bazaar", vcsRoot: options.vcsRoot, base, head, files, unifiedDiff: unifiedDiff.text, warnings: [] }, rawDiffOverflow: false }
}

async function resolveGitRevision(
  revision: string,
  cwd: string,
  textEncoding = "auto",
  deadline?: SharedAbsoluteDeadline,
  signal?: AbortSignal
): Promise<string> {
  const trimmed = revision.trim()
  if (!trimmed) throw new Error("Invalid Git revision: revision is empty")

  try {
    // Git revision は rev-parse --verify --end-of-options で commit SHA に固定し、以降の diff へ曖昧指定を渡さない。
    const output = await runGitText(["rev-parse", "--verify", "--end-of-options", `${trimmed}^{commit}`], cwd, 1024 * 1024, textEncoding, deadline, signal)
    const sha = output.trim().split(/\r?\n/).at(-1) ?? ""
    if (/^[0-9a-f]{40}$/i.test(sha)) return sha.toLowerCase()
  } catch (error) {
    if (isSettledProcessFailure(error)) assertDocumentNotCancelled(signal)
    if (!(error instanceof ExternalProcessError) || error.kind !== "nonZeroExit") throw error
    // rev-parse が対象を解決できない場合だけ、下の正規化済み validation error に揃える。
  }

  throw new Error(`Invalid Git revision: ${formatRevisionForError(revision)}`)
}

export function validateBazaarRevision(revision: string): string {
  const trimmed = revision.trim()
  if (/[\0-\x1F\x7F]/u.test(revision)) {
    throw new Error(`安全でない Bazaar リビジョン指定です: ${formatRevisionForError(revision)}`)
  }
  if (!trimmed) throw new Error("リビジョンを入力してください。")
  if (trimmed.length > MAX_BAZAAR_REVISION_SPEC_LENGTH) {
    throw new Error(`Bazaar リビジョン指定が長すぎます: ${formatRevisionForError(revision)}`)
  }
  if (trimmed.startsWith("-") || trimmed.includes("..")) {
    throw new Error(`安全でない Bazaar リビジョン指定です: ${formatRevisionForError(revision)}`)
  }
  if (!/^[A-Za-z0-9_.:+@/=-]+$/.test(trimmed)) {
    throw new Error(`安全でない Bazaar リビジョン指定です: ${formatRevisionForError(revision)}`)
  }
  return trimmed
}

function formatRevisionForError(revision: string): string {
  return revision.replace(/[\0-\x1F\x7F]/g, " ").trim()
}

async function runGitText(
  args: string[],
  cwd: string,
  maxBuffer: number,
  textEncoding = "auto",
  deadline?: SharedAbsoluteDeadline,
  signal?: AbortSignal
): Promise<string> {
  return runCommandText("git", args, cwd, maxBuffer, [0], textEncoding, undefined, deadline, signal)
}

async function runGitTextAllowingOverflow(
  args: string[], cwd: string, maximumBytes: number, textEncoding = "auto", deadline?: SharedAbsoluteDeadline, signal?: AbortSignal
): Promise<BoundedCommandText> {
  return runCommandTextAllowingOverflow("git", args, cwd, maximumBytes, [0], textEncoding, undefined, deadline, signal)
}

async function runCommandTextAllowingOverflow(
  command: string, args: string[], cwd: string, maximumBytes: number, allowedExitCodes: number[],
  textEncoding = "auto", env?: Record<string, string>, deadline?: SharedAbsoluteDeadline, signal?: AbortSignal
): Promise<BoundedCommandText> {
  let bytes: Buffer, sourceOverflow = false
  try { bytes = await runCommandBuffer(command, args, cwd, maximumBytes + 1, allowedExitCodes, env, deadline, signal) }
  catch (error) {
    if (isSettledProcessFailure(error)) assertDocumentNotCancelled(signal)
    if (!isStdoutLimitError(error)) throw error
    bytes = error.stdout
    sourceOverflow = true
  }
  sourceOverflow ||= bytes.length > maximumBytes
  let prefix = bytes
  if (sourceOverflow && normalizeTextEncoding(textEncoding) !== "shift_jis") {
    // A truncated UTF-8 tail must not make auto-detection reinterpret valid earlier lines as Shift-JIS.
    for (let trim = 0; trim <= Math.min(3, bytes.length); trim += 1) {
      const candidate = bytes.subarray(0, bytes.length - trim)
      if (isUtf8(candidate)) { prefix = candidate; break }
    }
  }
  const text = decodeTextBuffer(prefix, textEncoding)
  return Object.freeze({ text, overflow: sourceOverflow || Buffer.byteLength(text, "utf8") > maximumBytes })
}

function isStdoutLimitError(error: unknown): error is ExternalProcessError {
  return error instanceof ExternalProcessError && error.kind === "bufferExceeded" && error.outputStream === "stdout"
}

async function runCommandText(
  command: string, args: string[], cwd: string, maxStdoutBytes: number, allowedExitCodes: number[],
  textEncoding = "auto", env?: Record<string, string>, deadline?: SharedAbsoluteDeadline, signal?: AbortSignal
): Promise<string> {
  return decodeTextBuffer(await runCommandBuffer(command, args, cwd, maxStdoutBytes, allowedExitCodes, env, deadline, signal), textEncoding)
}

async function runCommandBuffer(
  command: string, args: string[], cwd: string, maxStdoutBytes: number, allowedExitCodes: number[],
  env?: Record<string, string>, deadline?: SharedAbsoluteDeadline, signal?: AbortSignal
): Promise<Buffer> {
  if (!deadline) throw new BoundedDocumentError("bounded_document_input_invalid")
  assertDocumentNotCancelled(signal)
  try {
  const result = await runExternalProcess({
    command, args, cwd, maxStdoutBytes, deadline, allowedExitCodes, signal,
    env: { ...process.env, ...env }
  })
  assertDocumentNotCancelled(signal)
  return result.stdout
  } catch (error) { if (isSettledProcessFailure(error)) assertDocumentNotCancelled(signal); throw error }
}

function normalizeCommandTimeout(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return DEFAULT_VCS_COMMAND_TIMEOUT_MS
  return Math.max(MIN_VCS_COMMAND_TIMEOUT_MS, Math.min(MAX_VCS_COMMAND_TIMEOUT_MS, Math.floor(value)))
}

function parseNameStatusZ(text: string): Array<{ statusToken: string; filePath: string }> {
  const fields = nulFields(text)
  const records: Array<{ statusToken: string; filePath: string }> = []
  let index = 0

  while (index < fields.length) {
    const statusToken = fields[index++]
    if (!statusToken) continue
    if (statusToken.startsWith("R") || statusToken.startsWith("C")) {
      const previousPath = fields[index++]
      const filePath = fields[index++]
      if (previousPath === undefined || filePath === undefined) {
        throw new Error(`Malformed Git name-status rename record: ${statusToken}`)
      }
      records.push({ statusToken, filePath })
      continue
    }

    const filePath = fields[index++]
    if (filePath === undefined) throw new Error(`Malformed Git name-status record: ${statusToken}`)
    records.push({ statusToken, filePath })
  }

  return records
}

function parseNumstatZ(text: string): Map<string, { additions: number; deletions: number }> {
  const fields = nulFields(text)
  const result = new Map<string, { additions: number; deletions: number }>()
  let index = 0

  while (index < fields.length) {
    const record = fields[index++]
    if (!record) continue
    const firstTab = record.indexOf("\t")
    const secondTab = firstTab >= 0 ? record.indexOf("\t", firstTab + 1) : -1
    if (firstTab < 0 || secondTab < 0) throw new Error(`Malformed Git numstat record: ${record}`)

    const additionsToken = record.slice(0, firstTab)
    const deletionsToken = record.slice(firstTab + 1, secondTab)
    let filePath = record.slice(secondTab + 1)
    if (!filePath) {
      const previousPath = fields[index++]
      const renamedPath = fields[index++]
      if (previousPath === undefined || renamedPath === undefined) {
        throw new Error("Malformed Git numstat rename record.")
      }
      filePath = renamedPath
    }

    const normalizedPath = normalizeChangedFilePathStrict(filePath)
    const additions = Number.parseInt(additionsToken, 10)
    const deletions = Number.parseInt(deletionsToken, 10)
    result.set(normalizedPath, {
      additions: Number.isFinite(additions) ? additions : 0,
      deletions: Number.isFinite(deletions) ? deletions : 0
    })
  }

  return result
}

function nulFields(text: string): string[] {
  const fields = text.split("\0")
  if (fields.at(-1) === "") fields.pop()
  return fields
}

function parseBazaarDiffFiles(text: string): DiffSummary["files"] {
  const files = new Map<string, DiffSummary["files"][number]>()
  let current: DiffSummary["files"][number] | undefined

  for (const line of text.split(/\r?\n/)) {
    const header = line.match(/^===\s+(.+?)\s+file '(.+?)'(?:\s+=>\s+'(.+)')?$/)
    if (header) {
      const status = statusFromBazaar(header[1])
      const filePath = status === "renamed" ? header[3] ?? header[2] : header[2]
      current = buildChangedFile(filePath, status)
      files.set(current.path, current)
      continue
    }

    const plusFile = line.match(/^\+\+\+\s+(.+?)(?:\t.*)?$/)
    if (plusFile && plusFile[1] !== "/dev/null") {
      const filePath = plusFile[1]
      const normalizedPath = normalizeChangedFilePathStrict(filePath)
      current = files.get(normalizedPath) ?? buildChangedFile(normalizedPath, "modified")
      files.set(current.path, current)
      continue
    }

    if (!current || line.startsWith("+++ ") || line.startsWith("--- ") || line.startsWith("=== ") || line.startsWith("@@")) continue
    if (line.startsWith("+")) current.additions = (current.additions ?? 0) + 1
    else if (line.startsWith("-")) current.deletions = (current.deletions ?? 0) + 1
  }

  return Array.from(files.values())
}

function buildChangedFile(filePath: string, status: DiffSummary["files"][number]["status"], count?: { additions: number; deletions: number }): DiffSummary["files"][number] {
  const normalizedPath = normalizeChangedFilePathStrict(filePath)
  return {
    path: normalizedPath,
    status,
    additions: count?.additions ?? 0,
    deletions: count?.deletions ?? 0,
    language: languageFromPath(normalizedPath),
    is_test: /(^|[\\/])(test|tests|spec)([\\/]|$)|\btest\b/i.test(normalizedPath),
    is_interface_candidate: /\.(h|hpp|hh)$/i.test(normalizedPath)
  }
}

function statusFromGit(status: string): DiffSummary["files"][number]["status"] {
  if (status.startsWith("A")) return "added"
  if (status.startsWith("M")) return "modified"
  if (status.startsWith("D")) return "deleted"
  if (status.startsWith("R")) return "renamed"
  return "unknown"
}

function statusFromBazaar(status: string): DiffSummary["files"][number]["status"] {
  const normalized = status.toLowerCase()
  if (normalized.includes("added")) return "added"
  if (normalized.includes("modified")) return "modified"
  if (normalized.includes("removed") || normalized.includes("deleted")) return "deleted"
  if (normalized.includes("renamed")) return "renamed"
  return "unknown"
}

export function finalizeDiffProcessingBudget(diff: DiffSummary, operation: ProcessingOperation, sourceOverflow = false): DiffSummary {
  assertProcessingOperation(operation)
  assertDocumentNotCancelled(operation.signal)
  const reservations: ProcessingBudgetReservation[] = []
  try {
    reservations.push(operation.reserve("changed_files", diff.files.length))
    const limited = limitRawDiff(diff, operation.profile.limits.raw_diff_bytes, sourceOverflow)
    reservations.push(operation.reserve("raw_diff_bytes", Buffer.byteLength(limited.unifiedDiff ?? "", "utf8")))
    assertDocumentNotCancelled(operation.signal)
    for (const reservation of reservations) reservation.commit()
    return limited
  } catch (error) {
    for (let index = reservations.length - 1; index >= 0; index -= 1) {
      try { reservations[index].release() } catch { /* Preserve the first failure while settling the remaining tokens. */ }
    }
    throw error
  }
}

function limitRawDiff(diff: DiffSummary, maximumBytes: number, sourceOverflow: boolean): DiffSummary {
  const source = diff.unifiedDiff ?? "", originalBytes = Buffer.byteLength(source, "utf8")
  if (!sourceOverflow && originalBytes <= maximumBytes) return diff
  const suffix = truncateUtf8Text(RAW_DIFF_TRUNCATION_SUFFIX, maximumBytes, "").text
  const prefix = truncateUtf8Text(source, maximumBytes - Buffer.byteLength(suffix, "utf8"), "").text
  const lineEnd = prefix.lastIndexOf("\n"), completeLines = lineEnd < 0 ? "" : prefix.slice(0, lineEnd + 1)
  const observed = sourceOverflow ? `> ${maximumBytes}` : `${originalBytes} > ${maximumBytes}`
  return { ...diff, unifiedDiff: `${completeLines}${suffix}`, warnings: [...(diff.warnings ?? []), `unified diff exceeded maxRawDiffBytes (${observed}); raw diff truncated.`] }
}

function normalizeVcs(value: ReviewInput["review"]["vcs"]): VcsKind {
  if (value === "bazaar" || value === "bzr") return "bazaar"
  return "git"
}

function resolveVcsRoot(workspaceRoot: string, value: string | undefined): string {
  return value ? resolveWorkspacePathStrict(workspaceRoot, value, "vcsRoot") : workspaceRoot
}

export function languageFromPath(filePath: string): string {
  return classifyLanguageFromPath(filePath)
}
