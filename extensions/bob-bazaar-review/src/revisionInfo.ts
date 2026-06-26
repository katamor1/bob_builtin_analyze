import { BazaarClient, BazaarCommandResult } from "./bazaar"

export interface BazaarRevisionInfo {
  revision: string
  revno?: string
  author: string
  committer: string
  timestamp: string
  message: string
  changedFileCount: number
  changedFiles: string[]
  logText: string
}

export interface BazaarRevisionPacketInput {
  root: string
  revision: string
  log: BazaarCommandResult
  diff: BazaarCommandResult
  info: BazaarRevisionInfo
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
  const changedFiles = parseChangedFiles(diffText)
  return {
    revision,
    revno: metadata.revno,
    author: metadata.author || metadata.committer || "unknown",
    committer: metadata.committer || metadata.author || "unknown",
    timestamp: metadata.timestamp || "unknown",
    message: metadata.message || "",
    changedFileCount: changedFiles.length,
    changedFiles,
    logText
  }
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
  const files = new Set<string>()
  for (const line of diffText.split(/\r?\n/)) {
    let match = /^===\s+(?:modified|added|removed|renamed)\s+file\s+'(.+)'\s*$/.exec(line)
    if (match) {
      files.add(match[1])
      continue
    }
    match = /^diff\s+--git\s+a\/(.+?)\s+b\/(.+?)\s*$/.exec(line)
    if (match) {
      files.add(match[2])
      continue
    }
    match = /^\+\+\+\s+(?:b\/)?(.+?)\s*$/.exec(line)
    if (match && match[1] !== "/dev/null") {
      files.add(match[1])
    }
  }
  return [...files].sort()
}
