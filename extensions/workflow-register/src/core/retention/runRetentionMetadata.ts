export const CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION = "workflow-register/run-retention/v1" as const

export interface WorkflowRunRetentionMetadataV1 {
  schemaVersion: typeof CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION
  pinned: boolean
  updatedAt: string
  note?: string
}

export type WorkflowRunRetentionMetadataDecodeResult =
  | { status: "valid"; metadata: WorkflowRunRetentionMetadataV1 }
  | { status: "invalid"; error: string }

const ALLOWED_FIELDS = new Set(["schemaVersion", "pinned", "updatedAt", "note"])

export function createWorkflowRunRetentionMetadata(input: {
  pinned: boolean
  updatedAt: string
  note?: string
}): WorkflowRunRetentionMetadataV1 {
  const updatedAt = timestamp(input.updatedAt, "updatedAt")
  const note = input.note === undefined ? undefined : boundedText(input.note, "note", 256, true)
  return {
    schemaVersion: CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION,
    pinned: input.pinned,
    updatedAt,
    note
  }
}

export function decodeWorkflowRunRetentionMetadata(value: unknown): WorkflowRunRetentionMetadataDecodeResult {
  let parsed = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch (error) {
      return { status: "invalid", error: `Invalid retention metadata JSON: ${formatError(error)}` }
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "invalid", error: "Retention metadata must be an object." }
  }
  const record = parsed as Record<string, unknown>
  const unknown = Object.keys(record).filter((key) => !ALLOWED_FIELDS.has(key))
  if (unknown.length > 0) return { status: "invalid", error: `Unknown retention metadata field: ${unknown.sort().join(", ")}` }
  if (record.schemaVersion !== CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION) {
    return { status: "invalid", error: `Unsupported retention metadata schemaVersion: ${String(record.schemaVersion)}` }
  }
  if (typeof record.pinned !== "boolean") return { status: "invalid", error: "Retention metadata pinned must be boolean." }
  if (typeof record.updatedAt !== "string") return { status: "invalid", error: "Retention metadata updatedAt must be string." }
  if (record.note !== undefined && typeof record.note !== "string") return { status: "invalid", error: "Retention metadata note must be string." }
  try {
    return {
      status: "valid",
      metadata: createWorkflowRunRetentionMetadata({
        pinned: record.pinned,
        updatedAt: record.updatedAt,
        note: record.note
      })
    }
  } catch (error) {
    return { status: "invalid", error: formatError(error) }
  }
}

export function serializeWorkflowRunRetentionMetadata(metadata: WorkflowRunRetentionMetadataV1): string {
  const decoded = decodeWorkflowRunRetentionMetadata(metadata)
  if (decoded.status !== "valid") throw new Error(decoded.error)
  return `${JSON.stringify(decoded.metadata, null, 2)}\n`
}

function timestamp(value: string, label: string): string {
  const safe = boundedText(value, label, 128)
  if (!Number.isFinite(Date.parse(safe))) throw new Error(`Workflow run retention ${label} must be an ISO timestamp.`)
  return new Date(safe).toISOString()
}

function boundedText(value: string, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`Workflow run retention ${label} must be a string.`)
  if ((!allowEmpty && value.length === 0) || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`Workflow run retention ${label} is empty, oversized, or contains control characters.`)
  }
  return value
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
