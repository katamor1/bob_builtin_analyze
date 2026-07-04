import * as path from "node:path"
import YAML from "yaml"
import { pathExists, readTextFile, resolveWorkspacePathStrict, writeTextFile } from "./fileSystem"
import { readBobOutputText } from "./bobOutputSource"
import { canonicalizeBobOutput, type EvidenceIndexItem, type EvidenceLookup } from "./bobOutputCanonicalizer"

export type CaptureBobOutputResult = {
  status: "ok" | "error"
  bobOutputPath?: string
  sourcePath?: string
  reviewId?: string
  message: string
}

type CaptureBobOutputInput = {
  workspaceRoot: string
  text: string
  bobOutputPath: string
  packageDir?: string
}

type CaptureSourceResult = {
  yamlText?: string
  sourcePath?: string
  message: string
}

export async function captureBobOutput(input: CaptureBobOutputInput): Promise<CaptureBobOutputResult> {
  const bobOutputPath = resolveWorkspacePathStrict(input.workspaceRoot, input.bobOutputPath, "bobOutputPath")
  const packageDir = input.packageDir ? resolveWorkspacePathStrict(input.workspaceRoot, input.packageDir, "reviewPackagePath") : undefined
  const resolvedInput = { ...input, bobOutputPath, packageDir }
  const source = await resolveCaptureSource(resolvedInput)
  if (!source.yamlText) return { status: "error", message: source.message }

  let parsed: any
  try {
    parsed = YAML.parse(source.yamlText)
  } catch (error) {
    const sourceLabel = source.sourcePath ? ` (${source.sourcePath})` : ""
    return { status: "error", message: `YAML が不正です${sourceLabel}: ${error instanceof Error ? error.message : String(error)}` }
  }
  const evidenceLookup = await loadEvidenceLookup(packageDir)
  const canonical = canonicalizeBobOutput(parsed, evidenceLookup)
  const normalized = `${YAML.stringify(canonical)}`
  await writeTextFile(bobOutputPath, normalized)
  return {
    status: "ok",
    bobOutputPath: path.resolve(bobOutputPath),
    sourcePath: source.sourcePath,
    reviewId: canonical?.review_summary?.review_id,
    message: `Bob 出力を保存しました: ${bobOutputPath}${source.sourcePath ? ` (source: ${source.sourcePath})` : ""}`
  }
}

async function resolveCaptureSource(input: CaptureBobOutputInput): Promise<CaptureSourceResult> {
  const textYaml = extractYamlFromText(input.text)
  if (textYaml) return { yamlText: textYaml, message: "Bob output was read from command text." }

  const fallback = await readBobOutputText({ bobOutputPath: input.bobOutputPath, packageDir: input.packageDir, includePrimary: false })
  if (!fallback.ok) {
    return { message: `Bob 出力内に YAML オブジェクトが見つかりませんでした。${fallback.error}` }
  }
  const fallbackYaml = extractYamlFromText(fallback.text)
  if (!fallbackYaml) {
    return { sourcePath: fallback.sourcePath, message: `Bob 出力内に YAML オブジェクトが見つかりませんでした: ${fallback.sourcePath}` }
  }
  return { yamlText: fallbackYaml, sourcePath: fallback.sourcePath, message: `Bob output was read from ${fallback.sourcePath}.` }
}

export function extractYamlFromText(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const fenced = trimmed.match(/```(?:yaml|yml|YAML)?\s*\r?\n([\s\S]*?)\r?\n```/)
  if (fenced) return fenced[1].trim()
  const start = trimmed.search(/^schema_version\s*:/m)
  return start >= 0 ? trimWorkflowStateTrailer(trimmed.slice(start)) : undefined
}

function trimWorkflowStateTrailer(text: string): string {
  const lines = text.split(/\r?\n/)
  const stop = lines.findIndex((line, index) => index > 0 && /^<\/(?:state|workflow_state)>/.test(line.trim()))
  return (stop >= 0 ? lines.slice(0, stop) : lines).join("\n").trim()
}

async function loadEvidenceLookup(packageDir: string | undefined): Promise<EvidenceLookup | undefined> {
  if (!packageDir) return undefined
  const evidencePath = path.join(packageDir, "evidence-index.json")
  if (!(await pathExists(evidencePath))) return undefined
  const parsed = JSON.parse(await readTextFile(evidencePath)) as { evidence?: EvidenceIndexItem[] }
  const byId = new Map<string, EvidenceIndexItem>()
  const byRef = new Map<string, EvidenceIndexItem>()
  for (const item of parsed.evidence ?? []) {
    if (item.evidence_id) byId.set(item.evidence_id, item)
    if (item.ref) byRef.set(item.ref, item)
  }
  return { byId, byRef }
}
