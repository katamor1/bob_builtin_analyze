import { CoreWorkflowDefinition } from "./model"
import { parseWorkflowMarkdown } from "./parser"

export type WorkflowDiagnosticSeverity = "error" | "warning" | "info"

export interface WorkflowDiagnostic {
  severity: WorkflowDiagnosticSeverity
  message: string
  filePath?: string
}

export interface ValidateWorkflowTextOptions {
  sourceId: string
  filePath: string
  text: string
  strict?: boolean
}

export interface ValidateWorkflowResult {
  ok: boolean
  workflow?: CoreWorkflowDefinition
  diagnostics: WorkflowDiagnostic[]
}

export function validateWorkflowText(options: ValidateWorkflowTextOptions): ValidateWorkflowResult {
  const parsed = parseWorkflowMarkdown({ sourceId: options.sourceId, filePath: options.filePath, text: options.text })
  const diagnostics = parsed.diagnostics.map((line) => diagnosticFromParserLine(line, options.filePath))
  if (options.strict) for (const item of diagnostics) if (item.severity === "warning") item.severity = "error"
  return { ok: parsed.ok && !diagnostics.some((item) => item.severity === "error"), workflow: parsed.ok ? parsed.workflow : undefined, diagnostics }
}

export function formatWorkflowDiagnostics(result: ValidateWorkflowResult): string[] {
  return result.diagnostics.map((item) => `- ${item.severity}: ${item.filePath ? `${item.filePath}: ` : ""}${item.message}`)
}

function diagnosticFromParserLine(line: string, filePath: string): WorkflowDiagnostic {
  const trimmed = line.replace(/^[-*]\s*/, "")
  if (trimmed.startsWith("fail:")) return { severity: "error", filePath, message: trimmed.slice(5).trim() }
  if (trimmed.startsWith("warn:")) return { severity: "warning", filePath, message: trimmed.slice(5).trim() }
  return { severity: "info", filePath, message: trimmed.replace(/^ok:\s*/, "") }
}
