import * as vscode from "vscode"
import { renderReviewResultMarkdown } from "./markdown"
import { ReviewResult, ValidationIssue } from "./types"
import { validateReviewResultJson } from "./validator"

export interface CaptureReviewResultResult {
  status: "ok" | "error"
  source: string
  reviewId?: string
  jsonPath?: string
  markdownPath?: string
  valid: boolean
  issueCount: number
  issues?: ValidationIssue[]
  summary?: ReviewResult["summary"]
}

interface CandidateText {
  source: string
  text: string
}

export async function captureReviewResult(): Promise<CaptureReviewResultResult> {
  return captureReviewResultFromCandidates(await buildDefaultCandidates())
}

export async function saveReviewResultFromClipboard(): Promise<CaptureReviewResultResult> {
  return captureReviewResultFromCandidates([{ source: "clipboard", text: await vscode.env.clipboard.readText() }])
}

async function captureReviewResultFromCandidates(candidates: CandidateText[]): Promise<CaptureReviewResultResult> {
  for (const candidate of candidates) {
    const jsonText = extractJsonFromText(candidate.text)
    if (!jsonText) continue
    return handleReviewResultJson(jsonText, candidate.source)
  }

  await vscode.window.showWarningMessage("No review-result JSON was found in the active editor or clipboard.")
  return {
    status: "error",
    source: "none",
    valid: false,
    issueCount: 1,
    issues: [{ path: "$", message: "No review-result JSON was found." }]
  }
}

async function buildDefaultCandidates(): Promise<CandidateText[]> {
  const candidates: CandidateText[] = []
  const editor = vscode.window.activeTextEditor
  if (editor && !editor.selection.isEmpty) {
    candidates.push({ source: "active editor selection", text: editor.document.getText(editor.selection) })
  }
  if (editor) {
    candidates.push({ source: "active editor", text: editor.document.getText() })
  }
  candidates.push({ source: "clipboard", text: await vscode.env.clipboard.readText() })
  return candidates.filter((candidate) => candidate.text.trim().length > 0)
}

async function handleReviewResultJson(jsonText: string, source: string): Promise<CaptureReviewResultResult> {
  const validation = validateReviewResultJson(jsonText)
  if (!validation.valid) {
    await showValidationIssues(validation.issues)
    return {
      status: "error",
      source,
      valid: false,
      issueCount: validation.issues.length,
      issues: validation.issues
    }
  }

  const result = JSON.parse(jsonText) as ReviewResult
  const artifacts = await saveReviewResultArtifacts(result)
  await vscode.window.showInformationMessage(`Review result captured: ${result.review_id}`)
  await openMarkdownSummary(artifacts.markdownUri)

  return {
    status: "ok",
    source,
    reviewId: result.review_id,
    jsonPath: artifacts.jsonUri.fsPath,
    markdownPath: artifacts.markdownUri.fsPath,
    valid: true,
    issueCount: 0,
    summary: result.summary
  }
}

async function saveReviewResultArtifacts(result: ReviewResult): Promise<{ jsonUri: vscode.Uri; markdownUri: vscode.Uri }> {
  const folder = await pickWorkspaceFolder()
  if (!folder) throw new Error("Open a workspace folder before saving review result artifacts.")

  const resultsDir = vscode.Uri.joinPath(folder.uri, ".bob", "review", "results")
  await vscode.workspace.fs.createDirectory(resultsDir)

  const baseName = sanitizeFilename(result.review_id || buildFallbackReviewId(result))
  const jsonUri = vscode.Uri.joinPath(resultsDir, `${baseName}.json`)
  const markdownUri = vscode.Uri.joinPath(resultsDir, `${baseName}.md`)
  await vscode.workspace.fs.writeFile(jsonUri, Buffer.from(`${JSON.stringify(result, null, 2)}\n`, "utf8"))
  await vscode.workspace.fs.writeFile(markdownUri, Buffer.from(`${renderReviewResultMarkdown(result)}\n`, "utf8"))
  return { jsonUri, markdownUri }
}

async function openMarkdownSummary(markdownUri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(markdownUri)
  await vscode.window.showTextDocument(document, { preview: false })
}

async function showValidationIssues(issues: ValidationIssue[]): Promise<void> {
  const report = [
    "# Review Result JSON Validation Failed",
    "",
    ...issues.map((issue) => `- ${issue.path}: ${issue.message}`)
  ].join("\n")
  const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: report })
  await vscode.window.showTextDocument(doc, { preview: false })
}

export function extractJsonFromText(text: string): string | undefined {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  if (isValidJsonObject(trimmed)) return trimmed

  const fenced = extractFencedJson(trimmed)
  if (fenced) return fenced

  const objectCandidate = extractBalancedJsonObject(trimmed)
  return objectCandidate && isValidJsonObject(objectCandidate) ? objectCandidate : undefined
}

function extractFencedJson(text: string): string | undefined {
  const fencePattern = /```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n```/g
  for (let match = fencePattern.exec(text); match; match = fencePattern.exec(text)) {
    const candidate = match[1].trim()
    if (isValidJsonObject(candidate)) return candidate
  }
  return undefined
}

function extractBalancedJsonObject(text: string): string | undefined {
  const start = text.indexOf("{")
  if (start < 0) return undefined

  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === "\\") {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === "{") {
      depth += 1
    } else if (char === "}") {
      depth -= 1
      if (depth === 0) return text.slice(start, index + 1).trim()
    }
  }
  return undefined
}

function isValidJsonObject(text: string): boolean {
  try {
    const value = JSON.parse(text)
    return typeof value === "object" && value !== null && !Array.isArray(value)
  } catch {
    return false
  }
}

async function pickWorkspaceFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? []
  if (folders.length === 0) {
    await vscode.window.showWarningMessage("Open a workspace folder first.")
    return undefined
  }
  if (folders.length === 1) return folders[0]
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, description: folder.uri.fsPath, folder })),
    { title: "Select workspace for review result artifacts" }
  )
  return picked?.folder
}

function buildFallbackReviewId(result: ReviewResult): string {
  const revision = result.vcs.revision ?? result.vcs.target_revision ?? "unknown"
  return `bazaar-${revision}-${timestampForFilename(new Date())}`
}

function timestampForFilename(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function sanitizeFilename(value: string): string {
  return value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || `review-result-${timestampForFilename(new Date())}`
}
