import * as fs from "fs/promises"
import { MechanicalCheckParserDefinition } from "./config"

export interface MechanicalCheckProcessOutput {
  exitCode?: number
  stdout: string
  stderr: string
  timedOut: boolean
  error?: string
}

export interface MechanicalCheckEvidenceFile {
  absolutePath: string
  relativePath: string
  type: string
}

export interface MechanicalCheckMetrics {
  new_warnings?: number
  new_errors?: number
  violations?: number
}

export interface MechanicalCheckFinding {
  id: string
  file?: string
  line?: number
  message: string
  severity: "error" | "warning" | "info"
  source?: string
  fingerprint?: string
}

export type MechanicalCheckParseResult =
  | { ok: true; metrics: MechanicalCheckMetrics; findings: MechanicalCheckFinding[] }
  | { ok: false; reason: string; metrics: MechanicalCheckMetrics; findings: MechanicalCheckFinding[] }

export interface ParseMechanicalCheckOutputInput {
  workspaceRoot: string
  parser: MechanicalCheckParserDefinition
  processResult: MechanicalCheckProcessOutput
  evidence: MechanicalCheckEvidenceFile[]
}

export async function parseMechanicalCheckOutput(
  input: ParseMechanicalCheckOutputInput
): Promise<MechanicalCheckParseResult> {
  if (input.parser.type !== "regex") return passedParse({})
  const text = [
    input.processResult.stdout,
    input.processResult.stderr,
    ...await Promise.all(input.evidence.map((item) => readTextIfPossible(item.absolutePath)))
  ].join("\n")
  return passedParse({
    ...input.parser.warningPattern ? { new_warnings: countPattern(text, input.parser.warningPattern) } : {},
    ...input.parser.errorPattern ? { new_errors: countPattern(text, input.parser.errorPattern) } : {}
  })
}

function passedParse(metrics: MechanicalCheckMetrics): MechanicalCheckParseResult {
  return { ok: true, metrics, findings: [] }
}

function countPattern(text: string, pattern: string): number {
  try {
    return Array.from(text.matchAll(new RegExp(pattern, "g"))).length
  } catch {
    return 0
  }
}

async function readTextIfPossible(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8")
  } catch {
    return ""
  }
}
