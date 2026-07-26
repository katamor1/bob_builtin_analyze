import { BazaarClient, BazaarCommandResult } from "./bazaar"
import { fencedCodeBlock } from "./markdownFence"
import { clampMaxAddedFileContentBytes } from "./reviewLimits"

export type BazaarChangedFileStatus = "added" | "modified" | "removed" | "renamed" | "unknown"

export interface BazaarChangedFile {
  path: string
  status: BazaarChangedFileStatus
  binary?: boolean
}

export interface BazaarRevisionInfo {
  revision: string
  revno?: string
  author: string
  committer: string
  timestamp: string
  message: string
  changedFileCount: number
  changedFiles: string[]
  changedFileEntries: BazaarChangedFile[]
  logText: string
}

export interface BazaarRevisionPacketInput {
  root: string
  revision: string
  log: BazaarCommandResult
  diff: BazaarCommandResult
  info: BazaarRevisionInfo
}

export interface AddedFileReadFailure {
  readonly path: string
  readonly message: string
}

export interface AddedFilesContentEvidence {
  readonly observedContentBytes: number
  readonly processedContentBytes: number
  readonly renderedContentBytes: number
  readonly truncated: boolean
  readonly skippedFileCount: number
  readonly readFailures: readonly AddedFileReadFailure[]
}

export interface AddedFilesContentResult {
  readonly section?: string
  readonly evidence: AddedFilesContentEvidence
}

export async function loadBazaarRevisionPacketInput(client: BazaarClient, workspacePath: string, revision: string): Promise<BazaarRevisionPacketInput> {
  const root = await client.root(workspacePath)
  const [log, diff] = await Promise.all([
    client.log(root, revision),
    client.diffRevision(root, revision)
  ])
  const info = parseBazaarRevisionInfo(revision, log.stdout, diff.stdout)
  return { root, revision, log, diff, info }
}

export function parseBazaarRevisionInfo(revision: string, logText: string, diffText: string): BazaarRevisionInfo {
  const metadata = parseLogMetadata(logText)
  const changedFileEntries = parseChangedFileEntries(diffText)
  const changedFiles = changedFileEntries.map((entry) => entry.path)
  return {
    revision,
    revno: metadata.revno,
    author: metadata.author || metadata.committer || "unknown",
    committer: metadata.committer || metadata.author || "unknown",
    timestamp: metadata.timestamp || "unknown",
    message: metadata.message || "",
    changedFileCount: changedFiles.length,
    changedFiles,
    changedFileEntries,
    logText
  }
}

export async function buildAddedFilesContent(
  client: BazaarClient,
  root: string,
  revision: string,
  info: BazaarRevisionInfo,
  maxBytes = 256 * 1024
): Promise<AddedFilesContentResult> {
  const maxContentBytes = clampMaxAddedFileContentBytes(maxBytes)
  const addedFiles = info.changedFileEntries.filter((entry) => entry.status === "added")
  const failures: AddedFileReadFailure[] = []
  let observedContentBytes = 0
  let processedContentBytes = 0
  let renderedContentBytes = 0
  let truncated = false
  let skippedFileCount = 0

  if (addedFiles.length === 0) {
    return freezeAddedFilesResult(undefined, {
      observedContentBytes,
      processedContentBytes,
      renderedContentBytes,
      truncated,
      skippedFileCount,
      readFailures: failures
    })
  }
  if (maxContentBytes <= 0) {
    skippedFileCount = addedFiles.filter((entry) => !entry.binary).length
    return freezeAddedFilesResult(undefined, {
      observedContentBytes,
      processedContentBytes,
      renderedContentBytes,
      truncated,
      skippedFileCount,
      readFailures: failures
    })
  }

  const lines: string[] = [
    "## 追加ファイル本文",
    "",
    "この Bazaar リビジョンで新規追加されたファイルの本文です。diff だけでは十分な文脈が得られない場合があるため、対象リビジョンの内容を明示的に含めます。",
    ""
  ]
  let remainingBytes = maxContentBytes

  for (let index = 0; index < addedFiles.length; index += 1) {
    const entry = addedFiles[index]
    if (entry.binary) {
      lines.push(`### ${entry.path}`)
      lines.push("")
      lines.push("[BINARY: 追加ファイル本文は text として埋め込みません]")
      lines.push("")
      continue
    }
    if (remainingBytes <= 0) {
      skippedFileCount += addedFiles.slice(index).filter((remaining) => !remaining.binary).length
      break
    }

    try {
      const result = await client.cat(root, revision, entry.path)
      const originalBytes = Buffer.byteLength(result.stdout, "utf8")
      observedContentBytes = safeAdd(observedContentBytes, originalBytes, "added-file observed bytes")
      const retained = truncateAddedFileContent(result.stdout, remainingBytes)
      const renderedBytes = Buffer.byteLength(retained.text, "utf8")
      processedContentBytes = safeAdd(processedContentBytes, retained.retainedInputBytes, "added-file processed bytes")
      renderedContentBytes = safeAdd(renderedContentBytes, renderedBytes, "added-file rendered bytes")
      remainingBytes -= renderedBytes
      truncated = truncated || retained.truncated
      lines.push(`### ${entry.path}`)
      lines.push("")
      lines.push(fencedCodeBlock("text", retained.text))
      lines.push("")
    } catch (error) {
      const message = safeFailureMessage(error)
      failures.push(Object.freeze({ path: entry.path, message }))
      lines.push(`### ${entry.path}`)
      lines.push("")
      lines.push(`リビジョン ${revision} の Bazaar cat で追加ファイル本文を読み込めませんでした: ${message}`)
      lines.push("")
    }
  }

  if (truncated || skippedFileCount > 0) {
    lines.push(`[TRUNCATED: 追加ファイル本文が ${maxContentBytes} bytes の上限を超えました。必要に応じて focused read/search tools で追加確認してください。]`)
  }

  return freezeAddedFilesResult(lines.join("\n"), {
    observedContentBytes,
    processedContentBytes,
    renderedContentBytes,
    truncated,
    skippedFileCount,
    readFailures: failures
  })
}

export async function buildAddedFilesContentSection(
  client: BazaarClient,
  root: string,
  revision: string,
  info: BazaarRevisionInfo,
  maxBytes = 256 * 1024
): Promise<string | undefined> {
  return (await buildAddedFilesContent(client, root, revision, info, maxBytes)).section
}

function truncateAddedFileContent(value: string, maximumBytes: number): Readonly<{
  text: string
  retainedInputBytes: number
  truncated: boolean
}> {
  const originalBytes = Buffer.byteLength(value, "utf8")
  if (originalBytes <= maximumBytes) {
    return Object.freeze({ text: value, retainedInputBytes: originalBytes, truncated: false })
  }
  if (maximumBytes <= 0) return Object.freeze({ text: "", retainedInputBytes: 0, truncated: true })
  const notice = `\n\n[TRUNCATED: original added file content output was ${originalBytes} bytes, limit is ${maximumBytes} bytes]`
  const boundedNotice = truncateUtf8Prefix(notice, maximumBytes)
  const prefixBudget = maximumBytes - Buffer.byteLength(boundedNotice, "utf8")
  const prefix = truncateUtf8Prefix(value, prefixBudget)
  return Object.freeze({
    text: `${prefix}${boundedNotice}`,
    retainedInputBytes: Buffer.byteLength(prefix, "utf8"),
    truncated: true
  })
}

function freezeAddedFilesResult(
  section: string | undefined,
  evidence: {
    observedContentBytes: number
    processedContentBytes: number
    renderedContentBytes: number
    truncated: boolean
    skippedFileCount: number
    readFailures: AddedFileReadFailure[]
  }
): AddedFilesContentResult {
  return Object.freeze({
    ...(section === undefined ? {} : { section }),
    evidence: Object.freeze({
      observedContentBytes: evidence.observedContentBytes,
      processedContentBytes: evidence.processedContentBytes,
      renderedContentBytes: evidence.renderedContentBytes,
      truncated: evidence.truncated,
      skippedFileCount: evidence.skippedFileCount,
      readFailures: Object.freeze([...evidence.readFailures])
    })
  })
}

function safeFailureMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .normalize("NFC")
    .trim()
  return truncateUtf8Prefix(normalized || "unknown error", 1_024)
}

function truncateUtf8Prefix(value: string, maximumBytes: number): string {
  const output: string[] = []
  let bytes = 0
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, "utf8")
    if (bytes + characterBytes > maximumBytes) break
    output.push(character)
    bytes += characterBytes
  }
  return output.join("")
}

function safeAdd(left: number, right: number, label: string): number {
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left < 0 || right < 0
    || right > Number.MAX_SAFE_INTEGER - left) {
    throw new Error(`${label} exceeds safe integer range`)
  }
  return left + right
}

function parseLogMetadata(logText: string): { revno?: string; author?: string; committer?: string; timestamp?: string; message?: string } {
  const lines = logText.split(/\r?\n/)
  const result: { revno?: string; author?: string; committer?: string; timestamp?: string; message?: string } = {}
  const messageLines: string[] = []
  let inMessage = false

  for (const line of lines) {
    const trimmed = line.trimEnd()
    if (/^revno:\s*/i.test(trimmed)) result.revno = trimmed.replace(/^revno:\s*/i, "").trim()
    else if (/^author:\s*/i.test(trimmed)) result.author = trimmed.replace(/^author:\s*/i, "").trim()
    else if (/^committer:\s*/i.test(trimmed)) result.committer = trimmed.replace(/^committer:\s*/i, "").trim()
    else if (/^timestamp:\s*/i.test(trimmed)) result.timestamp = trimmed.replace(/^timestamp:\s*/i, "").trim()
    else if (/^message:\s*$/i.test(trimmed)) inMessage = true
    else if (inMessage) {
      if (/^[-]{5,}$/.test(trimmed)) break
      messageLines.push(trimmed.replace(/^\s{2,}/, ""))
    }
  }

  result.message = messageLines.join("\n").trim()
  return result
}

export function parseChangedFiles(diffText: string): string[] {
  return parseChangedFileEntries(diffText).map((entry) => entry.path)
}

export function parseChangedFileEntries(diffText: string): BazaarChangedFile[] {
  const files = new Map<string, BazaarChangedFile>()
  for (const line of diffText.split(/\r?\n/)) {
    let match = /^===\s+renamed\s+file\s+'(.+)'\s+=>\s+'(.+)'\s*$/.exec(line)
    if (match) {
      recordChangedFile(files, match[2], "renamed")
      continue
    }
    match = /^===\s+(modified|added|removed|renamed)\s+file\s+'(.+)'\s*$/.exec(line)
    if (match) {
      recordChangedFile(files, match[2], normalizeStatus(match[1]))
      continue
    }
    match = /^diff\s+--git\s+a\/(.+?)\s+b\/(.+?)\s*$/.exec(line)
    if (match) {
      recordChangedFile(files, match[2], "unknown")
      continue
    }
    match = /^Binary files\s+(.+?)\s+and\s+(.+?)\s+differ\s*$/i.exec(line)
    if (match) {
      const filePath = normalizeDiffFilePath(match[2]) ?? normalizeDiffFilePath(match[1])
      if (filePath) recordChangedFile(files, filePath, "unknown", true)
      continue
    }
    match = /^\+\+\+\s+(.+?)\s*$/.exec(line)
    if (match) {
      const filePath = normalizeDiffFilePath(match[1])
      if (filePath) recordChangedFile(files, filePath, "unknown")
    }
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path))
}

function normalizeDiffFilePath(rawPath: string): string | undefined {
  const withoutTimestamp = rawPath.split("\t")[0].trim()
  if (!withoutTimestamp || withoutTimestamp === "/dev/null") return undefined
  return withoutTimestamp.replace(/^b\//, "")
}

function normalizeStatus(status: string): BazaarChangedFileStatus {
  switch (status) {
    case "added": return "added"
    case "modified": return "modified"
    case "removed": return "removed"
    case "renamed": return "renamed"
    default: return "unknown"
  }
}

function recordChangedFile(files: Map<string, BazaarChangedFile>, path: string, status: BazaarChangedFileStatus, binary = false): void {
  const existing = files.get(path)
  if (!existing) {
    files.set(path, compactChangedFile({ path, status, binary }))
    return
  }
  if (existing.status === "unknown" && status !== "unknown") existing.status = status
  if (binary) existing.binary = true
}

function compactChangedFile(entry: BazaarChangedFile): BazaarChangedFile {
  return entry.binary ? entry : { path: entry.path, status: entry.status }
}
