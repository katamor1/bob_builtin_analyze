import * as fs from "fs/promises"
import * as path from "path"
import { CoreWorkflowDefinition, EngineStep, RunStatus, WorkflowRunState } from "../model"
import {
  assertSafeWorkflowRunId,
  listContainedTaskSnapshotFiles,
  readContainedTaskSnapshotFile,
  removeContainedTaskSnapshotFile,
  writeContainedTaskSnapshotFile
} from "../runtime/runStatePath"

export type TaskSnapshotReason =
  | "workflow-start"
  | "step-start"
  | "agent-output"
  | "handoff-failed"
  | "held"
  | "failed"
  | "review-required"
  | "pause-requested"
  | "paused"
  | "completed"

export interface TaskSnapshotHandoff {
  resultCommand?: string
  error?: string
}

export interface TaskSnapshotPayload {
  schemaVersion: "workflow-register/task-snapshot/v1"
  createdAt: string
  reason: TaskSnapshotReason
  runId: string
  workflowId: string
  logicalWorkflowId?: string
  workflowDefinitionHash?: string
  stepId: string
  runStatus?: RunStatus
  runCurrentStep?: string
  taskMetadata?: Record<string, unknown>
  messages?: unknown[]
  messageCount?: number
  omittedMessageCount?: number
  truncated?: boolean
  taskExport?: unknown
  lastAssistantText?: string
  handoff?: TaskSnapshotHandoff
}

export interface TaskSnapshotSummary {
  fileName: string
  createdAt: string
  reason: TaskSnapshotReason
  workflowId: string
  workflowDefinitionHash?: string
  stepId: string
  hasLastAssistantText: boolean
  handoffError?: string
  truncated?: boolean
}

export interface TaskSnapshotInput {
  reason: TaskSnapshotReason
  workflow: CoreWorkflowDefinition
  run: WorkflowRunState
  step?: EngineStep
  lastAssistantText?: string
  handoff?: TaskSnapshotHandoff
}

export interface TaskSnapshotProvider {
  exportTask(input: TaskSnapshotInput): Promise<TaskSnapshotPayload | undefined> | TaskSnapshotPayload | undefined
}

export interface TaskSnapshotStore {
  saveSnapshot(snapshot: TaskSnapshotPayload): Promise<{ path: string }>
  loadLatest(runId: string): Promise<TaskSnapshotPayload | undefined>
  listSnapshots(runId: string): Promise<TaskSnapshotSummary[]>
  findLatestSnapshot(runId: string, predicate: (snapshot: TaskSnapshotPayload) => boolean): Promise<TaskSnapshotPayload | undefined>
}

export interface FileTaskSnapshotStoreOptions {
  workspaceRoot: string
  now?: () => string
  maxBytes?: number
  maxPerRun?: number
  includeMessages?: boolean
  pruneOnSave?: boolean
}

export const MIN_TASK_SNAPSHOT_BYTES = 1024
export const DEFAULT_TASK_SNAPSHOT_BYTES = 262_144
export const MAX_TASK_SNAPSHOT_BYTES = 1024 * 1024
export const MIN_TASK_SNAPSHOTS_PER_RUN = 1
export const DEFAULT_TASK_SNAPSHOTS_PER_RUN = 50
export const MAX_TASK_SNAPSHOTS_PER_RUN = 500

export function normalizeTaskSnapshotLimits(
  input: Pick<FileTaskSnapshotStoreOptions, "maxBytes" | "maxPerRun">
): { maxBytes: number; maxPerRun: number } {
  return {
    maxBytes: boundedInteger(
      input.maxBytes,
      DEFAULT_TASK_SNAPSHOT_BYTES,
      MIN_TASK_SNAPSHOT_BYTES,
      MAX_TASK_SNAPSHOT_BYTES
    ),
    maxPerRun: boundedInteger(
      input.maxPerRun,
      DEFAULT_TASK_SNAPSHOTS_PER_RUN,
      MIN_TASK_SNAPSHOTS_PER_RUN,
      MAX_TASK_SNAPSHOTS_PER_RUN
    )
  }
}

export class FileTaskSnapshotStore implements TaskSnapshotStore {
  private readonly workspaceRoot: string
  private readonly now: () => string
  private readonly maxBytes: number
  private readonly maxPerRun: number
  private readonly includeMessages: boolean
  private readonly pruneOnSave: boolean

  constructor(options: FileTaskSnapshotStoreOptions) {
    const limits = normalizeTaskSnapshotLimits(options)
    this.workspaceRoot = options.workspaceRoot
    this.now = options.now ?? (() => new Date().toISOString())
    this.maxBytes = limits.maxBytes
    this.maxPerRun = limits.maxPerRun
    this.includeMessages = options.includeMessages ?? false
    this.pruneOnSave = options.pruneOnSave ?? true
  }

  async saveSnapshot(snapshot: TaskSnapshotPayload): Promise<{ path: string }> {
    assertSafeWorkflowRunId(snapshot.runId)
    const pruned = this.prepareSnapshot(snapshot)
    await ensureWorkflowRunsIgnored(this.workspaceRoot)
    const fileName = `${safeTimestamp(pruned.createdAt)}-${pruned.reason}.json`
    const content = serializeTaskSnapshot(pruned)
    if (Buffer.byteLength(content, "utf8") > this.maxBytes) {
      throw new Error(`Workflow task snapshot exceeds the ${this.maxBytes}-byte hard limit after truncation.`)
    }
    await writeContainedTaskSnapshotFile(this.workspaceRoot, snapshot.runId, fileName, content)
    await writeContainedTaskSnapshotFile(this.workspaceRoot, snapshot.runId, "latest.json", content)
    if (this.pruneOnSave) await this.pruneSnapshots(snapshot.runId)
    const file = path.join(this.workspaceRoot, ".bob", "workflows", "runs", snapshot.runId, "task-snapshots", fileName)
    return { path: file }
  }

  async loadLatest(runId: string): Promise<TaskSnapshotPayload | undefined> {
    try {
      const snapshot = await readContainedTaskSnapshotFile(this.workspaceRoot, runId, "latest.json")
      return parseTaskSnapshot(snapshot.bytes, runId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
  }

  async listSnapshots(runId: string): Promise<TaskSnapshotSummary[]> {
    let entries: string[]
    try {
      entries = await listContainedTaskSnapshotFiles(this.workspaceRoot, runId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
      throw error
    }
    const jsonEntries = entries.filter((entry) => entry.endsWith(".json") && entry !== "latest.json")
    const snapshots = await Promise.all(jsonEntries.map(async (entry) => {
      try {
        const snapshot = parseTaskSnapshot((await readContainedTaskSnapshotFile(this.workspaceRoot, runId, entry)).bytes, runId)
        return summarizeSnapshot(entry, snapshot)
      } catch {
        return undefined
      }
    }))
    return snapshots
      .filter((snapshot): snapshot is TaskSnapshotSummary => Boolean(snapshot))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async findLatestSnapshot(runId: string, predicate: (snapshot: TaskSnapshotPayload) => boolean): Promise<TaskSnapshotPayload | undefined> {
    let entries: string[]
    try {
      entries = await listContainedTaskSnapshotFiles(this.workspaceRoot, runId)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
      throw error
    }
    const jsonEntries = entries.filter((entry) => entry.endsWith(".json") && entry !== "latest.json").sort().reverse()
    for (const entry of jsonEntries) {
      try {
        const snapshot = parseTaskSnapshot((await readContainedTaskSnapshotFile(this.workspaceRoot, runId, entry)).bytes, runId)
        if (predicate(snapshot)) return snapshot
      } catch {
        // 読めない snapshot は古い/壊れた補助証跡として扱い、run 再開そのものは止めない。
      }
    }
    return undefined
  }

  private prepareSnapshot(snapshot: TaskSnapshotPayload): TaskSnapshotPayload {
    let prepared = redactSnapshot({
      ...snapshot,
      createdAt: this.now(),
      messages: this.includeMessages ? snapshot.messages : undefined
    })
    while (snapshotBytes(prepared) > this.maxBytes && prepared.messages && prepared.messages.length > 0) {
      prepared = {
        ...prepared,
        messages: prepared.messages.slice(1),
        omittedMessageCount: (prepared.omittedMessageCount ?? 0) + 1,
        truncated: true
      }
    }
    if (snapshotBytes(prepared) > this.maxBytes && prepared.messages !== undefined) {
      prepared = { ...prepared, messages: undefined, truncated: true }
    }
    if (snapshotBytes(prepared) > this.maxBytes && prepared.taskExport !== undefined) {
      prepared = { ...prepared, taskExport: undefined, truncated: true }
    }
    if (snapshotBytes(prepared) > this.maxBytes && prepared.taskMetadata !== undefined) {
      prepared = { ...prepared, taskMetadata: undefined, truncated: true }
    }
    if (snapshotBytes(prepared) > this.maxBytes && prepared.lastAssistantText) {
      prepared = fitLastAssistantText(prepared, this.maxBytes)
    }
    if (snapshotBytes(prepared) > this.maxBytes && prepared.handoff?.error) {
      prepared = fitHandoffError(prepared, this.maxBytes)
    }
    if (snapshotBytes(prepared) > this.maxBytes && prepared.handoff !== undefined) {
      prepared = { ...prepared, handoff: undefined, truncated: true }
    }
    if (snapshotBytes(prepared) > this.maxBytes) {
      prepared = {
        ...prepared,
        logicalWorkflowId: undefined,
        workflowDefinitionHash: undefined,
        runStatus: undefined,
        runCurrentStep: undefined,
        messageCount: undefined,
        omittedMessageCount: undefined,
        truncated: true
      }
    }
    if (snapshotBytes(prepared) > this.maxBytes) {
      throw new Error(`Workflow task snapshot required metadata exceeds the ${this.maxBytes}-byte hard limit.`)
    }
    return prepared
  }

  private async pruneSnapshots(runId: string): Promise<void> {
    if (this.maxPerRun <= 0) return
    const entries = (await listContainedTaskSnapshotFiles(this.workspaceRoot, runId))
      .filter((entry) => entry.endsWith(".json") && entry !== "latest.json")
      .sort()
    const excess = entries.length - this.maxPerRun
    if (excess <= 0) return
    await Promise.all(entries.slice(0, excess).map((entry) => (
      removeContainedTaskSnapshotFile(this.workspaceRoot, runId, entry)
    )))
  }
}

export function createBobTaskSnapshotProvider(task: {
  getMessages?: () => unknown[]
  getAllMetadata?: () => Record<string, unknown>
  toSerializable?: () => unknown
}): TaskSnapshotProvider {
  return {
    exportTask: (input) => {
      const messages = task.getMessages?.()
      const lastAssistantText = input.lastAssistantText ?? extractLastAssistantText(messages ?? [])
      return {
        schemaVersion: "workflow-register/task-snapshot/v1",
        createdAt: new Date().toISOString(),
        reason: input.reason,
        runId: input.run.runId,
        workflowId: input.workflow.id,
        logicalWorkflowId: input.workflow.logicalWorkflowId,
        workflowDefinitionHash: input.workflow.definitionHash,
        stepId: input.step?.id ?? input.run.currentStep ?? "none",
        runStatus: input.run.status,
        runCurrentStep: input.run.currentStep,
        taskMetadata: safeObject(task.getAllMetadata?.()),
        messages,
        messageCount: messages?.length,
        taskExport: task.toSerializable?.(),
        lastAssistantText,
        handoff: input.handoff
      }
    }
  }
}

export function snapshotMatchesRun(
  snapshot: TaskSnapshotPayload,
  workflow: CoreWorkflowDefinition,
  run: WorkflowRunState,
  step?: EngineStep
): boolean {
  if (snapshot.runId !== run.runId) return false
  if (snapshot.workflowId !== workflow.id) return false
  if (snapshot.workflowDefinitionHash && workflow.definitionHash && snapshot.workflowDefinitionHash !== workflow.definitionHash) return false
  if (step && snapshot.stepId !== step.id) return false
  if (!step && run.currentStep && snapshot.stepId !== run.currentStep) return false
  return true
}

function summarizeSnapshot(fileName: string, snapshot: TaskSnapshotPayload): TaskSnapshotSummary {
  return {
    fileName,
    createdAt: snapshot.createdAt,
    reason: snapshot.reason,
    workflowId: snapshot.workflowId,
    workflowDefinitionHash: snapshot.workflowDefinitionHash,
    stepId: snapshot.stepId,
    hasLastAssistantText: Boolean(snapshot.lastAssistantText),
    handoffError: snapshot.handoff?.error,
    truncated: snapshot.truncated
  }
}

function parseTaskSnapshot(bytes: Uint8Array, runId: string): TaskSnapshotPayload {
  const snapshot = JSON.parse(Buffer.from(bytes).toString("utf8")) as TaskSnapshotPayload
  if (snapshot.runId !== runId) {
    throw new Error(`Workflow task snapshot run id mismatch: expected '${runId}', got '${snapshot.runId}'.`)
  }
  return snapshot
}

function serializeTaskSnapshot(snapshot: TaskSnapshotPayload): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function snapshotBytes(snapshot: TaskSnapshotPayload): number {
  return Buffer.byteLength(serializeTaskSnapshot(snapshot), "utf8")
}

function fitLastAssistantText(snapshot: TaskSnapshotPayload, maxBytes: number): TaskSnapshotPayload {
  const value = snapshot.lastAssistantText ?? ""
  const characters = Array.from(value)
  let low = 0
  let high = characters.length
  let best: TaskSnapshotPayload = { ...snapshot, lastAssistantText: undefined, truncated: true }
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate: TaskSnapshotPayload = {
      ...snapshot,
      lastAssistantText: characters.slice(0, middle).join("") || undefined,
      truncated: true
    }
    if (snapshotBytes(candidate) <= maxBytes) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best
}

function fitHandoffError(snapshot: TaskSnapshotPayload, maxBytes: number): TaskSnapshotPayload {
  const value = snapshot.handoff?.error ?? ""
  const characters = Array.from(value)
  const resultCommand = snapshot.handoff?.resultCommand
  let low = 0
  let high = characters.length
  let best: TaskSnapshotPayload = {
    ...snapshot,
    handoff: resultCommand ? { resultCommand } : undefined,
    truncated: true
  }
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const error = characters.slice(0, middle).join("")
    const candidate: TaskSnapshotPayload = {
      ...snapshot,
      handoff: error || resultCommand ? { resultCommand, error: error || undefined } : undefined,
      truncated: true
    }
    if (snapshotBytes(candidate) <= maxBytes) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

function extractLastAssistantText(messages: unknown[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const candidate = messages[index]
    if (!candidate || typeof candidate !== "object") continue
    const record = candidate as Record<string, unknown>
    const role = record.role ?? record.sender ?? record.type
    if (role !== "assistant" && role !== "ai") continue
    const text = record.text ?? record.content ?? record.message
    if (typeof text === "string" && text.trim()) return text
  }
  return undefined
}

function safeObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

async function atomicWriteFile(file: string, content: string): Promise<void> {
  const tempFile = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  try {
    await fs.writeFile(tempFile, content, "utf8")
    await fs.rename(tempFile, file)
  } catch (error) {
    await fs.rm(tempFile, { force: true }).catch(() => undefined)
    throw error
  }
}

const workflowRunsIgnoreEntry = ".bob/workflows/runs/"

async function ensureWorkflowRunsIgnored(workspaceRoot: string): Promise<void> {
  const file = path.join(workspaceRoot, ".gitignore")
  let current = ""
  try {
    current = await fs.readFile(file, "utf8")
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
  }
  if (hasWorkflowRunsIgnoreEntry(current)) return
  const separator = current.length > 0 && !current.endsWith("\n") ? "\n" : ""
  await atomicWriteFile(file, `${current}${separator}${workflowRunsIgnoreEntry}\n`)
}

function hasWorkflowRunsIgnoreEntry(content: string): boolean {
  return content.split(/\r?\n/).some((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) return false
    const normalized = trimmed.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/?$/, "/")
    return normalized === workflowRunsIgnoreEntry
  })
}

function redactSnapshot(snapshot: TaskSnapshotPayload): TaskSnapshotPayload {
  return redactValue(snapshot) as TaskSnapshotPayload
}

function redactValue(value: unknown, key?: string, depth = 0): unknown {
  if (typeof value === "string") return redactString(value, key)
  if (!value || typeof value !== "object") return value
  if (depth > 20) return "[REDACTED]"
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key, depth + 1))

  const output: Record<string, unknown> = {}
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = redactValue(childValue, childKey, depth + 1)
  }
  return output
}

const sensitiveKeyPattern = /(?:authorization|password|passwd|pwd|secret|token|api[_-]?key|access[_-]?token|refresh[_-]?token)/i
const secretPatterns: Array<[RegExp, string]> = [
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]"],
  [/\b(Bearer\s+)[A-Za-z0-9._~+/=-]{16,}\b/gi, "$1[REDACTED]"],
  [/\b((?:OPENAI_)?API[_-]?KEY\s*=\s*)[^\s"'`]+/gi, "$1[REDACTED]"],
  [/\b((?:PASSWORD|PASSWD|PWD|SECRET|TOKEN)\s*=\s*)[^\s"'`]+/gi, "$1[REDACTED]"]
]

function redactString(value: string, key?: string): string {
  if (key && sensitiveKeyPattern.test(key)) return "[REDACTED]"
  return secretPatterns.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value)
}

function safeTimestamp(value: string): string {
  return value.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace(/[^\dTZ]/g, "") || Date.now().toString()
}
