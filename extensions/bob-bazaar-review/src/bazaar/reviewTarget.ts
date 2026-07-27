import { BazaarClient, BazaarCommandResult } from "./bazaar"
import {
  buildAddedFilesContent,
  loadBazaarRevisionPacketInput,
  parseChangedFileEntries,
  BazaarRevisionInfo,
  BazaarChangedFile,
  type AddedFilesContentEvidence
} from "./revisionInfo"
import type { TargetMode } from "../ui/reviewGuiTypes"

const TARGET_MODES = new Set<string>(["singleRevision", "revisionRange", "workingTreeSinceRevision"])

export interface TargetRequest {
  mode: TargetMode
  revision?: string
  baseRevision?: string
  targetRevision?: string
  withProjectRules?: boolean
}

export interface TargetInfo {
  mode: TargetMode
  targetLabel: string
  revision?: string
  baseRevision?: string
  targetRevision?: string
  revno?: string
  author: string
  committer: string
  timestamp: string
  message: string
  changedFileCount: number
  changedFiles: string[]
  changedFileEntries: BazaarChangedFile[]
}

export interface PreparedTarget {
  root: string
  info: TargetInfo
  log?: BazaarCommandResult
  diff: BazaarCommandResult
  addedFilesSection?: string
  addedFilesEvidence?: AddedFilesContentEvidence
}

export function parseTargetRequest(message: any): TargetRequest {
  return {
    mode: String(message.mode ?? "singleRevision") as TargetMode,
    revision: trimOrUndefined(message.revision),
    baseRevision: trimOrUndefined(message.baseRevision),
    targetRevision: trimOrUndefined(message.targetRevision),
    withProjectRules: Boolean(message.withProjectRules)
  }
}

export function validateTargetRequest(request: TargetRequest): void {
  if (!TARGET_MODES.has(String(request.mode))) throw new Error(`Unsupported review mode: ${request.mode}`)
  if (request.mode === "singleRevision" && !request.revision) throw new Error("リビジョンは必須です。")
  if (request.mode === "revisionRange" && (!request.baseRevision || !request.targetRevision)) {
    throw new Error("基準リビジョンと比較先リビジョンは必須です。")
  }
  if (request.mode === "workingTreeSinceRevision" && request.targetRevision) {
    throw new Error("作業ツリーレビューでは比較先リビジョンを指定できません。")
  }
}

export async function prepareTarget(
  client: BazaarClient,
  workspacePath: string,
  request: TargetRequest,
  options: { includeAddedFiles: boolean; maxAddedFileContentBytes: number }
): Promise<PreparedTarget> {
  const root = await client.root(workspacePath)

  if (request.mode === "singleRevision") {
    const revision = request.revision ?? ""
    const input = await loadBazaarRevisionPacketInput(client, root, revision)
    const addedFiles = options.includeAddedFiles
      ? await buildAddedFilesContent(client, root, revision, input.info, options.maxAddedFileContentBytes)
      : undefined
    return {
      root,
      log: input.log,
      diff: input.diff,
      info: revisionInfoToTargetInfo(input.info),
      ...(addedFiles === undefined ? {} : {
        addedFilesSection: addedFiles.section,
        addedFilesEvidence: addedFiles.evidence
      })
    }
  }

  if (request.mode === "revisionRange") {
    const baseRevision = request.baseRevision ?? ""
    const targetRevision = request.targetRevision ?? ""
    const [diff, log] = await Promise.all([
      client.diffRange(root, baseRevision, targetRevision),
      client.log(root, targetRevision).catch(ignoreNonCancellationCommandFailure)
    ])
    const entries = parseChangedFileEntries(diff.stdout)
    const info = makeRangeTargetInfo(baseRevision, targetRevision, log?.stdout, entries)
    const syntheticInfo = targetInfoToSyntheticRevisionInfo(info, targetRevision)
    const addedFiles = options.includeAddedFiles
      ? await buildAddedFilesContent(
          client,
          root,
          targetRevision,
          syntheticInfo,
          options.maxAddedFileContentBytes
        )
      : undefined
    return {
      root,
      log,
      diff,
      info,
      ...(addedFiles === undefined ? {} : {
        addedFilesSection: addedFiles.section,
        addedFilesEvidence: addedFiles.evidence
      })
    }
  }

  if (request.mode === "workingTreeSinceRevision") {
    const topRevision = request.baseRevision ?? await client.revno(root)
    const [diff, status] = await Promise.all([
      client.diffWorkingTree(root, topRevision),
      client.status(root).catch(ignoreNonCancellationCommandFailure)
    ])
    const entries = parseChangedFileEntries(diff.stdout)
    const addedFilesEvidence = options.includeAddedFiles
      ? workingTreeAddedFilesEvidence(entries)
      : undefined
    return {
      root,
      diff,
      info: {
        mode: "workingTreeSinceRevision",
        targetLabel: `${topRevision}..作業ツリー`,
        baseRevision: topRevision,
        targetRevision: "作業ツリー",
        author: "作業ツリー",
        committer: "作業ツリー",
        timestamp: "未コミット",
        message: status?.stdout?.trim() || `リビジョン ${topRevision} 以降の未コミット変更`,
        changedFileCount: entries.length,
        changedFiles: entries.map((entry) => entry.path),
        changedFileEntries: entries
      },
      ...(addedFilesEvidence === undefined ? {} : { addedFilesEvidence })
    }
  }

  throw new Error(`Unsupported review mode: ${request.mode}`)
}

export function buildTargetMetadataSection(info: TargetInfo): string {
  return [
    "## Bazaar レビュー対象メタデータ",
    "",
    `- mode: ${info.mode}`,
    `- target: ${info.targetLabel}`,
    info.revision ? `- revision: ${info.revision}` : undefined,
    info.baseRevision ? `- base_revision: ${info.baseRevision}` : undefined,
    info.targetRevision ? `- target_revision: ${info.targetRevision}` : undefined,
    info.revno ? `- revno: ${info.revno}` : undefined,
    `- author: ${info.author}`,
    `- committer: ${info.committer}`,
    `- timestamp: ${info.timestamp}`,
    `- changed_files: ${info.changedFileCount}`,
    "",
    "### メッセージ / status",
    "",
    "```text",
    info.message || "(メッセージなし)",
    "```",
    "",
    "### 変更ファイル",
    "",
    ...(
      info.changedFileEntries.length > 0
        ? info.changedFileEntries.map((entry) => `- ${entry.status}: ${entry.path}`)
        : ["- (変更ファイルを検出できませんでした)"]
    )
  ].filter((line): line is string => line !== undefined).join("\n")
}

function trimOrUndefined(value: unknown): string | undefined {
  const text = String(value ?? "").trim()
  return text ? text : undefined
}

function revisionInfoToTargetInfo(info: BazaarRevisionInfo): TargetInfo {
  return {
    mode: "singleRevision",
    targetLabel: info.revision,
    revision: info.revision,
    targetRevision: info.revision,
    revno: info.revno,
    author: info.author,
    committer: info.committer,
    timestamp: info.timestamp,
    message: info.message,
    changedFileCount: info.changedFileCount,
    changedFiles: info.changedFiles,
    changedFileEntries: info.changedFileEntries
  }
}

function makeRangeTargetInfo(
  baseRevision: string,
  targetRevision: string,
  logText: string | undefined,
  entries: BazaarChangedFile[]
): TargetInfo {
  const parsed = logText ? parseLogMetadataLike(logText) : {}
  return {
    mode: "revisionRange",
    targetLabel: `${baseRevision}..${targetRevision}`,
    baseRevision,
    targetRevision,
    revno: parsed.revno,
    author: parsed.author || parsed.committer || "range",
    committer: parsed.committer || parsed.author || "range",
    timestamp: parsed.timestamp || "unknown",
    message: parsed.message || `Bazaar リビジョン範囲 ${baseRevision}..${targetRevision}`,
    changedFileCount: entries.length,
    changedFiles: entries.map((entry) => entry.path),
    changedFileEntries: entries
  }
}

function targetInfoToSyntheticRevisionInfo(info: TargetInfo, revision: string): BazaarRevisionInfo {
  return {
    revision,
    revno: info.revno,
    author: info.author,
    committer: info.committer,
    timestamp: info.timestamp,
    message: info.message,
    changedFileCount: info.changedFileCount,
    changedFiles: info.changedFiles,
    changedFileEntries: info.changedFileEntries,
    logText: ""
  }
}

function workingTreeAddedFilesEvidence(entries: readonly BazaarChangedFile[]): AddedFilesContentEvidence {
  const skippedFileCount = entries.filter((entry) => entry.status === "added").length
  return Object.freeze({
    observedContentBytes: 0,
    processedContentBytes: 0,
    renderedContentBytes: 0,
    truncated: false,
    skippedFileCount,
    readFailures: Object.freeze([])
  })
}

function ignoreNonCancellationCommandFailure(error: unknown): undefined {
  if (isCancellationOrDeadlineError(error)) throw error
  return undefined
}

function isCancellationOrDeadlineError(error: unknown): boolean {
  if (error === null || typeof error !== "object") return false
  const record = error as Record<string, unknown>
  return record.code === "processing_cancelled"
    || record.kind === "cancelled"
    || record.kind === "timeout"
    || record.terminationCause === "user"
    || record.terminationCause === "deadline"
}

function parseLogMetadataLike(logText: string): {
  revno?: string
  author?: string
  committer?: string
  timestamp?: string
  message?: string
} {
  const result: {
    revno?: string
    author?: string
    committer?: string
    timestamp?: string
    message?: string
  } = {}
  const messageLines: string[] = []
  let inMessage = false
  for (const line of logText.split(/\r?\n/)) {
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
