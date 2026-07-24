import * as fs from "node:fs/promises"
import * as path from "node:path"
import {
  isPortablePathContained,
  normalizeWorkspaceRelativePath,
  resolvePhysicalContainedPathSync
} from "../sharedProcessingBudgetRuntime"
import { decodeTextBuffer } from "./textEncoding"

export type WorkspacePathKind =
  | "review-package-output"
  | "bob-output"
  | "human-triage-output"
  | "traceability-catalog"
  | "traceability-gate-report"
  | "traceability-ai-draft-output"
  | "repository-symbol-index-output"
  | "repository-symbol-index-cache"
  | "artifact-ledger"

type WorkspacePathPolicy = {
  label: string
  description: string
  allow: (segments: string[], relativePath: string) => boolean
}

const WORKSPACE_PATH_POLICIES: Record<WorkspacePathKind, WorkspacePathPolicy> = {
  "review-package-output": {
    label: "reviewPackagePath",
    description: ".bob-review/<review-package-directory> or .custom/<path>",
    allow: (segments) => (
      segmentEquals(segments[0], ".bob-review") &&
      segments.length >= 2 &&
      !["bob-output", "human-triage"].some((reserved) => segmentEquals(segments[1], reserved))
    ) || customPath(segments)
  },
  "bob-output": {
    label: "bobOutputPath",
    description: ".bob-review/bob-output/*.yaml or .custom/*.yaml",
    allow: (segments) => (
      startsWithSegments(segments, [".bob-review", "bob-output"]) && segments.length >= 3 ||
      customPath(segments)
    ) && /\.ya?ml$/i.test(segments[segments.length - 1])
  },
  "human-triage-output": {
    label: "triagePath",
    description: ".bob-review/human-triage/ or .custom/<path>",
    allow: (segments) => startsWithSegments(segments, [".bob-review", "human-triage"]) || customPath(segments)
  },
  "traceability-catalog": {
    label: "traceabilityCatalogPath",
    description: ".bob-trace/*.json outside ai-traceability-draft or .custom/*.json",
    allow: (segments) => segmentEquals(segments[0], ".bob-trace") &&
      !segmentEquals(segments[1], "ai-traceability-draft") &&
      /\.json$/i.test(segments[segments.length - 1]) ||
      customPath(segments) && /\.json$/i.test(segments[segments.length - 1])
  },
  "traceability-gate-report": {
    label: "traceabilityGateReportPath",
    description: ".bob-trace/*.md outside ai-traceability-draft or .custom/*.md",
    allow: (segments) => segmentEquals(segments[0], ".bob-trace") &&
      !segmentEquals(segments[1], "ai-traceability-draft") &&
      /\.md$/i.test(segments[segments.length - 1]) ||
      customPath(segments) && /\.md$/i.test(segments[segments.length - 1])
  },
  "traceability-ai-draft-output": {
    label: "aiTraceabilityDraftPromptPath",
    description: ".bob-trace/ai-traceability-draft/",
    allow: (segments) => startsWithSegments(segments, [".bob-trace", "ai-traceability-draft"])
  },
  "repository-symbol-index-output": {
    label: "repositorySymbolIndexPath",
    description: ".bob/evidence-scope/*.json or .custom/*.json",
    allow: (segments) => (
      startsWithSegments(segments, [".bob", "evidence-scope"]) && segments.length >= 3 ||
      customPath(segments)
    ) && /\.json$/i.test(segments[segments.length - 1])
  },
  "repository-symbol-index-cache": {
    label: "repositorySymbolIndexCachePath",
    description: ".bob/evidence-scope/*.cache.json or .custom/*.cache.json",
    allow: (segments) => (
      startsWithSegments(segments, [".bob", "evidence-scope"]) && segments.length >= 3 ||
      customPath(segments)
    ) && /\.cache\.json$/i.test(segments[segments.length - 1])
  },
  "artifact-ledger": {
    label: "artifactLedgerPath",
    description: ".bob-review/artifact-ledger.json",
    allow: (segments) => startsWithSegments(segments, [".bob-review", "artifact-ledger.json"]) && segments.length === 2
  }
}

export async function readTextFile(filePath: string, encoding = "auto"): Promise<string> {
  return decodeTextBuffer(await fs.readFile(filePath), encoding)
}

export async function writeTextFile(filePath: string, text: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, text, "utf8")
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeTextFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export function resolveWorkspacePath(workspaceRoot: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(workspaceRoot, value)
}

export function resolveWorkspacePathStrict(workspaceRoot: string, value: string, label = "path"): string {
  const root = path.resolve(workspaceRoot)
  let candidatePath: string
  if (path.isAbsolute(value)) {
    candidatePath = value
  } else {
    try {
      candidatePath = normalizeWorkspaceRelativePath(value, label)
    } catch (error) {
      const code = pathPolicyErrorCode(error)
      if (code === "path_policy_escape") throw new Error(`${label} escapes workspace: ${value}`)
      if (code === "path_policy_absolute" || code === "path_policy_drive_relative" || code === "path_policy_device") {
        throw new Error(`${label} must be a safe workspace-relative or contained host absolute path: ${value}`)
      }
      throw new Error(`${label} is unsafe: ${value}`)
    }
  }
  try {
    return resolvePhysicalContainedPathSync({
      rootPath: root,
      candidatePath,
      allowAbsolute: true,
      mustExist: false
    }).path
  } catch (error) {
    const code = pathPolicyErrorCode(error)
    if (code === "path_policy_escape") throw new Error(`${label} escapes workspace: ${value}`)
    if (code === "path_policy_absolute" || code === "path_policy_drive_relative" || code === "path_policy_device") {
      throw new Error(`${label} is unsafe: ${value}`)
    }
    throw new Error(`${label} resolves outside workspace: ${value}`)
  }
}

export function normalizeChangedFilePathStrict(value: string, label = "changed file path"): string {
  try {
    return normalizeWorkspaceRelativePath(value, label)
  } catch {
    throw new Error(`${label} is unsafe: ${String(value)}`)
  }
}

export function resolveWorkspacePathForKind(workspaceRoot: string, value: string, kind: WorkspacePathKind): string {
  const policy = WORKSPACE_PATH_POLICIES[kind]
  let relativePath: string
  try {
    relativePath = normalizeWorkspaceRelativePath(value, policy.label)
  } catch (error) {
    const code = pathPolicyErrorCode(error)
    if (code === "path_policy_absolute" || code === "path_policy_drive_relative" || code === "path_policy_device") {
      throw new Error(`${policy.label} must be a workspace-relative path: ${value}`)
    }
    if (code === "path_policy_escape") throw new Error(`${policy.label} escapes workspace: ${value}`)
    throw new Error(`${policy.label} must be a safe workspace-relative path: ${value}`)
  }
  const segments = relativePath.split("/")
  if (!policy.allow(segments, relativePath)) throw new Error(`${policy.label} must be under ${policy.description}: ${value}`)
  const root = path.resolve(workspaceRoot)
  const candidate = path.resolve(root, ...segments)
  if (!isInsidePath(root, candidate)) throw new Error(`${policy.label} escapes workspace: ${value}`)
  try {
    return resolvePhysicalContainedPathSync({
      rootPath: root,
      candidatePath: candidate,
      allowAbsolute: true,
      mustExist: false
    }).path
  } catch {
    throw new Error(`${policy.label} resolves outside workspace: ${value}`)
  }
}

export function isInsidePath(root: string, target: string): boolean {
  try {
    return isPortablePathContained(path.resolve(root), path.resolve(target), process.platform)
  } catch {
    return false
  }
}

export function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/")
}

export function relativePosix(from: string, to: string): string {
  return toPosixPath(path.relative(from, to)) || "."
}

function pathPolicyErrorCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

function startsWithSegments(segments: string[], prefix: string[]): boolean {
  return prefix.every((segment, index) => segmentEquals(segments[index], segment))
}

function segmentEquals(left: string | undefined, right: string): boolean {
  return typeof left === "string" && left.toLowerCase() === right.toLowerCase()
}

function customPath(segments: string[]): boolean {
  return segmentEquals(segments[0], ".custom") && segments.length >= 2
}
