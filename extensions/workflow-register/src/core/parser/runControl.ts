import type {
  WorkflowRunControlDefinition,
  WorkflowRunControlLimitsDefinition
} from "../model"
import { asRecord, optionalNumber, optionalString } from "./yamlFields"

export function normalizeRunControl(value: unknown): WorkflowRunControlDefinition | undefined {
  const record = asRecord(value)
  if (Object.keys(record).length === 0) return undefined
  const rawLimits = asRecord(record.limits)
  const limits: WorkflowRunControlLimitsDefinition = {
    maxRunMinutes: optionalNumber(rawLimits, "maxRunMinutes"),
    maxAgentStepsPerRun: optionalNumber(rawLimits, "maxAgentStepsPerRun"),
    pauseAtLocalTime: optionalString(rawLimits, "pauseAtLocalTime"),
    timezone: optionalString(rawLimits, "timezone")
  }
  return Object.values(limits).some((entry) => entry !== undefined)
    ? { limits }
    : {}
}

export function validateRunControlFields(value: unknown, filePath: string): string[] {
  const record = asRecord(value)
  if (Object.keys(record).length === 0) return []
  const limits = asRecord(record.limits)
  const pauseAtLocalTime = optionalString(limits, "pauseAtLocalTime")
  const timezone = optionalString(limits, "timezone")
  const diagnostics: string[] = []

  if (pauseAtLocalTime && !timezone) {
    diagnostics.push(`- fail: ${filePath}: runControl.limits.timezone is required when pauseAtLocalTime is set.`)
  }
  if (timezone && !isValidIanaTimeZone(timezone)) {
    diagnostics.push(`- fail: ${filePath}: runControl.limits.timezone '${timezone}' is not a valid IANA timezone.`)
  }
  return diagnostics
}

export function isValidIanaTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date(0))
    return true
  } catch {
    return false
  }
}
