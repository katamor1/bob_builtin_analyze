import type { WorkflowRunControlLimitsDefinition } from "./model"

export interface AutomaticPauseSettingsInput {
  maxRunMinutes?: unknown
  maxAgentStepsPerRun?: unknown
  pauseAtLocalTime?: unknown
  timezone?: unknown
}

export interface AutomaticPauseSettingsResult {
  limits?: WorkflowRunControlLimitsDefinition
  diagnostics: string[]
}

const LOCAL_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export function normalizeAutomaticPauseSettings(
  input: AutomaticPauseSettingsInput
): AutomaticPauseSettingsResult {
  const diagnostics: string[] = []
  const limits: WorkflowRunControlLimitsDefinition = {}

  const maxRunMinutes = finiteNumber(input.maxRunMinutes)
  if (maxRunMinutes === 0 || input.maxRunMinutes === undefined) {
    // Disabled.
  } else if (maxRunMinutes !== undefined && maxRunMinutes > 0) {
    limits.maxRunMinutes = maxRunMinutes
  } else {
    diagnostics.push("workflowRegister.runControl.maxRunMinutes must be zero or greater than zero.")
  }

  const maxAgentStepsPerRun = finiteNumber(input.maxAgentStepsPerRun)
  if (maxAgentStepsPerRun === 0 || input.maxAgentStepsPerRun === undefined) {
    // Disabled.
  } else if (
    maxAgentStepsPerRun !== undefined
    && Number.isInteger(maxAgentStepsPerRun)
    && maxAgentStepsPerRun > 0
  ) {
    limits.maxAgentStepsPerRun = maxAgentStepsPerRun
  } else {
    diagnostics.push("workflowRegister.runControl.maxAgentStepsPerRun must be a non-negative integer.")
  }

  const pauseAtLocalTime = stringValue(input.pauseAtLocalTime)
  if (pauseAtLocalTime) {
    if (!LOCAL_TIME_PATTERN.test(pauseAtLocalTime)) {
      diagnostics.push("workflowRegister.runControl.pauseAtLocalTime must use HH:mm in 24-hour time.")
    } else {
      const timezone = stringValue(input.timezone)
      if (!timezone) {
        diagnostics.push("workflowRegister.runControl.timezone is required when pauseAtLocalTime is set.")
      } else if (!isValidIanaTimeZone(timezone)) {
        diagnostics.push(`workflowRegister.runControl.timezone '${timezone}' is not a valid IANA timezone.`)
      } else {
        limits.pauseAtLocalTime = pauseAtLocalTime
        limits.timezone = timezone
      }
    }
  }

  return {
    limits: Object.values(limits).some((value) => value !== undefined) ? limits : undefined,
    diagnostics
  }
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function isValidIanaTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0))
    return true
  } catch {
    return false
  }
}
