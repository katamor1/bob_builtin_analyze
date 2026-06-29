import * as path from "node:path"
import YAML from "yaml"
import { writeTextFile } from "./fileSystem"

export type CaptureBobOutputResult = {
  status: "ok" | "error"
  bobOutputPath?: string
  reviewId?: string
  message: string
}

export async function captureBobOutput(input: { workspaceRoot: string; text: string; bobOutputPath: string }): Promise<CaptureBobOutputResult> {
  const yamlText = extractYamlFromText(input.text)
  if (!yamlText) return { status: "error", message: "Bob 出力内に YAML オブジェクトが見つかりませんでした。" }

  let parsed: any
  try {
    parsed = YAML.parse(yamlText)
  } catch (error) {
    return { status: "error", message: `YAML が不正です: ${error instanceof Error ? error.message : String(error)}` }
  }
  const normalized = `${YAML.stringify(parsed)}`
  await writeTextFile(input.bobOutputPath, normalized)
  return {
    status: "ok",
    bobOutputPath: path.resolve(input.bobOutputPath),
    reviewId: parsed?.review_summary?.review_id,
    message: `Bob 出力を保存しました: ${input.bobOutputPath}`
  }
}

export function extractYamlFromText(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  const fenced = trimmed.match(/```(?:yaml|yml|YAML)?\s*\r?\n([\s\S]*?)\r?\n```/)
  if (fenced) return fenced[1].trim()
  if (/^schema_version\s*:/m.test(trimmed)) return trimmed
  const start = trimmed.search(/^schema_version\s*:/m)
  return start >= 0 ? trimmed.slice(start).trim() : undefined
}
