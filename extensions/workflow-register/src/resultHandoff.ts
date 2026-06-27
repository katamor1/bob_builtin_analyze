export type ResultSource = "agent" | "lastAssistant"

export interface ResultHandoffStep {
  captureResult?: boolean
  runAgent?: boolean
  resultSource?: ResultSource
  resultCommand?: string
  resultCommandArgs?: unknown[]
}

export interface ResultHandoffDeps {
  executeCommand: (command: string, ...args: unknown[]) => Promise<unknown> | unknown
}

export interface ResultHandoffResult {
  ok: boolean
  skipped?: boolean
  command?: string
  value?: unknown
  error?: string
}

interface MessageLike {
  role?: unknown
  content?: unknown
}

const ALLOWED_RESULT_COMMANDS = new Set(["bobBazaar.captureReviewResult"])

export function resultSourceForStep(step: ResultHandoffStep): ResultSource {
  return step.resultSource ?? (step.runAgent ? "agent" : "lastAssistant")
}

export function extractLastAssistantText(messages: unknown[], startIndex = 0): string | undefined {
  for (let index = messages.length - 1; index >= Math.max(0, startIndex); index -= 1) {
    const message = messages[index] as MessageLike
    if (message?.role !== "assistant") continue
    const content = textContent(message.content)
    if (content) return content
  }
  return undefined
}

export async function executeResultHandoff(step: ResultHandoffStep, resultText: string | undefined, deps: ResultHandoffDeps): Promise<ResultHandoffResult> {
  if (!step.captureResult) return { ok: true, skipped: true }
  if (!resultText?.trim()) return { ok: false, error: "No result text was available to hand off." }
  if (!step.resultCommand) return { ok: false, error: "captureResult requires resultCommand." }
  if (!ALLOWED_RESULT_COMMANDS.has(step.resultCommand)) {
    return { ok: false, error: `Unsupported result command: ${step.resultCommand}` }
  }
  try {
    const value = await Promise.resolve(deps.executeCommand(step.resultCommand, resultText, ...(step.resultCommandArgs ?? [])))
    const reportedError = commandReportedError(value)
    if (reportedError) return { ok: false, command: step.resultCommand, error: reportedError }
    return { ok: true, command: step.resultCommand, value }
  } catch (error) {
    return { ok: false, command: step.resultCommand, error: error instanceof Error ? error.message : String(error) }
  }
}

function textContent(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }
  return undefined
}

function commandReportedError(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const record = value as Record<string, unknown>
  if (record.status !== "error" && record.valid !== false) return undefined
  const issues = Array.isArray(record.issues)
    ? record.issues.map(formatIssue).filter(Boolean).join("; ")
    : undefined
  return issues
    ? `result command reported an error: ${issues}`
    : "result command reported an error."
}

function formatIssue(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined
  const issue = value as Record<string, unknown>
  const path = typeof issue.path === "string" ? issue.path : "$"
  const message = typeof issue.message === "string" ? issue.message : "validation failed"
  return `${path}: ${message}`
}
