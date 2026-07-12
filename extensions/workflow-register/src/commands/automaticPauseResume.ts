import type { AutomaticPauseKind, AutomaticPausePolicySourceKind } from "../core/engine/automaticPause"

export interface AutomaticPauseStateRecord {
  schemaVersion: "workflow-register/automatic-pause/v1"
  kind: AutomaticPauseKind
  source: AutomaticPausePolicySourceKind
  checkpoint: string
  nextStepId?: string
  limit: Record<string, unknown>
  observed: Record<string, unknown>
  detectedAt: string
}

export const automaticPauseOverrideChoices = [15, 30, 60] as const

export function parseAutomaticPauseState(value: string | undefined): AutomaticPauseStateRecord | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as Partial<AutomaticPauseStateRecord>
    if (parsed.schemaVersion !== "workflow-register/automatic-pause/v1") return undefined
    if (!isPauseKind(parsed.kind) || !isPolicySource(parsed.source)) return undefined
    if (typeof parsed.checkpoint !== "string" || typeof parsed.detectedAt !== "string") return undefined
    if (!isRecord(parsed.limit) || !isRecord(parsed.observed)) return undefined
    return parsed as AutomaticPauseStateRecord
  } catch {
    return undefined
  }
}

function isPauseKind(value: unknown): value is AutomaticPauseKind {
  return value === "maxRunMinutes" || value === "maxAgentStepsPerRun" || value === "pauseAtLocalTime"
}

function isPolicySource(value: unknown): value is AutomaticPausePolicySourceKind {
  return value === "workflow" || value === "workspace"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}
