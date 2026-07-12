import * as path from "node:path"

const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/

export function validateReviewRunSegment(value: string, fieldName: string): string {
  if (/[. ]$/.test(value)) throw new Error(`${fieldName} must not end with a dot or space`)
  const normalized = value.trim()
  if (!normalized) throw new Error(`${fieldName} is required`)
  if (normalized === "." || normalized === "..") throw new Error(`${fieldName} must be a safe path segment`)
  if (normalized.includes("/") || normalized.includes("\\")) throw new Error(`${fieldName} must not contain path separators`)
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
