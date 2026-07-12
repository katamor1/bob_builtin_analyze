import type {
  EngineStep,
  WorkflowRunControlLimitsDefinition,
  WorkflowRunState
} from "../model"
import type { WorkflowAutomaticPauseOverride } from "../runControlStore"

export type AutomaticPausePolicySourceKind = "workflow" | "workspace"
export type AutomaticPauseKind = "maxRunMinutes" | "maxAgentStepsPerRun" | "pauseAtLocalTime"

export interface AutomaticPausePolicySource {
  source: AutomaticPausePolicySourceKind
  limits: WorkflowRunControlLimitsDefinition
}

export interface AutomaticPauseDecision {
  kind: AutomaticPauseKind
  source: AutomaticPausePolicySourceKind
  limit: Record<string, unknown>
  observed: Record<string, unknown>
}

export function evaluateAutomaticPause(input: {
  run: WorkflowRunState
  nextStep?: EngineStep
  now: Date
  policies: AutomaticPausePolicySource[]
  override?: WorkflowAutomaticPauseOverride
}): AutomaticPauseDecision | undefined {
  if (overrideActive(input.override, input.now)) return undefined
  const policies = [...input.policies].sort((left, right) => sourceOrder(left.source) - sourceOrder(right.source))
  for (const policy of policies) {
    const elapsed = elapsedDecision(input.run, input.now, policy)
    if (elapsed) return elapsed
    const agentCount = agentCountDecision(input.run, input.nextStep, policy)
    if (agentCount) return agentCount
    const localTime = localTimeDecision(input.run, input.now, policy)
    if (localTime) return localTime
  }
  return undefined
}

function elapsedDecision(
  run: WorkflowRunState,
  now: Date,
  policy: AutomaticPausePolicySource
): AutomaticPauseDecision | undefined {
  const maxRunMinutes = policy.limits.maxRunMinutes
  if (maxRunMinutes === undefined) return undefined
  const createdAt = Date.parse(run.createdAt)
  if (!Number.isFinite(createdAt)) return undefined
  const elapsedMinutes = Math.max(0, (now.getTime() - createdAt) / 60_000)
  if (elapsedMinutes < maxRunMinutes) return undefined
  return {
    kind: "maxRunMinutes",
    source: policy.source,
    limit: { maxRunMinutes },
    observed: { elapsedMinutes }
  }
}

function agentCountDecision(
  run: WorkflowRunState,
  nextStep: EngineStep | undefined,
  policy: AutomaticPausePolicySource
): AutomaticPauseDecision | undefined {
  const maxAgentStepsPerRun = policy.limits.maxAgentStepsPerRun
  if (maxAgentStepsPerRun === undefined || nextStep?.type !== "agent") return undefined
  const agentStepsExecuted = run.steps.reduce((count, step) => {
    if (step.type !== "agent") return count
    const archivedAttempts = step.attempts?.length ?? 0
    return count + archivedAttempts + (step.startedAt ? 1 : 0)
  }, 0)
  if (agentStepsExecuted < maxAgentStepsPerRun) return undefined
  return {
    kind: "maxAgentStepsPerRun",
    source: policy.source,
    limit: { maxAgentStepsPerRun },
    observed: { agentStepsExecuted }
  }
}

function localTimeDecision(
  run: WorkflowRunState,
  now: Date,
  policy: AutomaticPausePolicySource
): AutomaticPauseDecision | undefined {
  const { pauseAtLocalTime, timezone } = policy.limits
  if (!pauseAtLocalTime || !timezone) return undefined

  const localTime = formatLocalTime(now, timezone)
  const currentLocalDate = formatLocalDate(now, timezone)
  const createdAt = new Date(run.createdAt)
  const runLocalDate = Number.isNaN(createdAt.getTime())
    ? currentLocalDate
    : formatLocalDate(createdAt, timezone)

  if (currentLocalDate < runLocalDate) return undefined
  if (
    currentLocalDate === runLocalDate
    && minutesSinceMidnight(localTime) < minutesSinceMidnight(pauseAtLocalTime)
  ) return undefined

  return {
    kind: "pauseAtLocalTime",
    source: policy.source,
    limit: { pauseAtLocalTime, timezone },
    observed: { localTime, timezone }
  }
}

function formatLocalTime(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now)
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00"
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00"
  return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`
}

function formatLocalDate(value: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value)
  const year = parts.find((part) => part.type === "year")?.value ?? "0000"
  const month = parts.find((part) => part.type === "month")?.value ?? "00"
  const day = parts.find((part) => part.type === "day")?.value ?? "00"
  return `${year}-${month}-${day}`
}

function minutesSinceMidnight(value: string): number {
  const [hour, minute] = value.split(":").map(Number)
  return hour * 60 + minute
}

function overrideActive(override: WorkflowAutomaticPauseOverride | undefined, now: Date): boolean {
  if (!override) return false
  const expiresAt = Date.parse(override.expiresAt)
  return Number.isFinite(expiresAt) && expiresAt > now.getTime()
}

function sourceOrder(source: AutomaticPausePolicySourceKind): number {
  return source === "workflow" ? 0 : 1
}
