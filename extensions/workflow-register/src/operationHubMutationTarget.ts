import { createHash } from "crypto"
import * as fs from "fs/promises"
import * as path from "path"
import type { WorkflowRunState } from "./core/model"

export interface OperationHubRunMutationTarget {
  source: "operationHub"
  workspaceRoot: string
  runId: string
  expectedRevision: string
}

export interface OperationHubWorkflowMutationTarget {
  source: "operationHub"
  workspaceRoot: string
  workflowId: string
}

export interface OperationHubRunSnapshot {
  run: WorkflowRunState
  revision: string
}

export class OperationHubRefreshRequiredError extends Error {
  readonly code = "operation_hub_refresh_required"

  constructor(reason: string) {
    super(`${reason} Operation Hub を更新してから再実行してください。`)
    this.name = "OperationHubRefreshRequiredError"
  }
}

export function isOperationHubRunMutationTarget(value: unknown): value is OperationHubRunMutationTarget {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Record<keyof OperationHubRunMutationTarget, unknown>>
  return candidate.source === "operationHub" &&
    typeof candidate.workspaceRoot === "string" &&
    typeof candidate.runId === "string" &&
    typeof candidate.expectedRevision === "string"
}

export function isOperationHubWorkflowMutationTarget(value: unknown): value is OperationHubWorkflowMutationTarget {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<Record<keyof OperationHubWorkflowMutationTarget, unknown>>
  return candidate.source === "operationHub" &&
    typeof candidate.workspaceRoot === "string" &&
    typeof candidate.workflowId === "string"
}

export async function canonicalOperationHubWorkspaceRoot(
  requestedRoot: string,
  candidateRoots: readonly string[]
): Promise<string> {
  if (!requestedRoot.trim()) throw refreshRequired("workspace root が指定されていません。")
  let requestedCanonical: string
  try {
    requestedCanonical = await fs.realpath(path.resolve(requestedRoot))
  } catch {
    throw refreshRequired("指定された workspace root は存在しません。")
  }
  for (const candidateRoot of candidateRoots) {
    let candidateCanonical: string
    try {
      candidateCanonical = await fs.realpath(path.resolve(candidateRoot))
    } catch {
      continue
    }
    if (sameCanonicalPath(candidateCanonical, requestedCanonical)) return candidateCanonical
  }
  throw refreshRequired("指定された workspace root は現在の候補ではありません。")
}

export async function readOperationHubRunSnapshot(
  workspaceRoot: string,
  runId: string
): Promise<OperationHubRunSnapshot> {
  assertSafeRunId(runId)
  const runFile = path.resolve(workspaceRoot, ".bob", "workflows", "runs", runId, "run.json")
  if (!isContainedPath(workspaceRoot, runFile)) throw refreshRequired("run target が workspace 外です。")
  let bytes: Uint8Array
  try {
    bytes = await fs.readFile(runFile)
  } catch {
    throw refreshRequired(`run '${runId}' を再読込できません。`)
  }
  let run: WorkflowRunState
  try {
    run = JSON.parse(Buffer.from(bytes).toString("utf8")) as WorkflowRunState
  } catch {
    throw refreshRequired(`run '${runId}' の内容を再読込できません。`)
  }
  if (run.runId !== runId) throw refreshRequired(`run '${runId}' の識別子が変更されました。`)
  return { run, revision: operationHubContentRevision(bytes) }
}

export async function validateOperationHubRunMutationTarget(
  target: OperationHubRunMutationTarget,
  candidateRoots: readonly string[]
): Promise<{ workspaceRoot: string; snapshot: OperationHubRunSnapshot }> {
  if (!target.expectedRevision.trim()) throw refreshRequired("run revision が指定されていません。")
  const workspaceRoot = await canonicalOperationHubWorkspaceRoot(target.workspaceRoot, candidateRoots)
  const snapshot = await readOperationHubRunSnapshot(workspaceRoot, target.runId)
  if (snapshot.revision !== target.expectedRevision) {
    throw refreshRequired(`run '${target.runId}' は表示後に更新されました。`)
  }
  return { workspaceRoot, snapshot }
}

export function operationHubContentRevision(bytes: Uint8Array | string): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`
}

export function refreshRequired(reason: string): OperationHubRefreshRequiredError {
  return new OperationHubRefreshRequiredError(reason)
}

function assertSafeRunId(runId: string): void {
  if (!runId.trim() || runId.includes("/") || runId.includes("\\") || runId === "." || runId === "..") {
    throw refreshRequired("run target が不正です。")
  }
}

function sameCanonicalPath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLocaleLowerCase() === right.toLocaleLowerCase()
    : left === right
}

function isContainedPath(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}
