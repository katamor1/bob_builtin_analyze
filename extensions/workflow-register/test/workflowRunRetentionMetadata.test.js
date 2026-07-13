const assert = require("node:assert/strict")
const { test } = require("node:test")

function modules() {
  return require("../out/core/retention/runRetentionMetadata")
}

test("retention metadata round-trips bounded pin information", () => {
  const {
    CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION,
    createWorkflowRunRetentionMetadata,
    decodeWorkflowRunRetentionMetadata,
    serializeWorkflowRunRetentionMetadata
  } = modules()
  const metadata = createWorkflowRunRetentionMetadata({
    pinned: true,
    updatedAt: "2026-07-13T05:00:00.000Z",
    note: "Keep for audit"
  })
  assert.equal(metadata.schemaVersion, CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION)
  const serialized = serializeWorkflowRunRetentionMetadata(metadata)
  assert.ok(serialized.endsWith("\n"))
  assert.deepEqual(decodeWorkflowRunRetentionMetadata(serialized), { status: "valid", metadata })
})

test("retention metadata rejects malformed, future, oversized and control-character fields", () => {
  const {
    CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION,
    createWorkflowRunRetentionMetadata,
    decodeWorkflowRunRetentionMetadata
  } = modules()
  assert.equal(decodeWorkflowRunRetentionMetadata("not-json").status, "invalid")
  assert.equal(decodeWorkflowRunRetentionMetadata(JSON.stringify({
    schemaVersion: "workflow-register/run-retention/v2",
    pinned: true,
    updatedAt: "2026-07-13T05:00:00.000Z"
  })).status, "invalid")
  assert.equal(decodeWorkflowRunRetentionMetadata(JSON.stringify({
    schemaVersion: CURRENT_WORKFLOW_RUN_RETENTION_METADATA_SCHEMA_VERSION,
    pinned: true,
    updatedAt: "bad\nvalue"
  })).status, "invalid")
  assert.throws(() => createWorkflowRunRetentionMetadata({
    pinned: true,
    updatedAt: "2026-07-13T05:00:00.000Z",
    note: "x".repeat(257)
  }), /note/i)
  assert.throws(() => createWorkflowRunRetentionMetadata({
    pinned: true,
    updatedAt: "2026-07-13T05:00:00.000Z",
    note: "bad\nvalue"
  }), /note/i)
})

test("retention metadata requires exact fields and does not preserve unknown body data", () => {
  const { decodeWorkflowRunRetentionMetadata } = modules()
  const decoded = decodeWorkflowRunRetentionMetadata(JSON.stringify({
    schemaVersion: "workflow-register/run-retention/v1",
    pinned: false,
    updatedAt: "2026-07-13T05:00:00.000Z",
    taskExport: "secret body"
  }))
  assert.equal(decoded.status, "invalid")
})
