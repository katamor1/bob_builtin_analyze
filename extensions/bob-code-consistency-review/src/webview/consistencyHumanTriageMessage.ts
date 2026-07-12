export type HumanTriageAction = "generateTriage" | "saveDecisions" | "openResultCapture"

export interface HumanTriageMessage {
  type: "consistencyHumanTriage.action"
  action: HumanTriageAction
  sourceSha256?: string
  decisionRevision?: number
  items?: unknown[]
}

export function parseHumanTriageMessage(message: unknown): HumanTriageMessage | undefined {
  if (!message || typeof message !== "object" || Array.isArray(message)) return undefined
  const candidate = message as Record<string, unknown>
  if (candidate.type !== "consistencyHumanTriage.action") return undefined
  if (!isHumanTriageAction(candidate.action)) return undefined

  const parsed: HumanTriageMessage = {
    type: "consistencyHumanTriage.action",
    action: candidate.action
  }
  if (candidate.action !== "saveDecisions") return parsed
  if (typeof candidate.sourceSha256 !== "string" || !candidate.sourceSha256.trim()) return undefined
  if (!Number.isInteger(candidate.decisionRevision) || Number(candidate.decisionRevision) < 0) return undefined
  if (!Array.isArray(candidate.items) || !hasUniquePostedSourceIds(candidate.items)) return undefined

  parsed.sourceSha256 = candidate.sourceSha256.trim()
  parsed.decisionRevision = Number(candidate.decisionRevision)
  parsed.items = candidate.items
  return parsed
}

function hasUniquePostedSourceIds(items: unknown[]): boolean {
  const seen = new Set<string>()
  for (const value of items) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const sourceId = (value as Record<string, unknown>).source_id
    if (typeof sourceId !== "string" || !sourceId.trim() || seen.has(sourceId.trim())) return false
    seen.add(sourceId.trim())
  }
  return true
}

function isHumanTriageAction(value: unknown): value is HumanTriageAction {
  return value === "generateTriage" || value === "saveDecisions" || value === "openResultCapture"
}
