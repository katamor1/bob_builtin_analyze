import {
  appendReviewRunIssue,
  clearReviewRunIssues,
  setReviewRunPhaseProgress
} from "./reviewRunState"
import { readReviewRun, writeReviewRun } from "./reviewRunStore"
import type { ReviewRunContext } from "./reviewRunTypes"

const MAX_PACKET_FAILURE_MESSAGE_CHARACTERS = 1_024

/**
 * Persists a packet-generation failure only after a Review Run identity has
 * already been allocated. A completed packet is never moved backwards.
 */
export async function recordReviewPacketProcessingFailure(
  context: ReviewRunContext,
  error: unknown,
  now = new Date().toISOString()
): Promise<ReviewRunContext> {
  const latest = await readReviewRun(context.workspaceRoot, context.campaignId, context.reviewId)
  if (latest.phases.packet.status === "completed") return latest

  const message = packetFailureMessage(error)
  let next = setReviewRunPhaseProgress(latest, {
    trackedPhase: "packet",
    status: "failed",
    phase: "target",
    issue: message,
    now
  })
  next = clearReviewRunIssues(next, "packet")
  next = appendReviewRunIssue(next, {
    phase: "packet",
    message,
    retryable: true,
    recordedAt: now
  })
  await writeReviewRun(next, { expectedUpdatedAt: latest.updatedAt })
  return next
}

function packetFailureMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw
    .replace(/[\u0000-\u001f\u007f-\u009f]+/gu, " ")
    .normalize("NFC")
    .trim()
  if (!normalized) return "Bazaar review packet processing failed."
  return [...normalized].slice(0, MAX_PACKET_FAILURE_MESSAGE_CHARACTERS).join("")
}
