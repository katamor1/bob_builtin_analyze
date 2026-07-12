import * as fs from "node:fs/promises"
import * as path from "node:path"

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/
const WINDOWS_FORBIDDEN_CHARACTER = /[<>:"/\\|?*]/

export function validateReviewRunSegment(value: string, fieldName: string): string {
  if (/[. ]$/.test(value)) throw new Error(`${fieldName} must not end with a dot or space`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  if (normalized === "." || normalized === "..") throw new Error(`${fieldName} must be a safe path segment`)
  if (WINDOWS_FORBIDDEN_CHARACTER.test(normalized)) throw new Error(`${fieldName} must not contain Windows-forbidden characters`)
  if (CONTROL_CHARACTER.test(normalized)) throw new Error(`${fieldName} must not contain control characters`)
  if (WINDOWS_RESERVED_NAME.test(normalized)) throw new Error(`${fieldName} must not use a Windows reserved name`)
  return normalized
}

export function reviewRunDirectory(workspaceRoot: string, campaignId: string, reviewId: string): string {
  const root = path.resolve(workspaceRoot)
  const safeCampaignId = validateReviewRunSegment(campaignId, "campaignId")
  const safeReviewId = validateReviewRunSegment(reviewId, "reviewId")
  return path.join(root, ".bob-review-records", "campaigns", safeCampaignId, "records", safeReviewId)
}

export function reviewRunJsonPath(workspaceRoot: string, campaignId: string, reviewId: string): string {
  return path.join(reviewRunDirectory(workspaceRoot, campaignId, reviewId), "review-run.json")
}

export function reviewRunPacketPath(workspaceRoot: string, campaignId: string, reviewId: string): string {
  return path.join(reviewRunDirectory(workspaceRoot, campaignId, reviewId), "review-packet.md")
}

export async function assertReviewRunPathContained(workspaceRoot: string, targetPath: string): Promise<void> {
  const root = path.resolve(workspaceRoot)
  const target = path.resolve(targetPath)
  const relative = path.relative(root, target)
  if (!isInsideOrSameRelative(relative)) {
    throw new Error(`Path is outside Review Run workspace: ${targetPath}`)
  }

  const rootRealPath = await fs.realpath(root)
  let currentPath = root
  for (const segment of relative ? relative.split(path.sep) : []) {
    currentPath = path.join(currentPath, segment)
    let stats: import("node:fs").Stats
    try {
      stats = await fs.lstat(currentPath)
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return
      throw error
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`Review Run path must not traverse a symbolic link: ${currentPath}`)
    }
    const currentRealPath = await fs.realpath(currentPath)
    const realRelative = path.relative(rootRealPath, currentRealPath)
    if (!isInsideOrSameRelative(realRelative)) {
      throw new Error(`Path is outside Review Run workspace after realpath resolution: ${targetPath}`)
    }
  }
}

function isInsideOrSameRelative(relativePath: string): boolean {
  return relativePath === "" || (
    relativePath !== ".." &&
    !relativePath.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativePath)
  )
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}
